# AmazonSender Quick Start

## 🚀 5-Minute Setup

### 1. Supabase (2 min)

```sql
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  bounce_type TEXT,
  bounce_subtype TEXT,
  status_updated_at TIMESTAMPTZ,
  from_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscribers_status ON subscribers(status);
```

### 2. Notion Databases (2 min)

**"Письма"**: Name (title), Status (select: Not started/In progress/Done/Send/Send real/Reset), Test (checkbox), Sent At (date), Sent Count (number), Delivered Count (number)

**"Ошибки"**: Name (title), Timestamp (date), Mailout ID (text), Error Message (text)

### 3. AWS SES (1 min)

```bash
aws ses verify-email-identity --email-address your@email.com
```

Check email → click verification link

### 4. Configure (1 min)

```bash
cd executor
cp .env.example .env
# Edit .env with your credentials
npm install
npm start
```

### 5. Test (30 sec)

```bash
curl http://localhost:3000/health
# Expected: {"ok": true}
```

Create test mailout in Notion → Status = Send → Check TEST_EMAILS inbox

---

## 📋 Essential .env Variables

```env
NOTION_API_TOKEN=secret_xxx
NOTION_DB_MAILOUTS_ID=xxx
NOTION_DB_ERRORS_ID=xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
SES_FROM_EMAIL=noreply@yourdomain.com
TEST_EMAILS=test1@example.com,test2@example.com
```

---

## Next Steps

- **User Guide:** [README.md](README.md) - Step-by-step instructions for non-technical users
- **Technical Docs:** [executor/README.md](executor/README.md) - API endpoints, database schemas, deployment
- **Credentials:** [GET-CREDENTIALS.md](GET-CREDENTIALS.md) - How to get AWS, Notion, and Supabase credentials
