import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requirePermission, requireAnyPermission } from '../middleware/auth';

export const rolesRouter = Router();

// ============================================================================
// 1. GET /api/roles
// ============================================================================
/**
 * GET /api/roles
 * Lists all system roles with their assigned permissions and user counts.
 * Protected by 'roles:view' or 'roles:manage'.
 */
rolesRouter.get(
  '/roles',
  authenticate,
  requireAnyPermission('roles:view', 'roles:manage'),
  async (_req: Request, res: Response) => {
    try {
      const roles = await prisma.rol.findMany({
        include: {
          _count: {
            select: { usuarios: true },
          },
          permisos: {
            include: {
              permiso: true,
            },
            orderBy: [
              { permiso: { modulo: 'asc' } },
              { permiso: { id: 'asc' } },
            ],
          },
        },
        orderBy: { id: 'asc' },
      });

      const formatted = roles.map((role) => ({
        id: role.id,
        nombre: role.nombre,
        usuariosCount: role._count?.usuarios ?? 0,
        permisos: role.permisos.map((rp) => ({
          id: rp.permiso.id,
          codigo: rp.permiso.codigo,
          nombre: rp.permiso.nombre,
          descripcion: rp.permiso.descripcion ?? '',
          modulo: rp.permiso.modulo,
        })),
      }));

      return res.status(200).json(formatted);
    } catch (error) {
      console.error('Error in GET /api/roles:', error);
      return res.status(500).json({ error: 'Error al consultar roles del sistema' });
    }
  }
);

// ============================================================================
// 2. GET /api/permisos
// ============================================================================
/**
 * GET /api/permisos
 * Lists all granular system permissions cataloged in the system.
 * Protected by 'roles:view' or 'roles:manage'.
 */
rolesRouter.get(
  '/permisos',
  authenticate,
  requireAnyPermission('roles:view', 'roles:manage'),
  async (_req: Request, res: Response) => {
    try {
      const permisos = await prisma.permiso.findMany({
        orderBy: [
          { modulo: 'asc' },
          { id: 'asc' },
        ],
      });

      const formatted = permisos.map((perm) => ({
        id: perm.id,
        codigo: perm.codigo,
        nombre: perm.nombre,
        descripcion: perm.descripcion ?? '',
        modulo: perm.modulo,
      }));

      return res.status(200).json(formatted);
    } catch (error) {
      console.error('Error in GET /api/permisos:', error);
      return res.status(500).json({ error: 'Error al consultar catálogo de permisos' });
    }
  }
);

// ============================================================================
// 3. GET /api/roles/:id
// ============================================================================
/**
 * GET /api/roles/:id
 * Retrieve detail of a single role by ID.
 * Protected by 'roles:view' or 'roles:manage'.
 */
rolesRouter.get(
  '/roles/:id',
  authenticate,
  requireAnyPermission('roles:view', 'roles:manage'),
  async (req: Request, res: Response) => {
    try {
      const roleId = parseInt(req.params.id, 10);
      if (isNaN(roleId) || roleId <= 0) {
        return res.status(400).json({ error: 'ID de rol inválido' });
      }

      const role = await prisma.rol.findUnique({
        where: { id: roleId },
        include: {
          _count: { select: { usuarios: true } },
          permisos: {
            include: { permiso: true },
            orderBy: [{ permiso: { modulo: 'asc' } }, { permiso: { id: 'asc' } }],
          },
        },
      });

      if (!role) {
        return res.status(404).json({ error: 'Rol no encontrado' });
      }

      return res.status(200).json({
        id: role.id,
        nombre: role.nombre,
        usuariosCount: role._count?.usuarios ?? 0,
        permisos: role.permisos.map((rp) => ({
          id: rp.permiso.id,
          codigo: rp.permiso.codigo,
          nombre: rp.permiso.nombre,
          descripcion: rp.permiso.descripcion ?? '',
          modulo: rp.permiso.modulo,
        })),
      });
    } catch (error) {
      console.error('Error in GET /api/roles/:id:', error);
      return res.status(500).json({ error: 'Error al consultar detalle del rol' });
    }
  }
);

// ============================================================================
// 4. PUT /api/roles/:id/permisos
// ============================================================================
/**
 * PUT /api/roles/:id/permisos
 * Atomically updates permissions assigned to a role.
 * Body can supply either:
 *   - { "permisoIds": number[] }
 *   - { "permisoCodigos": string[] }
 * Protected strictly by 'roles:manage'.
 */
rolesRouter.put(
  '/roles/:id/permisos',
  authenticate,
  requirePermission('roles:manage'),
  async (req: Request, res: Response) => {
    try {
      const roleId = parseInt(req.params.id, 10);
      if (isNaN(roleId) || roleId <= 0) {
        return res.status(400).json({ error: 'ID de rol inválido' });
      }

      // 1. Verify target role exists
      const targetRole = await prisma.rol.findUnique({
        where: { id: roleId },
      });

      if (!targetRole) {
        return res.status(404).json({ error: 'Rol no encontrado' });
      }

      // 2. Parse and validate payload
      const { permisoIds, permisoCodigos } = req.body || {};

      let resolvedPermisoIds: number[] = [];
      let resolvedPermisoCodigos: string[] = [];

      if (permisoIds !== undefined) {
        if (!Array.isArray(permisoIds)) {
          return res.status(400).json({
            error: 'El campo permisoIds debe ser un arreglo de números',
          });
        }

        // Validate all items are positive integers
        for (const id of permisoIds) {
          if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
              error: `El ID de permiso ${id} es inválido. Debe ser un entero positivo.`,
            });
          }
        }

        // Deduplicate IDs
        const uniqueIds = Array.from(new Set(permisoIds));

        if (uniqueIds.length > 0) {
          const matchingPermisos = await prisma.permiso.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true, codigo: true },
          });

          if (matchingPermisos.length !== uniqueIds.length) {
            const foundIds = new Set(matchingPermisos.map((p) => p.id));
            const missing = uniqueIds.filter((id) => !foundIds.has(id));
            return res.status(400).json({
              error: `Uno o más IDs de permisos no existen en el sistema: [${missing.join(', ')}]`,
            });
          }

          resolvedPermisoIds = matchingPermisos.map((p) => p.id);
          resolvedPermisoCodigos = matchingPermisos.map((p) => p.codigo);
        }
      } else if (permisoCodigos !== undefined) {
        if (!Array.isArray(permisoCodigos)) {
          return res.status(400).json({
            error: 'El campo permisoCodigos debe ser un arreglo de cadenas',
          });
        }

        for (const code of permisoCodigos) {
          if (typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({
              error: 'Todos los códigos de permiso deben ser cadenas no vacías',
            });
          }
        }

        // Deduplicate codes
        const uniqueCodes = Array.from(new Set(permisoCodigos.map((c) => c.trim())));

        if (uniqueCodes.length > 0) {
          const matchingPermisos = await prisma.permiso.findMany({
            where: { codigo: { in: uniqueCodes } },
            select: { id: true, codigo: true },
          });

          if (matchingPermisos.length !== uniqueCodes.length) {
            const foundCodes = new Set(matchingPermisos.map((p) => p.codigo));
            const missing = uniqueCodes.filter((c) => !foundCodes.has(c));
            return res.status(400).json({
              error: `Uno o más códigos de permisos no existen en el sistema: [${missing.join(', ')}]`,
            });
          }

          resolvedPermisoIds = matchingPermisos.map((p) => p.id);
          resolvedPermisoCodigos = matchingPermisos.map((p) => p.codigo);
        }
      } else {
        return res.status(400).json({
          error: 'Se requiere el campo permisoIds (arreglo de números) o permisoCodigos (arreglo de cadenas)',
        });
      }

      // 3. Security Check: Admin Self-Lockout Prevention (T2-ROLE-04)
      if (targetRole.nombre === 'Administrador') {
        const requiredAdminCodes = ['roles:manage', 'impersonate:use'];
        const missingAdminCodes = requiredAdminCodes.filter(
          (code) => !resolvedPermisoCodigos.includes(code)
        );

        if (missingAdminCodes.length > 0) {
          return res.status(400).json({
            error: `Protección de seguridad: No se puede remover el permiso '${missingAdminCodes.join(
              "', '"
            )}' del rol Administrador`,
          });
        }
      }

      // 4. Atomic Transaction: Clear and assign permissions
      const updatedRole = await prisma.$transaction(async (tx) => {
        // Step 4a: Delete existing permissions for this role
        await tx.rolPermiso.deleteMany({
          where: { rolId: roleId },
        });

        // Step 4b: Insert new permissions if any
        if (resolvedPermisoIds.length > 0) {
          await tx.rolPermiso.createMany({
            data: resolvedPermisoIds.map((permisoId) => ({
              rolId: roleId,
              permisoId,
            })),
          });
        }

        // Step 4c: Return updated role with populated relations
        return await tx.rol.findUnique({
          where: { id: roleId },
          include: {
            permisos: {
              include: {
                permiso: true,
              },
              orderBy: [
                { permiso: { modulo: 'asc' } },
                { permiso: { id: 'asc' } },
              ],
            },
            _count: {
              select: { usuarios: true },
            },
          },
        });
      });

      if (!updatedRole) {
        return res.status(500).json({ error: 'Error al recuperar el rol actualizado' });
      }

      // 5. Build response conforming to PROJECT.md interface contract
      const formattedPermisos = updatedRole.permisos.map((rp) => ({
        id: rp.permiso.id,
        codigo: rp.permiso.codigo,
        nombre: rp.permiso.nombre,
        modulo: rp.permiso.modulo,
        descripcion: rp.permiso.descripcion ?? '',
      }));

      return res.status(200).json({
        message: 'Permisos actualizados',
        rol: {
          id: updatedRole.id,
          nombre: updatedRole.nombre,
          usuariosCount: updatedRole._count?.usuarios ?? 0,
          permisos: formattedPermisos,
        },
      });
    } catch (error) {
      console.error('Error in PUT /api/roles/:id/permisos:', error);
      return res.status(500).json({ error: 'Error interno al actualizar permisos del rol' });
    }
  }
);

export default rolesRouter;
