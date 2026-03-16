import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGetWithEnvKey } from './client.js';

export function registerAllResources(server: McpServer) {
  server.resource(
    'companies',
    'floowly://companies',
    { description: 'List of all accessible companies', mimeType: 'application/json' },
    async (uri) => {
      try {
        const res = await apiGetWithEnvKey('/companies');
        return {
          contents: [{ uri: uri.href, text: JSON.stringify(res.data, null, 2), mimeType: 'application/json' }],
        };
      } catch {
        return { contents: [{ uri: uri.href, text: '[]' }] };
      }
    },
  );

  server.resource(
    'company-workflows',
    new ResourceTemplate('floowly://company/{companyId}/workflows', {
      list: undefined,
    }),
    { description: 'Workflow definitions for a company', mimeType: 'application/json' },
    async (uri, { companyId }) => {
      try {
        const res = await apiGetWithEnvKey(`/companies/${companyId}/workflows`);
        return {
          contents: [{ uri: uri.href, text: JSON.stringify(res.data, null, 2), mimeType: 'application/json' }],
        };
      } catch {
        return { contents: [{ uri: uri.href, text: '[]' }] };
      }
    },
  );

  server.resource(
    'company-data-tables',
    new ResourceTemplate('floowly://company/{companyId}/data-tables', {
      list: undefined,
    }),
    { description: 'Data table schemas for a company', mimeType: 'application/json' },
    async (uri, { companyId }) => {
      try {
        const res = await apiGetWithEnvKey(`/companies/${companyId}/data-tables`);
        return {
          contents: [{ uri: uri.href, text: JSON.stringify(res.data, null, 2), mimeType: 'application/json' }],
        };
      } catch {
        return { contents: [{ uri: uri.href, text: '[]' }] };
      }
    },
  );
}
