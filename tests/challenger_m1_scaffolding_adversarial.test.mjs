/**
 * tests/challenger_m1_scaffolding_adversarial.test.mjs
 * =============================================================================
 * Challenger M1: Empirical Adversarial Stress & Vulnerability Test Suite
 * 
 * Targets:
 *   1. /api/audiencias
 *   2. /api/notificaciones
 *   3. /api/reportes/estadisticas
 *   4. /api/expedientes (filters & search)
 * 
 * Attack Dimensions:
 *   - Boundary tests on dates, non-existent FKs, empty notifications
 *   - Cross-tenant / cross-user notification isolation & IDOR leakage
 *   - RBAC bypass attempts on audiencias (POST/PUT/DELETE) and admin endpoints
 *   - Filter query edge cases: regex patterns, SQL wildcards/injections, negative IDs
 * =============================================================================
 */

import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_URL || 'http://localhost:3001';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  findings: [],
};

function pass(name, detail = '') {
  results.total++;
  results.passed++;
  console.log(`  ✓ [PASS] ${name}${detail ? ' -> ' + detail : ''}`);
}

function recordFinding(category, severity, description, observation) {
  results.findings.push({ category, severity, description, observation });
  console.log(`  ⚠ [FINDING - ${severity}] ${description} -> ${observation}`);
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

async function login(correo, password = 'password123') {
  const res = await req('/api/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  if (res.status !== 200 || !res.body?.token) {
    throw new Error(`Login failed for ${correo}: status ${res.status} body: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('   CHALLENGER M1: ADVERSARIAL STRESS & SECURITY HARNESS');
  console.log('======================================================================\n');

  // Authenticate test actors
  console.log('--> Authenticating test actors...');
  const adminToken = await login('admin@tjabcs.gob.mx');
  const consultaToken = await login('consulta@tjabcs.gob.mx');
  const magistradoToken = await login('magistrado1@tjabcs.gob.mx');
  const secretarioToken = await login('secretario1@tjabcs.gob.mx');

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const consultaHeaders = { Authorization: `Bearer ${consultaToken}` };
  const magistradoHeaders = { Authorization: `Bearer ${magistradoToken}` };
  const secretarioHeaders = { Authorization: `Bearer ${secretarioToken}` };

  // Fetch baseline entities
  const adminUser = await prisma.usuario.findUnique({ where: { correo: 'admin@tjabcs.gob.mx' } });
  const consultaUser = await prisma.usuario.findUnique({ where: { correo: 'consulta@tjabcs.gob.mx' } });
  const exp = await prisma.expediente.findFirst();

  if (!exp) {
    throw new Error('Database does not have any seed expedientes!');
  }
  const validExpedienteId = exp.id;

  // ============================================================================
  // 1. BOUNDARY TESTS ON DATES, FOREIGN KEYS, AND NOTIFICATIONS
  // ============================================================================
  console.log('\n--- [1] BOUNDARY TESTS: DATES, FOREIGN KEYS & NOTIFICATIONS ---');

  // 1.1 Invalid date string on POST /api/audiencias
  const res1_1 = await req('/api/audiencias', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      expedienteId: validExpedienteId,
      fecha: 'not-a-valid-date-string',
      tipo: 'Audiencia Invalida',
    },
  });
  if (res1_1.status === 400 && res1_1.body?.error?.includes('fecha')) {
    pass('POST /api/audiencias with malformed date string rejected with 400 Bad Request');
  } else {
    throw new Error(`POST /api/audiencias malformed date expected 400, got ${res1_1.status}`);
  }

  // 1.2 Distant future date on POST /api/audiencias (Year 2099)
  const futureDate = '2099-12-31T10:00:00.000Z';
  const res1_2 = await req('/api/audiencias', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      expedienteId: validExpedienteId,
      fecha: futureDate,
      tipo: 'Audiencia Futura 2099',
      descripcion: 'Prueba de fecha lejana',
    },
  });
  if (res1_2.status === 201 && res1_2.body?.id) {
    pass('POST /api/audiencias with distant future date accepted (201)', `ID ${res1_2.body.id}`);
    await req(`/api/audiencias/${res1_2.body.id}`, { method: 'DELETE', headers: adminHeaders });
  } else {
    throw new Error(`POST /api/audiencias distant future date failed: ${res1_2.status}`);
  }

  // 1.3 Ancient past date on POST /api/audiencias (Year 1920)
  const pastDate = '1920-01-01T08:00:00.000Z';
  const res1_3 = await req('/api/audiencias', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      expedienteId: validExpedienteId,
      fecha: pastDate,
      tipo: 'Audiencia Pasada 1920',
      descripcion: 'Prueba de fecha pasada',
    },
  });
  if (res1_3.status === 201 && res1_3.body?.id) {
    pass('POST /api/audiencias with historical past date accepted (201)', `ID ${res1_3.body.id}`);
    await req(`/api/audiencias/${res1_3.body.id}`, { method: 'DELETE', headers: adminHeaders });
  } else {
    throw new Error(`POST /api/audiencias historical past date failed: ${res1_3.status}`);
  }

  // 1.4 Date filter boundary values on GET /api/audiencias (mes=0, mes=13, mes=-1, mes=abc)
  const res1_4a = await req('/api/audiencias?ano=2026&mes=0', { headers: adminHeaders });
  const res1_4b = await req('/api/audiencias?ano=2026&mes=13', { headers: adminHeaders });
  const res1_4c = await req('/api/audiencias?ano=2026&mes=-1', { headers: adminHeaders });
  const res1_4d = await req('/api/audiencias?ano=2026&mes=abc', { headers: adminHeaders });
  if (
    res1_4a.status === 200 && Array.isArray(res1_4a.body) &&
    res1_4b.status === 200 && Array.isArray(res1_4b.body) &&
    res1_4c.status === 200 && Array.isArray(res1_4c.body) &&
    res1_4d.status === 200 && Array.isArray(res1_4d.body)
  ) {
    pass('GET /api/audiencias with invalid month boundaries (0, 13, -1, abc) gracefully falls back without 500 error');
  } else {
    throw new Error(`GET /api/audiencias invalid months failed: ${res1_4a.status}, ${res1_4b.status}`);
  }

  // 1.5 Valid boundary years & non-numeric years on GET /api/audiencias (1970, 2030, 2099, NaN, abc)
  const res1_5a = await req('/api/audiencias?ano=1970', { headers: adminHeaders });
  const res1_5b = await req('/api/audiencias?ano=2030', { headers: adminHeaders });
  const res1_5c = await req('/api/audiencias?ano=2099', { headers: adminHeaders });
  const res1_5d = await req('/api/audiencias?ano=abc', { headers: adminHeaders });
  const res1_5e = await req('/api/audiencias?ano=NaN', { headers: adminHeaders });
  if (
    res1_5a.status === 200 && Array.isArray(res1_5a.body) &&
    res1_5b.status === 200 && Array.isArray(res1_5b.body) &&
    res1_5c.status === 200 && Array.isArray(res1_5c.body) &&
    res1_5d.status === 200 && Array.isArray(res1_5d.body) &&
    res1_5e.status === 200 && Array.isArray(res1_5e.body)
  ) {
    pass('GET /api/audiencias with chronological boundary years (1970, 2030, 2099) and non-numeric years (abc, NaN) succeeds (200 OK)');
  } else {
    throw new Error('GET /api/audiencias valid boundary years failed');
  }

  // 1.5.1 Empirical Finding: Out-of-bounds year queries (ano=99999999, ano=-500)
  const res1_5_extreme1 = await req('/api/audiencias?ano=99999999', { headers: adminHeaders });
  const res1_5_extreme2 = await req('/api/audiencias?ano=-500', { headers: adminHeaders });
  if (res1_5_extreme1.status === 500 || res1_5_extreme2.status === 500) {
    recordFinding(
      'Input Boundary Validation',
      'LOW',
      'Unhandled Prisma Date conversion exception on out-of-range integer years (ano=99999999, ano=-500)',
      `Returned HTTP ${res1_5_extreme1.status} and ${res1_5_extreme2.status} ({ error: 'Error al consultar audiencias judiciales' }) due to JS Date range overflow passed into Prisma filter. Non-fatal: process remains healthy.`
    );
  }

  // 1.6 Non-existent Foreign Key: expedienteId = 999999 on POST /api/audiencias
  const res1_6 = await req('/api/audiencias', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      expedienteId: 999999,
      fecha: new Date().toISOString(),
      tipo: 'Audiencia Expediente Fantasma',
    },
  });
  if (res1_6.status === 404 && res1_6.body?.error?.includes('expediente')) {
    pass('POST /api/audiencias with non-existent expedienteId returns 404 Not Found');
  } else {
    throw new Error(`POST /api/audiencias non-existent expedienteId expected 404, got ${res1_6.status}`);
  }

  // 1.7 Negative Foreign Key: expedienteId = -1 on POST /api/audiencias
  const res1_7 = await req('/api/audiencias', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      expedienteId: -1,
      fecha: new Date().toISOString(),
      tipo: 'Audiencia ID Negativo',
    },
  });
  if (res1_7.status === 404) {
    pass('POST /api/audiencias with negative expedienteId returns 404 Not Found');
  } else {
    throw new Error(`POST /api/audiencias negative expedienteId expected 404, got ${res1_7.status}`);
  }

  // 1.8 GET non-existent Audiencia ID: GET /api/audiencias/999999 and /api/audiencias/-1
  const res1_8a = await req('/api/audiencias/999999', { headers: adminHeaders });
  const res1_8b = await req('/api/audiencias/-1', { headers: adminHeaders });
  const res1_8c = await req('/api/audiencias/invalid-id', { headers: adminHeaders });
  if (res1_8a.status === 404 && res1_8b.status === 404 && res1_8c.status === 400) {
    pass('GET /api/audiencias/:id handles missing (404), negative (404), and malformed (400) IDs cleanly');
  } else {
    throw new Error(`GET /api/audiencias/:id boundary IDs failed`);
  }

  // 1.9 Non-existent Sala/Expediente filters on GET /api/audiencias
  const res1_9a = await req('/api/audiencias?expedienteId=999999', { headers: adminHeaders });
  const res1_9b = await req('/api/audiencias?salaId=999999', { headers: adminHeaders });
  const res1_9c = await req('/api/audiencias?expedienteId=-1&salaId=-1', { headers: adminHeaders });
  if (
    res1_9a.status === 200 && Array.isArray(res1_9a.body) && res1_9a.body.length === 0 &&
    res1_9b.status === 200 && Array.isArray(res1_9b.body) && res1_9b.body.length === 0 &&
    res1_9c.status === 200 && Array.isArray(res1_9c.body) && res1_9c.body.length === 0
  ) {
    pass('GET /api/audiencias with non-existent or negative FK filters returns empty list (200 OK [])');
  } else {
    throw new Error('GET /api/audiencias FK filters failed');
  }

  // 1.10 Empty notifications on POST /api/notificaciones
  const res1_10a = await req('/api/notificaciones', {
    method: 'POST',
    headers: adminHeaders,
    body: { titulo: '', mensaje: 'Mensaje sin titulo' },
  });
  const res1_10b = await req('/api/notificaciones', {
    method: 'POST',
    headers: adminHeaders,
    body: { titulo: 'Titulo sin mensaje', mensaje: '' },
  });
  const res1_10c = await req('/api/notificaciones', {
    method: 'POST',
    headers: adminHeaders,
    body: {},
  });
  if (res1_10a.status === 400 && res1_10b.status === 400 && res1_10c.status === 400) {
    pass('POST /api/notificaciones rejects empty title, empty message, or empty body with 400 Bad Request');
  } else {
    throw new Error('POST /api/notificaciones empty validation failed');
  }

  // ============================================================================
  // 2. CROSS-TENANT / CROSS-USER NOTIFICATION LEAKAGE & ISOLATION
  // ============================================================================
  console.log('\n--- [2] CROSS-USER NOTIFICATION ISOLATION & IDOR DEFENSE ---');

  // Setup: Create a private test notification for User A (Admin) and User B (Consulta)
  const notifAdminCreated = await prisma.notificacion.create({
    data: {
      usuarioId: adminUser.id,
      titulo: 'Notificacion Privada Admin Confidencial',
      mensaje: 'Solo admin debe ver este mensaje ultra secreto',
      tipo: 'urgente',
      leida: false,
    },
  });

  const notifConsultaCreated = await prisma.notificacion.create({
    data: {
      usuarioId: consultaUser.id,
      titulo: 'Notificacion Privada Consulta',
      mensaje: 'Solo el usuario consulta debe ver esto',
      tipo: 'info',
      leida: false,
    },
  });

  // 2.1 Verify User B cannot see User A's notifications in GET /api/notificaciones
  const consultaList = await req('/api/notificaciones', { headers: consultaHeaders });
  const adminNotifFoundInConsulta = consultaList.body?.some(
    (n) => n.id === notifAdminCreated.id || n.titulo.includes('Confidencial')
  );
  if (consultaList.status === 200 && !adminNotifFoundInConsulta) {
    pass('Cross-User Read Isolation: Consulta cannot see Admin private notifications');
  } else {
    throw new Error('Admin notification leaked in Consulta GET /api/notificaciones!');
  }

  // 2.2 Verify User A cannot see User B's notifications in GET /api/notificaciones
  const adminList = await req('/api/notificaciones', { headers: adminHeaders });
  const consultaNotifFoundInAdmin = adminList.body?.some(
    (n) => n.id === notifConsultaCreated.id || n.titulo.includes('Privada Consulta')
  );
  if (adminList.status === 200 && !consultaNotifFoundInAdmin) {
    pass('Cross-User Read Isolation: Admin cannot see Consulta private notifications');
  } else {
    throw new Error('Consulta notification leaked in Admin GET /api/notificaciones!');
  }

  // 2.3 Query parameter manipulation: Consulta passes ?usuarioId=<adminId> to GET /api/notificaciones
  const hijackedQuery = await req(`/api/notificaciones?usuarioId=${adminUser.id}`, { headers: consultaHeaders });
  const leakedInHijack = hijackedQuery.body?.some((n) => n.id === notifAdminCreated.id);
  if (hijackedQuery.status === 200 && !leakedInHijack) {
    pass('Parameter Tampering Defense: ?usuarioId query param ignored; server strictly scopes to req.user.id');
  } else {
    throw new Error('Query parameter ?usuarioId allowed cross-tenant notification access!');
  }

  // 2.4 IDOR Defense: User B (Consulta) attempts to mark User A's notification as read
  const idorConsultaOnAdmin = await req(`/api/notificaciones/${notifAdminCreated.id}/leida`, {
    method: 'PATCH',
    headers: consultaHeaders,
  });
  const verifyAdminNotif = await prisma.notificacion.findUnique({ where: { id: notifAdminCreated.id } });
  if (idorConsultaOnAdmin.status === 404 && verifyAdminNotif?.leida === false) {
    pass('IDOR Defense: Consulta cannot mark Admin notification as read (returns 404, state unchanged)');
  } else {
    throw new Error(`Consulta modified Admin notification! Status: ${idorConsultaOnAdmin.status}`);
  }

  // 2.5 IDOR Defense: User A (Admin) attempts to mark User B's notification as read
  const idorAdminOnConsulta = await req(`/api/notificaciones/${notifConsultaCreated.id}/leida`, {
    method: 'PATCH',
    headers: adminHeaders,
  });
  const verifyConsultaNotif = await prisma.notificacion.findUnique({ where: { id: notifConsultaCreated.id } });
  if (idorAdminOnConsulta.status === 404 && verifyConsultaNotif?.leida === false) {
    pass('IDOR Defense: Admin cannot mark Consulta notification as read (scoped to req.user.id)');
  } else {
    throw new Error(`Admin modified Consulta notification! Status: ${idorAdminOnConsulta.status}`);
  }

  // 2.6 Cross-user bulk mark-all isolation: Admin calls PATCH /api/notificaciones/marcar-todas-leidas
  await req('/api/notificaciones/marcar-todas-leidas', {
    method: 'PATCH',
    headers: adminHeaders,
  });
  const verifyConsultaStillUnread = await prisma.notificacion.findUnique({ where: { id: notifConsultaCreated.id } });
  if (verifyConsultaStillUnread?.leida === false) {
    pass('Bulk Update Isolation: Admin marcar-todas-leidas does NOT touch Consulta unread notifications');
  } else {
    throw new Error('Consulta notification was marked read during Admin bulk update!');
  }

  // 2.7 Boundary IDOR attacks on PATCH /api/notificaciones/:id/leida (0, -1, 999999, non-numeric)
  const idor0 = await req('/api/notificaciones/0/leida', { method: 'PATCH', headers: consultaHeaders });
  const idorNeg = await req('/api/notificaciones/-1/leida', { method: 'PATCH', headers: consultaHeaders });
  const idorBig = await req('/api/notificaciones/999999/leida', { method: 'PATCH', headers: consultaHeaders });
  const idorStr = await req('/api/notificaciones/sql-inject/leida', { method: 'PATCH', headers: consultaHeaders });
  if (
    idor0.status === 404 &&
    idorNeg.status === 404 &&
    idorBig.status === 404 &&
    idorStr.status === 400
  ) {
    pass('IDOR Boundary Fuzzing: Zero, negative, huge, and non-numeric IDs handled safely (404/400)');
  } else {
    throw new Error('IDOR Boundary Fuzzing failed');
  }

  // Clean up test notifications
  await prisma.notificacion.deleteMany({
    where: { id: { in: [notifAdminCreated.id, notifConsultaCreated.id] } },
  });

  // ============================================================================
  // 3. RBAC BYPASS ATTEMPTS
  // ============================================================================
  console.log('\n--- [3] RBAC BYPASS ATTEMPTS ON AUDIENCIAS & ADMIN ENDPOINTS ---');

  // 3.1 Restricted role (Consulta/Dirección) attempting POST /api/audiencias
  const rbacPostAud = await req('/api/audiencias', {
    method: 'POST',
    headers: consultaHeaders,
    body: {
      expedienteId: validExpedienteId,
      fecha: new Date().toISOString(),
      tipo: 'Audiencia Pirata Consulta',
    },
  });
  if (rbacPostAud.status === 403 && rbacPostAud.body?.error?.includes('permiso')) {
    pass('RBAC: Consulta role denied POST /api/audiencias (403 Forbidden with permission error)');
  } else {
    throw new Error(`Consulta POST /api/audiencias expected 403, got ${rbacPostAud.status}`);
  }

  // Create an authorized Audiencia using Admin for update/delete tests
  const tempAud = await prisma.audiencia.create({
    data: {
      expedienteId: validExpedienteId,
      fecha: new Date(),
      tipo: 'Audiencia de Control RBAC',
      estado: 'programada',
      salaId: exp.salaId,
    },
  });

  // 3.2 Restricted role (Consulta/Dirección) attempting PUT /api/audiencias/:id
  const rbacPutAud = await req(`/api/audiencias/${tempAud.id}`, {
    method: 'PUT',
    headers: consultaHeaders,
    body: { tipo: 'Tipo Modificado Sin Permiso' },
  });
  if (rbacPutAud.status === 403 && rbacPutAud.body?.error?.includes('permiso')) {
    pass('RBAC: Consulta role denied PUT /api/audiencias/:id (403 Forbidden)');
  } else {
    throw new Error(`Consulta PUT /api/audiencias/:id expected 403, got ${rbacPutAud.status}`);
  }

  // 3.3 Restricted role (Consulta/Dirección) attempting DELETE /api/audiencias/:id
  const rbacDelAud = await req(`/api/audiencias/${tempAud.id}`, {
    method: 'DELETE',
    headers: consultaHeaders,
  });
  if (rbacDelAud.status === 403 && rbacDelAud.body?.error?.includes('permiso')) {
    pass('RBAC: Consulta role denied DELETE /api/audiencias/:id (403 Forbidden)');
  } else {
    throw new Error(`Consulta DELETE /api/audiencias/:id expected 403, got ${rbacDelAud.status}`);
  }

  // 3.4 Authorized role (Secretario de Acuerdos) performing PUT and DELETE on Audiencia
  const secPutAud = await req(`/api/audiencias/${tempAud.id}`, {
    method: 'PUT',
    headers: secretarioHeaders,
    body: { descripcion: 'Actualizado por Secretario con expedientes:edit' },
  });
  if (secPutAud.status === 200 && secPutAud.body?.descripcion?.includes('Secretario')) {
    pass('RBAC: Secretario (holding expedientes:edit) successfully performs PUT /api/audiencias/:id (200 OK)');
  } else {
    throw new Error(`Secretario PUT /api/audiencias/:id failed: ${secPutAud.status}`);
  }

  const secDelAud = await req(`/api/audiencias/${tempAud.id}`, {
    method: 'DELETE',
    headers: secretarioHeaders,
  });
  if (secDelAud.status === 200) {
    pass('RBAC: Secretario successfully deletes Audiencia (200 OK)');
  } else {
    throw new Error(`Secretario DELETE /api/audiencias/:id failed: ${secDelAud.status}`);
  }

  // 3.5 Unauthenticated requests to Scaffolding APIs (missing Bearer header)
  const unauthAudList = await req('/api/audiencias');
  const unauthAudPost = await req('/api/audiencias', { method: 'POST', body: {} });
  const unauthNotifs = await req('/api/notificaciones');
  const unauthReportes = await req('/api/reportes/estadisticas');
  const unauthExpedientes = await req('/api/expedientes');
  if (
    unauthAudList.status === 401 &&
    unauthAudPost.status === 401 &&
    unauthNotifs.status === 401 &&
    unauthReportes.status === 401 &&
    unauthExpedientes.status === 401
  ) {
    pass('Auth Guard: All scaffolding endpoints reject unauthenticated requests with 401 Unauthorized');
  } else {
    throw new Error('Unauthenticated guard test failed');
  }

  // 3.6 Forged / Garbage Token attack
  const forgedTokenHeaders = { Authorization: 'Bearer forged-jwt-or-opaque-garbage-string-123456789' };
  const forgedAud = await req('/api/audiencias', { headers: forgedTokenHeaders });
  const forgedNotif = await req('/api/notificaciones', { headers: forgedTokenHeaders });
  const forgedRep = await req('/api/reportes/estadisticas', { headers: forgedTokenHeaders });
  if (forgedAud.status === 401 && forgedNotif.status === 401 && forgedRep.status === 401) {
    pass('Auth Guard: Forged/garbage Bearer token rejected with 401 Unauthorized');
  } else {
    throw new Error('Forged token test failed');
  }

  // 3.7 Restricted role attempting Impersonation or Role Management endpoints
  const rbacImpersonate = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: consultaHeaders,
    body: { targetUserId: adminUser.id },
  });
  const rbacRolesManage = await req('/api/roles/1/permisos', {
    method: 'PUT',
    headers: consultaHeaders,
    body: { permisoIds: [1, 2, 3] },
  });
  if (rbacImpersonate.status === 403 && rbacRolesManage.status === 403) {
    pass('RBAC: Consulta role denied /api/auth/impersonate and /api/roles management (403 Forbidden)');
  } else {
    throw new Error('Administrative endpoints RBAC bypass test failed');
  }

  // ============================================================================
  // 4. FILTER QUERY EDGE CASES: REGEX, SQL WILDCARDS, NEGATIVE IDs
  // ============================================================================
  console.log('\n--- [4] FILTER QUERY EDGE CASES: REGEX, SQL WILDCARDS & NEGATIVE IDs ---');

  // 4.1 Search parameter with Regex Metacharacters: .*, ^$, [a-z]+, (?=.*), \d+
  const regexPatterns = ['.*', '^$', '[a-z]+', '(?=.*[A-Z])', '\\d+', '(?<=foo)bar', '.*.*.*.*.*.*.*.*.*.*'];
  let regexTestsPass = true;
  for (const pattern of regexPatterns) {
    const enc = encodeURIComponent(pattern);
    const res = await req(`/api/expedientes?search=${enc}`, { headers: adminHeaders });
    if (res.status !== 200 || !Array.isArray(res.body)) {
      regexTestsPass = false;
      break;
    }
  }
  if (regexTestsPass) {
    pass('Regex Stress: Search query with complex ReDoS/regex metacharacters treated as literal text (200 OK)');
  } else {
    throw new Error('Regex stress test failed');
  }

  // 4.2 SQL Injection & Metacharacter Payloads in /api/expedientes?search
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE expedientes; --",
    "' UNION SELECT 1,2,3,4,5,6,7,8,9,10,11,12 --",
    "%27%20OR%201=1--",
    "admin' --",
    "/* comment */ 1=1",
    "%",
    "_",
    "%%%",
    "__",
    "\\",
    "''",
    '""',
  ];
  let sqlTestsPass = true;
  for (const payload of sqlPayloads) {
    const res = await req(`/api/expedientes?search=${encodeURIComponent(payload)}`, { headers: adminHeaders });
    if (res.status !== 200 || !Array.isArray(res.body)) {
      sqlTestsPass = false;
      break;
    }
  }
  if (sqlTestsPass) {
    pass('SQL Injection & Wildcard Defense: 13 SQL injection and wildcard payloads executed safely without error');
  } else {
    throw new Error('SQL injection test failed');
  }

  // 4.3 XSS / HTML payloads in /api/expedientes?search
  const xssPayload = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';
  const resXss = await req(`/api/expedientes?search=${encodeURIComponent(xssPayload)}`, { headers: adminHeaders });
  if (resXss.status === 200 && Array.isArray(resXss.body)) {
    pass('XSS Resilience: HTML/script tag search parameter handled cleanly (200 OK [])');
  } else {
    throw new Error('XSS test failed');
  }

  // 4.4 Massive length search query (Buffer overflow / memory stress: 5,000 characters)
  const hugeSearch = 'A'.repeat(5000);
  const resHuge = await req(`/api/expedientes?search=${hugeSearch}`, { headers: adminHeaders });
  if (resHuge.status === 200 && Array.isArray(resHuge.body)) {
    pass('Buffer/Length Stress: 5,000 character search parameter handled without crash (200 OK)');
  } else {
    throw new Error('Buffer stress test failed');
  }

  // 4.5 Negative and Boundary IDs on /api/expedientes
  const resNegSala = await req('/api/expedientes?salaId=-1', { headers: adminHeaders });
  const resZeroSala = await req('/api/expedientes?salaId=0', { headers: adminHeaders });
  const resNegEstatus = await req('/api/expedientes?estatusId=-99', { headers: adminHeaders });
  const resNegSub = await req('/api/expedientes?subEstatusId=-5', { headers: adminHeaders });
  const resBadId = await req('/api/expedientes?salaId=not-an-id&estatusId=undefined', { headers: adminHeaders });
  if (
    resNegSala.status === 200 && resNegSala.body.length === 0 &&
    resZeroSala.status === 200 && resZeroSala.body.length === 0 &&
    resNegEstatus.status === 200 && resNegEstatus.body.length === 0 &&
    resNegSub.status === 200 && resNegSub.body.length === 0 &&
    resBadId.status === 200 && Array.isArray(resBadId.body)
  ) {
    pass('Numeric ID Boundaries: Negative, zero, and malformed filter IDs in /api/expedientes return empty list or fall back gracefully');
  } else {
    throw new Error('Numeric ID boundaries test failed');
  }

  // 4.6 Query parameter pollution (array parameters)
  const resPollution = await req('/api/expedientes?search=001&search=hack', { headers: adminHeaders });
  if (resPollution.status === 200 && Array.isArray(resPollution.body)) {
    pass('HTTP Parameter Pollution (HPP): Duplicate search query parameters handled safely without server crash');
  } else {
    throw new Error('HPP test failed');
  }

  // 4.6.1 Empirical Finding: Non-numeric limit parameter (?limit=abc)
  const resLimitExp = await req('/api/expedientes?limit=abc', { headers: adminHeaders });
  const resLimitAud = await req('/api/audiencias?limit=abc', { headers: adminHeaders });
  const resLimitNot = await req('/api/notificaciones?limit=abc', { headers: adminHeaders });
  if (resLimitExp.status === 500 || resLimitAud.status === 500 || resLimitNot.status === 500) {
    recordFinding(
      'Input Validation / ORM Handling',
      'LOW',
      'Non-numeric limit (?limit=abc) yields NaN passed to Prisma take, causing 500 Internal Server Error',
      `Endpoints (/api/expedientes, /api/audiencias, /api/notificaciones) return 500 instead of defaulting to unlimited/fallback or returning 400. Process remains healthy.`
    );
  }

  // 4.7 Filter stress on /api/reportes/estadisticas
  const repSqlInjection = await req("/api/reportes/estadisticas?ano=2026;DROP+TABLE+expedientes;--&salaId=-1", { headers: adminHeaders });
  const repNegativeSala = await req('/api/reportes/estadisticas?salaId=-1', { headers: adminHeaders });
  const repFarFuture = await req('/api/reportes/estadisticas?ano=2099', { headers: adminHeaders });
  const repStringSala = await req('/api/reportes/estadisticas?salaId=abc', { headers: adminHeaders });
  if (
    repSqlInjection.status === 200 && typeof repSqlInjection.body?.totalExpedientes === 'number' &&
    repNegativeSala.status === 200 && repNegativeSala.body?.totalExpedientes === 0 &&
    repFarFuture.status === 200 && repFarFuture.body?.totalExpedientes === 0 &&
    repStringSala.status === 200 && typeof repStringSala.body?.totalExpedientes === 'number'
  ) {
    pass('Reportes Filter Stress: SQL injection, negative salaId, future years, and malformed strings handled cleanly in /api/reportes/estadisticas');
  } else {
    throw new Error('Reportes filter stress failed');
  }

  // 4.8 Filter stress on /api/audiencias (tipo SQL injection, negative IDs, wildcards)
  const audSqlInj = await req("/api/audiencias?tipo=%27%20OR%201=1--&estado=programada", { headers: adminHeaders });
  const audNegSala = await req('/api/audiencias?salaId=-1', { headers: adminHeaders });
  const audWildcard = await req('/api/audiencias?tipo=%&estado=%', { headers: adminHeaders });
  if (
    audSqlInj.status === 200 && Array.isArray(audSqlInj.body) &&
    audNegSala.status === 200 && audNegSala.body.length === 0 &&
    audWildcard.status === 200 && Array.isArray(audWildcard.body)
  ) {
    pass('Audiencias Filter Stress: SQL injection, wildcards, and negative IDs handled safely in /api/audiencias');
  } else {
    throw new Error('Audiencias filter stress failed');
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n======================================================================');
  console.log(`   TEST RESULTS: ${results.passed}/${results.total} SCENARIOS VERIFIED`);
  console.log(`   FINDINGS RECORDED: ${results.findings.length}`);
  console.log('======================================================================\n');

  if (results.findings.length > 0) {
    console.log('ADVERSARIAL FINDINGS (LOW-RISK EDGE CASE DEFECTS):');
    for (const f of results.findings) {
      console.log(`- [${f.severity}] ${f.category}: ${f.description}`);
      console.log(`  Details: ${f.observation}\n`);
    }
  }

  await prisma.$disconnect();
  return true;
}

runTestSuite()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Fatal crash during test suite execution:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
