import type { APIRoute } from 'astro';

const BACKEND_URL =
  process.env.PUBLIC_API_URL ||
  process.env.API_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:3001';

function normalizeBackend(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
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

  try {
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const body = hasBody && request.body ? await request.arrayBuffer() : undefined;

    const res = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
    });

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete('content-encoding');

    return new Response(res.body, {
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
