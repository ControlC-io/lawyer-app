import axios, { type AxiosRequestConfig } from 'axios';
import { z } from 'zod';
import { config } from './config.js';

/** Use in every tool. If omitted, the server uses the key from env (SUPER_ADMIN_API_KEY or FLOOWLY_COMPANY_API_KEY). */
export const apiKeySchema = z.string().optional().describe('API key: company api_key from DB or SUPER_ADMIN_API_KEY. If not provided, server uses env key.');

/**
 * Creates an API client that sends the given API key on every request to the Floowly backend.
 * If apiKey is empty, uses config.apiKey from env (SUPER_ADMIN_API_KEY or FLOOWLY_COMPANY_API_KEY).
 */
export function createApiClient(apiKey?: string) {
  const key = (apiKey?.trim() || config.apiKey);
  if (!key) {
    throw new Error(
      'No API key. Either pass api_key in the tool arguments (company api_key or SUPER_ADMIN_API_KEY) or set SUPER_ADMIN_API_KEY (or FLOOWLY_COMPANY_API_KEY) in the server .env.',
    );
  }
  const requestConfig: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    timeout: 30_000,
  };

  return {
    get(path: string, params?: Record<string, unknown>) {
      const cfg: AxiosRequestConfig = { ...requestConfig };
      if (params) cfg.params = params;
      return axios.get(`${config.floowlyApiUrl}${path}`, cfg);
    },
    post(path: string, data?: unknown) {
      return axios.post(`${config.floowlyApiUrl}${path}`, data, requestConfig);
    },
    patch(path: string, data?: unknown) {
      return axios.patch(`${config.floowlyApiUrl}${path}`, data, requestConfig);
    },
    put(path: string, data?: unknown) {
      return axios.put(`${config.floowlyApiUrl}${path}`, data, requestConfig);
    },
    delete(path: string) {
      return axios.delete(`${config.floowlyApiUrl}${path}`, requestConfig);
    },
  };
}

/** Default client using env API key (for resources that cannot receive api_key per request). */
function defaultClient() {
  const key = config.apiKey;
  if (!key) throw new Error('No API key: set SUPER_ADMIN_API_KEY or FLOOWLY_COMPANY_API_KEY for resource access.');
  return createApiClient(key);
}

export function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(err: unknown) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 'unknown';
    const body = err.response?.data ?? err.message;
    return {
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: `API error (${status}): ${JSON.stringify(body)}`,
        },
      ],
    };
  }
  return {
    isError: true as const,
    content: [
      { type: 'text' as const, text: String(err) },
    ],
  };
}

/** For resources only: perform a GET using the env API key. */
export function apiGetWithEnvKey(path: string, params?: Record<string, unknown>) {
  const api = defaultClient();
  return api.get(path, params);
}
