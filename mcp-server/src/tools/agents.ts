import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerAgentTools(server: McpServer) {
  // ── Agent categories ──────────────────────────────────────────────

  server.tool(
    'list_agent_categories',
    'List agent categories',
    { api_key: apiKeySchema },
    async ({ api_key }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get('/agents/categories');
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_agent_category',
    'Create, update, or delete an agent category. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      category_id: z.string().optional().describe('Category ID (required for update/delete)'),
      name: z.string().optional().describe('Category name'),
      description: z.string().optional().describe('Category description'),
      icon: z.string().optional().describe('Icon identifier'),
    },
    async ({ api_key, action, category_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        let res;
        switch (action) {
          case 'create':
            res = await api.post('/agents/categories', body);
            break;
          case 'update':
            res = await api.patch(`/agents/categories/${category_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`/agents/categories/${category_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Agent configurations ──────────────────────────────────────────

  server.tool(
    'list_agent_configurations',
    'List agent configurations',
    { api_key: apiKeySchema },
    async ({ api_key }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get('/agents/configurations');
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_agent_configuration',
    'Create, update, or delete an agent configuration. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      config_id: z.string().optional().describe('Config ID (required for update/delete)'),
      name: z.string().optional().describe('Configuration name'),
      description: z.string().optional().describe('Description'),
      api_url: z.string().optional().describe('Agent API URL'),
      api_method: z.string().optional().describe('HTTP method'),
      api_headers: z.array(z.record(z.unknown())).optional().describe('Request headers'),
      api_params: z.array(z.record(z.unknown())).optional().describe('Request parameters'),
      category_id: z.string().optional().describe('Agent category ID'),
      agent_type: z.string().optional().describe('Agent type'),
    },
    async ({ api_key, action, config_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        let res;
        switch (action) {
          case 'create':
            res = await api.post('/agents/configurations', body);
            break;
          case 'update':
            res = await api.patch(`/agents/configurations/${config_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`/agents/configurations/${config_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Agent permissions (per-company) ───────────────────────────────

  server.tool(
    'list_agent_permissions',
    'List agent permissions for a company (which agents are enabled)',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/agent-permissions`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_agent_permission',
    'Add, update, or remove an agent permission for a company. Set action to "add", "update", or "remove".',
    {
      api_key: apiKeySchema,
      action: z.enum(['add', 'update', 'remove']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      permission_id: z.string().optional().describe('Permission ID (required for update/remove)'),
      agent_configuration_id: z.string().optional().describe('Agent configuration ID (required for add)'),
      enabled: z.boolean().optional().describe('Whether the agent is enabled'),
    },
    async ({ api_key, action, company_id, permission_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/agent-permissions`;
        let res;
        switch (action) {
          case 'add':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${permission_id}`, body);
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

  // ── Agent usage ───────────────────────────────────────────────────

  server.tool(
    'list_agent_usage',
    'List agent usage records for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/agent-usage`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
