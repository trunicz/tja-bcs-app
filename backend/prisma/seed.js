"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Iniciando el seeder para TJA BCS...');
        // 1. Roles
        const roles = [
            { nombre: 'Administrador' },
            { nombre: 'Magistrado/Sala' },
            { nombre: 'Secretario de Acuerdos' },
            { nombre: 'Consulta/Dirección' },
        ];
        for (const rol of roles) {
            yield prisma.rol.upsert({
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
            yield prisma.sala.upsert({
                where: { nombre: sala.nombre },
                update: {},
                create: sala,
            });
        }
        // 3. Tipos de Asunto y Leyes
        const tipos = [{ nombre: 'NULIDAD' }, { nombre: 'LRA' }, { nombre: 'VARIOS' }];
        for (const tipo of tipos) {
            yield prisma.tipoAsunto.upsert({ where: { nombre: tipo.nombre }, update: {}, create: tipo });
        }
        const leyes = [{ nombre: 'LPCA' }, { nombre: 'LRA' }];
        for (const ley of leyes) {
            yield prisma.ley.upsert({ where: { nombre: ley.nombre }, update: {}, create: ley });
        }
        // 4. Estatus y SubEstatus (Basado en el PDF)
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
            const createdEstatus = yield prisma.estatus.upsert({
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
        // 5. Usuario de prueba
        const adminRol = yield prisma.rol.findUnique({ where: { nombre: 'Administrador' } });
        if (adminRol) {
            yield prisma.usuario.upsert({
                where: { correo: 'admin@tjabcs.gob.mx' },
                update: {},
                create: {
                    nombre: 'Administrador TJA',
                    correo: 'admin@tjabcs.gob.mx',
                    password: 'password123', // En un sistema real esto debe ir hasheado (bcrypt)
                    rolId: adminRol.id,
                },
            });
        }
        console.log('Seeding completado con éxito.');
    });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
