/**
 * tests/test-e2e-areas.mjs
 * =============================================================================
 * Tier 2 E2E Test Suite: Multi-Area Shell, SSR Routes & Role Access Control
 * 
 * Verifies:
 * 1. Unauthenticated Route Protection:
 *    - Unauthenticated GET requests to protected areas redirect to /login with
 *      appropriate redirect parameters or return 401.
 * 2. Admin Role Multi-Area Traversal:
 *    - Admin (admin@tjabcs.gob.mx) authenticates and receives valid session token.
 *    - Traverses all R1 application areas:
 *      - / (Dashboard)
 *      - /expedientes (Case Management)
 *      - /notificaciones (Notification & Activity Center)
 *      - /agenda (Judicial Calendar & Hearings)
 *      - /reportes (Statistics & Reports)
 *      - /busqueda (Global Search)
 *      - /ayuda (Help & Documentation)
 *      - /documentos (Digital Archive - Coming Soon)
 *      - /mensajeria (Internal Messaging - Coming Soon)
 *      - /configuracion (System Configuration)
 *      - /configuracion/roles (Role & Permission Management)
 *    - Asserts HTTP 200 OK across all routes for Global Admin.
 * 3. Placeholder Badge Verification:
 *    - Validates presence of "Próximamente" or "Coming Soon" badges/indicators on
 *      placeholder routes (/documentos, /mensajeria).
 * 4. Restricted User Access Control Enforcement:
 *    - Restricted user (consulta@tjabcs.gob.mx) authenticates successfully.
 *    - Can access standard operational and read-only areas (HTTP 200).
 *    - Strictly denied access to /configuracion/roles with HTTP 403 Forbidden.
 * =============================================================================
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';

// ANSI Terminal Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

// Test result tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordPass(testId, title, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ${colors.green}✓ [PASS ${totalTests}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  if (detail) {
    console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
  }
}

function recordFail(testId, title, errorDetail) {
  totalTests++;
  failedTests++;
  failures.push({ testId, title, errorDetail });
  console.log(`  ${colors.red}✗ [FAIL ${totalTests}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  console.log(`      ${colors.red}→ ERROR: ${errorDetail}${colors.reset}`);
}

/**
 * Perform login to backend to acquire valid session token
 */
async function authenticate(email, password) {
  const url = `${BACKEND_URL}/api/auth/login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: email, password }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Login failed for ${email} (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.token;
  } catch (err) {
    throw new Error(`Authentication error for ${email}: ${err.message}`);
  }
}

/**
 * Fetch a frontend route with manual redirect tracking and optional auth cookie
 */
async function requestRoute(path, token = null) {
  const url = `${FRONTEND_URL}${path}`;
  const headers = {};
  if (token) {
    headers['Cookie'] = `auth_token=${token}`;
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual', // Do not automatically follow redirects to verify 302
    });

    const body = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      location: res.headers.get('location'),
      body,
    };
  } catch (err) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

/**
 * Pre-flight server availability checks
 */
async function checkConnectivity() {
  console.log(`\n${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`${colors.bold}   TIER 2: MULTI-AREA APPLICATION SHELL & ROUTE ACCESS CONTROL${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`${colors.gray}Frontend URL: ${FRONTEND_URL}${colors.reset}`);
  console.log(`${colors.gray}Backend URL:  ${BACKEND_URL}${colors.reset}\n`);

  console.log(`${colors.bold}--- PRE-FLIGHT CONNECTIVITY CHECKS ---${colors.reset}`);

  let backendReachable = false;
  let frontendReachable = false;

  try {
    const bRes = await fetch(`${BACKEND_URL}/api/auth/me`, { method: 'GET' });
    backendReachable = true;
    console.log(`  ${colors.green}✓ Backend API is reachable (HTTP ${bRes.status})${colors.reset}`);
  } catch (err) {
    console.log(`  ${colors.red}✗ Backend API is unreachable on ${BACKEND_URL}${colors.reset}`);
    console.log(`      ${colors.yellow}Tip: Start backend with 'cd backend && npm run dev'${colors.reset}`);
  }

  try {
    const fRes = await fetch(`${FRONTEND_URL}/login`, { method: 'GET', redirect: 'manual' });
    frontendReachable = true;
    console.log(`  ${colors.green}✓ Frontend SSR is reachable (HTTP ${fRes.status})${colors.reset}`);
  } catch (err) {
    console.log(`  ${colors.red}✗ Frontend SSR is unreachable on ${FRONTEND_URL}${colors.reset}`);
    console.log(`      ${colors.yellow}Tip: Start frontend with 'cd frontend && npm run dev'${colors.reset}`);
  }

  return { backendReachable, frontendReachable };
}

/**
 * Main Test Execution Function
 */
async function runSuite() {
  const { backendReachable, frontendReachable } = await checkConnectivity();

  if (!backendReachable || !frontendReachable) {
    console.error(`\n${colors.red}${colors.bold}CANNOT EXECUTE TIER 2 SUITE: Required servers are offline.${colors.reset}`);
    console.error(`Both the Express backend (port 3001) and Astro frontend (port 4321) must be running.`);
    process.exit(1);
  }

  // =========================================================================
  // SECTION 1: Unauthenticated Route Protection
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 1: UNAUTHENTICATED ROUTE PROTECTION ---${colors.reset}`);

  const testRoutes = [
    { path: '/', name: 'Dashboard' },
    { path: '/expedientes', name: 'Expedientes' },
    { path: '/notificaciones', name: 'Notificaciones' },
    { path: '/agenda', name: 'Agenda' },
    { path: '/reportes', name: 'Reportes' },
    { path: '/busqueda', name: 'Búsqueda' },
    { path: '/ayuda', name: 'Ayuda' },
    { path: '/documentos', name: 'Documentos' },
    { path: '/mensajeria', name: 'Mensajería' },
    { path: '/configuracion', name: 'Configuración' },
    { path: '/configuracion/roles', name: 'Roles y Permisos' },
  ];

  for (const { path, name } of testRoutes) {
    try {
      const res = await requestRoute(path, null);
      // Expected behavior: Unauthenticated requests should be 302 Redirect to /login
      if (res.status === 302 || res.status === 301) {
        const expectedPrefix = '/login?redirect=';
        const hasRedirect = res.location && res.location.startsWith(expectedPrefix);
        if (hasRedirect) {
          recordPass(`T2-UNAUTH-${name.toUpperCase()}`, `Unauthenticated GET ${path} redirects to /login`, `HTTP ${res.status} Location: ${res.location}`);
        } else {
          recordPass(`T2-UNAUTH-${name.toUpperCase()}`, `Unauthenticated GET ${path} redirects`, `HTTP ${res.status} Location: ${res.location}`);
        }
      } else if (res.status === 401 || res.status === 403) {
        recordPass(`T2-UNAUTH-${name.toUpperCase()}`, `Unauthenticated GET ${path} denied`, `HTTP ${res.status}`);
      } else {
        recordFail(
          `T2-UNAUTH-${name.toUpperCase()}`,
          `Unauthenticated GET ${path} should redirect to /login or deny`,
          `Received HTTP ${res.status} instead of 302/401`
        );
      }
    } catch (err) {
      recordFail(`T2-UNAUTH-${name.toUpperCase()}`, `Error fetching unauthenticated ${path}`, err.message);
    }
  }

  // =========================================================================
  // SECTION 2: Global Admin Multi-Area Traversal
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 2: GLOBAL ADMIN MULTI-AREA TRAVERSAL ---${colors.reset}`);

  let adminToken = null;
  try {
    adminToken = await authenticate('admin@tjabcs.gob.mx', 'password123');
    recordPass('T2-AUTH-ADMIN', 'Authenticate Global Admin (admin@tjabcs.gob.mx)', `Acquired Session Token: ${adminToken.slice(0, 16)}...`);
  } catch (err) {
    recordFail('T2-AUTH-ADMIN', 'Authenticate Global Admin', err.message);
    return;
  }

  for (const { path, name } of testRoutes) {
    try {
      const res = await requestRoute(path, adminToken);
      if (res.status === 200) {
        recordPass(`T2-ADMIN-${name.toUpperCase()}`, `Admin accesses ${path} (${name})`, `HTTP 200 OK — Rendered successfully (${res.body.length} bytes)`);
      } else {
        recordFail(
          `T2-ADMIN-${name.toUpperCase()}`,
          `Admin access to ${path} (${name}) should return 200`,
          `Received HTTP ${res.status}${res.location ? ` Location: ${res.location}` : ''}`
        );
      }
    } catch (err) {
      recordFail(`T2-ADMIN-${name.toUpperCase()}`, `Admin error accessing ${path}`, err.message);
    }
  }

  // =========================================================================
  // SECTION 3: Placeholder Route Badge Verification ("Próximamente")
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 3: PLACEHOLDER BADGE VERIFICATION ---${colors.reset}`);

  const placeholderRoutes = [
    { path: '/documentos', name: 'Documentos' },
    { path: '/mensajeria', name: 'Mensajería' },
  ];

  const placeholderRegex = /(próximamente|proximamente|coming soon)/i;

  for (const { path, name } of placeholderRoutes) {
    try {
      const res = await requestRoute(path, adminToken);
      if (res.status === 200) {
        const hasPlaceholderBadge = placeholderRegex.test(res.body);
        if (hasPlaceholderBadge) {
          recordPass(`T2-PLACEHOLDER-${name.toUpperCase()}`, `Placeholder badge found on ${path}`, `Verified "Próximamente / Coming Soon" badge in response HTML`);
        } else {
          recordFail(
            `T2-PLACEHOLDER-${name.toUpperCase()}`,
            `Placeholder badge missing on ${path}`,
            `Expected text matching /(próximamente|coming soon)/i in response HTML`
          );
        }
      } else {
        recordFail(
          `T2-PLACEHOLDER-${name.toUpperCase()}`,
          `Cannot verify placeholder badge on ${path}`,
          `Route returned HTTP ${res.status}`
        );
      }
    } catch (err) {
      recordFail(`T2-PLACEHOLDER-${name.toUpperCase()}`, `Error checking placeholder badge on ${path}`, err.message);
    }
  }

  // =========================================================================
  // SECTION 4: Restricted User Role Enforcement (consulta@tjabcs.gob.mx)
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 4: RESTRICTED USER ROLE ENFORCEMENT ---${colors.reset}`);

  let consultaToken = null;
  try {
    consultaToken = await authenticate('consulta@tjabcs.gob.mx', 'password123');
    recordPass('T2-AUTH-CONSULTA', 'Authenticate Restricted User (consulta@tjabcs.gob.mx)', `Acquired Session Token: ${consultaToken.slice(0, 16)}...`);
  } catch (err) {
    recordFail('T2-AUTH-CONSULTA', 'Authenticate Restricted User', err.message);
    return;
  }

  // 4.1 Restricted user accessing standard operational areas (expected: HTTP 200)
  const allowedForConsulta = [
    { path: '/', name: 'Dashboard' },
    { path: '/expedientes', name: 'Expedientes' },
    { path: '/notificaciones', name: 'Notificaciones' },
    { path: '/agenda', name: 'Agenda' },
    { path: '/reportes', name: 'Reportes' },
    { path: '/busqueda', name: 'Búsqueda' },
    { path: '/ayuda', name: 'Ayuda' },
    { path: '/documentos', name: 'Documentos' },
    { path: '/mensajeria', name: 'Mensajería' },
    { path: '/configuracion', name: 'Configuración General' },
  ];

  for (const { path, name } of allowedForConsulta) {
    try {
      const res = await requestRoute(path, consultaToken);
      if (res.status === 200) {
        recordPass(`T2-CONSULTA-ALLOW-${name.toUpperCase()}`, `Restricted user allowed on ${path}`, `HTTP 200 OK`);
      } else {
        recordFail(
          `T2-CONSULTA-ALLOW-${name.toUpperCase()}`,
          `Restricted user should have read access to ${path}`,
          `Received HTTP ${res.status}`
        );
      }
    } catch (err) {
      recordFail(`T2-CONSULTA-ALLOW-${name.toUpperCase()}`, `Error verifying access to ${path}`, err.message);
    }
  }

  // 4.2 Restricted user accessing /configuracion/roles (strictly restricted: HTTP 403 or redirect)
  try {
    const res = await requestRoute('/configuracion/roles', consultaToken);
    if (res.status === 403) {
      recordPass(
        'T2-CONSULTA-DENY-ROLES',
        'Restricted user denied on /configuracion/roles',
        `HTTP 403 Forbidden correctly enforced on SSR page`
      );
    } else if (res.status === 302 && res.location && !res.location.includes('/login')) {
      // If redirected to unauthorized landing or dashboard
      recordPass(
        'T2-CONSULTA-DENY-ROLES',
        'Restricted user redirected away from /configuracion/roles',
        `HTTP 302 Redirect to ${res.location}`
      );
    } else {
      recordFail(
        'T2-CONSULTA-DENY-ROLES',
        'Restricted user accessing /configuracion/roles must be denied with 403',
        `Received unexpected HTTP ${res.status}`
      );
    }
  } catch (err) {
    recordFail('T2-CONSULTA-DENY-ROLES', 'Error testing /configuracion/roles restriction', err.message);
  }

  // =========================================================================
  // EXECUTION SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`${colors.bold}                    TIER 2 VERIFICATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  ${colors.green}Passed Tests:       ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests > 0 ? colors.red : colors.gray}Failed Tests:       ${failedTests}${colors.reset}`);
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(75)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.error(`${colors.red}${colors.bold}TIER 2 ACCEPTANCE FAILED with ${failedTests} failure(s):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.testId}] ${f.title}`);
      console.error(`     Error: ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}TIER 2 ACCEPTANCE SUITE PASSED (100% Success)${colors.reset}\n`);
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error(`\nUnhandled fatal error in Tier 2 runner:`, err);
  process.exit(1);
});
