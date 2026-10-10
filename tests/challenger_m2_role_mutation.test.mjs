/**
 * tests/challenger_m2_role_mutation.test.mjs
 * =============================================================================
 * Challenger 2: Adversarial Empirical Test Harness for Milestone 2
 * Focus: Dynamic Role & Permission Mutation, Admin Lockout, RBAC Propagation
 * =============================================================================
 */

import { spawn } from 'child_process';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_URL || 'http://localhost:3001';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

function pass(name, detail = '') {
  results.total++;
  results.passed++;
  console.log(`  \x1b[32m[PASS]\x1b[0m ${name}${detail ? ' \x1b[90m-> ' + detail + '\x1b[0m' : ''}`);
}

function fail(name, error) {
  results.total++;
  results.failed++;
  results.failures.push({ name, error });
  console.error(`  \x1b[31m[FAIL]\x1b[0m ${name} \x1b[31m-> ERROR: ${error}\x1b[0m`);
}

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const fetchOpts = {
    method: options.method || 'GET',
    headers,
  };
  if (options.body !== undefined) {
    fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOpts);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, headers: res.headers, body: json };
}

let spawnedProcess = null;

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/roles`);
    if (res.status === 401 || res.status === 200 || res.status === 403) {
      console.log(`[INFO] Backend server already running on ${BASE_URL}`);
      return;
    }
  } catch {
    // Server not yet running
  }

  console.log('[INFO] Spawning backend server on port 3001...');
  spawnedProcess = spawn('node', ['backend/dist/index.js'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: { ...process.env, PORT: '3001' },
  });

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(`${BASE_URL}/api/roles`);
      if (res.status === 401 || res.status === 200 || res.status === 403) {
        console.log('[INFO] Backend server started successfully.');
        return;
      }
    } catch {}
  }

  throw new Error('Timed out waiting for backend server to start on port 3001');
}

async function runRoleMutationSuite() {
  console.log('\n\x1b[36m====================================================================\x1b[0m');
  console.log('\x1b[1mCHALLENGER 2: ADVERSARIAL ROLE & PERMISSION MUTATION TEST HARNESS\x1b[0m');
  console.log('\x1b[36m====================================================================\x1b[0m\n');

  await ensureServerRunning();

  // Snapshot initial role permissions from DB for 100% reliable rollback
  const initialRoles = await prisma.rol.findMany({
    include: {
      permisos: {
        include: { permiso: true },
      },
    },
  });

  const baselineMap = new Map();
  for (const role of initialRoles) {
    baselineMap.set(role.id, {
      id: role.id,
      nombre: role.nombre,
      permisoIds: role.permisos.map((rp) => rp.permiso.id),
      permisoCodigos: role.permisos.map((rp) => rp.permiso.codigo),
    });
  }

  const allPermisos = await prisma.permiso.findMany();
  const permCodeToId = new Map(allPermisos.map((p) => [p.codigo, p.id]));
  const permIdToCode = new Map(allPermisos.map((p) => [p.id, p.codigo]));

  // Authenticate accounts
  const adminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
  });
  if (adminLogin.status !== 200 || !adminLogin.body.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.body)}`);
  }
  const adminToken = adminLogin.body.token;

  const consultaLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'consulta@tjabcs.gob.mx', password: 'password123' },
  });
  const consultaToken = consultaLogin.body.token;

  const secretarioLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'secretario1@tjabcs.gob.mx', password: 'password123' },
  });
  const secretarioToken = secretarioLogin.body.token;

  const magistradoLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'magistrado1@tjabcs.gob.mx', password: 'password123' },
  });
  const magistradoToken = magistradoLogin.body.token;

  const createdSessionTokens = [adminToken, consultaToken, secretarioToken, magistradoToken];

  try {
    // =========================================================================
    // SECTION 1: AUTHENTICATION & AUTHORIZATION GUARD ON PUT /api/roles/:id/permisos
    // =========================================================================
    console.log('\n--- 1. AUTHENTICATION & AUTHORIZATION GUARD ON PUT /api/roles/:id/permisos ---');

    // 1.1 Unauthenticated (No Token)
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 401 && res.body.error === 'No autenticado') {
        pass('Unauthenticated PUT /api/roles/:id/permisos rejected with 401 Unauthorized');
      } else {
        fail('Unauthenticated PUT /api/roles/:id/permisos', `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 1.2 Invalid Bearer Token
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: 'Bearer totally_invalid_token_xyz_999' },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 401) {
        pass('Invalid token PUT /api/roles/:id/permisos rejected with 401');
      } else {
        fail('Invalid token PUT /api/roles/:id/permisos', `Expected 401, got ${res.status}`);
      }
    }

    // 1.3 Non-Admin (Consulta) lacking roles:manage
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${consultaToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 403 && res.body.error?.includes('roles:manage')) {
        pass('Non-admin Consulta rejected with 403 Forbidden (roles:manage required)');
      } else {
        fail('Non-admin Consulta rejected', `Expected 403 with roles:manage, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 1.4 Non-Admin (Secretario) lacking roles:manage
    {
      const res = await req('/api/roles/4/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${secretarioToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 403 && res.body.error?.includes('roles:manage')) {
        pass('Non-admin Secretario rejected with 403 Forbidden');
      } else {
        fail('Non-admin Secretario rejected', `Expected 403, got ${res.status}`);
      }
    }

    // 1.5 Non-Admin (Magistrado) lacking roles:manage
    {
      const res = await req('/api/roles/4/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${magistradoToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 403 && res.body.error?.includes('roles:manage')) {
        pass('Non-admin Magistrado rejected with 403 Forbidden');
      } else {
        fail('Non-admin Magistrado rejected', `Expected 403, got ${res.status}`);
      }
    }

    // 1.6 Impersonated Admin Session Lacking roles:manage (Admin impersonating Consulta)
    {
      const targetUserId = consultaLogin.body.usuario?.id;
      const impRes = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { targetUserId },
      });
      if (impRes.status === 200 && impRes.body.token) {
        const impToken = impRes.body.token;
        createdSessionTokens.push(impToken);
        const res = await req('/api/roles/3/permisos', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${impToken}` },
          body: { permisoCodigos: ['expedientes:view'] },
        });
        if (res.status === 403) {
          pass('Impersonated session with target Consulta denied role mutation with 403 Forbidden');
        } else {
          fail('Impersonated session denied role mutation', `Expected 403, got ${res.status}`);
        }
        // Revert impersonation
        await req('/api/auth/revert', {
          method: 'POST',
          headers: { Authorization: `Bearer ${impToken}` },
        });
      } else {
        fail('Impersonate helper for test 1.6', `Status: ${impRes.status}`);
      }
    }

    // =========================================================================
    // SECTION 2: ADMIN LOCKOUT PROTECTION (T2-ROLE-04)
    // =========================================================================
    console.log('\n--- 2. ADMIN LOCKOUT PROTECTION (T2-ROLE-04) ---');

    // 2.1 Stripping roles:manage from Administrador (role ID 1) via permisoCodigos
    {
      const adminCodesWithoutRolesManage = baselineMap
        .get(1)
        .permisoCodigos.filter((c) => c !== 'roles:manage');
      const res = await req('/api/roles/1/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: adminCodesWithoutRolesManage },
      });
      if (res.status === 400 && res.body.error?.includes('roles:manage')) {
        pass('Attempt to strip roles:manage from Administrador rejected with 400 Bad Request');
      } else {
        fail('Attempt to strip roles:manage from Administrador', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 2.2 Stripping impersonate:use from Administrador via permisoCodigos
    {
      const adminCodesWithoutImpersonate = baselineMap
        .get(1)
        .permisoCodigos.filter((c) => c !== 'impersonate:use');
      const res = await req('/api/roles/1/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: adminCodesWithoutImpersonate },
      });
      if (res.status === 400 && res.body.error?.includes('impersonate:use')) {
        pass('Attempt to strip impersonate:use from Administrador rejected with 400 Bad Request');
      } else {
        fail('Attempt to strip impersonate:use from Administrador', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 2.3 Stripping both via empty array
    {
      const res = await req('/api/roles/1/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: [] },
      });
      if (res.status === 400 && res.body.error?.includes('roles:manage')) {
        pass('Attempt to strip all permissions from Administrador rejected with 400 Bad Request');
      } else {
        fail('Attempt to strip all permissions from Administrador', `Expected 400, got ${res.status}`);
      }
    }

    // 2.4 Stripping roles:manage via permisoIds
    {
      const rolesManageId = permCodeToId.get('roles:manage');
      const adminIdsWithoutRolesManage = baselineMap
        .get(1)
        .permisoIds.filter((id) => id !== rolesManageId);
      const res = await req('/api/roles/1/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoIds: adminIdsWithoutRolesManage },
      });
      if (res.status === 400 && res.body.error?.includes('roles:manage')) {
        pass('Attempt to strip roles:manage via permisoIds rejected with 400 Bad Request');
      } else {
        fail('Attempt to strip roles:manage via permisoIds', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 2.5 Stripping impersonate:use via permisoIds
    {
      const impersonateId = permCodeToId.get('impersonate:use');
      const adminIdsWithoutImpersonate = baselineMap
        .get(1)
        .permisoIds.filter((id) => id !== impersonateId);
      const res = await req('/api/roles/1/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoIds: adminIdsWithoutImpersonate },
      });
      if (res.status === 400 && res.body.error?.includes('impersonate:use')) {
        pass('Attempt to strip impersonate:use via permisoIds rejected with 400 Bad Request');
      } else {
        fail('Attempt to strip impersonate:use via permisoIds', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 2.6 Verify Admin role permissions in DB remained pristine
    {
      const currentAdminRole = await prisma.rol.findUnique({
        where: { id: 1 },
        include: { permisos: { include: { permiso: true } } },
      });
      const currentCodes = currentAdminRole.permisos.map((p) => p.permiso.codigo).sort();
      const baselineCodes = [...baselineMap.get(1).permisoCodigos].sort();
      const match = JSON.stringify(currentCodes) === JSON.stringify(baselineCodes);
      if (match) {
        pass('Admin role permissions remained completely intact in DB after rejected lockout attempts');
      } else {
        fail('Admin role permissions integrity', `Expected ${baselineCodes.length} codes, got ${currentCodes.length}`);
      }
    }

    // =========================================================================
    // SECTION 3: INPUT VALIDATION, SCHEMA FUZZING & ERROR HANDLING
    // =========================================================================
    console.log('\n--- 3. INPUT VALIDATION & FUZZING ON PUT /api/roles/:id/permisos ---');

    // 3.1 Non-numeric role ID
    {
      const res = await req('/api/roles/invalid-id/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 400 && res.body.error?.includes('ID de rol inválido')) {
        pass('Non-numeric role ID rejected with 400 Bad Request');
      } else {
        fail('Non-numeric role ID', `Expected 400, got ${res.status}`);
      }
    }

    // 3.2 Negative role ID
    {
      const res = await req('/api/roles/-5/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 400) {
        pass('Negative role ID rejected with 400 Bad Request');
      } else {
        fail('Negative role ID', `Expected 400, got ${res.status}`);
      }
    }

    // 3.3 Non-existent role ID
    {
      const res = await req('/api/roles/99999/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });
      if (res.status === 404 && res.body.error?.includes('Rol no encontrado')) {
        pass('Non-existent role ID returned 404 Not Found');
      } else {
        fail('Non-existent role ID', `Expected 404, got ${res.status}`);
      }
    }

    // 3.4 Missing both permisoIds and permisoCodigos
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { foo: 'bar' },
      });
      if (res.status === 400) {
        pass('Missing permisoIds/permisoCodigos payload rejected with 400 Bad Request');
      } else {
        fail('Missing payload fields', `Expected 400, got ${res.status}`);
      }
    }

    // 3.5 Invalid types in permisoIds
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoIds: [1, -99, 2] },
      });
      if (res.status === 400) {
        pass('Negative ID in permisoIds rejected with 400 Bad Request');
      } else {
        fail('Negative ID in permisoIds', `Expected 400, got ${res.status}`);
      }
    }

    // 3.6 Non-existent permission ID in permisoIds
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoIds: [1, 99999] },
      });
      if (res.status === 400 && res.body.error?.includes('no existen')) {
        pass('Non-existent ID in permisoIds rejected with 400 Bad Request');
      } else {
        fail('Non-existent ID in permisoIds', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 3.7 Non-existent permission code in permisoCodigos
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: ['expedientes:view', 'fake:permission:code'] },
      });
      if (res.status === 400 && res.body.error?.includes('no existen')) {
        pass('Non-existent permission code in permisoCodigos rejected with 400 Bad Request');
      } else {
        fail('Non-existent permission code', `Expected 400, got ${res.status}`);
      }
    }

    // 3.8 Empty string in permisoCodigos
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: ['expedientes:view', '   '] },
      });
      if (res.status === 400) {
        pass('Blank string in permisoCodigos rejected with 400 Bad Request');
      } else {
        fail('Blank string in permisoCodigos', `Expected 400, got ${res.status}`);
      }
    }

    // 3.9 Duplicate IDs in payload deduplication test
    {
      const initialSecretarioIds = baselineMap.get(3).permisoIds;
      const duplicateIds = [initialSecretarioIds[0], initialSecretarioIds[0], ...initialSecretarioIds];
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoIds: duplicateIds },
      });
      if (res.status === 200 && res.body.rol?.permisos) {
        const assignedIds = res.body.rol.permisos.map((p) => p.id);
        const uniqueSet = new Set(assignedIds);
        if (assignedIds.length === uniqueSet.size) {
          pass('Duplicate IDs payload smoothly deduplicated without DB unique constraint collision');
        } else {
          fail('Duplicate IDs deduplication', 'Duplicates remained in output');
        }
      } else {
        fail('Duplicate IDs payload', `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 3.10 Duplicate codes in payload deduplication test
    {
      const initialSecretarioCodes = baselineMap.get(3).permisoCodigos;
      const duplicateCodes = [initialSecretarioCodes[0], initialSecretarioCodes[0], ...initialSecretarioCodes];
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: duplicateCodes },
      });
      if (res.status === 200 && res.body.rol?.permisos) {
        const assignedCodes = res.body.rol.permisos.map((p) => p.codigo);
        const uniqueSet = new Set(assignedCodes);
        if (assignedCodes.length === uniqueSet.size) {
          pass('Duplicate codes payload smoothly deduplicated');
        } else {
          fail('Duplicate codes deduplication', 'Duplicates remained in output');
        }
      } else {
        fail('Duplicate codes payload', `Expected 200, got ${res.status}`);
      }
    }

    // =========================================================================
    // SECTION 4: DYNAMIC PERMISSION MUTATION & INSTANT PROPAGATION (ZERO CACHE DELAY)
    // =========================================================================
    console.log('\n--- 4. DYNAMIC PERMISSION MUTATION & INSTANT PROPAGATION ---');

    // Scenario: Test role 3 (Secretario de Acuerdos) using user secretario1.
    // 4.1 Verify initial boundary: secretario1 lacks 'usuarios:view'
    {
      const res = await req('/api/usuarios', {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretarioToken}` },
      });
      if (res.status === 403 && res.body.error?.includes('usuarios:view')) {
        pass('Initial State: secretario1 denied GET /api/usuarios with 403 (usuarios:view missing)');
      } else {
        fail('Initial State GET /api/usuarios', `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 4.2 DYNAMIC GRANT: Admin grants 'usuarios:view' to Role 3
    {
      const newCodes = [...baselineMap.get(3).permisoCodigos, 'usuarios:view'];
      const grantRes = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: newCodes },
      });
      if (grantRes.status === 200 && grantRes.body.rol?.permisos.some((p) => p.codigo === 'usuarios:view')) {
        pass('Admin successfully granted usuarios:view to Role 3 via PUT /api/roles/3/permisos');
      } else {
        fail('Admin grant usuarios:view', `Expected 200 with usuarios:view, got ${grantRes.status}`);
      }

      // 4.2b IMMEDIATE ACCESS TEST: secretario1 calls GET /api/usuarios with EXISTING token (NO re-login)
      const userRes = await req('/api/usuarios', {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretarioToken}` },
      });
      if (userRes.status === 200 && Array.isArray(userRes.body) && userRes.body.length > 0) {
        pass('IMMEDIATE GRANT PROPAGATION: secretario1 instantly granted access to GET /api/usuarios (200 OK)');
      } else {
        fail('Immediate grant propagation', `Expected 200, got ${userRes.status}: ${JSON.stringify(userRes.body)}`);
      }
    }

    // 4.3 DYNAMIC REVOCATION: Admin revokes 'usuarios:view' from Role 3
    {
      const revokeRes = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: baselineMap.get(3).permisoCodigos }, // back to baseline without usuarios:view
      });
      if (revokeRes.status === 200 && !revokeRes.body.rol?.permisos.some((p) => p.codigo === 'usuarios:view')) {
        pass('Admin successfully revoked usuarios:view from Role 3 via PUT /api/roles/3/permisos');
      } else {
        fail('Admin revoke usuarios:view', `Expected 200 without usuarios:view, got ${revokeRes.status}`);
      }

      // 4.3b IMMEDIATE REVOCATION TEST: secretario1 calls GET /api/usuarios with EXISTING token
      const userRes = await req('/api/usuarios', {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretarioToken}` },
      });
      if (userRes.status === 403 && userRes.body.error?.includes('usuarios:view')) {
        pass('IMMEDIATE REVOCATION PROPAGATION: secretario1 instantly blocked from GET /api/usuarios (403 Forbidden)');
      } else {
        fail('Immediate revocation propagation', `Expected 403, got ${userRes.status}: ${JSON.stringify(userRes.body)}`);
      }
    }

    // 4.4 DYNAMIC MUTATION ON WRITE ENDPOINT: expedientes:create on POST /api/expedientes
    {
      // Role 3 initially has expedientes:create.
      // Let's strip expedientes:create from Role 3
      const codesWithoutCreate = baselineMap
        .get(3)
        .permisoCodigos.filter((c) => c !== 'expedientes:create');

      const revokeCreateRes = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: codesWithoutCreate },
      });
      if (revokeCreateRes.status !== 200) {
        fail('Revoke expedientes:create', `Status: ${revokeCreateRes.status}`);
      }

      // secretario1 attempts POST /api/expedientes with EXISTING token -> MUST be 403
      const writeBlockedRes = await req('/api/expedientes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretarioToken}` },
        body: { actor: 'Test', demandado: 'Test' },
      });
      if (writeBlockedRes.status === 403 && writeBlockedRes.body.error?.includes('expedientes:create')) {
        pass('IMMEDIATE WRITE REVOCATION: secretario1 instantly blocked from POST /api/expedientes (403 Forbidden)');
      } else {
        fail('Immediate write revocation', `Expected 403, got ${writeBlockedRes.status}`);
      }

      // Re-grant expedientes:create to Role 3
      const restoreCreateRes = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: baselineMap.get(3).permisoCodigos },
      });
      if (restoreCreateRes.status !== 200) {
        fail('Re-grant expedientes:create', `Status: ${restoreCreateRes.status}`);
      }

      // secretario1 attempts POST /api/expedientes again -> MUST NOT be 403 (should be 201 or 400 if validation fails, not 403)
      const writeAllowedRes = await req('/api/expedientes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretarioToken}` },
        body: {}, // empty body might trigger validation 400 or create 201
      });
      if (writeAllowedRes.status !== 403) {
        pass(`IMMEDIATE WRITE RESTORATION: secretario1 permitted past auth middleware on POST /api/expedientes (HTTP ${writeAllowedRes.status})`);
      } else {
        fail('Immediate write restoration', `Unexpected 403 on restored permission`);
      }
    }

    // 4.5 DYNAMIC ELEVATION & REVOCATION OF ADMINISTRATIVE POWER (roles:manage)
    {
      // Initially secretario1 cannot manage roles (403)
      const initialManageRes = await req('/api/roles/4/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${secretarioToken}` },
        body: { permisoCodigos: baselineMap.get(4).permisoCodigos },
      });
      if (initialManageRes.status !== 403) {
        fail('Initial manage check', `Expected 403, got ${initialManageRes.status}`);
      }

      // Admin temporarily grants roles:manage to Role 3
      const elevateRes = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: [...baselineMap.get(3).permisoCodigos, 'roles:manage'] },
      });
      if (elevateRes.status !== 200) {
        fail('Elevate Role 3', `Status: ${elevateRes.status}`);
      }

      // secretario1 now attempts PUT /api/roles/4/permisos with EXISTING token -> MUST SUCCEED (200 OK)
      const delegatedManageRes = await req('/api/roles/4/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${secretarioToken}` },
        body: { permisoCodigos: baselineMap.get(4).permisoCodigos },
      });
      if (delegatedManageRes.status === 200) {
        pass('DELEGATED ELEVATION: secretario1 dynamically gained roles:manage and successfully executed role mutation (200 OK)');
      } else {
        fail('Delegated elevation', `Expected 200, got ${delegatedManageRes.status}: ${JSON.stringify(delegatedManageRes.body)}`);
      }

      // Admin revokes roles:manage from Role 3
      const deElevateRes = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoCodigos: baselineMap.get(3).permisoCodigos },
      });
      if (deElevateRes.status !== 200) {
        fail('De-elevate Role 3', `Status: ${deElevateRes.status}`);
      }

      // secretario1 immediately attempts PUT /api/roles/4/permisos again -> MUST BE 403
      const deElevatedManageRes = await req('/api/roles/4/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${secretarioToken}` },
        body: { permisoCodigos: baselineMap.get(4).permisoCodigos },
      });
      if (deElevatedManageRes.status === 403) {
        pass('DELEGATION REVOCATION: secretario1 immediately denied role mutation (403 Forbidden)');
      } else {
        fail('Delegation revocation', `Expected 403, got ${deElevatedManageRes.status}`);
      }
    }

    // =========================================================================
    // SECTION 5: PAYLOAD DUALITY & GET /api/roles CONTRACT VERIFICATION
    // =========================================================================
    console.log('\n--- 5. PAYLOAD DUALITY & GET /api/roles CONTRACT VERIFICATION ---');

    // 5.1 PUT via permisoIds conforms to output contract
    {
      const res = await req('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { permisoIds: baselineMap.get(3).permisoIds },
      });
      if (
        res.status === 200 &&
        res.body.message === 'Permisos actualizados' &&
        res.body.rol &&
        res.body.rol.id === 3 &&
        Array.isArray(res.body.rol.permisos)
      ) {
        pass('PUT /api/roles/:id/permisos conforms to PROJECT.md response contract');
      } else {
        fail('Response contract verification', `Unexpected response structure: ${JSON.stringify(res.body)}`);
      }
    }

    // 5.2 GET /api/roles list verification
    {
      const res = await req('/api/roles', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 200 && Array.isArray(res.body) && res.body.length === 4) {
        const adminRole = res.body.find((r) => r.id === 1);
        if (adminRole && adminRole.permisos.length === 13 && typeof adminRole.usuariosCount === 'number') {
          pass('GET /api/roles returns all 4 roles with accurate usuariosCount and populated permissions');
        } else {
          fail('GET /api/roles content', `Admin role detail mismatch: ${JSON.stringify(adminRole)}`);
        }
      } else {
        fail('GET /api/roles list', `Expected 4 roles, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 5.3 GET /api/permisos catalog verification
    {
      const res = await req('/api/permisos', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 200 && Array.isArray(res.body) && res.body.length === 13) {
        pass('GET /api/permisos returns all 13 system permissions cataloged');
      } else {
        fail('GET /api/permisos catalog', `Expected 13 permissions, got ${res.body?.length}`);
      }
    }

    // 5.4 GET /api/roles/:id detail verification
    {
      const res = await req('/api/roles/2', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 200 && res.body.id === 2 && res.body.nombre === 'Magistrado/Sala') {
        pass('GET /api/roles/:id returns correct role detail');
      } else {
        fail('GET /api/roles/:id', `Expected role 2, got ${res.status}`);
      }
    }
  } finally {
    // =========================================================================
    // SECTION 6: CLEAN RESTORATION & IDEMPOTENCY
    // =========================================================================
    console.log('\n--- 6. RESTORATION & ROLLBACK TO BASELINE ---');

    for (const [roleId, baseline] of baselineMap.entries()) {
      await prisma.$transaction(async (tx) => {
        await tx.rolPermiso.deleteMany({ where: { rolId: roleId } });
        if (baseline.permisoIds.length > 0) {
          await tx.rolPermiso.createMany({
            data: baseline.permisoIds.map((permisoId) => ({ rolId: roleId, permisoId })),
          });
        }
      });
    }

    // Verify DB matches baseline
    let allRestored = true;
    for (const [roleId, baseline] of baselineMap.entries()) {
      const current = await prisma.rolPermiso.findMany({ where: { rolId: roleId } });
      const currentIds = current.map((p) => p.permisoId).sort();
      const baselineIds = [...baseline.permisoIds].sort();
      if (JSON.stringify(currentIds) !== JSON.stringify(baselineIds)) {
        allRestored = false;
        console.error(`Rollback mismatch for role ${roleId}: current=[${currentIds}], baseline=[${baselineIds}]`);
      }
    }

    if (allRestored) {
      pass('Baseline role permissions restored with 100% fidelity across all 4 system roles');
    } else {
      fail('Baseline restoration', 'One or more roles failed to restore to baseline state');
    }

    // Clean up test sessions
    await prisma.session.deleteMany({
      where: { token: { in: createdSessionTokens } },
    });

    await prisma.$disconnect();

    if (spawnedProcess) {
      console.log('[INFO] Cleaning up background test process...');
      spawnedProcess.kill();
    }
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log('\n\x1b[36m====================================================================\x1b[0m');
  console.log('\x1b[1mCHALLENGER 2: ADVERSARIAL TEST EXECUTION SUMMARY\x1b[0m');
  console.log('\x1b[36m====================================================================\x1b[0m');
  console.log(`  Total Tests Run:    ${results.total}`);
  console.log(`  Passed Tests:       \x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Tests:       ${results.failed > 0 ? '\x1b[31m' : '\x1b[32m'}${results.failed}\x1b[0m`);
  console.log(`  Pass Rate:          ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log('\x1b[36m====================================================================\x1b[0m\n');

  if (results.failed > 0) {
    console.error('\x1b[31mFAILURES ENCOUNTERED:\x1b[0m');
    results.failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\x1b[32m\x1b[1mALL CHALLENGER 2 ADVERSARIAL TESTS PASSED EMPIRICALLY!\x1b[0m\n');
    process.exit(0);
  }
}

runRoleMutationSuite().catch(async (e) => {
  console.error('\x1b[31mFatal error in Challenger 2 test runner:\x1b[0m', e);
  await prisma.$disconnect();
  if (spawnedProcess) {
    spawnedProcess.kill();
  }
  process.exit(1);
});
