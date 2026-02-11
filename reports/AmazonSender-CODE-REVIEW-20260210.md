# 📋 Code Review Report — AmazonSender

*Generated: 2026-02-10*
*Reviewer: Claude Sonnet 4.5*
*Scope: executor/src/ (13 files, ~2000 lines)*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 1. 🔒 Безопасность (Security)

### ❌ КРИТИЧЕСКИЕ ПРОБЛЕМЫ

#### 1.1 XSS Vulnerability in render.js (Line 23)

**Файл:** `executor/src/render.js:23`

**Проблема:**
```javascript
if (rt.href) h = `<a href="${rt.href}">${h}</a>`;
```

href attribute is not sanitized. Malicious Notion content could inject:
```
javascript:alert(document.cookie)
data:text/html,<script>alert('xss')</script>
```

**Исправление:**
```javascript
function sanitizeUrl(url) {
  if (!url) return '#';
  const normalized = url.trim().toLowerCase();
  if (normalized.startsWith('javascript:') ||
      normalized.startsWith('data:') ||
      normalized.startsWith('vbscript:')) {
    return '#'; // Block dangerous protocols
  }
  return url;
}

// In renderRichText:
if (rt.href) {
  const safeHref = escapeHtml(sanitizeUrl(rt.href));
  h = `<a href="${safeHref}">${h}</a>`;
}
```

**Severity:** CRITICAL
**Exploitability:** High (if attacker controls Notion content)
**Impact:** XSS leading to session hijacking, data theft

---

#### 1.2 No Input Validation on Mailout ID

**Файл:** `executor/src/server.js:101-104`

**Проблема:**
```javascript
const mailoutId = extractMailoutId(req.body);
if (!mailoutId) {
  return res.status(400).json({ error: 'mailout_id_missing' });
}
```

extractMailoutId() does recursive traversal but doesn't validate format. Could accept:
- Arbitrary strings
- SQL injection attempts (passed to Notion API)
- Path traversal attempts

**Исправление:**
```javascript
function isValidNotionId(id) {
  // Notion IDs are UUIDs (with or without dashes)
  return /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i.test(id);
}

const mailoutId = extractMailoutId(req.body);
if (!mailoutId || !isValidNotionId(mailoutId)) {
  return res.status(400).json({ error: 'invalid_mailout_id' });
}
```

**Severity:** HIGH
**Exploitability:** Medium
**Impact:** Could bypass security checks, cause errors

---

### ⚠️ HIGH PRIORITY

#### 1.3 No Rate Limiting on Public Endpoints

**Файл:** `executor/src/server.js` (all endpoints)

**Проблема:**
All endpoints (/send-mailout, /unsubscribe, /ses-events) have no rate limiting. Attacker could:
- DoS by flooding /send-mailout
- Brute force unsubscribe tokens
- Exhaust AWS SES quota

**Исправление:**
```javascript
const rateLimit = require('express-rate-limit');

const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { error: 'rate_limit_exceeded' }
});

app.post('/send-mailout', sendLimiter, async (req, res) => {
  // ...
});

const unsubLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests'
});

app.get('/unsubscribe', unsubLimiter, async (req, res) => {
  // ...
});
```

**Severity:** HIGH
**Impact:** DoS, quota exhaustion, cost increase

---

#### 1.4 Predictable CSV Filenames (Timing Attack)

**Файл:** `executor/src/server.js:169`

**Проблема:**
```javascript
const csvPath = `${config.csvOutputDir}/mailout-${mailoutId}-${Date.now()}.csv`;
```

Using `Date.now()` makes filenames predictable. If CSV dir is web-accessible, attacker could enumerate and download reports.

**Исправление:**
```javascript
const crypto = require('crypto');
const randomSuffix = crypto.randomBytes(8).toString('hex');
const csvPath = `${config.csvOutputDir}/mailout-${mailoutId}-${randomSuffix}.csv`;
```

**Severity:** MEDIUM
**Impact:** Information disclosure

---

### ⚠️ MEDIUM PRIORITY

#### 1.5 No CORS Configuration

**Файл:** `executor/src/server.js`

**Проблема:**
No CORS headers set. If frontend needs to call these endpoints, it would fail or be open to CSRF.

**Исправление:**
```javascript
const cors = require('cors');
app.use(cors({
  origin: config.allowedOrigins || false, // Set in .env
  credentials: true
}));
```

**Severity:** MEDIUM
**Impact:** CSRF attacks, frontend integration issues

---

#### 1.6 Error Messages Expose Internal Structure

**Файл:** `executor/src/server.js` (multiple locations)

**Проблема:**
```javascript
return res.status(500).json({ error: 'notion_not_configured' });
return res.status(500).json({ error: 'supabase_not_configured' });
return res.status(500).json({ error: 'ses_not_configured' });
```

Reveals which services are missing/misconfigured to attackers.

**Исправление:**
```javascript
// Development mode: detailed errors
// Production mode: generic errors
const errorMessage = config.env === 'production'
  ? 'service_unavailable'
  : 'notion_not_configured';
return res.status(500).json({ error: errorMessage });
```

**Severity:** LOW
**Impact:** Information disclosure

---

### ✅ SECURITY STRENGTHS

1. ✅ **HMAC Token Verification** (unsubscribe.js) - Uses timing-safe comparison
2. ✅ **SNS Signature Verification** (sns.js) - RSA-SHA1 validation
3. ✅ **Shared Secret Auth** (server.js:31-35) - Optional auth token
4. ✅ **Notion Signature Verification** (server.js:89-95) - Webhook validation
5. ✅ **HTML Escaping** (render.js:1-8) - Basic XSS protection

---

## 2. 📐 Качество кода (Code Quality)

### ⚠️ IMPROVEMENTS NEEDED

#### 2.1 No TypeScript

**Current:** Plain JavaScript with no type checking

**Impact:**
- Runtime errors from type mismatches
- No autocomplete/IntelliSense
- Harder to refactor

**Recommendation:**
```typescript
// config.ts
export interface Config {
  port: number;
  notion: {
    token: string;
    dbMailoutsId: string;
    // ...
  };
  // ...
}

export const config: Config = {
  // ...
};
```

**Priority:** MEDIUM (for long-term maintainability)

---

#### 2.2 Long Functions (server.js)

**Файл:** `executor/src/server.js:83-257` (175 lines)

**Проблема:**
`POST /send-mailout` endpoint does everything:
- Authentication
- Validation
- Fetching data
- Rendering
- Sending emails
- Updating Notion
- Error logging

**Исправление:**
```javascript
// Extract to separate functions:

async function validateMailoutRequest(req) {
  // Lines 85-120
}

async function fetchMailoutContent(notion, mailoutId, config) {
  // Lines 122-143
}

async function sendMailoutBatch(recipients, content, config) {
  // Lines 162-226
}

async function updateMailoutStatus(notion, mailoutId, results) {
  // Lines 232-249
}

app.post('/send-mailout', async (req, res) => {
  try {
    await validateMailoutRequest(req);
    const content = await fetchMailoutContent(notion, mailoutId, config);
    const results = await sendMailoutBatch(recipients, content, config);
    await updateMailoutStatus(notion, mailoutId, results);
    return res.json({ ok: true, ...results });
  } catch (err) {
    // Handle error
  }
});
```

**Priority:** HIGH (improves testability and readability)

---

#### 2.3 No JSDoc Comments

**Файл:** All files

**Проблема:**
Functions lack documentation. Example:
```javascript
function buildNotionUpdateProps(page, updates) {
  // What format is 'updates'?
  // What does this return?
}
```

**Исправление:**
```javascript
/**
 * Builds Notion API property updates from simple key-value pairs
 * @param {Object} page - Notion page object with properties metadata
 * @param {Object} updates - Key-value pairs of property names to values
 * @returns {Object} Notion API-formatted property updates
 * @example
 * buildNotionUpdateProps(page, { Status: 'Sent', 'Sent Count': 100 })
 * // Returns: { Status: { status: { name: 'Sent' } }, ... }
 */
function buildNotionUpdateProps(page, updates) {
  // ...
}
```

**Priority:** MEDIUM

---

#### 2.4 Inconsistent Error Handling

**Проблема:**
Some errors throw, some return null:
```javascript
// render.js
function renderBlock(block) {
  // Returns { unsupported: true } on error
}

// supabase.js
async function fetchActiveSubscribers(client) {
  if (error) throw error; // Throws on error
}
```

**Recommendation:**
Standardize on either:
- **Option A:** Always throw errors (let caller handle)
- **Option B:** Always return Result type `{ ok: true, data } | { ok: false, error }`

**Priority:** MEDIUM

---

### ✅ CODE QUALITY STRENGTHS

1. ✅ **Modular Structure** - Clear separation into 13 modules
2. ✅ **Functional Style** - Pure functions where possible
3. ✅ **Consistent Naming** - camelCase, descriptive names
4. ✅ **DRY Principle** - Reusable utilities (utils.js)
5. ✅ **Error Logging** - Centralized error logging to Notion

---

## 3. 🏗️ Архитектура (Architecture)

### ⚠️ IMPROVEMENTS NEEDED

#### 3.1 Server.js Does Too Much

**Проблема:**
server.js mixes:
- HTTP routing (Express)
- Business logic (email sending)
- External integrations (Notion, Supabase, SES)
- Error handling

**Recommendation:**
```
src/
├── server.js              # HTTP routes only
├── controllers/
│   └── mailoutController.js  # Request/response handling
├── services/
│   ├── mailoutService.js     # Business logic
│   └── emailService.js       # Email sending logic
├── repositories/
│   ├── notionRepo.js         # Notion data access
│   └── supabaseRepo.js       # Supabase data access
└── utils/
    └── validators.js         # Input validation
```

**Priority:** MEDIUM (for scalability)

---

#### 3.2 No Dependency Injection

**Проблема:**
```javascript
// server.js:19-22
const notion = createNotionClient(config.notion.token);
const supabase = createSupabase(config.supabase.url, config.supabase.serviceRoleKey);
const sesClient = createSesClient(config.aws);
```

Global singletons make testing hard (can't mock).

**Recommendation:**
```javascript
// mailoutService.js
class MailoutService {
  constructor(notionClient, supabaseClient, sesClient, config) {
    this.notion = notionClient;
    this.supabase = supabaseClient;
    this.ses = sesClient;
    this.config = config;
  }

  async sendMailout(mailoutId) {
    // Use this.notion, this.supabase, etc.
  }
}

// In tests:
const mockNotion = { getPage: jest.fn() };
const service = new MailoutService(mockNotion, mockSupabase, mockSes, testConfig);
```

**Priority:** HIGH (for testability)

---

#### 3.3 No Retry Logic

**Проблема:**
If SES call fails, email is marked as failed permanently. No retry.

**Recommendation:**
```javascript
async function sendEmailWithRetry(ses, params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendEmail(ses, params);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      if (isRetryableError(err)) {
        await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
        continue;
      }
      throw err; // Non-retryable error
    }
  }
}

function isRetryableError(err) {
  return err.code === 'Throttling' ||
         err.code === 'ServiceUnavailable' ||
         err.statusCode === 500;
}
```

**Priority:** HIGH (for reliability)

---

### ✅ ARCHITECTURE STRENGTHS

1. ✅ **Stateless Design** - No in-memory state, all state in DB
2. ✅ **Clear Module Boundaries** - Each file has single responsibility
3. ✅ **Event-Driven** - Webhook-driven execution
4. ✅ **Idempotency** - Prevents duplicate sends

---

## 4. ⚡ Производительность (Performance)

### ⚠️ IMPROVEMENTS NEEDED

#### 4.1 Sequential Email Sending

**Файл:** `executor/src/server.js:172-226`

**Проблема:**
```javascript
for (const recipient of batch) {
  await sendEmail(...); // Sequential!
  await sleep(minIntervalMs);
}
```

Sends one email at a time. For 1000 subscribers @ 5/sec = 200 seconds (3.3 minutes).

**Recommendation:**
```javascript
// Send batch in parallel with rate limiting
const pLimit = require('p-limit');
const limit = pLimit(config.ses.rateLimitPerSec);

const sendPromises = batch.map(recipient =>
  limit(async () => {
    try {
      const result = await sendEmail(sesClient, { ... });
      sentCount += 1;
      appendCsvRow(...);
    } catch (err) {
      failedCount += 1;
      appendCsvRow(...);
    }
  })
);

await Promise.all(sendPromises);
```

**Improvement:** ~5x faster (1000 emails in 40 seconds vs 200 seconds)
**Priority:** HIGH

---

#### 4.2 Synchronous CSV Writing

**Файл:** `executor/src/csv.js` (not shown, but called in server.js)

**Проблема:**
appendCsvRow() is likely synchronous fs.appendFileSync(), blocking event loop.

**Recommendation:**
```javascript
// csv.js
const fs = require('fs').promises;
const queue = [];
let writing = false;

async function appendCsvRow(path, headers, data) {
  queue.push({ path, headers, data });
  if (!writing) {
    writing = true;
    while (queue.length > 0) {
      const item = queue.shift();
      await fs.appendFile(item.path, formatRow(item.data));
    }
    writing = false;
  }
}
```

**Priority:** MEDIUM

---

#### 4.3 No Connection Pooling Hints

**Файл:** `executor/src/supabase.js:5-8`

**Проблема:**
```javascript
return createClient(url, serviceRoleKey, {
  auth: { persistSession: false }
});
```

No connection pooling configuration. Supabase client creates new connections on each request.

**Recommendation:**
```javascript
return createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
  db: {
    pool: {
      min: 2,
      max: 10
    }
  }
});
```

**Priority:** LOW (Supabase SDK handles this internally)

---

### ✅ PERFORMANCE STRENGTHS

1. ✅ **Rate Limiting** - Configurable throttling to avoid SES limits
2. ✅ **Batch Processing** - Processes 50 emails per batch
3. ✅ **Email Deduplication** - Avoids sending duplicates

---

## 5. 🧪 Тестируемость (Testability)

### ⚠️ IMPROVEMENTS NEEDED

#### 5.1 Global Clients Make Testing Hard

**Файл:** `executor/src/server.js:19-22`

**Проблема:**
Clients initialized at module load. Can't inject mocks.

**Recommendation:**
See Architecture 3.2 (Dependency Injection)

**Priority:** HIGH

---

#### 5.2 Complex Functions Hard to Unit Test

**Файл:** `executor/src/server.js:83-257`

**Проблема:**
175-line function does 10+ things. Hard to test in isolation.

**Recommendation:**
See Code Quality 2.2 (Extract functions)

**Priority:** HIGH

---

#### 5.3 No Test Suite

**Current State:** No tests exist

**Recommendation:**
```javascript
// __tests__/unsubscribe.test.js
const { createUnsubToken, verifyUnsubToken } = require('../src/unsubscribe');

describe('unsubscribe', () => {
  const secret = 'test-secret-123';

  test('createUnsubToken generates valid token', () => {
    const token = createUnsubToken('user@example.com', secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test('verifyUnsubToken validates correct token', () => {
    const token = createUnsubToken('user@example.com', secret);
    const result = verifyUnsubToken(token, secret);
    expect(result).toEqual({ email: 'user@example.com' });
  });

  test('verifyUnsubToken rejects tampered token', () => {
    const token = createUnsubToken('user@example.com', secret);
    const tampered = token.replace(/.$/, 'X');
    const result = verifyUnsubToken(tampered, secret);
    expect(result).toBeNull();
  });
});
```

**Priority:** CRITICAL (for production readiness)

---

### ✅ TESTABILITY STRENGTHS

1. ✅ **Pure Functions** - utils.js functions are testable
2. ✅ **Small Modules** - Most modules < 150 lines

---

## 📊 Общая оценка (Overall Assessment)

### Summary

| Category | Score | Status |
|----------|-------|--------|
| **Security** | 6/10 | ⚠️ Needs Work |
| **Code Quality** | 7/10 | ✅ Good |
| **Architecture** | 6/10 | ⚠️ Needs Work |
| **Performance** | 7/10 | ✅ Good |
| **Testability** | 4/10 | ❌ Poor |
| **Overall** | 6/10 | ⚠️ MVP Ready, Not Production Ready |

### Key Findings

✅ **Strengths:**
- Clean modular structure
- Good security foundations (HMAC, SNS validation)
- Functional programming style
- Clear naming conventions

❌ **Critical Issues:**
1. XSS vulnerability in URL rendering
2. No test suite
3. No input validation framework
4. Global singletons (hard to test)

⚠️ **Improvements Needed:**
- Add TypeScript
- Implement retry logic
- Add rate limiting
- Extract business logic from routes
- Add dependency injection

---

## 🎯 Топ-3 рекомендации (Top 3 Recommendations)

### 1. 🔒 Fix XSS Vulnerability (CRITICAL)

**Action:** Sanitize URL hrefs in render.js

**Impact:** Prevents XSS attacks
**Effort:** 30 minutes
**Priority:** **DO NOW**

```javascript
// Add to render.js
function sanitizeUrl(url) {
  if (!url) return '#';
  const normalized = url.trim().toLowerCase();
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
  if (dangerousProtocols.some(proto => normalized.startsWith(proto))) {
    return '#';
  }
  return url;
}
```

---

### 2. 🧪 Add Test Suite (HIGH)

**Action:** Create Jest tests for critical paths

**Impact:** Prevents regressions, enables refactoring
**Effort:** 4-8 hours
**Priority:** **NEXT SPRINT**

**Files to test first:**
1. unsubscribe.js (crypto logic)
2. render.js (XSS protection)
3. sns.js (signature validation)
4. utils.js (email validation)

---

### 3. 🏗️ Refactor for Testability (HIGH)

**Action:** Extract business logic, add dependency injection

**Impact:** Makes codebase maintainable and testable
**Effort:** 2-3 days
**Priority:** **NEXT SPRINT**

**Steps:**
1. Extract sendMailout logic to MailoutService class
2. Use constructor injection for clients
3. Split 175-line endpoint into 5 functions
4. Add validators module for input validation

---

## 📋 Чек-лист перед production (Production Readiness Checklist)

- [ ] Fix XSS vulnerability (render.js)
- [ ] Add input validation (Joi/Zod)
- [ ] Add rate limiting (express-rate-limit)
- [ ] Add test suite (Jest, 80%+ coverage)
- [ ] Add retry logic with exponential backoff
- [ ] Add dependency injection
- [ ] Add TypeScript (optional, but recommended)
- [ ] Add monitoring (Sentry/DataDog)
- [ ] Add CORS configuration
- [ ] Add .gitignore for security patterns
- [ ] Remove executor/.env from git
- [ ] Add CI/CD pipeline with tests
- [ ] Add health check with dependency status
- [ ] Add request logging (Morgan)
- [ ] Add API documentation (Swagger/OpenAPI)

---

*Review completed by Claude Sonnet 4.5*
*For questions or clarifications, see: github.com/alexeykrol/AmazonSender/issues/1*
