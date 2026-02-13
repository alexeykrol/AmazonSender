/**
 * Regression test: createApp() instantiation
 *
 * Verifies that createApp() can be instantiated without throwing exceptions.
 * This test was added to prevent regression of the TDZ (Temporal Dead Zone) bug
 * where appConfig was referenced before initialization.
 *
 * Bug: createApp() used appConfig.notion.token before declaring appConfig
 * Fix: Moved appConfig declaration to first line of createApp()
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/server');

describe('createApp() regression tests', () => {
  it('should instantiate without throwing exception', () => {
    // Minimal config stub to allow app creation
    const deps = {
      config: {
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
        testEmails: ['test@example.com'],
        csvOutputDir: '/tmp'
      },
      logger: {
        info: () => {},
        error: () => {},
        warn: () => {}
      },
      notion: {
        pages: { retrieve: async () => ({}), update: async () => ({}) },
        blocks: { children: { list: async () => ({ results: [] }) } }
      },
      supabase: {
        from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) })
      },
      sesClient: {
        send: async () => ({ MessageId: 'test-message-id' })
      }
    };

    // Should not throw ReferenceError or any other exception
    assert.doesNotThrow(() => {
      const app = createApp(deps);
      assert.ok(app, 'createApp should return an Express app instance');
      assert.strictEqual(typeof app.listen, 'function', 'App should have listen method');
    }, 'createApp() should not throw exception during instantiation');
  });

  it('should instantiate without dependencies (use defaults)', () => {
    // Verify that createApp() can be called without deps argument
    // This tests the default config path (though it may fail later due to missing env vars)
    // The key is that it doesn't throw during variable initialization
    assert.doesNotThrow(() => {
      try {
        const app = createApp();
        assert.ok(app, 'createApp should return an Express app instance even without deps');
      } catch (err) {
        // It's OK if it fails due to missing env vars or invalid config
        // We only care that it doesn't throw TDZ error during variable initialization
        if (err.message && err.message.includes('before initialization')) {
          throw err; // Re-throw if it's a TDZ error
        }
        // Otherwise, expected failure due to missing config is OK for this test
      }
    }, 'createApp() should not throw TDZ error when called without deps');
  });
});
