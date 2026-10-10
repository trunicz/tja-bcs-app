import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

export const preferenciasRouter = Router();

// ============================================================================
// CONSTANTS & DEFAULTS
// ============================================================================

export const DEFAULT_PREFERENCIAS = {
  tema: 'auto',
  colorAcento: '#2563eb',
  paletaPreset: 'azul-clasico',
  densidad: 'comfortable',
  tamanoFuente: 'normal',
  sidebarColapsado: false,
  sidebarPosicion: 'left',
  ordenWidgets: ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'],
  animacionesHabilitadas: true,
};

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const VALID_TEMAS = ['light', 'dark', 'auto'];
const VALID_DENSIDADES = ['comfortable', 'compact'];
const VALID_TAMANOS_FUENTE = ['small', 'normal', 'large'];
const VALID_SIDEBAR_POSICIONES = ['left', 'right'];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolves target user ID taking impersonation context and explicit ?scope query into account
 */
function resolveTargetUserId(req: Request): number | null {
  const user = req.user;
  if (!user) return null;

  // If client explicitly requests admin scope while in impersonation mode
  if (req.query.scope === 'admin' && user.isImpersonated && user.originalAdminId) {
    return user.originalAdminId;
  }

  // Default: active user context (the impersonated user if impersonating, or normal user)
  return user.id;
}

/**
 * Safely parses SQLite string or array into string[]
 */
function parseOrdenWidgets(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {
      // Return default on parse failure
    }
  }
  return [...DEFAULT_PREFERENCIAS.ordenWidgets];
}

/**
 * Formats database record into canonical API response payload
 */
function formatPreferenciasResponse(pref: any, colorEmpleado?: string | null) {
  return {
    id: pref.id,
    usuarioId: pref.usuarioId,
    tema: pref.tema ?? DEFAULT_PREFERENCIAS.tema,
    colorAcento: pref.colorAcento ?? DEFAULT_PREFERENCIAS.colorAcento,
    paletaPreset: pref.paletaPreset ?? DEFAULT_PREFERENCIAS.paletaPreset,
    densidad: pref.densidad ?? DEFAULT_PREFERENCIAS.densidad,
    tamanoFuente: pref.tamanoFuente ?? DEFAULT_PREFERENCIAS.tamanoFuente,
    sidebarColapsado: Boolean(pref.sidebarColapsado),
    sidebarPosicion: pref.sidebarPosicion ?? DEFAULT_PREFERENCIAS.sidebarPosicion,
    ordenWidgets: parseOrdenWidgets(pref.ordenWidgets),
    animacionesHabilitadas: pref.animacionesHabilitadas !== false,
    colorEmpleado: colorEmpleado || pref.usuario?.colorEmpleado || '#2563eb',
    createdAt: pref.createdAt,
    updatedAt: pref.updatedAt,
  };
}

// ============================================================================
// CONTROLLERS
// ============================================================================

/**
 * GET Preferences Handler
 * - Protected by authenticate
 * - Resolves active user context (or admin if ?scope=admin)
 * - Atomically creates default record if none exists (Zero 404s)
 * - Returns unified preferences + colorEmpleado
 */
export async function getPreferenciasHandler(req: Request, res: Response) {
  try {
    const targetUserId = resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Verify user existence in database
    const user = await prisma.usuario.findUnique({
      where: { id: targetUserId },
      select: { id: true, colorEmpleado: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Atomic upsert: creates defaults if not yet present, or fetches existing
    const preferencias = await prisma.preferenciaUsuario.upsert({
      where: { usuarioId: targetUserId },
      update: {},
      create: {
        usuarioId: targetUserId,
        tema: DEFAULT_PREFERENCIAS.tema,
        colorAcento: DEFAULT_PREFERENCIAS.colorAcento,
        paletaPreset: DEFAULT_PREFERENCIAS.paletaPreset,
        densidad: DEFAULT_PREFERENCIAS.densidad,
        tamanoFuente: DEFAULT_PREFERENCIAS.tamanoFuente,
        sidebarColapsado: DEFAULT_PREFERENCIAS.sidebarColapsado,
        sidebarPosicion: DEFAULT_PREFERENCIAS.sidebarPosicion,
        ordenWidgets: JSON.stringify(DEFAULT_PREFERENCIAS.ordenWidgets),
        animacionesHabilitadas: DEFAULT_PREFERENCIAS.animacionesHabilitadas,
      },
      include: {
        usuario: {
          select: { colorEmpleado: true },
        },
      },
    });

    return res.status(200).json(formatPreferenciasResponse(preferencias, user.colorEmpleado));
  } catch (error: any) {
    console.error('Error in GET preferencias:', error);
    return res.status(500).json({ error: 'Error interno al consultar preferencias de usuario' });
  }
}

/**
 * PUT Preferences Handler
 * - Protected by authenticate
 * - Validates input and sanitizes fields
 * - Updates PreferenciaUsuario and Usuario.colorEmpleado atomically
 * - Returns updated preferences object
 */
export async function updatePreferenciasHandler(req: Request, res: Response) {
  try {
    const targetUserId = resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const body = req.body || {};
    const prefUpdates: any = {};
    let colorEmpleadoUpdate: string | null = null;

    // 1. Validate & extract 'tema' (or 'theme')
    const rawTema = body.tema !== undefined ? body.tema : body.theme;
    if (rawTema !== undefined) {
      if (typeof rawTema !== 'string' || !VALID_TEMAS.includes(rawTema.toLowerCase())) {
        return res.status(400).json({
          error: `Campo 'tema' inválido. Valores permitidos: ${VALID_TEMAS.join(', ')}`,
        });
      }
      prefUpdates.tema = rawTema.toLowerCase();
    }

    // 2. Validate & extract 'colorAcento' (or 'accentColor')
    const rawColorAcento = body.colorAcento !== undefined ? body.colorAcento : body.accentColor;
    if (rawColorAcento !== undefined) {
      if (typeof rawColorAcento !== 'string' || !HEX_COLOR_REGEX.test(rawColorAcento.trim())) {
        return res.status(400).json({
          error: "Campo 'colorAcento' inválido. Debe ser un color hexadecimal (ej: #2563eb)",
        });
      }
      prefUpdates.colorAcento = rawColorAcento.trim();
    }

    // 3. Validate & extract 'paletaPreset'
    const rawPaleta = body.paletaPreset;
    if (rawPaleta !== undefined) {
      if (typeof rawPaleta !== 'string' || !/^[a-zA-Z0-9_-]{2,40}$/.test(rawPaleta.trim())) {
        return res.status(400).json({
          error: "Campo 'paletaPreset' inválido. Debe contener entre 2 y 40 caracteres alfanuméricos.",
        });
      }
      prefUpdates.paletaPreset = rawPaleta.trim();
    }

    // 4. Validate & extract 'densidad' (or 'density')
    const rawDensidad = body.densidad !== undefined ? body.densidad : body.density;
    if (rawDensidad !== undefined) {
      if (typeof rawDensidad !== 'string' || !VALID_DENSIDADES.includes(rawDensidad.toLowerCase())) {
        return res.status(400).json({
          error: `Campo 'densidad' inválido. Valores permitidos: ${VALID_DENSIDADES.join(', ')}`,
        });
      }
      prefUpdates.densidad = rawDensidad.toLowerCase();
    }

    // 5. Validate & extract 'tamanoFuente' (or 'fontSize')
    const rawTamano = body.tamanoFuente !== undefined ? body.tamanoFuente : body.fontSize;
    if (rawTamano !== undefined) {
      if (typeof rawTamano !== 'string' || !VALID_TAMANOS_FUENTE.includes(rawTamano.toLowerCase())) {
        return res.status(400).json({
          error: `Campo 'tamanoFuente' inválido. Valores permitidos: ${VALID_TAMANOS_FUENTE.join(', ')}`,
        });
      }
      prefUpdates.tamanoFuente = rawTamano.toLowerCase();
    }

    // 6. Validate & extract 'sidebarColapsado' (or 'sidebarCollapsed')
    const rawSidebarColapsado =
      body.sidebarColapsado !== undefined ? body.sidebarColapsado : body.sidebarCollapsed;
    if (rawSidebarColapsado !== undefined) {
      if (typeof rawSidebarColapsado !== 'boolean') {
        return res.status(400).json({
          error: "Campo 'sidebarColapsado' debe ser booleano",
        });
      }
      prefUpdates.sidebarColapsado = rawSidebarColapsado;
    }

    // 7. Validate & extract 'sidebarPosicion' (or 'sidebarPosition')
    const rawSidebarPos = body.sidebarPosicion !== undefined ? body.sidebarPosicion : body.sidebarPosition;
    if (rawSidebarPos !== undefined) {
      if (typeof rawSidebarPos !== 'string' || !VALID_SIDEBAR_POSICIONES.includes(rawSidebarPos.toLowerCase())) {
        return res.status(400).json({
          error: `Campo 'sidebarPosicion' inválido. Valores permitidos: ${VALID_SIDEBAR_POSICIONES.join(', ')}`,
        });
      }
      prefUpdates.sidebarPosicion = rawSidebarPos.toLowerCase();
    }

    // 8. Validate & extract 'ordenWidgets' (or 'dashboardWidgetOrder')
    const rawWidgets = body.ordenWidgets !== undefined ? body.ordenWidgets : body.dashboardWidgetOrder;
    if (rawWidgets !== undefined) {
      let parsedWidgets: string[] = [];
      if (Array.isArray(rawWidgets)) {
        parsedWidgets = rawWidgets.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      } else if (typeof rawWidgets === 'string') {
        try {
          const parsed = JSON.parse(rawWidgets);
          if (Array.isArray(parsed)) {
            parsedWidgets = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
          }
        } catch {
          return res.status(400).json({
            error: "Campo 'ordenWidgets' debe ser un arreglo de cadenas",
          });
        }
      } else {
        return res.status(400).json({
          error: "Campo 'ordenWidgets' debe ser un arreglo de cadenas",
        });
      }
      prefUpdates.ordenWidgets = JSON.stringify(parsedWidgets);
    }

    // 9. Validate & extract 'animacionesHabilitadas' (or 'animationsEnabled')
    const rawAnim =
      body.animacionesHabilitadas !== undefined ? body.animacionesHabilitadas : body.animationsEnabled;
    if (rawAnim !== undefined) {
      if (typeof rawAnim !== 'boolean') {
        return res.status(400).json({
          error: "Campo 'animacionesHabilitadas' debe ser booleano",
        });
      }
      prefUpdates.animacionesHabilitadas = rawAnim;
    }

    // 10. Validate & extract 'colorEmpleado' (or 'employeeColor')
    const rawColorEmpleado = body.colorEmpleado !== undefined ? body.colorEmpleado : body.employeeColor;
    if (rawColorEmpleado !== undefined) {
      if (typeof rawColorEmpleado !== 'string' || !HEX_COLOR_REGEX.test(rawColorEmpleado.trim())) {
        return res.status(400).json({
          error: "Campo 'colorEmpleado' inválido. Debe ser un color hexadecimal (ej: #2563eb)",
        });
      }
      colorEmpleadoUpdate = rawColorEmpleado.trim();
    }

    // Perform database operations inside transaction
    const [updatedPrefs, updatedUser] = await prisma.$transaction([
      prisma.preferenciaUsuario.upsert({
        where: { usuarioId: targetUserId },
        update: prefUpdates,
        create: {
          usuarioId: targetUserId,
          tema: prefUpdates.tema ?? DEFAULT_PREFERENCIAS.tema,
          colorAcento: prefUpdates.colorAcento ?? DEFAULT_PREFERENCIAS.colorAcento,
          paletaPreset: prefUpdates.paletaPreset ?? DEFAULT_PREFERENCIAS.paletaPreset,
          densidad: prefUpdates.densidad ?? DEFAULT_PREFERENCIAS.densidad,
          tamanoFuente: prefUpdates.tamanoFuente ?? DEFAULT_PREFERENCIAS.tamanoFuente,
          sidebarColapsado: prefUpdates.sidebarColapsado ?? DEFAULT_PREFERENCIAS.sidebarColapsado,
          sidebarPosicion: prefUpdates.sidebarPosicion ?? DEFAULT_PREFERENCIAS.sidebarPosicion,
          ordenWidgets: prefUpdates.ordenWidgets ?? JSON.stringify(DEFAULT_PREFERENCIAS.ordenWidgets),
          animacionesHabilitadas: prefUpdates.animacionesHabilitadas ?? DEFAULT_PREFERENCIAS.animacionesHabilitadas,
        },
      }),
      colorEmpleadoUpdate !== null
        ? prisma.usuario.update({
            where: { id: targetUserId },
            data: { colorEmpleado: colorEmpleadoUpdate },
            select: { colorEmpleado: true },
          })
        : prisma.usuario.findUnique({
            where: { id: targetUserId },
            select: { colorEmpleado: true },
          }),
    ]);

    return res
      .status(200)
      .json(formatPreferenciasResponse(updatedPrefs, updatedUser?.colorEmpleado));
  } catch (error: any) {
    console.error('Error in PUT preferencias:', error);
    return res.status(500).json({ error: 'Error interno al actualizar preferencias de usuario' });
  }
}

/**
 * Dedicated sub-controller for colorEmpleado update
 */
export async function updateColorEmpleadoHandler(req: Request, res: Response) {
  try {
    const targetUserId = resolveTargetUserId(req);
    if (!targetUserId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { colorEmpleado, color } = req.body || {};
    const hex = colorEmpleado || color;
    if (!hex || typeof hex !== 'string' || !HEX_COLOR_REGEX.test(hex.trim())) {
      return res.status(400).json({
        error: "Campo 'colorEmpleado' inválido. Debe ser un color hexadecimal (ej: #2563eb)",
      });
    }

    const updatedUser = await prisma.usuario.update({
      where: { id: targetUserId },
      data: { colorEmpleado: hex.trim() },
      select: { id: true, colorEmpleado: true },
    });

    return res.status(200).json({
      message: 'Color de empleado actualizado exitosamente',
      usuarioId: updatedUser.id,
      colorEmpleado: updatedUser.colorEmpleado,
    });
  } catch (error: any) {
    console.error('Error in updateColorEmpleado:', error);
    return res.status(500).json({ error: 'Error interno al actualizar color de empleado' });
  }
}

// ============================================================================
// ROUTE REGISTRATIONS
// ============================================================================

// Standard mounted subpath (when router is mounted at /api/usuarios or /api/auth)
preferenciasRouter.get('/preferencias', authenticate, getPreferenciasHandler);
preferenciasRouter.put('/preferencias', authenticate, updatePreferenciasHandler);

// Explicit root-relative paths (when router is mounted at /api)
preferenciasRouter.get('/usuarios/preferencias', authenticate, getPreferenciasHandler);
preferenciasRouter.put('/usuarios/preferencias', authenticate, updatePreferenciasHandler);
preferenciasRouter.get('/auth/preferencias', authenticate, getPreferenciasHandler);
preferenciasRouter.put('/auth/preferencias', authenticate, updatePreferenciasHandler);

// Dedicated color endpoint
preferenciasRouter.put('/usuarios/color-empleado', authenticate, updateColorEmpleadoHandler);
preferenciasRouter.patch('/usuarios/preferencias/color', authenticate, updateColorEmpleadoHandler);

export default preferenciasRouter;
