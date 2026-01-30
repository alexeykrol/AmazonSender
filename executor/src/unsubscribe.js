const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createUnsubToken(email, secret) {
  const payload = base64url(email.toLowerCase());
  const sig = hmac(payload, secret);
  return `${payload}.${sig}`;
}

function verifyUnsubToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = hmac(payload, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const email = Buffer.from(payload, 'base64url').toString('utf-8');
  if (!email) return null;
  return { email };
}

module.exports = { createUnsubToken, verifyUnsubToken };
