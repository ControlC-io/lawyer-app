import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
}
