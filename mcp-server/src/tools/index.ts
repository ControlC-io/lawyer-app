import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDocumentTools } from './documents.js';
import { registerUsersGroupsTools } from './users-groups.js';
import { registerCompanyTools } from './companies.js';
import { registerNotificationTools } from './notifications.js';

export function registerAllTools(server: McpServer) {
  registerDocumentTools(server);
  registerUsersGroupsTools(server);
  registerCompanyTools(server);
  registerNotificationTools(server);
}
