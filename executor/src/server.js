require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const crypto = require('crypto');

const { config } = require('./config');
const { createLogger } = require('./logger');
const { createNotionClient, getPage, getPageContent, getPageMeta, updatePageProperties, buildNumberProp, buildStatusProp, buildDateProp, createErrorRow } = require('./notion');
const { createSupabase, fetchActiveSubscribers, updateSubscriberStatus } = require('./supabase');
const { createSesClient, sendEmail } = require('./ses');
const { renderBlocks } = require('./render');
const { createUnsubToken, verifyUnsubToken } = require('./unsubscribe');
const { verifyNotionSignature } = require('./notion-signature');
const { verifySnsSignature, confirmSubscription } = require('./sns');
const { appendCsvRow } = require('./csv');
const { sleep, dedupEmails, extractMailoutId, isLikelyEmail, resolveRecipientName, applyTemplate } = require('./utils');
const { buildErrorProperties } = require('./errors');
const { acquireLock, releaseLock } = require('./idempotency');
const { startNotionPoller } = require('./poller');

/**
 * Creates and configures the Express app with optional dependency injection.
 * @param {Object} deps - Optional dependencies for testing
 * @param {Object} deps.notion - Notion client
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} deps.sesClient - SES client
 * @param {Object} deps.config - Configuration object
 * @param {Object} deps.logger - Logger instance
 * @returns {Express.Application} Configured Express app
 */
function createApp(deps = {}) {
  // Initialize appConfig FIRST to avoid TDZ
  const appConfig = deps.config || config;

  const logger = deps.logger || createLogger(appConfig.logLevel);
  const notion = deps.notion || createNotionClient(appConfig.notion.token);

  // Initialize external clients defensively so startup can still succeed and report
  // configuration/runtime problems via /health instead of returning a generic 503.
  let supabaseInitError = null;
  let supabase = deps.supabase || null;
  if (!supabase) {
    try {
      supabase = createSupabase(
        appConfig.supabase.url,
        appConfig.supabase.serviceRoleKey,
        appConfig.supabase.projectRef
      );
    } catch (err) {
      supabaseInitError = err;
      supabase = null;
      logger.error('Supabase init failed:', err?.message || err);
    }
  }

  let sesInitError = null;
  let sesClient = deps.sesClient || null;
  if (!sesClient) {
    try {
      sesClient = createSesClient(appConfig.aws);
    } catch (err) {
      sesInitError = err;
      sesClient = null;
      logger.error('SES init failed:', err?.message || err);
    }
  }
  const verifySnsMessageSignature = deps.verifySnsSignature || verifySnsSignature;
  const confirmSnsSubscription = deps.confirmSubscription || confirmSubscription;

  const app = express();
  app.use(express.json({
    // AWS SNS commonly posts JSON payloads as text/plain.
    type: ['application/json', 'text/plain'],
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  function authSharedSecret(req) {
    if (!appConfig.executorSharedSecret) return true;
    const token = req.headers['x-auth-token'] || req.body?.auth_token;
    return token === appConfig.executorSharedSecret;
  }

  function buildNotionUpdateProps(page, updates) {
    const props = page.properties || {};
    const result = {};
    for (const [propName, value] of Object.entries(updates)) {
      const prop = props[propName];
      if (!prop) continue;
      const type = prop.type;
      if (type === 'status') {
        result[propName] = { status: { name: value } };
      } else if (type === 'select') {
        result[propName] = { select: { name: value } };
      } else if (type === 'checkbox') {
        result[propName] = { checkbox: !!value };
      } else if (type === 'number') {
        result[propName] = { number: value };
      } else if (type === 'date') {
        result[propName] = { date: value ? { start: value } : null };
      } else if (type === 'rich_text') {
        result[propName] = { rich_text: [{ text: { content: String(value) } }] };
      } else {
        // Fallback to rich_text
        result[propName] = { rich_text: [{ text: { content: String(value) } }] };
      }
    }
    return result;
  }

  async function logError(error) {
    const payload = {
      timestamp: new Date().toISOString(),
      ...error
    };
    if (notion && appConfig.notion.dbErrorsId) {
      try {
        const props = buildErrorProperties(appConfig, payload);
        await createErrorRow(notion, appConfig.notion.dbErrorsId, props);
      } catch (err) {
        logger.error('Failed to write error to Notion', err?.message || err);
      }
    }
  }

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    node: process.version,
    port: appConfig.port,
    dry_run: appConfig.runtime?.dryRunSend || false,
    has_notion: !!notion,
    has_supabase: !!supabase,
    has_ses: !!sesClient,
    supabase_init_error: supabaseInitError ? (supabaseInitError.message || String(supabaseInitError)) : null,
    ses_init_error: sesInitError ? (sesInitError.message || String(sesInitError)) : null
  });
});

app.post('/send-mailout', async (req, res) => {
  if (!authSharedSecret(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const signature = req.headers['x-notion-signature'];
  if (signature && appConfig.notion.webhookVerificationToken) {
    const valid = verifyNotionSignature(req.rawBody, signature, appConfig.notion.webhookVerificationToken);
    if (!valid) {
      return res.status(401).json({ error: 'invalid_notion_signature' });
    }
  }

  if (req.body?.verification_token) {
    return res.json({ verification_token: req.body.verification_token });
  }

  const mailoutId = extractMailoutId(req.body);
  if (!mailoutId) {
    return res.status(400).json({ error: 'mailout_id_missing' });
  }

  let lockAcquired = false;

  try {
    const isDryRun = appConfig.runtime?.dryRunSend || false;

    if (!notion) {
      return res.status(500).json({ error: 'notion_not_configured' });
    }
    if (!supabase) {
      return res.status(500).json({ error: 'supabase_not_configured' });
    }
    if (!sesClient && !isDryRun) {
      return res.status(500).json({ error: 'ses_not_configured' });
    }
    if (!appConfig.footer.orgName || !appConfig.footer.orgAddress || !appConfig.footer.unsubscribeBaseUrl || !appConfig.footer.unsubscribeSecret) {
      return res.status(500).json({ error: 'footer_env_missing' });
    }
    if (!appConfig.ses.fromEmail && !isDryRun) {
      return res.status(500).json({ error: 'from_email_missing' });
    }

    const page = await getPage(notion, mailoutId);
    const meta = getPageMeta(page, appConfig.notion);
    if (!meta.subject) {
      await logError({ mailout_id: mailoutId, provider: 'Notion', stage: 'fetch content', error_code: 'subject_required', error_message: 'Subject is missing' });
      return res.status(400).json({ error: 'subject_required' });
    }

    // Acquire idempotency lock for non-test mailouts only
    // This prevents duplicate execution under concurrent trigger calls
    // Test mode is exempt to allow repeated sends to TEST_EMAILS
    if (!meta.isTest) {
      lockAcquired = acquireLock(mailoutId);
      if (!lockAcquired) {
        return res.status(409).json({ error: 'send_in_progress' });
      }
    }

    if (!meta.isTest && (meta.status === appConfig.notion.statusSentValue || meta.sentAt)) {
      return res.status(409).json({ error: 'mailout_already_sent' });
    }

    const blocks = await getPageContent(notion, mailoutId);
    const rendered = renderBlocks(blocks);

    if (!rendered.html && !rendered.text) {
      await logError({ mailout_id: mailoutId, provider: 'Notion', stage: 'build message', error_code: 'empty_body', error_message: 'Email body is empty' });
      return res.status(400).json({ error: 'empty_body' });
    }

    for (const err of rendered.errors) {
      await logError({ mailout_id: mailoutId, provider: 'Notion', stage: 'build message', error_code: err.type, error_message: `Unsupported block: ${err.blockType}` });
    }

    const recipients = meta.isTest
      ? appConfig.testEmails.map((email) => ({ email }))
      : await fetchActiveSubscribers(supabase);

    const deduped = dedupEmails(recipients)
      .filter((r) => isLikelyEmail(r.email))
      .sort((a, b) => a.email.localeCompare(b.email));

    if (meta.isTest && deduped.length === 0) {
      await logError({ mailout_id: mailoutId, provider: 'Executor', stage: 'send', error_code: 'test_emails_empty', error_message: 'TEST_EMAILS is empty' });
      return res.status(400).json({ error: 'test_emails_empty' });
    }
    if (!meta.isTest && deduped.length === 0) {
      await logError({ mailout_id: mailoutId, provider: 'Supabase', stage: 'send', error_code: 'no_active_subscribers', error_message: 'No active subscribers' });
      return res.json({ ok: true, mailout_id: mailoutId, sent: 0, failed: 0, dry_run: isDryRun });
    }

    const rate = Math.max(1, appConfig.ses.rateLimitPerSec);
    const minIntervalMs = Math.ceil(1000 / rate);
    const batchSize = Math.max(1, appConfig.ses.batchSize || 50);

    let sentCount = 0;
    let failedCount = 0;

    const csvPath = `${appConfig.csvOutputDir}/mailout-${mailoutId}-${Date.now()}.csv`;
    const headers = ['email', 'status', 'error_message', 'message_id', 'sent_at'];

    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      for (const recipient of batch) {
        const footerToken = createUnsubToken(recipient.email, appConfig.footer.unsubscribeSecret);
        const unsubscribeUrl = `${appConfig.footer.unsubscribeBaseUrl}?token=${footerToken}`;
        // Always append compliance footer so unsubscribe/address cannot be omitted by custom templates.
        const complianceHtmlFooter = `<hr><p>${appConfig.footer.orgName} — ${appConfig.footer.orgAddress}</p><p><a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
        const complianceTextFooter = `\n--\n${appConfig.footer.orgName} — ${appConfig.footer.orgAddress}\nUnsubscribe: ${unsubscribeUrl}`;
        const customHtmlFooter = appConfig.footer.footerHtml ? `${appConfig.footer.footerHtml}\n` : '';
        const customTextFooter = appConfig.footer.footerText ? `${appConfig.footer.footerText}\n` : '';
        const htmlFooter = `${customHtmlFooter}${complianceHtmlFooter}`;
        const textFooter = `${customTextFooter}${complianceTextFooter}`;

        const templateVars = {
          name: resolveRecipientName(recipient),
          email: recipient.email,
          from_name: recipient.from_name || ''
        };
        const subject = applyTemplate(meta.subject, templateVars);
        const html = applyTemplate(`${rendered.html}\n${htmlFooter}`, templateVars);
        const text = applyTemplate(`${rendered.text}\n${textFooter}`, templateVars);

        try {
          let result;
          if (isDryRun) {
            // Dry-run mode: skip SES call, simulate success
            result = { MessageId: `dry-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
          } else {
            // Real send
            result = await sendEmail(sesClient, {
              to: recipient.email,
              subject,
              html,
              text,
              fromEmail: appConfig.ses.fromEmail,
              fromName: recipient.from_name || appConfig.ses.fromName || appConfig.footer.orgName,
              replyTo: appConfig.ses.replyTo
            });
          }
          sentCount += 1;
          appendCsvRow(csvPath, headers, {
            email: recipient.email,
            status: isDryRun ? 'simulated' : 'sent',
            error_message: '',
            message_id: result.MessageId,
            sent_at: new Date().toISOString()
          });
        } catch (err) {
          failedCount += 1;
          appendCsvRow(csvPath, headers, {
            email: recipient.email,
            status: 'failed',
            error_message: err?.message || 'send_failed',
            message_id: '',
            sent_at: new Date().toISOString()
          });
          await logError({
            mailout_id: mailoutId,
            provider: 'SES',
            stage: 'send',
            email: recipient.email,
            error_code: 'send_failed',
            error_message: err?.message || 'send_failed'
          });
        }

        await sleep(minIntervalMs);
      }
    }

    const deliveredCount = sentCount; // accepted by SES
    const bounceRate = sentCount ? 0 : 0;
    const unsubRate = sentCount ? 0 : 0;

    const statusValue = failedCount > 0 ? appConfig.notion.statusFailedValue : appConfig.notion.statusSentValue;
    const updates = buildNotionUpdateProps(page, {
      [appConfig.notion.statusProp]: statusValue,
      [appConfig.notion.sentAtProp]: new Date().toISOString(),
      [appConfig.notion.sentCountProp]: sentCount,
      [appConfig.notion.deliveredCountProp]: deliveredCount,
      [appConfig.notion.failedCountProp]: failedCount,
      [appConfig.notion.bounceRateProp]: bounceRate,
      [appConfig.notion.unsubRateProp]: unsubRate
    });

    if (Object.keys(updates).length) {
      try {
        await updatePageProperties(notion, mailoutId, updates);
      } catch (err) {
        await logError({ mailout_id: mailoutId, provider: 'Notion', stage: 'report', error_code: 'notion_update_failed', error_message: err?.message || 'notion_update_failed' });
      }
    }

      return res.json({ ok: true, mailout_id: mailoutId, sent: sentCount, failed: failedCount, dry_run: isDryRun });
  } catch (err) {
    logger.error(err);
    await logError({ provider: 'Executor', stage: 'send', error_code: 'unhandled', error_message: err?.message || 'unhandled' });
    return res.status(500).json({ error: 'internal_error' });
  } finally {
    // Release the idempotency lock if it was acquired
    if (lockAcquired) {
      releaseLock(mailoutId);
    }
  }
});

app.get('/unsubscribe', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).send('Missing token');
    const parsed = verifyUnsubToken(token, appConfig.footer.unsubscribeSecret);
    if (!parsed) return res.status(400).send('Invalid token');

    if (!supabase) {
      return res.status(500).send('Supabase not configured');
    }

    await updateSubscriberStatus(supabase, parsed.email, {
      status: 'unsubscribed',
      status_updated_at: new Date().toISOString()
    });

    res.set('Content-Type', 'text/html');
    res.send('<html><body><h3>You are unsubscribed.</h3></body></html>');
  } catch (err) {
    logger.error(err);
    res.status(500).send('Internal error');
  }
});

app.post('/ses-events', async (req, res) => {
  try {
    const message = req.body;
    const valid = await verifySnsMessageSignature(message);
    if (!valid) return res.status(401).json({ error: 'invalid_sns_signature' });

    if (!supabase) {
      return res.status(500).json({ error: 'supabase_not_configured' });
    }

    const allowedTopics = appConfig.sns?.allowedTopicArns || [];
    if (allowedTopics.length && message.TopicArn && !allowedTopics.includes(message.TopicArn)) {
      return res.status(403).json({ error: 'sns_topic_not_allowed' });
    }

    if (message.Type === 'SubscriptionConfirmation') {
      // Do not auto-confirm unless an allowlist is configured (prevents hostile SNS topics subscribing).
      if (!allowedTopics.length) {
        return res.status(400).json({ error: 'sns_allowlist_required' });
      }
      await confirmSnsSubscription(message);
      return res.json({ ok: true, confirmed: true });
    }

    if (message.Type !== 'Notification') {
      return res.json({ ok: true });
    }

    let payload = null;
    try {
      payload = JSON.parse(message.Message);
    } catch (err) {
      return res.status(400).json({ error: 'invalid_sns_message' });
    }
    const eventType = payload.notificationType || payload.eventType || payload.event_type;
    const mail = payload.mail || {};
    const destination = Array.isArray(mail.destination) ? mail.destination : [];

    function extractRecipients() {
      const set = new Set();
      if (eventType === 'Bounce') {
        const bounced = payload.bounce?.bouncedRecipients;
        if (Array.isArray(bounced)) {
          for (const r of bounced) {
            if (r?.emailAddress) set.add(String(r.emailAddress).toLowerCase());
          }
        }
      } else if (eventType === 'Complaint') {
        const complained = payload.complaint?.complainedRecipients;
        if (Array.isArray(complained)) {
          for (const r of complained) {
            if (r?.emailAddress) set.add(String(r.emailAddress).toLowerCase());
          }
        }
      }
      if (set.size === 0) {
        for (const e of destination) {
          if (e) set.add(String(e).toLowerCase());
        }
      }
      return Array.from(set);
    }

    const emails = extractRecipients();
    if (emails.length === 0) return res.json({ ok: true });

    for (const email of emails) {
      if (eventType === 'Bounce') {
        const bounce = payload.bounce || {};
        await updateSubscriberStatus(supabase, email, {
          status: 'bounced',
          bounce_type: bounce.bounceType,
          bounce_subtype: bounce.bounceSubType,
          status_updated_at: new Date().toISOString()
        });
      } else if (eventType === 'Complaint') {
        await updateSubscriberStatus(supabase, email, {
          status: 'unsubscribed',
          status_updated_at: new Date().toISOString()
        });
      } else if (eventType === 'Delivery') {
        // No status change; can be used for metrics.
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

  return app;
}

// Export for testing
module.exports = { createApp };

// Start server only when run directly
if (require.main === module) {
  const app = createApp();
  const logger = createLogger(config.logLevel);
  const server = app.listen(config.port, () => {
    logger.info(`Executor listening on port ${config.port}`);
  });
  server.on('error', (err) => {
    // Common local UX issue: port already in use (another executor instance still running).
    logger.error('Server failed to start:', err?.message || err);
    process.exit(1);
  });

  // Optional Notion polling to enable a "button-like" UX:
  // user sets Status="Send" in Notion and the local executor picks it up.
  const notion = createNotionClient(config.notion.token);
  const poller = startNotionPoller({ notion, cfg: config, logger });

  function shutdown(signal) {
    logger.info(`${signal} received, shutting down...`);
    try { poller.stop(); } catch {}
    server.close(() => process.exit(0));
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
