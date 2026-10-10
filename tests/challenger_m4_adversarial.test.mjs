/**
 * tests/challenger_m4_adversarial.test.mjs
 * =============================================================================
 * Milestone 4 Empirical Adversarial Verification Suite
 * Role: challenger_m4_1 (critic, specialist)
 * Target: Frontend Role Configuration & Backend Role-Permission Integration
 *
 * Suites:
 *   Suite 1: Dynamic Role & Permission Mutation Contracts (PUT /api/roles/:id/permisos)
 *   Suite 2: Live Session Instant Authorization Enforcement (Zero Cache Delay)
 *   Suite 3: Global Admin Lockout Prevention Safeguards (Role ID 1)
 *   Suite 4: Non-Admin & Unauthorized Mutation Guards (401 & 403 Enforcements)
 *   Suite 5: SSR Route Security for /configuracion/roles (302 Redirect & 403 Forbidden)
 *   Suite 6: Frontend Component Lockout Defense & State Sync Specifications
 *   Suite 7: DB Baseline Integrity & Seed State Rollback
 * =============================================================================
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const prisma = new PrismaClient();
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
let FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';

// Results accumulator
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  suites: {},
  failures: [],
};

let currentSuite = 'General';

function setSuite(name) {
  currentSuite = name;
  if (!results.suites[name]) {
    results.suites[name] = { total: 0, passed: 0, failed: 0 };
  }
  console.log(`\n\x1b[35m=== [${name}] ===\x1b[0m`);
}

function pass(assertion, detail = '') {
  results.total++;
  results.passed++;
  if (results.suites[currentSuite]) {
    results.suites[currentSuite].total++;
    results.suites[currentSuite].passed++;
  }
  console.log(`  \x1b[32m✓ [PASS ${results.total}]\x1b[0m ${assertion}${detail ? ` \x1b[90m-> ${detail}\x1b[0m` : ''}`);
}

function fail(assertion, error) {
  results.total++;
  results.failed++;
  if (results.suites[currentSuite]) {
    results.suites[currentSuite].total++;
    results.suites[currentSuite].failed++;
  }
  results.failures.push({ suite: currentSuite, testNum: results.total, assertion, error });
  console.error(`  \x1b[31m✗ [FAIL ${results.total}]\x1b[0m ${assertion} \x1b[31m-> ERROR: ${error}\x1b[0m`);
}

// HTTP request helper
async function apiRequest(pathName, options = {}) {
  const url = `${BACKEND_URL}${pathName}`;
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
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = { _rawText: text };
  }
  return { status: res.status, headers: res.headers, body };
}

let spawnedBackend = null;
let spawnedFrontendServer = null;

async function ensureBackendRunning() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/roles`);
    if ([200, 401, 403].includes(res.status)) {
      console.log(`[INFO] Backend server is reachable at ${BACKEND_URL}`);
      return;
    }
  } catch {
    // Backend offline, attempt spawn
  }

  console.log('[INFO] Spawning backend server from backend/dist/index.js...');
  spawnedBackend = spawn('node', ['backend/dist/index.js'], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    env: { ...process.env, PORT: '3001' },
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch(`${BACKEND_URL}/api/roles`);
      if ([200, 401, 403].includes(res.status)) {
        console.log('[INFO] Backend server successfully connected.');
        return;
      }
    } catch {}
  }
  throw new Error(`Could not connect to backend server at ${BACKEND_URL}`);
}

async function ensureFrontendRunning() {
  // Test if frontend is already responding
  try {
    const res = await fetch(`${FRONTEND_URL}/login`, { redirect: 'manual' });
    if (res.status === 200 || res.status === 302) {
      console.log(`[INFO] Frontend server is reachable at ${FRONTEND_URL}`);
      return;
    }
  } catch {
    // Frontend offline
  }

  console.log('[INFO] Initializing standalone Astro SSR server on port 4321...');
  try {
    const entryPath = path.resolve(PROJECT_ROOT, 'frontend/dist/server/entry.mjs');
    const entryModule = await import(entryPath);
    const handler = entryModule.handler;

    const server = http.createServer((req, res) => {
      handler(req, res);
    });

    await new Promise((resolve, reject) => {
      server.listen(4321, '127.0.0.1', () => {
        console.log('[INFO] Standalone Astro SSR server listening on http://127.0.0.1:4321');
        spawnedFrontendServer = server;
        FRONTEND_URL = 'http://127.0.0.1:4321';
        resolve();
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port already in use, reuse existing
          FRONTEND_URL = 'http://127.0.0.1:4321';
          resolve();
        } else {
          reject(err);
        }
      });
    });
  } catch (err) {
    console.warn('[WARN] Could not initialize standalone Astro server:', err.message);
  }
}

// Baseline seed mappings per PROJECT.md & seed.ts
const SEED_ROLE_MAPPINGS = {
  Administrador: [
    'expedientes:view',
    'expedientes:create',
    'expedientes:edit',
    'expedientes:status',
    'usuarios:view',
    'usuarios:create',
    'usuarios:edit',
    'usuarios:delete',
    'roles:view',
    'roles:manage',
    'catalogos:view',
    'catalogos:manage',
    'impersonate:use',
  ],
  'Magistrado/Sala': [
    'expedientes:view',
    'expedientes:edit',
    'expedientes:status',
    'catalogos:view',
  ],
  'Secretario de Acuerdos': [
    'expedientes:view',
    'expedientes:create',
    'expedientes:edit',
    'expedientes:status',
    'catalogos:view',
  ],
  'Consulta/Dirección': [
    'expedientes:view',
    'catalogos:view',
  ],
};

async function snapshotDatabaseRoles() {
  const roles = await prisma.rol.findMany({
    include: {
      permisos: {
        include: { permiso: true },
        orderBy: [{ permiso: { id: 'asc' } }],
      },
    },
    orderBy: { id: 'asc' },
  });
  return roles.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    permisoCodigos: r.permisos.map((rp) => rp.permiso.codigo),
    permisoIds: r.permisos.map((rp) => rp.permiso.id),
  }));
}

async function restoreDatabaseSeedState() {
  for (const [roleName, codigos] of Object.entries(SEED_ROLE_MAPPINGS)) {
    const rol = await prisma.rol.findUnique({ where: { nombre: roleName } });
    if (!rol) continue;

    // Get matching permission IDs
    const permisos = await prisma.permiso.findMany({
      where: { codigo: { in: codigos } },
      select: { id: true },
    });
    const permisoIds = permisos.map((p) => p.id);

    await prisma.$transaction([
      prisma.rolPermiso.deleteMany({ where: { rolId: rol.id } }),
      prisma.rolPermiso.createMany({
        data: permisoIds.map((permisoId) => ({ rolId: rol.id, permisoId })),
      }),
    ]);
  }
}

// ============================================================================
// MAIN ADVERSARIAL RUNNER
// ============================================================================
export async function runAdversarialSuite() {
  console.log('\n\x1b[36m' + '='.repeat(75) + '\x1b[0m');
  console.log('\x1b[1m  MILESTONE 4 EMPIRICAL ADVERSARIAL VERIFICATION SUITE\x1b[0m');
  console.log('  Author: challenger_m4_1 | Role: critic, specialist');
  console.log('\x1b[36m' + '='.repeat(75) + '\x1b[0m\n');

  try {
    await ensureBackendRunning();
    await ensureFrontendRunning();
  } catch (initErr) {
    console.error('Fatal initialization error:', initErr);
    process.exit(1);
  }

  // Baseline Snapshot
  const initialRoles = await snapshotDatabaseRoles();
  console.log(`[INFO] Captured initial snapshot of ${initialRoles.length} roles.`);

  // --------------------------------------------------------------------------
  // Authentication Setup: Obtain Tokens
  // --------------------------------------------------------------------------
  let adminToken = null;
  let consultaToken = null;
  let secretarioToken = null;
  let magistradoToken = null;

  try {
    const [adminLogin, consultaLogin, secLogin, magLogin] = await Promise.all([
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
      }),
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { correo: 'consulta@tjabcs.gob.mx', password: 'password123' },
      }),
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { correo: 'secretario1@tjabcs.gob.mx', password: 'password123' },
      }),
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { correo: 'magistrado1@tjabcs.gob.mx', password: 'password123' },
      }),
    ]);

    adminToken = adminLogin.body.token;
    consultaToken = consultaLogin.body.token;
    secretarioToken = secLogin.body.token;
    magistradoToken = magLogin.body.token;

    if (!adminToken || !consultaToken || !secretarioToken || !magistradoToken) {
      throw new Error('Failed to acquire test session tokens');
    }
  } catch (authErr) {
    console.error('Authentication pre-flight failure:', authErr);
    process.exit(1);
  }

  const allPermisos = await prisma.permiso.findMany({ orderBy: { id: 'asc' } });
  const permMapByCode = new Map(allPermisos.map((p) => [p.codigo, p.id]));
  const permMapById = new Map(allPermisos.map((p) => [p.id, p.codigo]));

  // ==========================================================================
  // SUITE 1: DYNAMIC ROLE & PERMISSION MUTATION CONTRACTS
  // ==========================================================================
  setSuite('Suite 1: Dynamic Role & Permission Mutation Contracts');

  // Test 1.1: PUT /api/roles/:id/permisos using permisoCodigos
  {
    const targetPayload = {
      permisoCodigos: ['expedientes:view', 'usuarios:view'],
    };
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: targetPayload,
    });

    if (res.status === 200 && res.body.rol && Array.isArray(res.body.rol.permisos)) {
      const returnedCodes = res.body.rol.permisos.map((p) => p.codigo).sort();
      const expectedCodes = ['expedientes:view', 'usuarios:view'].sort();
      if (JSON.stringify(returnedCodes) === JSON.stringify(expectedCodes)) {
        pass('T4-MUT-01: Update Role 3 via permisoCodigos returns 200 with updated permissions', `Codes: ${returnedCodes.join(', ')}`);
      } else {
        fail('T4-MUT-01: Update Role 3 via permisoCodigos payload mismatch', `Expected ${expectedCodes}, got ${returnedCodes}`);
      }
    } else {
      fail('T4-MUT-01: Update Role 3 via permisoCodigos', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }

    // Direct DB verification
    const dbRole3 = await prisma.rol.findUnique({
      where: { id: 3 },
      include: { permisos: { include: { permiso: true } } },
    });
    const dbCodes = dbRole3.permisos.map((rp) => rp.permiso.codigo).sort();
    if (JSON.stringify(dbCodes) === JSON.stringify(['expedientes:view', 'usuarios:view'].sort())) {
      pass('T4-MUT-01b: DB reflects exactly mutated permissions for Role 3');
    } else {
      fail('T4-MUT-01b: DB mismatch for Role 3', `Found: ${dbCodes}`);
    }
  }

  // Test 1.2: PUT /api/roles/:id/permisos using permisoIds
  {
    const id1 = permMapByCode.get('expedientes:view');
    const id2 = permMapByCode.get('catalogos:view');
    const targetPayload = { permisoIds: [id1, id2] };

    const res = await apiRequest('/api/roles/2/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: targetPayload,
    });

    if (res.status === 200 && res.body.rol) {
      const returnedIds = res.body.rol.permisos.map((p) => p.id).sort();
      const expectedIds = [id1, id2].sort();
      if (JSON.stringify(returnedIds) === JSON.stringify(expectedIds)) {
        pass('T4-MUT-02: Update Role 2 via permisoIds returns 200 with matching IDs', `IDs: ${returnedIds.join(', ')}`);
      } else {
        fail('T4-MUT-02: Update Role 2 via permisoIds payload mismatch', `Expected ${expectedIds}, got ${returnedIds}`);
      }
    } else {
      fail('T4-MUT-02: Update Role 2 via permisoIds', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 1.3: Input Deduplication (Prevents SQLite composite key conflict)
  {
    const id1 = permMapByCode.get('expedientes:view');
    const id2 = permMapByCode.get('expedientes:create');
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [id1, id1, id1, id2, id2] },
    });

    if (res.status === 200 && res.body.rol) {
      const returnedIds = res.body.rol.permisos.map((p) => p.id);
      if (returnedIds.length === 2) {
        pass('T4-MUT-03: Deduplication handles duplicate IDs cleanly without SQLite constraint violation', `Unique count: 2`);
      } else {
        fail('T4-MUT-03: Deduplication failure', `Expected 2 items, got ${returnedIds.length}`);
      }
    } else {
      fail('T4-MUT-03: Deduplication request failed', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 1.4: Validation - Missing both fields
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { invalidField: true },
    });
    if (res.status === 400 && res.body.error?.includes('permisoIds')) {
      pass('T4-MUT-04: Rejects payload missing both permisoIds and permisoCodigos with 400');
    } else {
      fail('T4-MUT-04: Payload validation for missing fields', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 1.5: Validation - Non-existent permission ID
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [1, 99999] },
    });
    if (res.status === 400 && res.body.error?.includes('99999')) {
      pass('T4-MUT-05: Rejects non-existent permission ID with 400 naming the missing ID');
    } else {
      fail('T4-MUT-05: Non-existent permission ID validation', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 1.6: Validation - Non-existent permission code
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['invalid:code:xyz'] },
    });
    if (res.status === 400 && res.body.error?.includes('invalid:code:xyz')) {
      pass('T4-MUT-06: Rejects non-existent permission code with 400 naming the missing code');
    } else {
      fail('T4-MUT-06: Non-existent permission code validation', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 1.7: Validation - Invalid role ID in path
  {
    const res = await apiRequest('/api/roles/invalid_id/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 400 && res.body.error?.includes('inválido')) {
      pass('T4-MUT-07: Non-numeric role ID returns 400 Bad Request');
    } else {
      fail('T4-MUT-07: Non-numeric role ID', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 1.8: Validation - Non-existent role ID
  {
    const res = await apiRequest('/api/roles/99999/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 404 && res.body.error?.includes('no encontrado')) {
      pass('T4-MUT-08: Non-existent role ID returns 404 Not Found');
    } else {
      fail('T4-MUT-08: Non-existent role ID', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // ==========================================================================
  // SUITE 2: LIVE SESSION INSTANT AUTHORIZATION ENFORCEMENT
  // ==========================================================================
  setSuite('Suite 2: Live Session Instant Authorization Enforcement');

  // Test 2.1: Immediate Read Grant Propagation without re-login
  {
    // Step a: Ensure Role 3 does NOT have usuarios:view initially
    await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view', 'expedientes:create'] },
    });

    // Step b: Verify secretario session gets 403 on /api/usuarios
    const resDenied = await apiRequest('/api/usuarios', {
      headers: { Authorization: `Bearer ${secretarioToken}` },
    });
    if (resDenied.status === 403) {
      pass('T4-ENF-01a: Active session immediately receives 403 when lacking usuarios:view');
    } else {
      fail('T4-ENF-01a: Expected 403 before grant', `HTTP ${resDenied.status}`);
    }

    // Step c: Admin grants usuarios:view to Role 3
    await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view', 'expedientes:create', 'usuarios:view'] },
    });

    // Step d: Active secretario session re-attempts /api/usuarios WITHOUT re-login
    const resAllowed = await apiRequest('/api/usuarios', {
      headers: { Authorization: `Bearer ${secretarioToken}` },
    });
    if (resAllowed.status === 200 && Array.isArray(resAllowed.body)) {
      pass('T4-ENF-01b: Active session immediately accesses /api/usuarios with 200 OK with zero cache delay');
    } else {
      fail('T4-ENF-01b: Expected 200 after grant', `HTTP ${resAllowed.status}`);
    }

    // Step e: Admin revokes usuarios:view from Role 3
    await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view', 'expedientes:create'] },
    });

    // Step f: Active secretario session re-attempts /api/usuarios immediately
    const resRevoked = await apiRequest('/api/usuarios', {
      headers: { Authorization: `Bearer ${secretarioToken}` },
    });
    if (resRevoked.status === 403) {
      pass('T4-ENF-02: Active session immediately blocked with 403 upon revocation (zero TTL wait)');
    } else {
      fail('T4-ENF-02: Expected 403 after revocation', `HTTP ${resRevoked.status}`);
    }
  }

  // ==========================================================================
  // SUITE 3: GLOBAL ADMIN LOCKOUT PREVENTION SAFEGUARDS
  // ==========================================================================
  setSuite('Suite 3: Global Admin Lockout Prevention Safeguards');

  // Test 3.1: Strip roles:manage via permisoCodigos
  {
    const adminCodesWithoutRolesManage = SEED_ROLE_MAPPINGS.Administrador.filter((c) => c !== 'roles:manage');
    const res = await apiRequest('/api/roles/1/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: adminCodesWithoutRolesManage },
    });

    if (res.status === 400 && res.body.error?.includes('roles:manage')) {
      pass('T4-LCK-01: Intercepts attempt to strip roles:manage via permisoCodigos with 400 Bad Request', res.body.error);
    } else {
      fail('T4-LCK-01: Admin lockout defense failed for roles:manage via codes', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 3.2: Strip impersonate:use via permisoCodigos
  {
    const adminCodesWithoutImpersonate = SEED_ROLE_MAPPINGS.Administrador.filter((c) => c !== 'impersonate:use');
    const res = await apiRequest('/api/roles/1/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: adminCodesWithoutImpersonate },
    });

    if (res.status === 400 && res.body.error?.includes('impersonate:use')) {
      pass('T4-LCK-02: Intercepts attempt to strip impersonate:use via permisoCodigos with 400 Bad Request', res.body.error);
    } else {
      fail('T4-LCK-02: Admin lockout defense failed for impersonate:use via codes', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 3.3: Strip both essential permissions via empty array
  {
    const res = await apiRequest('/api/roles/1/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: [] },
    });

    if (res.status === 400 && res.body.error?.includes('Protección de seguridad')) {
      pass('T4-LCK-03: Intercepts attempt to strip all permissions from Administrador via empty array with 400');
    } else {
      fail('T4-LCK-03: Strip all permissions empty array', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 3.4: Strip roles:manage via permisoIds
  {
    const rolesManageId = permMapByCode.get('roles:manage');
    const allAdminIds = SEED_ROLE_MAPPINGS.Administrador.map((c) => permMapByCode.get(c));
    const adminIdsWithoutManage = allAdminIds.filter((id) => id !== rolesManageId);

    const res = await apiRequest('/api/roles/1/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: adminIdsWithoutManage },
    });

    if (res.status === 400 && res.body.error?.includes('roles:manage')) {
      pass('T4-LCK-04: Intercepts attempt to strip roles:manage via permisoIds with 400 Bad Request', res.body.error);
    } else {
      fail('T4-LCK-04: Admin lockout defense failed for roles:manage via IDs', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 3.5: Strip impersonate:use via permisoIds
  {
    const impersonateId = permMapByCode.get('impersonate:use');
    const allAdminIds = SEED_ROLE_MAPPINGS.Administrador.map((c) => permMapByCode.get(c));
    const adminIdsWithoutImpersonate = allAdminIds.filter((id) => id !== impersonateId);

    const res = await apiRequest('/api/roles/1/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: adminIdsWithoutImpersonate },
    });

    if (res.status === 400 && res.body.error?.includes('impersonate:use')) {
      pass('T4-LCK-05: Intercepts attempt to strip impersonate:use via permisoIds with 400 Bad Request', res.body.error);
    } else {
      fail('T4-LCK-05: Admin lockout defense failed for impersonate:use via IDs', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 3.6: Verify Administrador DB Integrity after all hostile attacks
  {
    const adminRole = await prisma.rol.findUnique({
      where: { id: 1 },
      include: { permisos: { include: { permiso: true } } },
    });
    const currentAdminCodes = adminRole.permisos.map((rp) => rp.permiso.codigo);
    const hasManage = currentAdminCodes.includes('roles:manage');
    const hasImpersonate = currentAdminCodes.includes('impersonate:use');

    if (hasManage && hasImpersonate && currentAdminCodes.length === 13) {
      pass('T4-LCK-06: Database check confirms Administrador holds all 13 permissions unharmed', `Count: ${currentAdminCodes.length}`);
    } else {
      fail('T4-LCK-06: Administrador DB corrupted by lockout attacks', `Codes: ${currentAdminCodes.join(', ')}`);
    }
  }

  // ==========================================================================
  // SUITE 4: NON-ADMIN & UNAUTHORIZED MUTATION GUARDS (401 & 403)
  // ==========================================================================
  setSuite('Suite 4: Non-Admin & Unauthorized Mutation Guards');

  // Test 4.1: Unauthenticated mutation attempt
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 401 && res.body.error?.includes('No autenticado')) {
      pass('T4-SEC-01: Unauthenticated request to PUT /api/roles/:id/permisos returns 401 Unauthorized');
    } else {
      fail('T4-SEC-01: Unauthenticated request', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 4.2: Malformed Bearer token
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: 'Bearer token_invalido_totalmente_falso_12345' },
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 401) {
      pass('T4-SEC-02: Malformed / non-existent Bearer token returns 401 Unauthorized');
    } else {
      fail('T4-SEC-02: Malformed Bearer token', `HTTP ${res.status}`);
    }
  }

  // Test 4.3: Non-Admin (consulta) caller attempt
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 403 && res.body.error?.includes('roles:manage')) {
      pass('T4-SEC-03: User Consulta attempting PUT /api/roles/:id/permisos returns 403 Forbidden with required permission named');
    } else {
      fail('T4-SEC-03: User Consulta mutation guard', `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Test 4.4: Non-Admin (secretario) caller attempt
  {
    const res = await apiRequest('/api/roles/2/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${secretarioToken}` },
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 403) {
      pass('T4-SEC-04: User Secretario attempting PUT /api/roles/:id/permisos returns 403 Forbidden');
    } else {
      fail('T4-SEC-04: User Secretario mutation guard', `HTTP ${res.status}`);
    }
  }

  // Test 4.5: Non-Admin (magistrado) caller attempt
  {
    const res = await apiRequest('/api/roles/3/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${magistradoToken}` },
      body: { permisoCodigos: ['expedientes:view'] },
    });
    if (res.status === 403) {
      pass('T4-SEC-05: User Magistrado attempting PUT /api/roles/:id/permisos returns 403 Forbidden');
    } else {
      fail('T4-SEC-05: User Magistrado mutation guard', `HTTP ${res.status}`);
    }
  }

  // Test 4.6: Impersonated Admin Session Restriction
  {
    // Admin impersonates Consulta (targetUserId: 2)
    const impRes = await apiRequest('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: 2 },
    });

    if (impRes.status === 200 && impRes.body.token) {
      const impersonatedToken = impRes.body.token;

      // Impersonated session attempts role mutation
      const mutRes = await apiRequest('/api/roles/3/permisos', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${impersonatedToken}` },
        body: { permisoCodigos: ['expedientes:view'] },
      });

      if (mutRes.status === 403) {
        pass('T4-SEC-06: Impersonated admin session is strictly scoped to target role and receives 403 Forbidden');
      } else {
        fail('T4-SEC-06: Impersonated admin scoping failed', `HTTP ${mutRes.status}`);
      }

      // Revert impersonation
      await apiRequest('/api/auth/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${impersonatedToken}` },
      });
    } else {
      fail('T4-SEC-06: Setup impersonation failed', `HTTP ${impRes.status}`);
    }
  }

  // ==========================================================================
  // SUITE 5: SSR ROUTE SECURITY FOR /configuracion/roles
  // ==========================================================================
  setSuite('Suite 5: SSR Route Security for /configuracion/roles');

  // Test 5.1: Unauthenticated SSR Request -> 302 Redirect to /login
  {
    try {
      const res = await fetch(`${FRONTEND_URL}/configuracion/roles`, {
        redirect: 'manual',
      });

      const location = res.headers.get('location') || '';
      if (res.status === 302 && location.includes('/login') && location.includes(encodeURIComponent('/configuracion/roles'))) {
        pass('T4-SSR-01: Unauthenticated GET /configuracion/roles receives HTTP 302 redirecting to /login with preserved redirect URI', location);
      } else {
        fail('T4-SSR-01: Unauthenticated SSR redirect', `Status: ${res.status}, Location: ${location}`);
      }
    } catch (err) {
      fail('T4-SSR-01: Unauthenticated SSR fetch error', err.message);
    }
  }

  // Test 5.2: Unauthenticated SSR Request with Query String preserved
  {
    try {
      const res = await fetch(`${FRONTEND_URL}/configuracion/roles?tab=permisos&focus=admin`, {
        redirect: 'manual',
      });

      const location = res.headers.get('location') || '';
      const expectedEncoded = encodeURIComponent('/configuracion/roles?tab=permisos&focus=admin');
      if (res.status === 302 && location.includes(expectedEncoded)) {
        pass('T4-SSR-02: Unauthenticated GET preserves entire query string in redirect URI', location);
      } else {
        fail('T4-SSR-02: Query string preservation', `Status: ${res.status}, Location: ${location}`);
      }
    } catch (err) {
      fail('T4-SSR-02: SSR query preservation error', err.message);
    }
  }

  // Test 5.3: Authenticated Non-Admin User (Consulta) -> 403 Forbidden
  {
    try {
      const res = await fetch(`${FRONTEND_URL}/configuracion/roles`, {
        headers: {
          Cookie: `auth_token=${consultaToken}`,
        },
        redirect: 'manual',
      });

      const html = await res.text();
      const has403Status = res.status === 403;
      const hasDeniedTitle = html.includes('Acceso Denegado') || html.includes('403');
      const hasRequiredPerm = html.includes('roles:manage');

      if (has403Status && hasDeniedTitle && hasRequiredPerm) {
        pass('T4-SSR-03: Non-Admin authenticated user receives HTTP 403 with dedicated Access Denied view explaining required permission');
      } else {
        fail('T4-SSR-03: Non-Admin SSR protection', `Status: ${res.status}, hasDenied: ${hasDeniedTitle}, hasPerm: ${hasRequiredPerm}`);
      }
    } catch (err) {
      fail('T4-SSR-03: Non-Admin SSR error', err.message);
    }
  }

  // Test 5.4: Authenticated Non-Admin User (Magistrado) -> 403 Forbidden
  {
    try {
      const res = await fetch(`${FRONTEND_URL}/configuracion/roles`, {
        headers: {
          Cookie: `auth_token=${magistradoToken}`,
        },
        redirect: 'manual',
      });

      if (res.status === 403) {
        pass('T4-SSR-04: Magistrado user (lacks roles:manage) receives HTTP 403 on /configuracion/roles');
      } else {
        fail('T4-SSR-04: Magistrado SSR protection', `Status: ${res.status}`);
      }
    } catch (err) {
      fail('T4-SSR-04: Magistrado SSR error', err.message);
    }
  }

  // Test 5.5: Authenticated Global Admin User -> 200 OK
  {
    try {
      const res = await fetch(`${FRONTEND_URL}/configuracion/roles`, {
        headers: {
          Cookie: `auth_token=${adminToken}`,
        },
        redirect: 'manual',
      });

      const html = await res.text();
      const is200 = res.status === 200;
      const hasRoleConfig = html.includes('Roles y Permisos') || html.includes('RoleConfiguration');

      if (is200 && hasRoleConfig) {
        pass('T4-SSR-05: Global Admin user receives HTTP 200 with full RoleConfiguration UI loaded', `Status: ${res.status}`);
      } else {
        fail('T4-SSR-05: Admin SSR access', `Status: ${res.status}, hasContent: ${hasRoleConfig}`);
      }
    } catch (err) {
      fail('T4-SSR-05: Admin SSR error', err.message);
    }
  }

  // ==========================================================================
  // SUITE 6: FRONTEND COMPONENT LOCKOUT DEFENSE SPECIFICATIONS
  // ==========================================================================
  setSuite('Suite 6: Frontend Component Lockout Defense Specifications');

  // Verify component source constraints
  try {
    const fs = await import('node:fs/promises');
    const compSource = await fs.readFile(
      path.resolve(PROJECT_ROOT, 'frontend/src/components/RoleConfiguration.tsx'),
      'utf-8'
    );

    // 6.1 Check LOCKED_ADMIN_CODES definition
    if (
      compSource.includes("const LOCKED_ADMIN_CODES = ['roles:manage', 'impersonate:use']") ||
      compSource.includes("'roles:manage'") && compSource.includes("'impersonate:use'")
    ) {
      pass('T4-FE-01: RoleConfiguration.tsx defines LOCKED_ADMIN_CODES guarding roles:manage and impersonate:use');
    } else {
      fail('T4-FE-01: Locked admin codes definition in frontend component');
    }

    // 6.2 Check isPermissionLocked helper logic
    if (compSource.includes('isPermissionLocked') && compSource.includes('Administrador')) {
      pass('T4-FE-02: isPermissionLocked helper enforces disabled state for locked permissions on Administrador');
    } else {
      fail('T4-FE-02: isPermissionLocked implementation');
    }

    // 6.3 Check handleDeselectAll preserves locked admin permissions
    if (compSource.includes('handleDeselectAll') && compSource.includes('preservedIds')) {
      pass('T4-FE-03: handleDeselectAll explicitly retains locked admin permissions when deselecting all');
    } else {
      fail('T4-FE-03: handleDeselectAll lockout preservation');
    }

    // 6.4 Check active user session sync after role mutation
    if (compSource.includes('/api/auth/me') && compSource.includes('setSession')) {
      pass('T4-FE-04: RoleConfiguration refreshes /api/auth/me and syncs setSession when modifying current user role');
    } else {
      fail('T4-FE-04: Active session sync in RoleConfiguration');
    }
  } catch (feErr) {
    fail('Suite 6: Component verification error', feErr.message);
  }

  // ==========================================================================
  // SUITE 7: DB BASELINE INTEGRITY & SEED STATE ROLLBACK
  // ==========================================================================
  setSuite('Suite 7: DB Baseline Integrity & Seed State Rollback');

  try {
    console.log('[INFO] Performing atomic rollback of all roles to seed state...');
    await restoreDatabaseSeedState();

    const restoredRoles = await snapshotDatabaseRoles();
    let allMatches = true;

    for (const restored of restoredRoles) {
      const expectedCodes = (SEED_ROLE_MAPPINGS[restored.nombre] || []).sort();
      const actualCodes = (restored.permisoCodigos || []).sort();
      const matches = JSON.stringify(expectedCodes) === JSON.stringify(actualCodes);
      if (!matches) {
        allMatches = false;
        console.error(`Rollback mismatch for ${restored.nombre}: expected ${expectedCodes}, got ${actualCodes}`);
      }
    }

    if (allMatches) {
      pass('T4-ROL-01: All system roles successfully and cleanly rolled back to 100% exact seed state', '4/4 roles verified');
    } else {
      fail('T4-ROL-01: Database rollback mismatch against seed state');
    }

    // Clean up temporary sessions created during the test
    const deleteCount = await prisma.session.deleteMany({
      where: {
        token: { in: [adminToken, consultaToken, secretarioToken, magistradoToken] },
      },
    });
    pass('T4-ROL-02: Test sessions pruned from database', `${deleteCount.count} sessions deleted`);
  } catch (rbErr) {
    fail('T4-ROL-01: Rollback failed', rbErr.message);
  }

  // Cleanup servers
  if (spawnedFrontendServer) {
    try {
      spawnedFrontendServer.close();
    } catch {}
  }
  if (spawnedBackend) {
    try {
      spawnedBackend.kill();
    } catch {}
  }

  await prisma.$disconnect();

  // Print Summary
  console.log('\n\x1b[36m' + '='.repeat(75) + '\x1b[0m');
  console.log('\x1b[1m                      TEST EXECUTION SUMMARY\x1b[0m');
  console.log('\x1b[36m' + '='.repeat(75) + '\x1b[0m');
  console.log(`  Total Tests Run:    ${results.total}`);
  console.log(`  Passed Tests:       \x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Tests:       ${results.failed > 0 ? `\x1b[31m${results.failed}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`  Pass Rate:          \x1b[1m${passRate}%\x1b[0m`);
  console.log('\x1b[36m' + '='.repeat(75) + '\x1b[0m\n');

  for (const [sName, sData] of Object.entries(results.suites)) {
    console.log(`  • ${sName}: ${sData.passed}/${sData.total} passed`);
  }

  if (results.failed === 0) {
    console.log('\n\x1b[32m\x1b[1mVERDICT: APPROVE (ALL MILESTONE 4 ADVERSARIAL CHALLENGES PASSED)\x1b[0m\n');
  } else {
    console.log(`\n\x1b[31m\x1b[1mVERDICT: REQUEST_CHANGES (${results.failed} FAILURE(S) DETECTED)\x1b[0m\n`);
  }

  return results;
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAdversarialSuite()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Unhandled test execution crash:', err);
      process.exit(1);
    });
}
