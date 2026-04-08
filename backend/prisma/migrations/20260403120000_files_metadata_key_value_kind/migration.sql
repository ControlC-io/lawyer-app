-- CreateEnum
CREATE TYPE "public"."files_metadata_value_kind" AS ENUM ('free_text', 'predefined_list');

-- AlterTable
ALTER TABLE "public"."files_metadata_keys" ADD COLUMN "value_kind" "public"."files_metadata_value_kind" NOT NULL DEFAULT 'free_text';
ALTER TABLE "public"."files_metadata_keys" ADD COLUMN "allowed_values" JSONB NOT NULL DEFAULT '[]';
