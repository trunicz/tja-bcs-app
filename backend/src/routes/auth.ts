import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';

export const authRouter = Router();
export const SESSION_TTL_HOURS = 24;

/**
 * Generate a cryptographically secure 256-bit random session token (64 hex characters)
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Extract bearer token from Authorization header (e.g. "Bearer <token>")
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

  return match[1].trim();
}

/**
 * Verify input password against stored password supporting plaintext and sha256
 */
export function verifyPassword(inputPassword: string, storedPassword: string): boolean {
  if (!inputPassword || !storedPassword) {
    return false;
  }
  if (inputPassword === storedPassword) {
    return true;
  }
  try {
    const shaHash = crypto.createHash('sha256').update(inputPassword).digest('hex');
    if (shaHash === storedPassword) {
      return true;
    }
  } catch {
    // Ignore hashing error and proceed
  }
  return false;
}

/**
 * Helper to get active session with user, role, and permissions
 */
export async function getActiveSession(token: string) {
  if (!token) return null;

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
    return null;
  }

  // Check TTL expiration
  if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
    // Clean up expired session asynchronously
    (prisma as any).session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Check active user status
  if (!session.usuario || !session.usuario.activo) {
    return null;
  }

  return session;
}

/**
 * POST /api/auth/login
 * Body: { correo: string, password: string }
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { correo, password } = req.body || {};

    if (!correo || !password || typeof correo !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const normalizedEmail = correo.trim().toLowerCase();

    // Look up user by email
    const user = await (prisma as any).usuario.findFirst({
      where: {
        correo: normalizedEmail,
      },
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
    });

    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verify password
    const isValidPassword = verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generate token and expiration
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    // Save session to database
    await (prisma as any).session.create({
      data: {
        token,
        usuarioId: user.id,
        isImpersonated: false,
        originalAdminId: null,
        expiresAt,
      },
    });

    // Extract granular permission codes
    const permisos: string[] = user.rol?.permisos
      ? user.rol.permisos.map((rp: any) => rp.permiso?.codigo).filter(Boolean)
      : [];

    const usuarioData = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol?.nombre || '',
      rolId: user.rolId,
      salaId: user.salaId,
      colorEmpleado: user.colorEmpleado || '#2563eb',
      permisos,
    };

    return res.status(200).json({
      token,
      usuario: usuarioData,
      user: usuarioData,
      permisos,
      isImpersonated: false,
      originalAdmin: null,
    });
  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    return res.status(500).json({ error: 'Error interno del servidor durante el inicio de sesión' });
  }
});

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 */
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    // Delete session from database
    await (prisma as any).session.deleteMany({
      where: { token },
    });

    return res.status(200).json({ message: 'Sesión cerrada exitosamente' });
  } catch (error) {
    console.error('Error in POST /api/auth/logout:', error);
    return res.status(500).json({ error: 'Error interno del servidor durante el cierre de sesión' });
  }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    const session = await getActiveSession(token);
    if (!session || !session.usuario) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    const permisos: string[] = session.usuario.rol?.permisos
      ? session.usuario.rol.permisos.map((rp: any) => rp.permiso?.codigo).filter(Boolean)
      : [];

    const usuarioData = {
      id: session.usuario.id,
      nombre: session.usuario.nombre,
      correo: session.usuario.correo,
      rol: session.usuario.rol?.nombre || '',
      rolId: session.usuario.rolId,
      salaId: session.usuario.salaId,
      colorEmpleado: session.usuario.colorEmpleado || '#2563eb',
      permisos,
    };

    let originalAdmin = null;
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

    return res.status(200).json({
      usuario: usuarioData,
      user: usuarioData,
      permisos,
      isImpersonated: session.isImpersonated,
      originalAdmin,
    });
  } catch (error) {
    console.error('Error in GET /api/auth/me:', error);
    return res.status(500).json({ error: 'Error interno del servidor al consultar perfil' });
  }
});

/**
 * POST /api/auth/impersonate
 * Header: Authorization: Bearer <token>
 * Body: { targetUserId: number }
 */
authRouter.post('/impersonate', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    const session = await getActiveSession(token);
    if (!session || !session.usuario) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    // 1. Check caller active status
    if (!session.usuario.activo) {
      return res.status(403).json({ error: 'Usuario inactivo o suspendido' });
    }

    // 2. Enforce strict Global Admin authorization and prevent nested impersonation
    if (session.isImpersonated || session.usuario.rol?.nombre !== 'Administrador') {
      return res.status(403).json({
        error: 'Acceso denegado: sólo el Administrador Global puede realizar suplantación',
      });
    }

    // 3. Validate targetUserId
    const { targetUserId } = req.body || {};
    if (targetUserId === undefined || targetUserId === null || isNaN(Number(targetUserId))) {
      return res.status(400).json({
        error: 'ID de usuario objetivo requerido y debe ser un número válido',
      });
    }

    const targetId = Number(targetUserId);

    // Prevent self-impersonation
    if (targetId === session.usuario.id) {
      return res.status(400).json({
        error: 'No es posible suplantar su propia cuenta de administrador',
      });
    }

    // 4. Validate target user exists and is active
    const targetUser = await (prisma as any).usuario.findUnique({
      where: { id: targetId },
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
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario objetivo no encontrado' });
    }

    if (!targetUser.activo) {
      return res.status(400).json({
        error: 'No se puede suplantar a un usuario inactivo o suspendido',
      });
    }

    // 5. Update session context to target user
    const adminUser = session.usuario;
    const updatedSession = await (prisma as any).session.update({
      where: { id: session.id },
      data: {
        usuarioId: targetUser.id,
        isImpersonated: true,
        originalAdminId: adminUser.id,
      },
    });

    const targetPermisos: string[] = targetUser.rol?.permisos
      ? targetUser.rol.permisos.map((rp: any) => rp.permiso?.codigo).filter(Boolean)
      : [];

    const targetData = {
      id: targetUser.id,
      nombre: targetUser.nombre,
      correo: targetUser.correo,
      rol: targetUser.rol?.nombre || '',
      rolId: targetUser.rolId,
      salaId: targetUser.salaId,
      colorEmpleado: targetUser.colorEmpleado || '#2563eb',
      permisos: targetPermisos,
    };

    return res.status(200).json({
      token: updatedSession.token,
      usuario: targetData,
      user: targetData,
      permisos: targetPermisos,
      isImpersonated: true,
      originalAdmin: {
        id: adminUser.id,
        nombre: adminUser.nombre,
        correo: adminUser.correo,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/auth/impersonate:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al realizar suplantación',
    });
  }
});

/**
 * Revert Handler for POST /api/auth/revert & POST /api/auth/impersonate/revert
 */
const revertHandler = async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    const session = await getActiveSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Token no proporcionado o inválido' });
    }

    // 1. Validate that active session is currently in impersonation mode
    if (!session.isImpersonated || !session.originalAdminId) {
      return res.status(400).json({
        error: 'La sesión activa no está en modo de suplantación',
      });
    }

    // 2. Fetch original admin user
    const originalAdmin = await (prisma as any).usuario.findUnique({
      where: { id: session.originalAdminId },
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
    });

    if (!originalAdmin) {
      return res.status(404).json({
        error: 'Usuario administrador original no encontrado',
      });
    }

    if (!originalAdmin.activo) {
      return res.status(403).json({
        error: 'La cuenta del administrador original se encuentra inactiva',
      });
    }

    // 3. Restore original admin context on session
    const restoredSession = await (prisma as any).session.update({
      where: { id: session.id },
      data: {
        usuarioId: originalAdmin.id,
        isImpersonated: false,
        originalAdminId: null,
      },
    });

    const adminPermisos: string[] = originalAdmin.rol?.permisos
      ? originalAdmin.rol.permisos.map((rp: any) => rp.permiso?.codigo).filter(Boolean)
      : [];

    const adminData = {
      id: originalAdmin.id,
      nombre: originalAdmin.nombre,
      correo: originalAdmin.correo,
      rol: originalAdmin.rol?.nombre || '',
      rolId: originalAdmin.rolId,
      salaId: originalAdmin.salaId,
      colorEmpleado: originalAdmin.colorEmpleado || '#2563eb',
      permisos: adminPermisos,
    };

    return res.status(200).json({
      token: restoredSession.token,
      usuario: adminData,
      user: adminData,
      permisos: adminPermisos,
      isImpersonated: false,
      originalAdmin: null,
    });
  } catch (error) {
    console.error('Error in POST /api/auth/revert:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al revertir suplantación',
    });
  }
};

authRouter.post('/revert', revertHandler);
authRouter.post('/impersonate/revert', revertHandler);

export default authRouter;
