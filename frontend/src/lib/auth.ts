/**
 * TJA BCS - Frontend Authentication & Session Management
 * File path: frontend/src/lib/auth.ts
 *
 * Provides dual-layer session persistence:
 * 1. HTTP/same-origin document cookie (`auth_token`) for Astro SSR route guarding.
 * 2. Browser localStorage (`auth_token`, `auth_user`, `auth_impersonated`, `auth_original_admin`)
 *    for synchronous client-side React island hydration.
 */

export interface User {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  rolId: number;
  salaId: number | null;
  permisos: string[];
  colorEmpleado?: string;
}

export interface OriginalAdmin {
  id: number;
  nombre: string;
  correo?: string;
}

export interface SessionState {
  token: string | null;
  user: User | null;
  isImpersonated: boolean;
  originalAdmin: OriginalAdmin | null;
}

// Storage keys
export const AUTH_COOKIE_NAME = 'auth_token';
export const AUTH_USER_STORAGE_KEY = 'auth_user';
export const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
export const AUTH_IMPERSONATED_STORAGE_KEY = 'auth_impersonated';
export const AUTH_ORIGINAL_ADMIN_STORAGE_KEY = 'auth_original_admin';

// Default session cookie lifetime: 24 hours (86,400 seconds)
export const SESSION_MAX_AGE = 86400;

// ============================================================================
// Cookie Utilities (Browser & Client-side safe)
// ============================================================================

/**
 * Retrieves the value of a cookie by name in browser context.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(';');
  for (let c of cookies) {
    c = c.trim();
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length));
    }
  }
  return null;
}

/**
 * Sets a cookie in browser context with SameSite=Lax and Path=/
 */
export function setCookie(name: string, value: string, maxAgeSeconds: number = SESSION_MAX_AGE): void {
  if (typeof document === 'undefined') return;

  const secureFlag = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
}

/**
 * Deletes a cookie in browser context.
 */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

// ============================================================================
// Session Accessors & State Management
// ============================================================================

/**
 * Retrieves the active Bearer token.
 * Prioritizes localStorage, falling back to document cookie.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const localToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (localToken && localToken.trim().length > 0) {
      return localToken.trim();
    }
  } catch {
    // Ignore localStorage access restrictions
  }

  return getCookie(AUTH_COOKIE_NAME);
}

/**
 * Retrieves the currently authenticated user object from localStorage.
 */
export function getUser(): User | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as User;
  } catch (error) {
    console.error('[auth] Error parsing stored user:', error);
    return null;
  }
}

/**
 * Checks if the current session is an active impersonation context.
 */
export function isImpersonating(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return (
      localStorage.getItem(AUTH_IMPERSONATED_STORAGE_KEY) === 'true' ||
      localStorage.getItem('is_impersonated') === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Alias for isImpersonating for multi-component compatibility.
 */
export const isImpersonated = isImpersonating;

/**
 * Retrieves original Global Admin metadata when in impersonation mode.
 */
export function getOriginalAdmin(): OriginalAdmin | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored =
      localStorage.getItem(AUTH_ORIGINAL_ADMIN_STORAGE_KEY) ||
      localStorage.getItem('original_admin');
    if (!stored) return null;
    return JSON.parse(stored) as OriginalAdmin;
  } catch {
    return null;
  }
}

/**
 * Gets a complete snapshot of current session state.
 */
export function getSessionState(): SessionState {
  return {
    token: getToken(),
    user: getUser(),
    isImpersonated: isImpersonating(),
    originalAdmin: getOriginalAdmin(),
  };
}

/**
 * Stores full session state to both cookie and localStorage.
 * Dispatches 'auth:change' and 'auth-change' events to notify all active React islands.
 * Flexibly accepts (token, user, originalAdmin, isImpersonated) or (token, user, isImpersonated, originalAdmin).
 */
export function setSession(
  token: string,
  user: User,
  arg3?: OriginalAdmin | boolean | null,
  arg4?: boolean | OriginalAdmin | null
): void {
  if (typeof window === 'undefined') return;

  let originalAdmin: OriginalAdmin | null = null;
  let isImpersonatedFlag = false;

  if (typeof arg3 === 'boolean') {
    isImpersonatedFlag = arg3;
    if (arg4 && typeof arg4 === 'object') {
      originalAdmin = arg4 as OriginalAdmin;
    }
  } else if (arg3 && typeof arg3 === 'object') {
    originalAdmin = arg3 as OriginalAdmin;
    isImpersonatedFlag = typeof arg4 === 'boolean' ? arg4 : true;
  } else if (typeof arg4 === 'boolean') {
    isImpersonatedFlag = arg4;
  }

  if (originalAdmin) {
    isImpersonatedFlag = true;
  }

  // 1. Persist cookie for Astro SSR middleware
  setCookie(AUTH_COOKIE_NAME, token, SESSION_MAX_AGE);

  // 2. Persist in localStorage for instant synchronous hydration
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));

    if (isImpersonatedFlag) {
      localStorage.setItem(AUTH_IMPERSONATED_STORAGE_KEY, 'true');
      localStorage.setItem('is_impersonated', 'true');
      if (originalAdmin) {
        localStorage.setItem(AUTH_ORIGINAL_ADMIN_STORAGE_KEY, JSON.stringify(originalAdmin));
        localStorage.setItem('original_admin', JSON.stringify(originalAdmin));
      } else {
        localStorage.removeItem(AUTH_ORIGINAL_ADMIN_STORAGE_KEY);
        localStorage.removeItem('original_admin');
      }
    } else {
      localStorage.removeItem(AUTH_IMPERSONATED_STORAGE_KEY);
      localStorage.removeItem('is_impersonated');
      localStorage.removeItem(AUTH_ORIGINAL_ADMIN_STORAGE_KEY);
      localStorage.removeItem('original_admin');
    }
  } catch (err) {
    console.error('[auth] Error saving session to localStorage:', err);
  }

  // 3. Dispatch reactive custom events
  const detail = {
    token,
    user,
    isImpersonated: isImpersonatedFlag,
    originalAdmin: originalAdmin || null,
  };

  try {
    window.dispatchEvent(new CustomEvent('auth:change', { detail }));
    window.dispatchEvent(new CustomEvent('auth-change', { detail }));
  } catch {
    // Ignore event dispatch failure in non-browser testing
  }
}

/**
 * Completely purges active session from cookie and localStorage.
 * Dispatches 'auth:change' and 'auth-change' events.
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;

  // 1. Remove auth & preference cookies
  deleteCookie(AUTH_COOKIE_NAME);
  deleteCookie('tja_theme');
  deleteCookie('tja_accent');
  deleteCookie('tja_density');
  deleteCookie('tja_font_size');
  deleteCookie('tja_animations');
  deleteCookie('tja_sidebar_collapsed');
  deleteCookie('tja_sidebar_position');

  // 2. Clear localStorage items
  try {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(AUTH_IMPERSONATED_STORAGE_KEY);
    localStorage.removeItem('is_impersonated');
    localStorage.removeItem(AUTH_ORIGINAL_ADMIN_STORAGE_KEY);
    localStorage.removeItem('original_admin');
    // Clear user preference cache
    localStorage.removeItem('tja_preferencias');
    localStorage.removeItem('tja_theme');
    localStorage.removeItem('tja_accent');
    localStorage.removeItem('tja_density');
    localStorage.removeItem('tja_font_size');
    localStorage.removeItem('tja_animations');
    localStorage.removeItem('tja_sidebar_collapsed');
    localStorage.removeItem('tja_sidebar_position');
    localStorage.removeItem('tja_employee_color');
  } catch (err) {
    console.error('[auth] Error clearing localStorage session:', err);
  }

  // 3. Dispatch events
  const detail = {
    token: null,
    user: null,
    isImpersonated: false,
    originalAdmin: null,
  };

  try {
    window.dispatchEvent(new CustomEvent('auth:change', { detail }));
    window.dispatchEvent(new CustomEvent('auth-change', { detail }));
  } catch {
    // Ignore event dispatch error
  }
}

// ============================================================================
// Authorization & Permission Queries
// ============================================================================

/**
 * Checks whether user has an active session token and user profile.
 */
export function isAuthenticated(): boolean {
  return Boolean(getToken() && getUser());
}

/**
 * Checks whether active user has the Global Administrator role.
 */
export function isGlobalAdmin(): boolean {
  const user = getUser();
  return user?.rol === 'Administrador';
}

/**
 * Checks if the current user possesses a specific granular permission.
 * Global Administrator has implicit access to all permissions.
 */
export function hasPermission(permissionCode: string): boolean {
  const user = getUser();
  if (!user) return false;

  // Global Administrator bypass
  if (user.rol === 'Administrador') return true;

  return Array.isArray(user.permisos) && user.permisos.includes(permissionCode);
}

/**
 * Checks if the user possesses at least one of the specified permissions.
 */
export function hasAnyPermission(...permissionCodes: string[]): boolean {
  const user = getUser();
  if (!user) return false;
  if (user.rol === 'Administrador') return true;

  return permissionCodes.some((code) => Array.isArray(user.permisos) && user.permisos.includes(code));
}

/**
 * Checks if the user possesses all specified permissions.
 */
export function hasAllPermissions(...permissionCodes: string[]): boolean {
  const user = getUser();
  if (!user) return false;
  if (user.rol === 'Administrador') return true;

  return permissionCodes.every((code) => Array.isArray(user.permisos) && user.permisos.includes(code));
}

// ============================================================================
// React Island State Subscription Helper
// ============================================================================

/**
 * Subscribes a React component to session changes across windows/tabs and local actions.
 * Returns an unsubscription callback.
 */
export function subscribeAuthChange(callback: (state: SessionState) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomChange = (e: Event) => {
    const customEvent = e as CustomEvent<SessionState>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getSessionState());
    }
  };

  const handleStorageChange = (e: StorageEvent) => {
    if (
      e.key === AUTH_TOKEN_STORAGE_KEY ||
      e.key === AUTH_USER_STORAGE_KEY ||
      e.key === AUTH_IMPERSONATED_STORAGE_KEY ||
      e.key === 'is_impersonated' ||
      e.key === null // storage.clear()
    ) {
      callback(getSessionState());
    }
  };

  window.addEventListener('auth:change', handleCustomChange);
  window.addEventListener('auth-change', handleCustomChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener('auth:change', handleCustomChange);
    window.removeEventListener('auth-change', handleCustomChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}
