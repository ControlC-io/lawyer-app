import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerApiConfigurationTools(server: McpServer) {
  server.tool(
    'list_api_configurations',
    'List API configurations for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/api-configurations`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_api_configuration',
    'Create, update, or delete an API configuration. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      config_id: z.string().optional().describe('Config ID (required for update/delete)'),
      name: z.string().optional().describe('Configuration name'),
      description: z.string().optional().describe('Configuration description'),
      config_type: z.string().optional().describe('Config type (automatic_action, agent_decision, dynamic_options)'),
      api_url: z.string().optional().describe('API URL'),
      api_method: z.string().optional().describe('HTTP method (GET, POST, etc.)'),
      api_headers: z.array(z.record(z.unknown())).optional().describe('Request headers'),
      api_params: z.array(z.record(z.unknown())).optional().describe('Request parameters'),
      api_data: z.record(z.unknown()).optional().describe('Request body data'),
    },
    async ({ api_key, action, company_id, config_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/api-configurations`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${config_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${config_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
