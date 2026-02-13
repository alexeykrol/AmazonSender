const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../src/server');

function makeBaseConfig() {
  return {
    executorSharedSecret: null,
    logLevel: 'error',
    notion: {
      token: null,
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
    supabase: {
      url: '',
      serviceRoleKey: '',
      projectRef: ''
    },
    aws: {},
    footer: {
      orgName: 'Test Org',
      orgAddress: 'Test Address',
      unsubscribeBaseUrl: 'http://localhost/unsubscribe',
      unsubscribeSecret: 'test-secret'
    },
    ses: {
      fromEmail: 'test@example.com',
      rateLimitPerSec: 100,
      batchSize: 10
    },
    testEmails: ['test@example.com'],
    csvOutputDir: '/tmp',
    runtime: { dryRunSend: true }
  };
}

function createSupabaseStub() {
  const updates = [];
  return {
    updates,
    from: () => ({
      upsert: (payload) => ({
        select: async () => {
          updates.push({ payload, email: payload.email });
          return { data: [{ ...payload }], error: null };
        }
      }),
      update: (payload) => ({
        eq: async (_field, value) => {
          updates.push({ payload: { email: value, ...payload }, email: value });
          return { data: [{ email: value, ...payload }], error: null };
        }
      })
    })
  };
}

function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ statusCode: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function postRaw(port, path, raw, contentType = 'text/plain') {
  return new Promise((resolve, reject) => {
    const payload = String(raw);
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let responseRaw = '';
      res.on('data', (chunk) => { responseRaw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(responseRaw) });
        } catch {
          resolve({ statusCode: res.statusCode, body: responseRaw });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('POST /ses-events', () => {
  it('rejects invalid SNS signature', async () => {
    const app = createApp({
      config: makeBaseConfig(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      supabase: createSupabaseStub(),
      verifySnsSignature: async () => false
    });
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await postJson(port, '/ses-events', { Type: 'Notification', Message: '{}' });
      assert.strictEqual(response.statusCode, 401);
      assert.deepStrictEqual(response.body, { error: 'invalid_sns_signature' });
    } finally {
      server.close();
    }
  });

  it('confirms SNS subscription', async () => {
    let confirmed = false;
    const app = createApp({
      config: makeBaseConfig(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      supabase: createSupabaseStub(),
      verifySnsSignature: async () => true,
      confirmSubscription: async () => { confirmed = true; }
    });
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const response = await postJson(port, '/ses-events', { Type: 'SubscriptionConfirmation' });
      assert.strictEqual(response.statusCode, 200);
      assert.deepStrictEqual(response.body, { ok: true, confirmed: true });
      assert.strictEqual(confirmed, true);
    } finally {
      server.close();
    }
  });

  it('marks bounced recipient on Bounce event', async () => {
    const supabase = createSupabaseStub();
    const app = createApp({
      config: makeBaseConfig(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      supabase,
      verifySnsSignature: async () => true
    });
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const message = {
        Type: 'Notification',
        Message: JSON.stringify({
          notificationType: 'Bounce',
          mail: { destination: ['bounced@example.com'] },
          bounce: { bounceType: 'Permanent', bounceSubType: 'General' }
        })
      };
      const response = await postJson(port, '/ses-events', message);
      assert.strictEqual(response.statusCode, 200);
      assert.deepStrictEqual(response.body, { ok: true });
      assert.strictEqual(supabase.updates.length, 1);
      assert.strictEqual(supabase.updates[0].email, 'bounced@example.com');
      assert.strictEqual(supabase.updates[0].payload.status, 'bounced');
      assert.strictEqual(supabase.updates[0].payload.bounce_type, 'Permanent');
      assert.strictEqual(supabase.updates[0].payload.bounce_subtype, 'General');
      assert.ok(supabase.updates[0].payload.status_updated_at);
    } finally {
      server.close();
    }
  });

  it('marks recipient unsubscribed on Complaint event', async () => {
    const supabase = createSupabaseStub();
    const app = createApp({
      config: makeBaseConfig(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      supabase,
      verifySnsSignature: async () => true
    });
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const message = {
        Type: 'Notification',
        Message: JSON.stringify({
          notificationType: 'Complaint',
          mail: { destination: ['complaint@example.com'] }
        })
      };
      const response = await postJson(port, '/ses-events', message);
      assert.strictEqual(response.statusCode, 200);
      assert.deepStrictEqual(response.body, { ok: true });
      assert.strictEqual(supabase.updates.length, 1);
      assert.strictEqual(supabase.updates[0].email, 'complaint@example.com');
      assert.strictEqual(supabase.updates[0].payload.status, 'unsubscribed');
      assert.ok(supabase.updates[0].payload.status_updated_at);
    } finally {
      server.close();
    }
  });

  it('accepts SNS payload sent as text/plain', async () => {
    const supabase = createSupabaseStub();
    const app = createApp({
      config: makeBaseConfig(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      supabase,
      verifySnsSignature: async () => true
    });
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const raw = JSON.stringify({
        Type: 'Notification',
        Message: JSON.stringify({
          notificationType: 'Bounce',
          mail: { destination: ['plaintext@example.com'] },
          bounce: { bounceType: 'Permanent', bounceSubType: 'General' }
        })
      });
      const response = await postRaw(port, '/ses-events', raw, 'text/plain');
      assert.strictEqual(response.statusCode, 200);
      assert.deepStrictEqual(response.body, { ok: true });
      assert.strictEqual(supabase.updates.length, 1);
      assert.strictEqual(supabase.updates[0].email, 'plaintext@example.com');
    } finally {
      server.close();
    }
  });
});
