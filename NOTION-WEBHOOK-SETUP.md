# Notion Webhook Setup

## Важно!

Notion **не имеет нативных webhooks** для database updates. Есть несколько вариантов решения:

---

## Option 1: Manual Trigger (Simplest)

**Как работает**: Вместо автоматического webhook'а — ручной вызов API при нажатии кнопки.

### Setup:

1. В Notion создать кнопку в странице Mailout
2. Настроить кнопку на вызов HTTP endpoint

**Но**: Notion buttons не поддерживают HTTP requests напрямую.

---

## Option 2: Notion API Polling (Recommended)

**Как работает**: Executor периодически проверяет Notion на наличие mailouts со статусом "Send".

### Implementation:

Добавить в `executor/src/server.js`:

```javascript
// Poll Notion every minute for mailouts with status "Send"
setInterval(async () => {
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DB_MAILOUTS_ID,
      filter: {
        property: 'Status',
        status: {
          equals: 'Send'
        }
      }
    });

    for (const page of response.results) {
      // Process mailout
      await processSendMailout(page.id);
    }
  } catch (error) {
    console.error('Polling error:', error);
  }
}, 60000); // Every 1 minute
```

### Pros:
- ✅ Простая реализация
- ✅ Надежно (нет зависимости от webhook'ов)
- ✅ Работает сразу

### Cons:
- ⚠️ Задержка до 1 минуты
- ⚠️ Лишние API calls (если нет новых mailouts)

---

## Option 3: Zapier/Make Integration (External Service)

**Как работает**: Zapier следит за изменениями в Notion → вызывает webhook executor'а.

### Setup:

1. Create Zapier account (free tier)
2. New Zap:
   - Trigger: Notion → Updated Database Item
   - Filter: Status equals "Send"
   - Action: Webhooks → POST to `http://your-executor/send-mailout`

### Pros:
- ✅ Мгновенная реакция
- ✅ Не нужно писать polling код

### Cons:
- ⚠️ Зависимость от external service
- ⚠️ Free tier ограничен (100 tasks/month)
- ⚠️ Нужен публичный URL executor'а (ngrok/deploy)

---

## Option 4: Notion Automation (Beta)

**Как работает**: Notion Automations (бета) могут вызывать webhooks.

### Setup:

1. В Notion database → "..." → Automations
2. Create automation:
   - When: Property "Status" changes to "Send"
   - Do: Call webhook (если доступно)

### Pros:
- ✅ Нативное решение
- ✅ Мгновенная реакция

### Cons:
- ⚠️ Beta feature (может не работать для всех)
- ⚠️ Ограниченная функциональность

---

## 🎯 Recommended Approach for Testing

**Start with Option 2 (Polling)** because:
- Быстро реализовать
- Надежно
- Не зависит от external services
- Достаточно для MVP

**Later upgrade to Option 3 (Zapier)** when:
- Нужна мгновенная реакция
- Готовы платить за Zapier Pro
- Executor deployed publicly

---

## Implementation Code (Option 2)

### 1. Create Polling Module

`executor/src/poller.js`:

```javascript
const { notion } = require('./notion');
const { processSendMailout } = require('./mailout');

// Track processed mailouts to avoid duplicates
const processedMailouts = new Set();

async function pollNotion() {
  try {
    console.log('[POLL] Checking for new mailouts...');

    const response = await notion.databases.query({
      database_id: process.env.NOTION_DB_MAILOUTS_ID,
      filter: {
        and: [
          {
            property: 'Status',
            status: {
              equals: 'Send'
            }
          },
          {
            property: 'Sent At',
            date: {
              is_empty: true
            }
          }
        ]
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'ascending'
        }
      ]
    });

    console.log(`[POLL] Found ${response.results.length} mailout(s) to send`);

    for (const page of response.results) {
      const mailoutId = page.id;

      // Skip if already processed
      if (processedMailouts.has(mailoutId)) {
        console.log(`[POLL] Skipping already processed: ${mailoutId}`);
        continue;
      }

      console.log(`[POLL] Processing mailout: ${mailoutId}`);

      try {
        await processSendMailout(mailoutId);
        processedMailouts.add(mailoutId);

        // Clean up old entries (keep last 1000)
        if (processedMailouts.size > 1000) {
          const toDelete = Array.from(processedMailouts).slice(0, 100);
          toDelete.forEach(id => processedMailouts.delete(id));
        }
      } catch (error) {
        console.error(`[POLL] Error processing ${mailoutId}:`, error);
        // Continue with next mailout
      }
    }
  } catch (error) {
    console.error('[POLL] Error:', error);
  }
}

function startPoller(intervalMs = 60000) {
  console.log(`[POLL] Starting poller (interval: ${intervalMs}ms)`);

  // Initial poll
  pollNotion();

  // Schedule recurring polls
  const interval = setInterval(pollNotion, intervalMs);

  return () => {
    console.log('[POLL] Stopping poller');
    clearInterval(interval);
  };
}

module.exports = { startPoller };
```

### 2. Update server.js

```javascript
const { startPoller } = require('./poller');

// ... existing code ...

// Start Notion poller
const stopPoller = startPoller(60000); // Poll every 60 seconds

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  stopPoller();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

### 3. Environment Variable

Add to `.env`:

```env
# Polling interval in milliseconds (default: 60000 = 1 minute)
NOTION_POLL_INTERVAL=60000
```

---

## Testing Polling Setup

1. Start executor:
   ```bash
   npm start
   ```

2. Check logs:
   ```
   [POLL] Starting poller (interval: 60000ms)
   [POLL] Checking for new mailouts...
   [POLL] Found 0 mailout(s) to send
   ```

3. In Notion:
   - Create new mailout
   - Set Status = "Send"

4. Within 1 minute, logs should show:
   ```
   [POLL] Checking for new mailouts...
   [POLL] Found 1 mailout(s) to send
   [POLL] Processing mailout: xxx-xxx-xxx
   [INFO] Sending mailout: Test Mailout
   ```

---

## Production Considerations

### Rate Limiting
- Notion API: 3 requests/second
- Polling every minute is well within limits
- If needed, increase interval to 2-5 minutes

### Error Handling
- If polling fails, it retries on next interval
- Individual mailout errors don't stop the poller
- All errors logged for debugging

### Idempotency
- Track processed mailouts in Set
- Check "Sent At" is empty
- Prevents duplicate sends

### Monitoring
- Log every poll attempt
- Alert if no polls for 5+ minutes (poller crashed)
- Monitor processed count vs expected

---

**Status**: Polling implementation recommended
**Estimated time**: 15 minutes to implement
**Next step**: Add polling code to executor
