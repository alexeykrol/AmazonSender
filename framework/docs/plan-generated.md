# План работ — AmazonSender

## Этап 0. Закрыть TODO/ASSUMPTION
- Настроить Notion webhook, пройти верификацию, сохранить verification_token.
- Выбрать стратегию конвертации Notion → HTML/Markdown + plain‑text (MVP‑набор блоков).
- Определить источник картинок: внешние URL или re‑fetch Notion file URL перед отправкой.
- Включить SES event publishing (Delivery/Bounce/Complaint) → SNS.

## Этап 1. Подготовка данных и окружения
- Импорт CSV GetResponse в Supabase.
- Добавить `status`, `bounce_type`, `bounce_subtype`, `status_updated_at`, `from_name`.
- Создать таблицы Notion: «Письма», «Ошибки».
- Подготовить env (SES, Supabase, Notion, тестовые адреса, rate limit, base URL).

## Этап 2. Реализация Executor Service
- Эндпоинты: `/send-mailout`, `/unsubscribe`, `/ses-events`.
- Интеграции: Notion API (чтение/обновление), Supabase, SES, SNS.
- Алгоритм отправки с rate limit и тестовым режимом.
- Формирование footer и plain‑text версии.

## Этап 3. Отчётность и ошибки
- Запись отчёта по рассылке в Notion.
- Таблица ошибок в Notion + CSV по рассылке.
- Логи взаимодействий с Notion/SES/Supabase.

## Этап 4. Тестирование
- Автотесты логики ошибок и критичных сценариев.
- Smoke‑прогон на тестовых адресах.

## Этап 5. Деплой
- Локальная отладка.
- Деплой в Vercel через GitHub, настройка env‑секретов.
