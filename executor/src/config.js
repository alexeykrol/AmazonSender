const path = require('path');

const env = process.env;

function getEnv(name, fallback = undefined) {
  const value = env[name];
  if (value === undefined || value === '') {
    return fallback;
  }
  return value;
}

function requireEnv(name) {
  const value = getEnv(name);
  if (value === undefined) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseIntEnv(name, fallback) {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name, fallback) {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTestEmails(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;\n\r\t ]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.toLowerCase());
}

const config = {
  port: parseIntEnv('PORT', 3000),
  appBaseUrl: getEnv('APP_BASE_URL', 'http://localhost:3000'),
  logLevel: getEnv('LOG_LEVEL', 'info'),

  notion: {
    token: getEnv('NOTION_API_TOKEN'),
    dbMailoutsId: getEnv('NOTION_DB_MAILOUTS_ID'),
    dbErrorsId: getEnv('NOTION_DB_ERRORS_ID'),
    webhookVerificationToken: getEnv('NOTION_WEBHOOK_VERIFICATION_TOKEN'),
    subjectProp: getEnv('NOTION_SUBJECT_PROP', 'Subject'),
    statusProp: getEnv('NOTION_STATUS_PROP', 'Status'),
    statusSentValue: getEnv('NOTION_STATUS_SENT_VALUE', 'Send'),
    statusFailedValue: getEnv('NOTION_STATUS_FAILED_VALUE', 'Failed'),
    testProp: getEnv('NOTION_TEST_PROP', 'Test'),
    sentAtProp: getEnv('NOTION_SENT_AT_PROP', 'Sent At'),
    sentCountProp: getEnv('NOTION_SENT_COUNT_PROP', 'Sent Count'),
    deliveredCountProp: getEnv('NOTION_DELIVERED_COUNT_PROP', 'Delivered Count'),
    bounceRateProp: getEnv('NOTION_BOUNCE_RATE_PROP', 'Bounce Rate'),
    unsubRateProp: getEnv('NOTION_UNSUB_RATE_PROP', 'Unsub Rate'),
    failedCountProp: getEnv('NOTION_FAILED_COUNT_PROP', 'Failed Count'),
    errorProps: {
      title: getEnv('NOTION_ERROR_TITLE_PROP', 'Name'),
      timestamp: getEnv('NOTION_ERROR_TIMESTAMP_PROP', 'Timestamp'),
      mailoutId: getEnv('NOTION_ERROR_MAILOUT_PROP', 'Mailout ID'),
      isTest: getEnv('NOTION_ERROR_TEST_PROP', 'Is Test'),
      provider: getEnv('NOTION_ERROR_PROVIDER_PROP', 'Provider'),
      stage: getEnv('NOTION_ERROR_STAGE_PROP', 'Stage'),
      email: getEnv('NOTION_ERROR_EMAIL_PROP', 'Email'),
      code: getEnv('NOTION_ERROR_CODE_PROP', 'Error Code'),
      message: getEnv('NOTION_ERROR_MESSAGE_PROP', 'Error Message'),
      retry: getEnv('NOTION_ERROR_RETRY_PROP', 'Retry Count')
    }
  },

  supabase: {
    url: getEnv('SUPABASE_URL'),
    serviceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY')
  },

  aws: {
    region: getEnv('AWS_REGION'),
    accessKeyId: getEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY')
  },

  ses: {
    fromEmail: getEnv('SES_FROM_EMAIL'),
    fromName: getEnv('FROM_NAME'),
    replyTo: getEnv('REPLY_TO_EMAIL'),
    rateLimitPerSec: parseFloatEnv('RATE_LIMIT_PER_SEC', 5),
    batchSize: parseIntEnv('BATCH_SIZE', 50)
  },

  testEmails: parseTestEmails(getEnv('TEST_EMAILS')),

  footer: {
    orgName: getEnv('ORG_NAME'),
    orgAddress: getEnv('ORG_ADDRESS'),
    unsubscribeBaseUrl: getEnv('UNSUBSCRIBE_BASE_URL', getEnv('APP_BASE_URL')),
    unsubscribeSecret: getEnv('UNSUBSCRIBE_SECRET'),
    footerHtml: getEnv('FOOTER_HTML'),
    footerText: getEnv('FOOTER_TEXT')
  },

  csvOutputDir: getEnv('CSV_OUTPUT_DIR', path.join(process.cwd(), 'out')),
  executorSharedSecret: getEnv('EXECUTOR_SHARED_SECRET')
};

module.exports = { config, getEnv, requireEnv, parseTestEmails };
