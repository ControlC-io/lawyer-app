# Database Trigger Setup Guide

## Overview

The PostgreSQL triggers automatically process workflow steps when they transition to `running` status by calling the Express.js backend via the `pg_net` extension.

## Prerequisites

1. PostgreSQL database with `pg_net` extension support
2. Express.js backend running and accessible from database
3. Database migration applied: `20260204000000_migrate_triggers_to_express`

## Configuration Steps

### 1. Apply the Migration

The migration is automatically applied when you run:

```bash
npm run migrate:deploy
```

This will:
- Create the `trigger_settings` table
- Install the `pg_net` extension
- Create the `trigger_automatic_action_step()` function
- Create the trigger on `workflow_execution_steps` table

### 2. Verify Trigger Settings

Check that the trigger settings are configured correctly:

```sql
SELECT * FROM public.trigger_settings;
```

You should see:
- `backend_url`: `http://backend:3001`
- `internal_api_key`: `internal-trigger-key-change-in-production`

### 3. Update Configuration (Production)

For production, update the trigger settings:

```sql
UPDATE public.trigger_settings 
SET setting_value = 'https://your-production-domain.com'
WHERE setting_key = 'backend_url';

UPDATE public.trigger_settings 
SET setting_value = 'your-secure-internal-api-key'
WHERE setting_key = 'internal_api_key';
```

**Important**: The `internal_api_key` must match the `INTERNAL_API_KEY` environment variable in your backend service.

## How It Works

### Trigger Flow

1. When a `workflow_execution_step` status changes to `running`
2. The trigger checks if it's an automatic/agent action or decision step
3. It reads `backend_url` and `internal_api_key` from `trigger_settings`
4. It makes an HTTP POST request to:
   ```
   {backend_url}/api/workflows/executions/{execution_id}/steps/{step_id}/process
   ```
5. The request includes the internal API key for authentication
6. The Express.js backend processes the step and advances the workflow

### Supported Step Types

The trigger automatically processes:
- **Automatic Actions**: `step_type = 'action'` AND `action_type = 'automatic'`
- **Agent Actions**: `step_type = 'action'` AND `action_type = 'agent'`
- **Agent Decisions**: `step_type = 'decision'` AND `decision_node_type IN ('Agent', 'Agent_Human')`

## Troubleshooting

### Trigger Not Firing

Check trigger is enabled:
```sql
SELECT * FROM pg_trigger 
WHERE tgname = 'on_workflow_execution_step_running';
```

### HTTP Requests Failing

Check `pg_net` extension:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

View trigger logs:
```sql
-- Enable logging in postgresql.conf
log_statement = 'all'
log_min_messages = 'log'

-- Then check PostgreSQL logs
```

### Backend Not Reachable

Ensure backend service is accessible from database container:
```bash
# From database container
curl http://backend:3001/health
```

## Docker Networking

In Docker Compose, ensure:
- Backend and database are on the same network
- Backend service name matches URL in trigger_settings (`backend`)
- Backend exposes port 3001

## Manual Testing

Test trigger manually:

```sql
-- Create a test execution step and set to running
UPDATE workflow_execution_steps 
SET status = 'running' 
WHERE id = 'your-test-step-id';

-- Check backend logs for incoming request
```

## Disabling Triggers

To temporarily disable automatic processing:

```sql
ALTER TABLE workflow_execution_steps 
DISABLE TRIGGER on_workflow_execution_step_running;

-- Re-enable when ready
ALTER TABLE workflow_execution_steps 
ENABLE TRIGGER on_workflow_execution_step_running;
```

## Hybrid Mode

The system supports both trigger-based and manual workflow advancement:
- Triggers handle automatic steps
- Application code can also call the process endpoint directly
- No conflicts - idempotent step processing
