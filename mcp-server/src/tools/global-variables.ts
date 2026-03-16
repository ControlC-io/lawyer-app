import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerGlobalVariableTools(server: McpServer) {
  server.tool(
    'list_global_variables',
    'List global variables for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/global-variables`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_global_variable',
    'Create, update, or delete a global variable. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      variable_id: z.string().optional().describe('Variable ID (required for update/delete)'),
      name: z.string().optional().describe('Variable display name'),
      key: z.string().optional().describe('Variable key (used in workflows)'),
      variable_type: z.string().optional().describe('Variable type'),
      value: z.unknown().optional().describe('Variable value'),
      options: z.record(z.unknown()).optional().describe('Variable options'),
    },
    async ({ api_key, action, company_id, variable_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/global-variables`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${variable_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${variable_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
