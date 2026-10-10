/**
 * tests/forensic_auditor_m4.test.mjs
 * =============================================================================
 * Independent Forensic Integrity Audit Test Suite for Milestone 4
 * Author: Forensic Auditor (auditor_m4)
 * Focus: Role Configuration UI, Astro SSR Guarding, Lockout Prevention, RBAC Contracts
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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

function check(title, condition, detailIfPass = '', errorIfFail = '') {
  if (condition) {
    pass(title, detailIfPass);
  } else {
    fail(title, errorIfFail || 'Assertion failed');
  }
}

async function runForensicAuditM4() {
  console.log('\n\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1mINDEPENDENT FORENSIC INTEGRITY AUDIT — MILESTONE 4\x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m\n');

  // ---------------------------------------------------------------------------
  // SECTION 1: ANTI-CHEAT & PROHIBITED PATTERN DETECTION
  // ---------------------------------------------------------------------------
  console.log('--- AUDIT CHECK 1: ANTI-CHEAT & PROHIBITED PATTERNS ---');

  const m4Files = [
    path.join(projectRoot, 'frontend/src/components/RoleConfiguration.tsx'),
    path.join(projectRoot, 'frontend/src/pages/configuracion/roles.astro'),
    path.join(projectRoot, 'frontend/src/pages/configuracion.astro'),
    path.join(projectRoot, 'frontend/src/layouts/Layout.astro'),
  ];

  for (const filePath of m4Files) {
    const relPath = path.relative(projectRoot, filePath);
    check(
      `File existence: ${relPath}`,
      fs.existsSync(filePath),
      `Verified exists (${fs.statSync(filePath).size} bytes)`,
      `File does not exist: ${filePath}`
    );

    const content = fs.readFileSync(filePath, 'utf-8');

    // 1.1 No hardcoded test pass strings
    check(
      `No hardcoded test passes or fake assertions in ${relPath}`,
      !content.includes('PASS') && !content.includes('test-pass') && !content.includes('fake-pass'),
      'Clean: No test pass strings found'
    );

    // 1.2 No mock results or fake data arrays
    check(
      `No mock data arrays or stubs in ${relPath}`,
      !/mockRoles|mockPermisos|fakeData|dummyRoles/i.test(content),
      'Clean: No mock or stub identifiers found'
    );

    // 1.3 No test runner detection branches
    check(
      `No test runner detection in ${relPath}`,
      !/navigator\.webdriver|process\.env\.TEST|import\.meta\.env\.TEST|window\.__coverage__/i.test(content),
      'Clean: No test-runner sniffing branches found'
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: RoleConfiguration.tsx GENUINE API CONSUMPTION & STATE BINDING
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT CHECK 2: RoleConfiguration.tsx GENUINE API CONSUMPTION ---');
  const roleConfigContent = fs.readFileSync(m4Files[0], 'utf-8');

  // 2.1 Genuine GET /api/roles call
  check(
    'Calls GET /api/roles via apiFetch',
    roleConfigContent.includes("apiFetch('/api/roles')") || roleConfigContent.includes('apiFetch("/api/roles")'),
    'Found apiFetch(\'/api/roles\') in loadData()'
  );

  // 2.2 Genuine GET /api/permisos call
  check(
    'Calls GET /api/permisos via apiFetch',
    roleConfigContent.includes("apiFetch('/api/permisos')") || roleConfigContent.includes('apiFetch("/api/permisos")'),
    'Found apiFetch(\'/api/permisos\') in loadData()'
  );

  // 2.3 Genuine PUT /api/roles/:id/permisos call
  check(
    'Calls PUT /api/roles/:id/permisos with dynamic role ID',
    /apiFetch\(`\/api\/roles\/\$\{selectedRoleId\}\/permisos`,\s*\{\s*method:\s*['"]PUT['"]/s.test(roleConfigContent),
    'Found apiFetch(`/api/roles/${selectedRoleId}/permisos`, { method: \'PUT\', ... }) in handleSavePermissions()'
  );

  // 2.4 Payload matches backend interface contract { permisoIds: number[] }
  check(
    'Sends { permisoIds: number[] } body payload conforming to PROJECT.md',
    roleConfigContent.includes('JSON.stringify({ permisoIds })') || roleConfigContent.includes('body: JSON.stringify({ permisoIds })'),
    'Payload is JSON.stringify({ permisoIds })'
  );

  // 2.5 Dynamic UI state binding to database response
  check(
    'Binds server response to React state (roles, allPermisos, workingPermisos, originalPermisos)',
    roleConfigContent.includes('setRoles(rolesData)') &&
    roleConfigContent.includes('setAllPermisos(permisosData)') &&
    roleConfigContent.includes('setWorkingPermisos') &&
    roleConfigContent.includes('setOriginalPermisos'),
    'Verified state setters for server-provided role and permission datasets'
  );

  // 2.6 Active session synchronization on self-role permission update
  check(
    'Synchronizes active user session when modifying own role',
    roleConfigContent.includes("currentUser.rol === selectedRole.nombre") &&
    roleConfigContent.includes("apiFetch('/api/auth/me')") &&
    roleConfigContent.includes('setSession('),
    'Verified session sync invokes GET /api/auth/me and setSession'
  );

  // 2.7 Dirty state tracking and beforeunload prompt
  check(
    'Maintains dirty-state tracking with beforeunload guard',
    roleConfigContent.includes('isRoleDirty') &&
    roleConfigContent.includes("window.addEventListener('beforeunload'"),
    'Verified isRoleDirty logic and beforeunload event listener'
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: configuracion/roles.astro SSR ROUTE GUARD & HTTP 403 HANDLING
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT CHECK 3: configuracion/roles.astro SSR GUARDING & 403 STATUS ---');
  const rolesAstroContent = fs.readFileSync(m4Files[1], 'utf-8');

  // 3.1 Evaluates authentication
  check(
    'Evaluates authentication defensively on SSR',
    rolesAstroContent.includes('Astro.locals.user') &&
    rolesAstroContent.includes('Astro.locals.token') &&
    rolesAstroContent.includes("return Astro.redirect('/login?redirect="),
    'Redirects unauthenticated requests to /login?redirect=...'
  );

  // 3.2 Evaluates roles:manage or Administrador
  check(
    'Evaluates authorization for Administrador OR roles:manage',
    rolesAstroContent.includes("user?.rol === 'Administrador'") &&
    rolesAstroContent.includes("user?.permisos.includes('roles:manage')"),
    'Strictly checks user.rol === \'Administrador\' || user.permisos.includes(\'roles:manage\')'
  );

  // 3.3 Explicitly sets HTTP 403 response status
  check(
    'Explicitly sets Astro.response.status = 403 for unauthorized requests',
    rolesAstroContent.includes('Astro.response.status = 403;'),
    'Sets Astro.response.status = 403 on !isAuthorized'
  );

  // 3.4 Completely withholds <RoleConfiguration /> island on unauthorized access
  check(
    'Withholds RoleConfiguration island from unauthorized output',
    rolesAstroContent.includes('{isAuthorized ? (') &&
    rolesAstroContent.includes('<RoleConfiguration client:load />') &&
    rolesAstroContent.includes('Acceso Denegado (HTTP 403)'),
    'Protected component rendered strictly when isAuthorized is true; 403 card otherwise'
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: ADMIN LOCKOUT PROTECTION (DEFENSE-IN-DEPTH)
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT CHECK 4: ADMIN LOCKOUT PROTECTION FIDELITY ---');

  // 4.1 Client-side lockout protection in RoleConfiguration.tsx
  check(
    'Client protects roles:manage and impersonate:use from removal in Administrador role',
    roleConfigContent.includes("LOCKED_ADMIN_CODES = ['roles:manage', 'impersonate:use']") &&
    roleConfigContent.includes('isPermissionLocked') &&
    roleConfigContent.includes('handleDeselectAll'),
    'LOCKED_ADMIN_CODES defined, inspected in toggle handler, and preserved in deselect-all'
  );

  // 4.2 UI Lock indicator and security notice
  check(
    'Renders explicit Lock icon and security callout banner for Administrador',
    roleConfigContent.includes('Protección contra Bloqueo Administrativo') &&
    roleConfigContent.includes('Protegido'),
    'Visual warning banner and "Protegido" lock badge rendered'
  );

  // 4.3 Backend server-side lockout protection in backend/src/routes/roles.ts
  const backendRolesRoutePath = path.join(projectRoot, 'backend/src/routes/roles.ts');
  const backendRolesContent = fs.readFileSync(backendRolesRoutePath, 'utf-8');
  check(
    'Backend independently enforces admin lockout protection with HTTP 400',
    backendRolesContent.includes("targetRole.nombre === 'Administrador'") &&
    backendRolesContent.includes("requiredAdminCodes = ['roles:manage', 'impersonate:use']") &&
    backendRolesContent.includes('res.status(400).json({') &&
    backendRolesContent.includes('Protección de seguridad: No se puede remover el permiso'),
    'Backend strictly forbids stripping locked codes from Administrador role via HTTP 400'
  );

  // ---------------------------------------------------------------------------
  // SECTION 5: NAVIGATION & LAYOUT INTEGRATION
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT CHECK 5: NAVIGATION & LAYOUT INTEGRATION ---');
  const layoutContent = fs.readFileSync(m4Files[3], 'utf-8');
  const configContent = fs.readFileSync(m4Files[2], 'utf-8');

  // 5.1 Layout.astro active path calculation prevents collision
  check(
    'Layout.astro route matching avoids collision between /configuracion and /configuracion/roles',
    layoutContent.includes("isRolesActive = pathname.startsWith('/configuracion/roles')") &&
    layoutContent.includes("isConfiguracionActive = pathname.startsWith('/configuracion') && !isRolesActive"),
    'isConfiguracionActive explicitly checks !isRolesActive'
  );

  // 5.2 Layout.astro conditional sidebar link for roles:manage
  check(
    'Layout.astro guards "Roles y Permisos" menu item with canManageRoles',
    layoutContent.includes("canManageRoles = Boolean(") &&
    layoutContent.includes("(canManageRoles || isRolesActive) &&") &&
    layoutContent.includes('href="/configuracion/roles"'),
    'Sidebar link conditionally rendered for users with roles:manage or Administrador'
  );

  // 5.3 configuracion.astro links to /configuracion/roles
  check(
    'configuracion.astro provides navigation card pointing to /configuracion/roles',
    configContent.includes('href="/configuracion/roles"') &&
    configContent.includes('Seguridad y Roles'),
    'Configuration hub includes "Seguridad y Roles" section card'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY & AUDIT VERDICT
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1m                    FORENSIC AUDIT SUMMARY                          \x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m');
  console.log(`  Total Checks:    ${results.total}`);
  console.log(`  Passed Checks:   \x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Checks:   ${results.failed > 0 ? '\x1b[31m' : '\x1b[32m'}${results.failed}\x1b[0m`);
  console.log(`  Pass Rate:       ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log('\x1b[35m====================================================================\x1b[0m\n');

  if (results.failed > 0) {
    console.error('\x1b[31mVERDICT: INTEGRITY VIOLATION\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mVERDICT: CLEAN\x1b[0m');
    process.exit(0);
  }
}

runForensicAuditM4().catch((err) => {
  console.error('Fatal error during forensic audit:', err);
  process.exit(1);
});
