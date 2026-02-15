-- Add portal fields to companies
ALTER TABLE "public"."companies" ADD COLUMN "slug" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "portal_description" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "portal_primary_color" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "portal_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Add unique constraint on slug
CREATE UNIQUE INDEX "companies_slug_key" ON "public"."companies"("slug");

-- Add portal_enabled to workflows
ALTER TABLE "public"."workflows" ADD COLUMN "portal_enabled" BOOLEAN NOT NULL DEFAULT false;
