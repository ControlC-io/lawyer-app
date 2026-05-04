-- CreateTable
CREATE TABLE "public"."file_history_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_file_history_events_file_created" ON "public"."file_history_events"("file_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."file_history_events" ADD CONSTRAINT "file_history_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_history_events" ADD CONSTRAINT "file_history_events_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_history_events" ADD CONSTRAINT "file_history_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
