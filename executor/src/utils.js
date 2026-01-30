function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEmail(email) {
  return email ? String(email).trim().toLowerCase() : '';
}

function dedupEmails(records) {
  const seen = new Set();
  const deduped = [];
  for (const rec of records) {
    const email = normalizeEmail(rec.email || rec);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    deduped.push({ ...rec, email });
  }
  return deduped;
}

function isLikelyEmail(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

function extractMailoutId(payload) {
  if (!payload) return null;
  if (payload.mailout_id) return payload.mailout_id;
  if (payload.page_id) return payload.page_id;
  if (payload.data && payload.data.id) return payload.data.id;
  if (payload.data && payload.data.page_id) return payload.data.page_id;
  if (payload.data && payload.data.entity && payload.data.entity.id) return payload.data.entity.id;

  const stack = [payload];
  while (stack.length) {
    const obj = stack.pop();
    if (!obj || typeof obj !== 'object') continue;
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'page_id' && typeof value === 'string') return value;
      if (key === 'id' && typeof value === 'string' && value.length >= 16) {
        return value;
      }
      if (typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

module.exports = { sleep, normalizeEmail, dedupEmails, extractMailoutId, isLikelyEmail };
