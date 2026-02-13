/**
 * Test for DRY_RUN_SEND mode
 *
 * Validates that dry-run mode:
 * - AC1: skips real SES sendEmail calls
 * - AC2: produces deterministic recipient counts
 * - AC3: marks CSV records as 'simulated'
 * - AC4: does not affect normal send behavior when disabled
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../src/server');
const { clearAllLocks } = require('../src/idempotency');

function createDependencyStubs(overrideConfig = {}) {
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
      rateLimitPerSec: 100,
      batchSize: 10
    },
    testEmails: ['test1@example.com', 'test2@example.com'],
    csvOutputDir: '/tmp',
    runtime: {
      dryRunSend: false
    },
    ...overrideConfig
  };

  const logger = {
    info: () => {},
    error: () => {},
    warn: () => {}
  };

  const notion = {
    pages: {
      retrieve: async () => ({
        properties: {
          Subject: { type: 'title', title: [{ plain_text: 'Test Subject' }] },
          Test: { type: 'checkbox', checkbox: false },
          Status: { type: 'status', status: { name: 'Draft' } },
          'Sent At': { type: 'date', date: null }
        }
      }),
      update: async () => ({})
    },
    blocks: {
      children: {
        list: async () => ({
          results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Body' }] } }]
        })
      }
    }
  };

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [
              { email: 'user1@example.com', status: 'active', from_name: 'User 1' },
              { email: 'user2@example.com', status: 'active', from_name: 'User 2' },
              { email: 'user3@example.com', status: 'active', from_name: 'User 3' }
            ],
            error: null
          })
        })
      })
    })
  };

  let sesSendCallCount = 0;
  let sesSentInputs = [];

  const sesClient = {
    send: async (command) => {
      sesSendCallCount++;
      sesSentInputs.push(command?.input || null);
      return { MessageId: 'real-message-' + Date.now() };
    },
    getSendCallCount: () => sesSendCallCount,
    getSentInputs: () => sesSentInputs,
    resetSendCallCount: () => {
      sesSendCallCount = 0;
      sesSentInputs = [];
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

describe('DRY_RUN_SEND mode tests', () => {
  describe('with DRY_RUN_SEND=true', () => {
    let server;
    let port;
    let deps;

    before(() => {
      clearAllLocks();
      deps = createDependencyStubs();
      deps.config.runtime.dryRunSend = true;
      const app = createApp(deps);
      server = app.listen(0);
      port = server.address().port;
    });

    after(() => {
      if (server) server.close();
    });

    beforeEach(() => {
      clearAllLocks();
      deps.sesClient.resetSendCallCount();
    });

    it('AC1: should not invoke sendEmail when dry-run enabled', async () => {
      const mailoutId = 'dry-run-mailout-001';
      const response = await makeRequest(port, mailoutId);

      assert.strictEqual(response.statusCode, 200, 'Request should succeed');
      assert.strictEqual(deps.sesClient.getSendCallCount(), 0,
        'SES send should not be called in dry-run mode');
    });

    it('AC2: should return deterministic counts matching recipient set', async () => {
      const mailoutId = 'dry-run-mailout-002';
      const response = await makeRequest(port, mailoutId);

      assert.strictEqual(response.statusCode, 200, 'Request should succeed');
      assert.strictEqual(response.body.sent, 3,
        'Should count all 3 simulated sends');
      assert.strictEqual(response.body.failed, 0,
        'Should have no failures in dry-run');
    });

    it('AC2: should be deterministic across multiple runs', async () => {
      const mailoutId1 = 'dry-run-mailout-003a';
      const mailoutId2 = 'dry-run-mailout-003b';

      const response1 = await makeRequest(port, mailoutId1);
      const response2 = await makeRequest(port, mailoutId2);

      assert.strictEqual(response1.body.sent, response2.body.sent,
        'Sent count should be consistent across runs');
      assert.strictEqual(response1.body.failed, response2.body.failed,
        'Failed count should be consistent across runs');
    });

    it('should indicate dry-run mode in response', async () => {
      const mailoutId = 'dry-run-mailout-004';
      const response = await makeRequest(port, mailoutId);

      assert.strictEqual(response.statusCode, 200, 'Request should succeed');
      assert.strictEqual(response.body.dry_run, true,
        'Response should indicate dry_run: true');
    });

    it('AC3: CSV artifact should contain simulated status', async () => {
      const fs = require('fs');
      const path = require('path');
      const mailoutId = 'dry-run-mailout-005';
      const csvDir = '/tmp';

      // Clean up existing CSV files for this mailout if present
      const existingFiles = fs.readdirSync(csvDir)
        .filter(f => f.startsWith(`mailout-${mailoutId}-`));
      existingFiles.forEach(f => fs.unlinkSync(path.join(csvDir, f)));

      const response = await makeRequest(port, mailoutId);
      assert.strictEqual(response.statusCode, 200, 'Request should succeed');

      // Find the created CSV file (with timestamp suffix)
      const csvFiles = fs.readdirSync(csvDir)
        .filter(f => f.startsWith(`mailout-${mailoutId}-`));
      assert.strictEqual(csvFiles.length, 1, 'Exactly one CSV file should be created');

      const csvPath = path.join(csvDir, csvFiles[0]);
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');

      assert.ok(lines.length > 1, 'CSV should have header + data rows');

      // Verify header includes status column
      const header = lines[0];
      assert.ok(header.includes('status'), 'CSV header should include status column');

      // Check that all data rows have 'simulated' status
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        assert.ok(row.includes(',simulated,'),
          `Row ${i} should contain status=simulated`);
      }

      // Clean up
      fs.unlinkSync(csvPath);
    });

    it('should work in dry-run without SES client configuration', async () => {
      const depsNoSes = createDependencyStubs({
        aws: {}
      });
      depsNoSes.config.runtime.dryRunSend = true;
      delete depsNoSes.sesClient;

      const appNoSes = createApp(depsNoSes);
      const tempServer = appNoSes.listen(0);
      const tempPort = tempServer.address().port;

      try {
        const response = await makeRequest(tempPort, 'dry-run-mailout-no-ses');
        assert.strictEqual(response.statusCode, 200, 'Dry-run should work without SES client');
        assert.strictEqual(response.body.dry_run, true, 'Response should indicate dry-run');
      } finally {
        tempServer.close();
      }
    });
  });

  describe('with DRY_RUN_SEND=false (default)', () => {
    let server;
    let port;
    let deps;

    before(() => {
      clearAllLocks();
      deps = createDependencyStubs();
      deps.config.runtime.dryRunSend = false;
      const app = createApp(deps);
      server = app.listen(0);
      port = server.address().port;
    });

    after(() => {
      if (server) server.close();
    });

    beforeEach(() => {
      clearAllLocks();
      deps.sesClient.resetSendCallCount();
    });

    it('AC4: should call real sendEmail when dry-run disabled', async () => {
      const mailoutId = 'real-send-mailout-001';
      const response = await makeRequest(port, mailoutId);

      assert.strictEqual(response.statusCode, 200, 'Request should succeed');
      assert.strictEqual(deps.sesClient.getSendCallCount(), 3,
        'SES send should be called for all 3 recipients');
    });

    it('AC4: should not indicate dry-run in response when disabled', async () => {
      const mailoutId = 'real-send-mailout-002';
      const response = await makeRequest(port, mailoutId);

      assert.strictEqual(response.statusCode, 200, 'Request should succeed');
      assert.strictEqual(response.body.dry_run, false,
        'Response should indicate dry_run: false');
    });

    it('should append unsubscribe block even with custom FOOTER_HTML/TEXT', async () => {
      const depsCustomFooter = createDependencyStubs({
        footer: {
          orgName: 'Alexey Krol',
          orgAddress: '1031 Crestview Dr, Mountain View, CA 94040, USA',
          unsubscribeBaseUrl: 'http://localhost/unsubscribe',
          unsubscribeSecret: 'test-secret',
          footerHtml: '<p>Custom promo footer</p>',
          footerText: 'Custom promo footer (text)'
        }
      });
      depsCustomFooter.config.runtime.dryRunSend = false;

      const appCustom = createApp(depsCustomFooter);
      const customServer = appCustom.listen(0);
      const customPort = customServer.address().port;

      try {
        const response = await makeRequest(customPort, 'real-send-mailout-003');
        assert.strictEqual(response.statusCode, 200, 'Request should succeed');
        assert.strictEqual(response.body.sent, 3, 'Should send to all recipients');

        const firstInput = depsCustomFooter.sesClient.getSentInputs()[0];
        assert.ok(firstInput, 'SES command input should be captured');

        const html = firstInput.Message.Body.Html.Data;
        const text = firstInput.Message.Body.Text.Data;

        assert.ok(html.includes('Custom promo footer'), 'Custom HTML footer should be present');
        assert.ok(text.includes('Custom promo footer (text)'), 'Custom text footer should be present');
        assert.ok(html.includes('Unsubscribe'), 'HTML should include unsubscribe link label');
        assert.ok(text.includes('Unsubscribe:'), 'Text should include unsubscribe URL label');
        assert.ok(html.includes('http://localhost/unsubscribe?token='), 'HTML should include signed unsubscribe URL');
        assert.ok(text.includes('http://localhost/unsubscribe?token='), 'Text should include signed unsubscribe URL');
        assert.ok(html.includes('1031 Crestview Dr, Mountain View, CA 94040, USA'), 'HTML should include org address');
        assert.ok(text.includes('1031 Crestview Dr, Mountain View, CA 94040, USA'), 'Text should include org address');
      } finally {
        customServer.close();
      }
    });

    it('should interpolate {{name}} and {{email}} placeholders in subject/body', async () => {
      const depsTemplate = createDependencyStubs();
      depsTemplate.config.runtime.dryRunSend = false;

      depsTemplate.notion.pages.retrieve = async () => ({
        properties: {
          Subject: { type: 'title', title: [{ plain_text: 'Hello {{name}}' }] },
          Test: { type: 'checkbox', checkbox: false },
          Status: { type: 'status', status: { name: 'Draft' } },
          'Sent At': { type: 'date', date: null }
        }
      });
      depsTemplate.notion.blocks.children.list = async () => ({
        results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Body for {{name}} <{{email}}>' }] } }]
      });

      const appTemplate = createApp(depsTemplate);
      const templateServer = appTemplate.listen(0);
      const templatePort = templateServer.address().port;

      try {
        const response = await makeRequest(templatePort, 'real-send-mailout-004');
        assert.strictEqual(response.statusCode, 200, 'Request should succeed');

        const firstInput = depsTemplate.sesClient.getSentInputs()[0];
        assert.ok(firstInput, 'SES command input should be captured');

        assert.strictEqual(firstInput.Message.Subject.Data, 'Hello User 1');
        assert.ok(firstInput.Message.Body.Html.Data.includes('Body for User 1 &lt;user1@example.com&gt;'));
        assert.ok(firstInput.Message.Body.Text.Data.includes('Body for User 1 <user1@example.com>'));
        assert.ok(!firstInput.Message.Body.Html.Data.includes('{{name}}'));
        assert.ok(!firstInput.Message.Body.Text.Data.includes('{{email}}'));
      } finally {
        templateServer.close();
      }
    });
  });
});
