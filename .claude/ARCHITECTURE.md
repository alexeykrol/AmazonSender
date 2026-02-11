# ARCHITECTURE — AmazonSender

*Framework: Claude Code Starter v4.0.1*
*Last Updated: 2026-02-11*

---

## 🎯 System Overview

Minimalistic stateless email executor for mass mailouts via Amazon SES.

**Core Principle:** One webhook request = one mailout execution attempt

---

## 🏗️ High-Level Architecture

```
Notion (UI) → Webhook → Executor → Amazon SES → Amazon SNS → Executor → Supabase
```

**Components:**

1. **Notion** — UI and content source (out of scope)
2. **Executor Service** — Stateless HTTP service (Node.js/Python)
3. **Supabase (Postgres)** — State storage
4. **Amazon SES** — Email delivery provider
5. **Amazon SNS** — Bounce/complaint event receiver

---

## 📂 Project Structure

```
AmazonSender/
├── src/
│   └── framework-core/         # Framework Python utility
│       ├── main.py             # CLI entry point
│       ├── commands/           # Cold start, completion protocols
│       ├── tasks/              # Framework background tasks
│       └── utils/              # Logging, parallel execution
│
├── executor/                   # (TBD) Application code
│   ├── server.js|py            # HTTP server
│   ├── handlers/               # Endpoint handlers
│   ├── services/               # Business logic
│   ├── db/                     # Database client
│   └── config/                 # Configuration loader
│
├── .claude/                    # Framework files
│   ├── commands/               # Slash commands
│   ├── protocols/              # Cold start, completion protocols
│   ├── SNAPSHOT.md             # Current state
│   ├── BACKLOG.md              # Active tasks
│   ├── ROADMAP.md              # Strategic plan
│   └── IDEAS.md                # Spontaneous ideas
│
├── spec_001.md                 # Complete technical specification
├── QUICK-START.md              # 5-minute setup guide
├── GET-CREDENTIALS.md          # AWS/Supabase setup
└── NOTION-WEBHOOK-SETUP.md     # Notion integration
```

---

## 📊 Data Model (Supabase/Postgres)

### subscribers

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Subscriber identifier |
| email | TEXT (unique) | Email address |
| status | TEXT | active \| unsubscribed \| bounced |
| bounce_type | TEXT | Hard/soft bounce type |
| bounce_subtype | TEXT | Detailed bounce reason |
| status_updated_at | TIMESTAMPTZ | Last status change |
| from_name | TEXT | Subscriber name (optional) |
| created_at | TIMESTAMPTZ | Registration timestamp |

**Index:** `idx_subscribers_status` on `status`

### mailouts

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Mailout identifier |
| subject | TEXT | Email subject |
| body | TEXT | Email body (HTML) |
| status | TEXT | draft \| ready \| sending \| sent \| failed |
| created_at | TIMESTAMPTZ | Creation timestamp |
| sent_at | TIMESTAMPTZ | Completion timestamp |

### send_logs (optional)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Log entry identifier |
| mailout_id | UUID (FK) | Reference to mailout |
| email | TEXT | Recipient email |
| status | TEXT | sent \| failed |
| error_message | TEXT | Error details (if failed) |
| created_at | TIMESTAMPTZ | Log timestamp |

---

## 🔄 State Machine (Critical Protection)

### Mailout State Transitions

```
draft → ready → sending → sent
                     ↘ failed
```

**Atomic transition (prevents double-sending):**

```sql
UPDATE mailouts
SET status = 'sending'
WHERE id = :mailout_id AND status = 'ready';
```

If 0 rows affected → mailout already initiated → return 409 Conflict

---

## 🌐 HTTP API

### POST /send-mailout

**Purpose:** Initiate mailout execution

**Payload:**
```json
{
  "mailout_id": "uuid",
  "auth_token": "shared-secret"
}
```

**Responses:**
- `200 OK` — Sending started/completed
- `409 Conflict` — Already sent
- `400/401` — Bad request/unauthorized

### GET /unsubscribe?token=…

**Purpose:** Process unsubscribe requests

**Behavior:**
1. Validate token
2. Extract email
3. Update subscriber status to `unsubscribed`
4. Return HTML confirmation page

### POST /ses-events

**Purpose:** Receive SNS bounce/complaint events

**Behavior:**
1. Verify SNS signature
2. Parse event (Bounce/Complaint)
3. Update subscriber status
4. Log event

---

## ⚙️ Configuration (Environment Variables)

### Required

- `EXECUTOR_SHARED_SECRET` — Webhook authentication
- `APP_BASE_URL` — Base URL for unsubscribe links
- `AWS_REGION` — SES region
- `AWS_ACCESS_KEY_ID` — AWS credentials
- `AWS_SECRET_ACCESS_KEY` — AWS credentials
- `SES_FROM_EMAIL` — Verified sender email
- `SUPABASE_URL` — Database URL
- `SUPABASE_SERVICE_ROLE_KEY` — Database key

### Optional (with defaults)

- `PORT` — HTTP port (default: 3000)
- `LOG_LEVEL` — Logging level (default: info)
- `RATE_LIMIT_PER_SEC` — Sending rate (default: 6)
- `BATCH_SIZE` — Batch size (default: 50)
- `SES_CONFIGURATION_SET` — SES config set name
- `SES_REPLY_TO` — Reply-To address
- `TEST_EMAILS` — Test mode recipient list

---

## 🚀 Execution Flow

### Mailout Sending Algorithm

1. Load mailout (subject + body) from database
2. Append unsubscribe footer with token link
3. **Atomic state transition** `ready → sending` (or fail with 409)
4. Fetch active subscribers (`status = 'active'`)
5. Send in batches:
   - Batch size: 50 emails
   - Rate limit: 5-8 emails/sec
   - Concurrency: 1 (sequential batches)
6. Log errors but don't stop entire process
7. Update mailout status to `sent` or `failed`
8. Set `sent_at` timestamp

### Rate Limiting Strategy

- Internal executor throttling (below SES limits)
- Sleep/delay between batches
- Configurable via `RATE_LIMIT_PER_SEC`
- Conservative default (6/sec) to avoid SES throttling

---

## 🔒 Security

- Shared secret authentication for webhook endpoint
- SNS signature verification for SES events
- No public endpoints without authentication
- Environment-based configuration (no hardcoded secrets)
- Token-based unsubscribe links (no email in URL)

---

## 🎯 Non-Functional Requirements

- **Stateless:** No in-memory state between requests
- **Deployment:** VPS or Docker container
- **Language:** Node.js or Python (TBD)
- **Configuration:** 100% via environment variables
- **Logging:** Structured logs for debugging
- **Idempotency:** Mailout sent exactly once

---

## 🚫 Out of Scope

- Notion configuration and setup
- Email HTML template editor
- Subscriber segmentation and funnels
- A/B testing
- Click/open tracking analytics
- CRM logic
- Marketing automation

---

## 📋 Acceptance Criteria

System is complete when:
- ✅ One mailout can be sent exactly once
- ✅ Unsubscribe and bounce correctly processed
- ✅ Amazon SES reputation maintained (no complaints)
- ✅ Executor can be triggered via webhook
- ✅ State transitions are atomic and safe

---

*Full specification: [spec_001.md](../spec_001.md)*
