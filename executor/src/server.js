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
const { sleep, dedupEmails, extractMailoutId, isLikelyEmail } = require('./utils');
const { buildErrorProperties } = require('./errors');

const logger = createLogger(config.logLevel);
const notion = createNotionClient(config.notion.token);
const supabase = createSupabase(config.supabase.url, config.supabase.serviceRoleKey);
const sesClient = createSesClient(config.aws);

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

function authSharedSecret(req) {
  if (!config.executorSharedSecret) return true;
  const token = req.headers['x-auth-token'] || req.body?.auth_token;
  return token === config.executorSharedSecret;
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
  if (notion && config.notion.dbErrorsId) {
    try {
      const props = buildErrorProperties(config, payload);
      await createErrorRow(notion, config.notion.dbErrorsId, props);
    } catch (err) {
      logger.error('Failed to write error to Notion', err?.message || err);
    }
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/send-mailout', async (req, res) => {
  try {
    if (!authSharedSecret(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const signature = req.headers['x-notion-signature'];
    if (signature && config.notion.webhookVerificationToken) {
      const valid = verifyNotionSignature(req.rawBody, signature, config.notion.webhookVerificationToken);
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

    if (!notion) {
      return res.status(500).json({ error: 'notion_not_configured' });
    }
    if (!supabase) {
      return res.status(500).json({ error: 'supabase_not_configured' });
    }
    if (!sesClient) {
      return res.status(500).json({ error: 'ses_not_configured' });
    }
    if (!config.footer.orgName || !config.footer.orgAddress || !config.footer.unsubscribeBaseUrl || !config.footer.unsubscribeSecret) {
      return res.status(500).json({ error: 'footer_env_missing' });
    }
    if (!config.ses.fromEmail) {
      return res.status(500).json({ error: 'from_email_missing' });
    }

    const page = await getPage(notion, mailoutId);
    const meta = getPageMeta(page, config.notion);
    if (!meta.subject) {
      await logError({ mailout_id: mailoutId, provider: 'Notion', stage: 'fetch content', error_code: 'subject_required', error_message: 'Subject is missing' });
      return res.status(400).json({ error: 'subject_required' });
    }

    if (!meta.isTest && (meta.status === config.notion.statusSentValue || meta.sentAt)) {
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
      ? config.testEmails.map((email) => ({ email }))
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
      return res.json({ ok: true, mailout_id: mailoutId, sent: 0, failed: 0 });
    }

    const rate = Math.max(1, config.ses.rateLimitPerSec);
    const minIntervalMs = Math.ceil(1000 / rate);
    const batchSize = Math.max(1, config.ses.batchSize || 50);

    let sentCount = 0;
    let failedCount = 0;

    const csvPath = `${config.csvOutputDir}/mailout-${mailoutId}-${Date.now()}.csv`;
    const headers = ['email', 'status', 'error_message', 'message_id', 'sent_at'];

    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      for (const recipient of batch) {
        const footerToken = createUnsubToken(recipient.email, config.footer.unsubscribeSecret);
        const unsubscribeUrl = `${config.footer.unsubscribeBaseUrl}?token=${footerToken}`;
        const htmlFooter = config.footer.footerHtml
          ? config.footer.footerHtml
          : `<hr><p>${config.footer.orgName} — ${config.footer.orgAddress}</p><p><a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
        const textFooter = config.footer.footerText
          ? config.footer.footerText
          : `\n--\n${config.footer.orgName} — ${config.footer.orgAddress}\nUnsubscribe: ${unsubscribeUrl}`;

        const html = `${rendered.html}\n${htmlFooter}`;
        const text = `${rendered.text}\n${textFooter}`;

        try {
          const result = await sendEmail(sesClient, {
            to: recipient.email,
            subject: meta.subject,
            html,
            text,
            fromEmail: config.ses.fromEmail,
            fromName: recipient.from_name || config.ses.fromName || config.footer.orgName,
            replyTo: config.ses.replyTo
          });
          sentCount += 1;
          appendCsvRow(csvPath, headers, {
            email: recipient.email,
            status: 'sent',
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

    const statusValue = failedCount > 0 ? config.notion.statusFailedValue : config.notion.statusSentValue;
    const updates = buildNotionUpdateProps(page, {
      [config.notion.statusProp]: statusValue,
      [config.notion.sentAtProp]: new Date().toISOString(),
      [config.notion.sentCountProp]: sentCount,
      [config.notion.deliveredCountProp]: deliveredCount,
      [config.notion.failedCountProp]: failedCount,
      [config.notion.bounceRateProp]: bounceRate,
      [config.notion.unsubRateProp]: unsubRate
    });

    if (Object.keys(updates).length) {
      try {
        await updatePageProperties(notion, mailoutId, updates);
      } catch (err) {
        await logError({ mailout_id: mailoutId, provider: 'Notion', stage: 'report', error_code: 'notion_update_failed', error_message: err?.message || 'notion_update_failed' });
      }
    }

    return res.json({ ok: true, mailout_id: mailoutId, sent: sentCount, failed: failedCount });
  } catch (err) {
    logger.error(err);
    await logError({ provider: 'Executor', stage: 'send', error_code: 'unhandled', error_message: err?.message || 'unhandled' });
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/unsubscribe', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).send('Missing token');
    const parsed = verifyUnsubToken(token, config.footer.unsubscribeSecret);
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
    const valid = await verifySnsSignature(message);
    if (!valid) return res.status(401).json({ error: 'invalid_sns_signature' });

    if (!supabase) {
      return res.status(500).json({ error: 'supabase_not_configured' });
    }

    if (message.Type === 'SubscriptionConfirmation') {
      await confirmSubscription(message);
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
    const destination = mail.destination || [];
    const email = destination[0];

    if (!email) return res.json({ ok: true });

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

    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.listen(config.port, () => {
  logger.info(`Executor listening on port ${config.port}`);
});
