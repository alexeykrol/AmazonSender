const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

function createSesClient(config) {
  if (!config) return null;
  if (!config.region || !config.accessKeyId || !config.secretAccessKey) return null;
  return new SESClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

function formatSource(fromEmail, fromName) {
  if (fromName) return `"${fromName}" <${fromEmail}>`;
  return fromEmail;
}

async function sendEmail(client, params) {
  const {
    to,
    subject,
    html,
    text,
    fromEmail,
    fromName,
    replyTo
  } = params;

  const input = {
    Source: formatSource(fromEmail, fromName),
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' }
      }
    }
  };

  if (replyTo) {
    input.ReplyToAddresses = [replyTo];
  }

  const command = new SendEmailCommand(input);
  return client.send(command);
}

module.exports = { createSesClient, sendEmail };
