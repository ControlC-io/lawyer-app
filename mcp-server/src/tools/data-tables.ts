import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, apiKeySchema, jsonResult, errorResult } from '../client.js';

export function registerDataTableTools(server: McpServer) {
  server.tool(
    'list_data_tables',
    'List all data tables for a company',
    { api_key: apiKeySchema, company_id: z.string().describe('Company ID') },
    async ({ api_key, company_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/data-tables`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_data_table',
    'Create, update, delete, or copy a data table. Set action to "create", "update", "delete", or "copy".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete', 'copy']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      table_id: z.string().optional().describe('Table ID (required for update/delete/copy)'),
      name: z.string().optional().describe('Table name'),
      description: z.string().optional().describe('Table description'),
    },
    async ({ api_key, action, company_id, table_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/data-tables`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${table_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${table_id}`);
            break;
          case 'copy':
            res = await api.post(`${basePath}/${table_id}/copy`, {});
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'list_data_table_fields',
    'List fields (columns) for a data table',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      table_id: z.string().describe('Data table ID'),
    },
    async ({ api_key, company_id, table_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/data-tables/${table_id}/fields`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_data_table_field',
    'Create, update, or delete a data table field. Set action to "create", "update", or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      table_id: z.string().describe('Data table ID'),
      field_id: z.string().optional().describe('Field ID (required for update/delete)'),
      name: z.string().optional().describe('Field name'),
      field_type: z.string().optional().describe('Field type (text, number, date, select, etc.)'),
      options: z.record(z.unknown()).optional().describe('Field options (e.g. select choices)'),
      is_required: z.boolean().optional().describe('Whether the field is required'),
      position: z.number().optional().describe('Display position'),
    },
    async ({ api_key, action, company_id, table_id, field_id, ...body }) => {
      try {
        const api = createApiClient(api_key);
        const basePath = `/companies/${company_id}/data-tables/${table_id}/fields`;
        let res;
        switch (action) {
          case 'create':
            res = await api.post(basePath, body);
            break;
          case 'update':
            res = await api.patch(`${basePath}/${field_id}`, body);
            break;
          case 'delete':
            res = await api.delete(`${basePath}/${field_id}`);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'list_records',
    'List records (rows) in a data table',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      table_id: z.string().describe('Data table ID'),
    },
    async ({ api_key, company_id, table_id }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.get(`/companies/${company_id}/data-tables/${table_id}/records`);
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'create_record',
    'Create a new record in a data table',
    {
      api_key: apiKeySchema,
      company_id: z.string().describe('Company ID'),
      table_id: z.string().describe('Data table ID'),
      data: z.record(z.unknown()).describe('Record data as key-value pairs (field ID → value)'),
    },
    async ({ api_key, company_id, table_id, data }) => {
      try {
        const api = createApiClient(api_key);
        const res = await api.post(
          `/companies/${company_id}/data-tables/${table_id}/records`,
          { data },
        );
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    'manage_record',
    'Update or delete a data table record. Set action to "update" or "delete".',
    {
      api_key: apiKeySchema,
      action: z.enum(['update', 'delete']).describe('Action to perform'),
      company_id: z.string().describe('Company ID'),
      table_id: z.string().describe('Data table ID'),
      record_id: z.string().describe('Record ID'),
      data: z.record(z.unknown()).optional().describe('Updated data (required for update)'),
    },
    async ({ api_key, action, company_id, table_id, record_id, data }) => {
      try {
        const api = createApiClient(api_key);
        const path = `/companies/${company_id}/data-tables/${table_id}/records/${record_id}`;
        let res;
        switch (action) {
          case 'update':
            res = await api.patch(path, { data });
            break;
          case 'delete':
            res = await api.delete(path);
            break;
        }
        return jsonResult(res.data);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
