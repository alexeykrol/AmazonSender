const { buildErrorProperties } = require('./errors');
const { createErrorRow, updatePageProperties, buildStatusProp, getPageMeta } = require('./notion');
const { notifyMacOS } = require('./notify');

function parseBool(raw) {
  return /^(1|true|yes|on)$/i.test(String(raw || '').trim());
}

function buildOrStatusFilter({ statusProp, statuses }) {
  const unique = Array.from(new Set((statuses || []).filter(Boolean)));
  if (unique.length <= 1) {
    return {
      property: statusProp,
      status: { equals: unique[0] }
    };
  }
  return {
    or: unique.map((s) => ({
      property: statusProp,
      status: { equals: s }
    }))
  };
}

async function postLocalSendMailout({ port, sharedSecret, mailoutId }) {
  const res = await fetch(`http://127.0.0.1:${port}/send-mailout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sharedSecret ? { 'X-Auth-Token': sharedSecret } : {})
    },
    body: JSON.stringify({
      mailout_id: mailoutId,
      ...(sharedSecret ? { auth_token: sharedSecret } : {})
    })
  });

  // Best-effort: consume body for debugging without leaking secrets.
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  return { ok: res.ok, status: res.status, body: text };
}

async function logPollerError({ notion, cfg, logger, payload }) {
  if (!notion || !cfg?.notion?.dbErrorsId) {
    logger?.error?.('[poller] error:', payload?.error_code, payload?.error_message);
    return;
  }

  try {
    const props = buildErrorProperties(cfg, payload);
    await createErrorRow(notion, cfg.notion.dbErrorsId, props);
  } catch (err) {
    logger?.error?.('[poller] failed to write error to Notion:', err?.message || err);
  }
}

async function setMailoutStatus({ notion, cfg, mailoutId, status }) {
  if (!notion) return;
  if (!cfg?.notion?.statusProp || !status) return;
  try {
    await updatePageProperties(notion, mailoutId, {
      [cfg.notion.statusProp]: buildStatusProp(status)
    });
  } catch {
    // Non-fatal: status update is best-effort.
  }
}

async function resetMailoutAnalytics({ notion, cfg, mailoutId }) {
  if (!notion) return;

  // First, fetch the page to check which properties actually exist.
  let existingProps = {};
  try {
    const page = await notion.pages.retrieve({ page_id: mailoutId });
    existingProps = page.properties || {};
  } catch {
    // Fallback: attempt update anyway (old behavior).
  }

  const updates = {};

  // Force Test=true when resetting (safety for duplicated mailouts).
  if (cfg?.notion?.testProp && existingProps[cfg.notion.testProp]) {
    updates[cfg.notion.testProp] = { checkbox: true };
  }

  // Clear analytics fields only if they exist in the schema.
  if (cfg?.notion?.sentAtProp && existingProps[cfg.notion.sentAtProp]) {
    updates[cfg.notion.sentAtProp] = { date: null };
  }
  if (cfg?.notion?.sentCountProp && existingProps[cfg.notion.sentCountProp]) {
    updates[cfg.notion.sentCountProp] = { number: null };
  }
  if (cfg?.notion?.deliveredCountProp && existingProps[cfg.notion.deliveredCountProp]) {
    updates[cfg.notion.deliveredCountProp] = { number: null };
  }
  if (cfg?.notion?.failedCountProp && existingProps[cfg.notion.failedCountProp]) {
    updates[cfg.notion.failedCountProp] = { number: null };
  }
  if (cfg?.notion?.bounceRateProp && existingProps[cfg.notion.bounceRateProp]) {
    updates[cfg.notion.bounceRateProp] = { number: null };
  }
  if (cfg?.notion?.unsubRateProp && existingProps[cfg.notion.unsubRateProp]) {
    updates[cfg.notion.unsubRateProp] = { number: null };
  }

  // Always bring it back to "Not started".
  if (cfg?.notion?.statusProp && cfg?.notion?.notStartedStatusValue) {
    updates[cfg.notion.statusProp] = buildStatusProp(cfg.notion.notStartedStatusValue);
  }

  try {
    await updatePageProperties(notion, mailoutId, updates);
  } catch {
    // Best-effort.
  }
}

function startNotionPoller({ notion, cfg, logger }) {
  const intervalMs = Number(cfg?.notion?.pollIntervalMs || 0);
  if (!intervalMs || intervalMs < 1000) {
    return { stop: () => {} };
  }

  const dbId = cfg?.notion?.dbMailoutsId;
  const statusProp = cfg?.notion?.statusProp;
  const triggerStatus = cfg?.notion?.triggerStatusValue || 'Send';
  const triggerRealStatus = cfg?.notion?.triggerStatusRealValue || 'Send real';
  const triggerResetStatus = cfg?.notion?.triggerStatusResetValue || 'Reset';
  const inProgressStatus = cfg?.notion?.inProgressStatusValue || 'In progress';
  const notStartedStatus = cfg?.notion?.notStartedStatusValue || 'Not started';

  if (!notion || !dbId || !statusProp) {
    logger?.warn?.('[poller] Notion polling disabled: missing NOTION_API_TOKEN or NOTION_DB_MAILOUTS_ID/NOTION_STATUS_PROP');
    return { stop: () => {} };
  }

  // Legacy escape hatch. Not required anymore (preferred UX is Status="Send real").
  const allowNonTestSend = parseBool(process.env.ALLOW_NON_TEST_SEND);
  const inFlight = new Set();

  async function pollOnce() {
    try {
      const triggerStatuses = [triggerStatus, triggerRealStatus, triggerResetStatus].filter(Boolean);
      const resp = await notion.databases.query({
        database_id: dbId,
        filter: buildOrStatusFilter({ statusProp, statuses: triggerStatuses }),
        sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
        page_size: 10
      });

      const pages = resp?.results || [];
      if (!pages.length) return;

      logger?.info?.(`[poller] Found ${pages.length} mailout(s) with Status in [${triggerStatuses.map((s) => `"${s}"`).join(', ')}]`);

      for (const page of pages) {
        const mailoutId = page.id;
        if (!mailoutId) continue;
        if (inFlight.has(mailoutId)) continue;

        inFlight.add(mailoutId);

        try {
          const meta = getPageMeta(page, cfg.notion);

          // "Reset" action: clear analytics and return to Not started.
          if (meta.status === triggerResetStatus) {
            await resetMailoutAnalytics({ notion, cfg, mailoutId });
            notifyMacOS({ title: 'AmazonSender', message: `Reset: ${mailoutId}` });
            continue;
          }

          // Move out of trigger state immediately to prevent duplicate processing on the next tick.
          await setMailoutStatus({ notion, cfg, mailoutId, status: inProgressStatus });

          if (!meta.isTest && !allowNonTestSend) {
            // Safer UX: require an explicit "Send real" status for non-test mailouts.
            if (meta.status !== triggerRealStatus) {
              await logPollerError({
                notion,
                cfg,
                logger,
                payload: {
                  timestamp: new Date().toISOString(),
                  mailout_id: mailoutId,
                  is_test: false,
                  provider: 'Executor',
                  stage: 'poll',
                  error_code: 'non_test_send_requires_real_trigger',
                  error_message: `Refusing to auto-send non-test mailout unless Status="${triggerRealStatus}"`
                }
              });
              // Revert to not-started so the user can consciously re-trigger.
              await setMailoutStatus({ notion, cfg, mailoutId, status: notStartedStatus });
              notifyMacOS({ title: 'AmazonSender', message: `Blocked non-test send: set Status="${triggerRealStatus}"` });
              continue;
            }
          }

          const result = await postLocalSendMailout({
            port: cfg.port,
            sharedSecret: cfg.executorSharedSecret,
            mailoutId
          });

          if (!result.ok) {
            await logPollerError({
              notion,
              cfg,
              logger,
              payload: {
                timestamp: new Date().toISOString(),
                mailout_id: mailoutId,
                is_test: !!meta.isTest,
                provider: 'Executor',
                stage: 'poll',
                error_code: 'local_send_failed',
                error_message: `Local /send-mailout failed: ${result.status}`
              }
            });
            // Revert so it can be retried.
            await setMailoutStatus({ notion, cfg, mailoutId, status: notStartedStatus });
            notifyMacOS({ title: 'AmazonSender', message: `Send failed: ${mailoutId} (${result.status})` });
          } else {
            let sent = null;
            let failed = null;
            let dryRun = null;
            try {
              const parsed = JSON.parse(result.body || '{}');
              sent = Number.isFinite(parsed.sent) ? parsed.sent : null;
              failed = Number.isFinite(parsed.failed) ? parsed.failed : null;
              dryRun = typeof parsed.dry_run === 'boolean' ? parsed.dry_run : null;
            } catch {}

            const suffix = (sent === null && failed === null)
              ? ''
              : ` sent=${sent ?? '?'} failed=${failed ?? '?'}${dryRun ? ' (dry-run)' : ''}`;
            notifyMacOS({ title: 'AmazonSender', message: `Done: ${mailoutId}${suffix}` });
          }
        } finally {
          inFlight.delete(mailoutId);
        }
      }
    } catch (err) {
      await logPollerError({
        notion,
        cfg,
        logger,
        payload: {
          timestamp: new Date().toISOString(),
          provider: 'Notion',
          stage: 'poll',
          error_code: 'notion_poll_failed',
          error_message: err?.message || 'notion_poll_failed'
        }
      });
    }
  }

  logger?.info?.(`[poller] Notion polling enabled (interval=${intervalMs}ms, trigger Status="${triggerStatus}")`);

  // Kick immediately, then interval.
  pollOnce();
  const timer = setInterval(pollOnce, intervalMs);

  return {
    stop: () => clearInterval(timer)
  };
}

module.exports = { startNotionPoller };
