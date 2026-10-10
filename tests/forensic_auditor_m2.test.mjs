/**
 * tests/forensic_auditor_m2.test.mjs
 * =============================================================================
 * Independent Forensic Audit Test Suite for Milestone 2
 * Author: Forensic Auditor (auditor_m2)
 *
 * Verifies:
 * 1. User scoping fidelity in SQLite audit trail (req.user.id vs hardcoded/spoofed IDs)
 * 2. Impersonated user scoping fidelity in SQLite audit trail
 * 3. Genuine Prisma transactional persistence in SQLite (RolPermiso table)
 * 4. 100% Unauthenticated coverage across all 15 endpoints + 4 role endpoints (401 Unauthorized)
 * 5. Password redaction on user/catalogs endpoints
 * 6. Adversarial token & header bypass probing
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

async function login(correo, password) {
  const res = await req('/api/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  if (res.status !== 200 || !res.body?.token) {
    throw new Error(`Login failed for ${correo}: HTTP ${res.status}`);
  }
  return res.body;
}

async function runForensicAudit() {
  console.log('\n\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1mINDEPENDENT FORENSIC INTEGRITY AUDIT — MILESTONE 2\x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m\n');

  // Logins for test roles
  const adminAuth = await login('admin@tjabcs.gob.mx', 'password123');
  const magistradoAuth = await login('magistrado1@tjabcs.gob.mx', 'password123');
  const secretarioAuth = await login('secretario1@tjabcs.gob.mx', 'password123');
  const consultaAuth = await login('consulta@tjabcs.gob.mx', 'password123');

  // ===========================================================================
  // FORENSIC CHECK 1: USER SCOPING FIDELITY IN SQLITE AUDIT TRAIL
  // ===========================================================================
  console.log('--- FORENSIC CHECK 1: USER SCOPING FIDELITY (req.user!.id in SQLite) ---');

  // Test 1.1: Create expediente as Secretario (ID 7) with spoofed usuarioId: 9999
  const uniqueFolio = `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const createRes = await req('/api/expedientes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretarioAuth.token}` },
    body: {
      folio: uniqueFolio,
      consecutivo: 9999,
      anio: 2026,
      fechaIngreso: new Date().toISOString(),
      tipoAsuntoId: 1,
      leyId: 1,
      salaId: 1,
      estatusId: 1,
      subEstatusId: 1,
      usuarioId: 9999, // Attempted spoof
    },
  });

  if (createRes.status === 201 && createRes.body?.id) {
    const createdExpId = createRes.body.id;
    // Directly query SQLite via Prisma
    const auditRecord = await prisma.movimientoEstatus.findFirst({
      where: { expedienteId: createdExpId, notas: 'Apertura de expediente' },
    });

    if (auditRecord && auditRecord.usuarioId === secretarioAuth.usuario.id) {
      pass(
        'POST /api/expedientes user scoping: actorUsuarioId matches req.user.id in SQLite',
        `Secretario ID ${secretarioAuth.usuario.id} recorded. Spoofed 9999 ignored.`
      );
    } else {
      fail(
        'POST /api/expedientes user scoping',
        `Expected SQLite usuarioId ${secretarioAuth.usuario.id}, found ${auditRecord?.usuarioId}`
      );
    }

    // Test 1.2: Status change as Magistrado (ID 6) with spoofed usuarioId: 8888
    const statusRes = await req(`/api/expedientes/${createdExpId}/estatus`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${magistradoAuth.token}` },
      body: {
        nuevoEstatusId: 2,
        nuevoSubEstatusId: 1,
        notas: 'Forensic Audit Status Transition',
        usuarioId: 8888, // Attempted spoof
      },
    });

    if (statusRes.status === 200) {
      const statusAudit = await prisma.movimientoEstatus.findFirst({
        where: {
          expedienteId: createdExpId,
          notas: 'Forensic Audit Status Transition',
        },
      });

      if (statusAudit && statusAudit.usuarioId === magistradoAuth.usuario.id) {
        pass(
          'PUT /api/expedientes/:id/estatus user scoping: actorUsuarioId matches req.user.id in SQLite',
          `Magistrado ID ${magistradoAuth.usuario.id} recorded. Spoofed 8888 ignored.`
        );
      } else {
        fail(
          'PUT /api/expedientes/:id/estatus user scoping',
          `Expected SQLite usuarioId ${magistradoAuth.usuario.id}, found ${statusAudit?.usuarioId}`
        );
      }
    } else {
      fail('PUT /api/expedientes/:id/estatus execution', `Status code: ${statusRes.status}`);
    }

    // Clean up created test expediente & movimientos
    await prisma.movimientoEstatus.deleteMany({ where: { expedienteId: createdExpId } });
    await prisma.expediente.delete({ where: { id: createdExpId } });
  } else {
    fail('POST /api/expedientes creation', `Status code: ${createRes.status}`);
  }

  // Test 1.3: Impersonation Scoping in SQLite
  // Admin impersonates Secretario, then performs an action
  const impRes = await req('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
    body: { targetUserId: secretarioAuth.usuario.id },
  });

  if (impRes.status === 200 && impRes.body?.token) {
    const impToken = impRes.body.token;
    const impFolio = `AUDIT-IMP-${Date.now()}`;
    const impCreateRes = await req('/api/expedientes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${impToken}` },
      body: {
        folio: impFolio,
        consecutivo: 9998,
        anio: 2026,
        fechaIngreso: new Date().toISOString(),
        tipoAsuntoId: 1,
        leyId: 1,
        salaId: 1,
        estatusId: 1,
        subEstatusId: 1,
        usuarioId: adminAuth.usuario.id, // Attempt to claim admin did it
      },
    });

    if (impCreateRes.status === 201 && impCreateRes.body?.id) {
      const impExpId = impCreateRes.body.id;
      const impAudit = await prisma.movimientoEstatus.findFirst({
        where: { expedienteId: impExpId },
      });

      if (impAudit && impAudit.usuarioId === secretarioAuth.usuario.id) {
        pass(
          'Impersonated session writes target userId to SQLite audit trail, not admin ID',
          `Recorded usuarioId ${impAudit.usuarioId} (Secretario). Target scope verified.`
        );
      } else {
        fail(
          'Impersonated session audit trail',
          `Expected usuarioId ${secretarioAuth.usuario.id}, got ${impAudit?.usuarioId}`
        );
      }

      await prisma.movimientoEstatus.deleteMany({ where: { expedienteId: impExpId } });
      await prisma.expediente.delete({ where: { id: impExpId } });
    } else {
      fail('Impersonated POST /api/expedientes', `Status: ${impCreateRes.status}`);
    }

    // Revert impersonation
    await req('/api/auth/revert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${impToken}` },
    });
  } else {
    fail('Impersonation setup for audit', `Status: ${impRes.status}`);
  }

  // ===========================================================================
  // FORENSIC CHECK 2: PRISMA TRANSACTION REALITY IN SQLITE
  // ===========================================================================
  console.log('\n--- FORENSIC CHECK 2: PRISMA TRANSACTION REALITY IN SQLITE ---');

  // Snapshot role 4 (Consulta) permissions directly from SQLite
  const initialRolPermisos = await prisma.rolPermiso.findMany({
    where: { rolId: 4 },
  });
  const initialPermisoIds = initialRolPermisos.map((rp) => rp.permisoId);

  // Update role 4 to empty permissions []
  const clearRes = await req('/api/roles/4/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
    body: { permisoIds: [] },
  });

  if (clearRes.status === 200) {
    const directCount = await prisma.rolPermiso.count({ where: { rolId: 4 } });
    if (directCount === 0) {
      pass(
        'PUT /api/roles/:id/permisos genuinely deleted rows from SQLite RolPermiso table',
        `Direct SQLite count: 0`
      );
    } else {
      fail('PUT /api/roles/:id/permisos deletion', `Expected count 0, found ${directCount}`);
    }
  } else {
    fail('PUT /api/roles/4/permisos empty list', `Status: ${clearRes.status}`);
  }

  // Test transactional rollback: pass invalid permission ID
  const invalidRes = await req('/api/roles/4/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
    body: { permisoIds: [999999] },
  });

  if (invalidRes.status === 400) {
    const directCountAfterError = await prisma.rolPermiso.count({ where: { rolId: 4 } });
    if (directCountAfterError === 0) {
      pass(
        'Transactional rollback preserved SQLite state on validation error',
        'Direct SQLite count remained 0'
      );
    } else {
      fail('Transactional rollback', `Count changed to ${directCountAfterError}`);
    }
  } else {
    fail('Invalid permission rejection', `Status: ${invalidRes.status}`);
  }

  // Restore initial permissions
  const restoreRes = await req('/api/roles/4/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
    body: { permisoIds: initialPermisoIds },
  });

  if (restoreRes.status === 200) {
    const restoredCount = await prisma.rolPermiso.count({ where: { rolId: 4 } });
    if (restoredCount === initialPermisoIds.length) {
      pass(
        'PUT /api/roles/:id/permisos genuinely recreated rows in SQLite RolPermiso table',
        `Direct SQLite count restored: ${restoredCount}`
      );
    } else {
      fail('Restoration count mismatch', `Expected ${initialPermisoIds.length}, got ${restoredCount}`);
    }
  } else {
    fail('Restoration of role permissions', `Status: ${restoreRes.status}`);
  }

  // ===========================================================================
  // FORENSIC CHECK 3: 100% ROUTE COVERAGE & UNAUTHENTICATED PROTECTION (401)
  // ===========================================================================
  console.log('\n--- FORENSIC CHECK 3: 100% ROUTE UNAUTHENTICATED PROTECTION (401) ---');

  const routesToTest = [
    { method: 'GET', path: '/api/expedientes' },
    { method: 'GET', path: '/api/expedientes/1' },
    { method: 'POST', path: '/api/expedientes', body: {} },
    { method: 'PUT', path: '/api/expedientes/1/estatus', body: {} },
    { method: 'POST', path: '/api/expedientes/1/recursos', body: {} },
    { method: 'GET', path: '/api/catalogos' },
    { method: 'GET', path: '/api/usuarios' },
    { method: 'POST', path: '/api/usuarios', body: {} },
    { method: 'GET', path: '/api/usuarios/1/actividad' },
    { method: 'GET', path: '/api/usuarios/1' },
    { method: 'PUT', path: '/api/usuarios/1', body: {} },
    { method: 'PATCH', path: '/api/usuarios/1/suspender' },
    { method: 'DELETE', path: '/api/usuarios/1' },
    { method: 'GET', path: '/api/dashboard/metricas' },
    { method: 'GET', path: '/api/actividad' },
    { method: 'GET', path: '/api/roles' },
    { method: 'GET', path: '/api/permisos' },
    { method: 'GET', path: '/api/roles/1' },
    { method: 'PUT', path: '/api/roles/1/permisos', body: {} },
  ];

  let unauthPassCount = 0;
  for (const r of routesToTest) {
    const res = await req(r.path, { method: r.method, body: r.body });
    if (res.status === 401) {
      unauthPassCount++;
    } else {
      fail(`Unauthenticated protection on ${r.method} ${r.path}`, `Expected 401, got ${res.status}`);
    }
  }

  if (unauthPassCount === routesToTest.length) {
    pass(
      `All ${routesToTest.length} system endpoints strictly require authentication`,
      `100% returned HTTP 401 Unauthorized`
    );
  }

  // ===========================================================================
  // FORENSIC CHECK 4: PASSWORD REDACTION IN RESPONSES
  // ===========================================================================
  console.log('\n--- FORENSIC CHECK 4: PASSWORD REDACTION AUDIT ---');

  const catRes = await req('/api/catalogos', {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  if (catRes.status === 200 && Array.isArray(catRes.body?.usuarios)) {
    const hasPassword = catRes.body.usuarios.some((u) => u.password !== undefined);
    if (!hasPassword) {
      pass('GET /api/catalogos redacts password field from all user records in response');
    } else {
      fail('GET /api/catalogos password leak', 'Password property present in user record');
    }
  } else {
    fail('GET /api/catalogos query', `Status: ${catRes.status}`);
  }

  const usrRes = await req('/api/usuarios', {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  if (usrRes.status === 200 && Array.isArray(usrRes.body)) {
    const hasPassword = usrRes.body.some((u) => u.password !== undefined);
    if (!hasPassword) {
      pass('GET /api/usuarios redacts password field from all user records in response');
    } else {
      fail('GET /api/usuarios password leak', 'Password property present in user record');
    }
  } else {
    fail('GET /api/usuarios query', `Status: ${usrRes.status}`);
  }

  // ===========================================================================
  // FORENSIC CHECK 5: ADVERSARIAL TOKEN & HEADER BYPASS PROBING
  // ===========================================================================
  console.log('\n--- FORENSIC CHECK 5: ADVERSARIAL BYPASS PROBING ---');

  const bypassAttempts = [
    { name: 'X-Bypass-Auth header', headers: { 'X-Bypass-Auth': 'true' } },
    { name: 'X-Admin-Role header', headers: { 'X-Admin-Role': 'Administrador' } },
    { name: 'Basic Auth format', headers: { Authorization: 'Basic YWRtaW46cGFzc3dvcmQ=' } },
    { name: 'Bearer with whitespace only', headers: { Authorization: 'Bearer    ' } },
    { name: 'Bearer undefined string', headers: { Authorization: 'Bearer undefined' } },
    { name: 'Bearer null string', headers: { Authorization: 'Bearer null' } },
    { name: 'Bearer SQL injection', headers: { Authorization: "Bearer ' OR '1'='1" } },
  ];

  for (const b of bypassAttempts) {
    const res = await req('/api/expedientes', { headers: b.headers });
    if (res.status === 401) {
      pass(`Bypass probe rejected: ${b.name}`, 'Returned 401 Unauthorized');
    } else {
      fail(`Bypass vulnerability: ${b.name}`, `Expected 401, received ${res.status}`);
    }
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1mFORENSIC AUDIT SUMMARY\x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m');
  console.log(`  Total Checks:  ${results.total}`);
  console.log(`  Passed Checks: \x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Checks: \x1b[31m${results.failed}\x1b[0m`);
  console.log(`  Pass Rate:     ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log('\x1b[35m====================================================================\x1b[0m\n');

  await prisma.$disconnect();

  if (results.failed > 0) {
    console.error('\x1b[31mVERDICT: INTEGRITY VIOLATION DETECTED!\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32mVERDICT: CLEAN — NO INTEGRITY VIOLATIONS DETECTED.\x1b[0m\n');
    process.exit(0);
  }
}

runForensicAudit().catch(async (err) => {
  console.error('Fatal audit failure:', err);
  await prisma.$disconnect();
  process.exit(1);
});
