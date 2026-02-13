function extractProjectRefFromSupabaseUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  return match ? match[1] : null;
}

function assertSupabaseProjectScope({ url, expectedRef, context }) {
  if (!url) return;

  const actualRef = extractProjectRefFromSupabaseUrl(url);
  if (!actualRef) {
    throw new Error(`Invalid SUPABASE_URL format${context ? ` (${context})` : ''}`);
  }

  if (!expectedRef) return;
  if (actualRef !== expectedRef) {
    throw new Error(
      `Supabase project mismatch${context ? ` (${context})` : ''}: expected ${expectedRef}, got ${actualRef}`
    );
  }
}

function parseBoolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

module.exports = {
  extractProjectRefFromSupabaseUrl,
  assertSupabaseProjectScope,
  parseBoolEnv
};
