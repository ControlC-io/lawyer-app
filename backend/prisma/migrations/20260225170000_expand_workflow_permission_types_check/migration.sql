ALTER TABLE "public"."workflow_permissions"
  DROP CONSTRAINT IF EXISTS "workflow_permissions_permission_type_check";

ALTER TABLE "public"."workflow_permissions"
  ADD CONSTRAINT "workflow_permissions_permission_type_check"
  CHECK (
    permission_type = ANY (
      ARRAY[
        'execute'::text,
        'view'::text,
        'visibility'::text,
        'start'::text
      ]
    )
  );
