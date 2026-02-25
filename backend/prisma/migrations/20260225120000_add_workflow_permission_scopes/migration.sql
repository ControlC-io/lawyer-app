ALTER TABLE "public"."workflows" ADD COLUMN "visibility_scope" TEXT;
ALTER TABLE "public"."workflows" ADD COLUMN "start_permission_scope" TEXT;

UPDATE "public"."workflows"
SET
  "visibility_scope" = CASE WHEN "is_public" THEN 'all_company' ELSE 'specific' END,
  "start_permission_scope" = CASE WHEN "is_public" THEN 'public' ELSE 'specific' END;

ALTER TABLE "public"."workflows"
  ALTER COLUMN "visibility_scope" SET NOT NULL,
  ALTER COLUMN "visibility_scope" SET DEFAULT 'all_company',
  ALTER COLUMN "start_permission_scope" SET NOT NULL,
  ALTER COLUMN "start_permission_scope" SET DEFAULT 'public';
