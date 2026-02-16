// Test helper to expose internal resetMailoutAnalytics function.
// This is a workaround since the function is not exported from poller.js.

const { buildStatusProp, updatePageProperties } = require('../src/notion');

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

module.exports = { resetMailoutAnalytics };
