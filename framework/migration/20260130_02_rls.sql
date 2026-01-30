-- RLS: allow access only to service_role.
-- Apply after 20260130_01_db_schema.sql.

-- subscribers
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscribers_service_role_only ON public.subscribers;
CREATE POLICY subscribers_service_role_only
  ON public.subscribers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.subscribers FROM anon, authenticated;
GRANT ALL ON TABLE public.subscribers TO service_role;

-- send_logs
ALTER TABLE public.send_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS send_logs_service_role_only ON public.send_logs;
CREATE POLICY send_logs_service_role_only
  ON public.send_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.send_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.send_logs TO service_role;
