import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requirePermission, requireAnyPermission } from '../middleware/auth';

export const audienciasRouter = Router();

// ============================================================================
// 1. GET /api/audiencias
// Query filters: mes (1-12), ano/anio (YYYY), expedienteId, salaId, estado, tipo
// Protected by: 'expedientes:view'
// ============================================================================
audienciasRouter.get(
  '/',
  authenticate,
  requirePermission('expedientes:view'),
  async (req: Request, res: Response) => {
    try {
      const where: any = {};

      // 1. Date range filter (mes & ano/anio)
      const yearParam = req.query.ano || req.query.anio || req.query.year;
      if (yearParam) {
        const year = parseInt(yearParam as string, 10);
        if (!isNaN(year)) {
          if (req.query.mes) {
            const mes = parseInt(req.query.mes as string, 10);
            if (!isNaN(mes) && mes >= 1 && mes <= 12) {
              const startDate = new Date(Date.UTC(year, mes - 1, 1, 0, 0, 0));
              const endDate = new Date(Date.UTC(mes === 12 ? year + 1 : year, mes === 12 ? 0 : mes, 1, 0, 0, 0));
              where.fecha = { gte: startDate, lt: endDate };
            }
          } else {
            const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
            const endDate = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
            where.fecha = { gte: startDate, lt: endDate };
          }
        }
      }

      // 2. Expediente filter
      if (req.query.expedienteId) {
        const expedienteId = parseInt(req.query.expedienteId as string, 10);
        if (!isNaN(expedienteId)) {
          where.expedienteId = expedienteId;
        }
      }

      // 3. Sala filter
      if (req.query.salaId) {
        const salaId = parseInt(req.query.salaId as string, 10);
        if (!isNaN(salaId)) {
          where.salaId = salaId;
        }
      }

      // 4. Estado filter (programada, celebrada, cancelada, diferida)
      if (req.query.estado && typeof req.query.estado === 'string') {
        where.estado = req.query.estado.trim();
      }

      // 5. Tipo filter
      if (req.query.tipo && typeof req.query.tipo === 'string') {
        where.tipo = { contains: req.query.tipo.trim() };
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const audiencias = await prisma.audiencia.findMany({
        where,
        include: {
          expediente: {
            select: {
              id: true,
              folio: true,
              estatus: { select: { id: true, nombre: true } },
              tipoAsunto: { select: { id: true, nombre: true } },
            },
          },
          sala: {
            select: {
              id: true,
              nombre: true,
            },
          },
          usuario: {
            select: {
              id: true,
              nombre: true,
              correo: true,
              colorEmpleado: true,
            },
          },
        },
        orderBy: { fecha: 'asc' },
        take: limit,
      });

      return res.status(200).json(audiencias);
    } catch (error) {
      console.error('Error al obtener audiencias:', error);
      return res.status(500).json({ error: 'Error al consultar audiencias judiciales' });
    }
  }
);

// ============================================================================
// 2. GET /api/audiencias/:id
// Protected by: 'expedientes:view'
// ============================================================================
audienciasRouter.get(
  '/:id',
  authenticate,
  requirePermission('expedientes:view'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de audiencia inválido' });
      }

      const audiencia = await prisma.audiencia.findUnique({
        where: { id },
        include: {
          expediente: {
            select: {
              id: true,
              folio: true,
              estatus: true,
              tipoAsunto: true,
            },
          },
          sala: {
            select: {
              id: true,
              nombre: true,
            },
          },
          usuario: {
            select: {
              id: true,
              nombre: true,
              correo: true,
              colorEmpleado: true,
            },
          },
        },
      });

      if (!audiencia) {
        return res.status(404).json({ error: 'Audiencia no encontrada' });
      }

      return res.status(200).json(audiencia);
    } catch (error) {
      console.error('Error al obtener audiencia:', error);
      return res.status(500).json({ error: 'Error al consultar audiencia' });
    }
  }
);

// ============================================================================
// 3. POST /api/audiencias
// Protected by: 'expedientes:create' or 'expedientes:edit'
// ============================================================================
audienciasRouter.post(
  '/',
  authenticate,
  requireAnyPermission('expedientes:create', 'expedientes:edit'),
  async (req: Request, res: Response) => {
    try {
      const { expedienteId, fecha, tipo, salaId, descripcion, estado, usuarioId } = req.body;

      if (!expedienteId || !fecha || !tipo) {
        return res.status(400).json({ error: 'Los campos expedienteId, fecha y tipo son obligatorios' });
      }

      const expId = parseInt(expedienteId, 10);
      const expediente = await prisma.expediente.findUnique({ where: { id: expId } });
      if (!expediente) {
        return res.status(404).json({ error: 'El expediente especificado no existe' });
      }

      const fechaObj = new Date(fecha);
      if (isNaN(fechaObj.getTime())) {
        return res.status(400).json({ error: 'Formato de fecha inválido' });
      }

      const nuevaAudiencia = await prisma.audiencia.create({
        data: {
          expedienteId: expId,
          fecha: fechaObj,
          tipo: String(tipo).trim(),
          descripcion: descripcion ? String(descripcion).trim() : null,
          estado: estado ? String(estado).trim() : 'programada',
          salaId: salaId ? parseInt(salaId, 10) : expediente.salaId,
          usuarioId: usuarioId ? parseInt(usuarioId, 10) : req.user!.id,
        },
        include: {
          expediente: { select: { id: true, folio: true } },
          sala: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true, colorEmpleado: true } },
        },
      });

      return res.status(201).json(nuevaAudiencia);
    } catch (error) {
      console.error('Error al crear audiencia:', error);
      return res.status(500).json({ error: 'Error al programar audiencia' });
    }
  }
);

// ============================================================================
// 4. PUT /api/audiencias/:id
// Protected by: 'expedientes:edit'
// ============================================================================
audienciasRouter.put(
  '/:id',
  authenticate,
  requirePermission('expedientes:edit'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de audiencia inválido' });
      }

      const existe = await prisma.audiencia.findUnique({ where: { id } });
      if (!existe) {
        return res.status(404).json({ error: 'Audiencia no encontrada' });
      }

      const { fecha, tipo, salaId, descripcion, estado, usuarioId } = req.body;

      const actualizada = await prisma.audiencia.update({
        where: { id },
        data: {
          fecha: fecha ? new Date(fecha) : undefined,
          tipo: tipo !== undefined ? String(tipo).trim() : undefined,
          salaId: salaId !== undefined ? (salaId ? parseInt(salaId, 10) : null) : undefined,
          descripcion: descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : undefined,
          estado: estado !== undefined ? String(estado).trim() : undefined,
          usuarioId: usuarioId !== undefined ? (usuarioId ? parseInt(usuarioId, 10) : null) : undefined,
        },
        include: {
          expediente: { select: { id: true, folio: true } },
          sala: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true, colorEmpleado: true } },
        },
      });

      return res.status(200).json(actualizada);
    } catch (error) {
      console.error('Error al actualizar audiencia:', error);
      return res.status(500).json({ error: 'Error al actualizar audiencia' });
    }
  }
);

// ============================================================================
// 5. DELETE /api/audiencias/:id
// Protected by: 'expedientes:edit'
// ============================================================================
audienciasRouter.delete(
  '/:id',
  authenticate,
  requirePermission('expedientes:edit'),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'ID de audiencia inválido' });
      }

      const existe = await prisma.audiencia.findUnique({ where: { id } });
      if (!existe) {
        return res.status(404).json({ error: 'Audiencia no encontrada' });
      }

      await prisma.audiencia.delete({ where: { id } });
      return res.status(200).json({ message: 'Audiencia eliminada exitosamente', id });
    } catch (error) {
      console.error('Error al eliminar audiencia:', error);
      return res.status(500).json({ error: 'Error al eliminar audiencia' });
    }
  }
);

export default audienciasRouter;
