-- AlterTable
ALTER TABLE "public"."files" ADD COLUMN     "ocr_pending_metadata_key_ids" JSONB,
ADD COLUMN     "metadata_ai_extract_status" TEXT,
ADD COLUMN     "metadata_ai_extract_error" TEXT;
