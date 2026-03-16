import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWorkflowTools } from './workflows.js';
import { registerExecutionTools } from './executions.js';
import { registerDocumentTools } from './documents.js';
import { registerDataTableTools } from './data-tables.js';
import { registerUsersGroupsTools } from './users-groups.js';
import { registerCompanyTools } from './companies.js';
import { registerNotificationTools } from './notifications.js';
import { registerGlobalVariableTools } from './global-variables.js';
import { registerApiConfigurationTools } from './api-configurations.js';
import { registerAgentTools } from './agents.js';

export function registerAllTools(server: McpServer) {
  registerWorkflowTools(server);
  registerExecutionTools(server);
  registerDocumentTools(server);
  registerDataTableTools(server);
  registerUsersGroupsTools(server);
  registerCompanyTools(server);
  registerNotificationTools(server);
  registerGlobalVariableTools(server);
  registerApiConfigurationTools(server);
  registerAgentTools(server);
}
