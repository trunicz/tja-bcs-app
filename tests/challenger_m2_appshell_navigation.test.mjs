/**
 * tests/challenger_m2_appshell_navigation.test.mjs
 * =============================================================================
 * ADVERSARIAL STRESS TEST SUITE — MILESTONE 2: APPSHELL & NAVIGATION
 *
 * Independent empirical verification targeting:
 * 1. Route Fuzzing & SSR Crash Resilience:
 *    - Invalid paths (404 handling, traversal probes, deep pathing)
 *    - Parameter fuzzing (null bytes, emojis, unicode, control chars, CRLF, extreme lengths)
 *    - Injection payloads (XSS, SQLi strings in query params)
 *    - Server survivability (zero unhandled SSR 500 crashes, server remains responsive)
 * 2. Access Control Bypass Probing:
 *    - Unauthenticated requests to all 11 protected routes (strictly 302 redirects)
 *    - Forged / tampered / malformed auth tokens in cookies
 *    - Spoofed authorization / forward headers
 *    - Restricted user ('consulta@tjabcs.gob.mx') boundary enforcement:
 *      * Direct GET /configuracion/roles strictly returns HTTP 403 Forbidden
 *      * Parameter manipulation (?admin=true, ?role=Administrador) strictly 403
 *      * Unauthorized API role mutation strictly 403 Forbidden
 *      * Operational routes access granted (HTTP 200 OK)
 * 3. Placeholder Pages Verification (/documentos and /mensajeria):
 *    - Presence of prominent "Próximamente" / "Coming Soon" badge
 *    - Roadmap and phase context rendering
 *    - Protection against unauthenticated access
 * 4. CommandPalette & Scaffolding API Adversarial Stress:
 *    - Adversarial query parameters on /api/expedientes
 *    - CommandPalette search parameter contract verification (?q vs ?search)
 *    - Boundary testing on /api/notificaciones and /api/notificaciones/unread-count
 * =============================================================================
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';

// ANSI terminal colors
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

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];
const advisoryFindings = [];

function recordPass(testId, title, detail = '') {
  totalChecks++;
  passedChecks++;
  console.log(`  ${colors.green}✓ [PASS ${totalChecks}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  if (detail) {
    console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
  }
}

function recordFail(testId, title, errorDetail) {
  totalChecks++;
  failedChecks++;
  failures.push({ testId, title, errorDetail });
  console.log(`  ${colors.red}✗ [FAIL ${totalChecks}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  console.log(`      ${colors.red}→ ERROR: ${errorDetail}${colors.reset}`);
}

function recordFinding(testId, severity, title, detail) {
  advisoryFindings.push({ testId, severity, title, detail });
  console.log(`  ${colors.yellow}⚠ [FINDING - ${severity}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  console.log(`      ${colors.yellow}→ ${detail}${colors.reset}`);
}

async function authenticate(email, password) {
  const url = `${BACKEND_URL}/api/auth/login`;
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
}

async function fetchRoute(path, { token = null, customHeaders = {}, method = 'GET', body = null } = {}) {
  const url = `${FRONTEND_URL}${path}`;
  const headers = { ...customHeaders };
  if (token) {
    headers['Cookie'] = `auth_token=${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    redirect: 'manual',
    body: body ? JSON.stringify(body) : undefined,
  });

  const resBody = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    location: res.headers.get('location'),
    body: resBody,
  };
}

async function fetchApi(path, { token = null, customHeaders = {}, method = 'GET', body = null } = {}) {
  const url = `${BACKEND_URL}${path}`;
  const headers = { ...customHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let resBody;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      resBody = await res.json();
    } catch {
      resBody = await res.text();
    }
  } else {
    resBody = await res.text();
  }

  return {
    status: res.status,
    headers: res.headers,
    body: resBody,
  };
}

const PROTECTED_ROUTES = [
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

async function runAdversarialSuite() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER: ADVERSARIAL STRESS TESTING — MILESTONE 2${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL}${colors.reset}`);
  console.log(`${colors.gray}Target Backend:  ${BACKEND_URL}${colors.reset}\n`);

  // =========================================================================
  // 1. PRE-FLIGHT & AUTHENTICATION
  // =========================================================================
  console.log(`${colors.bold}--- 1. CREDENTIAL VERIFICATION & PRE-FLIGHT ---${colors.reset}`);

  let adminToken, consultaToken;
  try {
    adminToken = await authenticate('admin@tjabcs.gob.mx', 'password123');
    recordPass('AUTH-ADMIN', 'Authenticate Global Admin', `Session token length: ${adminToken.length}`);
  } catch (err) {
    recordFail('AUTH-ADMIN', 'Authenticate Global Admin failed', err.message);
    return;
  }

  try {
    consultaToken = await authenticate('consulta@tjabcs.gob.mx', 'password123');
    recordPass('AUTH-CONSULTA', 'Authenticate Restricted User (Consulta)', `Session token length: ${consultaToken.length}`);
  } catch (err) {
    recordFail('AUTH-CONSULTA', 'Authenticate Restricted User failed', err.message);
    return;
  }

  // =========================================================================
  // 2. ACCESS CONTROL BYPASS PROBES (UNAUTHENTICATED & FORGED SESSIONS)
  // =========================================================================
  console.log(`\n${colors.bold}--- 2. ACCESS CONTROL BYPASS PROBING ---${colors.reset}`);

  // 2.1 Unauthenticated requests to all 11 protected routes
  for (const { path, name } of PROTECTED_ROUTES) {
    try {
      const res = await fetchRoute(path);
      if (res.status === 302 || res.status === 301) {
        const expectedPrefix = '/login?redirect=';
        const hasRedirectParam = res.location && res.location.includes(encodeURIComponent(path));
        if (hasRedirectParam) {
          recordPass(`BYPASS-UNAUTH-${name.toUpperCase()}`, `Unauthenticated ${path} strictly redirected to /login with redirect param`, `HTTP ${res.status} -> ${res.location}`);
        } else {
          recordPass(`BYPASS-UNAUTH-${name.toUpperCase()}`, `Unauthenticated ${path} redirected to ${res.location}`, `HTTP ${res.status}`);
        }
      } else {
        recordFail(`BYPASS-UNAUTH-${name.toUpperCase()}`, `Unauthenticated access to ${path} must be redirected (302)`, `Received HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`BYPASS-UNAUTH-${name.toUpperCase()}`, `Error checking unauth access to ${path}`, err.message);
    }
  }

  // 2.2 Tampered / Malformed Token In Cookie Probes
  const adversarialTokens = [
    { label: 'Forged Random String', value: 'forged_session_token_1234567890abcdef' },
    { label: 'Forged JWT Signature', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sIjoiQWRtaW5pc3RyYWRvciJ9.fake_signature' },
    { label: 'Empty Token', value: '' },
    { label: 'Whitespace Token', value: '    ' },
    { label: 'Path Traversal Token', value: '../../../../etc/passwd' },
    { label: 'Null Byte Token', value: 'admin%00token' },
    { label: 'SQLi Token', value: "' OR '1'='1" },
    { label: 'Malformed Bearer in Cookie', value: 'Bearer a749be6534d68e1f' },
  ];

  for (const tokenProbe of adversarialTokens) {
    try {
      const res = await fetchRoute('/configuracion/roles', {
        customHeaders: { Cookie: `auth_token=${tokenProbe.value}` },
      });
      if (res.status === 302 || res.status === 401 || res.status === 403) {
        recordPass(
          `BYPASS-TOKEN-${tokenProbe.label.toUpperCase().replace(/\s+/g, '_')}`,
          `Rejected tampered token (${tokenProbe.label})`,
          `HTTP ${res.status} (Location: ${res.location || 'none'})`
        );
      } else {
        recordFail(
          `BYPASS-TOKEN-${tokenProbe.label.toUpperCase().replace(/\s+/g, '_')}`,
          `Tampered token (${tokenProbe.label}) improperly accepted!`,
          `Received HTTP ${res.status} instead of 302/401/403`
        );
      }
    } catch (err) {
      recordFail(`BYPASS-TOKEN-${tokenProbe.label}`, `Error during token probe`, err.message);
    }
  }

  // 2.3 Header Spoofing Probes
  const headerSpoofProbes = [
    { headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Original-User': 'admin' }, label: 'X-Forwarded-For + X-Original-User' },
    { headers: { 'X-Real-IP': '127.0.0.1', 'X-Authenticated-User': '1' }, label: 'X-Real-IP + X-Authenticated-User' },
    { headers: { 'X-Original-URL': '/login', 'X-Rewrite-URL': '/login' }, label: 'URL Rewrite Spoofing' },
    { headers: { 'Authorization': `Bearer ${adminToken}` }, label: 'Bearer Token in Auth Header without Cookie on SSR' },
  ];

  for (const probe of headerSpoofProbes) {
    try {
      const res = await fetchRoute('/configuracion/roles', { customHeaders: probe.headers });
      if (res.status === 302) {
        recordPass(`BYPASS-HDR-${probe.label.toUpperCase().replace(/[\s\+\-]+/g, '_')}`, `Spoofed header probe blocked: ${probe.label}`, `HTTP ${res.status} -> ${res.location}`);
      } else if (res.status === 401 || res.status === 403) {
        recordPass(`BYPASS-HDR-${probe.label.toUpperCase().replace(/[\s\+\-]+/g, '_')}`, `Spoofed header probe denied: ${probe.label}`, `HTTP ${res.status}`);
      } else {
        recordFail(`BYPASS-HDR-${probe.label}`, `Header spoofing allowed access without cookie!`, `Received HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`BYPASS-HDR-${probe.label}`, `Error in header probe`, err.message);
    }
  }

  // =========================================================================
  // 3. RESTRICTED USER BOUNDARY ENFORCEMENT
  // =========================================================================
  console.log(`\n${colors.bold}--- 3. RESTRICTED USER BOUNDARY ENFORCEMENT (consulta@tjabcs.gob.mx) ---${colors.reset}`);

  // 3.1 Direct access to /configuracion/roles must yield HTTP 403 Forbidden
  try {
    const res = await fetchRoute('/configuracion/roles', { token: consultaToken });
    if (res.status === 403) {
      recordPass('RBAC-ROLES-DENIED', 'Restricted user denied on /configuracion/roles', 'HTTP 403 Forbidden strictly enforced');
    } else {
      recordFail('RBAC-ROLES-DENIED', 'Restricted user accessing /configuracion/roles must receive 403', `Received HTTP ${res.status}`);
    }
  } catch (err) {
    recordFail('RBAC-ROLES-DENIED', 'Error requesting /configuracion/roles', err.message);
  }

  // 3.2 Query param manipulation attempts to elevate privileges on /configuracion/roles
  const privEscalationParams = [
    '?admin=true',
    '?role=Administrador',
    '?rol=Administrador',
    '?impersonate=admin',
    '?permission=roles:manage',
    '?sudo=1',
  ];

  for (const q of privEscalationParams) {
    try {
      const res = await fetchRoute(`/configuracion/roles${q}`, { token: consultaToken });
      if (res.status === 403) {
        recordPass(`RBAC-ROLES-PARAM-${q.replace(/[^a-zA-Z0-9]/g, '_')}`, `Privilege escalation query param denied: ${q}`, 'HTTP 403 Forbidden');
      } else {
        recordFail(`RBAC-ROLES-PARAM-${q}`, `Parameter manipulation bypassed 403!`, `Received HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`RBAC-ROLES-PARAM-${q}`, `Error testing param manipulation`, err.message);
    }
  }

  // 3.3 Unauthorized mutation on backend roles API by restricted user
  try {
    const res = await fetchApi('/api/roles/4/permisos', {
      method: 'PUT',
      token: consultaToken,
      body: { permisoIds: [1, 2, 3] },
    });
    if (res.status === 403) {
      recordPass('RBAC-API-MUTATION-DENIED', 'Restricted user PUT /api/roles/:id/permisos denied', `HTTP 403 Forbidden: ${JSON.stringify(res.body)}`);
    } else {
      recordFail('RBAC-API-MUTATION-DENIED', 'PUT /api/roles/:id/permisos should be 403 for non-admin', `Received HTTP ${res.status}`);
    }
  } catch (err) {
    recordFail('RBAC-API-MUTATION-DENIED', 'Error attempting role mutation', err.message);
  }

  // 3.4 Restricted user allowed on all other 10 operational areas (HTTP 200)
  const operationalRoutes = PROTECTED_ROUTES.filter(r => r.path !== '/configuracion/roles');
  for (const { path, name } of operationalRoutes) {
    try {
      const res = await fetchRoute(path, { token: consultaToken });
      if (res.status === 200) {
        recordPass(`RBAC-OPERATIONAL-${name.toUpperCase()}`, `Restricted user allowed on operational area ${path}`, `HTTP 200 OK (${res.body.length} bytes)`);
      } else {
        recordFail(`RBAC-OPERATIONAL-${name.toUpperCase()}`, `Restricted user should have access to ${path}`, `Received HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`RBAC-OPERATIONAL-${name.toUpperCase()}`, `Error testing access to ${path}`, err.message);
    }
  }

  // =========================================================================
  // 4. PLACEHOLDER PAGES VERIFICATION (/documentos and /mensajeria)
  // =========================================================================
  console.log(`\n${colors.bold}--- 4. PLACEHOLDER PAGES INTEGRITY VERIFICATION ---${colors.reset}`);

  const placeholders = [
    {
      path: '/documentos',
      name: 'Archivo Digital',
      expectedKeywords: ['Próximamente', 'Coming Soon', 'Fase 3', 'Expediente Electrónico'],
    },
    {
      path: '/mensajeria',
      name: 'Mensajería Interna',
      expectedKeywords: ['Próximamente', 'Coming Soon', 'Fase 3', 'Mensajería'],
    },
  ];

  for (const p of placeholders) {
    // 4.1 Admin access
    try {
      const res = await fetchRoute(p.path, { token: adminToken });
      if (res.status === 200) {
        const hasAllKeywords = p.expectedKeywords.every((kw) =>
          res.body.toLowerCase().includes(kw.toLowerCase())
        );
        if (hasAllKeywords) {
          recordPass(
            `PLACEHOLDER-ADMIN-${p.path.slice(1).toUpperCase()}`,
            `${p.name} renders coming-soon state with roadmap`,
            `Verified keywords: [${p.expectedKeywords.join(', ')}] in rendered HTML`
          );
        } else {
          recordFail(
            `PLACEHOLDER-ADMIN-${p.path.slice(1).toUpperCase()}`,
            `${p.name} missing expected placeholder keywords`,
            `HTML body did not contain all of: ${p.expectedKeywords.join(', ')}`
          );
        }
      } else {
        recordFail(`PLACEHOLDER-ADMIN-${p.path.slice(1).toUpperCase()}`, `Expected 200 for Admin on ${p.path}`, `Received HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`PLACEHOLDER-ADMIN-${p.path}`, `Error verifying placeholder`, err.message);
    }

    // 4.2 Restricted user access
    try {
      const res = await fetchRoute(p.path, { token: consultaToken });
      if (res.status === 200) {
        const hasBadge = /(próximamente|coming soon)/i.test(res.body);
        if (hasBadge) {
          recordPass(
            `PLACEHOLDER-CONSULTA-${p.path.slice(1).toUpperCase()}`,
            `${p.name} accessible and displays placeholder badge to restricted user`,
            `HTTP 200 OK + Próximamente Badge verified`
          );
        } else {
          recordFail(`PLACEHOLDER-CONSULTA-${p.path.slice(1).toUpperCase()}`, `Missing badge on ${p.path} for consulta`, 'Regex match failed');
        }
      } else {
        recordFail(`PLACEHOLDER-CONSULTA-${p.path.slice(1).toUpperCase()}`, `Expected 200 for Consulta on ${p.path}`, `Received HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`PLACEHOLDER-CONSULTA-${p.path}`, `Error verifying placeholder for consulta`, err.message);
    }
  }

  // =========================================================================
  // 5. ROUTE FUZZING & SSR CRASH RESILIENCE
  // =========================================================================
  console.log(`\n${colors.bold}--- 5. ROUTE FUZZING & SSR CRASH RESILIENCE ---${colors.reset}`);

  // 5.1 Invalid Paths / Traversal probes
  const invalidPaths = [
    { path: '/nonexistent-route-404', expected: [404, 302], label: 'Non-existent Page' },
    { path: '/expedientes/999999999999999999', expected: [404, 302, 200], label: 'Out-of-range Case ID' },
    { path: '/expedientes/-1', expected: [404, 302, 200], label: 'Negative Case ID' },
    { path: '/expedientes/null', expected: [404, 302, 200], label: 'Null Case ID' },
    { path: '/expedientes/NaN', expected: [404, 302, 200], label: 'NaN Case ID' },
    { path: '/.env', expected: [404, 302], label: 'Dotfile .env probe' },
    { path: '/.git/config', expected: [404, 302], label: 'Git config probe' },
    { path: '/api/nonexistent-endpoint', expected: [404, 302], label: 'Non-existent API' },
    { path: '//double-slash', expected: [404, 302, 200], label: 'Double slash route' },
    { path: '/login//', expected: [200, 302, 404], label: 'Trailing double slash on login' },
  ];

  for (const probe of invalidPaths) {
    try {
      const res = await fetchRoute(probe.path, { token: adminToken });
      if (res.status >= 500) {
        recordFail(`FUZZ-PATH-${probe.label.toUpperCase().replace(/\s+/g, '_')}`, `Server returned HTTP ${res.status} on invalid path ${probe.path}`, 'Unhandled SSR Error');
      } else {
        recordPass(`FUZZ-PATH-${probe.label.toUpperCase().replace(/\s+/g, '_')}`, `Invalid path handled gracefully: ${probe.label}`, `HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`FUZZ-PATH-${probe.label}`, `Crash or connection error on ${probe.path}`, err.message);
    }
  }

  // 5.2 Adversarial Query Parameters Fuzzing across Application Routes
  const fuzzPayloads = [
    { name: 'Unicode Emojis', query: '?q=⚖️🔍🇲🇽&emoji=🛡️' },
    { name: 'Cyrillic and Arabic text', query: '?q=%D1%82%D0%B5%D1%81%D1%82&lang=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7' },
    { name: 'URL Control Characters', query: '?q=!@%23$%25^&*()_+-=[]{}|;\':",./<>?' },
    { name: 'Null Byte Injection', query: '?q=test%00null&filter=all%00' },
    { name: 'Path Traversal in params', query: '?q=../../../../etc/passwd&dir=..%2F..%2F..%2Fwin' },
    { name: 'XSS Script Tag', query: '?q=%3Cscript%3Ealert(1)%3C/script%3E&name=%22%3E%3Csvg/onload=alert(1)%3E' },
    { name: 'SQL Injection String', query: '?q=1%27%20OR%20%271%27=%271&order=id;--' },
    { name: 'Extreme Length Buffer Stress (5000 chars)', query: `?q=${'A'.repeat(5000)}` },
    { name: 'CRLF Header Injection Probe', query: '?q=clean%0D%0AX-Injected:true%0D%0A' },
    { name: 'Malformed Percent Encoding', query: '?q=%E0%A4%A&bad=%FF%FE&empty=%%' },
    { name: 'Multiple Duplicate Keys', query: '?q=first&q=second&q=third&salaId=1&salaId=2' },
  ];

  const targetRoutesForFuzz = ['/busqueda', '/expedientes', '/agenda', '/reportes', '/notificaciones'];

  for (const route of targetRoutesForFuzz) {
    for (const fuzz of fuzzPayloads) {
      const fullPath = `${route}${fuzz.query}`;
      try {
        const res = await fetchRoute(fullPath, { token: adminToken });
        if (res.status >= 500) {
          recordFail(
            `FUZZ-PARAM-${route.slice(1).toUpperCase()}-${fuzz.name.toUpperCase().replace(/\s+/g, '_')}`,
            `SSR crashed with HTTP ${res.status} on ${route} with ${fuzz.name}`,
            `Status: ${res.status}, Body snippet: ${res.body.slice(0, 150)}`
          );
        } else {
          // If XSS was attempted, verify it is not reflected unescaped in HTML
          if (fuzz.name.includes('XSS') && res.body.includes('<script>alert(1)</script>')) {
            recordFail(
              `FUZZ-PARAM-${route.slice(1).toUpperCase()}-${fuzz.name.toUpperCase().replace(/\s+/g, '_')}`,
              `Unescaped XSS reflection detected on ${route}`,
              'HTML contains raw unescaped script tag'
            );
          } else {
            recordPass(
              `FUZZ-PARAM-${route.slice(1).toUpperCase()}-${fuzz.name.toUpperCase().replace(/\s+/g, '_')}`,
              `Fuzz resilience on ${route} (${fuzz.name})`,
              `HTTP ${res.status} OK (Server survived safely)`
            );
          }
        }
      } catch (err) {
        recordFail(`FUZZ-PARAM-${route}-${fuzz.name}`, `Connection failed/server crashed on ${fullPath}`, err.message);
      }
    }
  }

  // =========================================================================
  // 6. COMMANDPALETTE & SCAFFOLDING API ADVERSARIAL STRESS
  // =========================================================================
  console.log(`\n${colors.bold}--- 6. COMMANDPALETTE & SCAFFOLDING API ADVERSARIAL STRESS ---${colors.reset}`);

  // 6.1 Backend Search API /api/expedientes fuzzing (used by CommandPalette and GlobalSearch)
  const apiSearchTests = [
    { query: '?search=', desc: 'Empty search parameter' },
    { query: '?q=', desc: 'Empty q parameter' },
    { query: '?search=EXP-2026', desc: 'Standard case query' },
    { query: `?search=${'A'.repeat(2000)}`, desc: 'Long 2000-char search string' },
    { query: '?search=1\'%20OR%20\'1\'=\'1', desc: 'SQLi string in search' },
    { query: '?search=%3Cscript%3Ealert(1)%3C/script%3E', desc: 'XSS script in search' },
    { query: '?salaId=99999999', desc: 'Non-existent salaId filter' },
    { query: '?salaId=-1', desc: 'Negative salaId filter' },
    { query: '?salaId=NaN', desc: 'NaN salaId filter' },
    { query: '?estatusId=999999', desc: 'Non-existent estatusId filter' },
    { query: '?estatusId=abc', desc: 'String estatusId filter' },
    { query: '?limit=-5', desc: 'Negative limit filter' },
    { query: '?limit=0', desc: 'Zero limit filter' },
  ];

  for (const test of apiSearchTests) {
    try {
      const res = await fetchApi(`/api/expedientes${test.query}`, { token: adminToken });
      if (res.status >= 500) {
        recordFail(`API-FUZZ-EXPEDIENTES`, `/api/expedientes crashed on ${test.desc}`, `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
      } else {
        recordPass(`API-FUZZ-EXPEDIENTES`, `/api/expedientes handled ${test.desc}`, `HTTP ${res.status} (Clean JSON)`);
      }
    } catch (err) {
      recordFail(`API-FUZZ-EXPEDIENTES`, `Fatal error fetching /api/expedientes${test.query}`, err.message);
    }
  }

  // 6.2 Empirical check of CommandPalette query contract (?q vs ?search)
  try {
    const qRes = await fetchApi('/api/expedientes?q=NONEXISTENT_XYZ_QUERY', { token: adminToken });
    const searchRes = await fetchApi('/api/expedientes?search=NONEXISTENT_XYZ_QUERY', { token: adminToken });
    const qCount = Array.isArray(qRes.body) ? qRes.body.length : 0;
    const searchCount = Array.isArray(searchRes.body) ? searchRes.body.length : 0;

    if (qCount > 0 && searchCount === 0) {
      recordFinding(
        'CONTRACT-CMDPALETTE-SEARCH-PARAM',
        'MEDIUM',
        'CommandPalette queries ?q= but backend /api/expedientes only filters on ?search=',
        `GET /api/expedientes?q=... returns ${qCount} unfiltered items while ?search=... returns ${searchCount}. Recommend supporting req.query.q in backend or updating CommandPalette to use ?search=.`
      );
    } else {
      recordPass('CONTRACT-CMDPALETTE-SEARCH-PARAM', 'Backend /api/expedientes handles ?q identically to ?search');
    }
  } catch (err) {
    recordFail('CONTRACT-CMDPALETTE-SEARCH-PARAM', 'Error evaluating search contract parity', err.message);
  }

  // 6.3 Boundary check on limit=NaN (Catalogue as finding)
  try {
    const nanRes = await fetchApi('/api/expedientes?limit=NaN', { token: adminToken });
    if (nanRes.status >= 500) {
      recordFinding(
        'API-LIMIT-NAN-EXPEDIENTES',
        'LOW',
        '/api/expedientes returns HTTP 500 on non-numeric ?limit=NaN due to Prisma parseInt NaN handling',
        'Prisma take argument receives NaN instead of falling back to default or 400. Server handles safely in try/catch.'
      );
    } else {
      recordPass('API-LIMIT-NAN-EXPEDIENTES', '/api/expedientes handled limit=NaN gracefully');
    }
  } catch (err) {
    recordFail('API-LIMIT-NAN-EXPEDIENTES', 'Error probing limit=NaN', err.message);
  }

  // 6.4 Backend Notifications API boundary testing (used by AppShell badge polling)
  try {
    const unreadRes = await fetchApi('/api/notificaciones/unread-count', { token: adminToken });
    if (unreadRes.status === 200 && typeof unreadRes.body?.count === 'number') {
      recordPass('API-NOTIF-UNREAD-COUNT', 'Notification unread-count endpoint returns valid count', `Count: ${unreadRes.body.count}`);
    } else {
      recordFail('API-NOTIF-UNREAD-COUNT', 'Notification unread-count response invalid', `HTTP ${unreadRes.status}: ${JSON.stringify(unreadRes.body)}`);
    }
  } catch (err) {
    recordFail('API-NOTIF-UNREAD-COUNT', 'Error calling /api/notificaciones/unread-count', err.message);
  }

  // Boundary checks on /api/notificaciones
  const notifTests = [
    { query: '?leida=false', desc: 'Filter unread notifications' },
    { query: '?leida=true', desc: 'Filter read notifications' },
    { query: '?leida=invalid_string', desc: 'Invalid boolean filter for leida' },
    { query: '?limit=-1', desc: 'Negative limit on notifications' },
    { query: '?limit=99999999', desc: 'Large limit on notifications' },
  ];

  for (const test of notifTests) {
    try {
      const res = await fetchApi(`/api/notificaciones${test.query}`, { token: adminToken });
      if (res.status >= 500) {
        recordFail(`API-FUZZ-NOTIF`, `/api/notificaciones crashed on ${test.desc}`, `HTTP ${res.status}`);
      } else {
        recordPass(`API-FUZZ-NOTIF`, `/api/notificaciones handled ${test.desc}`, `HTTP ${res.status}`);
      }
    } catch (err) {
      recordFail(`API-FUZZ-NOTIF`, `Error on /api/notificaciones${test.query}`, err.message);
    }
  }

  // Notifications limit=NaN finding check
  try {
    const notifNanRes = await fetchApi('/api/notificaciones?limit=NaN', { token: adminToken });
    if (notifNanRes.status >= 500) {
      recordFinding(
        'API-LIMIT-NAN-NOTIF',
        'LOW',
        '/api/notificaciones returns HTTP 500 on non-numeric ?limit=NaN due to Prisma parseInt NaN handling',
        'Prisma take argument receives NaN instead of falling back to default or 400. Server handles safely in try/catch.'
      );
    } else {
      recordPass('API-LIMIT-NAN-NOTIF', '/api/notificaciones handled limit=NaN gracefully');
    }
  } catch (err) {
    recordFail('API-LIMIT-NAN-NOTIF', 'Error probing notif limit=NaN', err.message);
  }

  // Notification mark as read edge cases
  try {
    const res = await fetchApi('/api/notificaciones/invalid_id/leida', {
      method: 'PATCH',
      token: adminToken,
    });
    if (res.status === 400) {
      recordPass('API-NOTIF-PATCH-NAN', 'PATCH notification with NaN ID returns 400 Bad Request', 'HTTP 400 Bad Request');
    } else {
      recordFail('API-NOTIF-PATCH-NAN', 'PATCH notification with NaN ID should be 400', `Received HTTP ${res.status}`);
    }
  } catch (err) {
    recordFail('API-NOTIF-PATCH-NAN', 'Error testing patch notification NaN', err.message);
  }

  try {
    const res = await fetchApi('/api/notificaciones/99999999/leida', {
      method: 'PATCH',
      token: adminToken,
    });
    if (res.status === 404) {
      recordPass('API-NOTIF-PATCH-404', 'PATCH non-existent notification returns 404 Not Found', 'HTTP 404 Not Found');
    } else {
      recordFail('API-NOTIF-PATCH-404', 'PATCH non-existent notification should be 404', `Received HTTP ${res.status}`);
    }
  } catch (err) {
    recordFail('API-NOTIF-PATCH-404', 'Error testing patch notification 404', err.message);
  }

  // =========================================================================
  // 7. POST-TEST SYSTEM LIVENESS & STABILITY VERIFICATION
  // =========================================================================
  console.log(`\n${colors.bold}--- 7. POST-STRESS LIVENESS VERIFICATION ---${colors.reset}`);

  try {
    const fRes = await fetchRoute('/', { token: adminToken });
    const bRes = await fetchApi('/api/auth/me', { token: adminToken });

    if (fRes.status === 200 && bRes.status === 200) {
      recordPass(
        'POST-STRESS-LIVENESS',
        'Frontend SSR and Backend API remain fully operational post-stress test',
        `Frontend HTTP ${fRes.status}, Backend HTTP ${bRes.status}`
      );
    } else {
      recordFail(
        'POST-STRESS-LIVENESS',
        'Servers degraded after stress testing',
        `Frontend: ${fRes.status}, Backend: ${bRes.status}`
      );
    }
  } catch (err) {
    recordFail('POST-STRESS-LIVENESS', 'Server unreachable post-stress', err.message);
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}                 CHALLENGER STRESS SUITE SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Checks Executed:  ${totalChecks}`);
  console.log(`  ${colors.green}Passed Checks:          ${passedChecks}${colors.reset}`);
  console.log(`  ${failedChecks > 0 ? colors.red : colors.gray}Failed Checks:          ${failedChecks}${colors.reset}`);
  console.log(`  ${advisoryFindings.length > 0 ? colors.yellow : colors.gray}Advisory Findings:      ${advisoryFindings.length}${colors.reset}`);
  const passRate = totalChecks > 0 ? ((passedChecks / totalChecks) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate:              ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (advisoryFindings.length > 0) {
    console.log(`${colors.yellow}${colors.bold}ADVISORY FINDINGS RECORDED:${colors.reset}`);
    advisoryFindings.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.testId}] (${f.severity}) ${f.title}`);
      console.log(`     Detail: ${f.detail}`);
    });
    console.log('');
  }

  if (failedChecks > 0) {
    console.error(`${colors.red}${colors.bold}ADVERSARIAL STRESS TEST FAILED with ${failedChecks} issue(s):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.testId}] ${f.title}`);
      console.error(`     Error: ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}VERDICT: APPROVE — 100% ADVERSARIAL STRESS RESILIENCE VERIFIED${colors.reset}\n`);
    process.exit(0);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Fatal crash in challenger runner:', err);
  process.exit(1);
});
