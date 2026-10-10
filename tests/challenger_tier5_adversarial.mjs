/**
 * tests/challenger_tier5_adversarial.mjs
 * =============================================================================
 * Tier 5 Adversarial Coverage Hardening — White-box Security Analysis
 * Empirical Attack Harness for TJA BCS Authentication & Authorization System
 * =============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}${detail ? ` -> ${detail}` : ''}`);
    results.push({ name: testName, ok: true, detail });
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    results.push({ name: testName, ok: false, detail });
  }
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };
  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOptions);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = { raw: await res.text() };
    }
  } else {
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTier5SecuritySuite() {
  console.log('\n======================================================================');
  console.log('   TIER 5 ADVERSARIAL COVERAGE HARDENING — SECURITY HARNESS');
  console.log('======================================================================\n');

  // 1. Authenticate Admin and Non-Admin
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
  });
  assert(adminLogin.status === 200 && adminLogin.data?.token, 'ADV-01: Admin login returns 200 and token');
  const adminToken = adminLogin.data?.token;
  const adminId = adminLogin.data?.usuario?.id;

  const consultaLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { correo: 'consulta@tjabcs.gob.mx', password: 'password123' },
  });
  assert(consultaLogin.status === 200 && consultaLogin.data?.token, 'ADV-02: Non-admin login returns 200 and token');
  const consultaToken = consultaLogin.data?.token;
  const consultaId = consultaLogin.data?.usuario?.id;

  // 2. Privilege Escalation: Non-admin attempts to impersonate
  const nonAdminImpersonate = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${consultaToken}` },
    body: { targetUserId: adminId },
  });
  assert(
    nonAdminImpersonate.status === 403,
    'ADV-03: Non-admin impersonation attempt rejected with 403 Forbidden',
    nonAdminImpersonate.data?.error
  );

  // 3. Privilege Escalation: Non-admin attempts to revert when not impersonated
  const nonAdminRevert = await api('/api/auth/revert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${consultaToken}` },
  });
  assert(
    nonAdminRevert.status === 400,
    'ADV-04: Non-impersonated session calling revert rejected with 400 Bad Request',
    nonAdminRevert.data?.error
  );

  // 4. Edge Case: Self-impersonation by Admin
  const selfImpersonate = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { targetUserId: adminId },
  });
  assert(
    selfImpersonate.status === 400,
    'ADV-05: Admin self-impersonation rejected with 400 Bad Request',
    selfImpersonate.data?.error
  );

  // 5. Impersonation of non-existent user
  const nonExistentImpersonate = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { targetUserId: 999999 },
  });
  assert(
    nonExistentImpersonate.status === 404,
    'ADV-06: Impersonating non-existent user rejected with 404 Not Found',
    nonExistentImpersonate.data?.error
  );

  // 6. Impersonation of user with invalid ID format
  const badIdImpersonate = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { targetUserId: 'not-a-number' },
  });
  assert(
    badIdImpersonate.status === 400,
    'ADV-07: Impersonating with non-numeric targetUserId rejected with 400 Bad Request',
    badIdImpersonate.data?.error
  );

  // 7. Admin successfully impersonates Consulta user
  const impRes = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { targetUserId: consultaId },
  });
  assert(impRes.status === 200 && impRes.data?.isImpersonated === true, 'ADV-08: Admin impersonation succeeds with 200 OK');
  const impToken = impRes.data?.token;

  // 8. Privilege Escalation under active impersonation: Nested impersonation
  const nestedImp = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${impToken}` },
    body: { targetUserId: adminId },
  });
  assert(
    nestedImp.status === 403,
    'ADV-09: Nested impersonation blocked with 403 Forbidden under active impersonation',
    nestedImp.data?.error
  );

  // 9. Privilege Escalation under active impersonation: Calling role management
  const roleManageImp = await api('/api/roles/1/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${impToken}` },
    body: { permisoIds: [1, 2] },
  });
  assert(
    roleManageImp.status === 403,
    'ADV-10: Impersonated session forbidden from mutating roles (403 Forbidden)',
    roleManageImp.data?.error
  );

  // 10. Privilege Escalation under active impersonation: Creating user
  const createUserImp = await api('/api/usuarios', {
    method: 'POST',
    headers: { Authorization: `Bearer ${impToken}` },
    body: { nombre: 'Hacker', correo: 'hacker@test.com', password: '123', rolId: 1 },
  });
  assert(
    createUserImp.status === 403,
    'ADV-11: Impersonated session forbidden from creating users (403 Forbidden)',
    createUserImp.data?.error
  );

  // 11. Privilege Escalation under active impersonation: Suspending admin
  const suspendAdminImp = await api(`/api/usuarios/${adminId}/suspender`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${impToken}` },
  });
  assert(
    suspendAdminImp.status === 403,
    'ADV-12: Impersonated session forbidden from suspending users (403 Forbidden)',
    suspendAdminImp.data?.error
  );

  // 12. Privilege Escalation under active impersonation: Deleting admin
  const deleteAdminImp = await api(`/api/usuarios/${adminId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${impToken}` },
  });
  assert(
    deleteAdminImp.status === 403,
    'ADV-13: Impersonated session forbidden from deleting users (403 Forbidden)',
    deleteAdminImp.data?.error
  );

  // 13. Revert Impersonation restoration check
  const revertRes = await api('/api/auth/revert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${impToken}` },
  });
  assert(revertRes.status === 200 && revertRes.data?.isImpersonated === false, 'ADV-14: Impersonation reverted successfully to Admin');

  // 14. Double Revert attack: Calling revert again on already reverted session
  const doubleRevert = await api('/api/auth/revert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${impToken}` },
  });
  assert(
    doubleRevert.status === 400,
    'ADV-15: Immediate double-revert rejected with 400 Bad Request',
    doubleRevert.data?.error
  );

  // 15. Token Tampering Attacks
  const nullToken = await api('/api/auth/me', {
    headers: { Authorization: 'Bearer ' },
  });
  assert(nullToken.status === 401, 'ADV-16: Empty Bearer token rejected with 401');

  const sqliToken = await api('/api/auth/me', {
    headers: { Authorization: "Bearer ' OR '1'='1" },
  });
  assert(sqliToken.status === 401, 'ADV-17: SQLi string in Bearer token rejected with 401');

  const basicAuth = await api('/api/auth/me', {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  assert(basicAuth.status === 401, 'ADV-18: Non-Bearer auth scheme rejected with 401');

  const traversalToken = await api('/api/auth/me', {
    headers: { Authorization: 'Bearer ../../../etc/passwd' },
  });
  assert(traversalToken.status === 401, 'ADV-19: Path traversal in Bearer token rejected with 401');

  // 16. Admin Lockout Hardening: Stripping locked admin permissions
  const stripManage = await api('/api/roles/1/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { permisoCodigos: ['expedientes:view', 'impersonate:use'] }, // missing roles:manage
  });
  assert(
    stripManage.status === 400 && stripManage.data?.error?.includes('roles:manage'),
    'ADV-20: Stripping roles:manage from Admin blocked by lockout defense (400 Bad Request)',
    stripManage.data?.error
  );

  const stripImpersonate = await api('/api/roles/1/permisos', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { permisoCodigos: ['expedientes:view', 'roles:manage'] }, // missing impersonate:use
  });
  assert(
    stripImpersonate.status === 400 && stripImpersonate.data?.error?.includes('impersonate:use'),
    'ADV-21: Stripping impersonate:use from Admin blocked by lockout defense (400 Bad Request)',
    stripImpersonate.data?.error
  );

  // 17. Self-account protection on admin account
  const selfDelete = await api(`/api/usuarios/${adminId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    selfDelete.status === 400,
    'ADV-22: Self-deletion of admin account blocked with 400 Bad Request',
    selfDelete.data?.error
  );

  const selfSuspend = await api(`/api/usuarios/${adminId}/suspender`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    selfSuspend.status === 400,
    'ADV-23: Self-suspension of admin account blocked with 400 Bad Request',
    selfSuspend.data?.error
  );

  // Summary
  console.log('\n======================================================================');
  console.log(`   TIER 5 RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTier5SecuritySuite().catch((e) => {
  console.error('Fatal error in Tier 5 security test:', e);
  process.exit(1);
});
