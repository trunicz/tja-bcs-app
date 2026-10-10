/**
 * TJA BCS - Astro SSR Route Guarding Middleware
 * File target: frontend/src/middleware.ts
 *
 * Enforces server-side authentication protection across all SSR routes:
 * 1. Allows public routes (/login) and static assets (/_astro/*, images, stylesheets).
 * 2. Reads `auth_token` HTTP cookie.
 * 3. Redirects unauthenticated requests to `/login?redirect=...`.
 * 4. Redirects authenticated requests accessing `/login` back to `/`.
 * 5. Validates active session against backend `GET /api/auth/me` and populates `context.locals.user`.
 * 6. Deletes cookie and forces re-login if the backend rejects the token (401).
 */

import { defineMiddleware } from 'astro:middleware';

const AUTH_COOKIE = 'auth_token';
const BACKEND_URL =
  (typeof process !== 'undefined' && process.env?.API_URL) || 'http://localhost:3001';

// Public endpoints and static asset extensions
const PUBLIC_PATHS = ['/login'];
const STATIC_EXTENSION_REGEX =
  /\.(svg|ico|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ttf|eot|map|json)$/i;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  // 1. Skip middleware for Astro internals and static assets
  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/@') ||
    STATIC_EXTENSION_REGEX.test(pathname)
  ) {
    return next();
  }

  const tokenCookie = context.cookies.get(AUTH_COOKIE);
  const rawToken = tokenCookie?.value?.trim();
  const token =
    rawToken && !/[\s\r\n]/.test(rawToken) && /^[\w\-.~+/]+=*$/.test(rawToken)
      ? rawToken
      : null;

  if (rawToken && !token) {
    context.cookies.delete(AUTH_COOKIE, { path: '/' });
  }

  const isPublicRoute = PUBLIC_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // 2. Unauthenticated user accessing protected route -> redirect to /login
  if (!isPublicRoute && !token) {
    const redirectParam = encodeURIComponent(pathname + search);
    return context.redirect(`/login?redirect=${redirectParam}`);
  }

  // 3. User with token accessing login -> redirect to home dashboard
  if (isPublicRoute && token) {
    return context.redirect('/');
  }

  // 4. Token validation & App.locals population for server-rendered components
  if (token) {
    context.locals.token = token;

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 401) {
        // Backend invalidated or expired token: clear cookie
        context.cookies.delete(AUTH_COOKIE, { path: '/' });
        if (!isPublicRoute) {
          const redirectParam = encodeURIComponent(pathname + search);
          return context.redirect(`/login?redirect=${redirectParam}`);
        }
      } else if (response.ok) {
        const data = await response.json();
        context.locals.user = data.usuario || data.user || null;
        context.locals.isImpersonated = Boolean(data.isImpersonated);
        context.locals.originalAdmin = data.originalAdmin || null;
      }
    } catch (networkError) {
      // Backend temporarily unavailable during cold boot; allow request to proceed
      // Client-side React islands will handle retry via apiFetch
      console.warn('[middleware] Backend unreachable during SSR token check:', networkError);
    }
  }

  return next();
});
