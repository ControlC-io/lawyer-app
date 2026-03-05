-- AlterTable: Make folder_id optional on files (flat storage support)
ALTER TABLE "public"."files" ALTER COLUMN "folder_id" DROP NOT NULL;

-- CreateTable: Document permission rules (metadata-based access control)
CREATE TABLE "public"."document_permission_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "permission_type" TEXT NOT NULL DEFAULT 'read',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_permission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Document permission assignments (link rules to users/groups)
CREATE TABLE "public"."document_permission_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID NOT NULL,
    "user_id" UUID,
    "group_id" UUID,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_permission_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Per-user virtual tree view configuration
CREATE TABLE "public"."user_document_tree_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "key_order" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_document_tree_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_document_tree_configs_user_id_company_id_key"
    ON "public"."user_document_tree_configs"("user_id", "company_id");

-- AddForeignKey
ALTER TABLE "public"."document_permission_rules"
    ADD CONSTRAINT "document_permission_rules_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_permission_assignments"
    ADD CONSTRAINT "document_permission_assignments_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "public"."document_permission_rules"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_permission_assignments"
    ADD CONSTRAINT "document_permission_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_permission_assignments"
    ADD CONSTRAINT "document_permission_assignments_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "public"."profile_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_permission_assignments"
    ADD CONSTRAINT "document_permission_assignments_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_document_tree_configs"
    ADD CONSTRAINT "user_document_tree_configs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_document_tree_configs"
    ADD CONSTRAINT "user_document_tree_configs_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
