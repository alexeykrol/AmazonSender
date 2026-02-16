const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('resetMailoutAnalytics', () => {
  it('should set Test=true and clear analytics when resetting', async () => {
    const updates = {};
    const mockNotion = {
      pages: {
        retrieve: mock.fn(async () => ({
          properties: {
            Test: { type: 'checkbox', checkbox: false },
            'Sent At': { type: 'date', date: { start: '2026-02-14' } },
            'Sent Count': { type: 'number', number: 100 },
            'Bounce Rate': { type: 'number', number: 0.05 },
            Status: { type: 'status', status: { name: 'Done' } }
          }
        })),
        update: mock.fn(async ({ page_id, properties }) => {
          Object.assign(updates, properties);
        })
      }
    };

    const cfg = {
      notion: {
        testProp: 'Test',
        sentAtProp: 'Sent At',
        sentCountProp: 'Sent Count',
        bounceRateProp: 'Bounce Rate',
        unsubRateProp: 'Unsub Rate',
        statusProp: 'Status',
        notStartedStatusValue: 'Not started'
      }
    };

    // Import the function under test.
    const pollerModule = require('../src/poller.js');
    // Extract internal function via manual export for testing.
    const { resetMailoutAnalytics } = require('./poller-reset-helper.js');

    await resetMailoutAnalytics({ notion: mockNotion, cfg, mailoutId: 'page-123' });

    assert.equal(mockNotion.pages.retrieve.mock.calls.length, 1);
    assert.equal(mockNotion.pages.update.mock.calls.length, 1);

    // Verify Test is forced to true.
    assert.deepEqual(updates.Test, { checkbox: true });

    // Verify analytics cleared.
    assert.deepEqual(updates['Sent At'], { date: null });
    assert.deepEqual(updates['Sent Count'], { number: null });
    assert.deepEqual(updates['Bounce Rate'], { number: null });

    // Verify Status reset.
    assert.deepEqual(updates.Status, { status: { name: 'Not started' } });

    // Verify missing property (Unsub Rate) not included.
    assert.equal(updates['Unsub Rate'], undefined);
  });

  it('should skip properties that do not exist in schema', async () => {
    const updates = {};
    const mockNotion = {
      pages: {
        retrieve: mock.fn(async () => ({
          properties: {
            Test: { type: 'checkbox', checkbox: false },
            Status: { type: 'status', status: { name: 'Done' } }
          }
        })),
        update: mock.fn(async ({ page_id, properties }) => {
          Object.assign(updates, properties);
        })
      }
    };

    const cfg = {
      notion: {
        testProp: 'Test',
        sentAtProp: 'Sent At',
        sentCountProp: 'Sent Count',
        bounceRateProp: 'Bounce Rate',
        unsubRateProp: 'Unsub Rate',
        deliveredCountProp: 'Delivered Count',
        failedCountProp: 'Failed Count',
        statusProp: 'Status',
        notStartedStatusValue: 'Not started'
      }
    };

    const { resetMailoutAnalytics } = require('./poller-reset-helper.js');
    await resetMailoutAnalytics({ notion: mockNotion, cfg, mailoutId: 'page-456' });

    // Verify only Test and Status are updated (analytics props missing).
    assert.deepEqual(updates.Test, { checkbox: true });
    assert.deepEqual(updates.Status, { status: { name: 'Not started' } });
    assert.equal(Object.keys(updates).length, 2);
  });

  it('should handle page retrieve failure gracefully', async () => {
    const updates = {};
    const mockNotion = {
      pages: {
        retrieve: mock.fn(async () => {
          throw new Error('Notion API error');
        }),
        update: mock.fn(async ({ page_id, properties }) => {
          Object.assign(updates, properties);
        })
      }
    };

    const cfg = {
      notion: {
        testProp: 'Test',
        sentAtProp: 'Sent At',
        statusProp: 'Status',
        notStartedStatusValue: 'Not started'
      }
    };

    const { resetMailoutAnalytics } = require('./poller-reset-helper.js');

    // Should not throw, but falls back to old behavior (attempt update anyway).
    await resetMailoutAnalytics({ notion: mockNotion, cfg, mailoutId: 'page-789' });

    // When retrieve fails, updates will be empty because existingProps is {}.
    assert.deepEqual(updates.Status, { status: { name: 'Not started' } });
  });
});
