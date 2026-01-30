const crypto = require('crypto');

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

  const stringToSign = buildStringToSign(message);
  if (!stringToSign) return false;

  const certPem = await fetchCert(message.SigningCertURL);
  const verifier = crypto.createVerify('RSA-SHA1');
  verifier.update(stringToSign, 'utf-8');
  verifier.end();
  return verifier.verify(certPem, message.Signature, 'base64');
}

async function confirmSubscription(message) {
  if (!message || !message.SubscribeURL) return false;
  const res = await fetch(message.SubscribeURL);
  return res.ok;
}

module.exports = { verifySnsSignature, confirmSubscription };
