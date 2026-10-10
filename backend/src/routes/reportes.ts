import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requirePermission } from '../middleware/auth';

export const reportesRouter = Router();

// ============================================================================
// GET /api/reportes/estadisticas
// Returns aggregated judicial statistics & KPIs
// Protected by: 'expedientes:view'
// ============================================================================
reportesRouter.get(
  '/estadisticas',
  authenticate,
  requirePermission('expedientes:view'),
  async (req: Request, res: Response) => {
    try {
      const where: any = {};

      // Optional filters by year or sala
      const yearParam = req.query.ano || req.query.anio;
      if (yearParam) {
        const year = parseInt(yearParam as string, 10);
        if (!isNaN(year)) {
          where.anio = year;
        }
      }

      if (req.query.salaId) {
        const salaId = parseInt(req.query.salaId as string, 10);
        if (!isNaN(salaId)) {
          where.salaId = salaId;
        }
      }

      // 1. Total Expedientes
      const totalExpedientes = await prisma.expediente.count({ where });

      // 2. Expedientes por Estatus
      const [estatusList, byEstatusRaw] = await Promise.all([
        prisma.estatus.findMany({ orderBy: { id: 'asc' } }),
        prisma.expediente.groupBy({
          by: ['estatusId'],
          _count: { id: true },
          where,
        }),
      ]);

      const porEstatus = estatusList.map((est) => {
        const match = byEstatusRaw.find((item) => item.estatusId === est.id);
        const count = match ? match._count.id : 0;
        return {
          estatusId: est.id,
          estatus: est.nombre,
          codigo: est.codigo,
          count,
          cantidad: count,
        };
      });

      // 3. Expedientes por Sala
      const [salasList, bySalaRaw] = await Promise.all([
        prisma.sala.findMany({ orderBy: { id: 'asc' } }),
        prisma.expediente.groupBy({
          by: ['salaId'],
          _count: { id: true },
          where,
        }),
      ]);

      const porSala = salasList.map((sala) => {
        const match = bySalaRaw.find((item) => item.salaId === sala.id);
        const count = match ? match._count.id : 0;
        return {
          salaId: sala.id,
          sala: sala.nombre,
          count,
          cantidad: count,
        };
      });

      // 4. Expedientes por Mes (Chronological)
      const expedientesFechas = await prisma.expediente.findMany({
        where,
        select: { fechaIngreso: true },
        orderBy: { fechaIngreso: 'asc' },
      });

      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const mesMap = new Map<string, number>();

      for (const exp of expedientesFechas) {
        const d = new Date(exp.fechaIngreso);
        const key = `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
        mesMap.set(key, (mesMap.get(key) || 0) + 1);
      }

      const porMes = Array.from(mesMap.entries()).map(([mes, count]) => ({ mes, count }));

      // 5. Judicial KPIs
      const [
        totalAudiencias,
        audienciasProgramadas,
        audienciasCelebradas,
        totalRecursos,
        byTipoRaw,
        tiposList,
      ] = await Promise.all([
        prisma.audiencia.count(),
        prisma.audiencia.count({ where: { estado: 'programada' } }),
        prisma.audiencia.count({ where: { estado: 'celebrada' } }),
        prisma.recurso.count(),
        prisma.expediente.groupBy({
          by: ['tipoAsuntoId'],
          _count: { id: true },
          where,
        }),
        prisma.tipoAsunto.findMany({ orderBy: { id: 'asc' } }),
      ]);

      const porTipoAsunto = tiposList.map((tipo) => {
        const match = byTipoRaw.find((item) => item.tipoAsuntoId === tipo.id);
        return {
          tipoId: tipo.id,
          tipo: tipo.nombre,
          count: match ? match._count.id : 0,
        };
      });

      // Estatus concluidos vs activos
      const concluidosKeywords = ['concluido', 'sentencia', 'archivo'];
      const concluidosIds = estatusList
        .filter((e) => concluidosKeywords.some((kw) => e.nombre.toLowerCase().includes(kw) || e.codigo.toLowerCase().includes(kw)))
        .map((e) => e.id);

      const totalConcluidos = await prisma.expediente.count({
        where: { ...where, estatusId: { in: concluidosIds } },
      });
      const totalEnTramite = Math.max(0, totalExpedientes - totalConcluidos);
      const tasaConclusion = totalExpedientes > 0 ? `${Math.round((totalConcluidos / totalExpedientes) * 100)}%` : '0%';

      const kpis = {
        totalAudiencias,
        audienciasProgramadas,
        audienciasCelebradas,
        totalRecursos,
        totalConcluidos,
        totalEnTramite,
        tasaConclusion,
      };

      return res.status(200).json({
        totalExpedientes,
        porEstatus,
        porSala,
        porMes,
        porTipoAsunto,
        kpis,
      });
    } catch (error) {
      console.error('Error al generar estadísticas de reportes:', error);
      return res.status(500).json({ error: 'Error al generar estadísticas y reportes' });
    }
  }
);

export default reportesRouter;
