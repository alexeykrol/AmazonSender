const crypto = require('crypto');

function isTrustedAwsHostname(hostname) {
  if (!hostname) return false;
  // We only trust AWS SNS endpoints for signature certificates and subscription confirmation.
  // Without this check, an attacker could supply their own certificate URL and forge "valid" signatures.
  return hostname === 'sns.amazonaws.com'
    || (hostname.startsWith('sns.') && hostname.endsWith('.amazonaws.com'));
}

function isTrustedSnsCertUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!isTrustedAwsHostname(parsed.hostname)) return false;
    if (!parsed.pathname.endsWith('.pem')) return false;
    if (!parsed.pathname.includes('SimpleNotificationService')) return false;
    return true;
  } catch {
    return false;
  }
}

function isTrustedSnsSubscribeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!isTrustedAwsHostname(parsed.hostname)) return false;
    const action = parsed.searchParams.get('Action');
    if (action && action !== 'ConfirmSubscription') return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchCert(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch SNS cert: ${res.status}`);
  }
  return res.text();
}

function buildStringToSign(msg) {
  const type = msg.Type;
  const fields = [];

  if (type === 'Notification') {
    fields.push('Message', msg.Message);
    fields.push('MessageId', msg.MessageId);
    if (msg.Subject) fields.push('Subject', msg.Subject);
    fields.push('Timestamp', msg.Timestamp);
    fields.push('TopicArn', msg.TopicArn);
    fields.push('Type', msg.Type);
  } else if (type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation') {
    fields.push('Message', msg.Message);
    fields.push('MessageId', msg.MessageId);
    fields.push('SubscribeURL', msg.SubscribeURL);
    fields.push('Timestamp', msg.Timestamp);
    fields.push('Token', msg.Token);
    fields.push('TopicArn', msg.TopicArn);
    fields.push('Type', msg.Type);
  } else {
    return null;
  }

  let stringToSign = '';
  for (let i = 0; i < fields.length; i += 2) {
    stringToSign += `${fields[i]}\n${fields[i + 1]}\n`;
  }
  return stringToSign;
}

async function verifySnsSignature(message) {
  if (!message || !message.SigningCertURL || !message.Signature) return false;
  if (!isTrustedSnsCertUrl(message.SigningCertURL)) return false;

  const stringToSign = buildStringToSign(message);
  if (!stringToSign) return false;

  try {
    const certPem = await fetchCert(message.SigningCertURL);
    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(stringToSign, 'utf-8');
    verifier.end();
    return verifier.verify(certPem, message.Signature, 'base64');
  } catch {
    return false;
  }
}

async function confirmSubscription(message) {
  if (!message || !message.SubscribeURL) return false;
  if (!isTrustedSnsSubscribeUrl(message.SubscribeURL)) return false;
  try {
    const res = await fetch(message.SubscribeURL);
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  verifySnsSignature,
  confirmSubscription,
  // Exported for tests/debugging.
  isTrustedSnsCertUrl,
  isTrustedSnsSubscribeUrl
};
