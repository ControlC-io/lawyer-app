CREATE INDEX IF NOT EXISTS "workflow_execution_steps_execution_id_step_id_status_idx"
ON "public"."workflow_execution_steps" ("execution_id", "step_id", "status");
