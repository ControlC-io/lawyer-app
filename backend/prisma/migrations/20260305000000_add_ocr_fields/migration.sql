-- AlterTable
ALTER TABLE "files" ADD COLUMN "ocr_markdown" TEXT,
ADD COLUMN "ocr_status" TEXT,
ADD COLUMN "ocr_error" TEXT,
ADD COLUMN "ocr_processed_at" TIMESTAMPTZ(6),
ADD COLUMN "ocr_provider" TEXT,
ADD COLUMN "ocr_model" TEXT;

-- CreateIndex
CREATE INDEX idx_files_ocr_fts ON "files"
  USING GIN (to_tsvector('simple', coalesce(ocr_markdown, '')));
