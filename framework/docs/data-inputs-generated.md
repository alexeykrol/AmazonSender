# Требуемые данные и секреты — AmazonSender

## Данные
- CSV экспорт GetResponse (пример: `Waite.csv`).
- Notion:
  - ID базы «Письма»
  - ID базы «Ошибки»
  - Свойства в «Письма» (subject/body/status/is_test/отчётные поля)

## Секреты / env
- `EXECUTOR_SHARED_SECRET` — токен для вебхука /send-mailout.
- `APP_BASE_URL` — базовый URL сервиса (для unsubscribe‑ссылок).
- `NOTION_API_TOKEN`
- `NOTION_DB_MAILOUTS_ID`
- `NOTION_DB_ERRORS_ID`
- `NOTION_WEBHOOK_VERIFICATION_TOKEN` — сохраняется при верификации вебхука, используется для проверки `X-Notion-Signature`.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (или `DATABASE_URL`)
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SES_FROM_EMAIL` — From address
- `REPLY_TO_EMAIL`
- `RATE_LIMIT_PER_SEC` (например, 5)
- `TEST_EMAILS` — список тестовых адресов, по одному на строку
- `FOOTER_ADDRESS_TEXT` — адрес/подвал
- `UNSUBSCRIBE_BASE_URL` — URL для отписки (может совпадать с APP_BASE_URL)

## Дополнительно
- Включить SES event publishing для Delivery/Bounce/Complaint в SNS.
