/**
 * tests/challenger2_impersonation_security.test.mjs
 * =============================================================================
 * Challenger 2: Empirical Impersonation & Security Adversarial Test Harness
 * 
 * Scope:
 * 1. Unauthorized Impersonation Rejection (403 Forbidden across all non-admin roles)
 * 2. Unauthenticated Impersonation Rejection (401 Unauthorized)
 * 3. Input Validation & Malformed Payload Fuzzing on /api/auth/impersonate (400 / 404)
 * 4. Self-Impersonation Prevention (400 Bad Request)
 * 5. Inactive / Suspended Target User Impersonation Prevention (400 Bad Request)
 * 6. Authorized Global Admin Impersonation (200 OK + Target Scope)
 * 7. Active Context Switching Verification on /api/auth/me (ID, role, permisos, isImpersonated)
 * 8. Nested Impersonation Rejection (403 Forbidden when calling impersonate while impersonating)
 * 9. Impersonation Revert Flow (/api/auth/revert & /api/auth/impersonate/revert) (200 OK + restored admin)
 * 10. Invalid Revert Rejection (400 Bad Request when not in impersonation mode)
 * 11. Impersonation Lifecycle with Session Logout & Clean Revocation
 * 12. Rapid Impersonate-Revert Cycling Stress (Concurrency & Idempotency)
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

async function runChallenger2Suite() {
  console.log('\n\x1b[36m====================================================================\x1b[0m');
  console.log('\x1b[1mCHALLENGER 2: EMPIRICAL IMPERSONATION & SECURITY ADVERSARIAL HARNESS\x1b[0m');
  console.log('\x1b[36m====================================================================\x1b[0m\n');

  // Authenticate test accounts
  const adminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
  });
  if (adminLogin.status !== 200 || !adminLogin.body.token) {
    throw new Error(`Failed to login as admin: ${JSON.stringify(adminLogin.body)}`);
  }
  const adminToken = adminLogin.body.token;
  const adminUser = adminLogin.body.usuario;

  const consultaLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'consulta@tjabcs.gob.mx', password: 'password123' },
  });
  const consultaToken = consultaLogin.body.token;
  const consultaUser = consultaLogin.body.usuario;

  const magistradoLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'magistrado1@tjabcs.gob.mx', password: 'password123' },
  });
  const magistradoToken = magistradoLogin.body.token;
  const magistradoUser = magistradoLogin.body.usuario;

  const secretarioLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'secretario1@tjabcs.gob.mx', password: 'password123' },
  });
  const secretarioToken = secretarioLogin.body.token;
  const secretarioUser = secretarioLogin.body.usuario;

  // ---------------------------------------------------------------------------
  // SECTION 1: UNAUTHORIZED & UNAUTHENTICATED IMPERSONATION REJECTIONS
  // ---------------------------------------------------------------------------
  console.log('--- 1. UNAUTHORIZED & UNAUTHENTICATED IMPERSONATION ATTEMPTS ---');

  // 1.1 Unauthenticated request (no token)
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      body: { targetUserId: consultaUser.id },
    });
    if (res.status === 401) {
      pass('Unauthenticated impersonation rejected with 401 Unauthorized');
    } else {
      fail('Unauthenticated impersonation', `Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail('Unauthenticated impersonation', e.message);
  }

  // 1.2 Malformed / garbage bearer token
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: 'Bearer totally_bogus_token_value_9999' },
      body: { targetUserId: consultaUser.id },
    });
    if (res.status === 401) {
      pass('Impersonation with invalid token rejected with 401 Unauthorized');
    } else {
      fail('Invalid token impersonation', `Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail('Invalid token impersonation', e.message);
  }

  // 1.3 Non-admin role: Consulta/Dirección
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { targetUserId: adminUser.id },
    });
    if (res.status === 403 && res.body.error?.includes('sólo el Administrador Global')) {
      pass('Non-admin (Consulta/Dirección) impersonation attempt blocked with 403 Forbidden');
    } else {
      fail('Consulta impersonation', `Expected 403 with standard error, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Consulta impersonation', e.message);
  }

  // 1.4 Non-admin role: Magistrado/Sala
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${magistradoToken}` },
      body: { targetUserId: consultaUser.id },
    });
    if (res.status === 403 && res.body.error?.includes('sólo el Administrador Global')) {
      pass('Non-admin (Magistrado/Sala) impersonation attempt blocked with 403 Forbidden');
    } else {
      fail('Magistrado impersonation', `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Magistrado impersonation', e.message);
  }

  // 1.5 Non-admin role: Secretario de Acuerdos
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretarioToken}` },
      body: { targetUserId: magistradoUser.id },
    });
    if (res.status === 403 && res.body.error?.includes('sólo el Administrador Global')) {
      pass('Non-admin (Secretario de Acuerdos) impersonation attempt blocked with 403 Forbidden');
    } else {
      fail('Secretario impersonation', `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Secretario impersonation', e.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: ADVERSARIAL INPUT VALIDATION & BOUNDARY TESTING
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. ADVERSARIAL INPUT VALIDATION & BOUNDARY TESTING ---');

  // 2.1 Missing body
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {},
    });
    if (res.status === 400 && res.body.error?.includes('requerido')) {
      pass('Missing targetUserId rejected with 400 Bad Request');
    } else {
      fail('Missing targetUserId', `Expected 400, got ${res.status}`);
    }
  } catch (e) {
    fail('Missing targetUserId', e.message);
  }

  // 2.2 Non-numeric string targetUserId
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: 'invalid_user_id' },
    });
    if (res.status === 400) {
      pass('Non-numeric targetUserId ("invalid_user_id") rejected with 400 Bad Request');
    } else {
      fail('Non-numeric targetUserId', `Expected 400, got ${res.status}`);
    }
  } catch (e) {
    fail('Non-numeric targetUserId', e.message);
  }

  // 2.3 SQL injection payload in targetUserId
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: '1 OR 1=1' },
    });
    // In JS Number('1 OR 1=1') is NaN -> returns 400
    if (res.status === 400) {
      pass('SQL injection string in targetUserId rejected with 400 Bad Request');
    } else {
      fail('SQL injection in targetUserId', `Expected 400, got ${res.status}`);
    }
  } catch (e) {
    fail('SQL injection in targetUserId', e.message);
  }

  // 2.4 Self-impersonation (Admin targets own ID)
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: adminUser.id },
    });
    if (res.status === 400 && res.body.error?.includes('su propia cuenta')) {
      pass('Self-impersonation of Admin by Admin rejected with 400 Bad Request');
    } else {
      fail('Self-impersonation', `Expected 400 with self-impersonation error, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Self-impersonation', e.message);
  }

  // 2.5 Non-existent target user ID
  try {
    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: 999999 },
    });
    if (res.status === 404 && res.body.error?.includes('no encontrado')) {
      pass('Non-existent targetUserId (999999) rejected with 404 Not Found');
    } else {
      fail('Non-existent targetUserId', `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Non-existent targetUserId', e.message);
  }

  // 2.6 Inactive / suspended target user
  let inactiveUserId = null;
  try {
    const rolConsulta = await prisma.rol.findFirst({ where: { nombre: 'Consulta/Dirección' } });
    const inactiveUser = await prisma.usuario.create({
      data: {
        nombre: 'Inactive Adversarial User',
        correo: 'inactive_adv@tjabcs.gob.mx',
        password: 'password123',
        rolId: rolConsulta.id,
        activo: false,
      },
    });
    inactiveUserId = inactiveUser.id;

    const res = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: inactiveUserId },
    });
    if (res.status === 400 && res.body.error?.includes('inactivo o suspendido')) {
      pass('Impersonation of suspended/inactive user rejected with 400 Bad Request');
    } else {
      fail('Inactive target impersonation', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Inactive target impersonation', e.message);
  } finally {
    if (inactiveUserId) {
      await prisma.usuario.delete({ where: { id: inactiveUserId } }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: VALID IMPERSONATION FLOW & ACTIVE SCOPING
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. VALID IMPERSONATION FLOW & ACTIVE SCOPING ---');

  // Create a dedicated admin session for the impersonation lifecycle test
  const lifecycleAdminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
  });
  const lifecycleToken = lifecycleAdminLogin.body.token;

  // 3.1 Global Admin successfully impersonates Consulta user
  try {
    const impRes = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
      body: { targetUserId: consultaUser.id },
    });

    if (
      impRes.status === 200 &&
      impRes.body.token === lifecycleToken &&
      impRes.body.isImpersonated === true &&
      impRes.body.usuario?.id === consultaUser.id &&
      impRes.body.usuario?.correo === consultaUser.correo &&
      impRes.body.usuario?.rol === 'Consulta/Dirección' &&
      Array.isArray(impRes.body.permisos) &&
      impRes.body.permisos.length === 2 &&
      impRes.body.permisos.includes('expedientes:view') &&
      impRes.body.permisos.includes('catalogos:view') &&
      !impRes.body.permisos.includes('impersonate:use') &&
      impRes.body.originalAdmin?.id === adminUser.id &&
      impRes.body.originalAdmin?.correo === adminUser.correo
    ) {
      pass('Global Admin valid impersonation succeeds (200 OK, target scope, originalAdmin preserved)');
    } else {
      fail('Valid impersonation', `Unexpected response: ${impRes.status}, body: ${JSON.stringify(impRes.body)}`);
    }
  } catch (e) {
    fail('Valid impersonation', e.message);
  }

  // 3.2 Active context verification via GET /api/auth/me
  try {
    const meRes = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${lifecycleToken}` },
    });

    if (
      meRes.status === 200 &&
      meRes.body.isImpersonated === true &&
      meRes.body.usuario?.id === consultaUser.id &&
      meRes.body.usuario?.correo === consultaUser.correo &&
      meRes.body.usuario?.rol === 'Consulta/Dirección' &&
      Array.isArray(meRes.body.permisos) &&
      meRes.body.permisos.length === 2 &&
      !meRes.body.permisos.includes('impersonate:use') &&
      meRes.body.originalAdmin?.id === adminUser.id &&
      meRes.body.originalAdmin?.correo === adminUser.correo
    ) {
      pass('GET /api/auth/me reflects active impersonated context (target ID, role, permissions, originalAdmin)');
    } else {
      fail('Impersonated /me context', `Unexpected /me data: ${JSON.stringify(meRes.body)}`);
    }
  } catch (e) {
    fail('Impersonated /me context', e.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 4: NESTED IMPERSONATION ADVERSARIAL BLOCKING
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. NESTED IMPERSONATION ADVERSARIAL BLOCKING ---');

  // 4.1 While impersonating, attempt to impersonate another user (Magistrado)
  try {
    const nestedRes = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
      body: { targetUserId: magistradoUser.id },
    });

    if (nestedRes.status === 403 && nestedRes.body.error?.includes('sólo el Administrador Global')) {
      pass('Nested impersonation attempt (target: Magistrado) strictly blocked with 403 Forbidden');
    } else {
      fail('Nested impersonation', `Expected 403, got ${nestedRes.status}: ${JSON.stringify(nestedRes.body)}`);
    }
  } catch (e) {
    fail('Nested impersonation', e.message);
  }

  // 4.2 While impersonating, attempt to impersonate Admin
  try {
    const nestedAdminRes = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
      body: { targetUserId: adminUser.id },
    });

    if (nestedAdminRes.status === 403) {
      pass('Nested impersonation attempt (target: Admin) strictly blocked with 403 Forbidden');
    } else {
      fail('Nested impersonation targeting admin', `Expected 403, got ${nestedAdminRes.status}`);
    }
  } catch (e) {
    fail('Nested impersonation targeting admin', e.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: REVERT FLOW & RESTORATION OF ORIGINAL ADMIN
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. REVERT FLOW & CONTEXT RESTORATION ---');

  // 5.1 Revert via POST /api/auth/revert
  try {
    const revertRes = await req('/api/auth/revert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
    });

    if (
      revertRes.status === 200 &&
      revertRes.body.token === lifecycleToken &&
      revertRes.body.isImpersonated === false &&
      revertRes.body.originalAdmin === null &&
      revertRes.body.usuario?.id === adminUser.id &&
      revertRes.body.usuario?.correo === adminUser.correo &&
      revertRes.body.usuario?.rol === 'Administrador' &&
      Array.isArray(revertRes.body.permisos) &&
      revertRes.body.permisos.length === 13 &&
      revertRes.body.permisos.includes('impersonate:use')
    ) {
      pass('POST /api/auth/revert successfully restores Global Admin identity and 13 permissions (200 OK)');
    } else {
      fail('POST /api/auth/revert', `Unexpected revert response: ${revertRes.status}: ${JSON.stringify(revertRes.body)}`);
    }
  } catch (e) {
    fail('POST /api/auth/revert', e.message);
  }

  // 5.2 Verification of restored context via GET /api/auth/me
  try {
    const postRevertMe = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${lifecycleToken}` },
    });

    if (
      postRevertMe.status === 200 &&
      postRevertMe.body.isImpersonated === false &&
      postRevertMe.body.originalAdmin === null &&
      postRevertMe.body.usuario?.id === adminUser.id &&
      postRevertMe.body.usuario?.correo === adminUser.correo &&
      postRevertMe.body.usuario?.rol === 'Administrador' &&
      postRevertMe.body.permisos.includes('impersonate:use')
    ) {
      pass('GET /api/auth/me confirms session fully restored to original Admin context (isImpersonated: false)');
    } else {
      fail('Post-revert /me', `Unexpected /me data post-revert: ${JSON.stringify(postRevertMe.body)}`);
    }
  } catch (e) {
    fail('Post-revert /me', e.message);
  }

  // 5.3 Calling revert when NOT impersonating (should fail with 400 Bad Request)
  try {
    const redundantRevertRes = await req('/api/auth/revert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
    });

    if (
      redundantRevertRes.status === 400 &&
      redundantRevertRes.body.error?.includes('no está en modo de suplantación')
    ) {
      pass('Calling /api/auth/revert when NOT impersonating properly rejected with 400 Bad Request');
    } else {
      fail('Redundant revert', `Expected 400, got ${redundantRevertRes.status}: ${JSON.stringify(redundantRevertRes.body)}`);
    }
  } catch (e) {
    fail('Redundant revert', e.message);
  }

  // 5.4 Calling revert without token
  try {
    const unauthRevert = await req('/api/auth/revert', { method: 'POST' });
    if (unauthRevert.status === 401) {
      pass('Calling /api/auth/revert without Bearer token rejected with 401 Unauthorized');
    } else {
      fail('Unauth revert', `Expected 401, got ${unauthRevert.status}`);
    }
  } catch (e) {
    fail('Unauth revert', e.message);
  }

  // 5.5 Verify alias route POST /api/auth/impersonate/revert
  try {
    // Impersonate Magistrado
    const impMag = await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
      body: { targetUserId: magistradoUser.id },
    });
    if (impMag.status !== 200) {
      throw new Error(`Failed to impersonate Magistrado: ${JSON.stringify(impMag.body)}`);
    }

    // Call alias /api/auth/impersonate/revert
    const aliasRevert = await req('/api/auth/impersonate/revert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
    });

    if (
      aliasRevert.status === 200 &&
      aliasRevert.body.isImpersonated === false &&
      aliasRevert.body.usuario?.correo === adminUser.correo
    ) {
      pass('Aliased route POST /api/auth/impersonate/revert works identically and restores admin (200 OK)');
    } else {
      fail('Alias revert route', `Expected 200 restored admin, got ${aliasRevert.status}: ${JSON.stringify(aliasRevert.body)}`);
    }
  } catch (e) {
    fail('Alias revert route', e.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 6: ADVERSARIAL STRESS & RAPID CYCLING
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. ADVERSARIAL STRESS & RAPID IMPERSONATE-REVERT CYCLING ---');

  // 6.1 Rapid 10x Impersonate -> Revert cycle without session corruption
  try {
    let cycleSuccess = true;
    for (let i = 0; i < 10; i++) {
      // Impersonate
      const imp = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lifecycleToken}` },
        body: { targetUserId: consultaUser.id },
      });
      if (imp.status !== 200 || !imp.body.isImpersonated) {
        cycleSuccess = false;
        fail(`Rapid cycle [${i}] impersonate`, `Status: ${imp.status}`);
        break;
      }

      // Revert
      const rev = await req('/api/auth/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lifecycleToken}` },
      });
      if (rev.status !== 200 || rev.body.isImpersonated) {
        cycleSuccess = false;
        fail(`Rapid cycle [${i}] revert`, `Status: ${rev.status}`);
        break;
      }
    }
    if (cycleSuccess) {
      pass('10 consecutive rapid Impersonate -> Revert cycles completed without session corruption');
    }
  } catch (e) {
    fail('Rapid cycling stress', e.message);
  }

  // 6.2 Logout while impersonated cleanly revokes the session
  try {
    // Impersonate Secretario
    await req('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
      body: { targetUserId: secretarioUser.id },
    });

    // Call logout
    const logoutRes = await req('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lifecycleToken}` },
    });

    if (logoutRes.status === 200) {
      // Verify session is dead
      const postLogoutMe = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${lifecycleToken}` },
      });
      if (postLogoutMe.status === 401) {
        pass('Logging out while in impersonation mode terminates session immediately (subsequent /me yields 401)');
      } else {
        fail('Post-impersonation logout /me', `Expected 401, got ${postLogoutMe.status}`);
      }
    } else {
      fail('Logout during impersonation', `Expected 200, got ${logoutRes.status}`);
    }
  } catch (e) {
    fail('Logout during impersonation', e.message);
  }

  // Clean up test sessions
  await prisma.session.deleteMany({
    where: {
      token: { in: [adminToken, consultaToken, magistradoToken, secretarioToken, lifecycleToken] },
    },
  });

  await prisma.$disconnect();

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
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

runChallenger2Suite().catch(async (e) => {
  console.error('\x1b[31mFatal error in Challenger 2 test runner:\x1b[0m', e);
  await prisma.$disconnect();
  process.exit(1);
});
