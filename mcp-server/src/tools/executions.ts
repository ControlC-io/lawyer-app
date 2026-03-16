import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerExecutionTools(server: McpServer) {
  server.tool(
    'list_executions',
    'List workflow executions for a company. Supports filtering by workflow, status, and category.',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().optional().describe('Filter by workflow ID'),
      status: z.string().optional().describe('Filter by status (pending, running, completed, failed, paused)'),
      category_id: z.string().optional().describe('Filter by workflow category ID'),
      include_data: z.boolean().optional().describe('Include execution data in the response'),
    },
    async ({ api_key, company_id, workflow_id, status, category_id, include_data }) => {
      try {
        const params: Record<string, unknown> = {};
        if (workflow_id) params.workflowId = workflow_id;
        if (status) params.status = status;
        if (category_id) params.categoryId = category_id;
        if (include_data) params.includeData = include_data;
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/executions`, params);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_execution',
    'Get execution details including data and step information',
    { api_key: apiKeySchema, execution_id: z.string().describe('Execution ID') },
    async ({ api_key, execution_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/workflows/executions/${execution_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_execution_data',
    'Get only the execution_data_mapped key for an execution (flat key-value data).',
    { api_key: apiKeySchema, execution_id: z.string().describe('Execution ID') },
    async ({ api_key, execution_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/workflows/executions/${execution_id}`);
        const data = res.data?.execution_data_mapped ?? {};
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'trigger_workflow',
    'Start a new workflow execution by triggering it via API',
    {
      api_key: apiKeySchema,
      workflow_id: z.string().describe('Workflow ID to trigger'),
      data: z.record(z.unknown()).optional().describe('Initial execution data'),
    },
    async ({ api_key, workflow_id, data }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(`/workflows/${workflow_id}/trigger`, { data: data ?? {} });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'complete_step',
    'Complete a workflow step and advance the execution to the next step',
    {
      api_key: apiKeySchema,
      execution_id: z.string().describe('Execution ID'),
      step_id: z.string().describe('Execution step ID to complete'),
      data: z.record(z.unknown()).optional().describe('Step completion data'),
    },
    async ({ api_key, execution_id, step_id, data }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(
          `/workflows/executions/${execution_id}/steps/${step_id}/complete`,
          data ?? {},
        );
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'make_decision',
    'Submit a decision choice at a decision step',
    {
      api_key: apiKeySchema,
      execution_id: z.string().describe('Execution ID'),
      step_id: z.string().describe('Execution step ID (decision step)'),
      choice: z.string().describe('The decision choice value'),
    },
    async ({ api_key, execution_id, step_id, choice }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(
          `/workflows/executions/${execution_id}/steps/${step_id}/decision`,
          { choice },
        );
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_execution_data',
    'Update execution data values',
    {
      api_key: apiKeySchema,
      execution_id: z.string().describe('Execution ID'),
      values: z.record(z.unknown()).describe('Key-value pairs to update in execution data'),
    },
    async ({ api_key, execution_id, values }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.put(`/workflows/executions/${execution_id}/data`, { values });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'rename_execution',
    'Rename a workflow execution',
    {
      api_key: apiKeySchema,
      execution_id: z.string().describe('Execution ID'),
      name: z.string().describe('New name for the execution'),
    },
    async ({ api_key, execution_id, name }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.patch(`/workflows/executions/${execution_id}/name`, { name });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'delete_execution',
    'Delete a workflow execution',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      execution_id: z.string().describe('Execution ID'),
    },
    async ({ api_key, company_id, execution_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.delete(`/companies/${company_id}/executions/${execution_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'add_execution_log',
    'Add a log entry to a workflow execution',
    {
      api_key: apiKeySchema,
      execution_id: z.string().describe('Execution ID'),
      log_text: z.string().describe('Log message text'),
      log_type: z.enum(['Info', 'Success', 'Error']).optional().describe('Log severity type'),
      step_id: z.string().optional().describe('Execution step ID this log relates to'),
    },
    async ({ api_key, execution_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(`/workflows/executions/${execution_id}/logs`, body);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_execution_step',
    'Update an execution step (e.g. reassign to a different user or group)',
    {
      api_key: apiKeySchema,
      execution_id: z.string().describe('Execution ID'),
      step_id: z.string().describe('Execution step ID'),
      assigned_to_user_id: z.string().optional().describe('Reassign to user ID'),
      assigned_to_group_id: z.string().optional().describe('Reassign to group ID'),
    },
    async ({ api_key, execution_id, step_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.patch(
          `/workflows/executions/${execution_id}/steps/${step_id}`,
          body,
        );
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
