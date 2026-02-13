const { getSupabase, config } = require('./_shared');
const { verifyUnsubToken } = require('../src/unsubscribe');
const { updateSubscriberStatus } = require('../src/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const token = req.query?.token;
  if (!token) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Missing token');
  }

  if (!config.footer.unsubscribeSecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('UNSUBSCRIBE_SECRET is not configured');
  }

  const parsed = verifyUnsubToken(token, config.footer.unsubscribeSecret);
  if (!parsed) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Invalid token');
  }

  const { supabase, supabaseInitError } = getSupabase();
  if (!supabase) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const msg = supabaseInitError ? (supabaseInitError.message || String(supabaseInitError)) : 'Supabase not configured';
    return res.end(msg);
  }

  try {
    await updateSubscriberStatus(supabase, parsed.email, {
      status: 'unsubscribed',
      status_updated_at: new Date().toISOString()
    });
  } catch (_err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Failed to update subscriber');
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<html><body><h3>You are unsubscribed.</h3></body></html>');
};

