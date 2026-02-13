#!/usr/bin/env node
/**
 * Safe local trigger for POST /send-mailout
 *
 * - Reads mailout meta from Notion to prevent accidental non-test sends.
 * - Requires ALLOW_NON_TEST_SEND=true to trigger a non-test mailout.
 *
 * Usage:
 *   node trigger-mailout.js <mailout_id>
 *
 * Example:
 *   node trigger-mailout.js 30537ae4-90d5-81de-b4c5-f626fe96ada3
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const http = require('http');
const { createNotionClient, getPage, getPageMeta } = require('./src/notion');
const { config } = require('./src/config');

function requestJson({ method, port, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = raw;
        }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const mailoutId = process.argv[2];
  if (!mailoutId) {
    console.error('Usage: node trigger-mailout.js <mailout_id>');
    process.exit(1);
  }

  const port = Number(process.env.PORT || 3000);

  // Check server is running.
  try {
    const health = await requestJson({ method: 'GET', port, path: '/health' });
    if (health.statusCode !== 200) throw new Error(`health status ${health.statusCode}`);
  } catch (err) {
    console.error(`Server is not running on http://localhost:${port}`);
    console.error('Start it first, e.g.:');
    console.error('  cd executor && nvm use 20 && DRY_RUN_SEND=false node src/server.js');
    process.exit(1);
  }

  // Read meta from Notion.
  const notion = createNotionClient(config.notion.token);
  if (!notion) {
    console.error('NOTION_API_TOKEN is not configured in .env');
    process.exit(1);
  }

  let meta;
  try {
    const page = await getPage(notion, mailoutId);
    meta = getPageMeta(page, config.notion);
  } catch (err) {
    console.error('Failed to read mailout from Notion:', err?.message || err);
    process.exit(1);
  }

  if (!meta.subject) {
    console.error('Mailout subject is missing in Notion.');
    process.exit(1);
  }

  const allowNonTest = /^(1|true|yes|on)$/i.test(String(process.env.ALLOW_NON_TEST_SEND || '').trim());
  if (!meta.isTest && !allowNonTest) {
    console.error('Refusing to send: this mailout is NOT marked as Test in Notion.');
    console.error('If you really want to send to the full subscriber list, re-run with:');
    console.error('  ALLOW_NON_TEST_SEND=true node trigger-mailout.js <mailout_id>');
    process.exit(2);
  }

  // Trigger local executor.
  const secret = process.env.EXECUTOR_SHARED_SECRET;
  const headers = {};
  if (secret) headers['X-Auth-Token'] = secret;

  const resp = await requestJson({
    method: 'POST',
    port,
    path: '/send-mailout',
    headers,
    body: { mailout_id: mailoutId, auth_token: secret || undefined }
  });

  if (resp.statusCode !== 200) {
    console.error('Request failed:', resp.statusCode, resp.body);
    process.exit(3);
  }

  console.log('OK:', resp.body);
}

main().catch((err) => {
  console.error('Fatal:', err?.message || err);
  process.exit(1);
});

