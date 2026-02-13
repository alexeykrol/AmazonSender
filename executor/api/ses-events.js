const { getSupabase, readJsonBody } = require('./_shared');
const { config } = require('./_shared');
const { verifySnsSignature, confirmSubscription } = require('../src/sns');
const { updateSubscriberStatus } = require('../src/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  let message;
  try {
    message = await readJsonBody(req);
  } catch (_err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'invalid_json' }));
  }

  const valid = await verifySnsSignature(message);
  if (!valid) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'invalid_sns_signature' }));
  }

  const { supabase, supabaseInitError } = getSupabase();
  if (!supabase) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'supabase_not_configured',
      details: supabaseInitError ? (supabaseInitError.message || String(supabaseInitError)) : null
    }));
  }

  const allowedTopics = config.sns?.allowedTopicArns || [];
  if (allowedTopics.length && message.TopicArn && !allowedTopics.includes(message.TopicArn)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'sns_topic_not_allowed' }));
  }

  if (message.Type === 'SubscriptionConfirmation') {
    if (!allowedTopics.length) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'sns_allowlist_required' }));
    }
    await confirmSubscription(message);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, confirmed: true }));
  }

  if (message.Type !== 'Notification') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  let payload;
  try {
    payload = JSON.parse(message.Message);
  } catch (_err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'invalid_sns_message' }));
  }

  const eventType = payload.notificationType || payload.eventType || payload.event_type;
  const mail = payload.mail || {};
  const destination = mail.destination || [];
  const email = destination[0];

  if (email) {
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
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
};
