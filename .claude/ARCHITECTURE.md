# ARCHITECTURE — AmazonSender

*System design and implementation details*
*Last Updated: 2026-02-10*

---

## 🏗️ Architecture Overview

**Pattern:** Stateless webhook-driven executor

**Philosophy:** Keep it simple. No complex state machines, no background workers, no message queues (yet). Each webhook request is independent.

```
┌─────────────────────────────────────────────────────────┐
│                    Three-Layer Design                    │
└─────────────────────────────────────────────────────────┘

┌─────────────┐
│   Notion    │  Content Layer (CMS + UI)
│   (Source)  │  - Email content
└──────┬──────┘  - Mailout metadata
       │         - User triggers "Send"
       │ webhook
       ↓
┌─────────────┐
│  Executor   │  Execution Layer (Node.js)
│  (Process)  │  - Fetch & render content
└──────┬──────┘  - Send emails via SES
       │         - Update status
       │
       ├────────→ ┌──────────┐
       │          │   SES    │  Delivery Layer
       │          │ (Email)  │  - Send emails
       │          └────┬─────┘  - Rate limiting
       │               │
       │               ↓
       │          ┌──────────┐
       │          │   SNS    │  Event Layer
       │          │ (Events) │  - Bounce notifications
       │          └────┬─────┘  - Complaint notifications
       │               │
       │               ↓
       ↓          ┌──────────┐
┌─────────────┐  │          │
│  Supabase   │←─┘          │  State Layer (Database)
│    (DB)     │              │  - Subscribers
└─────────────┘              │  - Status tracking
                             │  - Bounce/unsubscribe
                             └──────────────────────
```

---

## 📦 Module Structure

### Core Modules (executor/src/)

```
executor/src/
├── server.js           # HTTP server, routing (342 lines)
├── config.js           # Environment configuration (114 lines)
├── logger.js           # Logging abstraction (28 lines)
├── utils.js            # Helper functions (50 lines)
│
├── notion.js           # Notion API client (110 lines)
├── supabase.js         # Supabase client (34 lines)
├── ses.js              # AWS SES client (45 lines)
├── sns.js              # SNS signature verification (61 lines)
│
├── render.js           # Notion blocks → HTML/text (150 lines)
├── unsubscribe.js      # HMAC token crypto (32 lines)
├── notion-signature.js # Notion webhook verification (25 lines)
├── errors.js           # Error formatting (35 lines)
└── csv.js              # CSV report writer (40 lines)

Total: ~1,066 lines (13 modules)
```

### Module Responsibilities

| Module | Purpose | Dependencies |
|--------|---------|--------------|
| **server.js** | HTTP routing, request handling | All modules |
| **config.js** | Parse .env, provide config object | dotenv |
| **notion.js** | Fetch pages, update properties | @notionhq/client |
| **supabase.js** | Query subscribers, update status | @supabase/supabase-js |
| **ses.js** | Send emails via AWS SES | @aws-sdk/client-ses |
| **render.js** | Convert Notion blocks to HTML | None (pure) |
| **unsubscribe.js** | Generate/verify HMAC tokens | crypto |
| **sns.js** | Verify AWS SNS signatures | crypto, fetch |
| **utils.js** | Email validation, dedup, sleep | None (pure) |

---

## 🔄 Data Flow

### 1. Send Mailout Flow

```
User in Notion: Status = "Send"
         ↓
Notion webhook → POST /send-mailout
         ↓
┌─────────────────────────────────────────┐
│ 1. Authentication                        │
│    - Verify EXECUTOR_SHARED_SECRET       │
│    - Verify Notion signature (optional)  │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 2. Fetch Content                         │
│    - GET notion.pages.retrieve()         │
│    - GET notion.blocks.children.list()   │
│    - Extract: subject, status, test flag │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 3. Render HTML/Text                      │
│    - renderBlocks(blocks)                │
│    - Convert: paragraphs, headings, etc. │
│    - Escape HTML entities                │
│    - Track unsupported blocks            │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 4. Fetch Recipients                      │
│    - Test mode: use TEST_EMAILS          │
│    - Prod mode: SELECT * FROM subscribers│
│                 WHERE status='active'    │
│    - Deduplicate emails                  │
│    - Validate email format               │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 5. Send Batch (Rate Limited)             │
│    FOR EACH recipient (sequential):      │
│      - Generate unsubscribe token (HMAC) │
│      - Add footer with unsub link        │
│      - sendEmail(ses, params)            │
│      - appendCsvRow(status)              │
│      - sleep(200ms) ← Rate limit         │
│    END FOR                               │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 6. Update Notion                         │
│    - Status = "Sent" (or "Failed")       │
│    - Sent Count, Failed Count            │
│    - Sent At timestamp                   │
│    - Bounce Rate, Unsub Rate (0 initially)│
└─────────────────────────────────────────┘
         ↓
Return: { ok: true, sent: N, failed: M }
```

### 2. Unsubscribe Flow

```
User clicks: https://executor.app/unsubscribe?token=xxx
         ↓
GET /unsubscribe?token=xxx
         ↓
┌─────────────────────────────────────────┐
│ 1. Verify Token                          │
│    - Parse token (payload.signature)     │
│    - Verify HMAC-SHA256 signature        │
│    - Extract email from payload          │
│    - Timing-safe comparison              │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 2. Update Subscriber                     │
│    UPDATE subscribers                    │
│    SET status='unsubscribed',            │
│        status_updated_at=NOW()           │
│    WHERE email=?                         │
└─────────────────────────────────────────┘
         ↓
Return: HTML confirmation page
```

### 3. Bounce/Complaint Flow

```
AWS SES detects bounce/complaint
         ↓
AWS SNS → POST /ses-events
         ↓
┌─────────────────────────────────────────┐
│ 1. Verify SNS Signature                 │
│    - Fetch signing certificate          │
│    - Build stringToSign                  │
│    - Verify RSA-SHA1 signature           │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 2. Handle Subscription Confirmation      │
│    IF Type = "SubscriptionConfirmation": │
│      - GET SubscribeURL                  │
│      - Return { confirmed: true }        │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 3. Process Notification                  │
│    Parse Message JSON:                   │
│      - notificationType (Bounce/Complaint)│
│      - mail.destination[0] (email)       │
│      - bounce.bounceType (Hard/Soft)     │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ 4. Update Subscriber Status              │
│    Bounce → status='bounced'             │
│    Complaint → status='unsubscribed'     │
└─────────────────────────────────────────┘
```

---

## 🔐 Security Mechanisms

### 1. Authentication Layers

```
Layer 1: Shared Secret
  - Header: X-Auth-Token
  - Body: auth_token
  - Optional (if EXECUTOR_SHARED_SECRET set)

Layer 2: Notion Webhook Signature
  - Header: X-Notion-Signature
  - HMAC-SHA256 of request body
  - Optional (if NOTION_WEBHOOK_VERIFICATION_TOKEN set)

Layer 3: SNS Message Signature
  - RSA-SHA1 with AWS certificate
  - Mandatory for /ses-events
```

### 2. Unsubscribe Token Security

```javascript
// Token format: base64url(email).hmac-sha256(payload, secret)

createUnsubToken('user@example.com', secret)
// → "dXNlckBleGFtcGxlLmNvbQ.Xy9zb21lLXNpZ25hdHVyZQ"

// Verification uses timing-safe comparison
crypto.timingSafeEqual(sigBuf, expBuf) // Prevents timing attacks
```

### 3. Idempotency Guard

```javascript
if (meta.status === 'Sent' || meta.sentAt) {
  return 409 Conflict; // Already sent
}
```

Prevents double-sends even if webhook fires twice.

---

## 📊 Configuration

### Required Environment Variables

```bash
# Notion
NOTION_API_TOKEN=secret_xxx
NOTION_DB_MAILOUTS_ID=xxx
NOTION_DB_ERRORS_ID=xxx

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Email
SES_FROM_EMAIL=noreply@domain.com
ORG_NAME=Your Company
ORG_ADDRESS=123 Main St, City, State
UNSUBSCRIBE_SECRET=random-64-char-secret

# Optional
PORT=3000
RATE_LIMIT_PER_SEC=5
BATCH_SIZE=50
TEST_EMAILS=test1@example.com,test2@example.com
```

---

## 🎨 Design Decisions

### Why Stateless?

**Pros:**
- Simple deployment (no worker management)
- Easy to scale horizontally
- No state synchronization issues
- Crash-safe (no lost state)

**Cons:**
- Each request independent (can't pause/resume)
- Long sends block HTTP connection
- No priority queue

**Decision:** For MVP with low volume (< 10k emails), stateless is simpler.

### Why Sequential Sending?

**Current:**
```javascript
for (const recipient of batch) {
  await sendEmail(...);
  await sleep(200ms); // Rate limit
}
```

**Pros:**
- Simple rate limiting
- Predictable throughput (5/sec)

**Cons:**
- Slow for large lists (1000 emails = 3.3 minutes)

**Future:** Migrate to parallel with p-limit (v0.2.0)

### Why CSV Reporting?

**Pros:**
- Simple to generate
- Easy to parse
- Works offline

**Cons:**
- Not queryable
- No real-time updates

**Future:** Consider database reporting table (v0.3.0)

---

## 🔧 Technology Choices

| Category | Technology | Why? |
|----------|-----------|------|
| **Runtime** | Node.js | Best AWS SDK support, async I/O |
| **Framework** | Express | Simple, battle-tested, good docs |
| **Email** | AWS SES | Reliable, cheap ($0.10/1000), good deliverability |
| **CMS** | Notion | Already familiar, good API, free |
| **Database** | Supabase | Postgres, real-time, generous free tier |
| **Language** | JavaScript | Faster MVP than TypeScript (for now) |

---

## 📈 Performance Characteristics

### Current Throughput

- **Rate:** 5 emails/sec (configurable)
- **Batch:** 50 emails/batch
- **Time:** 1,000 emails in ~200 seconds (3.3 minutes)

### Bottlenecks

1. **Sequential sending** - Only one SES call at a time
2. **CSV writes** - Synchronous I/O blocks event loop
3. **No connection pooling** - New HTTP connections each request

### Optimization Opportunities

- Parallel sending with rate limiter: 5x speedup
- Async CSV writes: No blocking
- Connection pooling: Faster API calls

---

## 🧪 Testing Strategy (Planned)

```
__tests__/
├── unit/
│   ├── unsubscribe.test.js    # Token crypto
│   ├── render.test.js          # HTML rendering
│   ├── sns.test.js             # Signature verification
│   └── utils.test.js           # Email validation
├── integration/
│   ├── notion.test.js          # API mocking
│   ├── supabase.test.js        # Database queries
│   └── ses.test.js             # Email sending
└── e2e/
    └── send-mailout.test.js    # Full flow with test DB
```

**Target:** 80%+ coverage for v0.2.0

---

*For implementation details, see source code in `executor/src/`*
