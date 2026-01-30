# Техническое задание — AmazonSender (SES Mailout Executor)

## 1. Цель и критерии успеха
- **Цель**: минималистичная утилита‑исполнитель для разовой/редкой массовой рассылки по базе подписчиков. Получить письмо из Notion → безопасно и однократно отправить через Amazon SES → корректно обновить состояние.
- **Успех**: получен стандартный отчёт по доставке (доставлено/отправлено, bounce, отписки), статусы подписчиков обновлены, повторная отправка тем же письмом невозможна (кроме тестового режима).

## 2. Пользователь и роли
- Один пользователь: автор рассылки, администратор и разработчик.
- Сервис не публичный.

## 3. Scope
### Включено
- Получение контента письма из Notion.
- Отправка по активным подписчикам из Supabase через SES с ограничением скорости.
- Приём bounce/complaint из SNS, обновление статусов подписчиков.
- Отписка по ссылке (public URL) с фиксацией статуса.
- Отчёт в Notion + таблица ошибок в Notion + CSV ошибок по рассылке.
- Тестовый режим с отправкой только на список тестовых адресов.

### Исключено
- Сегментация, триггеры, A/B, аналитика открытий/кликов, маркетинг‑автоматизации.
- История статусов подписчиков, повторные рассылки по «не получившим».

## 4. Основной сценарий
1) Письмо создаётся в Notion (тема + тело). В записи есть чекбокс «тест» и статус.
2) Нажимается кнопка в Notion → вебхук в сервис.
3) Сервис загружает контент письма, добавляет подвал (адрес/отписка из env), формирует HTML + plain‑text.
4) Если тестовый режим → отправка только на TEST_EMAILS (многократно допустимо).
5) Если не тест → загрузка списка подписчиков со статусом `active` из Supabase и отправка через SES с rate limit.
6) По завершении сервис пишет отчёт в Notion (deliver/sent/bounce/unsub) и пишет ошибки в Notion + CSV.
7) SNS события (bounce/complaint/delivery) обновляют статусы подписчиков и метрики.

## 5. Архитектура и компоненты
- **Notion**: UI, источник контента, отчёты по рассылкам, таблица ошибок.
- **Executor Service** (Node.js предпочтительно): HTTP‑сервис, stateless.
- **Supabase (Postgres)**: база подписчиков и статусы.
- **Amazon SES**: отправка писем.
- **Amazon SNS**: события bounce/complaint/delivery.

## 6. Данные
### 6.1 Supabase: таблица `subscribers`
Источник — CSV экспорт GetResponse (пример `Waite.csv`, 60 колонок). После импорта добавить:
- `status` (active | unsubscribed | bounced), default `active`.
- `bounce_type` (Permanent | Transient) — значение из SES `bounce.bounceType`.
- `bounce_subtype` — значение из SES `bounce.bounceSubType`.
- `status_updated_at`.
- `from_name` — имя отправителя (по интервью хранится в Supabase).

### 6.2 Notion: таблица «Письма»
Минимальные поля:
- Контент письма (тема + тело). Формат Notion‑страницы.
- `status` (Send | Failed) — выставляет утилита.
- `is_test` (checkbox).
- `sent_at`.
- Поля отчёта: sent_count, delivered_count, bounce_rate, unsubscribe_rate (минимум).

### 6.3 Notion: таблица «Ошибки»
Поля (подтверждено):
- `timestamp`
- `mailout_id` (ID записи Notion)
- `is_test`
- `provider` (Notion | Supabase | SES | SNS)
- `stage` (fetch content | build message | send | report)
- `email` (если применимо)
- `error_code` / `http_status`
- `error_message`
- `retry_count`

### 6.4 mailout_id
Используем ID записи Notion как `mailout_id`.

## 7. HTTP‑контракты
### 7.1 Запуск рассылки (Notion Webhook)
`POST /send-mailout`
- Источник: вебхук Notion.
- Верификация: при создании подписки Notion присылает `verification_token`. Его сохраняем и используем для проверки подписи `X-Notion-Signature` (HMAC‑SHA256).
- Payload содержит метаданные события (тип, время, сущность). Для контента письма нужно отдельно запросить страницу через Notion API.
- Если `status=Send` и не тест → не отправлять повторно.

### 7.2 Отписка
`GET /unsubscribe?token=...`
- Публичная страница подтверждения.
- По токену определить email и поставить `status=unsubscribed`.
- URL берётся из env.

### 7.3 SNS события
`POST /ses-events`
- Принимает Bounce/Complaint/Delivery.
- Валидирует подпись SNS.
- Идемпотентно обновляет статус подписчика (bounced / unsubscribed) и метрики.

## 8. Алгоритм отправки
- Загрузить subject/body из Notion.
- Контент Notion — это блоки. Для получения полного содержимого страницы: Retrieve block children (рекурсивно). Для plain‑text используем `rich_text[].plain_text`.
- Сгенерировать HTML + plain‑text (MVP: поддержка основных блоков; неподдерживаемые блоки — fallback на plain‑text).
- Изображения:
  - `external` URL — стабильные.
  - Notion‑hosted `file` URL — временные (≈1 час). Не кэшировать; обновлять прямо перед отправкой.
  - MVP: разрешаем только внешние URL **или** делаем re‑fetch файла перед отправкой.
- Добавить footer (адрес + ссылка отписки) из env.
- Получить recipients из Supabase (`status=active`).
- Отправка батчами (batch size 50, concurrency 1).
- Rate limit 5–6 писем/сек (настраиваемо через env).
- Ошибки не блокируют весь процесс, кроме критичных (SES/Supabase недоступны).

## 9. Тестовый режим
- В Notion есть чекбокс `is_test`.
- Если `is_test=true`, отправка только на список TEST_EMAILS (env, по строкам).
- Тестовые отправки разрешены многократно.

## 10. Логирование и ошибки
- Логи приложения (локальные/консольные).
- Запись ошибок в Notion «Ошибки» и CSV по каждой рассылке.
- Маскировка данных не требуется.

## 11. Безопасность
- Shared secret для /send-mailout.
- Проверка подписи SNS.
- Доступ только у одного пользователя, сервис не публичный.

## 12. Деплой
- Локальная отладка → Vercel через GitHub.

## 13. Нефункциональные требования
- Rate limit: 5–6 писем/сек (config), ниже лимитов SES.
- SES‑квоты можно читать через API `GetSendQuota` (MaxSendRate / Max24HourSend) и при желании динамически ограничивать скорость.
- Объёмы: до лимитов SES, больше текущих потребностей.
- Реального времени для SNS не требуется.

## 14. Закрытые TODO (официальные справочные сведения)
- Webhook Notion: `verification_token` и `X-Notion-Signature` (HMAC‑SHA256) — используем для проверки подлинности запросов.
- Контент Notion — это блоки, требуется `Retrieve block children` (рекурсивно), `rich_text[].plain_text` для plain‑text.
- Notion‑hosted файлы дают временные URL (~1 час); внешние URL — постоянные.
- SES SNS: события имеют `notificationType`/`eventType` и поля `mail`, `bounce`, `complaint`, `delivery`. Delivery‑события включаются через event publishing.
- SES квоты: `GetSendQuota` даёт MaxSendRate и Max24HourSend.

## 15. References
- Notion Webhooks: https://developers.notion.com/reference/webhooks
- Notion Retrieve block children: https://developers.notion.com/reference/get-block-children
- Notion Rich text: https://developers.notion.com/reference/rich-text
- Notion File object (URL expiry): https://developers.notion.com/reference/file-object
- SES SNS notification contents: https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html
- SES event publishing (SNS contents): https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html
- SES GetSendQuota: https://docs.aws.amazon.com/ses/latest/APIReference/API_GetSendQuota.html
