import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerUsersGroupsTools(server: McpServer) {
  // ── Users ─────────────────────────────────────────────────────────

  server.tool(
    'list_users',
    'List users in a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/users`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_my_permissions',
    'Get the permissions for the current authentication context within a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/my-permissions`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_my_group_ids',
    'Get group IDs the current user belongs to',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/my-group-ids`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'assign_user_role',
    'Assign a role to a user within a company',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      user_id: z.string().describe('User ID'),
      role: z.string().optional().describe('Company role (company_admin or user)'),
      custom_role_id: z.string().optional().describe('Custom role ID'),
    },
    async ({ api_key, company_id, user_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.patch(`/companies/${company_id}/users/${user_id}/role`, body);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'remove_user_from_company',
    'Remove a user from a company',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      user_id: z.string().describe('User ID to remove'),
    },
    async ({ api_key, company_id, user_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.delete(`/companies/${company_id}/users/${user_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Groups ────────────────────────────────────────────────────────

  server.tool(
    'list_groups',
    'List groups in a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/groups`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_group',
    'Create, update, or delete a group. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      group_id: z.string().optional().describe('Group ID (required for update/delete)'),
      name: z.string().optional().describe('Group name'),
      description: z.string().optional().describe('Group description'),
    },
    async ({ api_key, action, company_id, group_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/groups`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${group_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${group_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'list_group_members',
    'List members of a specific group',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      group_id: z.string().describe('Group ID'),
    },
    async ({ api_key, company_id, group_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/groups/${group_id}/members`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_group_members',
    'Add or remove a member from a group. Set action to "add" or "remove".',
    {
      api_key: apiKeySchema,
      action: z.enum(['add', 'remove']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      group_id: z.string().describe('Group ID'),
      profile_id: z.string().describe('Profile ID of the member'),
      member_id: z.string().optional().describe('Member record ID (required for remove by ID)'),
    },
    async ({ api_key, action, company_id, group_id, profile_id, member_id }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/groups/${group_id}/members`;
        let res;
        switch (action) {
          case 'add':
            res = await api.post(basePath, { profile_id });
            break;
          case 'remove':
            if (member_id) {
              res = await api.delete(`${basePath}/${member_id}`);
            } else {
              res = await api.delete(`${basePath}/by-profile/${profile_id}`);
            }
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Invitations ───────────────────────────────────────────────────

  server.tool(
    'list_invitations',
    'List pending invitations for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/invitations`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'invite_user',
    'Send an invitation to join a company',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      email: z.string().describe('Email address to invite'),
      role: z.string().optional().describe('Role to assign (company_admin or user)'),
    },
    async ({ api_key, company_id, email, role }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(`/companies/${company_id}/invitations`, { email, role });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'cancel_invitation',
    'Cancel a pending invitation',
    { api_key: apiKeySchema, invitation_id: z.string().describe('Invitation ID') },
    async ({ api_key, invitation_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.delete(`/invitations/${invitation_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
