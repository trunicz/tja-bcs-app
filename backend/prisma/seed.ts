import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando el seeder para TJA BCS (Milestone 1)...');

  // 1. Roles
  const roles = [
    { nombre: 'Administrador' },
    { nombre: 'Magistrado/Sala' },
    { nombre: 'Secretario de Acuerdos' },
    { nombre: 'Consulta/Dirección' },
  ];
  for (const rol of roles) {
    await prisma.rol.upsert({
      where: { nombre: rol.nombre },
      update: {},
      create: rol,
    });
  }

  // 2. Salas
  const salas = [
    { nombre: 'Sala I' },
    { nombre: 'Sala II' },
    { nombre: 'Sala III' },
    { nombre: 'Pleno' },
  ];
  for (const sala of salas) {
    await prisma.sala.upsert({
      where: { nombre: sala.nombre },
      update: {},
      create: sala,
    });
  }

  // 3. Tipos de Asunto y Leyes
  const tipos = [{ nombre: 'NULIDAD' }, { nombre: 'LRA' }, { nombre: 'VARIOS' }];
  for (const tipo of tipos) {
    await prisma.tipoAsunto.upsert({ where: { nombre: tipo.nombre }, update: {}, create: tipo });
  }

  const leyes = [{ nombre: 'LPCA' }, { nombre: 'LRA' }];
  for (const ley of leyes) {
    await prisma.ley.upsert({ where: { nombre: ley.nombre }, update: {}, create: ley });
  }

  // 4. Estatus y SubEstatus
  const estatusData = [
    {
      codigo: '1.- TRÁMITE',
      nombre: 'Trámite',
      subEstatus: [
        { codigo: 1, nombre: 'Admisión de demanda', responsable: 'Isolda / Paul' },
        { codigo: 2, nombre: 'Desahogo de pruebas', responsable: 'Isolda / Paul' },
      ],
    },
    {
      codigo: '2.- PROYECTO',
      nombre: 'Proyecto',
      subEstatus: [
        { codigo: 3, nombre: 'Elaboración de proyecto de resolución', responsable: 'Paul' },
      ],
    },
    {
      codigo: '3.- CONCLUIDOS',
      nombre: 'Concluidos',
      subEstatus: [
        { codigo: 4, nombre: 'Sentencia dictada', responsable: 'Estudio y Cuenta' },
      ],
    },
    {
      codigo: '7.- ARCHIVO',
      nombre: 'Archivo',
      subEstatus: [
        { codigo: 5, nombre: 'Expediente cerrado administrativamente', responsable: 'Paul' },
      ],
    },
  ];

  for (const e of estatusData) {
    await prisma.estatus.upsert({
      where: { codigo: e.codigo },
      update: {},
      create: {
        codigo: e.codigo,
        nombre: e.nombre,
        subEstatus: {
          create: e.subEstatus,
        },
      },
    });
  }

  // 5. Permisos Granulares (13 permisos oficiales según PROJECT.md)
  const permisosData = [
    { codigo: 'expedientes:view', nombre: 'Ver expedientes', descripcion: 'Consultar el listado y detalle de expedientes judiciales', modulo: 'expedientes' },
    { codigo: 'expedientes:create', nombre: 'Crear expedientes', descripcion: 'Dar de alta y registrar nuevos expedientes en el sistema', modulo: 'expedientes' },
    { codigo: 'expedientes:edit', nombre: 'Editar expedientes', descripcion: 'Modificar datos del expediente y registrar recursos o incidentes', modulo: 'expedientes' },
    { codigo: 'expedientes:status', nombre: 'Cambiar estatus de expedientes', descripcion: 'Actualizar la fase procesal y subestatus del expediente', modulo: 'expedientes' },
    { codigo: 'usuarios:view', nombre: 'Ver usuarios', descripcion: 'Consultar directorio de usuarios y bitácora de actividad', modulo: 'usuarios' },
    { codigo: 'usuarios:create', nombre: 'Crear usuarios', descripcion: 'Registrar nuevos usuarios y operadores del tribunal', modulo: 'usuarios' },
    { codigo: 'usuarios:edit', nombre: 'Editar usuarios', descripcion: 'Modificar datos de usuario y activar/suspender cuentas', modulo: 'usuarios' },
    { codigo: 'usuarios:delete', nombre: 'Eliminar usuarios', descripcion: 'Eliminar permanentemente registros de usuarios del sistema', modulo: 'usuarios' },
    { codigo: 'roles:view', nombre: 'Ver roles y permisos', descripcion: 'Consultar la matriz de configuración de roles y permisos', modulo: 'roles' },
    { codigo: 'roles:manage', nombre: 'Administrar roles y permisos', descripcion: 'Asignar o desasignar permisos en la matriz de roles', modulo: 'roles' },
    { codigo: 'catalogos:view', nombre: 'Ver catálogos', descripcion: 'Consultar catálogos del tribunal (Salas, Leyes, Estatus, Tipos)', modulo: 'catalogos' },
    { codigo: 'catalogos:manage', nombre: 'Administrar catálogos', descripcion: 'Crear o modificar catálogos del sistema', modulo: 'catalogos' },
    { codigo: 'impersonate:use', nombre: 'Suplantar identidad (Ver como)', descripcion: 'Exclusivo para Administrador Global: iniciar y cambiar contexto de sesión', modulo: 'seguridad' },
  ];

  for (const perm of permisosData) {
    await prisma.permiso.upsert({
      where: { codigo: perm.codigo },
      update: { nombre: perm.nombre, descripcion: perm.descripcion, modulo: perm.modulo },
      create: perm,
    });
  }

  // 6. Asignación de Permisos a Roles (Matriz Oficial)
  const rolePermissionMapping: Record<string, string[]> = {
    Administrador: [
      'expedientes:view', 'expedientes:create', 'expedientes:edit', 'expedientes:status',
      'usuarios:view', 'usuarios:create', 'usuarios:edit', 'usuarios:delete',
      'roles:view', 'roles:manage', 'catalogos:view', 'catalogos:manage', 'impersonate:use',
    ],
    'Magistrado/Sala': [
      'expedientes:view', 'expedientes:edit', 'expedientes:status', 'catalogos:view',
    ],
    'Secretario de Acuerdos': [
      'expedientes:view', 'expedientes:create', 'expedientes:edit', 'expedientes:status', 'catalogos:view',
    ],
    'Consulta/Dirección': [
      'expedientes:view', 'catalogos:view',
    ],
  };

  for (const [roleName, codigos] of Object.entries(rolePermissionMapping)) {
    const rol = await prisma.rol.findUnique({ where: { nombre: roleName } });
    if (!rol) continue;

    for (const codigo of codigos) {
      const permiso = await prisma.permiso.findUnique({ where: { codigo } });
      if (!permiso) continue;

      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rol.id, permisoId: permiso.id } },
        update: {},
        create: { rolId: rol.id, permisoId: permiso.id },
      });
    }
  }

  // 7. Cuentas de Usuario de Prueba con Distinct colorEmpleado
  const testUsers = [
    {
      nombre: 'Administrador TJA',
      correo: 'admin@tjabcs.gob.mx',
      password: 'password123',
      rolNombre: 'Administrador',
      salaNombre: null,
      colorEmpleado: '#7c3aed', // Púrpura imperial
    },
    {
      nombre: 'Usuario Consulta',
      correo: 'consulta@tjabcs.gob.mx',
      password: 'password123',
      rolNombre: 'Consulta/Dirección',
      salaNombre: null,
      colorEmpleado: '#0284c7', // Azul cielo
    },
    {
      nombre: 'Magistrado Sala I',
      correo: 'magistrado1@tjabcs.gob.mx',
      password: 'password123',
      rolNombre: 'Magistrado/Sala',
      salaNombre: 'Sala I',
      colorEmpleado: '#b45309', // Ámbar judicial
    },
    {
      nombre: 'Secretario Acuerdos Sala I',
      correo: 'secretario1@tjabcs.gob.mx',
      password: 'password123',
      rolNombre: 'Secretario de Acuerdos',
      salaNombre: 'Sala I',
      colorEmpleado: '#059669', // Verde esmeralda
    },
  ];

  for (const u of testUsers) {
    const rol = await prisma.rol.findUnique({ where: { nombre: u.rolNombre } });
    const sala = u.salaNombre ? await prisma.sala.findUnique({ where: { nombre: u.salaNombre } }) : null;

    if (rol) {
      await prisma.usuario.upsert({
        where: { correo: u.correo },
        update: {
          nombre: u.nombre,
          rolId: rol.id,
          salaId: sala ? sala.id : null,
          colorEmpleado: u.colorEmpleado,
          activo: true,
        },
        create: {
          nombre: u.nombre,
          correo: u.correo,
          password: u.password,
          rolId: rol.id,
          salaId: sala ? sala.id : null,
          colorEmpleado: u.colorEmpleado,
          activo: true,
        },
      });
    }
  }

  // 8. Seed Initial PreferenciaUsuario Records
  const preferenciasData = [
    {
      correo: 'admin@tjabcs.gob.mx',
      tema: 'dark',
      colorAcento: '#7c3aed',
      paletaPreset: 'purpura-real',
      densidad: 'comfortable',
      tamanoFuente: 'normal',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: JSON.stringify(['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes']),
      animacionesHabilitadas: true,
    },
    {
      correo: 'consulta@tjabcs.gob.mx',
      tema: 'light',
      colorAcento: '#0284c7',
      paletaPreset: 'azul-cielo',
      densidad: 'compact',
      tamanoFuente: 'small',
      sidebarColapsado: true,
      sidebarPosicion: 'left',
      ordenWidgets: JSON.stringify(['graficas', 'metricas', 'expedientes', 'audiencias', 'actividad']),
      animacionesHabilitadas: true,
    },
    {
      correo: 'magistrado1@tjabcs.gob.mx',
      tema: 'light',
      colorAcento: '#b45309',
      paletaPreset: 'ambar-judicial',
      densidad: 'comfortable',
      tamanoFuente: 'large',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: JSON.stringify(['audiencias', 'expedientes', 'metricas', 'actividad', 'graficas']),
      animacionesHabilitadas: true,
    },
    {
      correo: 'secretario1@tjabcs.gob.mx',
      tema: 'dark',
      colorAcento: '#059669',
      paletaPreset: 'esmeralda-judicial',
      densidad: 'compact',
      tamanoFuente: 'normal',
      sidebarColapsado: false,
      sidebarPosicion: 'right',
      ordenWidgets: JSON.stringify(['expedientes', 'audiencias', 'actividad', 'metricas', 'graficas']),
      animacionesHabilitadas: false,
    },
  ];

  for (const pref of preferenciasData) {
    const user = await prisma.usuario.findUnique({ where: { correo: pref.correo } });
    if (!user) continue;

    await prisma.preferenciaUsuario.upsert({
      where: { usuarioId: user.id },
      update: {
        tema: pref.tema,
        colorAcento: pref.colorAcento,
        paletaPreset: pref.paletaPreset,
        densidad: pref.densidad,
        tamanoFuente: pref.tamanoFuente,
        sidebarColapsado: pref.sidebarColapsado,
        sidebarPosicion: pref.sidebarPosicion,
        ordenWidgets: pref.ordenWidgets,
        animacionesHabilitadas: pref.animacionesHabilitadas,
      },
      create: {
        usuarioId: user.id,
        tema: pref.tema,
        colorAcento: pref.colorAcento,
        paletaPreset: pref.paletaPreset,
        densidad: pref.densidad,
        tamanoFuente: pref.tamanoFuente,
        sidebarColapsado: pref.sidebarColapsado,
        sidebarPosicion: pref.sidebarPosicion,
        ordenWidgets: pref.ordenWidgets,
        animacionesHabilitadas: pref.animacionesHabilitadas,
      },
    });
  }

  // 9. Ensure Canonical Expedientes Exist for Audiencias and Notifications
  const sala1 = await prisma.sala.findUnique({ where: { nombre: 'Sala I' } });
  const sala2 = await prisma.sala.findUnique({ where: { nombre: 'Sala II' } });
  const tipoNulidad = await prisma.tipoAsunto.findUnique({ where: { nombre: 'NULIDAD' } });
  const tipoLRA = await prisma.tipoAsunto.findUnique({ where: { nombre: 'LRA' } });
  const leyLPCA = await prisma.ley.findUnique({ where: { nombre: 'LPCA' } });
  const leyLRA = await prisma.ley.findUnique({ where: { nombre: 'LRA' } });
  const estatusTramite = await prisma.estatus.findUnique({ where: { codigo: '1.- TRÁMITE' }, include: { subEstatus: true } });
  const estatusProyecto = await prisma.estatus.findUnique({ where: { codigo: '2.- PROYECTO' }, include: { subEstatus: true } });

  let exp1 = await prisma.expediente.findUnique({ where: { folio: '001/2026-LPCA-I' } });
  if (!exp1 && sala1 && tipoNulidad && leyLPCA && estatusTramite && estatusTramite.subEstatus.length > 0) {
    exp1 = await prisma.expediente.create({
      data: {
        folio: '001/2026-LPCA-I',
        consecutivo: 1,
        anio: 2026,
        fechaIngreso: new Date('2026-01-10'),
        tipoAsuntoId: tipoNulidad.id,
        leyId: leyLPCA.id,
        salaId: sala1.id,
        estatusId: estatusTramite.id,
        subEstatusId: estatusTramite.subEstatus[0].id,
        notas: 'Demanda de nulidad fiscal contra cobro indebido',
      },
    });
  }

  let exp2 = await prisma.expediente.findUnique({ where: { folio: '079/2025-LRA-II' } });
  if (!exp2 && sala2 && tipoLRA && leyLRA && estatusProyecto && estatusProyecto.subEstatus.length > 0) {
    exp2 = await prisma.expediente.create({
      data: {
        folio: '079/2025-LRA-II',
        consecutivo: 79,
        anio: 2025,
        fechaIngreso: new Date('2025-06-15'),
        tipoAsuntoId: tipoLRA.id,
        leyId: leyLRA.id,
        salaId: sala2.id,
        estatusId: estatusProyecto.id,
        subEstatusId: estatusProyecto.subEstatus[0].id,
        notas: 'Procedimiento de responsabilidad administrativa grave',
      },
    });
  }

  const adminUser = await prisma.usuario.findUnique({ where: { correo: 'admin@tjabcs.gob.mx' } });
  const consultaUser = await prisma.usuario.findUnique({ where: { correo: 'consulta@tjabcs.gob.mx' } });
  const magistradoUser = await prisma.usuario.findUnique({ where: { correo: 'magistrado1@tjabcs.gob.mx' } });
  const secretarioUser = await prisma.usuario.findUnique({ where: { correo: 'secretario1@tjabcs.gob.mx' } });

  // 10. Seed Sample Audiencias
  if (exp1 && exp2 && sala1 && sala2 && magistradoUser && secretarioUser) {
    await prisma.audiencia.deleteMany({}); // Clean previous records to prevent duplicates

    const audienciasData = [
      {
        expedienteId: exp1.id,
        usuarioId: magistradoUser.id,
        salaId: sala1.id,
        fecha: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // En 2 días
        tipo: 'Audiencia de Desahogo de Pruebas',
        descripcion: 'Desahogo de pruebas periciales y testimoniales de la parte actora',
        estado: 'programada',
      },
      {
        expedienteId: exp2.id,
        usuarioId: magistradoUser.id,
        salaId: sala2.id,
        fecha: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // En 5 días
        tipo: 'Audiencia Constitucional',
        descripcion: 'Presentación de alegatos finales y cierre de instrucción',
        estado: 'programada',
      },
      {
        expedienteId: exp1.id,
        usuarioId: secretarioUser.id,
        salaId: sala1.id,
        fecha: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Hace 7 días
        tipo: 'Audiencia Incidental de Suspensión',
        descripcion: 'Resolución interlocutoria sobre la medida cautelar provisional',
        estado: 'celebrada',
      },
    ];

    for (const aud of audienciasData) {
      await prisma.audiencia.create({ data: aud });
    }
  }

  // 11. Seed Sample Notificaciones
  if (adminUser && consultaUser && magistradoUser && secretarioUser && exp1 && exp2) {
    await prisma.notificacion.deleteMany({}); // Clean previous records to prevent duplicates

    const notificacionesData = [
      // Admin
      {
        usuarioId: adminUser.id,
        expedienteId: exp1.id,
        titulo: 'Audiencia programada próxima',
        mensaje: 'Audiencia de Desahogo de Pruebas fijada en expediente 001/2026-LPCA-I',
        tipo: 'urgente',
        leida: false,
        fecha: new Date(),
      },
      {
        usuarioId: adminUser.id,
        expedienteId: null,
        titulo: 'Respaldo del sistema completado',
        mensaje: 'El respaldo programado de la base de datos se ejecutó exitosamente',
        tipo: 'info',
        leida: true,
        fecha: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      // Consulta
      {
        usuarioId: consultaUser.id,
        expedienteId: null,
        titulo: 'Estadísticas del trimestre actualizadas',
        mensaje: 'Los tableros y KPIs de expedientes concluidos están listos para consulta',
        tipo: 'info',
        leida: false,
        fecha: new Date(),
      },
      // Magistrado
      {
        usuarioId: magistradoUser.id,
        expedienteId: exp1.id,
        titulo: 'Audiencia asignada a su Sala',
        mensaje: 'Se ha agendado audiencia de pruebas para el expediente 001/2026-LPCA-I',
        tipo: 'urgente',
        leida: false,
        fecha: new Date(),
      },
      {
        usuarioId: magistradoUser.id,
        expedienteId: exp2.id,
        titulo: 'Proyecto de resolución pendiente',
        mensaje: 'Expediente 079/2025-LRA-II requiere revisión y visto bueno de proyecto',
        tipo: 'alerta',
        leida: false,
        fecha: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
      {
        usuarioId: magistradoUser.id,
        expedienteId: exp2.id,
        titulo: 'Sentencia notificada a las partes',
        mensaje: 'Se notificó la resolución interlocutoria del expediente 079/2025-LRA-II',
        tipo: 'exito',
        leida: true,
        fecha: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
      // Secretario
      {
        usuarioId: secretarioUser.id,
        expedienteId: exp1.id,
        titulo: 'Término procesal próximo a vencer',
        mensaje: 'Faltan 2 días para el vencimiento de término en expediente 001/2026-LPCA-I',
        tipo: 'alerta',
        leida: false,
        fecha: new Date(),
      },
      {
        usuarioId: secretarioUser.id,
        expedienteId: exp1.id,
        titulo: 'Acuerdo de admisión publicado',
        mensaje: 'El acuerdo fue publicado en los estrados electrónicos del tribunal',
        tipo: 'info',
        leida: true,
        fecha: new Date(Date.now() - 72 * 60 * 60 * 1000),
      },
    ];

    for (const notif of notificacionesData) {
      await prisma.notificacion.create({ data: notif });
    }
  }

  console.log('Seeding completado con éxito (Milestone 1).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
