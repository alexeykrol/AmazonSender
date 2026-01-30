# AmazonSender Executor

Минималистичный HTTP‑сервис для разовой/редкой рассылки через Amazon SES.

## Запуск локально
```bash
cd executor
cp .env.example .env
npm install
npm run start
```

## Эндпоинты
- `POST /send-mailout` — запуск рассылки (Notion webhook или ручной запрос).
- `GET /unsubscribe?token=...` — отписка.
- `POST /ses-events` — SNS события (bounce/complaint/delivery).
- `GET /health` — проверка живости.

## Входы
### /send-mailout
Принимает JSON. Ищет `mailout_id` или `page_id`. Для Notion webhook также пытается извлечь `page_id` из payload.

Если задан `EXECUTOR_SHARED_SECRET`, запрос должен содержать `auth_token` или заголовок `x-auth-token`.

## Notion
- Контент письма: subject + body (страница и блоки).
- Обновление статуса и метрик после отправки.
- Ошибки — отдельная база «Ошибки» (настраивается через env).

## SNS
- Подписка подтверждается автоматически при получении `SubscriptionConfirmation`.
- Подпись проверяется по `SigningCertURL` (RSA‑SHA1).

## Выходы
- CSV по каждой рассылке в `CSV_OUTPUT_DIR` (по умолчанию `./out`).

## Ограничения
- Конвертация Notion блоков реализована минимально (HTML + plain‑text).
- `delivered_count` = количество писем, принятых SES (реальную доставку можно считать по Delivery событиям).
