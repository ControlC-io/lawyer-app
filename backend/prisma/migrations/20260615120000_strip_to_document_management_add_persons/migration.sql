-- Strip workflow, execution, data, variables, API config, and agent tables.
-- Add persons table for Lawyer App vertical.

DROP TABLE IF EXISTS "public"."step_reminder_jobs" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_execution_log" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_execution_data" CASCADE;
DROP TABLE IF EXISTS "public"."agent_usage" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_execution_steps" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_executions" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_files" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_connections" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_steps" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_permissions" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_statuses" CASCADE;
DROP TABLE IF EXISTS "public"."workflows" CASCADE;
DROP TABLE IF EXISTS "public"."workflow_categories" CASCADE;
DROP TABLE IF EXISTS "public"."data_table_records" CASCADE;
DROP TABLE IF EXISTS "public"."data_table_fields" CASCADE;
DROP TABLE IF EXISTS "public"."data_tables" CASCADE;
DROP TABLE IF EXISTS "public"."data_global_variables" CASCADE;
DROP TABLE IF EXISTS "public"."api_configurations" CASCADE;
DROP TABLE IF EXISTS "public"."agent_permissions" CASCADE;
DROP TABLE IF EXISTS "public"."agent_configurations" CASCADE;
DROP TABLE IF EXISTS "public"."agent_categories" CASCADE;
DROP TABLE IF EXISTS "public"."trigger_settings" CASCADE;

DROP TYPE IF EXISTS "public"."execution_status" CASCADE;
DROP TYPE IF EXISTS "public"."log_type" CASCADE;
DROP TYPE IF EXISTS "public"."decision_node_type" CASCADE;

CREATE TABLE "public"."persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "national_id" TEXT,
    "notes" TEXT,
    "root_folder_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "persons_root_folder_id_key" ON "public"."persons"("root_folder_id");
CREATE INDEX "idx_persons_company_created" ON "public"."persons"("company_id", "created_at" DESC);

ALTER TABLE "public"."persons" ADD CONSTRAINT "persons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."persons" ADD CONSTRAINT "persons_root_folder_id_fkey" FOREIGN KEY ("root_folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
