import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

export const notificacionesRouter = Router();

// ============================================================================
// 1. GET /api/notificaciones
// Scoped to: req.user.id
// Supports: ?leida=true|false, ?limit=50
// Attaches X-Unread-Count header
// ============================================================================
notificacionesRouter.get(
  '/',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const usuarioId = req.user!.id;
      const where: any = { usuarioId };

      if (req.query.leida !== undefined) {
        where.leida = req.query.leida === 'true' || req.query.leida === '1';
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      const [notificaciones, unreadCount] = await Promise.all([
        prisma.notificacion.findMany({
          where,
          include: {
            expediente: {
              select: {
                id: true,
                folio: true,
              },
            },
          },
          orderBy: { fecha: 'desc' },
          take: limit,
        }),
        prisma.notificacion.count({
          where: { usuarioId, leida: false },
        }),
      ]);

      res.setHeader('X-Unread-Count', unreadCount.toString());
      return res.status(200).json(notificaciones);
    } catch (error) {
      console.error('Error al consultar notificaciones:', error);
      return res.status(500).json({ error: 'Error al consultar notificaciones' });
    }
  }
);

// ============================================================================
// 2. GET /api/notificaciones/unread-count
// Fast endpoint for header notification badges
// ============================================================================
notificacionesRouter.get(
  '/unread-count',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const usuarioId = req.user!.id;
      const unreadCount = await prisma.notificacion.count({
        where: { usuarioId, leida: false },
      });
      return res.status(200).json({ count: unreadCount, unread: unreadCount });
    } catch (error) {
      console.error('Error al contar notificaciones no leídas:', error);
      return res.status(500).json({ error: 'Error al consultar conteo de notificaciones' });
    }
  }
);

// ============================================================================
// 3. PATCH /api/notificaciones/:id/leida
// Marks a single notification as read (scoped to req.user.id)
// ============================================================================
notificacionesRouter.patch(
  '/:id/leida',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de notificación inválido' });
      }

      const usuarioId = req.user!.id;
      const notificacion = await prisma.notificacion.findFirst({
        where: { id, usuarioId },
      });

      if (!notificacion) {
        return res.status(404).json({ error: 'Notificación no encontrada' });
      }

      const actualizada = await prisma.notificacion.update({
        where: { id },
        data: { leida: true },
      });

      return res.status(200).json({
        success: true,
        notificacion: actualizada,
      });
    } catch (error) {
      console.error('Error al marcar notificación como leída:', error);
      return res.status(500).json({ error: 'Error al actualizar estado de notificación' });
    }
  }
);

// ============================================================================
// 4. PATCH /api/notificaciones/marcar-todas-leidas
// Marks all unread notifications for current user as read
// ============================================================================
notificacionesRouter.patch(
  '/marcar-todas-leidas',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const usuarioId = req.user!.id;
      const result = await prisma.notificacion.updateMany({
        where: { usuarioId, leida: false },
        data: { leida: true },
      });

      return res.status(200).json({
        success: true,
        count: result.count,
      });
    } catch (error) {
      console.error('Error al marcar todas las notificaciones como leídas:', error);
      return res.status(500).json({ error: 'Error al actualizar notificaciones' });
    }
  }
);

// ============================================================================
// 5. POST /api/notificaciones
// Helper endpoint to register system or test notifications
// ============================================================================
notificacionesRouter.post(
  '/',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { usuarioId, expedienteId, titulo, mensaje, tipo } = req.body;
      if (!titulo || !mensaje) {
        return res.status(400).json({ error: 'Título y mensaje son requeridos' });
      }

      const targetUserId = usuarioId ? parseInt(usuarioId, 10) : req.user!.id;

      const nueva = await prisma.notificacion.create({
        data: {
          usuarioId: targetUserId,
          expedienteId: expedienteId ? parseInt(expedienteId, 10) : null,
          titulo: String(titulo).trim(),
          mensaje: String(mensaje).trim(),
          tipo: tipo ? String(tipo).trim() : 'info',
          leida: false,
        },
      });

      return res.status(201).json(nueva);
    } catch (error) {
      console.error('Error al crear notificación:', error);
      return res.status(500).json({ error: 'Error al crear notificación' });
    }
  }
);

export default notificacionesRouter;
