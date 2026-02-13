const { describe, it } = require('node:test');
const assert = require('node:assert');

const { verifySnsSignature, confirmSubscription } = require('../src/sns');

describe('SNS security', () => {
  it('rejects untrusted SigningCertURL without fetching', async () => {
    const originalFetch = global.fetch;
    let fetched = false;
    global.fetch = async () => {
      fetched = true;
      throw new Error('fetch should not be called');
    };

    try {
      const ok = await verifySnsSignature({
        Type: 'Notification',
        Message: '{}',
        MessageId: 'test',
        Timestamp: new Date().toISOString(),
        TopicArn: 'arn:test',
        SigningCertURL: 'https://evil.example.com/cert.pem',
        Signature: 'abc'
      });
      assert.strictEqual(ok, false);
      assert.strictEqual(fetched, false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fetches cert only for trusted SNS SigningCertURL', async () => {
    const originalFetch = global.fetch;
    let fetched = false;
    global.fetch = async () => {
      fetched = true;
      return { ok: false, status: 404, text: async () => '' };
    };

    try {
      const ok = await verifySnsSignature({
        Type: 'Notification',
        Message: '{}',
        MessageId: 'test',
        Timestamp: new Date().toISOString(),
        TopicArn: 'arn:test',
        SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem',
        Signature: 'abc'
      });
      assert.strictEqual(ok, false);
      assert.strictEqual(fetched, true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects untrusted SubscribeURL without fetching', async () => {
    const originalFetch = global.fetch;
    let fetched = false;
    global.fetch = async () => {
      fetched = true;
      throw new Error('fetch should not be called');
    };

    try {
      const ok = await confirmSubscription({
        SubscribeURL: 'https://evil.example.com/?Action=ConfirmSubscription&Token=x'
      });
      assert.strictEqual(ok, false);
      assert.strictEqual(fetched, false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('confirms subscription only via trusted SNS SubscribeURL', async () => {
    const originalFetch = global.fetch;
    let fetched = false;
    global.fetch = async () => {
      fetched = true;
      return { ok: true };
    };

    try {
      const ok = await confirmSubscription({
        SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn:test&Token=x'
      });
      assert.strictEqual(ok, true);
      assert.strictEqual(fetched, true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

