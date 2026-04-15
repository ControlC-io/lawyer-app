CREATE TABLE "public"."step_reminder_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_step_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "repeat_every_minutes" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "step_reminder_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "step_reminder_jobs_execution_step_id_key"
ON "public"."step_reminder_jobs" ("execution_step_id");

CREATE INDEX "idx_step_reminder_jobs_status_next_run_at"
ON "public"."step_reminder_jobs" ("status", "next_run_at");

ALTER TABLE "public"."step_reminder_jobs"
ADD CONSTRAINT "step_reminder_jobs_execution_step_id_fkey"
FOREIGN KEY ("execution_step_id")
REFERENCES "public"."workflow_execution_steps"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "public"."step_reminder_jobs"
ADD CONSTRAINT "step_reminder_jobs_company_id_fkey"
FOREIGN KEY ("company_id")
REFERENCES "public"."companies"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
