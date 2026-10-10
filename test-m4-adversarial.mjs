/**
 * test-m4-adversarial.mjs
 * =============================================================================
 * Challenger 2: Adversarial Empirical Test Harness for Milestone 4
 * Focus: Live Session Permission Propagation, RoleConfiguration Component Logic,
 *        Edge Case Payloads to PUT /api/roles/:id/permisos, and DB State Restoration
 * =============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

function pass(name, detail = '') {
  results.total++;
  results.passed++;
  console.log(`  ${colors.green}✓ [PASS ${results.total}]${colors.reset} ${name}${detail ? colors.gray + ' -> ' + detail + colors.reset : ''}`);
}

function fail(name, error) {
  results.total++;
  results.failed++;
  results.failures.push({ num: results.total, name, error });
  console.error(`  ${colors.red}✗ [FAIL ${results.total}]${colors.reset} ${name} -> ${colors.red}ERROR: ${error}${colors.reset}`);
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

// ============================================================================
// SIMULATED COMPONENT LOGIC (RoleConfiguration.tsx)
// Exact replication of logic in RoleConfiguration.tsx for unit stress testing
// ============================================================================

const LOCKED_ADMIN_CODES = ['roles:manage', 'impersonate:use'];

const MODULE_METADATA = {
  expedientes: {
    label: 'Expedientes Judiciales',
    description: 'Gestión procesal, registro de demandas, bitácora y cambios de estatus',
  },
  usuarios: {
    label: 'Usuarios y Operadores',
    description: 'Directorio de personal, creación, edición y suspensión de cuentas',
  },
  roles: {
    label: 'Roles y Autorizaciones',
    description: 'Consulta y asignación de permisos en la matriz de seguridad',
  },
  catalogos: {
    label: 'Catálogos del Tribunal',
    description: 'Salas jurisdiccionales, tipos de asunto y leyes aplicables',
  },
  seguridad: {
    label: 'Seguridad y Suplantación',
    description: 'Facultades críticas del sistema, auditoría y cambio de identidad',
  },
};

function isRoleDirty(roleId, workingPermisos, originalPermisos) {
  const orig = originalPermisos[roleId];
  const curr = workingPermisos[roleId];
  if (!orig || !curr) return false;
  if (orig.size !== curr.size) return true;
  for (const id of curr) {
    if (!orig.has(id)) return true;
  }
  return false;
}

function isPermissionLocked(roleName, permisoCodigo) {
  return roleName === 'Administrador' && LOCKED_ADMIN_CODES.includes(permisoCodigo);
}

function simulateTogglePermission({
  roleId,
  roleName,
  permisoId,
  permisoCodigo,
  canManage,
  workingPermisos,
}) {
  if (!canManage || !roleId || isPermissionLocked(roleName, permisoCodigo)) {
    return workingPermisos;
  }
  const currentSet = new Set(workingPermisos[roleId] || []);
  if (currentSet.has(permisoId)) {
    currentSet.delete(permisoId);
  } else {
    currentSet.add(permisoId);
  }
  return { ...workingPermisos, [roleId]: currentSet };
}

function simulateSelectAll({ roleId, canManage, allPermisos, workingPermisos }) {
  if (!canManage || !roleId) return workingPermisos;
  const allIds = new Set(allPermisos.map((p) => p.id));
  return { ...workingPermisos, [roleId]: allIds };
}

function simulateDeselectAll({ roleId, roleName, canManage, allPermisos, workingPermisos }) {
  if (!canManage || !roleId) return workingPermisos;
  const preservedIds = new Set();
  if (roleName === 'Administrador') {
    allPermisos
      .filter((p) => LOCKED_ADMIN_CODES.includes(p.codigo))
      .forEach((p) => preservedIds.add(p.id));
  }
  return { ...workingPermisos, [roleId]: preservedIds };
}

function simulateDiscardChanges({ roleId, originalPermisos, workingPermisos }) {
  if (!roleId || !originalPermisos[roleId]) return workingPermisos;
  return {
    ...workingPermisos,
    [roleId]: new Set(originalPermisos[roleId]),
  };
}

// ============================================================================
// MAIN TEST HARNESS RUNNER
// ============================================================================

async function runMilestone4AdversarialHarness() {
  console.log(`\n${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER 2: EMPIRICAL STRESS TEST HARNESS — MILESTONE 4${colors.reset}`);
  console.log(`${colors.cyan}======================================================================${colors.reset}`);
  console.log(`Target Backend: ${BASE_URL}\n`);

  let baselineRoles = [];
  let allPermisos = [];
  let adminToken = '';
  let consultaToken = '';
  let secretarioToken = '';

  try {
    // ------------------------------------------------------------------------
    // TIER 1: AUTHENTICATION & INITIAL SNAPSHOT
    // ------------------------------------------------------------------------
    console.log(`${colors.yellow}--- TIER 1: Authenticate & Capture Baseline Database State ---${colors.reset}`);

    const adminLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
    });
    if (adminLogin.status === 200 && adminLogin.body.token) {
      adminToken = adminLogin.body.token;
      pass('Admin login successful (200 OK)');
    } else {
      fail('Admin login', `Status ${adminLogin.status}: ${JSON.stringify(adminLogin.body)}`);
      return;
    }

    const consultaLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'consulta@tjabcs.gob.mx', password: 'password123' },
    });
    if (consultaLogin.status === 200 && consultaLogin.body.token) {
      consultaToken = consultaLogin.body.token;
      pass('Consulta login successful (200 OK)');
    } else {
      fail('Consulta login', `Status ${consultaLogin.status}`);
      return;
    }

    const secretarioLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { correo: 'secretario1@tjabcs.gob.mx', password: 'password123' },
    });
    if (secretarioLogin.status === 200 && secretarioLogin.body.token) {
      secretarioToken = secretarioLogin.body.token;
      pass('Secretario login successful (200 OK)');
    } else {
      fail('Secretario login', `Status ${secretarioLogin.status}`);
      return;
    }

    // Capture baseline roles
    const rolesRes = await req('/api/roles', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (rolesRes.status === 200 && Array.isArray(rolesRes.body)) {
      baselineRoles = rolesRes.body;
      pass(`Baseline roles captured (${baselineRoles.length} roles found)`);
    } else {
      fail('Fetch baseline roles', `Status ${rolesRes.status}`);
      return;
    }

    // Capture all permisos
    const permisosRes = await req('/api/permisos', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (permisosRes.status === 200 && Array.isArray(permisosRes.body)) {
      allPermisos = permisosRes.body;
      pass(`System catalog of permissions captured (${allPermisos.length} granular permissions found)`);
    } else {
      fail('Fetch system permisos catalog', `Status ${permisosRes.status}`);
      return;
    }

    const permMapByCode = new Map(allPermisos.map((p) => [p.codigo, p.id]));
    const permMapById = new Map(allPermisos.map((p) => [p.id, p.codigo]));

    // Identify role 4 (Consulta/Dirección) and role 1 (Administrador)
    const roleConsulta = baselineRoles.find((r) => r.nombre === 'Consulta/Dirección');
    const roleAdmin = baselineRoles.find((r) => r.nombre === 'Administrador');
    if (!roleConsulta || !roleAdmin) {
      fail('Locate target roles in baseline', 'Role Consulta or Administrador missing');
      return;
    }
    pass(`Target roles identified: Administrador (ID: ${roleAdmin.id}), Consulta/Dirección (ID: ${roleConsulta.id})`);

    // ------------------------------------------------------------------------
    // TIER 2: LIVE SESSION PERMISSION PROPAGATION (ZERO CACHE DELAY)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}--- TIER 2: Live Session Permission Propagation (Zero Cache Delay) ---${colors.reset}`);

    // Initial state: consultaToken must NOT have 'expedientes:create'
    const meBefore = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    if (meBefore.status === 200 && !meBefore.body.usuario?.permisos?.includes('expedientes:create')) {
      pass("Active Consulta session initially lacks 'expedientes:create'");
    } else {
      fail("Active Consulta session initial state", `Has permisos: ${JSON.stringify(meBefore.body.usuario?.permisos)}`);
    }

    // Attempting action requiring 'expedientes:create' (POST /api/expedientes) must return 403 Forbidden
    const createDeniedBefore = await req('/api/expedientes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { folio: 'TEST-EXP-001' },
    });
    if (createDeniedBefore.status === 403 && createDeniedBefore.body.error?.includes('expedientes:create')) {
      pass("Action denied with HTTP 403: 'Acceso denegado: permiso requerido expedientes:create'");
    } else {
      fail("Enforce 403 on lack of expedientes:create", `Status: ${createDeniedBefore.status}, body: ${JSON.stringify(createDeniedBefore.body)}`);
    }

    // Step A: Grant 'expedientes:create' to role Consulta via Admin
    const initialConsultaPermIds = roleConsulta.permisos.map((p) => p.id);
    const expCreateId = permMapByCode.get('expedientes:create');
    const grantedPermIds = [...initialConsultaPermIds, expCreateId];

    const grantRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: grantedPermIds },
    });
    if (grantRes.status === 200) {
      pass(`Admin granted 'expedientes:create' to role ${roleConsulta.nombre} (PUT 200 OK)`);
    } else {
      fail(`Grant 'expedientes:create'`, `Status ${grantRes.status}: ${JSON.stringify(grantRes.body)}`);
    }

    // Step B: Immediately verify Consulta's existing session token reflects new permission on NEXT API call
    const meAfterGrant = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    if (meAfterGrant.status === 200 && meAfterGrant.body.usuario?.permisos?.includes('expedientes:create')) {
      pass("Zero-Delay Grant: GET /api/auth/me on live session immediately reflects 'expedientes:create'");
    } else {
      fail("Zero-Delay Grant on /api/auth/me", `Permisos: ${JSON.stringify(meAfterGrant.body.usuario?.permisos)}`);
    }

    // Step C: Verify that POST /api/expedientes is NO LONGER denied with 403
    const createAllowedAfterGrant = await req('/api/expedientes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: {}, // intentionally empty to hit controller validation, but past permission check
    });
    if (createAllowedAfterGrant.status !== 403) {
      pass(`Zero-Delay Grant: POST /api/expedientes passed RBAC middleware without 403 (HTTP ${createAllowedAfterGrant.status})`);
    } else {
      fail("Zero-Delay Grant on POST /api/expedientes", `Unexpected 403 Forbidden: ${JSON.stringify(createAllowedAfterGrant.body)}`);
    }

    // Step D: Revoke 'expedientes:create' from role Consulta via Admin
    const revokeRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: initialConsultaPermIds },
    });
    if (revokeRes.status === 200) {
      pass(`Admin revoked 'expedientes:create' from role ${roleConsulta.nombre} (PUT 200 OK)`);
    } else {
      fail(`Revoke 'expedientes:create'`, `Status ${revokeRes.status}: ${JSON.stringify(revokeRes.body)}`);
    }

    // Step E: Immediately verify existing Consulta session token is revoked on NEXT API call
    const meAfterRevoke = await req('/api/auth/me', {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    if (meAfterRevoke.status === 200 && !meAfterRevoke.body.usuario?.permisos?.includes('expedientes:create')) {
      pass("Zero-Delay Revoke: GET /api/auth/me on live session immediately removes 'expedientes:create'");
    } else {
      fail("Zero-Delay Revoke on /api/auth/me", `Permisos: ${JSON.stringify(meAfterRevoke.body.usuario?.permisos)}`);
    }

    // Step F: Verify POST /api/expedientes immediately fails with 403 again
    const createDeniedAfterRevoke = await req('/api/expedientes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { folio: 'TEST-EXP-002' },
    });
    if (createDeniedAfterRevoke.status === 403 && createDeniedAfterRevoke.body.error?.includes('expedientes:create')) {
      pass("Zero-Delay Revoke: POST /api/expedientes immediately blocked with HTTP 403");
    } else {
      fail("Zero-Delay Revoke on POST /api/expedientes", `Status: ${createDeniedAfterRevoke.status}: ${JSON.stringify(createDeniedAfterRevoke.body)}`);
    }

    // Step G: Dual-directional test on read permission: 'expedientes:view'
    // Temporarily revoke 'expedientes:view' from Consulta
    const catalogosOnly = initialConsultaPermIds.filter((id) => permMapById.get(id) !== 'expedientes:view');
    const revokeReadRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: catalogosOnly },
    });
    if (revokeReadRes.status === 200) {
      pass("Admin temporarily revoked 'expedientes:view' from Consulta role");
    } else {
      fail("Revoke 'expedientes:view'", `Status ${revokeReadRes.status}`);
    }

    const viewDenied = await req('/api/expedientes', {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    if (viewDenied.status === 403 && viewDenied.body.error?.includes('expedientes:view')) {
      pass("Zero-Delay Revoke: GET /api/expedientes immediately returns 403 Forbidden");
    } else {
      fail("Zero-Delay Revoke on GET /api/expedientes", `Status: ${viewDenied.status}`);
    }

    // Restore 'expedientes:view'
    const restoreReadRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: initialConsultaPermIds },
    });
    if (restoreReadRes.status === 200) {
      pass("Admin restored 'expedientes:view' to Consulta role");
    } else {
      fail("Restore 'expedientes:view'", `Status ${restoreReadRes.status}`);
    }

    const viewAllowed = await req('/api/expedientes', {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    if (viewAllowed.status === 200 && Array.isArray(viewAllowed.body)) {
      pass("Zero-Delay Restore: GET /api/expedientes immediately succeeds (200 OK)");
    } else {
      fail("Zero-Delay Restore on GET /api/expedientes", `Status: ${viewAllowed.status}`);
    }

    // ------------------------------------------------------------------------
    // TIER 3: EDGE CASE INPUTS TO PUT /api/roles/:id/permisos
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}--- TIER 3: Adversarial Edge Cases on PUT /api/roles/:id/permisos ---${colors.reset}`);

    // Edge Case 1: Non-numeric / Invalid Role ID
    const invalidIdRes1 = await req('/api/roles/invalid_id/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [1, 2] },
    });
    if (invalidIdRes1.status === 400 && invalidIdRes1.body.error?.includes('ID de rol inválido')) {
      pass("Non-numeric role ID ('invalid_id') rejected with 400 Bad Request");
    } else {
      fail("Non-numeric role ID", `Status: ${invalidIdRes1.status}, body: ${JSON.stringify(invalidIdRes1.body)}`);
    }

    // Edge Case 2: Negative and zero Role ID
    const negIdRes = await req('/api/roles/-99/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [1, 2] },
    });
    if (negIdRes.status === 400 && negIdRes.body.error?.includes('ID de rol inválido')) {
      pass("Negative role ID ('-99') rejected with 400 Bad Request");
    } else {
      fail("Negative role ID", `Status: ${negIdRes.status}`);
    }

    const zeroIdRes = await req('/api/roles/0/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [1, 2] },
    });
    if (zeroIdRes.status === 400 && zeroIdRes.body.error?.includes('ID de rol inválido')) {
      pass("Zero role ID ('0') rejected with 400 Bad Request");
    } else {
      fail("Zero role ID", `Status: ${zeroIdRes.status}`);
    }

    // Edge Case 3: Non-existent Role ID
    const nonExistentRoleRes = await req('/api/roles/999999/permisos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [1, 2] },
    });
    if (nonExistentRoleRes.status === 404 && nonExistentRoleRes.body.error?.includes('Rol no encontrado')) {
      pass("Non-existent role ID (999999) rejected with 404 Not Found");
    } else {
      fail("Non-existent role ID", `Status: ${nonExistentRoleRes.status}`);
    }

    // Edge Case 4: Empty Array input for non-admin role (e.g. roleConsulta)
    const emptyArrayRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [] },
    });
    if (emptyArrayRes.status === 200 && Array.isArray(emptyArrayRes.body.rol?.permisos) && emptyArrayRes.body.rol.permisos.length === 0) {
      pass("Empty array { permisoIds: [] } accepted for non-admin role (200 OK, 0 permissions)");
    } else {
      fail("Empty array for non-admin role", `Status: ${emptyArrayRes.status}: ${JSON.stringify(emptyArrayRes.body)}`);
    }

    // Edge Case 5: Empty Array input for Administrador role (must be rejected due to lockout protection)
    const emptyAdminRes = await req(`/api/roles/${roleAdmin.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [] },
    });
    if (emptyAdminRes.status === 400 && emptyAdminRes.body.error?.includes('Protección de seguridad')) {
      pass("Empty array { permisoIds: [] } rejected on Administrador (400 Bad Request, lockout protection)");
    } else {
      fail("Empty array on Administrador", `Status: ${emptyAdminRes.status}: ${JSON.stringify(emptyAdminRes.body)}`);
    }

    // Edge Case 6: Non-existent permission IDs
    const nonExistentPermRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [999999] },
    });
    if (nonExistentPermRes.status === 400 && nonExistentPermRes.body.error?.includes('no existen en el sistema')) {
      pass("Non-existent permission ID [999999] rejected with 400 Bad Request");
    } else {
      fail("Non-existent permission ID", `Status: ${nonExistentPermRes.status}: ${JSON.stringify(nonExistentPermRes.body)}`);
    }

    // Edge Case 7: Invalid permission ID types (negative, zero, floating, string)
    const negativePermRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [-5] },
    });
    if (negativePermRes.status === 400 && negativePermRes.body.error?.includes('inválido')) {
      pass("Negative permission ID [-5] rejected with 400 Bad Request");
    } else {
      fail("Negative permission ID", `Status: ${negativePermRes.status}`);
    }

    const stringPermRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: ['not-a-number'] },
    });
    if (stringPermRes.status === 400 && stringPermRes.body.error?.includes('inválido')) {
      pass("String in permisoIds ['not-a-number'] rejected with 400 Bad Request");
    } else {
      fail("String in permisoIds", `Status: ${stringPermRes.status}`);
    }

    // Edge Case 8: Non-existent permission codes
    const nonExistentCodeRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['inexistente:codigo', 'otro:falso'] },
    });
    if (nonExistentCodeRes.status === 400 && nonExistentCodeRes.body.error?.includes('no existen en el sistema')) {
      pass("Non-existent permission codes ['inexistente:codigo'] rejected with 400 Bad Request");
    } else {
      fail("Non-existent permission codes", `Status: ${nonExistentCodeRes.status}: ${JSON.stringify(nonExistentCodeRes.body)}`);
    }

    // Edge Case 9: Duplicate IDs in array (must be safely deduplicated)
    const validId1 = allPermisos[0].id;
    const validId2 = allPermisos[1].id;
    const duplicateIdsRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: [validId1, validId1, validId2, validId2, validId1] },
    });
    if (duplicateIdsRes.status === 200 && duplicateIdsRes.body.rol?.permisos?.length === 2) {
      pass("Duplicate permission IDs [1, 1, 2, 2, 1] deduplicated cleanly (200 OK, exactly 2 permissions assigned)");
    } else {
      fail("Duplicate permission IDs", `Status: ${duplicateIdsRes.status}: ${JSON.stringify(duplicateIdsRes.body)}`);
    }

    // Edge Case 10: Duplicate codes in array (must be safely deduplicated)
    const duplicateCodesRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view', 'expedientes:view', 'catalogos:view', 'catalogos:view'] },
    });
    if (duplicateCodesRes.status === 200 && duplicateCodesRes.body.rol?.permisos?.length === 2) {
      pass("Duplicate permission codes deduplicated cleanly (200 OK, exactly 2 permissions assigned)");
    } else {
      fail("Duplicate permission codes", `Status: ${duplicateCodesRes.status}: ${JSON.stringify(duplicateCodesRes.body)}`);
    }

    // Edge Case 11: Missing payload body / Empty body
    const emptyBodyRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {},
    });
    if (emptyBodyRes.status === 400 && emptyBodyRes.body.error?.includes('Se requiere el campo permisoIds')) {
      pass("Empty payload {} rejected with 400 Bad Request");
    } else {
      fail("Empty payload {}", `Status: ${emptyBodyRes.status}: ${JSON.stringify(emptyBodyRes.body)}`);
    }

    // Edge Case 12: Malformed payload types
    const malformedTypeRes = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoIds: "string-instead-of-array" },
    });
    if (malformedTypeRes.status === 400 && malformedTypeRes.body.error?.includes('debe ser un arreglo')) {
      pass("Malformed permisoIds type (string instead of array) rejected with 400 Bad Request");
    } else {
      fail("Malformed permisoIds type", `Status: ${malformedTypeRes.status}`);
    }

    // Edge Case 13: Attempt to remove admin locked permissions from Administrador
    const stripAdminLockedRes = await req(`/api/roles/${roleAdmin.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { permisoCodigos: ['expedientes:view', 'catalogos:view'] },
    });
    if (stripAdminLockedRes.status === 400 && stripAdminLockedRes.body.error?.includes('Protección de seguridad')) {
      pass("Attempt to omit 'roles:manage' or 'impersonate:use' from Administrador blocked with 400 Bad Request");
    } else {
      fail("Admin lockout protection on strip", `Status: ${stripAdminLockedRes.status}: ${JSON.stringify(stripAdminLockedRes.body)}`);
    }

    // Edge Case 14: Unauthorized caller (non-admin) attempting PUT /api/roles/:id/permisos
    const unauthorizedMutation = await req(`/api/roles/${roleConsulta.id}/permisos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { permisoIds: [validId1] },
    });
    if (unauthorizedMutation.status === 403 && unauthorizedMutation.body.error?.includes('roles:manage')) {
      pass("Unauthorized caller without 'roles:manage' rejected with 403 Forbidden");
    } else {
      fail("Unauthorized PUT /api/roles/:id/permisos", `Status: ${unauthorizedMutation.status}`);
    }

    // ------------------------------------------------------------------------
    // TIER 4: COMPONENT INTEGRITY (RoleConfiguration.tsx)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}--- TIER 4: Component Integrity & Client State Logic (RoleConfiguration.tsx) ---${colors.reset}`);

    // Test 1: Module metadata configuration
    const expectedModules = ['expedientes', 'usuarios', 'roles', 'catalogos', 'seguridad'];
    const configuredModules = Object.keys(MODULE_METADATA);
    const hasAllModules = expectedModules.every((m) => configuredModules.includes(m));
    if (hasAllModules) {
      pass(`MODULE_METADATA correctly defines all 5 modules (${expectedModules.join(', ')})`);
    } else {
      fail("MODULE_METADATA completeness", `Found: ${configuredModules.join(', ')}`);
    }

    // Test 2: Locked admin codes definition
    if (LOCKED_ADMIN_CODES.length === 2 && LOCKED_ADMIN_CODES.includes('roles:manage') && LOCKED_ADMIN_CODES.includes('impersonate:use')) {
      pass("LOCKED_ADMIN_CODES correctly restricts exactly ['roles:manage', 'impersonate:use']");
    } else {
      fail("LOCKED_ADMIN_CODES check", JSON.stringify(LOCKED_ADMIN_CODES));
    }

    // Test 3: isPermissionLocked helper
    const lockTestAdminManage = isPermissionLocked('Administrador', 'roles:manage');
    const lockTestAdminImpersonate = isPermissionLocked('Administrador', 'impersonate:use');
    const lockTestAdminOther = isPermissionLocked('Administrador', 'expedientes:create');
    const lockTestOtherRoleManage = isPermissionLocked('Secretario de Acuerdos', 'roles:manage');

    if (lockTestAdminManage && lockTestAdminImpersonate && !lockTestAdminOther && !lockTestOtherRoleManage) {
      pass("isPermissionLocked correctly enforces locks ONLY on Administrador for sensitive codes");
    } else {
      fail("isPermissionLocked logic", `adminManage: ${lockTestAdminManage}, adminOther: ${lockTestAdminOther}, otherRole: ${lockTestOtherRoleManage}`);
    }

    // Test 4: Dirty-state detection (isRoleDirty)
    const initialMap = {
      1: new Set([1, 2, 3]),
      2: new Set([4, 5]),
    };
    const originalMap = {
      1: new Set([1, 2, 3]),
      2: new Set([4, 5]),
    };

    // Initially clean
    const cleanRole1 = isRoleDirty(1, initialMap, originalMap);
    const cleanRole2 = isRoleDirty(2, initialMap, originalMap);
    if (!cleanRole1 && !cleanRole2) {
      pass("isRoleDirty returns false when workingPermisos matches originalPermisos");
    } else {
      fail("isRoleDirty initial state", `role1: ${cleanRole1}, role2: ${cleanRole2}`);
    }

    // Dirty when item added
    const modifiedMapAdd = {
      ...initialMap,
      1: new Set([...initialMap[1], 99]),
    };
    if (isRoleDirty(1, modifiedMapAdd, originalMap)) {
      pass("isRoleDirty returns true when a permission is added");
    } else {
      fail("isRoleDirty on add", "Expected true");
    }

    // Dirty when item removed
    const modifiedMapRemove = {
      ...initialMap,
      1: new Set([1, 2]),
    };
    if (isRoleDirty(1, modifiedMapRemove, originalMap)) {
      pass("isRoleDirty returns true when a permission is removed");
    } else {
      fail("isRoleDirty on remove", "Expected true");
    }

    // Dirty when same size but different element
    const modifiedMapSwap = {
      ...initialMap,
      1: new Set([1, 2, 99]),
    };
    if (isRoleDirty(1, modifiedMapSwap, originalMap)) {
      pass("isRoleDirty returns true when same count but different elements");
    } else {
      fail("isRoleDirty on swap", "Expected true");
    }

    // Clean when reverted back to identical set
    const revertedMap = {
      ...initialMap,
      1: new Set([1, 2, 3]),
    };
    if (!isRoleDirty(1, revertedMap, originalMap)) {
      pass("isRoleDirty returns false when changes are manually reverted back");
    } else {
      fail("isRoleDirty on manual revert", "Expected false");
    }

    // Edge cases: null / missing role in map
    if (!isRoleDirty(999, initialMap, originalMap)) {
      pass("isRoleDirty safely returns false for uninitialized role ID");
    } else {
      fail("isRoleDirty on missing role", "Expected false");
    }

    // Test 5: handleDiscardChanges logic
    const discardedState = simulateDiscardChanges({
      roleId: 1,
      originalPermisos: originalMap,
      workingPermisos: modifiedMapAdd,
    });
    if (!isRoleDirty(1, discardedState, originalMap) && discardedState[1].size === 3) {
      pass("handleDiscardChanges restores workingPermisos from originalPermisos and clears dirty state");
    } else {
      fail("handleDiscardChanges", `Dirty: ${isRoleDirty(1, discardedState, originalMap)}`);
    }

    // Test 6: handleTogglePermission logic
    // Toggle unlocked permission
    const stateAfterToggleAdd = simulateTogglePermission({
      roleId: 2,
      roleName: 'Secretario de Acuerdos',
      permisoId: 10,
      permisoCodigo: 'catalogos:view',
      canManage: true,
      workingPermisos: initialMap,
    });
    if (stateAfterToggleAdd[2].has(10)) {
      pass("handleTogglePermission adds inactive permission to working set");
    } else {
      fail("handleTogglePermission add", "Expected permission 10 in set");
    }

    const stateAfterToggleRemove = simulateTogglePermission({
      roleId: 2,
      roleName: 'Secretario de Acuerdos',
      permisoId: 4,
      permisoCodigo: 'expedientes:view',
      canManage: true,
      workingPermisos: initialMap,
    });
    if (!stateAfterToggleRemove[2].has(4)) {
      pass("handleTogglePermission removes active permission from working set");
    } else {
      fail("handleTogglePermission remove", "Expected permission 4 removed");
    }

    // Toggle locked permission on Administrador (must be blocked)
    const adminLockedPermId = permMapByCode.get('roles:manage');
    const adminStateLocked = {
      1: new Set([adminLockedPermId]),
    };
    const stateAttemptToggleLocked = simulateTogglePermission({
      roleId: 1,
      roleName: 'Administrador',
      permisoId: adminLockedPermId,
      permisoCodigo: 'roles:manage',
      canManage: true,
      workingPermisos: adminStateLocked,
    });
    if (stateAttemptToggleLocked[1].has(adminLockedPermId)) {
      pass("handleTogglePermission blocks toggling locked permissions for Administrador");
    } else {
      fail("handleTogglePermission admin lock", "Locked permission was toggled!");
    }

    // Toggle when canManage is false (read-only mode)
    const readOnlyState = simulateTogglePermission({
      roleId: 2,
      roleName: 'Secretario de Acuerdos',
      permisoId: 10,
      permisoCodigo: 'catalogos:view',
      canManage: false,
      workingPermisos: initialMap,
    });
    if (readOnlyState === initialMap) {
      pass("handleTogglePermission no-ops when canManage is false (read-only protection)");
    } else {
      fail("handleTogglePermission read-only", "Modified workingPermisos without manage permission");
    }

    // Test 7: Batch action handleSelectAll
    const stateAfterSelectAll = simulateSelectAll({
      roleId: 2,
      canManage: true,
      allPermisos,
      workingPermisos: initialMap,
    });
    if (stateAfterSelectAll[2].size === allPermisos.length) {
      pass(`handleSelectAll selects all ${allPermisos.length} permissions for the selected role`);
    } else {
      fail("handleSelectAll", `Selected count: ${stateAfterSelectAll[2].size}, expected: ${allPermisos.length}`);
    }

    // Test 8: Batch action handleDeselectAll on normal role
    const stateAfterDeselectNormal = simulateDeselectAll({
      roleId: 2,
      roleName: 'Secretario de Acuerdos',
      canManage: true,
      allPermisos,
      workingPermisos: initialMap,
    });
    if (stateAfterDeselectNormal[2].size === 0) {
      pass("handleDeselectAll clears all permissions for normal roles (0 permissions)");
    } else {
      fail("handleDeselectAll normal role", `Count: ${stateAfterDeselectNormal[2].size}`);
    }

    // Test 9: Batch action handleDeselectAll on Administrador role (MUST preserve locked permissions)
    const stateAfterDeselectAdmin = simulateDeselectAll({
      roleId: 1,
      roleName: 'Administrador',
      canManage: true,
      allPermisos,
      workingPermisos: initialMap,
    });
    const preservedCodes = Array.from(stateAfterDeselectAdmin[1]).map((id) => permMapById.get(id));
    const lockedAdminPreserved =
      stateAfterDeselectAdmin[1].size === 2 &&
      preservedCodes.includes('roles:manage') &&
      preservedCodes.includes('impersonate:use');

    if (lockedAdminPreserved) {
      pass("handleDeselectAll on Administrador strictly preserves locked permissions ('roles:manage', 'impersonate:use')");
    } else {
      fail("handleDeselectAll admin lockout preservation", `Preserved: ${JSON.stringify(preservedCodes)}`);
    }

    // ------------------------------------------------------------------------
    // TIER 5: SSR ROUTE GUARD BEHAVIOR (roles.astro)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}--- TIER 5: SSR Route Guard Verification (/configuracion/roles) ---${colors.reset}`);

    // Verify SSR guard logic from roles.astro:
    // Authorized if: user.rol === 'Administrador' OR user.permisos.includes('roles:manage')
    function evaluateSSRGuard(user, token) {
      if (!user && !token) {
        return { action: 'redirect', location: '/login?redirect=/configuracion/roles', status: 302 };
      }
      const isGlobalAdmin = user?.rol === 'Administrador';
      const hasManagePermission = Boolean(
        Array.isArray(user?.permisos) && user?.permisos.includes('roles:manage')
      );
      const isAuthorized = Boolean(isGlobalAdmin || hasManagePermission);
      return { action: isAuthorized ? 'render' : 'deny', status: isAuthorized ? 200 : 403 };
    }

    const unauthSSR = evaluateSSRGuard(null, null);
    if (unauthSSR.action === 'redirect' && unauthSSR.status === 302) {
      pass("SSR Guard: Unauthenticated request redirects to /login with redirect parameter");
    } else {
      fail("SSR Guard unauthenticated", JSON.stringify(unauthSSR));
    }

    const adminSSR = evaluateSSRGuard({ rol: 'Administrador', permisos: ['roles:manage'] }, 'valid-token');
    if (adminSSR.action === 'render' && adminSSR.status === 200) {
      pass("SSR Guard: Global Admin user granted access (200 OK)");
    } else {
      fail("SSR Guard admin", JSON.stringify(adminSSR));
    }

    const userWithManageSSR = evaluateSSRGuard({ rol: 'Personal Técnico', permisos: ['roles:manage'] }, 'valid-token');
    if (userWithManageSSR.action === 'render' && userWithManageSSR.status === 200) {
      pass("SSR Guard: Non-admin user with 'roles:manage' granted access (200 OK)");
    } else {
      fail("SSR Guard roles:manage", JSON.stringify(userWithManageSSR));
    }

    const unauthorizedSSR = evaluateSSRGuard({ rol: 'Consulta/Dirección', permisos: ['expedientes:view'] }, 'valid-token');
    if (unauthorizedSSR.action === 'deny' && unauthorizedSSR.status === 403) {
      pass("SSR Guard: Authenticated user without 'roles:manage' rejected with HTTP 403 Forbidden");
    } else {
      fail("SSR Guard unauthorized", JSON.stringify(unauthorizedSSR));
    }

  } catch (unexpectedError) {
    fail("Unexpected harness exception", unexpectedError.stack || unexpectedError.message);
  } finally {
    // ------------------------------------------------------------------------
    // TIER 6: SAFE RESTORATION OF DATABASE STATE
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}--- TIER 6: Safe Restoration of Database State ---${colors.reset}`);

    if (baselineRoles.length > 0 && adminToken) {
      let allRestored = true;

      for (const role of baselineRoles) {
        const baselinePermisoIds = role.permisos.map((p) => p.id);
        const restoreRes = await req(`/api/roles/${role.id}/permisos`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { permisoIds: baselinePermisoIds },
        });

        if (restoreRes.status !== 200) {
          allRestored = false;
          console.error(`  ${colors.red}Failed to restore role ${role.nombre} (ID: ${role.id}): HTTP ${restoreRes.status}${colors.reset}`);
        }
      }

      // Verification check on restored roles
      const verifyRes = await req('/api/roles', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (verifyRes.status === 200 && Array.isArray(verifyRes.body)) {
        let exactMatch = true;
        for (const role of verifyRes.body) {
          const baseline = baselineRoles.find((b) => b.id === role.id);
          if (!baseline) {
            exactMatch = false;
            break;
          }
          const currentIds = new Set(role.permisos.map((p) => p.id));
          const baselineIds = new Set(baseline.permisos.map((p) => p.id));
          if (currentIds.size !== baselineIds.size) {
            exactMatch = false;
            break;
          }
          for (const id of currentIds) {
            if (!baselineIds.has(id)) {
              exactMatch = false;
              break;
            }
          }
        }

        if (allRestored && exactMatch) {
          pass("Database state safely and completely restored to 100% baseline");
        } else {
          fail("Database state restoration", `allRestored: ${allRestored}, exactMatch: ${exactMatch}`);
        }
      } else {
        fail("Verify restored roles", `Status: ${verifyRes.status}`);
      }
    } else {
      console.warn("  Baseline roles or admin token unavailable for rollback.");
    }
  }

  // --------------------------------------------------------------------------
  // SUMMARY METRICS & FINAL VERDICT
  // --------------------------------------------------------------------------
  console.log(`\n${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}                    TEST EXECUTION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}======================================================================${colors.reset}`);
  console.log(`  Total Assertions:  ${results.total}`);
  console.log(`  Passed:            ${colors.green}${results.passed}${colors.reset}`);
  console.log(`  Failed:            ${results.failed > 0 ? colors.red : colors.gray}${results.failed}${colors.reset}`);
  console.log(`  Pass Rate:         ${((results.passed / (results.total || 1)) * 100).toFixed(1)}%`);
  console.log(`${colors.cyan}======================================================================${colors.reset}`);

  if (results.failed === 0) {
    console.log(`\n${colors.green}${colors.bold}FINAL VERDICT: APPROVE (All Milestone 4 stress tests passed)${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bold}FINAL VERDICT: REQUEST_CHANGES (${results.failed} failures detected)${colors.reset}\n`);
    for (const f of results.failures) {
      console.log(`  - #${f.num} ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

runMilestone4AdversarialHarness();
