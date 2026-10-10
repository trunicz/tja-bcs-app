/**
 * test-m2-authorization.js
 * =============================================================================
 * Challenger 1 Empirical Test Suite: Milestone 2 Authorization & 403 Enforcement
 * 
 * Verifies:
 * 1. 401 Unauthorized for unauthenticated requests across all 23 backend endpoints
 * 2. 401 Unauthorized for malformed, empty, and invalid bearer tokens
 * 3. 403 Forbidden for 'consulta@tjabcs.gob.mx' across restricted operations:
 *    - POST /api/expedientes (lacks 'expedientes:create')
 *    - PUT /api/expedientes/1/estatus (lacks 'expedientes:status')
 *    - POST /api/expedientes/1/recursos (lacks 'expedientes:edit')
 *    - GET /api/usuarios (lacks 'usuarios:view')
 *    - POST /api/usuarios (lacks 'usuarios:create')
 *    - GET /api/usuarios/1 (lacks 'usuarios:view')
 *    - GET /api/usuarios/1/actividad (lacks 'usuarios:view')
 *    - PUT /api/usuarios/1 (lacks 'usuarios:edit')
 *    - PATCH /api/usuarios/1/suspender (lacks 'usuarios:edit')
 *    - DELETE /api/usuarios/1 (lacks 'usuarios:delete')
 *    - GET /api/roles (lacks 'roles:view' or 'roles:manage')
 *    - GET /api/permisos (lacks 'roles:view' or 'roles:manage')
 *    - GET /api/roles/1 (lacks 'roles:view' or 'roles:manage')
 *    - PUT /api/roles/1/permisos (lacks 'roles:manage')
 *    - POST /api/auth/impersonate (lacks Global Admin / 'impersonate:use')
 * 4. 200 OK for allowed endpoints for 'consulta@tjabcs.gob.mx' (has 'expedientes:view', 'catalogos:view')
 * 5. Granular boundary checks for Magistrado & Secretario
 * 6. Admin guards (self-suspension 400, self-deletion 400, admin lockout 400)
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

async function request(path, options = {}) {
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
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { _rawText: text };
  }
  return { status: res.status, ok: res.ok, data };
}

async function login(correo, password = 'password123') {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`Login failed for ${correo}: HTTP ${res.status} - ${JSON.stringify(res.data)}`);
  }
  return {
    token: res.data.token,
    usuario: res.data.usuario,
  };
}

async function runSuite() {
  console.log('======================================================================');
  console.log('CHALLENGER 1: M2 AUTHORIZATION & 403 ENFORCEMENT EMPIRICAL SUITE');
  console.log('Target Backend: ' + BASE_URL);
  console.log('Started At:     ' + new Date().toISOString());
  console.log('======================================================================\n');

  // ---------------------------------------------------------------------------
  // SECTION 1: Unauthenticated Request Rejection (401 Unauthorized)
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Unauthenticated Requests (401 Unauthorized) ---');
  const unauthEndpoints = [
    { method: 'GET', path: '/api/expedientes', name: 'GET /api/expedientes' },
    { method: 'GET', path: '/api/expedientes/1', name: 'GET /api/expedientes/1' },
    { method: 'POST', path: '/api/expedientes', body: {}, name: 'POST /api/expedientes' },
    { method: 'PUT', path: '/api/expedientes/1/estatus', body: {}, name: 'PUT /api/expedientes/1/estatus' },
    { method: 'POST', path: '/api/expedientes/1/recursos', body: {}, name: 'POST /api/expedientes/1/recursos' },
    { method: 'GET', path: '/api/catalogos', name: 'GET /api/catalogos' },
    { method: 'GET', path: '/api/usuarios', name: 'GET /api/usuarios' },
    { method: 'POST', path: '/api/usuarios', body: {}, name: 'POST /api/usuarios' },
    { method: 'GET', path: '/api/usuarios/1/actividad', name: 'GET /api/usuarios/1/actividad' },
    { method: 'GET', path: '/api/usuarios/1', name: 'GET /api/usuarios/1' },
    { method: 'PUT', path: '/api/usuarios/1', body: {}, name: 'PUT /api/usuarios/1' },
    { method: 'PATCH', path: '/api/usuarios/1/suspender', body: {}, name: 'PATCH /api/usuarios/1/suspender' },
    { method: 'DELETE', path: '/api/usuarios/1', name: 'DELETE /api/usuarios/1' },
    { method: 'GET', path: '/api/dashboard/metricas', name: 'GET /api/dashboard/metricas' },
    { method: 'GET', path: '/api/actividad', name: 'GET /api/actividad' },
    { method: 'GET', path: '/api/roles', name: 'GET /api/roles' },
    { method: 'GET', path: '/api/permisos', name: 'GET /api/permisos' },
    { method: 'GET', path: '/api/roles/1', name: 'GET /api/roles/1' },
    { method: 'PUT', path: '/api/roles/1/permisos', body: { permisoIds: [1] }, name: 'PUT /api/roles/1/permisos' },
    { method: 'POST', path: '/api/auth/logout', body: {}, name: 'POST /api/auth/logout' },
    { method: 'GET', path: '/api/auth/me', name: 'GET /api/auth/me' },
    { method: 'POST', path: '/api/auth/impersonate', body: { targetUserId: 2 }, name: 'POST /api/auth/impersonate' },
    { method: 'POST', path: '/api/auth/revert', body: {}, name: 'POST /api/auth/revert' },
  ];

  for (const ep of unauthEndpoints) {
    try {
      const res = await request(ep.path, { method: ep.method, body: ep.body });
      if (res.status === 401) {
        pass(`Unauthenticated ${ep.name} returns 401`, `HTTP 401`);
      } else {
        fail(`Unauthenticated ${ep.name} returns 401`, `Expected 401, got HTTP ${res.status}`);
      }
    } catch (err) {
      fail(`Unauthenticated ${ep.name}`, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: Malformed / Invalid Tokens (401 Unauthorized)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Token Handling & Edge Cases (401 Unauthorized) ---');
  const badTokenCases = [
    { title: 'Non-bearer Authorization header', headers: { Authorization: 'Basic dXNlcjpwYXNz' } },
    { title: 'Empty Bearer token', headers: { Authorization: 'Bearer ' } },
    { title: 'Whitespace Bearer token', headers: { Authorization: 'Bearer    ' } },
    { title: 'Non-existent Bearer token', headers: { Authorization: 'Bearer deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' } },
    { title: 'Random string token', headers: { Authorization: 'Bearer not-a-valid-token' } },
    { title: 'SQL injection string in Bearer', headers: { Authorization: "Bearer ' OR '1'='1" } },
  ];

  for (const tc of badTokenCases) {
    try {
      const res = await request('/api/expedientes', { headers: tc.headers });
      if (res.status === 401) {
        pass(`Bad token [${tc.title}] returns 401`, `HTTP 401`);
      } else {
        fail(`Bad token [${tc.title}] returns 401`, `Expected 401, got HTTP ${res.status}`);
      }
    } catch (err) {
      fail(`Bad token [${tc.title}]`, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: Authenticate Test Users
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Authenticate Personas ---');
  let admin, consulta, magistrado, secretario;
  try {
    admin = await login('admin@tjabcs.gob.mx');
    pass('Login as Administrador Global', `Token obtained (usuarioId: ${admin.usuario.id})`);
  } catch (err) {
    fail('Login as Administrador Global', err.message);
  }

  try {
    consulta = await login('consulta@tjabcs.gob.mx');
    pass('Login as Usuario Consulta', `Token obtained (usuarioId: ${consulta.usuario.id})`);
  } catch (err) {
    fail('Login as Usuario Consulta', err.message);
  }

  try {
    magistrado = await login('magistrado1@tjabcs.gob.mx');
    pass('Login as Magistrado', `Token obtained (usuarioId: ${magistrado.usuario.id})`);
  } catch (err) {
    fail('Login as Magistrado', err.message);
  }

  try {
    secretario = await login('secretario1@tjabcs.gob.mx');
    pass('Login as Secretario de Acuerdos', `Token obtained (usuarioId: ${secretario.usuario.id})`);
  } catch (err) {
    fail('Login as Secretario de Acuerdos', err.message);
  }

  const consultaHeaders = { Authorization: `Bearer ${consulta?.token}` };
  const adminHeaders = { Authorization: `Bearer ${admin?.token}` };
  const magistradoHeaders = { Authorization: `Bearer ${magistrado?.token}` };
  const secretarioHeaders = { Authorization: `Bearer ${secretario?.token}` };

  // ---------------------------------------------------------------------------
  // SECTION 4: 403 Forbidden for Consulta on Restricted Endpoints
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 4: 403 Forbidden Enforcement for Consulta Role ---');
  const consultaForbiddenCases = [
    {
      name: 'POST /api/expedientes (lacks expedientes:create)',
      method: 'POST',
      path: '/api/expedientes',
      body: { folio: 'TJA-TEST-001', consecutivo: 100, anio: 2026, fechaIngreso: '2026-01-01', tipoAsuntoId: 1, leyId: 1, salaId: 1, estatusId: 1, subEstatusId: 1 },
      expectedPerm: 'expedientes:create',
    },
    {
      name: 'PUT /api/expedientes/1/estatus (lacks expedientes:status)',
      method: 'PUT',
      path: '/api/expedientes/1/estatus',
      body: { nuevoEstatusId: 2, nuevoSubEstatusId: 3, notas: 'Unauthorized change' },
      expectedPerm: 'expedientes:status',
    },
    {
      name: 'POST /api/expedientes/1/recursos (lacks expedientes:edit)',
      method: 'POST',
      path: '/api/expedientes/1/recursos',
      body: { tipo: 'Reclamación', fecha: '2026-01-01', estatus: 'Pendiente' },
      expectedPerm: 'expedientes:edit',
    },
    {
      name: 'GET /api/usuarios (lacks usuarios:view)',
      method: 'GET',
      path: '/api/usuarios',
      expectedPerm: 'usuarios:view',
    },
    {
      name: 'POST /api/usuarios (lacks usuarios:create)',
      method: 'POST',
      path: '/api/usuarios',
      body: { nombre: 'Hacker', correo: 'hacker@test.com', password: '123', rolId: 1 },
      expectedPerm: 'usuarios:create',
    },
    {
      name: 'GET /api/usuarios/1 (lacks usuarios:view)',
      method: 'GET',
      path: '/api/usuarios/1',
      expectedPerm: 'usuarios:view',
    },
    {
      name: 'GET /api/usuarios/1/actividad (lacks usuarios:view)',
      method: 'GET',
      path: '/api/usuarios/1/actividad',
      expectedPerm: 'usuarios:view',
    },
    {
      name: 'PUT /api/usuarios/1 (lacks usuarios:edit)',
      method: 'PUT',
      path: '/api/usuarios/1',
      body: { nombre: 'Tampered' },
      expectedPerm: 'usuarios:edit',
    },
    {
      name: 'PATCH /api/usuarios/1/suspender (lacks usuarios:edit)',
      method: 'PATCH',
      path: '/api/usuarios/1/suspender',
      body: {},
      expectedPerm: 'usuarios:edit',
    },
    {
      name: 'DELETE /api/usuarios/1 (lacks usuarios:delete)',
      method: 'DELETE',
      path: '/api/usuarios/1',
      expectedPerm: 'usuarios:delete',
    },
    {
      name: 'GET /api/roles (lacks roles:view or roles:manage)',
      method: 'GET',
      path: '/api/roles',
      expectedPerm: 'roles:view',
    },
    {
      name: 'GET /api/permisos (lacks roles:view or roles:manage)',
      method: 'GET',
      path: '/api/permisos',
      expectedPerm: 'roles:view',
    },
    {
      name: 'GET /api/roles/1 (lacks roles:view or roles:manage)',
      method: 'GET',
      path: '/api/roles/1',
      expectedPerm: 'roles:view',
    },
    {
      name: 'PUT /api/roles/1/permisos (lacks roles:manage)',
      method: 'PUT',
      path: '/api/roles/1/permisos',
      body: { permisoIds: [1, 2] },
      expectedPerm: 'roles:manage',
    },
    {
      name: 'POST /api/auth/impersonate (lacks Global Admin privileges)',
      method: 'POST',
      path: '/api/auth/impersonate',
      body: { targetUserId: 1 },
      expectedPerm: 'impersonate:use',
    },
  ];

  for (const c of consultaForbiddenCases) {
    try {
      const res = await request(c.path, {
        method: c.method,
        headers: consultaHeaders,
        body: c.body,
      });

      if (res.status === 403) {
        pass(`Consulta forbidden on ${c.name}`, `HTTP 403 - ${JSON.stringify(res.data)}`);
      } else {
        fail(`Consulta forbidden on ${c.name}`, `Expected HTTP 403, got HTTP ${res.status} (${JSON.stringify(res.data)})`);
      }
    } catch (err) {
      fail(`Consulta forbidden on ${c.name}`, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: Allowed Endpoints for Consulta (200 OK)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Permitted Endpoints for Consulta Role (200 OK) ---');
  const consultaAllowed = [
    { name: 'GET /api/expedientes (has expedientes:view)', path: '/api/expedientes' },
    { name: 'GET /api/catalogos (has catalogos:view)', path: '/api/catalogos' },
    { name: 'GET /api/dashboard/metricas (has expedientes:view)', path: '/api/dashboard/metricas' },
    { name: 'GET /api/actividad (has expedientes:view)', path: '/api/actividad' },
    { name: 'GET /api/auth/me', path: '/api/auth/me' },
  ];

  for (const a of consultaAllowed) {
    try {
      const res = await request(a.path, { headers: consultaHeaders });
      if (res.status === 200) {
        pass(`Consulta permitted on ${a.name}`, `HTTP 200 OK`);
      } else {
        fail(`Consulta permitted on ${a.name}`, `Expected HTTP 200, got HTTP ${res.status}`);
      }
    } catch (err) {
      fail(`Consulta permitted on ${a.name}`, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 6: Granular Role Separation (Magistrado vs Secretario)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Granular Role Separation (Magistrado & Secretario) ---');
  
  // Magistrado does NOT have 'expedientes:create'
  try {
    const res = await request('/api/expedientes', {
      method: 'POST',
      headers: magistradoHeaders,
      body: { folio: 'EXP-MAG-TEST', consecutivo: 101, anio: 2026, fechaIngreso: '2026-01-01', tipoAsuntoId: 1, leyId: 1, salaId: 1, estatusId: 1, subEstatusId: 1 },
    });
    if (res.status === 403) {
      pass('Magistrado denied POST /api/expedientes (lacks expedientes:create)', `HTTP 403 - ${JSON.stringify(res.data)}`);
    } else {
      fail('Magistrado denied POST /api/expedientes', `Expected 403, got HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Magistrado denied POST /api/expedientes', err.message);
  }

  // Magistrado DOES have 'expedientes:view' and 'expedientes:status'
  try {
    const res = await request('/api/expedientes', { headers: magistradoHeaders });
    if (res.status === 200) {
      pass('Magistrado allowed GET /api/expedientes (has expedientes:view)', `HTTP 200 OK`);
    } else {
      fail('Magistrado allowed GET /api/expedientes', `Expected 200, got HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Magistrado allowed GET /api/expedientes', err.message);
  }

  // Secretario does NOT have 'usuarios:create' or 'roles:manage'
  try {
    const res = await request('/api/usuarios', {
      method: 'POST',
      headers: secretarioHeaders,
      body: { nombre: 'New', correo: 'new@secretario.com', password: '123', rolId: 2 },
    });
    if (res.status === 403) {
      pass('Secretario denied POST /api/usuarios (lacks usuarios:create)', `HTTP 403`);
    } else {
      fail('Secretario denied POST /api/usuarios', `Expected 403, got HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Secretario denied POST /api/usuarios', err.message);
  }

  try {
    const res = await request('/api/roles/1/permisos', {
      method: 'PUT',
      headers: secretarioHeaders,
      body: { permisoIds: [1] },
    });
    if (res.status === 403) {
      pass('Secretario denied PUT /api/roles/1/permisos (lacks roles:manage)', `HTTP 403`);
    } else {
      fail('Secretario denied PUT /api/roles/1/permisos', `Expected 403, got HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Secretario denied PUT /api/roles/1/permisos', err.message);
  }

  // ---------------------------------------------------------------------------
  // SECTION 7: Admin Privileges & Guard Rails
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Admin Privileges & Guard Rails ---');

  // Admin access to roles & users
  try {
    const res = await request('/api/roles', { headers: adminHeaders });
    if (res.status === 200 && Array.isArray(res.data)) {
      pass('Admin allowed GET /api/roles', `HTTP 200 OK (returned ${res.data.length} roles)`);
    } else {
      fail('Admin allowed GET /api/roles', `Expected 200, got HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Admin allowed GET /api/roles', err.message);
  }

  try {
    const res = await request('/api/permisos', { headers: adminHeaders });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length === 13) {
      pass('Admin allowed GET /api/permisos', `HTTP 200 OK (all 13 permissions returned)`);
    } else {
      fail('Admin allowed GET /api/permisos', `Expected 200 with 13 permissions, got HTTP ${res.status}`);
    }
  } catch (err) {
    fail('Admin allowed GET /api/permisos', err.message);
  }

  // Admin Self-Suspension Guard: PATCH /api/usuarios/:adminId/suspender
  try {
    const adminId = admin.usuario.id;
    const res = await request(`/api/usuarios/${adminId}/suspender`, {
      method: 'PATCH',
      headers: adminHeaders,
    });
    if (res.status === 400 && res.data?.error?.includes('propia cuenta')) {
      pass('Admin self-suspension prevented (HTTP 400)', res.data.error);
    } else {
      fail('Admin self-suspension prevented', `Expected HTTP 400 with self-suspension message, got HTTP ${res.status} (${JSON.stringify(res.data)})`);
    }
  } catch (err) {
    fail('Admin self-suspension guard', err.message);
  }

  // Admin Self-Deletion Guard: DELETE /api/usuarios/:adminId
  try {
    const adminId = admin.usuario.id;
    const res = await request(`/api/usuarios/${adminId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    if (res.status === 400 && res.data?.error?.includes('propia cuenta')) {
      pass('Admin self-deletion prevented (HTTP 400)', res.data.error);
    } else {
      fail('Admin self-deletion prevented', `Expected HTTP 400 with self-deletion message, got HTTP ${res.status} (${JSON.stringify(res.data)})`);
    }
  } catch (err) {
    fail('Admin self-deletion guard', err.message);
  }

  // Admin Lockout Safeguard: PUT /api/roles/1/permisos without 'roles:manage' or 'impersonate:use'
  try {
    const res = await request('/api/roles/1/permisos', {
      method: 'PUT',
      headers: adminHeaders,
      body: { permisoCodigos: ['expedientes:view', 'expedientes:create'] }, // deliberately omitting roles:manage and impersonate:use
    });
    if (res.status === 400 && res.data?.error?.includes('Protección de seguridad')) {
      pass('Admin lockout prevention enforced (HTTP 400)', res.data.error);
    } else {
      fail('Admin lockout prevention enforced', `Expected HTTP 400 with lockout message, got HTTP ${res.status} (${JSON.stringify(res.data)})`);
    }
  } catch (err) {
    fail('Admin lockout prevention', err.message);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('                     TEST EXECUTION SUMMARY');
  console.log('======================================================================');
  console.log(`  Total Tests Run:    ${results.total}`);
  console.log(`  Passed Tests:       ${results.passed}`);
  console.log(`  Failed Tests:       ${results.failed}`);
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log('======================================================================\n');

  if (results.failed > 0) {
    console.error('FAILURES:');
    for (const f of results.failures) {
      console.error(`- ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL AUTHORIZATION & 403 ENFORCEMENT TESTS PASSED!');
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal unhandled error running suite:', err);
  process.exit(1);
});
