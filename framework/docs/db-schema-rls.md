# DB Schema and RLS (Supabase)

## Scope
- Minimal tables per orchestrator plan section 1.3: `subscribers` (existing) and optional `send_logs`.
- Additive changes only. No data overwrites or drops.
- All tables include `project_id`, `version`, `is_current`.

## Tables

### 1) public.subscribers (existing import)
Add columns (migration 20260130_01_db_schema.sql):
- project_id uuid (nullable for safe backfill)
- version integer default 1
- is_current boolean default true
- status text default 'active'
- bounce_type text
- bounce_subtype text
- status_updated_at timestamptz
- from_name text

Notes:
- `status` values: active | unsubscribed | bounced (per spec).
- `project_id` should be backfilled before enforcing NOT NULL.
- `version`/`is_current` allow soft versioning if needed later.

Indexes:
- subscribers_project_status_idx on (project_id, status)
- subscribers_project_email_idx on (project_id, email)

### 2) public.send_logs (optional)
Create table (migration 20260130_01_db_schema.sql):
- id bigint identity primary key
- project_id uuid NOT NULL
- version integer NOT NULL default 1
- is_current boolean NOT NULL default true
- mailout_id text (Notion page id)
- email text
- status text (sent | failed)
- error_message text
- created_at timestamptz NOT NULL default now()

Indexes:
- send_logs_project_mailout_idx on (project_id, mailout_id)
- send_logs_project_email_idx on (project_id, email)

## RLS
Goal: allow access only via service_role key.
Migration: 20260130_02_rls.sql

Policies:
- subscribers_service_role_only
- send_logs_service_role_only

Each policy:
- FOR ALL
- USING auth.role() = 'service_role'
- WITH CHECK auth.role() = 'service_role'

Additionally:
- REVOKE ALL on both tables from anon, authenticated
- GRANT ALL to service_role

## Migration order
1) Apply: framework/migration/20260130_01_db_schema.sql
2) Apply: framework/migration/20260130_02_rls.sql

## Backfill (manual, safe)
- Populate subscribers.project_id for existing rows before enforcing NOT NULL.
- If you need NOT NULL on subscribers.project_id/version/is_current, apply after backfill.
