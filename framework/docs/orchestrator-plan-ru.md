# Оркестратор: AmazonSender — общие контракты + карта параллельных задач + мини‑ТЗ

Документ для запуска параллельных подзадач разными агентами в рамках AmazonSender.

---

## 1) Общие контракты (единые для всех задач)

### 1.1 Глобальные правила
- **Не менять продуктовый код**: правки только в `framework/docs`, `framework/review`, `framework/migration`, `framework/logs`.
- Исполнитель stateless; вся логика опирается на Notion + Supabase.
- Повторная отправка запрещена (кроме тестового режима).
- Rate limit отправки: 5–6 писем/сек (настраиваемо через env).
- Логи могут содержать e‑mail (маскировка не требуется).

### 1.2 Входные данные
- CSV экспорт GetResponse (пример: `Waite.csv`) → импорт в Supabase.
- Notion базы: «Письма» и «Ошибки».
- Контент письма хранится в Notion (страница + блоки).

### 1.3 БД‑контракты (минимальный набор)
- `subscribers` (основная таблица из импорта GetResponse) + поля:
  - `status` (active | unsubscribed | bounced)
  - `bounce_type`, `bounce_subtype`, `status_updated_at`
  - `from_name`
- (опционально) `send_logs` для локального трекинга ошибок отправки.
- Хранение mailout в БД не требуется (источник — Notion).

### 1.4 API/поведение (минимум)
- `POST /send-mailout` — запуск рассылки из Notion webhook.
- `GET /unsubscribe?token=...` — отписка.
- `POST /ses-events` — bounce/complaint/delivery из SNS.

### 1.5 Логирование
- Ошибки пишем в Notion (таблица «Ошибки») + CSV по каждой рассылке.
- Технические логи (консоль/файл).

---

## 2) Карта задач и параллельность

### Можно делать параллельно
1) **DB schema + migrations (Supabase)**
2) **Business Logic (Executor Service)**
3) **UI/UX (Notion tables only)**
4) **Tests (unit/integration/e2e)**
5) **DevOps (Vercel env/deploy)**
6) **Test Plan (independent)**
7) **Review Handoff Prep**
8) **Independent Review**
9) **Framework Review (post-run)**

### Зависимости
- Business Logic зависит от полей в Notion + Supabase.
- Tests зависят от схемы и логики.
- Review требует Test Plan + ключевых артефактов.

---

## 3) Мини‑ТЗ и промпты по задачам

### 3.1 Data Research
**Не применяется** (нет внешних таблиц A–D).

### 3.2 DB Schema + (optional) RLS
**Цель:** описать миграции/SQL для Supabase:
- Добавить к `subscribers` поля `status`, `bounce_type`, `bounce_subtype`, `status_updated_at`, `from_name`.
- Опционально добавить `send_logs` (mailout_id, email, status, error_message, created_at).
- RLS: если включаем — разрешить доступ только сервисной роли.

### 3.3 Business Logic
**Цель:** реализовать исполнитель рассылки:
- Чтение записи письма из Notion (subject + body).
- Конвертация Notion blocks → HTML + plain‑text.
- Добавление footer (адрес + unsubscribe) из env.
- Тестовый режим (is_test) → отправка на TEST_EMAILS.
- Не‑тест → отправка только `status=active` из Supabase.
- Rate limit 5–6 писем/сек; батчи 50, concurrency 1.
- SNS: bounce/complaint/delivery → обновить статусы/метрики.
- Отчёт в Notion + таблица ошибок + CSV.

### 3.4 UI/UX
**Цель:** описать Notion‑структуру:
- Таблица «Письма»: поля темы/тела, статус (Send/Failed), is_test, sent_at, метрики.
- Таблица «Ошибки»: поля из ТЗ.
- Никаких отдельных веб‑экранов на старте.

### 3.5 PDF‑генерация
**Не применяется**.

### 3.6 LLM Prompts/Policies
**Не применяется**.

### 3.7 Tests
**Цель:** unit + integration + e2e:
- Unit: конвертация контента, footer, парсер TEST_EMAILS, валидация webhook подписи.
- Integration: Notion/Supabase/SES/SNS моки.
- E2E: тестовая рассылка на TEST_EMAILS.

### 3.8 DevOps
**Цель:** деплой в Vercel:
- Подготовка env‑переменных, GitHub интеграция.
- Локальная отладка перед деплоем.

### 3.9 Test Plan (Independent)
**Цель:** независимый план тестирования.
- Основание: ТЗ + DoD.
- Выход: `framework/review/test-plan.md`.
- Без изменения кода.

### 3.10 Review Handoff Prep
**Цель:** подготовить пакет для независимого ревью.
- Вход: commit/branch, результаты тестов (если есть).
- Выход: `framework/review/handoff.md`, `framework/review/bundle.md`, `framework/review/test-results.md` (опционально).
- Без изменения кода.

### 3.11 Independent Review
**Цель:** независимое код‑ревью и QA.
- Вход: `framework/review/test-plan.md`, `framework/review/review-brief.md`.
- Выход: `framework/review/code-review-report.md`, `framework/review/bug-report.md`, `framework/review/qa-coverage.md`.
- Без изменения кода.

### 3.12 Framework Review (post-run)
**Цель:** анализ работы оркестратора и ошибок фреймворка.
- Вход: `framework/logs/framework-run.jsonl`, `framework/docs/orchestrator-run-summary.md`.
- Выход: `framework/framework-review/framework-log-analysis.md`, `framework/framework-review/framework-bug-report.md`.
- Запускать только между прогонами (нет `framework/logs/framework-run.lock`).
- Запуск: `python3 framework/orchestrator/orchestrator.py --phase post`.

### 3.13 Framework Fix (post-run, manual)
**Цель:** исправить ошибки фреймворка по итогам Framework Review.
- Вход: `framework/framework-review/framework-bug-report.md`, `framework/framework-review/framework-fix-plan.md`.
- Выход: исправления в коде фреймворка.
- Запускать только между прогонами.

---

## 4) Общие входы (креды/данные)
См. `docs/data-inputs-generated.md`.

---

## 5) Ссылки
- `docs/tech-spec-generated.md`
- `docs/plan-generated.md`
- `docs/data-inputs-generated.md`
