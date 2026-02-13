const { describe, it } = require('node:test');
const assert = require('node:assert');
const { resolveRecipientName, applyTemplate } = require('../src/utils');

describe('Template utilities', () => {
  describe('resolveRecipientName', () => {
    it('prefers explicit from_name', () => {
      const name = resolveRecipientName({
        email: 'alexeykrol@gmail.com',
        from_name: 'Alexey Krol'
      });
      assert.strictEqual(name, 'Alexey Krol');
    });

    it('falls back to local part of email', () => {
      const name = resolveRecipientName({
        email: 'alexey.krol-mini@gmail.com'
      });
      assert.strictEqual(name, 'alexey krol mini');
    });
  });

  describe('applyTemplate', () => {
    it('replaces supported placeholders', () => {
      const result = applyTemplate('Hi {{name}} <{{email}}>', {
        name: 'Alexey',
        email: 'alexey@example.com'
      });
      assert.strictEqual(result, 'Hi Alexey <alexey@example.com>');
    });

    it('keeps unknown placeholders unchanged', () => {
      const result = applyTemplate('Hello {{name}}, {{unknown}}', {
        name: 'Alexey'
      });
      assert.strictEqual(result, 'Hello Alexey, {{unknown}}');
    });

    it('is case-insensitive for keys', () => {
      const result = applyTemplate('Hello {{NAME}} / {{Email}}', {
        name: 'Alexey',
        EMAIL: 'alexey@example.com'
      });
      assert.strictEqual(result, 'Hello Alexey / alexey@example.com');
    });
  });
});
