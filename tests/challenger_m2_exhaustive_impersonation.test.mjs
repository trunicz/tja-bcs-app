/**
 * tests/challenger_m2_exhaustive_impersonation.test.mjs
 * =============================================================================
 * Exhaustive Empirical Adversarial Challenge Suite for Milestone 2:
 * Impersonation Hub, Security Gating, Nested Impersonation & 1-Click Revert Flow
 * =============================================================================
 */

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

async function main() {
  console.log('\n\x1b[36m====================================================================\x1b[0m');
  console.log('\x1b[1mEXHAUSTIVE EMPIRICAL CHALLENGER: M2 IMPERSONATION HUB & SECURITY\x1b[0m');
  console.log('\x1b[36m====================================================================\x1b[0m\n');

  // 1. Fetch reference users from DB
  const adminUser = await prisma.usuario.findFirst({
    where: { correo: 'admin@tjabcs.gob.mx' },
    include: { rol: true },
  });
  const consultaUser = await prisma.usuario.findFirst({
    where: { correo: 'consulta@tjabcs.gob.mx' },
    include: { rol: true },
  });
  const magistradoUser = await prisma.usuario.findFirst({
    where: { correo: 'magistrado1@tjabcs.gob.mx' },
    include: { rol: true },
  });
  const secretarioUser = await prisma.usuario.findFirst({
    where: { correo: 'secretario1@tjabcs.gob.mx' },
    include: { rol: true },
  });

  if (!adminUser || !consultaUser || !magistradoUser || !secretarioUser) {
    throw new Error('Required baseline users missing in database.');
  }

  // Login accounts
  const loginAdmin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: adminUser.correo, password: 'password123' },
  });
  const loginConsulta = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: consultaUser.correo, password: 'password123' },
  });
  const loginMagistrado = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: magistradoUser.correo, password: 'password123' },
  });
  const loginSecretario = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: secretarioUser.correo, password: 'password123' },
  });

  const adminToken = loginAdmin.body.token;
  const consultaToken = loginConsulta.body.token;
  const magistradoToken = loginMagistrado.body.token;
  const secretarioToken = loginSecretario.body.token;

  console.log('--- TEST GROUP 1: NON-ADMIN IMPERSONATION ACCESS CONTROL ---');

  // Check 1.1: Non-admin role Consulta rejected
  const res1 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${consultaToken}` },
    body: { targetUserId: magistradoUser.id },
  });
  if (res1.status === 403 && res1.body.error?.includes('sólo el Administrador Global')) {
    pass('Consulta user denied impersonation with 403 Forbidden and explicit security message');
  } else {
    fail('Consulta user impersonation rejection', `Status: ${res1.status}, body: ${JSON.stringify(res1.body)}`);
  }

  // Check 1.2: Non-admin role Magistrado rejected
  const res2 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${magistradoToken}` },
    body: { targetUserId: secretarioUser.id },
  });
  if (res2.status === 403 && res2.body.error?.includes('sólo el Administrador Global')) {
    pass('Magistrado user denied impersonation with 403 Forbidden');
  } else {
    fail('Magistrado user impersonation rejection', `Status: ${res2.status}`);
  }

  // Check 1.3: Non-admin role Secretario rejected
  const res3 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretarioToken}` },
    body: { targetUserId: consultaUser.id },
  });
  if (res3.status === 403 && res3.body.error?.includes('sólo el Administrador Global')) {
    pass('Secretario user denied impersonation with 403 Forbidden');
  } else {
    fail('Secretario user impersonation rejection', `Status: ${res3.status}`);
  }

  // Check 1.4: Non-admin user even with dynamically added permissions (e.g. usuarios:view) CANNOT impersonate
  // Temporarily grant all permissions except admin role
  const rolConsulta = await prisma.rol.findFirst({ where: { nombre: 'Consulta/Dirección' } });
  const allPerms = await prisma.permiso.findMany();
  const permIds = allPerms.map((p) => p.id);

  // Grant all permissions to Consulta role
  await req('/api/roles/' + rolConsulta.id + '/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { permisoIds: permIds },
  });

  const resElevated = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${consultaToken}` },
    body: { targetUserId: magistradoUser.id },
  });
  if (resElevated.status === 403) {
    pass('Non-admin user with elevated granular permissions STILL strictly denied impersonation (Role check invariant)');
  } else {
    fail('Elevated non-admin impersonation', `Expected 403, got ${resElevated.status}`);
  }

  // Restore Consulta role permissions back to baseline [1, 10] ('expedientes:view', 'catalogos:view')
  const baselinePerms = await prisma.permiso.findMany({
    where: { codigo: { in: ['expedientes:view', 'catalogos:view'] } },
  });
  await req('/api/roles/' + rolConsulta.id + '/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { permisoIds: baselinePerms.map((p) => p.id) },
  });

  console.log('\n--- TEST GROUP 2: NESTED IMPERSONATION IN BACKEND AND UI INVARIANTS ---');

  // Login a fresh dedicated admin session
  const dedicatedAdminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: adminUser.correo, password: 'password123' },
  });
  const dedicatedToken = dedicatedAdminLogin.body.token;

  // Step 2.1: Admin impersonates Consulta
  const impRes1 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dedicatedToken}` },
    body: { targetUserId: consultaUser.id },
  });
  if (impRes1.status === 200 && impRes1.body.isImpersonated === true) {
    pass('Admin successfully entered impersonation mode for target Consulta (200 OK)');
  } else {
    fail('Initial impersonation', `Failed: ${impRes1.status}`);
  }

  // Verify DB state directly in SQLite
  const dbSessionImpersonated = await prisma.session.findUnique({
    where: { token: dedicatedToken },
  });
  if (
    dbSessionImpersonated &&
    dbSessionImpersonated.isImpersonated === true &&
    dbSessionImpersonated.usuarioId === consultaUser.id &&
    dbSessionImpersonated.originalAdminId === adminUser.id
  ) {
    pass('SQLite Session table directly verified: usuarioId switched to Consulta, isImpersonated=true, originalAdminId=Admin');
  } else {
    fail('SQLite session state', `Mismatch: ${JSON.stringify(dbSessionImpersonated)}`);
  }

  // Step 2.2: Nested Impersonation Attempt 1 - Impersonate Magistrado
  const nested1 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dedicatedToken}` },
    body: { targetUserId: magistradoUser.id },
  });
  if (nested1.status === 403 && nested1.body.error?.includes('sólo el Administrador Global')) {
    pass('Nested impersonation attempt (target: Magistrado) strictly denied (403 Forbidden)');
  } else {
    fail('Nested impersonation (Magistrado)', `Status: ${nested1.status}`);
  }

  // Step 2.3: Nested Impersonation Attempt 2 - Impersonate Secretario
  const nested2 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dedicatedToken}` },
    body: { targetUserId: secretarioUser.id },
  });
  if (nested2.status === 403) {
    pass('Nested impersonation attempt (target: Secretario) strictly denied (403 Forbidden)');
  } else {
    fail('Nested impersonation (Secretario)', `Status: ${nested2.status}`);
  }

  // Step 2.4: Nested Impersonation Attempt 3 - Impersonate same Consulta user again
  const nested3 = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dedicatedToken}` },
    body: { targetUserId: consultaUser.id },
  });
  if (nested3.status === 403 || nested3.status === 400) {
    pass('Nested self-re-impersonation strictly blocked (403/400)');
  } else {
    fail('Nested self-re-impersonation', `Status: ${nested3.status}`);
  }

  // Step 2.5: Verify session was NOT corrupted by failed nested calls
  const meAfterNested = await req('/api/auth/me', {
    headers: { Authorization: `Bearer ${dedicatedToken}` },
  });
  if (
    meAfterNested.status === 200 &&
    meAfterNested.body.isImpersonated === true &&
    meAfterNested.body.usuario?.id === consultaUser.id &&
    meAfterNested.body.originalAdmin?.id === adminUser.id
  ) {
    pass('Session uncorrupted after nested impersonation attacks: still validly scoped to Consulta');
  } else {
    fail('Session state after nested attacks', `Corrupted: ${JSON.stringify(meAfterNested.body)}`);
  }

  console.log('\n--- TEST GROUP 3: 1-CLICK REVERT FLOW & COMPLETE CONTEXT RESTORATION ---');

  // Step 3.1: Execute 1-click revert via POST /api/auth/revert
  const revertStart = Date.now();
  const revertRes = await req('/api/auth/revert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dedicatedToken}` },
  });
  const revertDurationMs = Date.now() - revertStart;

  if (
    revertRes.status === 200 &&
    revertRes.body.token === dedicatedToken &&
    revertRes.body.isImpersonated === false &&
    revertRes.body.originalAdmin === null &&
    revertRes.body.usuario?.id === adminUser.id &&
    revertRes.body.usuario?.correo === adminUser.correo &&
    revertRes.body.usuario?.rol === 'Administrador' &&
    Array.isArray(revertRes.body.permisos) &&
    revertRes.body.permisos.length === 13 &&
    revertRes.body.permisos.includes('impersonate:use') &&
    revertRes.body.permisos.includes('roles:manage')
  ) {
    pass(`POST /api/auth/revert completed instantaneously in ${revertDurationMs}ms with full admin restoration (200 OK)`);
  } else {
    fail('1-click revert execution', `Status: ${revertRes.status}, body: ${JSON.stringify(revertRes.body)}`);
  }

  // Step 3.2: Verify SQLite DB state post-revert
  const dbSessionRestored = await prisma.session.findUnique({
    where: { token: dedicatedToken },
  });
  if (
    dbSessionRestored &&
    dbSessionRestored.isImpersonated === false &&
    dbSessionRestored.usuarioId === adminUser.id &&
    dbSessionRestored.originalAdminId === null
  ) {
    pass('SQLite Session table directly verified post-revert: usuarioId=Admin, isImpersonated=false, originalAdminId=null');
  } else {
    fail('SQLite session state post-revert', `Mismatch: ${JSON.stringify(dbSessionRestored)}`);
  }

  // Step 3.3: Verify restored session has operational Admin capabilities
  const adminOpCheck = await req('/api/auth/me', {
    headers: { Authorization: `Bearer ${dedicatedToken}` },
  });
  if (
    adminOpCheck.status === 200 &&
    adminOpCheck.body.isImpersonated === false &&
    adminOpCheck.body.usuario?.rol === 'Administrador'
  ) {
    pass('Restored session verified via /api/auth/me: Global Admin role active, isImpersonated: false');
  } else {
    fail('Admin verification post-revert', `Failed: ${JSON.stringify(adminOpCheck.body)}`);
  }

  // Step 3.4: Repeat revert call (Idempotency / Guard against unneeded revert)
  const repeatRevert = await req('/api/auth/revert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dedicatedToken}` },
  });
  if (repeatRevert.status === 400 && repeatRevert.body.error?.includes('no está en modo de suplantación')) {
    pass('Calling revert on non-impersonated session properly rejected with 400 Bad Request');
  } else {
    fail('Repeat revert rejection', `Status: ${repeatRevert.status}`);
  }

  console.log('\n--- TEST GROUP 4: UI COMPONENT CODE INVARIANTS & SSR GATING ---');

  // Verify UsuariosList.tsx file invariants
  const fs = await import('fs');
  const usuariosListSource = fs.readFileSync('frontend/src/components/UsuariosList.tsx', 'utf-8');

  // Invariant 1: canStartImpersonation requires both Admin and NOT impersonating
  if (usuariosListSource.includes('const canStartImpersonation = isCurrentlyAdmin && !impersonationActive;')) {
    pass('UI Invariant verified: canStartImpersonation requires isCurrentlyAdmin && !impersonationActive');
  } else {
    fail('UI Invariant canStartImpersonation', 'Missing or modified expression');
  }

  // Invariant 2: Suplantación Activa badge present on active target user
  if (
    usuariosListSource.includes('Suplantación Activa') &&
    usuariosListSource.includes('isActivelyImpersonated')
  ) {
    pass('UI Invariant verified: Distinct "Suplantación Activa" badge rendered on impersonated user row');
  } else {
    fail('UI Invariant active badge', 'Missing Suplantación Activa badge logic');
  }

  // Invariant 3: Nested impersonation disabled with Spanish explanation
  if (
    usuariosListSource.includes('title="Debe revertir la sesión de suplantación actual antes de cambiar a otro usuario"') &&
    usuariosListSource.includes('impersonationActive && !isActivelyImpersonated')
  ) {
    pass('UI Invariant verified: Nested impersonation disabled on all other rows during active impersonation');
  } else {
    fail('UI Invariant nested button disabled', 'Missing nested impersonation disablement logic');
  }

  // Invariant 4: Persistent banner with 1-click revert button
  if (
    usuariosListSource.includes('Modo Suplantación Activo') &&
    usuariosListSource.includes('Revertir Sesión (1 Clic)') &&
    usuariosListSource.includes('handleRevert')
  ) {
    pass('UI Invariant verified: Persistent top banner rendered with 1-click "Revertir Sesión" button');
  } else {
    fail('UI Invariant revert banner', 'Missing persistent alert banner or Revert button');
  }

  // Invariant 5: Header does NOT contain ImpersonationSelector
  const appHeaderSource = fs.readFileSync('frontend/src/components/shell/AppHeader.tsx', 'utf-8');
  if (!appHeaderSource.includes('ImpersonationSelector') && !appHeaderSource.includes('impersonate')) {
    pass('Header Invariant verified: Impersonation controls completely removed from AppHeader.tsx');
  } else {
    fail('Header Invariant', 'AppHeader.tsx still contains impersonation references!');
  }

  // Clean up sessions
  await prisma.session.deleteMany({
    where: {
      token: { in: [adminToken, consultaToken, magistradoToken, secretarioToken, dedicatedToken] },
    },
  });

  await prisma.$disconnect();

  console.log('\n\x1b[36m====================================================================\x1b[0m');
  console.log('\x1b[1mEXHAUSTIVE CHALLENGER M2: SUMMARY\x1b[0m');
  console.log('\x1b[36m====================================================================\x1b[0m');
  console.log(`  Total Tests Run:    ${results.total}`);
  console.log(`  Passed Tests:       \x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Tests:       ${results.failed > 0 ? '\x1b[31m' : '\x1b[32m'}${results.failed}\x1b[0m`);
  console.log(`  Pass Rate:          ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log('\x1b[36m====================================================================\x1b[0m\n');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
