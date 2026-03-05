-- Consolidate documents.manage_structure and documents.manage_files into documents.manage
-- First update existing permission keys
UPDATE "public"."role_permissions"
SET "permission_key" = 'documents.manage'
WHERE "permission_key" IN ('documents.manage_structure', 'documents.manage_files');

-- Remove duplicates that may have been created (keep one per role)
DELETE FROM "public"."role_permissions" a
USING "public"."role_permissions" b
WHERE a."id" > b."id"
  AND a."role_id" = b."role_id"
  AND a."permission_key" = b."permission_key";
