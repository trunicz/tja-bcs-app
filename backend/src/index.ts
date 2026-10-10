import express from 'express';
import cors from 'cors';
import prisma from './lib/prisma';
import authRouter from './routes/auth';
import rolesRouter from './routes/roles';
import preferenciasRouter from './routes/preferencias';
import audienciasRouter from './routes/audiencias';
import notificacionesRouter from './routes/notificaciones';
import reportesRouter from './routes/reportes';
import { authenticate, requirePermission } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==========================================
// AUTHENTICATION & IMPERSONATION ROUTES (M1)
// ==========================================
app.use('/api/auth', authRouter);

// ==========================================
// ROLES & PERMISSIONS MANAGEMENT ROUTES (M2)
// ==========================================
app.use('/api', rolesRouter);

// ==========================================
// PREFERENCES ROUTES (M1)
// ==========================================
app.use('/api', preferenciasRouter);
app.use('/api/usuarios', preferenciasRouter);
app.use('/api/auth', preferenciasRouter);

// ==========================================
// SCAFFOLDING & MULTI-AREA ROUTES (M1)
// ==========================================
app.use('/api/audiencias', audienciasRouter);
app.use('/api/notificaciones', notificacionesRouter);
app.use('/api/reportes', reportesRouter);

// ==========================================
// 1. EXPEDIENTES
// ==========================================

// [1/15] GET Todos los expedientes (RF-001)
// Protected by: 'expedientes:view'
// Enhanced with filters: search (folio, notas, sala, tipoAsunto, ley), salaId, estatusId, subEstatusId, limit
app.get('/api/expedientes', authenticate, requirePermission('expedientes:view'), async (req, res) => {
  try {
    const where: any = {};

    // 1. Text search across folio, notas, sala, tipoAsunto, ley (supports both ?search= and ?q=)
    const rawSearch = (req.query.search || req.query.q);
    if (rawSearch && typeof rawSearch === 'string') {
      const term = rawSearch.trim();
      if (term.length > 0) {
        where.OR = [
          { folio: { contains: term } },
          { notas: { contains: term } },
          { sala: { nombre: { contains: term } } },
          { tipoAsunto: { nombre: { contains: term } } },
          { ley: { nombre: { contains: term } } },
        ];
      }
    }

    // 2. Sala filter
    if (req.query.salaId) {
      const salaId = parseInt(req.query.salaId as string, 10);
      if (!isNaN(salaId)) {
        where.salaId = salaId;
      }
    }

    // 3. Estatus filter
    if (req.query.estatusId) {
      const estatusId = parseInt(req.query.estatusId as string, 10);
      if (!isNaN(estatusId)) {
        where.estatusId = estatusId;
      }
    }

    // 4. SubEstatus filter
    if (req.query.subEstatusId) {
      const subEstatusId = parseInt(req.query.subEstatusId as string, 10);
      if (!isNaN(subEstatusId)) {
        where.subEstatusId = subEstatusId;
      }
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const expedientes = await prisma.expediente.findMany({
      where,
      take: limit,
      include: {
        sala: true,
        estatus: true,
        subEstatus: true,
        tipoAsunto: true,
        ley: true,
      },
      orderBy: { fechaIngreso: 'desc' }
    });
    res.json(expedientes);
  } catch (error) {
    console.error('Error al obtener expedientes:', error);
    res.status(500).json({ error: 'Error al obtener expedientes' });
  }
});

// [2/15] GET Detalle de expediente por ID (RF-002)
// Protected by: 'expedientes:view'
app.get('/api/expedientes/:id', authenticate, requirePermission('expedientes:view'), async (req, res) => {
  try {
    const expedienteId = parseInt(req.params.id, 10);
    if (isNaN(expedienteId)) {
      return res.status(400).json({ error: 'ID de expediente inválido' });
    }

    const expediente = await prisma.expediente.findUnique({
      where: { id: expedienteId },
      include: {
        sala: true,
        estatus: true,
        subEstatus: true,
        tipoAsunto: true,
        ley: true,
        bitacora: {
          include: { 
            usuario: {
              select: {
                id: true,
                nombre: true,
                correo: true,
                rol: true,
                colorEmpleado: true,
              }
            } 
          },
          orderBy: { fecha: 'desc' }
        },
        recursos: true
      }
    });
    if (!expediente) return res.status(404).json({ error: 'No encontrado' });
    res.json(expediente);
  } catch (error) {
    console.error('Error al obtener detalle:', error);
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
});

// [3/15] POST Crear un expediente (RF-004)
// Protected by: 'expedientes:create'
// User scoping: Replaces hardcoded usuarioId: 1 with req.user!.id
app.post('/api/expedientes', authenticate, requirePermission('expedientes:create'), async (req, res) => {
  try {
    const { 
      folio, consecutivo, anio, fechaIngreso, 
      tipoAsuntoId, leyId, salaId, estatusId, subEstatusId 
    } = req.body;

    const actorUsuarioId = req.user!.id;
    
    const nuevo = await prisma.$transaction(async (tx) => {
      const exp = await tx.expediente.create({
        data: {
          folio,
          consecutivo: Number(consecutivo),
          anio: Number(anio),
          fechaIngreso: new Date(fechaIngreso),
          tipoAsuntoId: Number(tipoAsuntoId),
          leyId: Number(leyId),
          salaId: Number(salaId),
          estatusId: Number(estatusId),
          subEstatusId: Number(subEstatusId)
        }
      });

      // Crear evento inicial en bitácora con el actor autenticado o suplantado
      await tx.movimientoEstatus.create({
        data: {
          expedienteId: exp.id,
          estatusNuevoId: exp.estatusId,
          subEstatusNuevoId: exp.subEstatusId,
          usuarioId: actorUsuarioId,
          notas: 'Apertura de expediente'
        }
      });

      return exp;
    });

    res.status(201).json(nuevo);
  } catch (error) {
    console.error('Error al crear expediente:', error);
    res.status(500).json({ error: 'Error al crear expediente' });
  }
});

// [4/15] PUT Cambiar Estatus (RF-006, RF-007)
// Protected by: 'expedientes:status'
// User scoping: Replaces hardcoded usuarioId: 1 with req.user!.id
app.put('/api/expedientes/:id/estatus', authenticate, requirePermission('expedientes:status'), async (req, res) => {
  try {
    const expedienteId = parseInt(req.params.id, 10);
    if (isNaN(expedienteId)) {
      return res.status(400).json({ error: 'ID de expediente inválido' });
    }

    const { nuevoEstatusId, nuevoSubEstatusId, notas } = req.body;
    const actorUsuarioId = req.user!.id;

    const actual = await prisma.expediente.findUnique({ where: { id: expedienteId } });
    if (!actual) return res.status(404).json({ error: 'No encontrado' });

    const actualizado = await prisma.$transaction(async (tx) => {
      // Actualizar expediente
      const exp = await tx.expediente.update({
        where: { id: expedienteId },
        data: {
          estatusId: Number(nuevoEstatusId),
          subEstatusId: Number(nuevoSubEstatusId),
          fechaUltimoMovimiento: new Date()
        }
      });

      // Guardar en bitácora el cambio con el actor autenticado o suplantado
      await tx.movimientoEstatus.create({
        data: {
          expedienteId,
          estatusAnteriorId: actual.estatusId,
          subEstatusAnteriorId: actual.subEstatusId,
          estatusNuevoId: exp.estatusId,
          subEstatusNuevoId: exp.subEstatusId,
          usuarioId: actorUsuarioId,
          notas: notas || null
        }
      });

      return exp;
    });

    res.json(actualizado);
  } catch (error) {
    console.error('Error al cambiar estatus:', error);
    res.status(500).json({ error: 'Error al cambiar estatus' });
  }
});

// [5/15] POST Registrar Recurso / Incidente (RF-009)
// Protected by: 'expedientes:edit'
app.post('/api/expedientes/:id/recursos', authenticate, requirePermission('expedientes:edit'), async (req, res) => {
  try {
    const expedienteId = parseInt(req.params.id, 10);
    if (isNaN(expedienteId)) {
      return res.status(400).json({ error: 'ID de expediente inválido' });
    }

    const { tipo, fecha, estatus } = req.body;
    
    const recurso = await prisma.recurso.create({
      data: {
        expedienteId,
        tipo,
        fecha: new Date(fecha),
        estatus
      }
    });
    res.status(201).json(recurso);
  } catch (error) {
    console.error('Error al agregar recurso:', error);
    res.status(500).json({ error: 'Error al agregar recurso' });
  }
});

// ==========================================
// 2. CATALOGOS (RF-013)
// ==========================================

// [6/15] GET Catálogos Generales
// Protected by: 'catalogos:view'
app.get('/api/catalogos', authenticate, requirePermission('catalogos:view'), async (req, res) => {
  try {
    const salas = await prisma.sala.findMany();
    const estatus = await prisma.estatus.findMany({ include: { subEstatus: true } });
    const leyes = await prisma.ley.findMany();
    const tipos = await prisma.tipoAsunto.findMany();
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        correo: true,
        activo: true,
        rolId: true,
        salaId: true,
        rol: true,
        colorEmpleado: true,
      }
    });
    
    res.json({ salas, estatus, leyes, tipos, usuarios });
  } catch (error) {
    console.error('Error al obtener catálogos:', error);
    res.status(500).json({ error: 'Error al obtener catálogos' });
  }
});

// ==========================================
// 3. USUARIOS (Gestión y Actividad)
// ==========================================

// [7/15] GET Listado de Usuarios
// Protected by: 'usuarios:view'
app.get('/api/usuarios', authenticate, requirePermission('usuarios:view'), async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        correo: true,
        activo: true,
        rolId: true,
        salaId: true,
        rol: true,
        sala: true,
        colorEmpleado: true,
      },
      orderBy: { id: 'desc' }
    });
    res.json(usuarios);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// [8/15] POST Crear Usuario
// Protected by: 'usuarios:create'
app.post('/api/usuarios', authenticate, requirePermission('usuarios:create'), async (req, res) => {
  try {
    const { nombre, correo, password, rolId, salaId } = req.body;
    if (!nombre || !correo || !password || !rolId) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser proporcionados' });
    }

    const nuevo = await prisma.usuario.create({
      data: {
        nombre: String(nombre).trim(),
        correo: String(correo).trim().toLowerCase(),
        password, // En producción se recomienda hasheo (ej: bcrypt o sha256)
        rolId: parseInt(rolId, 10),
        salaId: salaId ? parseInt(salaId, 10) : null
      },
      select: {
        id: true,
        nombre: true,
        correo: true,
        activo: true,
        rolId: true,
        salaId: true,
        rol: true,
        sala: true,
      }
    });
    res.status(201).json(nuevo);
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// [9/15] GET Bitácora de Actividad por Usuario
// Protected by: 'usuarios:view'
app.get('/api/usuarios/:id/actividad', authenticate, requirePermission('usuarios:view'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const actividad = await prisma.movimientoEstatus.findMany({
      where: { usuarioId: userId },
      include: {
        expediente: true
      },
      orderBy: { fecha: 'desc' },
      take: 50 // Últimas 50 acciones
    });
    res.json(actividad);
  } catch (error) {
    console.error('Error al obtener actividad:', error);
    res.status(500).json({ error: 'Error al obtener actividad' });
  }
});

// [10/15] GET Detalle de Usuario por ID
// Protected by: 'usuarios:view'
app.get('/api/usuarios/:id', authenticate, requirePermission('usuarios:view'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        correo: true,
        activo: true,
        rolId: true,
        salaId: true,
        rol: true,
        sala: true
      }
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// [11/15] PUT Actualizar Usuario
// Protected by: 'usuarios:edit'
app.put('/api/usuarios/:id', authenticate, requirePermission('usuarios:edit'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const { nombre, correo, rolId, salaId, activo } = req.body;
    const actualizado = await prisma.usuario.update({
      where: { id: userId },
      data: {
        nombre: nombre !== undefined ? String(nombre).trim() : undefined,
        correo: correo !== undefined ? String(correo).trim().toLowerCase() : undefined,
        activo: activo !== undefined ? Boolean(activo) : undefined,
        rolId: rolId !== undefined ? parseInt(rolId, 10) : undefined,
        salaId: salaId !== undefined ? (salaId ? parseInt(salaId, 10) : null) : undefined
      },
      select: {
        id: true,
        nombre: true,
        correo: true,
        activo: true,
        rolId: true,
        salaId: true,
        rol: true,
        sala: true
      }
    });
    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// [12/15] PATCH Suspender / Activar Usuario
// Protected by: 'usuarios:edit'
app.patch('/api/usuarios/:id/suspender', authenticate, requirePermission('usuarios:edit'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    // Guard against self-suspension
    if (req.user?.id === userId) {
      return res.status(400).json({ error: 'No es posible suspender su propia cuenta de usuario' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    const actualizado = await prisma.usuario.update({
      where: { id: userId },
      data: { activo: !usuario.activo },
      select: {
        id: true,
        nombre: true,
        correo: true,
        activo: true,
        rolId: true,
        salaId: true
      }
    });
    res.json(actualizado);
  } catch (error) {
    console.error('Error al suspender/activar usuario:', error);
    res.status(500).json({ error: 'Error al suspender/activar usuario' });
  }
});

// [13/15] DELETE Eliminar Usuario
// Protected by: 'usuarios:delete'
app.delete('/api/usuarios/:id', authenticate, requirePermission('usuarios:delete'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    // Guard against self-deletion
    if (req.user?.id === userId) {
      return res.status(400).json({ error: 'No es posible eliminar su propia cuenta de usuario' });
    }

    await prisma.usuario.delete({
      where: { id: userId }
    });
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario. Puede que tenga registros asociados.' });
  }
});

// ==========================================
// 4. DASHBOARD & MÉTRICAS
// ==========================================

// [14/15] GET Métricas del Dashboard & Resumen Ejecutivo (Milestone 5)
// Protected by: 'expedientes:view'
app.get('/api/dashboard/metricas', authenticate, requirePermission('expedientes:view'), async (req, res) => {
  try {
    const totalExpedientes = await prisma.expediente.count();
    
    // Expedientes por Sala
    const expedientesPorSalaRaw = await prisma.expediente.groupBy({
      by: ['salaId'],
      _count: { id: true }
    });
    const salas = await prisma.sala.findMany({ orderBy: { id: 'asc' } });
    const expedientesPorSala = expedientesPorSalaRaw.map(item => ({
      sala: salas.find(s => s.id === item.salaId)?.nombre || 'Desconocida',
      cantidad: item._count.id
    }));

    // Expedientes por Estatus
    const expedientesPorEstatusRaw = await prisma.expediente.groupBy({
      by: ['estatusId'],
      _count: { id: true }
    });
    const estatusList = await prisma.estatus.findMany({ orderBy: { id: 'asc' } });
    const expedientesPorEstatus = expedientesPorEstatusRaw.map(item => ({
      estatus: estatusList.find(e => e.id === item.estatusId)?.nombre || 'Desconocido',
      cantidad: item._count.id
    }));

    // ----------------------------------------------------
    // Resumen Ejecutivo Jurisdiccional (Milestone 5)
    // ----------------------------------------------------
    const concluidosKeywords = ['concluido', 'sentencia', 'archivo'];
    const concluidosIds = estatusList
      .filter(e => concluidosKeywords.some(kw => e.nombre.toLowerCase().includes(kw) || e.codigo.toLowerCase().includes(kw)))
      .map(e => e.id);

    // 1. Carga procesal por sala (expedientes activos y porcentaje relativo)
    const activosPorSalaRaw = await prisma.expediente.groupBy({
      by: ['salaId'],
      where: { estatusId: { notIn: concluidosIds } },
      _count: { id: true },
    });
    const totalActivos = activosPorSalaRaw.reduce((sum, item) => sum + item._count.id, 0);

    const cargaPorSala = salas.map(s => {
      const match = activosPorSalaRaw.find(item => item.salaId === s.id);
      const activos = match ? match._count.id : 0;
      const porcentaje = totalActivos > 0 ? Math.round((activos / totalActivos) * 100) : 0;
      return {
        salaId: s.id,
        sala: s.nombre,
        activos,
        porcentaje,
      };
    });

    // 2. Resoluciones pendientes (expedientes en fase de proyecto / elaboración de sentencia, estatusId: 2)
    const proyectoIds = estatusList
      .filter(e => e.id === 2 || e.codigo.toLowerCase().includes('proyecto') || e.nombre.toLowerCase().includes('proyecto'))
      .map(e => e.id);
    const resolucionesPendientes = await prisma.expediente.count({
      where: { estatusId: { in: proyectoIds.length > 0 ? proyectoIds : [2] } },
    });

    // 3. Audiencias próximas en las siguientes 48 horas
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const audienciasProximas48h = await prisma.audiencia.count({
      where: {
        estado: 'programada',
        fecha: {
          gte: now,
          lte: in48h,
        },
      },
    });

    // 4. Términos urgentes / perentorios
    // Active expedientes without movement in >30 days or pending peremptory terms
    const treintaDiasAtras = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const terminosUrgentes = await prisma.expediente.count({
      where: {
        estatusId: { notIn: concluidosIds },
        OR: [
          { notificaciones: { some: { tipo: 'urgente', leida: false } } },
          { recursos: { some: {} } },
          { fechaUltimoMovimiento: { lte: treintaDiasAtras } },
        ],
      },
    });

    res.json({
      totalExpedientes,
      expedientesPorSala,
      expedientesPorEstatus,
      resumenEjecutivo: {
        cargaPorSala,
        resolucionesPendientes,
        audienciasProximas48h,
        terminosUrgentes,
      },
    });
  } catch (error) {
    console.error('Error al obtener metricas:', error);
    res.status(500).json({ error: 'Error al obtener metricas' });
  }
});

// [15/15] GET Actividad Global Reciente (Feed de Auditoría)
// Protected by: 'expedientes:view'
app.get('/api/actividad', authenticate, requirePermission('expedientes:view'), async (req, res) => {
  try {
    const actividad = await prisma.movimientoEstatus.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            correo: true,
            rol: true,
            colorEmpleado: true,
          }
        },
        expediente: true
      },
      orderBy: { fecha: 'desc' },
      take: 50
    });
    res.json(actividad);
  } catch (error) {
    console.error('Error al obtener actividad global:', error);
    res.status(500).json({ error: 'Error al obtener actividad global' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de TJA BCS corriendo en http://localhost:${PORT}`);
});
