/**
 * tests/auth_lifecycle.test.mjs
 * =============================================================================
 * Challenger 1: Milestone 1 Auth Lifecycle Empirical Test Suite & Stress Harness
 * =============================================================================
 */

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
  console.log(`  [PASS] ${name}${detail ? ' -> ' + detail : ''}`);
}

function fail(name, error) {
  results.total++;
  results.failed++;
  results.failures.push({ name, error });
  console.error(`  [FAIL] ${name} -> ERROR: ${error}`);
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

async function run() {
  console.log('====================================================================');
  console.log('CHALLENGER 1: EMPIRICAL VERIFICATION OF MILESTONE 1 AUTH LIFECYCLE');
  console.log('====================================================================\n');

  // -------------------------------------------------------------------------
  // 1. HAPPY PATH LOGIN - ALL 4 SEEDED ROLES
  // -------------------------------------------------------------------------
  console.log('--- 1. HAPPY PATH LOGIN (All 4 Seeded Roles) ---');
  let adminToken = null;
  let adminUserId = null;
  let consultaToken = null;
  let consultaUserId = null;
  let magistradoToken = null;
  let secretarioToken = null;

  // 1.1 Admin
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
    });
    if (
      res.status === 200 &&
      res.body.token &&
      typeof res.body.token === 'string' &&
      res.body.token.length === 64 &&
      res.body.usuario?.correo === 'admin@tjabcs.gob.mx' &&
      res.body.usuario?.rol === 'Administrador' &&
      Array.isArray(res.body.permisos) &&
      res.body.permisos.length === 13 &&
      res.body.permisos.includes('impersonate:use')
    ) {
      adminToken = res.body.token;
      adminUserId = res.body.usuario.id;
      pass('Admin Login (200 OK, 64-char token, 13 granular permissions)');
    } else {
      fail('Admin Login', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Admin Login', e.message);
  }

  // 1.2 Case-insensitive email login
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: '  ADMIN@TJaBCS.GOB.MX  ', password: 'password123' },
    });
    if (res.status === 200 && res.body.token) {
      pass('Login Email Normalization (trim and case-insensitivity supported)');
    } else {
      fail('Login Email Normalization', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Login Email Normalization', e.message);
  }

  // 1.3 Consulta
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'consulta@tjabcs.gob.mx', password: 'password123' },
    });
    if (
      res.status === 200 &&
      res.body.token &&
      res.body.usuario?.rol === 'Consulta/Dirección' &&
      res.body.permisos.length === 2 &&
      res.body.permisos.includes('expedientes:view') &&
      res.body.permisos.includes('catalogos:view') &&
      !res.body.permisos.includes('impersonate:use')
    ) {
      consultaToken = res.body.token;
      consultaUserId = res.body.usuario.id;
      pass('Consulta Login (200 OK, 2 granular permissions)');
    } else {
      fail('Consulta Login', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Consulta Login', e.message);
  }

  // 1.4 Magistrado
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'magistrado1@tjabcs.gob.mx', password: 'password123' },
    });
    if (
      res.status === 200 &&
      res.body.token &&
      res.body.usuario?.rol === 'Magistrado/Sala' &&
      res.body.permisos.length === 4
    ) {
      magistradoToken = res.body.token;
      pass('Magistrado Login (200 OK, 4 granular permissions)');
    } else {
      fail('Magistrado Login', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Magistrado Login', e.message);
  }

  // 1.5 Secretario
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'secretario1@tjabcs.gob.mx', password: 'password123' },
    });
    if (
      res.status === 200 &&
      res.body.token &&
      res.body.usuario?.rol === 'Secretario de Acuerdos' &&
      res.body.permisos.length === 5
    ) {
      secretarioToken = res.body.token;
      pass('Secretario Login (200 OK, 5 granular permissions)');
    } else {
      fail('Secretario Login', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Secretario Login', e.message);
  }

  // -------------------------------------------------------------------------
  // 2. BAD CREDENTIALS & PAYLOAD TAMPERING (Assert 401)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. BAD CREDENTIALS & MALFORMED PAYLOADS ---');

  // 2.1 Wrong password
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'admin@tjabcs.gob.mx', password: 'wrongpassword' },
    });
    if (res.status === 401 && res.body.error === 'Credenciales inválidas') {
      pass('Wrong password rejected with 401 and standard error');
    } else {
      fail('Wrong password', `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Wrong password', e.message);
  }

  // 2.2 Unknown user
  try {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'ghost@tjabcs.gob.mx', password: 'password123' },
    });
    if (res.status === 401 && res.body.error === 'Credenciales inválidas') {
      pass('Unknown email rejected with 401');
    } else {
      fail('Unknown email', `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    fail('Unknown email', e.message);
  }

  // 2.3 Empty / null / malformed payloads
  const badPayloads = [
    { title: 'Empty payload {}', body: {} },
    { title: 'Missing password', body: { correo: 'admin@tjabcs.gob.mx' } },
    { title: 'Missing correo', body: { password: 'password123' } },
    { title: 'Null values', body: { correo: null, password: null } },
    { title: 'Non-string types', body: { correo: 12345, password: true } },
    { title: 'SQL injection attempt in email', body: { correo: "' OR 1=1 --", password: 'password' } },
  ];

  for (const bp of badPayloads) {
    try {
      const res = await req('/api/auth/login', { method: 'POST', body: bp.body });
      if (res.status === 401) {
        pass(`Malformed Login: ${bp.title} rejected with 401`);
      } else {
        fail(`Malformed Login: ${bp.title}`, `Expected 401, got ${res.status}`);
      }
    } catch (e) {
      fail(`Malformed Login: ${bp.title}`, e.message);
    }
  }

  // -------------------------------------------------------------------------
  // 3. PROFILE ENDPOINT (/api/auth/me) & BEARER TOKEN CONTRACT
  // -------------------------------------------------------------------------
  console.log('\n--- 3. /api/auth/me PROFILE & BEARER CONTRACT ---');

  // 3.1 Valid Token /me
  if (adminToken) {
    try {
      const res = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (
        res.status === 200 &&
        res.body.usuario?.correo === 'admin@tjabcs.gob.mx' &&
        res.body.isImpersonated === false &&
        res.body.originalAdmin === null &&
        Array.isArray(res.body.permisos) &&
        res.body.permisos.length === 13
      ) {
        pass('GET /api/auth/me with valid Bearer token returns 200 & correct metadata');
      } else {
        fail('GET /api/auth/me valid token', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      fail('GET /api/auth/me valid token', e.message);
    }
  }

  // 3.2 Missing Authorization header
  try {
    const res = await req('/api/auth/me');
    if (res.status === 401 && res.body.error) {
      pass('GET /api/auth/me without Authorization header returns 401');
    } else {
      fail('GET /api/auth/me no auth header', `Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail('GET /api/auth/me no auth header', e.message);
  }

  // 3.3 Invalid / Garbage token
  try {
    const res = await req('/api/auth/me', {
      headers: { Authorization: 'Bearer random_garbage_hex_token_99999' },
    });
    if (res.status === 401) {
      pass('GET /api/auth/me with invalid token returns 401');
    } else {
      fail('GET /api/auth/me invalid token', `Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail('GET /api/auth/me invalid token', e.message);
  }

  // 3.4 Non-Bearer scheme
  try {
    const res = await req('/api/auth/me', {
      headers: { Authorization: `Basic ${Buffer.from('admin:pass').toString('base64')}` },
    });
    if (res.status === 401) {
      pass('GET /api/auth/me with Basic auth rejected with 401');
    } else {
      fail('GET /api/auth/me non-bearer', `Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail('GET /api/auth/me non-bearer', e.message);
  }

  // 3.5 Empty Bearer
  try {
    const res = await req('/api/auth/me', {
      headers: { Authorization: 'Bearer ' },
    });
    if (res.status === 401) {
      pass('GET /api/auth/me with empty Bearer rejected with 401');
    } else {
      fail('GET /api/auth/me empty bearer', `Expected 401, got ${res.status}`);
    }
  } catch (e) {
    fail('GET /api/auth/me empty bearer', e.message);
  }

  // -------------------------------------------------------------------------
  // 4. LOGOUT & IMMEDIATE SESSION REVOCATION
  // -------------------------------------------------------------------------
  console.log('\n--- 4. LOGOUT & IMMEDIATE REVOCATION ---');

  let disposableToken = null;
  try {
    // Log in fresh user to test logout
    const loginRes = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'magistrado1@tjabcs.gob.mx', password: 'password123' },
    });
    disposableToken = loginRes.body?.token;
  } catch (e) {
    fail('Disposable login setup', e.message);
  }

  if (disposableToken) {
    // 4.1 Verify it works before logout
    const preCheck = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${disposableToken}` },
    });
    if (preCheck.status === 200) {
      pass('Disposable token valid prior to logout');
    } else {
      fail('Disposable token pre-check', `Expected 200, got ${preCheck.status}`);
    }

    // 4.2 Execute Logout
    try {
      const logoutRes = await req('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${disposableToken}` },
      });
      if (logoutRes.status === 200 && logoutRes.body.message === 'Sesión cerrada exitosamente') {
        pass('POST /api/auth/logout returns 200 OK');
      } else {
        fail('POST /api/auth/logout', `Expected 200, got ${logoutRes.status}: ${JSON.stringify(logoutRes.body)}`);
      }
    } catch (e) {
      fail('POST /api/auth/logout', e.message);
    }

    // 4.3 Verify immediate invalidation on subsequent /api/auth/me
    try {
      const postCheck = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${disposableToken}` },
      });
      if (postCheck.status === 401) {
        pass('Subsequent GET /api/auth/me with revoked token rejected with 401');
      } else {
        fail('Subsequent GET /api/auth/me after logout', `Expected 401, but got ${postCheck.status}: ${JSON.stringify(postCheck.body)}`);
      }
    } catch (e) {
      fail('Subsequent GET /api/auth/me', e.message);
    }

    // 4.4 Repeat logout on already deleted session
    try {
      const repeatLogout = await req('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${disposableToken}` },
      });
      if (repeatLogout.status === 200) {
        pass('Idempotent logout on deleted session handled gracefully (200 OK)');
      } else {
        fail('Repeat logout', `Got ${repeatLogout.status}`);
      }
    } catch (e) {
      fail('Repeat logout', e.message);
    }
  }

  // 4.5 Logout without token returns 401
  try {
    const noTokenLogout = await req('/api/auth/logout', { method: 'POST' });
    if (noTokenLogout.status === 401) {
      pass('POST /api/auth/logout without token returns 401');
    } else {
      fail('POST /api/auth/logout without token', `Expected 401, got ${noTokenLogout.status}`);
    }
  } catch (e) {
    fail('POST /api/auth/logout without token', e.message);
  }

  // -------------------------------------------------------------------------
  // 5. IMPERSONATION ("VIEW AS") & REVERT CONTRACT
  // -------------------------------------------------------------------------
  console.log('\n--- 5. IMPERSONATION & REVERT LIFECYCLE ---');

  let impSessionToken = null;
  // 5.1 Non-admin impersonation rejection
  if (consultaToken) {
    try {
      const res = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${consultaToken}` },
        body: { targetUserId: 1 },
      });
      if (res.status === 403 && res.body.error?.includes('sólo el Administrador Global')) {
        pass('Non-admin impersonation denied with 403 Forbidden');
      } else {
        fail('Non-admin impersonation', `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      fail('Non-admin impersonation', e.message);
    }
  }

  // 5.2 Admin self-impersonation rejection
  if (adminToken && adminUserId) {
    try {
      const res = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { targetUserId: adminUserId },
      });
      if (res.status === 400 && res.body.error?.includes('propia cuenta')) {
        pass('Self-impersonation rejected with 400 Bad Request');
      } else {
        fail('Self-impersonation', `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      fail('Self-impersonation', e.message);
    }
  }

  // 5.3 Nonexistent target user rejection
  if (adminToken) {
    try {
      const res = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { targetUserId: 999999 },
      });
      if (res.status === 404) {
        pass('Impersonate nonexistent user rejected with 404 Not Found');
      } else {
        fail('Impersonate nonexistent user', `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      fail('Impersonate nonexistent user', e.message);
    }
  }

  // 5.4 Valid Global Admin Impersonation
  if (adminToken && consultaUserId) {
    try {
      const res = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { targetUserId: consultaUserId },
      });
      if (
        res.status === 200 &&
        res.body.token &&
        res.body.isImpersonated === true &&
        res.body.usuario?.correo === 'consulta@tjabcs.gob.mx' &&
        res.body.originalAdmin?.correo === 'admin@tjabcs.gob.mx' &&
        res.body.permisos.length === 2
      ) {
        impSessionToken = res.body.token;
        pass('Admin Impersonation successful (200 OK, target scope, originalAdmin set)');
      } else {
        fail('Admin Impersonation', `Status: ${res.status}, body: ${JSON.stringify(res.body)}`);
      }
    } catch (e) {
      fail('Admin Impersonation', e.message);
    }
  }

  // 5.5 Impersonation context reflected in /api/auth/me
  if (impSessionToken) {
    try {
      const meRes = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${impSessionToken}` },
      });
      if (
        meRes.status === 200 &&
        meRes.body.isImpersonated === true &&
        meRes.body.usuario?.correo === 'consulta@tjabcs.gob.mx' &&
        meRes.body.originalAdmin?.correo === 'admin@tjabcs.gob.mx'
      ) {
        pass('/api/auth/me reflects active impersonation state');
      } else {
        fail('Impersonated /me', `Status: ${meRes.status}, body: ${JSON.stringify(meRes.body)}`);
      }
    } catch (e) {
      fail('Impersonated /me', e.message);
    }

    // 5.6 Nested impersonation prevention
    try {
      const nestedRes = await req('/api/auth/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${impSessionToken}` },
        body: { targetUserId: 1 },
      });
      if (nestedRes.status === 403) {
        pass('Nested impersonation while impersonating blocked with 403 Forbidden');
      } else {
        fail('Nested impersonation', `Expected 403, got ${nestedRes.status}`);
      }
    } catch (e) {
      fail('Nested impersonation', e.message);
    }

    // 5.7 Revert Flow
    try {
      const revertRes = await req('/api/auth/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${impSessionToken}` },
      });
      if (
        revertRes.status === 200 &&
        revertRes.body.isImpersonated === false &&
        revertRes.body.originalAdmin === null &&
        revertRes.body.usuario?.correo === 'admin@tjabcs.gob.mx' &&
        revertRes.body.permisos.length === 13
      ) {
        pass('POST /api/auth/revert restores Admin identity and permissions (200 OK)');
      } else {
        fail('POST /api/auth/revert', `Status: ${revertRes.status}, body: ${JSON.stringify(revertRes.body)}`);
      }
    } catch (e) {
      fail('POST /api/auth/revert', e.message);
    }

    // 5.8 /me after revert reflects clean admin
    try {
      const mePostRevert = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${impSessionToken}` },
      });
      if (
        mePostRevert.status === 200 &&
        mePostRevert.body.isImpersonated === false &&
        mePostRevert.body.usuario?.correo === 'admin@tjabcs.gob.mx'
      ) {
        pass('/api/auth/me post-revert reflects normal admin session');
      } else {
        fail('/me post-revert', `Status: ${mePostRevert.status}, body: ${JSON.stringify(mePostRevert.body)}`);
      }
    } catch (e) {
      fail('/me post-revert', e.message);
    }

    // 5.9 Calling revert when NOT impersonating rejected with 400
    try {
      const invalidRevert = await req('/api/auth/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${impSessionToken}` },
      });
      if (invalidRevert.status === 400 && invalidRevert.body.error?.includes('no está en modo de suplantación')) {
        pass('Revert on non-impersonated session rejected with 400 Bad Request');
      } else {
        fail('Invalid revert', `Expected 400, got ${invalidRevert.status}: ${JSON.stringify(invalidRevert.body)}`);
      }
    } catch (e) {
      fail('Invalid revert', e.message);
    }
  }

  // -------------------------------------------------------------------------
  // 6. ADVERSARIAL STRESS & CONCURRENCY
  // -------------------------------------------------------------------------
  console.log('\n--- 6. ADVERSARIAL STRESS & CONCURRENCY ---');

  // 6.1 Multi-session independence: Logging in twice creates two valid independent tokens
  try {
    const l1 = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
    });
    const l2 = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
    });

    if (l1.body.token !== l2.body.token) {
      pass('Multi-session login generates distinct cryptographic tokens');

      // Logging out session 1
      await req('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${l1.body.token}` },
      });

      // Session 1 is 401
      const s1Check = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${l1.body.token}` },
      });
      // Session 2 is still 200
      const s2Check = await req('/api/auth/me', {
        headers: { Authorization: `Bearer ${l2.body.token}` },
      });

      if (s1Check.status === 401 && s2Check.status === 200) {
        pass('Logout of session 1 revokes only session 1; session 2 remains active');
      } else {
        fail('Multi-session revocation isolation', `s1: ${s1Check.status}, s2: ${s2Check.status}`);
      }

      // Cleanup session 2
      await req('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${l2.body.token}` },
      });
    } else {
      fail('Multi-session distinct tokens', 'Tokens were identical');
    }
  } catch (e) {
    fail('Multi-session independence', e.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log('CHALLENGER 1 VERIFICATION SUMMARY');
  console.log('====================================================================');
  console.log(`  Total:  ${results.total}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Rate:   ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log('====================================================================');

  if (results.failed > 0) {
    console.error(`\nFailures:`);
    results.failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL EMPIRICAL TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
