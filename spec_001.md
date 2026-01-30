SES Mailout Executor — Technical Specification

1. Цель

Создать минималистичную утилиту-исполнитель (executor) для разовой или редкой массовой email‑рассылки по существующей базе подписчиков.

Система не является email‑маркетинговой платформой. Она решает одну задачу: получить письмо → безопасно и однократно отправить его через Amazon SES → корректно обновить состояние.

Утилита должна быть достаточно формализована, чтобы её мог реализовать кодовый агент без дополнительных архитектурных решений.

⸻

2. Принципы и ограничения

Что система делает:
	•	принимает команду на отправку одного письма;
	•	извлекает список активных email‑адресов;
	•	отправляет письма через Amazon SES с контролем скорости;
	•	обрабатывает отписки и bounce/complaint;
	•	гарантирует отсутствие двойных отправок.

Чего система сознательно не делает:
	•	сегментация, воронки, триггеры;
	•	A/B тесты;
	•	аналитика открытий/кликов;
	•	CRM‑логика;
	•	маркетинговые автоматизации.

⸻

3. Общая архитектура

Компоненты
	1.	Notion
Используется только как UI и источник контента письма. Настройка Notion и кнопок Send находится вне области данной спецификации.
	2.	Executor Service (Ядро)
HTTP‑сервис (Node.js или Python), развёрнутый на VPS или в контейнере. Stateless между запросами.
	3.	Supabase (Postgres)
Хранилище состояния: подписчики, письма, статусы отправки.
	4.	Amazon SES
Единственный внешний email‑провайдер.
	5.	Amazon SNS
Приём bounce и complaint событий от SES.

Поток данных (high‑level)

Notion → Webhook → Executor → SES → SNS → Executor → Supabase

⸻

4. Модель исполнения

Ключевая идея

Каждый webhook‑запрос инициирует одну попытку отправки одного письма.

Executor:
	•	не хранит состояния в памяти;
	•	не запускает фоновых демонов;
	•	полностью опирается на состояние в базе данных.

⸻

5. HTTP‑контракты

5.1 Endpoint запуска рассылки

POST /send-mailout

Payload:

{
  "mailout_id": "uuid-or-string",
  "auth_token": "shared-secret"
}

Поведение:
	1.	Проверить auth_token.
	2.	Атомарно перевести mailout из состояния ready в sending.
	3.	Если обновлено 0 строк → вернуть ошибку 409 Conflict (уже отправлялось).
	4.	Запустить процесс отправки.
	5.	По завершении перевести статус в sent или failed.

Ответы:
	•	200 OK — отправка выполнена или запущена;
	•	409 Conflict — письмо уже было отправлено;
	•	400 / 401 — ошибка запроса.

⸻

5.2 Endpoint отписки

GET /unsubscribe?token=…

Поведение:
	•	определить email по токену;
	•	пометить подписчика как unsubscribed;
	•	вернуть простую HTML‑страницу подтверждения.

⸻

5.3 Endpoint приёма SNS событий

POST /ses-events

Принимает события:
	•	Bounce
	•	Complaint

Поведение:
	•	извлечь email;
	•	установить статус bounced или unsubscribed;
	•	логировать событие.

⸻

6. Модель данных (Supabase / Postgres)

6.1 Таблица subscribers
	•	id (pk)
	•	email (unique)
	•	status: active | unsubscribed | bounced
	•	created_at

⸻

6.2 Таблица mailouts
	•	id (pk)
	•	subject
	•	body (html or markdown rendered to html)
	•	status: draft | ready | sending | sent | failed
	•	created_at
	•	sent_at

⸻

6.3 (опционально) send_logs
	•	id
	•	mailout_id
	•	email
	•	status (sent | failed)
	•	error_message
	•	created_at

⸻

7. State Machine (ключевой механизм защиты)

Mailout

draft → ready → sending → sent
                     ↘ failed

Переход ready → sending должен быть атомарным:

UPDATE mailouts
SET status = 'sending'
WHERE id = :mailout_id AND status = 'ready';

Если затронуто 0 строк — рассылка уже была инициирована.

⸻

8. Алгоритм отправки
	1.	Загрузить письмо (subject + body).
	2.	Добавить footer с unsubscribe‑ссылкой.
	3.	Получить список subscribers WHERE status = 'active'.
	4.	Отправлять батчами:
	•	batch size: 50
	•	rate limit: 5–8 писем / сек
	•	concurrency: 1
	5.	Ошибки логировать, но не прерывать процесс полностью.
	6.	По завершении установить sent_at.

⸻

9. Rate Limiting
	•	Ограничение задаётся внутри Executor.
	•	Значение должно быть ниже лимита SES (например, 5–8 писем/сек).
	•	Реализуется через sleep/delay между батчами.

⸻

10. Безопасность
	•	Shared secret для webhook.
	•	Проверка SNS подписи.
	•	Никаких публичных endpoint без аутентификации.

⸻

11. Конфигурация (ENV)
	Обязательные:
		•	EXECUTOR_SHARED_SECRET — shared secret для /send-mailout.
		•	APP_BASE_URL — базовый URL сервиса (для формирования unsubscribe-ссылки).
		•	AWS_REGION — регион SES.
		•	AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — IAM ключи (или роль, если доступ из AWS).
		•	SES_FROM_EMAIL — подтверждённый sender в SES.
		•	Один из вариантов подключения к Supabase:
			•	SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (через Supabase SDK), или
			•	DATABASE_URL (прямое подключение к Postgres).

	Необязательные (с дефолтами):
		•	PORT — порт HTTP-сервиса (default: 3000).
		•	LOG_LEVEL — уровень логирования (default: info).
		•	RATE_LIMIT_PER_SEC — лимит отправки (default: 6).
		•	BATCH_SIZE — размер батча (default: 50).
		•	SES_CONFIGURATION_SET — имя configuration set (если используется).
		•	SES_REPLY_TO — Reply-To адрес.
		•	SNS_ALLOWED_TOPIC_ARNS — список разрешённых SNS Topic ARNs (если нужна дополнительная фильтрация).

⸻

12. Ошибки и отказоустойчивость
	•	Частичные ошибки отправки допустимы.
	•	Повторная отправка того же mailout невозможна.
	•	Повторная отправка bounce‑email запрещена.

⸻

13. Нефункциональные требования
	•	Язык реализации: Node.js или Python.
	•	Развёртывание: VPS или Docker.
	•	Executor должен быть stateless.
	•	Все конфиги через ENV.

⸻

14. Вне области ответственности
	•	Настройка Notion.
	•	UI‑редактор писем.
	•	Подготовка HTML‑шаблонов.
	•	Юридический текст CAN‑SPAM.

⸻

15. Критерий готовности

Система считается реализованной, если:
	•	одно письмо может быть отправлено ровно один раз;
	•	unsubscribe и bounce корректно обрабатываются;
	•	Amazon SES не получает жалоб на репутацию;
	•	Executor может быть вызван webhook‑запросом.

⸻

16. Открытые вопросы (если требуется уточнение)
	1.	Язык реализации (Node.js / Python)?
	2.	Нужны ли retry‑механизмы при временных ошибках SES?
	3.	Требуется ли dry‑run режим?

Документ завершён.
