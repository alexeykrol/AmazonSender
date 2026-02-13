const { buildErrorProperties } = require('./errors');
const { createErrorRow, updatePageProperties, buildStatusProp, getPageMeta } = require('./notion');

function parseBool(raw) {
  return /^(1|true|yes|on)$/i.test(String(raw || '').trim());
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

function startNotionPoller({ notion, cfg, logger }) {
  const intervalMs = Number(cfg?.notion?.pollIntervalMs || 0);
  if (!intervalMs || intervalMs < 1000) {
    return { stop: () => {} };
  }

  const dbId = cfg?.notion?.dbMailoutsId;
  const statusProp = cfg?.notion?.statusProp;
  const triggerStatus = cfg?.notion?.triggerStatusValue || 'Send';
  const inProgressStatus = cfg?.notion?.inProgressStatusValue || 'In progress';
  const notStartedStatus = cfg?.notion?.notStartedStatusValue || 'Not started';

  if (!notion || !dbId || !statusProp) {
    logger?.warn?.('[poller] Notion polling disabled: missing NOTION_API_TOKEN or NOTION_DB_MAILOUTS_ID/NOTION_STATUS_PROP');
    return { stop: () => {} };
  }

  const allowNonTestSend = parseBool(process.env.ALLOW_NON_TEST_SEND);
  const inFlight = new Set();

  async function pollOnce() {
    try {
      const resp = await notion.databases.query({
        database_id: dbId,
        filter: {
          property: statusProp,
          status: { equals: triggerStatus }
        },
        sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
        page_size: 10
      });

      const pages = resp?.results || [];
      if (!pages.length) return;

      logger?.info?.(`[poller] Found ${pages.length} mailout(s) with Status="${triggerStatus}"`);

      for (const page of pages) {
        const mailoutId = page.id;
        if (!mailoutId) continue;
        if (inFlight.has(mailoutId)) continue;

        inFlight.add(mailoutId);

        // Move out of trigger state immediately to prevent duplicate processing on the next tick.
        await setMailoutStatus({ notion, cfg, mailoutId, status: inProgressStatus });

        try {
          const meta = getPageMeta(page, cfg.notion);

          if (!meta.isTest && !allowNonTestSend) {
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
                error_code: 'non_test_send_blocked',
                error_message: 'Refusing to auto-send non-test mailout without ALLOW_NON_TEST_SEND=true'
              }
            });
            // Revert to not-started so the user can consciously re-trigger.
            await setMailoutStatus({ notion, cfg, mailoutId, status: notStartedStatus });
            continue;
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

