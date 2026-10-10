import type { APIRoute } from 'astro';

const DEFAULT_BACKEND =
  process.env.NODE_ENV === 'production'
    ? 'https://tja-bcs-backend.onrender.com'
    : 'http://localhost:3001';

const BACKEND_URL =
  process.env.PUBLIC_API_URL ||
  process.env.API_URL ||
  process.env.BACKEND_URL ||
  DEFAULT_BACKEND;

function normalizeBackend(url: string): string {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (!u) return DEFAULT_BACKEND;
  if (!/^https?:\/\//i.test(u)) {
    u = u.includes('localhost') || u.includes('127.0.0.1') ? `http://${u}` : `https://${u}`;
  }
  return u;
}

export const ALL: APIRoute = async ({ request, params }) => {
  const backendBase = normalizeBackend(BACKEND_URL);
  const path = params.path || '';
  const incomingUrl = new URL(request.url);
  const targetUrl = `${backendBase}/api/${path}${incomingUrl.search}`;

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host');
  forwardHeaders.delete('content-length');

  try {
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const body = hasBody && request.body ? await request.arrayBuffer() : undefined;

    const res = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
    });

    const responseData = await res.arrayBuffer();

    const responseHeaders = new Headers();
    const contentType = res.headers.get('content-type') || 'application/json';
    responseHeaders.set('content-type', contentType);

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      responseHeaders.set('set-cookie', setCookie);
    }

    return new Response(responseData, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error(`[API Proxy] Error forwarding ${request.method} to ${targetUrl}:`, err);
    return new Response(
      JSON.stringify({
        error: `Error al conectar con el servidor backend (${err.message})`,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
