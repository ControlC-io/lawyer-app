import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerWorkflowTools(server: McpServer) {
  // ── Workflow definitions ──────────────────────────────────────────

  server.tool(
    'list_workflows',
    'List all workflow definitions for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/workflows`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_workflow',
    'Get a workflow definition with its steps, connections, and statuses',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
    },
    async ({ api_key, company_id, workflow_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/workflows/${workflow_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'create_workflow',
    'Create a new workflow definition',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      name: z.string().describe('Workflow name'),
      description: z.string().optional().describe('Workflow description'),
      category_id: z.string().optional().describe('Category ID'),
      icon: z.string().optional().describe('Icon identifier'),
      is_public: z.boolean().optional().describe('Whether the workflow is public'),
      api_enabled: z.boolean().optional().describe('Whether the workflow API trigger is enabled'),
      portal_enabled: z.boolean().optional().describe('Whether the workflow is shown on the portal'),
    },
    async ({ api_key, company_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(`/companies/${company_id}/workflows`, body);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_workflow',
    'Update an existing workflow definition',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
      name: z.string().optional().describe('Workflow name'),
      description: z.string().optional().describe('Workflow description'),
      category_id: z.string().optional().describe('Category ID'),
      icon: z.string().optional().describe('Icon identifier'),
      is_public: z.boolean().optional().describe('Whether the workflow is public'),
      is_active: z.boolean().optional().describe('Whether the workflow is active'),
      api_enabled: z.boolean().optional().describe('Whether API trigger is enabled'),
      portal_enabled: z.boolean().optional().describe('Whether the workflow is shown on the portal'),
      default_status_id: z.string().optional().describe('Default status ID'),
      visibility_scope: z.string().optional().describe('Visibility scope'),
      start_permission_scope: z.string().optional().describe('Start permission scope'),
    },
    async ({ api_key, company_id, workflow_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.patch(`/companies/${company_id}/workflows/${workflow_id}`, body);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'delete_workflow',
    'Delete a workflow definition',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
    },
    async ({ api_key, company_id, workflow_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.delete(`/companies/${company_id}/workflows/${workflow_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_workflow_steps',
    'Bulk upsert workflow steps (replaces all steps for the workflow)',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
      steps: z.array(z.record(z.unknown())).describe('Array of step objects to upsert'),
    },
    async ({ api_key, company_id, workflow_id, steps }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.put(`/companies/${company_id}/workflows/${workflow_id}/steps`, { steps });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_workflow_connections',
    'Replace all connections for a workflow',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
      connections: z.array(z.record(z.unknown())).describe('Array of connection objects'),
    },
    async ({ api_key, company_id, workflow_id, connections }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.put(`/companies/${company_id}/workflows/${workflow_id}/connections`, { connections });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Workflow statuses ─────────────────────────────────────────────

  server.tool(
    'list_workflow_statuses',
    'List statuses for a workflow',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
    },
    async ({ api_key, company_id, workflow_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/workflows/${workflow_id}/statuses`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_workflow_statuses',
    'Create, update, or delete a workflow status. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
      status_id: z.string().optional().describe('Status ID (required for update/delete)'),
      name: z.string().optional().describe('Status name'),
      color: z.string().optional().describe('Status color'),
      order: z.number().optional().describe('Display order'),
    },
    async ({ api_key, action, company_id, workflow_id, status_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/workflows/${workflow_id}/statuses`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${status_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${status_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Workflow permissions ──────────────────────────────────────────

  server.tool(
    'list_workflow_permissions',
    'List permissions for a workflow',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
    },
    async ({ api_key, company_id, workflow_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/workflows/${workflow_id}/permissions`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_workflow_permissions',
    'Add or remove a workflow permission. Set action to "add" or "remove".',
    {
      api_key: apiKeySchema,
      action: z.enum(['add', 'remove']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      workflow_id: z.string().describe('Workflow ID'),
      permission_id: z.string().optional().describe('Permission ID (required for remove)'),
      permission_type: z.string().optional().describe('Permission type: "visibility" or "start" (required for add)'),
      user_id: z.string().optional().describe('User ID to grant permission to'),
      group_id: z.string().optional().describe('Group ID to grant permission to'),
    },
    async ({ api_key, action, company_id, workflow_id, permission_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/workflows/${workflow_id}/permissions`;
        let res;
        switch (action) {
          case 'add':
            res = await api.post(basePath, body);
            break;
          case 'remove':
            res = await api.delete(`${basePath}/${permission_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
