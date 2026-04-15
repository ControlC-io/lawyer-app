ALTER TABLE "public"."companies"
ADD COLUMN "portal_default_language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "portal_enabled_languages" JSONB NOT NULL DEFAULT '["en"]';

ALTER TABLE "public"."workflows"
ADD COLUMN "name_i18n" JSONB,
ADD COLUMN "description_i18n" JSONB;
