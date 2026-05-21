-- AlterTable
ALTER TABLE "public"."workflow_execution_steps" ADD COLUMN "external_token_expires_at" TIMESTAMPTZ(6);
