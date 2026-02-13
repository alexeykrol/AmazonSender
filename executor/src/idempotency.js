/**
 * Idempotency lock module for preventing duplicate mailout execution
 * under concurrent or repeated trigger calls.
 *
 * Single-instance in-memory implementation.
 * For multi-node distributed locking, use Redis or similar.
 */

const activeLocks = new Set();

/**
 * Attempts to acquire an idempotency lock for a mailout.
 *
 * @param {string} mailoutId - The mailout identifier
 * @returns {boolean} true if lock acquired, false if already locked
 */
function acquireLock(mailoutId) {
  if (!mailoutId) {
    throw new Error('mailoutId is required');
  }

  if (activeLocks.has(mailoutId)) {
    return false;
  }

  activeLocks.add(mailoutId);
  return true;
}

/**
 * Releases the idempotency lock for a mailout.
 *
 * @param {string} mailoutId - The mailout identifier
 */
function releaseLock(mailoutId) {
  if (!mailoutId) {
    return;
  }

  activeLocks.delete(mailoutId);
}

/**
 * Checks if a mailout is currently locked.
 *
 * @param {string} mailoutId - The mailout identifier
 * @returns {boolean} true if locked, false otherwise
 */
function isLocked(mailoutId) {
  if (!mailoutId) {
    return false;
  }

  return activeLocks.has(mailoutId);
}

/**
 * Returns the count of active locks (for monitoring/testing).
 *
 * @returns {number} count of active locks
 */
function getActiveLockCount() {
  return activeLocks.size;
}

/**
 * Clears all locks (for testing only).
 * DO NOT use in production code.
 */
function clearAllLocks() {
  activeLocks.clear();
}

module.exports = {
  acquireLock,
  releaseLock,
  isLocked,
  getActiveLockCount,
  clearAllLocks
};
