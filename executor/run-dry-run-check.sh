#!/usr/bin/env bash
#
# run-dry-run-check.sh
# Automated dry-run validation script
#
# Usage: ./run-dry-run-check.sh <mailout_id>
#
# Arguments:
#   mailout_id - Required. Must be a valid Notion page ID (UUID format).
#
# Validates:
# - Server starts successfully
# - Dry-run mode enabled
# - Mailout endpoint returns dry_run=true
# - CSV artifact created with simulated status
#
# Exit codes:
# 0 - All checks passed
# 1 - Server startup failed
# 2 - Dry-run mode not enabled
# 3 - Mailout request failed
# 4 - Response validation failed
# 5 - CSV artifact validation failed

set -e

if [ -z "$1" ]; then
  echo "Error: mailout_id argument is required"
  echo "Usage: $0 <notion_page_id>"
  echo "Example: $0 1a2b3c4d-5e6f-7890-abcd-ef1234567890"
  exit 1
fi

MAILOUT_ID="$1"

# Validate UUID format (basic check)
if ! echo "$MAILOUT_ID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  echo "Error: mailout_id must be a valid UUID format"
  echo "Example: 1a2b3c4d-5e6f-7890-abcd-ef1234567890"
  exit 1
fi
PORT=3000
CSV_DIR="./out"
SERVER_PID=""
TEMP_LOG="/tmp/dry-run-server-$$.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo ""
    echo "Stopping server (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$TEMP_LOG"
}

trap cleanup EXIT

fail() {
  echo -e "${RED}✗ FAILED${NC}: $1"
  exit "$2"
}

success() {
  echo -e "${GREEN}✓ PASSED${NC}: $1"
}

info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Check dry-run mode enabled
info "Checking DRY_RUN_SEND configuration..."
if ! grep -q "^DRY_RUN_SEND=true" .env 2>/dev/null; then
  fail "DRY_RUN_SEND not set to 'true' in .env" 2
fi
success "Dry-run mode enabled in .env"

# Step 2: Start server
info "Starting server on port $PORT..."
npm run start > "$TEMP_LOG" 2>&1 &
SERVER_PID=$!

# Wait for server to start (max 10 seconds)
WAIT_SECONDS=10
for i in $(seq 1 $WAIT_SECONDS); do
  if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
    success "Server started (PID: $SERVER_PID)"
    break
  fi
  if [ $i -eq $WAIT_SECONDS ]; then
    cat "$TEMP_LOG"
    fail "Server failed to start within ${WAIT_SECONDS}s" 1
  fi
  sleep 1
done

# Step 3: Trigger mailout
info "Triggering mailout (ID: $MAILOUT_ID)..."

# Build auth header if EXECUTOR_SHARED_SECRET is set
AUTH_HEADER=""
if grep -q "^EXECUTOR_SHARED_SECRET=." .env 2>/dev/null; then
  AUTH_TOKEN=$(grep "^EXECUTOR_SHARED_SECRET=" .env | cut -d= -f2-)
  if [ -n "$AUTH_TOKEN" ]; then
    AUTH_HEADER="-H \"x-auth-token: $AUTH_TOKEN\""
  fi
fi

RESPONSE=$(eval curl -s -X POST http://localhost:$PORT/send-mailout \
  -H \"Content-Type: application/json\" \
  $AUTH_HEADER \
  -d \"{\\\"page_id\\\":\\\"$MAILOUT_ID\\\"}\" \
  -w \"\\n%{http_code}\")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "Response body: $BODY"
  fail "Mailout request failed with HTTP $HTTP_CODE" 3
fi
success "Mailout request completed (HTTP 200)"

# Step 4: Validate response
info "Validating response body..."
DRY_RUN=$(echo "$BODY" | grep -o '"dry_run"[[:space:]]*:[[:space:]]*true' || echo "")
if [ -z "$DRY_RUN" ]; then
  echo "Response: $BODY"
  fail "Response does not contain 'dry_run: true'" 4
fi
success "Response confirms dry_run=true"

SENT_COUNT=$(echo "$BODY" | grep -o '"sent"[[:space:]]*:[[:space:]]*[0-9]\+' | grep -o '[0-9]\+' || echo "0")
if [ "$SENT_COUNT" -eq 0 ]; then
  echo "Response: $BODY"
  fail "No recipients processed (sent=0)" 4
fi
success "Recipients processed: $SENT_COUNT"

# Step 5: Verify CSV artifact
info "Checking CSV artifact..."
sleep 1  # Allow time for CSV write
CSV_FILES=$(find "$CSV_DIR" -name "mailout-${MAILOUT_ID}-*.csv" -type f 2>/dev/null || echo "")
if [ -z "$CSV_FILES" ]; then
  fail "CSV file not found in $CSV_DIR" 5
fi

CSV_FILE=$(echo "$CSV_FILES" | head -n1)
success "CSV artifact created: $(basename "$CSV_FILE")"

# Step 6: Validate CSV contains 'simulated' status
info "Validating CSV content..."
if ! grep -q ",simulated," "$CSV_FILE"; then
  echo "CSV content:"
  cat "$CSV_FILE"
  fail "CSV does not contain 'simulated' status" 5
fi
success "CSV contains simulated status for recipients"

# Step 7: Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ All checks passed!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Mailout ID: $MAILOUT_ID"
echo "  Recipients: $SENT_COUNT"
echo "  CSV File:   $CSV_FILE"
echo "  Dry-run:    ✓ Enabled"
echo ""
echo "Next steps:"
echo "  • Review CSV: cat $CSV_FILE"
echo "  • Run tests: npm test"
echo "  • Disable dry-run: sed -i.bak 's/DRY_RUN_SEND=true/DRY_RUN_SEND=false/' .env"
echo ""

exit 0
