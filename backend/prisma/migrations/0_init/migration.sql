-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create Enums
DO $$ BEGIN
    CREATE TYPE company_role AS ENUM ('company_admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE execution_status AS ENUM ('pending', 'running', 'completed', 'failed', 'paused');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE log_type AS ENUM ('Info', 'Success', 'Error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE decision_node_type AS ENUM ('Human', 'Agent', 'Agent_Human');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Protect auth schema: only admin can modify it
-- We'll assume 'postgres' is the superuser/admin role.
-- Revoke all permissions from PUBLIC to protect the schema
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO PUBLIC;

-- Create auth.users table (minimal Supabase-compatible structure)
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  encrypted_password text,
  email_confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Allow PUBLIC to read auth.users to satisfy foreign key checks, but not modify
GRANT SELECT ON auth.users TO PUBLIC;

-- Create public tables
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  api_key text UNIQUE,
  is_active boolean DEFAULT true,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  notifications_enabled boolean DEFAULT true,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE public.agent_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agent_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.agent_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  api_url text NOT NULL,
  api_method text NOT NULL DEFAULT 'POST'::text CHECK (api_method = ANY (ARRAY['GET'::text, 'POST'::text, 'PUT'::text, 'PATCH'::text, 'DELETE'::text])),
  api_headers jsonb DEFAULT '[]'::jsonb,
  api_params jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  category_id uuid,
  agent_type text,
  CONSTRAINT agent_configurations_pkey PRIMARY KEY (id),
  CONSTRAINT agent_configurations_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.agent_categories(id)
);

CREATE TABLE public.agent_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_configuration_id uuid NOT NULL,
  company_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agent_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT agent_permissions_agent_configuration_id_fkey FOREIGN KEY (agent_configuration_id) REFERENCES public.agent_configurations(id),
  CONSTRAINT agent_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.api_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  config_type text NOT NULL CHECK (config_type = ANY (ARRAY['automatic_action'::text, 'agent_decision'::text, 'dynamic_options'::text])),
  api_url text NOT NULL,
  api_method text NOT NULL DEFAULT 'POST'::text CHECK (api_method = ANY (ARRAY['GET'::text, 'POST'::text, 'PUT'::text, 'PATCH'::text, 'DELETE'::text])),
  api_headers jsonb DEFAULT '[]'::jsonb,
  api_params jsonb DEFAULT '[]'::jsonb,
  api_data jsonb DEFAULT '[]'::jsonb,
  company_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_configurations_pkey PRIMARY KEY (id),
  CONSTRAINT api_configurations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.data_global_variables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  key text,
  variable_type text NOT NULL,
  options jsonb DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  value jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_locked boolean NOT NULL DEFAULT false,
  CONSTRAINT data_global_variables_pkey PRIMARY KEY (id),
  CONSTRAINT data_global_variables_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.data_tables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  company_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  primary_field_id uuid,
  CONSTRAINT data_tables_pkey PRIMARY KEY (id),
  CONSTRAINT data_tables_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.data_table_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL,
  name text NOT NULL,
  field_type text NOT NULL,
  options jsonb,
  position integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  company_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT data_table_fields_pkey PRIMARY KEY (id),
  CONSTRAINT data_table_fields_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.data_tables(id),
  CONSTRAINT data_table_fields_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

-- Add primary_field_id constraint to data_tables now that data_table_fields is created
ALTER TABLE public.data_tables 
  ADD CONSTRAINT data_tables_primary_field_id_fkey 
  FOREIGN KEY (primary_field_id) REFERENCES public.data_table_fields(id);

CREATE TABLE public.data_table_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  company_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  position integer NOT NULL DEFAULT 0,
  CONSTRAINT data_table_records_pkey PRIMARY KEY (id),
  CONSTRAINT data_table_records_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.data_tables(id),
  CONSTRAINT data_table_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT data_table_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.folders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  parent_folder_id uuid,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT folders_pkey PRIMARY KEY (id),
  CONSTRAINT folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.folders(id),
  CONSTRAINT folders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  folder_id uuid NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT files_pkey PRIMARY KEY (id),
  CONSTRAINT files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id),
  CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id),
  CONSTRAINT files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.files_metadata_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT files_metadata_keys_pkey PRIMARY KEY (id),
  CONSTRAINT files_metadata_keys_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.files_metadata_values (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  files_id uuid NOT NULL,
  metadata_id uuid NOT NULL,
  value text NOT NULL,
  company_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT files_metadata_values_pkey PRIMARY KEY (id),
  CONSTRAINT files_metadata_values_files_id_fkey FOREIGN KEY (files_id) REFERENCES public.files(id),
  CONSTRAINT files_metadata_values_metadata_id_fkey FOREIGN KEY (metadata_id) REFERENCES public.files_metadata_keys(id),
  CONSTRAINT files_metadata_values_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.profile_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  company_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_groups_pkey PRIMARY KEY (id),
  CONSTRAINT profile_groups_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT profile_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.folder_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  user_id uuid,
  group_id uuid,
  permission_type text NOT NULL CHECK (permission_type = ANY (ARRAY['read'::text, 'write'::text, 'admin'::text])),
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT folder_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT folder_permissions_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id),
  CONSTRAINT folder_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT folder_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT folder_permissions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.profile_groups(id)
);

CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  role company_role NOT NULL DEFAULT 'user'::company_role,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id)
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.profile_admin_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE,
  super_admin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profile_admin_roles_pkey PRIMARY KEY (id),
  CONSTRAINT profile_admin_roles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.profile_group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid,
  profile_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profile_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT profile_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.profile_groups(id),
  CONSTRAINT profile_group_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.trigger_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT trigger_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_company (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  role company_role NOT NULL DEFAULT 'user'::company_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_company_pkey PRIMARY KEY (id),
  CONSTRAINT user_company_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_company_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.workflow_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  parent_category_id uuid,
  icon text,
  company_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_categories_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.workflow_categories(id),
  CONSTRAINT workflow_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  file_enabled boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  api_enabled boolean NOT NULL DEFAULT false,
  data_structure jsonb DEFAULT '[]'::jsonb,
  category_id uuid,
  icon text,
  default_status_id uuid,
  is_active boolean DEFAULT false,
  canvas_comments jsonb,
  CONSTRAINT workflows_pkey PRIMARY KEY (id),
  CONSTRAINT workflows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT workflows_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.workflow_categories(id)
);

CREATE TABLE public.workflow_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  name text NOT NULL,
  "order" integer NOT NULL,
  color text NOT NULL CHECK (color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'::text),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  CONSTRAINT workflow_statuses_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_statuses_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_statuses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

-- Add default_status_id constraint to workflows
ALTER TABLE public.workflows
  ADD CONSTRAINT workflows_default_status_id_fkey 
  FOREIGN KEY (default_status_id) REFERENCES public.workflow_statuses(id);

CREATE TABLE public.workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  step_type text NOT NULL CHECK (step_type = ANY (ARRAY['start'::text, 'action'::text, 'decision'::text, 'end'::text, 'edit_form'::text, 'file'::text])),
  name text NOT NULL,
  position_x numeric NOT NULL DEFAULT 0,
  position_y numeric NOT NULL DEFAULT 0,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_to_user_id uuid,
  assigned_to_group_id uuid,
  decision_node_type decision_node_type,
  company_id uuid,
  action_type text DEFAULT 'manual'::text CHECK (action_type = ANY (ARRAY['manual'::text, 'automatic'::text, 'agent'::text])),
  CONSTRAINT workflow_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_steps_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.profiles(id),
  CONSTRAINT workflow_steps_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT workflow_steps_assigned_to_group_id_fkey FOREIGN KEY (assigned_to_group_id) REFERENCES public.profile_groups(id)
);

CREATE TABLE public.workflow_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  status execution_status NOT NULL DEFAULT 'pending'::execution_status,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  current_step_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  execution_data jsonb DEFAULT '{}'::jsonb,
  name text,
  CONSTRAINT workflow_executions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_executions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT workflow_executions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT workflow_executions_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES public.workflow_steps(id)
);

CREATE TABLE public.workflow_execution_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL,
  step_id uuid NOT NULL,
  status execution_status NOT NULL DEFAULT 'pending'::execution_status,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  step_data jsonb DEFAULT '{}'::jsonb,
  decision_choice text,
  assigned_to_user_id uuid,
  assigned_to_group_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  external_token uuid,
  CONSTRAINT workflow_execution_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_execution_steps_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_executions(id),
  CONSTRAINT workflow_execution_steps_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT workflow_execution_steps_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.workflow_steps(id),
  CONSTRAINT workflow_execution_steps_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.profiles(id),
  CONSTRAINT workflow_execution_steps_assigned_to_group_id_fkey FOREIGN KEY (assigned_to_group_id) REFERENCES public.profile_groups(id)
);

CREATE TABLE public.agent_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_execution_id uuid,
  agent_id uuid,
  model_name text,
  input_tokens bigint,
  thinking_tokens bigint,
  output_tokens bigint,
  total_cost numeric,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agent_usage_pkey PRIMARY KEY (id),
  CONSTRAINT agent_usage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT agent_usage_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent_configurations(id),
  CONSTRAINT agent_usage_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES public.workflow_executions(id)
);

CREATE TABLE public.workflow_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  source_step_id uuid NOT NULL,
  target_step_id uuid NOT NULL,
  output_name text DEFAULT 'default'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  config jsonb,
  CONSTRAINT workflow_connections_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_connections_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT workflow_connections_source_step_id_fkey FOREIGN KEY (source_step_id) REFERENCES public.workflow_steps(id),
  CONSTRAINT workflow_connections_target_step_id_fkey FOREIGN KEY (target_step_id) REFERENCES public.workflow_steps(id)
);

CREATE TABLE public.workflow_execution_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  values jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT workflow_execution_data_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_execution_data_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_executions(id),
  CONSTRAINT workflow_execution_data_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.workflow_execution_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  log_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  step_id uuid,
  log_type log_type,
  CONSTRAINT workflow_execution_log_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_execution_log_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_executions(id),
  CONSTRAINT workflow_execution_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT workflow_execution_log_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.workflow_execution_steps(id)
);

CREATE TABLE public.workflow_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  file_id uuid NOT NULL,
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_files_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_files_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id),
  CONSTRAINT workflow_files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.workflow_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  user_id uuid,
  group_id uuid,
  permission_type text NOT NULL CHECK (permission_type = ANY (ARRAY['execute'::text])),
  company_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_permissions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT workflow_permissions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.profile_groups(id),
  CONSTRAINT workflow_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
