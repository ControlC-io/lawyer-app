-- AlterTable
ALTER TABLE "public"."agent_configurations" ADD COLUMN IF NOT EXISTS "prompt_template" TEXT;
