import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

// ============================================================================
// TYPE DEFINITIONS & EXPRESS AMBIENT AUGMENTATION
// ============================================================================

/**
 * Interface representing the authenticated user attached to the Express request
 */
export interface AuthenticatedUser {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  rolNombre: string; // Convenient alias for rol
  rolId: number;
  salaId: number | null;
  activo: boolean;
  isImpersonated: boolean;
  originalAdminId?: number | null;
  permisos: string[];
  originalAdmin?: {
    id: number;
    nombre: string;
    correo: string;
  } | null;
}

/**
 * Ambient type augmentation for Express Request
 * Extends req.user, req.permissions, and req.token across the backend application
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      permissions?: string[];
      token?: string;
    }
  }
}

/**
 * Strictly typed Request interface for routes protected by `authenticate`
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  permissions: string[];
  token: string;
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Extracts the Bearer token from the HTTP Authorization header
 * Supports case-insensitive 'Bearer' prefix and trims whitespace
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const trimmed = authHeader.trim();
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return null;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE: authenticate
// ============================================================================

/**
 * Authenticates incoming requests via Bearer token:
 * 1. Extracts Authorization: Bearer <token>
 * 2. Queries active Session with relations to Usuario and Rol.Permisos
 * 3. Enforces session TTL expiration (cleans up expired sessions)
 * 4. Checks active user status (activo: true)
 * 5. Loads impersonation metadata if active
 * 6. Attaches req.user, req.permissions, and req.token
 * 7. Returns 401 Unauthorized ({ error: 'No autenticado' }) on any failure
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Query session with relations to usuario, rol, and granular permisos
    const session = await (prisma as any).session.findUnique({
      where: { token },
      include: {
        usuario: {
          include: {
            rol: {
              include: {
                permisos: {
                  include: {
                    permiso: true,
                  },
                },
              },
            },
            sala: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Enforce session expiration
    if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
      // Asynchronously delete expired session
      (prisma as any).session.delete({ where: { id: session.id } }).catch(() => {});
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Enforce user existence and active status
    if (!session.usuario || !session.usuario.activo) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Extract permission codes
    const permisos: string[] = session.usuario.rol?.permisos
      ? session.usuario.rol.permisos
          .map((rp: any) => rp.permiso?.codigo)
          .filter((code: any): code is string => typeof code === 'string' && code.length > 0)
      : [];

    // Resolve originalAdmin details if session is currently impersonated
    let originalAdmin: { id: number; nombre: string; correo: string } | null = null;
    if (session.isImpersonated && session.originalAdminId) {
      const admin = await (prisma as any).usuario.findUnique({
        where: { id: session.originalAdminId },
        select: {
          id: true,
          nombre: true,
          correo: true,
        },
      });
      if (admin) {
        originalAdmin = {
          id: admin.id,
          nombre: admin.nombre,
          correo: admin.correo,
        };
      }
    }

    const rolNombre = session.usuario.rol?.nombre || '';

    // Decorate Express Request object
    req.user = {
      id: session.usuario.id,
      nombre: session.usuario.nombre,
      correo: session.usuario.correo,
      rol: rolNombre,
      rolNombre,
      rolId: session.usuario.rolId,
      salaId: session.usuario.salaId,
      activo: session.usuario.activo,
      isImpersonated: Boolean(session.isImpersonated),
      originalAdminId: session.originalAdminId,
      permisos,
      originalAdmin,
    };

    req.permissions = permisos;
    req.token = token;

    return next();
  } catch (error) {
    console.error('Error in authenticate middleware:', error);
    return res.status(500).json({ error: 'Error interno del servidor en autenticación' });
  }
}

// ============================================================================
// AUTHORIZATION MIDDLEWARE: requirePermission
// ============================================================================

/**
 * Enforces that the authenticated user possesses the specific granular permission code.
 * If the user lacks the permission, returns 403 Forbidden with exact contract message:
 * { error: "Acceso denegado: permiso requerido '<codigo>'" }
 * 
 * If called on an unauthenticated request, safely returns 401 Unauthorized.
 */
export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.permissions) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!req.permissions.includes(permissionCode)) {
      return res.status(403).json({
        error: `Acceso denegado: permiso requerido '${permissionCode}'`,
      });
    }

    return next();
  };
}

/**
 * Enforces that the authenticated user possesses AT LEAST ONE of the specified permissions.
 * Useful for routes accessible to multiple roles/permissions (e.g., GET /api/roles allowing roles:view or roles:manage)
 */
export function requireAnyPermission(...permissionCodes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.permissions) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const hasAny = permissionCodes.some((code) => req.permissions!.includes(code));
    if (!hasAny) {
      return res.status(403).json({
        error: `Acceso denegado: permiso requerido '${permissionCodes[0]}'`,
      });
    }

    return next();
  };
}

// ============================================================================
// AUTHORIZATION MIDDLEWARE: requireGlobalAdmin
// ============================================================================

/**
 * Enforces that the authenticated user is a true Global Administrator:
 * 1. User must be active
 * 2. User role must be 'Administrador'
 * 3. User MUST NOT be currently impersonated (session.isImpersonated === false)
 * 
 * Supports being used directly as middleware:
 *   router.post('/impersonate', authenticate, requireGlobalAdmin, handler)
 * Or as a factory with custom error message:
 *   router.post('/impersonate', authenticate, requireGlobalAdmin('...'), handler)
 */
function checkGlobalAdmin(req: Request, res: Response, next: NextFunction, customErrorMessage?: string) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (!req.user.activo) {
    return res.status(403).json({ error: 'Usuario inactivo o suspendido' });
  }

  const isAdminRole = req.user.rolNombre === 'Administrador' || req.user.rol === 'Administrador';
  const isImpersonated = req.user.isImpersonated === true;

  if (!isAdminRole || isImpersonated) {
    const errorMsg =
      customErrorMessage ||
      'Acceso denegado: sólo el Administrador Global puede realizar esta acción';
    return res.status(403).json({ error: errorMsg });
  }

  return next();
}

export function requireGlobalAdmin(
  reqOrMessage?: Request | string,
  res?: Response,
  next?: NextFunction
): any {
  // Case 1: Called as factory function with custom error message: requireGlobalAdmin('custom msg')
  if (typeof reqOrMessage === 'string') {
    const customMessage = reqOrMessage;
    return (req: Request, res: Response, next: NextFunction) => {
      return checkGlobalAdmin(req, res, next, customMessage);
    };
  }

  // Case 2: Called directly as Express middleware: router.use(requireGlobalAdmin)
  if (reqOrMessage && res && next) {
    return checkGlobalAdmin(reqOrMessage as Request, res, next);
  }

  // Case 3: Called as factory without arguments: requireGlobalAdmin()
  return (req: Request, res: Response, next: NextFunction) => {
    return checkGlobalAdmin(req, res, next);
  };
}

export default {
  authenticate,
  requirePermission,
  requireAnyPermission,
  requireGlobalAdmin,
  extractBearerToken,
};
