const crypto = require('crypto');

function verifyNotionSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || !rawBody) return false;
  const sig = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(sig);
  const hmacBuf = Buffer.from(hmac);
  if (sigBuf.length !== hmacBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, hmacBuf);
}

module.exports = { verifyNotionSignature };
