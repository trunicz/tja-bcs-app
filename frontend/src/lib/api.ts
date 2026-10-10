/**
 * TJA BCS - Authenticated API Client
 * File path: frontend/src/lib/api.ts
 *
 * Centralized fetch wrapper that:
 * 1. Prepends backend base URL (`http://localhost:3001` or env var).
 * 2. Injects `Authorization: Bearer <token>` from `auth.ts`.
 * 3. Sets standard JSON headers when appropriate.
 * 4. Intercepts 401 Unauthorized, automatically purging the session and redirecting to `/login`.
 * 5. Returns standard fetch `Response` for maximum compatibility with all components,
 *    and provides typed helper methods via the `api` object.
 */

import { getToken, clearSession } from './auth';

function normalizeBaseUrl(url?: string): string {
  if (!url) return 'http://localhost:3001';
  const trimmed = url.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

const rawBaseUrl =
  import.meta.env?.PUBLIC_API_URL ||
  (typeof process !== 'undefined' && (process.env?.API_URL || process.env?.PUBLIC_API_URL)) ||
  'http://localhost:3001';

// Backend Base URL configuration
export const API_BASE_URL = normalizeBaseUrl(rawBaseUrl);

/**
 * Custom error class capturing HTTP status code and server error payload
 */
export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Options extension for apiFetch
 */
export interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Centralized authenticated fetch wrapper.
 * Returns standard fetch Response promise.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { skipAuth = false, headers = {}, ...restOptions } = options;

  // 1. Resolve target URL
  const isAbsoluteUrl = /^https?:\/\//i.test(path);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = isAbsoluteUrl ? path : `${API_BASE_URL}${normalizedPath}`;

  // 2. Prepare headers
  const requestHeaders = new Headers(headers);

  // Set default Accept header if not specified
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }

  // Inject Authorization Bearer token if not explicitly skipped
  if (!skipAuth && !requestHeaders.has('Authorization')) {
    const token = getToken();
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  // Set JSON Content-Type if payload is present and not FormData / Blob / URLSearchParams
  if (
    restOptions.body &&
    !(restOptions.body instanceof FormData) &&
    !(restOptions.body instanceof Blob) &&
    !(restOptions.body instanceof URLSearchParams)
  ) {
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
  }

  // 3. Execute HTTP request
  let response: Response;
  try {
    response = await fetch(url, {
      ...restOptions,
      headers: requestHeaders,
    });
  } catch (networkError: any) {
    console.error(`[apiFetch] Network failure calling ${url}:`, networkError);
    throw new ApiError(
      'Error de red al comunicarse con el servidor. Verifique su conexión.',
      0,
      { originalError: networkError }
    );
  }

  // 4. Handle 401 Unauthorized (Expired or invalid session token)
  if (response.status === 401 && !skipAuth) {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
        console.warn('[apiFetch] 401 Unauthorized detected. Clearing session and redirecting to /login...');
        clearSession();
        const redirectParam = encodeURIComponent(currentPath + window.location.search);
        window.location.href = `/login?redirect=${redirectParam}`;
      }
    }
  }

  return response;
}

/**
 * Helper to extract error message and data from failed response
 */
async function parseErrorAndThrow(response: Response): Promise<never> {
  let errorData: any = null;
  let errorMessage = `Error HTTP ${response.status}: ${response.statusText}`;

  try {
    errorData = await response.json();
    if (errorData && typeof errorData === 'object') {
      errorMessage = errorData.error || errorData.message || errorMessage;
    }
  } catch {
    try {
      const text = await response.text();
      if (text) errorMessage = text;
    } catch {
      // Fall back to status text
    }
  }

  throw new ApiError(errorMessage, response.status, errorData);
}

/**
 * Helper to parse successful response
 */
async function parseResponseData<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return null as unknown as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

/**
 * Convenience HTTP method wrappers returning parsed data directly
 */
export const api = {
  get: async <T = any>(path: string, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(path, { ...options, method: 'GET' });
    if (!res.ok) await parseErrorAndThrow(res);
    return parseResponseData<T>(res);
  },

  post: async <T = any>(path: string, body?: any, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? (typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (!res.ok) await parseErrorAndThrow(res);
    return parseResponseData<T>(res);
  },

  put: async <T = any>(path: string, body?: any, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? (typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (!res.ok) await parseErrorAndThrow(res);
    return parseResponseData<T>(res);
  },

  patch: async <T = any>(path: string, body?: any, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? (typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (!res.ok) await parseErrorAndThrow(res);
    return parseResponseData<T>(res);
  },

  delete: async <T = any>(path: string, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(path, { ...options, method: 'DELETE' });
    if (!res.ok) await parseErrorAndThrow(res);
    return parseResponseData<T>(res);
  },
};
