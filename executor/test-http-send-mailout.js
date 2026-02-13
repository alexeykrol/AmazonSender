#!/usr/bin/env node
/**
 * HTTP Test for /send-mailout endpoint
 * Validates real route execution with Notion schema alignment
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const http = require('http');

const MAILOUT_ID = '30537ae4-90d5-81de-b4c5-f626fe96ada3'; // Non-test mailout for full validation
const PORT = process.env.PORT || 3000;
const EXECUTOR_SHARED_SECRET = process.env.EXECUTOR_SHARED_SECRET;

async function testSendMailout() {
  console.log('=== HTTP /send-mailout TEST ===\n');
  console.log(`Mailout ID: ${MAILOUT_ID}`);
  console.log(`DRY_RUN_SEND: ${process.env.DRY_RUN_SEND}`);
  console.log(`Port: ${PORT}\n`);

  // Prepare request body (mimics Notion webhook structure)
  const requestBody = JSON.stringify({
    mailout_id: MAILOUT_ID,
    auth_token: EXECUTOR_SHARED_SECRET
  });

  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/send-mailout',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      'X-Auth-Token': EXECUTOR_SHARED_SECRET
    },
    timeout: 300000 // 5 minutes (handles ~961 subscribers @ 5/sec)
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Response status: ${res.statusCode}\n`);

        let parsedData;
        try {
          parsedData = JSON.parse(data);
          console.log('Response body:');
          console.log(JSON.stringify(parsedData, null, 2));
          console.log();
        } catch (e) {
          console.log('Raw response:', data);
          console.log();
        }

        if (res.statusCode === 200) {
          console.log('✅ HTTP REQUEST SUCCEEDED');
          resolve(parsedData);
        } else {
          console.log('❌ HTTP REQUEST FAILED');
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (300s)'));
    });

    req.write(requestBody);
    req.end();
  });
}

async function verifyNotionUpdate() {
  console.log('\n=== VERIFYING NOTION UPDATE ===\n');

  const { createNotionClient, getPage } = require('./src/notion');
  const notion = createNotionClient(process.env.NOTION_API_TOKEN);

  const page = await getPage(notion, MAILOUT_ID);
  const props = page.properties;

  console.log('Mailout page properties after /send-mailout:');
  console.log(`- Name: ${props.Name?.title?.[0]?.text?.content || 'N/A'}`);
  console.log(`- Status: ${props.Status?.status?.name || 'N/A'}`);
  console.log(`- Sent At: ${props['Sent At']?.date?.start || 'N/A'}`);
  console.log(`- Sent Count: ${props['Sent Count']?.number ?? 'N/A'}`);
  console.log(`- Delivered Count: ${props['Delivered Count']?.number ?? 'N/A'}`);
  console.log(`- Failed Count: ${props['Failed Count']?.number ?? 'N/A'}`);
  console.log(`- Bounce Rate: ${props['Bounce Rate']?.number ?? 'N/A'}`);
  console.log();

  // Check for validation errors
  if (page.validation_error) {
    console.log('❌ VALIDATION ERROR DETECTED:');
    console.log(JSON.stringify(page.validation_error, null, 2));
    throw new Error('Notion validation error after update');
  }

  console.log('✅ No validation errors detected\n');

  return {
    pageId: page.id,
    status: props.Status?.status?.name,
    sentAt: props['Sent At']?.date?.start,
    sentCount: props['Sent Count']?.number
  };
}

async function main() {
  try {
    // Check if server is running
    console.log('Checking if server is running...\n');

    const healthCheck = await new Promise((resolve) => {
      const req = http.get(`http://localhost:${PORT}/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (!healthCheck) {
      console.error('❌ Server is not running on port', PORT);
      console.error('\nStart server first:');
      console.error('  cd executor && nvm use 20 && DRY_RUN_SEND=true node src/server.js\n');
      process.exit(1);
    }

    console.log('✅ Server is running\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Execute HTTP test
    const response = await testSendMailout();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify Notion update
    const notionData = await verifyNotionUpdate();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ TEST COMPLETE: /send-mailout endpoint validated successfully!');
    console.log(`\nPage ${notionData.pageId} updated without validation errors.`);

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

main();
