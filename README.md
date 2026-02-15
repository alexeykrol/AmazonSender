# AmazonSender

Send email newsletters through Amazon SES using Notion as your control panel.

## What It Does

AmazonSender lets you write and send newsletters from Notion. You create your email in Notion, click a button, and the system sends it to your subscribers. It runs on your Mac in the background - no complex setup, no servers to manage.

## How It Works (3 Simple Parts)

1. **Notion** - where you write emails and click "Send"
2. **Your Mac** - runs a small background agent that watches Notion
3. **Amazon SES** - sends the actual emails (reliable, cost-effective)

## Quick Start

### Step 1: Install the Background Agent (5 minutes)

The agent is a small program that runs on your Mac and watches Notion for "Send" commands.

**In Terminal:**
```bash
cd /path/to/AmazonSender/executor
bash tools/macos/agent.sh install
```

Replace `/path/to/AmazonSender` with your actual project folder path.

**Check it's running:**
Open in browser: `http://localhost:3000/health`
Should show: `{"ok":true}`

> **macOS Permission:** If macOS asks "node wants to access files in Downloads" -> click Allow.

### Step 2: Send a Test Email (30 seconds)

**In Notion:**
1. Open your Mailouts table
2. Click "New" to create an email
3. Write your email content
4. Click the "Send test" button

**Wait 5-30 seconds:**
- Status changes to "In progress" then "Done"
- Test email arrives at the addresses in your `TEST_EMAILS` setting

### Step 3: Send Real Newsletter (when ready)

This sends to ALL active subscribers - double-check everything first!

**In Terminal - enable real sending:**
```bash
cd /path/to/AmazonSender/executor
# Edit .env file: set ALLOW_NON_TEST_SEND=true
bash tools/macos/agent.sh restart
```

**In Notion:**
1. Uncheck the "Test" checkbox
2. Set Status to "Send real"
3. Wait for Status to become "Done"

**After sending - turn protection back on:**
```bash
# Edit .env file: set ALLOW_NON_TEST_SEND=false
bash tools/macos/agent.sh restart
```

## Understanding the 3 Safety Modes

| Mode | Test Checkbox | Status | Who Gets Email | Purpose |
|------|---------------|--------|----------------|---------|
| **Test Mode** | ✅ checked | "Send" | Only TEST_EMAILS addresses | Safe testing |
| **Dry-Run** | (any) | (any) | Nobody (simulation) | Verify setup without sending |
| **Real Send** | ⬜ unchecked | "Send real" | All active subscribers | Production newsletter |

**Test Mode Protection:**
When "Test" is checked, emails ONLY go to `TEST_EMAILS` - even if you accidentally click "Send real". Your subscriber list is never used in test mode.

**Dry-Run Mode:**
Set `DRY_RUN_SEND=true` in `.env` to simulate everything without sending any emails. The system processes the full flow but skips the actual SES calls.

**Real Send Requirements:**
ALL of these must be true:
- Test checkbox is unchecked
- Status is "Send real"
- `ALLOW_NON_TEST_SEND=true` in `.env`

## Managing the Background Agent

**Check status:**
```bash
bash tools/macos/agent.sh status
```

**View logs:**
```bash
bash tools/macos/agent.sh logs
```

**Restart after config changes:**
```bash
bash tools/macos/agent.sh restart
```

**Stop completely:**
```bash
bash tools/macos/agent.sh uninstall
```

The agent runs automatically when you log in to macOS. It checks Notion every few seconds for "Send" commands.

## Troubleshooting

**Emails not arriving:**
1. Check agent is running: `http://localhost:3000/health`
2. Check `.env` has `DRY_RUN_SEND=false`
3. Check logs: `bash tools/macos/agent.sh logs`

**Agent won't start:**
1. Check Node.js version: `node --version` (needs >= 20)
2. Check project path is correct in install command
3. Check logs for errors

**Test emails going to wrong addresses:**
1. Check `TEST_EMAILS` in `.env` file
2. Restart agent after changing `.env`

## Technical Details

For developers, deployment instructions, API endpoints, and database schemas, see:
- [executor/README.md](executor/README.md) - Technical documentation
- [QUICK-START.md](QUICK-START.md) - Initial setup guide
- [GET-CREDENTIALS.md](GET-CREDENTIALS.md) - AWS and service credentials

## Requirements

- macOS (for background agent)
- Node.js >= 20
- Notion account (for writing emails)
- Amazon SES account (for sending emails)
- Supabase account (for subscriber database)

## License

MIT
