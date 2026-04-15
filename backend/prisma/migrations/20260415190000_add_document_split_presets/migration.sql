-- CreateTable: Company-shared split PDF presets
CREATE TABLE "public"."document_split_presets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "naming_instructions" TEXT NOT NULL,
    "metadata_key_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_split_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_document_split_presets_company_created_at"
    ON "public"."document_split_presets"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "public"."document_split_presets"
    ADD CONSTRAINT "document_split_presets_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
