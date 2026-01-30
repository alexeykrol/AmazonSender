# Business Logic — исполнитель рассылки (псевдокод и сценарии)

Документ описывает детерминированную логику расчётов и сценарии для AmazonSender.
Все вычисления предсказуемы: фиксированные порядки сортировки, отсутствие случайности, одинаковая обработка ошибок.

---

## 1) Входы и инварианты

### 1.1 Входы
- **Notion**: таблица «Письма» (subject, body blocks, status, is_test, sent_at, метрики).
- **Supabase**: `subscribers` (email, status, bounce_type, bounce_subtype, status_updated_at, from_name).
- **Env**:
  - `UNSUBSCRIBE_BASE_URL`
  - `ORG_NAME`, `ORG_ADDRESS`
  - `TEST_EMAILS` (список адресов)
  - `SEND_RATE_PER_SEC` (default 5)
  - `BATCH_SIZE` (default 50)
  - `FROM_EMAIL`, `FROM_NAME` (fallback)
  - `NOTION_TOKEN`, `NOTION_DB_MAILOUTS`, `NOTION_DB_ERRORS`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Проверка подписи SNS через сертификат из `SigningCertURL` (shared secret не используется)
  - `UNSUBSCRIBE_SECRET` (HMAC для токена отписки)

### 1.2 Инварианты и детерминизм
- **Порядок получателей** всегда сортируется по `email ASC` (lowercased) для стабильности.
- **Дедупликация** email выполняется case‑insensitive.
- **Rate limit** фиксирован: `SEND_RATE_PER_SEC` → интервал `minIntervalMs = 1000 / rate`.
- **Batching** фиксирован: `BATCH_SIZE`, последовательная обработка (concurrency = 1).
- **Повторная отправка запрещена**, кроме тестового режима.
- **Статусы** имеют приоритет: `bounced > unsubscribed > active`.

---

## 2) Конвертация контента (Notion → HTML + текст)

### 2.1 Правила
- Обрабатываем блоки **в строгом порядке**, как возвращает Notion API (top‑down, depth‑first).
- Неизвестные типы блоков:
  - если есть `rich_text`, добавляем plain‑text в текстовую версию и HTML‑версию как `<p>`
  - иначе игнорируем, но пишем запись в таблицу «Ошибки» с типом `content_block_unsupported`.
- В HTML не используем случайные ID или timestamp.

### 2.2 Псевдокод
```pseudo
function renderMailoutContent(notionPageId):
  blocks = notion.getPageBlocks(notionPageId)
  htmlParts = []
  textParts = []

  for block in blocks in order:
    (html, text) = renderBlock(block)
    if html != null: htmlParts.append(html)
    if text != null: textParts.append(text)

  htmlBody = htmlParts.join("\n")
  textBody = textParts.join("\n")

  return (htmlBody, textBody)
```

---

## 3) Footer + Unsubscribe

### 3.1 Правила
- Footer **всегда** добавляется и в HTML, и в текст.
- Footer детерминированный; отсутствующие переменные env → error + abort.
- Unsubscribe URL формируется по `UNSUBSCRIBE_BASE_URL` и `token`.

### 3.2 Псевдокод
```pseudo
function buildFooter(email):
  require(ORG_NAME, ORG_ADDRESS, UNSUBSCRIBE_BASE_URL, UNSUBSCRIBE_SECRET)
  token = hmacToken(email, UNSUBSCRIBE_SECRET)
  unsubscribeUrl = UNSUBSCRIBE_BASE_URL + "?token=" + token

  htmlFooter = "<hr><p>" + ORG_NAME + " — " + ORG_ADDRESS + "</p>" +
               "<p><a href=\"" + unsubscribeUrl + "\">Unsubscribe</a></p>"
  textFooter = "\n--\n" + ORG_NAME + " — " + ORG_ADDRESS +
               "\nUnsubscribe: " + unsubscribeUrl

  return (htmlFooter, textFooter)
```

---

## 4) Рассылка (POST /send-mailout)

### 4.1 Основной алгоритм
```pseudo
function sendMailout(notionPageId):
  mailout = notion.getPage(notionPageId)
  subject = mailout.subject
  isTest = mailout.is_test
  status = mailout.status
  sentAt = mailout.sent_at

  if subject is empty: fail("subject_required")

  if isTest == false and (status == "Send" or sentAt != null):
    fail("mailout_already_sent")

  (htmlBody, textBody) = renderMailoutContent(notionPageId)
  if htmlBody and textBody are empty: fail("empty_body")

  recipients = []
  if isTest:
    recipients = parseTestEmails(TEST_EMAILS)
    if recipients empty: fail("test_emails_empty")
  else:
    recipients = supabase.query("subscribers")
      .filter(status == "active")
      .select(email, from_name)
      .orderBy(email asc)

  recipients = normalizeAndDedup(recipients)

  (htmlFooter, textFooter) = buildFooter(email = "<placeholder>")
  # footer depends on email, so build per recipient at send time

  rate = envOrDefault("SEND_RATE_PER_SEC", 5)
  batchSize = envOrDefault("BATCH_SIZE", 50)
  minIntervalMs = 1000 / rate

  results = []
  for batch in chunk(recipients, batchSize) sequentially:
    for recipient in batch sequentially:
      (htmlFooter, textFooter) = buildFooter(recipient.email)
      html = htmlBody + "\n" + htmlFooter
      text = textBody + "\n" + textFooter

      fromName = recipient.from_name ?? FROM_NAME
      sendResult = ses.sendEmail(to=recipient.email, subject, html, text, fromName)

      results.append(sendResult)
      sleep(minIntervalMs)

  reportAndPersist(mailout, results)
  return ok
```

### 4.2 Отчётность
- **CSV** на рассылку (email, status, error_message, message_id, sent_at).
- **Ошибки** в Notion («Ошибки») + (опционально) `send_logs`.
- **Метрики** в Notion («Письма»): `sent_count`, `failed_count`, `status`, `sent_at`.

### 4.3 Правила статусов для Notion
- Если `failed_count > 0` → status = `Failed`.
- Иначе → status = `Send`.

---

## 5) SNS события (POST /ses-events)

### 5.1 Типы и обновления статуса
- **Bounce** → `status = bounced`, set `bounce_type`, `bounce_subtype`, `status_updated_at`.
- **Complaint** → `status = unsubscribed`, `status_updated_at`.
- **Delivery** → логируем метрику (без изменения статуса).

### 5.2 Правило приоритета
```pseudo
function applyStatus(current, incoming):
  priority = {"active": 1, "unsubscribed": 2, "bounced": 3}
  if priority[incoming] >= priority[current]: return incoming
  return current
```

### 5.3 Псевдокод
```pseudo
function handleSesEvent(snsPayload):
  require verifySnsSignature(snsPayload, SNS_SECRET)

  event = parseSesMessage(snsPayload)
  email = event.mail.destination[0]

  if event.type == "Bounce":
    incoming = "bounced"
    updateSubscriber(email, incoming, bounce_type, bounce_subtype)
  else if event.type == "Complaint":
    incoming = "unsubscribed"
    updateSubscriber(email, incoming)
  else if event.type == "Delivery":
    logDeliveryMetric(email)
  else:
    logError("unknown_event_type")
```

---

## 6) Отписка (GET /unsubscribe)

### 6.1 Правила
- Token содержит email и HMAC подпись. Недействительный токен → 400.
- Статус переводится в `unsubscribed` (c приоритетом статусов).

### 6.2 Псевдокод
```pseudo
function unsubscribe(token):
  data = verifyUnsubToken(token, UNSUBSCRIBE_SECRET)
  if invalid: return 400

  email = data.email
  updateSubscriber(email, incoming="unsubscribed")
  return 200
```

---

## 7) Сценарии и edge cases

1. **Пустая тема** → abort + запись ошибки `subject_required`.
2. **Пустое тело** (html и text пусты) → abort `empty_body`.
3. **is_test = true** и `TEST_EMAILS` пуст → abort `test_emails_empty`.
4. **Повторный запуск** на не‑тестовой рассылке → abort `mailout_already_sent`.
5. **Невалидный email** в TEST_EMAILS → игнорировать, логировать; если список пуст → abort.
6. **Дубликаты email** (case‑insensitive) → дедупликация.
7. **Ошибка отправки** на одном адресе → фиксируем в CSV + Notion «Ошибки», продолжаем.
8. **SNS неизвестный тип** → логируем, не меняем статус.
9. **Bounce на уже unsubscribed** → статус становится `bounced` (по приоритету).
10. **Complaint на already bounced** → статус остаётся `bounced`.
11. **Missing env footer** → abort и запись ошибки `footer_env_missing`.
12. **Notion блок неизвестного типа** → добавляем text‑fallback при возможности, пишем ошибку.

---

## 8) Unit‑тесты (список)

### 8.1 Контент и footer
- Render: поддерживаемые блоки → корректный HTML + текст.
- Render: неизвестный тип блока → fallback + лог ошибки.
- Footer: URL правильный, token валиден, одинаковый email → одинаковый token.
- Footer: отсутствует env → выброс ошибки.

### 8.2 Тестовые адреса
- Парсер TEST_EMAILS: `, ; пробел` → корректный список.
- Парсер TEST_EMAILS: дубликаты и регистр → дедуп.
- Парсер TEST_EMAILS: невалидные email → отфильтрованы.

### 8.3 Рассылка
- is_test=true → отправка только TEST_EMAILS.
- is_test=false → отправка только status=active.
- Повторная отправка non‑test → ошибка.
- Rate limit → интервал между отправками >= minIntervalMs.
- Batch size → максимум 50 в батче.
- Ошибка отправки одного адреса → остальные отправляются.

### 8.4 SNS / Unsubscribe
- verifySnsSignature: валидный → true, невалидный → false.
- Bounce → статус bounced + поля bounce_*.
- Complaint → статус unsubscribed.
- Delivery → статус не меняется.
- Приоритет статусов: bounced > unsubscribed > active.
- Unsubscribe token: валиден → статус unsubscribed.
- Unsubscribe token: невалиден → 400.

---

## 9) Короткий вывод
Логика покрывает deterministic‑вычисления, режим теста, батчи/лимиты, статус‑машину и основные edge cases.
```
