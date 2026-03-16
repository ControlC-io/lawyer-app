import 'dotenv/config';

const superAdminApiKey = process.env.SUPER_ADMIN_API_KEY?.trim() || '';
const companyApiKey = process.env.FLOOWLY_COMPANY_API_KEY?.trim() || '';

/**
 * Used only for MCP resources (URI-based reads), which cannot receive api_key per request.
 * Tools require api_key in their arguments and do not use this.
 */
export const config = {
  floowlyApiUrl: process.env.FLOOWLY_API_URL || 'http://localhost:3001/api',
  apiKey: superAdminApiKey || companyApiKey,
  port: parseInt(process.env.MCP_PORT || '3002', 10),
};
