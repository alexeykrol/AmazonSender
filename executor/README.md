# AmazonSender Executor

Минималистичный HTTP‑сервис для разовой/редкой рассылки через Amazon SES.

## Требования

- Node.js >= 20.0.0 (требуется для зависимостей и `node --test`)
- npm >= 9.0.0

Проверьте версию: `node --version`

Если используете nvm: `nvm use` (читает `.nvmrc`)

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

### Режим сухого прогона (Dry-Run)

Для тестирования рассылки без реальной отправки через SES можно использовать режим dry-run:

```env
DRY_RUN_SEND=true
```

В этом режиме:
- Выполняется полный пайплайн (загрузка из Notion, рендеринг, получение подписчиков, дедупликация, обновление отчетов)
- Реальные вызовы SES API пропускаются
- Каждый получатель помечается как `status=simulated` в CSV/отчетах
- Ответ endpoint включает `dry_run: true`
- Счетчики результатов детерминированы и соответствуют списку получателей

## Notion

### Схема базы данных Mailouts

Ожидаемые свойства:
- **Name** (title) - используется как Subject письма
- **Status** (status) - значения: `Not started`, `In progress`, `Done`
- **Test** (checkbox) - если включено, рассылка идет только на TEST_EMAILS
- **Sent At** (date) - дата/время отправки
- **Sent Count** (number) - количество отправленных
- **Delivered Count** (number) - количество доставленных
- **Failed Count** (number) - количество неудачных
- **Bounce Rate** (number) - процент отказов
- **Unsub Rate** (number) - процент отписок

### Схема базы данных Errors

Ожидаемые свойства:
- **Name** (title) - краткое описание ошибки
- **Timestamp** (date) - время возникновения
- **Mailout ID** (rich_text) - ID связанной рассылки
- **Is Test** (checkbox) - была ли это тестовая рассылка
- **Provider** (select) - источник ошибки (Notion, SES, Executor)
- **Stage** (select) - этап обработки (fetch content, build message, send, report)
- **Email** (email) - адрес получателя (если применимо)
- **Error Code** (rich_text) - код ошибки
- **Error Message** (rich_text) - текст ошибки
- **Retry Count** (number) - количество повторов

**Важно:** Свойства Provider, Stage и Email должны соответствовать типам select/email в Notion, иначе возникнут validation errors.

## SNS
- Подписка подтверждается автоматически при получении `SubscriptionConfirmation`.
- Подпись проверяется по `SigningCertURL` (RSA‑SHA1).

## Выходы
- CSV по каждой рассылке в `CSV_OUTPUT_DIR` (по умолчанию `./out`).

## Импорт подписчиков

### Импорт из CSV в Supabase

Команда для импорта подписчиков из CSV-файла:

```bash
node import-subscribers.js "<путь к CSV файлу>"
```

Пример:
```bash
node import-subscribers.js "/Users/alexeykrolmini/Downloads/База данных/Waite.csv"
```

**Особенности:**
- Идемпотентный: безопасно повторять без создания дубликатов
- Валидация email-адресов (RFC 5322)
- Нормализация email (приведение к нижнему регистру)
- Дедупликация перед импортом (без учета регистра)
- Upsert-поведение: обновляет существующие записи, вставляет новые
- Генерация отчета с метриками импорта

**Требования к CSV:**
- Обязательная колонка: `email`
- Опциональная колонка: `name` (мапится в `from_name`)
- Все остальные колонки игнорируются

**Отчет импорта:**
Сохраняется в `.coord/reports/import-subscribers-<timestamp>.md` и содержит:
- Общее количество строк в CSV
- Валидные/невалидные записи
- Дубликаты (удаленные перед импортом)
- Результаты: вставлено/обновлено/пропущено/ошибки

**Ограничение по проекту Supabase:**
- Если задан `SUPABASE_PROJECT_REF`, импорт проверяет совпадение `SUPABASE_URL` с этим project ref и завершится ошибкой при несовпадении.

**Тесты:**
```bash
node test/import-subscribers.test.js  # Unit tests
node test/dry-run-import.js          # Dry-run with sample data
```

## Ограничения
- Конвертация Notion блоков реализована минимально (HTML + plain‑text).
- `delivered_count` = количество писем, принятых SES (реальную доставку можно считать по Delivery событиям).
