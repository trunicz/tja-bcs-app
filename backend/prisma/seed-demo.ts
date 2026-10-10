import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creando expedientes de prueba...');

  // 1. Obtener catálogos
  const salas = await prisma.sala.findMany();
  const tipos = await prisma.tipoAsunto.findMany();
  const leyes = await prisma.ley.findMany();
  const usuario = await prisma.usuario.findFirst();
  const estatusTramite = await prisma.estatus.findUnique({ where: { codigo: '1.- TRÁMITE' }, include: { subEstatus: true } });
  const estatusProyecto = await prisma.estatus.findUnique({ where: { codigo: '2.- PROYECTO' }, include: { subEstatus: true } });
  const estatusConcluido = await prisma.estatus.findUnique({ where: { codigo: '3.- CONCLUIDOS' }, include: { subEstatus: true } });

  if (!salas.length || !tipos.length || !leyes.length || !usuario) {
    throw new Error("Faltan catálogos. Ejecuta el seed base primero.");
  }

  // 2. Crear Expediente 1 (En Trámite)
  await prisma.$transaction(async (tx) => {
    const exp1 = await tx.expediente.create({
      data: {
        folio: '001/2026-LPCA-I',
        consecutivo: 1,
        anio: 2026,
        fechaIngreso: new Date('2026-01-10'),
        tipoAsuntoId: tipos[0].id,
        leyId: leyes[0].id,
        salaId: salas[0].id,
        estatusId: estatusTramite!.id,
        subEstatusId: estatusTramite!.subEstatus[0].id
      }
    });

    await tx.movimientoEstatus.create({
      data: {
        expedienteId: exp1.id,
        estatusNuevoId: exp1.estatusId,
        subEstatusNuevoId: exp1.subEstatusId,
        usuarioId: usuario.id,
        notas: 'Recepción de demanda inicial'
      }
    });
  });

  // 3. Crear Expediente 2 (Concluido con historial)
  await prisma.$transaction(async (tx) => {
    const exp2 = await tx.expediente.create({
      data: {
        folio: '079/2025-LRA-II',
        consecutivo: 79,
        anio: 2025,
        fechaIngreso: new Date('2025-06-15'),
        tipoAsuntoId: tipos[1].id,
        leyId: leyes[1].id,
        salaId: salas[1].id,
        estatusId: estatusConcluido!.id,
        subEstatusId: estatusConcluido!.subEstatus[0].id
      }
    });

    // Historial ficticio
    await tx.movimientoEstatus.create({
      data: {
        expedienteId: exp2.id,
        estatusNuevoId: estatusTramite!.id,
        subEstatusNuevoId: estatusTramite!.subEstatus[0].id,
        usuarioId: usuario.id,
        fecha: new Date('2025-06-15'),
        notas: 'Recepción inicial'
      }
    });
    
    await tx.movimientoEstatus.create({
      data: {
        expedienteId: exp2.id,
        estatusAnteriorId: estatusTramite!.id,
        subEstatusAnteriorId: estatusTramite!.subEstatus[0].id,
        estatusNuevoId: estatusProyecto!.id,
        subEstatusNuevoId: estatusProyecto!.subEstatus[0].id,
        usuarioId: usuario.id,
        fecha: new Date('2025-09-10'),
        notas: 'Se turna para proyecto de resolución'
      }
    });

    await tx.movimientoEstatus.create({
      data: {
        expedienteId: exp2.id,
        estatusAnteriorId: estatusProyecto!.id,
        subEstatusAnteriorId: estatusProyecto!.subEstatus[0].id,
        estatusNuevoId: estatusConcluido!.id,
        subEstatusNuevoId: estatusConcluido!.subEstatus[0].id,
        usuarioId: usuario.id,
        fecha: new Date('2025-11-20'),
        notas: 'Sentencia definitiva dictada'
      }
    });
  });

  console.log('Expedientes de prueba creados.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
