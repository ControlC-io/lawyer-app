-- Add Ragie linkage fields to files.
ALTER TABLE "public"."files"
ADD COLUMN "ragie_document_id" TEXT,
ADD COLUMN "ragie_partition" TEXT,
ADD COLUMN "ragie_uploaded_at" TIMESTAMPTZ(6),
ADD COLUMN "ragie_status" TEXT,
ADD COLUMN "ragie_metadata" JSONB;
