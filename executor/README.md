# AmazonSender Executor

Минималистичный HTTP‑сервис для разовой/редкой рассылки через Amazon SES.

## Quick Links

**For non-technical users:** See [../README.md](../README.md) for the step-by-step user guide.

**This document:** Technical details, API endpoints, database schemas, and deployment.

## UserFlow (инструкция "как для кофеварки")

> **Note:** The simplified user flow is now in the [root README.md](../README.md). This section remains for technical reference.

Ниже — как отправлять письма, если ты не разработчик. Здесь нет "магии": кнопки/статусы в Notion **только меняют поля**, а письма отправляет **локальный агент** на твоем Mac.

### Важно (30 секунд)

- **Notion сам письма не отправляет.** Он лишь ставит “команду” в колонке `Status`.
- Письма отправляет агент на твоем Mac. Если Mac выключен/спит — ничего не произойдет.
- Если в строке `Test = ✅`, письма **всегда** уходят ТОЛЬКО на адреса из `TEST_EMAILS` (файл `.env`). На базу подписчиков письмо не уйдет даже если ты случайно выберешь `Send real`.
- `DRY_RUN_SEND=true` = режим “симуляции”: статусы обновятся, но письма **не будут отправлены**. Чтобы тестовые письма реально пришли на `TEST_EMAILS`, нужно `DRY_RUN_SEND=false`.

### 0) (Один раз) Включить агента на Mac

Где делать: **Terminal (Терминал) на macOS**.

Если у тебя уже открывается `http://127.0.0.1:3000/health` и там `ok: true` — этот шаг можно пропустить (агент уже работает).

1) Открой Terminal:
   - Нажми `Command+Space`
   - Введи `Terminal`
   - Нажми `Enter`
2) Скопируй и вставь (потом нажми `Enter`):
```bash
cd /path/to/AmazonSender/executor
bash tools/macos/agent.sh install
```
Замени `/path/to/AmazonSender` на путь к папке проекта на твоем Mac.
3) Проверка “всё живое”:
   - Открой браузер (Chrome/Safari)
   - Открой адрес: `http://127.0.0.1:3000/health`
   - Должно быть `{"ok":true,...}`

Если macOS спросит “Приложение node запрашивает доступ к файлам в папке Загрузки” — нажми **Разрешить**.

### 1) (Один раз) Настроить Notion (кнопки “Send test” и “Reset”)

Где делать: **Notion → таблица Mailouts**.

В таблице Mailouts должны быть свойства:
- `Name` — тема письма (Subject)
- `Test` — чекбокс (тестовый режим)
- `Status` — статус (команды)

В `Status` добавь значения (минимум):
- `Not started`
- `Send`
- `Send real`
- `Reset`
- `In progress`
- `Done`

#### Кнопка `Send test`

Цель: одной кнопкой включить тест и поставить команду на отправку.

1) В заголовке колонки `Send test` нажми на `...` (или на название колонки).
2) Выбери **Edit automation**.
3) В блоке “Do” выбери: **Edit** → **This page**.
4) Нажми **Edit a property** и добавь 2 изменения:
   - `Test` → ✅ (включить)
   - `Status` → `Send`
5) Нажми **Save**.

#### Кнопка `Reset`

Цель: “сбросить” продублированное письмо, чтобы его можно было снова отправить тестом (и чтобы старые счетчики не путали).

1) В заголовке колонки `Reset` → **Edit automation**.
2) “Do” → **Edit** → **This page**.
3) **Edit a property**:
   - `Status` → `Reset`
4) **Save**.

### 2) Каждый раз: отправить тестовое письмо (рекомендуется всегда начинать с теста)

Где делать: **Notion**, потом просто подождать.

1) В Notion в таблице Mailouts нажми **New** (или продублируй старое письмо).
2) Если ты **дублировал** письмо, у которого уже был `Done` — нажми кнопку **Reset** и подожди 5–30 секунд (агент сбросит счетчики и вернет в `Not started`).
3) Открой письмо и отредактируй текст/картинки.
4) Нажми кнопку **Send test** в строке письма.
5) Подожди 5–30 секунд:
   - `Status` станет `In progress`, потом `Done`
   - письма придут на адреса из `TEST_EMAILS`

Примечание про картинки: если вставлять картинку в Notion как “upload”, ссылка может быть временной. Для рассылок лучше вставлять картинку **по URL** (внешняя ссылка).

### 3) Реальная рассылка (на всю базу) — только когда тест полностью устраивает

Это необратимо: письмо уйдет всем `active` подписчикам в Supabase.

1) (Terminal) **Разреши** разовую реальную отправку:
   - Открой файл `.env` в `executor/`
   - Найди строку `ALLOW_NON_TEST_SEND=` и поставь:
     - `ALLOW_NON_TEST_SEND=true`
   - Перезапусти агента:
```bash
cd /path/to/AmazonSender/executor
bash tools/macos/agent.sh restart
```
2) (Notion) В строке письма:
   - выключи `Test` (сними галочку)
   - поставь `Status = Send real` (вручную)
3) Подожди, пока `Status` станет `Done`.
4) (Рекомендуется) Сразу после рассылки верни защиту обратно:
   - в `.env` поставь `ALLOW_NON_TEST_SEND=false` (или убери строку)
   - `bash tools/macos/agent.sh restart`

### 4) Если письма не пришли (быстрая проверка)

1) Открой в браузере: `http://127.0.0.1:3000/health` (должно быть `ok: true`)
2) Проверь в `.env`, что `DRY_RUN_SEND=false`
3) Посмотри логи агента (Terminal):
```bash
cd /path/to/AmazonSender/executor
bash tools/macos/agent.sh logs
```

Ниже в этом файле — технические детали (эндпоинты, схемы Notion/Supabase, SNS).

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

## Автозапуск на macOS (без терминала)

Если хочется UX "только Notion": один раз настроить и забыть, можно поставить локальный агент в `launchd`.
Он будет запускаться автоматически при логине и каждые `NOTION_POLL_INTERVAL` мс проверять Notion на команды отправки.

```bash
cd executor
bash tools/macos/agent.sh install
```

Опционально, чтобы видеть результат без логов, можно включить уведомления:
```env
MACOS_NOTIFICATIONS=true
```

Проверка статуса:
```bash
bash tools/macos/agent.sh status
```

Логи:
```bash
bash tools/macos/agent.sh logs
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
- **Status** (status) - рекомендуемые значения:
  - `Not started`
  - `Send` (команда: отправить ТОЛЬКО если Test=true)
  - `Send real` (команда: отправить реальную рассылку, если Test=false)
  - `Reset` (команда: сбросить аналитику и вернуть в Not started)
  - `In progress`
  - `Done`
  - (опционально) `Failed`
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
node import-subscribers.js "/path/to/subscribers.csv"
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
