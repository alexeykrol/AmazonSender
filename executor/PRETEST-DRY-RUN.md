# Pretest Dry-Run Runbook

Quick guide to run a local dry-run mailout without sending real emails.

## Prerequisites

- Node.js 20+ installed
- `.env` configured with minimal settings (Notion + Supabase)
- Subscribers in Supabase database

## Steps

### 1. Enable Dry-Run Mode

```bash
cd executor
echo "DRY_RUN_SEND=true" >> .env
```

Or manually edit `.env` and set `DRY_RUN_SEND=true`.

### 2. Start Server

```bash
npm run start
```

Expected output:
```
Server listening on port 3000
```

Keep this terminal open.

### 3. Trigger Mailout (New Terminal)

Replace `YOUR_NOTION_PAGE_ID` with actual mailout page ID from your Notion database.

**Without shared secret authentication:**

```bash
curl -X POST http://localhost:3000/send-mailout \
  -H "Content-Type: application/json" \
  -d '{"page_id":"YOUR_NOTION_PAGE_ID"}'
```

**With shared secret authentication** (if `EXECUTOR_SHARED_SECRET` is set in `.env`):

```bash
curl -X POST http://localhost:3000/send-mailout \
  -H "Content-Type: application/json" \
  -H "x-auth-token: YOUR_SHARED_SECRET" \
  -d '{"page_id":"YOUR_NOTION_PAGE_ID"}'
```

**Note:** Replace `YOUR_SHARED_SECRET` with the value from your `.env` file.

### 4. Verify Response

Expected response includes:

```json
{
  "ok": true,
  "mailout_id": "test-dry-run-001",
  "sent": 3,
  "failed": 0,
  "dry_run": true
}
```

**Key indicator:** `"dry_run": true` confirms no real emails sent.

### 5. Check CSV Output

CSV file created at `./out/mailout-<ID>-<timestamp>.csv`:

```bash
ls -lth ./out/ | head -5
cat ./out/mailout-*.csv | tail -20
```

Verify CSV contains `status=simulated` for all rows:

```csv
email,status,error_message,message_id,sent_at
user1@example.com,simulated,,sim-xxx,2026-02-12T10:00:00Z
user2@example.com,simulated,,sim-xxx,2026-02-12T10:00:00Z
```

### 6. Stop Server

Return to server terminal and press `Ctrl+C`.

### 7. Disable Dry-Run (Optional)

```bash
sed -i.bak 's/DRY_RUN_SEND=true/DRY_RUN_SEND=false/' .env
```

Or manually edit `.env`.

## Quick Check Script

Use helper script for automated validation (run from `executor/` directory):

```bash
cd executor
./run-dry-run-check.sh <notion_page_id>
```

Replace `<notion_page_id>` with a real Notion page ID from your workspace (e.g., `1a2b3c4d-5e6f-7890-abcd-ef1234567890`).

Script validates:
- Server starts successfully
- Mailout endpoint responds with `dry_run: true`
- CSV artifact exists with `simulated` status
- No real SES calls made
- Automatically detects and uses `EXECUTOR_SHARED_SECRET` if configured

## Troubleshooting

**Server fails to start:**
- Check `.env` contains required Notion/Supabase credentials
- Run `npm run check-env` to validate configuration

**No CSV output:**
- Check `CSV_OUTPUT_DIR` in `.env` (default: `./out`)
- Ensure directory exists and is writable

**Response shows `dry_run: false`:**
- Verify `DRY_RUN_SEND=true` in `.env`
- Restart server after changing `.env`

## Expected Behavior

**Dry-run mode:**
- ✅ Full pipeline executes (Notion fetch, render, subscriber fetch)
- ✅ CSV artifact created with all recipients
- ✅ Notion page updated with metrics
- ❌ NO real SES API calls
- ❌ NO emails sent to users

**What gets tested:**
- Notion API integration
- Supabase subscriber fetch
- Email rendering
- CSV generation
- Idempotency locks

**What is skipped:**
- AWS SES authentication
- Real email delivery
- Bounce/complaint tracking
