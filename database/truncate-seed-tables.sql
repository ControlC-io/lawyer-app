-- Truncate only the tables that are seeded (reverse dependency order).
-- Used by scripts/seed-from-dump.sh

TRUNCATE TABLE
  public.workflow_permissions,
  public.workflow_connections,
  public.workflow_steps,
  public.workflow_statuses,
  public.workflow_categories,
  public.workflows,
  public.agent_permissions,
  public.agent_configurations,
  public.api_configurations,
  public.agent_categories,
  public.companies
RESTART IDENTITY CASCADE;
