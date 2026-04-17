-- Add archive columns for soft-delete support
ALTER TABLE "public"."workflows"
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archived_datetime" TIMESTAMPTZ(6);

ALTER TABLE "public"."workflow_executions"
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archived_datetime" TIMESTAMPTZ(6);

ALTER TABLE "public"."agent_configurations"
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archived_datetime" TIMESTAMPTZ(6);

ALTER TABLE "public"."files"
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archived_datetime" TIMESTAMPTZ(6);

-- Indexes for read filtering and retention purge lookups
CREATE INDEX "idx_workflows_archive" ON "public"."workflows"("is_archived", "archived_datetime");
CREATE INDEX "idx_workflow_executions_archive" ON "public"."workflow_executions"("is_archived", "archived_datetime");
CREATE INDEX "idx_agent_configurations_archive" ON "public"."agent_configurations"("is_archived", "archived_datetime");
CREATE INDEX "idx_files_archive" ON "public"."files"("is_archived", "archived_datetime");
