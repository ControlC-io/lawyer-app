-- Remove system-managed metadata keys "Personne" and "Type".
-- Person and document type are now tracked via dedicated system fields (person_id, document_type_id),
-- not as metadata keys. Delete their values first (FK constraint), then the keys themselves.

DELETE FROM "files_metadata_values"
WHERE "metadata_id" IN (
  SELECT "id" FROM "files_metadata_keys" WHERE "name" IN ('Personne', 'Type')
);

DELETE FROM "files_metadata_keys" WHERE "name" IN ('Personne', 'Type');
