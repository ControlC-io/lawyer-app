-- Add person_id and document_type_id to files.
-- These replace the deleted system-managed metadata keys "Personne" and "Type"
-- (see migration 20260616200000_remove_system_managed_metadata_keys).

ALTER TABLE "public"."files"
  ADD COLUMN "person_id" UUID REFERENCES "public"."persons"("id") ON DELETE SET NULL,
  ADD COLUMN "document_type_id" UUID REFERENCES "public"."document_types"("id") ON DELETE SET NULL;

-- Backfill person_id: a file belongs to a person when it lives directly in that person's root folder.
UPDATE "public"."files" f
SET person_id = p.id
FROM "public"."persons" p
WHERE p.root_folder_id IS NOT NULL
  AND f.folder_id = p.root_folder_id;

CREATE INDEX "idx_files_person_id" ON "public"."files" ("person_id");
CREATE INDEX "idx_files_document_type_id" ON "public"."files" ("document_type_id");
