const { config, getSupabase } = require('./_shared');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const { supabase, supabaseInitError } = getSupabase();

  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    node: process.version,
    has_supabase: !!supabase,
    supabase_init_error: supabaseInitError ? (supabaseInitError.message || String(supabaseInitError)) : null,
    has_unsubscribe_secret: !!config.footer.unsubscribeSecret
  }));
};

