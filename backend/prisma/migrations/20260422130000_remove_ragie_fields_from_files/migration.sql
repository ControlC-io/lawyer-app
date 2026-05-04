-- Remove Ragie linkage fields from files.
ALTER TABLE "public"."files"
DROP COLUMN IF EXISTS "ragie_document_id",
DROP COLUMN IF EXISTS "ragie_partition",
DROP COLUMN IF EXISTS "ragie_uploaded_at",
DROP COLUMN IF EXISTS "ragie_status",
DROP COLUMN IF EXISTS "ragie_metadata";
