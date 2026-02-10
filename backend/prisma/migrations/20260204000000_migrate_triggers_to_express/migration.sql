-- Migration: Migrate Triggers to Express.js Backend
-- This migration updates the trigger function to call the new Express.js backend
-- instead of Supabase Edge Functions

-- Enable pg_net extension for HTTP requests from triggers (if not already enabled)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net extension not available or already exists';
END $$;

-- Create trigger_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.trigger_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create or replace the trigger function to call Express.js backend
CREATE OR REPLACE FUNCTION public.trigger_automatic_action_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  step_type_val text;
  action_type_val text;
  decision_node_type_val text;
  config_val jsonb;
  backend_url_val text;
  internal_api_key_val text;
  endpoint_url text;
  request_body jsonb;
  is_automatic_action boolean := false;
  is_agent_decision boolean := false;
  is_agent_action boolean := false;
BEGIN
  -- Only process when status changes to 'running'
  IF NEW.status = 'running' AND (OLD.status IS NULL OR OLD.status != 'running') THEN
    
    -- Fetch the workflow step details
    SELECT ws.step_type, ws.action_type, ws.decision_node_type, ws.config
    INTO step_type_val, action_type_val, decision_node_type_val, config_val
    FROM public.workflow_steps ws
    WHERE ws.id = NEW.step_id;
    
    -- Check if this is an automatic action step, agent action, or agent decision step
    is_automatic_action := step_type_val = 'action' AND action_type_val = 'automatic';
    is_agent_action := step_type_val = 'action' AND action_type_val = 'agent';
    is_agent_decision := step_type_val = 'decision' AND (
      decision_node_type_val = 'Agent' 
      OR decision_node_type_val = 'Agent_Human'
      OR LOWER(decision_node_type_val) = 'agent'
      OR LOWER(decision_node_type_val) = 'agent_human'
    );
    
    -- Only proceed if it's one of the supported step types
    IF is_automatic_action OR is_agent_decision OR is_agent_action THEN
      
      -- Get backend URL and internal API key from trigger_settings
      SELECT setting_value INTO backend_url_val
      FROM public.trigger_settings
      WHERE setting_key = 'backend_url';
      
      SELECT setting_value INTO internal_api_key_val
      FROM public.trigger_settings
      WHERE setting_key = 'internal_api_key';
      
      -- Only attempt HTTP call if we have the necessary configuration
      IF backend_url_val IS NOT NULL AND internal_api_key_val IS NOT NULL THEN
        
        -- Build endpoint URL for Express.js
        endpoint_url := backend_url_val || '/api/workflows/executions/' || NEW.execution_id::text || '/steps/' || NEW.id::text || '/process';
        
        -- Build request body
        request_body := jsonb_build_object(
          'execution_id', NEW.execution_id::text,
          'execution_step_id', NEW.id::text
        );
        
        -- Make async HTTP request to Express.js backend using pg_net
        BEGIN
          PERFORM net.http_post(
            url := endpoint_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-internal-api-key', internal_api_key_val
            ),
            body := request_body
          );
          
          -- Log for debugging
          RAISE LOG 'Triggered step processing via Express.js for execution_step_id: %, url: %', NEW.id, endpoint_url;
          
        EXCEPTION
          WHEN OTHERS THEN
            -- If pg_net fails, log the error but don't fail the transaction
            RAISE WARNING 'Failed to trigger step processing via pg_net: %', SQLERRM;
        END;
      ELSE
        -- Configuration not available, log warning
        RAISE LOG 'Step detected but trigger configuration not available. Configuration needed in trigger_settings table. execution_step_id: %', NEW.id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_workflow_execution_step_running ON public.workflow_execution_steps;

-- Create trigger on workflow_execution_steps table
CREATE TRIGGER on_workflow_execution_step_running
  AFTER UPDATE ON public.workflow_execution_steps
  FOR EACH ROW
  WHEN (NEW.status = 'running' AND (OLD.status IS NULL OR OLD.status != 'running'))
  EXECUTE FUNCTION public.trigger_automatic_action_step();

-- Insert default configuration values (will be updated in next migration)
INSERT INTO public.trigger_settings (setting_key, setting_value) VALUES
  ('backend_url', 'http://backend:3001'),
  ('internal_api_key', 'internal-trigger-key-change-in-production')
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = now();

-- Note: For the trigger to work properly in Docker, ensure that:
-- 1. The backend service is accessible from the database container
-- 2. The internal_api_key matches the INTERNAL_API_KEY environment variable in the backend
-- 3. pg_net extension is properly configured
