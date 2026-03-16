import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerDocumentTools(server: McpServer) {
  // ── Folders ───────────────────────────────────────────────────────

  server.tool(
    'list_folders',
    'List document folders for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/folders`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_folder',
    'Create, update, or delete a document folder. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      folder_id: z.string().optional().describe('Folder ID (required for update/delete)'),
      name: z.string().optional().describe('Folder name'),
      description: z.string().optional().describe('Folder description'),
      parent_folder_id: z.string().optional().describe('Parent folder ID'),
    },
    async ({ api_key, action, company_id, folder_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/folders`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${folder_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${folder_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Files ─────────────────────────────────────────────────────────

  server.tool(
    'list_files',
    'List files for a company. Optionally filter by folder or specific file IDs.',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      folder_id: z.string().optional().describe('Filter by folder ID'),
      ids: z.string().optional().describe('Comma-separated file IDs to retrieve'),
    },
    async ({ api_key, company_id, folder_id, ids }) => {
      try {
        const params: Record<string, unknown> = {};
        if (folder_id) params.folder_id = folder_id;
        if (ids) params.ids = ids;
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/files`, params);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_document_url',
    'Get a short-lived signed URL to download a document',
    {
      api_key: apiKeySchema,
      file_id: z.string().describe('File ID'),
      download: z.boolean().optional().describe('Whether to force download (Content-Disposition)'),
    },
    async ({ api_key, file_id, download }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post('/files/document-url', { fileId: file_id, download });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'search_documents',
    'Search documents using a flat metadata-filtered view',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      metadata_id: z.string().optional().describe('Metadata key ID to filter by'),
      value: z.string().optional().describe('Metadata value to match'),
    },
    async ({ api_key, company_id, ...params }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/documents/flat`, params);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'get_document_tree',
    'Get the hierarchical virtual document tree for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/documents/tree`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'delete_file',
    'Delete a file',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      file_id: z.string().describe('File ID'),
    },
    async ({ api_key, company_id, file_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.delete(`/companies/${company_id}/files/${file_id}`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Metadata keys ─────────────────────────────────────────────────

  server.tool(
    'list_metadata_keys',
    'List file metadata keys for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/files-metadata-keys`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_metadata_keys',
    'Create, update, or delete file metadata keys. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      key_id: z.string().optional().describe('Metadata key ID (required for update/delete)'),
      name: z.string().optional().describe('Metadata key name'),
    },
    async ({ api_key, action, company_id, key_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/files-metadata-keys`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${key_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${key_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'update_file_metadata',
    'Update metadata values on a file',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      file_id: z.string().describe('File ID'),
      metadata: z.array(z.object({
        metadata_id: z.string().describe('Metadata key ID'),
        value: z.string().describe('Metadata value'),
      })).describe('Array of metadata key-value pairs to set'),
    },
    async ({ api_key, company_id, file_id, metadata }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.put(`/companies/${company_id}/files/${file_id}/metadata`, { metadata });
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Document permission rules ─────────────────────────────────────

  server.tool(
    'list_document_permission_rules',
    'List document permission rules for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/document-permission-rules`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_document_permission_rules',
    'Create, update, or delete document permission rules. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      rule_id: z.string().optional().describe('Rule ID (required for update/delete)'),
      name: z.string().optional().describe('Rule name'),
      permission_type: z.string().optional().describe('Permission type'),
      conditions: z.record(z.unknown()).optional().describe('Conditions object'),
    },
    async ({ api_key, action, company_id, rule_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/document-permission-rules`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${rule_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${rule_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Folder permissions ────────────────────────────────────────────

  server.tool(
    'list_folder_permissions',
    'List permissions for a folder',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      folder_id: z.string().describe('Folder ID'),
    },
    async ({ api_key, company_id, folder_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/folders/${folder_id}/permissions`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_folder_permissions',
    'Add or remove a folder permission. Set action to "add" or "remove".',
    {
      api_key: apiKeySchema,
      action: z.enum(['add', 'remove']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      folder_id: z.string().describe('Folder ID'),
      permission_id: z.string().optional().describe('Permission ID (required for remove)'),
      user_id: z.string().optional().describe('User ID'),
      group_id: z.string().optional().describe('Group ID'),
      permission_type: z.string().optional().describe('Permission type (read/write/admin)'),
    },
    async ({ api_key, action, company_id, folder_id, permission_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/folders/${folder_id}/permissions`;
        let res;
        switch (action) {
          case 'add':
            res = await api.post(basePath, body);
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
}
