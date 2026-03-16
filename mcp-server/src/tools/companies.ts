import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerCompanyTools(server: McpServer) {
  server.tool(
    'list_companies',
    'List companies accessible to the current authentication context',
    { api_key: apiKeySchema },
    async ({ api_key }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get('/companies');
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_company',
    'Get details for a specific company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'create_company',
    'Create a new company (super admin only)',
    { api_key: apiKeySchema, name: z.string().describe('Company name') },
    async ({ api_key, name }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post('/companies', { name });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_company',
    'Update company settings',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      name: z.string().optional().describe('Company name'),
      slug: z.string().optional().describe('Portal slug'),
      portal_description: z.string().optional().describe('Portal description'),
      portal_primary_color: z.string().optional().describe('Portal primary color'),
      portal_enabled: z.boolean().optional().describe('Enable company portal'),
    },
    async ({ api_key, company_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.patch(`/companies/${company_id}`, body);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Roles ─────────────────────────────────────────────────────────

  server.tool(
    'list_roles',
    'List RBAC roles for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/roles`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_role',
    'Get a specific role with its permissions',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      role_id: z.string().describe('Role ID'),
    },
    async ({ api_key, company_id, role_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/roles/${role_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_role',
    'Create, update, or delete an RBAC role. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      role_id: z.string().optional().describe('Role ID (required for update/delete)'),
      name: z.string().optional().describe('Role name'),
      description: z.string().optional().describe('Role description'),
      permissions: z.array(z.string()).optional().describe('Permission keys to assign'),
    },
    async ({ api_key, action, company_id, role_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/roles`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${role_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${role_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_permission_catalogue',
    'Get the full catalogue of available permissions',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/permission-catalogue`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Workflow categories ───────────────────────────────────────────

  server.tool(
    'list_workflow_categories',
    'List workflow categories for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/workflow-categories`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_workflow_category',
    'Create, update, or delete a workflow category. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      category_id: z.string().optional().describe('Category ID (required for update/delete)'),
      name: z.string().optional().describe('Category name'),
      description: z.string().optional().describe('Category description'),
      icon: z.string().optional().describe('Icon identifier'),
      parent_category_id: z.string().optional().describe('Parent category ID'),
    },
    async ({ api_key, action, company_id, category_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/workflow-categories`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${category_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${category_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
