/**
 * API client for the backend. Uses VITE_API_URL in production or proxy in dev.
 */

const BASE = (import.meta.env.VITE_API_URL as string) || '';

export interface ApiError {
  error: string;
  details?: string;
}

function getToken(): string | null {
  return localStorage.getItem('floowly_token');
}

export function setToken(token: string): void {
  localStorage.setItem('floowly_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('floowly_token');
}

function headers(includeAuth = true, apiKey?: string): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (includeAuth) {
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
  }
  if (apiKey) h['x-api-key'] = apiKey;
  return h;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T | ApiError;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new Error(res.statusText || 'Invalid response');
  }
  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.details || err.error || res.statusText || 'Request failed');
  }
  return data as T;
}

export const api = {
  async get<T>(path: string, options?: { apiKey?: string; skipAuth?: boolean }): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'GET',
      headers: headers(!options?.skipAuth, options?.apiKey),
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown, options?: { apiKey?: string; skipAuth?: boolean }): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers(!options?.skipAuth, options?.apiKey),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async postFormData<T>(path: string, formData: FormData, options?: { apiKey?: string; skipAuth?: boolean }): Promise<T> {
    const h: Record<string, string> = {};
    if (!options?.skipAuth) {
      const t = getToken();
      if (t) h['Authorization'] = `Bearer ${t}`;
    }
    if (options?.apiKey) h['x-api-key'] = options.apiKey;
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: h,
      body: formData,
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, body?: unknown, options?: { apiKey?: string }): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: headers(true, options?.apiKey),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T>(path: string, body?: unknown, options?: { apiKey?: string }): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PATCH',
      headers: headers(true, options?.apiKey),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async delete(path: string, options?: { apiKey?: string }): Promise<void> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'DELETE',
      headers: headers(true, options?.apiKey),
    });
    if (res.status === 204) return;
    await handleResponse(res);
  },
};
