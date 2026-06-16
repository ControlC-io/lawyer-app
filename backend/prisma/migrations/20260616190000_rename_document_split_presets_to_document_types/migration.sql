-- Rename document_split_presets → document_types
ALTER TABLE "public"."document_split_presets" RENAME TO "document_types";

ALTER INDEX "idx_document_split_presets_company_created_at"
  RENAME TO "idx_document_types_company_created_at";

ALTER TABLE "public"."document_types"
  RENAME CONSTRAINT "document_split_presets_pkey" TO "document_types_pkey";

ALTER TABLE "public"."document_types"
  RENAME CONSTRAINT "document_split_presets_company_id_fkey" TO "document_types_company_id_fkey";
