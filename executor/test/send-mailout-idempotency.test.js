/**
 * Integration tests for /send-mailout idempotency
 *
 * Note: These are simplified tests that verify the lock behavior
 * without requiring full E2E setup with Notion/Supabase/SES mocks.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { acquireLock, releaseLock, clearAllLocks } = require('../src/idempotency');

describe('Send Mailout Idempotency Integration', () => {
  beforeEach(() => {
    clearAllLocks();
  });

  describe('AC1: Only one execution enters send loop per mailout', () => {
    it('should block duplicate trigger race for same mailoutId', async () => {
      const mailoutId = 'test-mailout-123';
      const results = [];

      // Simulate two near-simultaneous send attempts
      const request1 = async () => {
        const lockAcquired = acquireLock(mailoutId);
        results.push({ request: 1, lockAcquired });

        if (lockAcquired) {
          // Simulate send operation
          await new Promise(resolve => setTimeout(resolve, 10));
          releaseLock(mailoutId);
        }
      };

      const request2 = async () => {
        const lockAcquired = acquireLock(mailoutId);
        results.push({ request: 2, lockAcquired });

        if (lockAcquired) {
          // Simulate send operation
          await new Promise(resolve => setTimeout(resolve, 10));
          releaseLock(mailoutId);
        }
      };

      // Execute both requests concurrently
      await Promise.all([request1(), request2()]);

      // Verify: only one request acquired the lock
      const successCount = results.filter(r => r.lockAcquired).length;
      assert.strictEqual(successCount, 1, 'Only one request should acquire lock');
    });

    it('should allow sequential sends after lock release', async () => {
      const mailoutId = 'test-mailout-456';

      // First request
      const lock1 = acquireLock(mailoutId);
      assert.strictEqual(lock1, true, 'First request should acquire lock');

      // Simulate send operation
      await new Promise(resolve => setTimeout(resolve, 5));
      releaseLock(mailoutId);

      // Second request after first completes
      const lock2 = acquireLock(mailoutId);
      assert.strictEqual(lock2, true, 'Second request should acquire lock after first release');
      releaseLock(mailoutId);
    });
  });

  describe('AC2: Duplicate request receives deterministic response', () => {
    it('should return failure when lock is already held', () => {
      const mailoutId = 'test-mailout-789';

      // First request acquires lock
      const result1 = acquireLock(mailoutId);
      assert.strictEqual(result1, true);

      // Second request should fail deterministically
      const result2 = acquireLock(mailoutId);
      assert.strictEqual(result2, false, 'Duplicate should receive deterministic failure');

      releaseLock(mailoutId);
    });
  });

  describe('Regression: Test mode behavior', () => {
    it('should allow test mode mailouts to be sent multiple times', () => {
      // In actual implementation, test mode mailouts skip the lock check
      // or use different mailoutIds for each test send.
      // This test verifies that different mailoutIds can be locked independently.

      const testMailout1 = 'test-mode-send-1';
      const testMailout2 = 'test-mode-send-2';

      const lock1 = acquireLock(testMailout1);
      const lock2 = acquireLock(testMailout2);

      assert.strictEqual(lock1, true);
      assert.strictEqual(lock2, true);

      releaseLock(testMailout1);
      releaseLock(testMailout2);
    });
  });

  describe('Regression: Normal first send succeeds', () => {
    it('should allow first send for new mailoutId', () => {
      const mailoutId = 'new-mailout-999';

      const result = acquireLock(mailoutId);
      assert.strictEqual(result, true, 'First send should succeed');

      releaseLock(mailoutId);
    });
  });

  describe('Lock cleanup on error', () => {
    it('should release lock even if send operation fails', async () => {
      const mailoutId = 'error-mailout-001';

      try {
        const lockAcquired = acquireLock(mailoutId);
        assert.strictEqual(lockAcquired, true);

        // Simulate send operation that throws error
        throw new Error('Send failed');
      } catch (err) {
        // Lock should be released in finally block
        releaseLock(mailoutId);
      }

      // Verify lock was released
      const retryLock = acquireLock(mailoutId);
      assert.strictEqual(retryLock, true, 'Lock should be released after error');
      releaseLock(mailoutId);
    });
  });
});
