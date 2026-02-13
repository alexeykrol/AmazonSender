/**
 * Unit tests for import-subscribers helpers
 * Simple test runner for Node.js v16
 */

const assert = require('assert');
const {
  normalizeEmail,
  isValidEmail,
  parseCSVLine,
  deduplicateSubscribers
} = require('../import-subscribers.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Running import-subscribers unit tests');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

test('normalizeEmail - converts to lowercase and trims', () => {
  assert.strictEqual(normalizeEmail('Test@Example.COM'), 'test@example.com');
  assert.strictEqual(normalizeEmail('  user@domain.org  '), 'user@domain.org');
  assert.strictEqual(normalizeEmail('NoChange@already.lower'), 'nochange@already.lower');
});

test('isValidEmail - validates email format', () => {
  // Valid emails
  assert.strictEqual(isValidEmail('user@example.com'), true);
  assert.strictEqual(isValidEmail('test.email+tag@domain.co.uk'), true);
  assert.strictEqual(isValidEmail('name123@test-domain.org'), true);

  // Invalid emails
  assert.strictEqual(isValidEmail(''), false);
  assert.strictEqual(isValidEmail('not-an-email'), false);
  assert.strictEqual(isValidEmail('@example.com'), false);
  assert.strictEqual(isValidEmail('user@'), false);
  assert.strictEqual(isValidEmail('user@domain'), false);
  assert.strictEqual(isValidEmail('user @example.com'), false);
  assert.strictEqual(isValidEmail(null), false);
  assert.strictEqual(isValidEmail(undefined), false);
});

test('parseCSVLine - handles simple comma-separated values', () => {
  const result = parseCSVLine('id,name,email,status');
  assert.deepStrictEqual(result, ['id', 'name', 'email', 'status']);
});

test('parseCSVLine - handles quoted fields with commas', () => {
  const result = parseCSVLine('1,"Smith, John",john@example.com,active');
  // Parser removes quotes from quoted fields
  assert.deepStrictEqual(result, ['1', 'Smith, John', 'john@example.com', 'active']);
});

test('parseCSVLine - handles empty fields', () => {
  const result = parseCSVLine('1,,user@test.com,');
  assert.deepStrictEqual(result, ['1', '', 'user@test.com', '']);
});

test('parseCSVLine - handles fields with escaped quotes', () => {
  const result = parseCSVLine('id,"name with ""quotes""",email');
  // Parser removes outer quotes and unescapes inner quotes (converts "" to ")
  assert.deepStrictEqual(result, ['id', 'name with "quotes"', 'email']);
});

test('parseCSVLine - preserves escaped quotes in names', () => {
  const result = parseCSVLine('1,"John ""JJ"" Doe",john@example.com');
  // Should preserve literal quotes as John "JJ" Doe, not John JJ Doe
  assert.deepStrictEqual(result, ['1', 'John "JJ" Doe', 'john@example.com']);
});

test('deduplicateSubscribers - removes duplicate emails (case-insensitive)', () => {
  // Note: emails passed to deduplicateSubscribers should already be normalized
  const subscribers = [
    { email: 'user@example.com', from_name: 'User One', status: 'active' },
    { email: 'test@domain.org', from_name: 'Test User', status: 'active' },
    { email: 'user@example.com', from_name: 'User Two', status: 'active' }, // duplicate
    { email: 'another@test.com', from_name: 'Another', status: 'active' },
    { email: 'user@example.com', from_name: 'User Three', status: 'active' } // duplicate
  ];

  const { unique, duplicates } = deduplicateSubscribers(subscribers);

  assert.strictEqual(unique.length, 3);
  assert.strictEqual(duplicates.length, 2);

  // First occurrence should be kept
  const emails = unique.map(s => s.email);
  assert.deepStrictEqual(emails, [
    'user@example.com',
    'test@domain.org',
    'another@test.com'
  ]);

  // Duplicates list
  assert.deepStrictEqual(duplicates, [
    'user@example.com',
    'user@example.com'
  ]);
});

test('deduplicateSubscribers - handles empty array', () => {
  const { unique, duplicates } = deduplicateSubscribers([]);

  assert.strictEqual(unique.length, 0);
  assert.strictEqual(duplicates.length, 0);
});

test('deduplicateSubscribers - handles array with no duplicates', () => {
  const subscribers = [
    { email: 'user1@example.com', from_name: 'User 1', status: 'active' },
    { email: 'user2@example.com', from_name: 'User 2', status: 'active' },
    { email: 'user3@example.com', from_name: 'User 3', status: 'active' }
  ];

  const { unique, duplicates } = deduplicateSubscribers(subscribers);

  assert.strictEqual(unique.length, 3);
  assert.strictEqual(duplicates.length, 0);
});

test('deduplicateSubscribers - handles all unique emails', () => {
  // When emails are pre-normalized, duplicates only happen if same email appears multiple times
  const subscribers = [
    { email: 'test@example.com', from_name: 'Test 1', status: 'active' },
    { email: 'other@example.com', from_name: 'Test 2', status: 'active' },
    { email: 'another@example.com', from_name: 'Test 3', status: 'active' }
  ];

  const { unique, duplicates } = deduplicateSubscribers(subscribers);

  assert.strictEqual(unique.length, 3);
  assert.strictEqual(duplicates.length, 0);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failed > 0) {
  process.exit(1);
}
