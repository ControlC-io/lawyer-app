ALTER TABLE public.workflow_steps
DROP CONSTRAINT IF EXISTS workflow_steps_action_type_check;

ALTER TABLE public.workflow_steps
ADD CONSTRAINT workflow_steps_action_type_check
CHECK (
  action_type IS NULL
  OR action_type = ANY (ARRAY[
    'manual'::text,
    'automatic'::text,
    'agent'::text,
    'email'::text
  ])
);
