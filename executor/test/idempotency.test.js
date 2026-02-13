/**
 * Unit tests for idempotency lock module
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { acquireLock, releaseLock, isLocked, getActiveLockCount, clearAllLocks } = require('../src/idempotency');

describe('Idempotency Lock Module', () => {
  beforeEach(() => {
    clearAllLocks();
  });

  describe('acquireLock', () => {
    it('should acquire lock for new mailoutId', () => {
      const result = acquireLock('test-mailout-1');
      assert.strictEqual(result, true);
      assert.strictEqual(isLocked('test-mailout-1'), true);
    });

    it('should fail to acquire lock for already locked mailoutId', () => {
      acquireLock('test-mailout-1');
      const result = acquireLock('test-mailout-1');
      assert.strictEqual(result, false);
    });

    it('should throw error if mailoutId is missing', () => {
      assert.throws(() => acquireLock(null), /mailoutId is required/);
      assert.throws(() => acquireLock(undefined), /mailoutId is required/);
      assert.throws(() => acquireLock(''), /mailoutId is required/);
    });

    it('should allow acquiring locks for different mailoutIds', () => {
      const result1 = acquireLock('test-mailout-1');
      const result2 = acquireLock('test-mailout-2');
      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
      assert.strictEqual(getActiveLockCount(), 2);
    });
  });

  describe('releaseLock', () => {
    it('should release acquired lock', () => {
      acquireLock('test-mailout-1');
      releaseLock('test-mailout-1');
      assert.strictEqual(isLocked('test-mailout-1'), false);
    });

    it('should allow reacquiring lock after release', () => {
      acquireLock('test-mailout-1');
      releaseLock('test-mailout-1');
      const result = acquireLock('test-mailout-1');
      assert.strictEqual(result, true);
    });

    it('should handle releasing non-existent lock gracefully', () => {
      assert.doesNotThrow(() => releaseLock('non-existent'));
    });

    it('should handle releasing with null/undefined gracefully', () => {
      assert.doesNotThrow(() => releaseLock(null));
      assert.doesNotThrow(() => releaseLock(undefined));
    });
  });

  describe('isLocked', () => {
    it('should return true for locked mailoutId', () => {
      acquireLock('test-mailout-1');
      assert.strictEqual(isLocked('test-mailout-1'), true);
    });

    it('should return false for unlocked mailoutId', () => {
      assert.strictEqual(isLocked('test-mailout-1'), false);
    });

    it('should return false for null/undefined', () => {
      assert.strictEqual(isLocked(null), false);
      assert.strictEqual(isLocked(undefined), false);
    });
  });

  describe('getActiveLockCount', () => {
    it('should return 0 when no locks', () => {
      assert.strictEqual(getActiveLockCount(), 0);
    });

    it('should return correct count of active locks', () => {
      acquireLock('test-mailout-1');
      acquireLock('test-mailout-2');
      acquireLock('test-mailout-3');
      assert.strictEqual(getActiveLockCount(), 3);
    });

    it('should update count after release', () => {
      acquireLock('test-mailout-1');
      acquireLock('test-mailout-2');
      releaseLock('test-mailout-1');
      assert.strictEqual(getActiveLockCount(), 1);
    });
  });

  describe('concurrent lock attempts', () => {
    it('should handle race condition correctly', () => {
      // Simulate two concurrent requests
      const result1 = acquireLock('test-mailout-1');
      const result2 = acquireLock('test-mailout-1');

      assert.strictEqual(result1, true, 'First acquire should succeed');
      assert.strictEqual(result2, false, 'Second acquire should fail');
    });
  });
});
