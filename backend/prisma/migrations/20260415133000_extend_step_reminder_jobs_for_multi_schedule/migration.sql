ALTER TABLE "public"."step_reminder_jobs"
ADD COLUMN "reminder_key" TEXT;

UPDATE "public"."step_reminder_jobs"
SET "reminder_key" = 'repeat'
WHERE "reminder_key" IS NULL;

ALTER TABLE "public"."step_reminder_jobs"
ALTER COLUMN "reminder_key" SET NOT NULL;

ALTER TABLE "public"."step_reminder_jobs"
ADD COLUMN "max_count" INTEGER,
ADD COLUMN "sent_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "schedule_minutes" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "schedule_index" INTEGER;

DROP INDEX IF EXISTS "step_reminder_jobs_execution_step_id_key";

CREATE INDEX "idx_step_reminder_jobs_execution_step_id"
ON "public"."step_reminder_jobs" ("execution_step_id");

CREATE UNIQUE INDEX "step_reminder_jobs_execution_step_reminder_key"
ON "public"."step_reminder_jobs" ("execution_step_id", "reminder_key");
