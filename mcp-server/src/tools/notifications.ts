import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerNotificationTools(server: McpServer) {
  server.tool(
    'list_notifications',
    'List notifications. Optionally filter by company.',
    {
      api_key: apiKeySchema,
      company_id: z.string().optional().describe('Filter by company ID'),
    },
    async ({ api_key, company_id }) => {
      try {
        const params: Record<string, unknown> = {};
        if (company_id) params.companyId = company_id;
        const api = createApiClient(api_key);
        const res = await api.get('/notifications', params);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'mark_notification_read',
    'Mark a specific notification as read',
    { api_key: apiKeySchema, notification_id: z.string().describe('Notification ID') },
    async ({ api_key, notification_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.patch(`/notifications/${notification_id}/read`, {});
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'mark_all_notifications_read',
    'Mark all notifications as read',
    { api_key: apiKeySchema },
    async ({ api_key }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post('/notifications/mark-all-read', {});
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'send_assignment_notification',
    'Send an assignment notification for a workflow execution step',
    {
      api_key: apiKeySchema,
      execution_step_id: z.string().describe('Execution step ID to notify about'),
    },
    async ({ api_key, execution_step_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post('/notifications/assignment', { execution_step_id });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
