/**
 * Real endpoint test for /send-mailout idempotency
 *
 * Tests the ACTUAL production route from server.js with dependency injection.
 * Validates AC2: duplicate concurrent request returns 409 { error: 'send_in_progress' }
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../src/server');
const { clearAllLocks } = require('../src/idempotency');

// Create dependency stubs for testing
function createDependencyStubs() {
  const config = {
    executorSharedSecret: null,
    logLevel: 'error',
    notion: {
      token: 'test-token',
      dbErrorsId: null,
      webhookVerificationToken: null,
      subjectProp: 'Subject',
      testProp: 'Test',
      statusProp: 'Status',
      statusSentValue: 'Sent',
      statusFailedValue: 'Failed',
      sentAtProp: 'Sent At',
      sentCountProp: 'Sent Count',
      deliveredCountProp: 'Delivered Count',
      failedCountProp: 'Failed Count',
      bounceRateProp: 'Bounce Rate',
      unsubRateProp: 'Unsub Rate'
    },
    footer: {
      orgName: 'Test Org',
      orgAddress: 'Test Address',
      unsubscribeBaseUrl: 'http://localhost/unsub',
      unsubscribeSecret: 'test-secret'
    },
    ses: {
      fromEmail: 'test@example.com',
      rateLimitPerSec: 10,
      batchSize: 10
    },
    testEmails: ['test1@example.com', 'test2@example.com'],
    csvOutputDir: '/tmp',
    runtime: {
      allowProductionSend: true
    }
  };

  const logger = {
    info: () => {},
    error: () => {},
    warn: () => {}
  };

  const notion = {
    pages: {
      retrieve: async (params) => {
        // Add small delay to ensure lock can be detected by concurrent requests
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          properties: {
            Subject: { type: 'title', title: [{ plain_text: 'Test Subject' }] },
            Test: { type: 'checkbox', checkbox: false },
            Status: { type: 'status', status: { name: 'Draft' } },
            'Sent At': { type: 'date', date: null }
          }
        };
      },
      update: async () => ({})
    },
    blocks: {
      children: {
        list: async () => {
          // Add delay AFTER lock is acquired (getPageContent happens after lock)
          // This ensures first request holds lock while second request tries to acquire
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Body' }] } }]
          };
        }
      }
    }
  };

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [{ email: 'user@example.com', status: 'active', from_name: 'User' }],
            error: null
          })
        })
      })
    })
  };

  const sesClient = {
    send: async () => {
      // Add delay to ensure concurrent requests overlap
      await new Promise(resolve => setTimeout(resolve, 100));
      return { MessageId: 'test-message-' + Date.now() };
    }
  };

  return { config, logger, notion, supabase, sesClient };
}

function makeRequest(port, mailoutId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ page_id: mailoutId });

    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/send-mailout',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

describe('POST /send-mailout real endpoint idempotency', () => {
  let server;
  let port;

  before(() => {
    clearAllLocks();
    // Use REAL createApp from server.js with stubbed dependencies
    const app = createApp(createDependencyStubs());
    server = app.listen(0);
    port = server.address().port;
  });

  after(() => {
    if (server) server.close();
  });

  beforeEach(() => {
    clearAllLocks();
  });

  it('should return 409 with send_in_progress for concurrent duplicate requests', async () => {
    const mailoutId = 'concurrent-mailout-001';

    // Make two concurrent requests to REAL /send-mailout endpoint
    const [response1, response2] = await Promise.all([
      makeRequest(port, mailoutId),
      makeRequest(port, mailoutId)
    ]);

    // One should succeed, one should return 409
    const responses = [response1, response2];
    const successResponses = responses.filter(r => r.statusCode === 200);
    const conflictResponses = responses.filter(r => r.statusCode === 409);

    assert.strictEqual(successResponses.length, 1,
      `Expected 1 success, got ${successResponses.length}. Statuses: [${response1.statusCode}, ${response2.statusCode}]`);
    assert.strictEqual(conflictResponses.length, 1,
      `Expected 1 conflict, got ${conflictResponses.length}`);

    // Verify 409 response has correct error from REAL endpoint
    const conflictResponse = conflictResponses[0];
    assert.strictEqual(conflictResponse.body.error, 'send_in_progress',
      'Real endpoint should return error: send_in_progress for concurrent duplicate');
  });

  it('should allow sequential requests after lock release', async () => {
    const mailoutId = 'sequential-mailout-001';

    // First request
    const response1 = await makeRequest(port, mailoutId);
    assert.strictEqual(response1.statusCode, 200, 'First request should succeed');

    // Second request after first completes
    const response2 = await makeRequest(port, mailoutId);
    assert.strictEqual(response2.statusCode, 200, 'Second request should succeed after lock release');
  });

  it('should return correct 409 response structure', async () => {
    const mailoutId = 'structure-test-001';

    // Start first request (will hold lock)
    const firstPromise = makeRequest(port, mailoutId);

    // Small delay to ensure first request acquires lock
    await new Promise(resolve => setTimeout(resolve, 20));

    // Second request should get 409
    const response2 = await makeRequest(port, mailoutId);

    assert.strictEqual(response2.statusCode, 409, 'Should return 409 status');
    assert.ok(response2.body.error, 'Response should have error field');
    assert.strictEqual(response2.body.error, 'send_in_progress',
      'Error should be send_in_progress from real endpoint');

    // Wait for first request
    await firstPromise;
  });
});
