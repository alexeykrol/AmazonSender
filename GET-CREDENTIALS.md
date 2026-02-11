# How to Get Credentials

Quick reference for obtaining all required credentials.

---

## 🔷 Notion

### NOTION_API_TOKEN

1. Go to https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Name: "AmazonSender"
4. Associated workspace: Select your workspace
5. Click **"Submit"**
6. Copy **"Internal Integration Token"** → This is your `NOTION_API_TOKEN`

Format: `secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### NOTION_DB_MAILOUTS_ID & NOTION_DB_ERRORS_ID

1. Open Notion Database in browser
2. Click **"Share"** button (top right)
3. Click **"Copy link"**
4. Link format: `https://www.notion.so/{workspace}/{DATABASE_ID}?v=...`
5. Extract `DATABASE_ID` from URL

Format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 characters, no dashes)

Example URL: `https://www.notion.so/myworkspace/12345678901234567890123456789012?v=abc`
→ Database ID: `12345678901234567890123456789012`

**Important**: After creating your integration, you must **share both databases** with it:
1. Open database → Click "..." (top right)
2. Scroll to "Connections"
3. Click "Add connections"
4. Select "AmazonSender" integration

---

## 🔷 Supabase

### SUPABASE_URL

1. Open https://supabase.com/dashboard/projects
2. Select your project
3. Go to **Settings** → **API**
4. Copy **"Project URL"**

Format: `https://xxxxxxxxxxxxx.supabase.co`

### SUPABASE_SERVICE_ROLE_KEY

1. Same page: **Settings** → **API**
2. Under "Project API keys"
3. Copy **"service_role"** key (NOT "anon public"!)
4. Click "Reveal" to see the key

Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long JWT token)

⚠️ **Important**: Use `service_role` key, NOT `anon` key! Service role key has full database access.

---

## 🔷 AWS SES

### AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY

#### Option A: Create IAM User (Recommended for production)

1. AWS Console → **IAM** → **Users** → **Create user**
2. User name: "amazon-sender-ses"
3. Attach policies:
   - `AmazonSESFullAccess` (or custom policy with SendEmail, SendRawEmail)
4. Click **"Create user"**
5. Go to **Security credentials** tab
6. Click **"Create access key"**
7. Use case: "Application running outside AWS"
8. Copy **Access key ID** and **Secret access key**

Format:
- Access Key ID: `AKIA...` (20 characters)
- Secret Access Key: `xxxxx...` (40 characters)

#### Option B: Use Root Account (Quick testing only)

1. AWS Console → Your account name (top right) → **Security credentials**
2. Scroll to "Access keys"
3. Click **"Create access key"**
4. Acknowledge best practices
5. Copy keys

⚠️ **Not recommended for production!** Use IAM user instead.

### AWS_REGION

The region where your SES is configured.

Common values:
- `us-east-1` (N. Virginia)
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)

To check: AWS Console → SES → Look at top right corner for region

### SES_FROM_EMAIL

The email address you want to send FROM.

**Requirements**:
1. Must be verified in SES
2. In sandbox mode: both FROM and TO must be verified

**To verify**:
```bash
aws ses verify-email-identity --email-address your@email.com --region us-east-1
```

Or via console:
1. AWS Console → SES → **Verified identities**
2. Click **"Create identity"**
3. Choose **"Email address"**
4. Enter email → Click **"Create identity"**
5. Check inbox → Click verification link

Format: `noreply@yourdomain.com` or `your@email.com`

### FROM_NAME

Display name shown in email client.

Example: `"Your Company"` or `"John from Company"`

---

## 🔷 Testing

### TEST_EMAILS

Comma-separated list of emails for test mode.

**Requirements**:
- If SES in sandbox mode: these emails must be verified
- Separate multiple emails with commas (no spaces)

Format: `test1@example.com,test2@example.com,admin@company.com`

**To verify test emails**:
```bash
aws ses verify-email-identity --email-address test1@example.com
aws ses verify-email-identity --email-address test2@example.com
```

---

## 🔷 Organization Info (CAN-SPAM Compliance)

### ORG_NAME

Your organization's legal name.

Example: `"ACME Corporation"` or `"John Doe Consulting"`

### ORG_ADDRESS

Your physical mailing address (required by CAN-SPAM Act).

Format: `"123 Main Street, Suite 100, City, State 12345, Country"`

Example: `"742 Evergreen Terrace, Springfield, OR 97475, United States"`

---

## 🔷 Unsubscribe

### UNSUBSCRIBE_SECRET

Random secret key for generating unsubscribe tokens.

**Generate**:
```bash
openssl rand -hex 32
```

Or online: https://generate-random.org/api-key-generator (64 chars)

Format: Any random string, at least 32 characters

Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

⚠️ **Important**: Keep this secret! Anyone with this can generate valid unsubscribe tokens.

### UNSUBSCRIBE_BASE_URL

Base URL for unsubscribe endpoint.

**Local development**: `http://localhost:3000/unsubscribe`
**Production**: `https://yourdomain.com/unsubscribe`

---

## 🔷 Quick Checklist

Before filling `.env`, make sure you have:

- [ ] Created Notion integration
- [ ] Created 2 Notion databases (Mailouts, Errors)
- [ ] Shared both databases with integration
- [ ] Created Supabase project
- [ ] Created `subscribers` table in Supabase
- [ ] Created IAM user in AWS with SES permissions
- [ ] Verified FROM email in SES
- [ ] Verified test emails in SES (if sandbox mode)
- [ ] Generated unsubscribe secret

---

## 🧪 Verify Your Configuration

After filling `.env`, run:

```bash
cd executor
node check-env.js
```

This will validate all credentials and show which are missing.

---

## 🆘 Troubleshooting

### "Notion integration cannot access database"
→ Make sure you shared the database with the integration:
   Database → "..." → Connections → Add "AmazonSender"

### "AWS SES MessageRejected: Email address is not verified"
→ Verify the FROM email:
   `aws ses verify-email-identity --email-address your@email.com`

### "Supabase: relation 'subscribers' does not exist"
→ Create the table:
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
   ```

### "Cannot find module 'dotenv'"
→ Install dependencies:
   `npm install`

---

**Next step**: Fill in `executor/.env` → Run `node check-env.js` → Start server
