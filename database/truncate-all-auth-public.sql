-- Remove all data from public and auth schemas (clean before seed).
-- Truncates every table in public and auth except _prisma_migrations.
-- Used by scripts/seed-from-dump.sh

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'auth')
    AND tablename != '_prisma_migrations'
    ORDER BY schemaname, tablename
  )
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;
