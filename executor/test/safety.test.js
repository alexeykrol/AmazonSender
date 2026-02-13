const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  extractProjectRefFromSupabaseUrl,
  assertSupabaseProjectScope,
  parseBoolEnv
} = require('../src/safety');

describe('Safety helpers', () => {
  it('extracts project ref from SUPABASE_URL', () => {
    const ref = extractProjectRefFromSupabaseUrl('https://mrwzuwdrmdfyleqwmuws.supabase.co');
    assert.strictEqual(ref, 'mrwzuwdrmdfyleqwmuws');
  });

  it('returns null for invalid SUPABASE_URL', () => {
    const ref = extractProjectRefFromSupabaseUrl('postgresql://localhost:5432/db');
    assert.strictEqual(ref, null);
  });

  it('throws on project mismatch', () => {
    assert.throws(() => {
      assertSupabaseProjectScope({
        url: 'https://abc123.supabase.co',
        expectedRef: 'zzz999',
        context: 'test'
      });
    }, /Supabase project mismatch/);
  });

  it('accepts matching project ref', () => {
    assert.doesNotThrow(() => {
      assertSupabaseProjectScope({
        url: 'https://abc123.supabase.co',
        expectedRef: 'abc123',
        context: 'test'
      });
    });
  });

  it('parses boolean environment values', () => {
    assert.strictEqual(parseBoolEnv('true'), true);
    assert.strictEqual(parseBoolEnv('1'), true);
    assert.strictEqual(parseBoolEnv('yes'), true);
    assert.strictEqual(parseBoolEnv('false'), false);
    assert.strictEqual(parseBoolEnv('0'), false);
    assert.strictEqual(parseBoolEnv('', true), true);
  });
});
