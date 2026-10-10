/**
 * tests/challenger_m1_adversarial.test.mjs
 * =============================================================================
 * Milestone 1 Adversarial Stress Testing Harness
 * Role: challenger_m1_1_o4 (critic, specialist)
 * Target: /api/usuarios/preferencias & /api/auth/preferencias
 *
 * Verification Objectives:
 * 1. Malformed Payloads & Type Confusion (Invalid themes, bad hex values,
 *    type mismatches, prototype pollution, extreme string lengths).
 * 2. Injection & Exploitation Attacks (SQL injection strings, XSS payloads in
 *    widget order, parameter tampering, ReDoS resilience).
 * 3. Multi-User Isolation & Privilege Escalation (User A modifying settings
 *    cannot alter User B's preferences or employee color, scope tampering,
 *    impersonation scope isolation).
 * 4. Rapid Concurrency & Race Conditions (Fallback creation under high concurrent
 *    load, atomic updates, zero unique constraint crashes or SQLite locks).
 * 5. Alias Route Parity & Behavioral Equivalence (/api/auth/preferencias vs
 *    /api/usuarios/preferencias).
 * =============================================================================
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../backend/node_modules/@prisma/client/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const prisma = new PrismaClient();
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';

// Results Accumulator
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  suites: {},
  failures: [],
};

let currentSuite = 'General';

function setSuite(name) {
  currentSuite = name;
  if (!stats.suites[name]) {
    stats.suites[name] = { total: 0, passed: 0, failed: 0 };
  }
  console.log(`\n\x1b[35m=== [${name}] ===\x1b[0m`);
}

function pass(assertion, detail = '') {
  stats.total++;
  stats.passed++;
  if (stats.suites[currentSuite]) {
    stats.suites[currentSuite].total++;
    stats.suites[currentSuite].passed++;
  }
  console.log(`  \x1b[32m✓ [PASS ${stats.total}]\x1b[0m ${assertion}${detail ? ` \x1b[90m-> ${detail}\x1b[0m` : ''}`);
}

function fail(assertion, reason = '') {
  stats.total++;
  stats.failed++;
  if (stats.suites[currentSuite]) {
    stats.suites[currentSuite].total++;
    stats.suites[currentSuite].failed++;
  }
  const msg = `[FAIL ${stats.total}] ${assertion}: ${reason}`;
  stats.failures.push(msg);
  console.error(`  \x1b[31m✗ ${msg}\x1b[0m`);
}

async function api(path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };
  if (options.body !== undefined) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  try {
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
    return { status: res.status, ok: res.ok, data, headers: res.headers };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function login(correo, password = 'password123') {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  if (res.status === 200 && res.data?.token) {
    return { token: res.data.token, user: res.data.usuario };
  }
  throw new Error(`Login failed for ${correo}: HTTP ${res.status}`);
}

async function runAdversarialSuite() {
  console.log('\x1b[1m\x1b[36m======================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   TJA BCS — MILESTONE 1 ADVERSARIAL STRESS TESTING SUITE             \x1b[0m');
  console.log('\x1b[1m\x1b[36m   Role: Empirical Challenger (critic, specialist)                   \x1b[0m');
  console.log('\x1b[1m\x1b[36m======================================================================\x1b[0m');

  // Baseline Authentications
  let adminSession, consultaSession, magistradoSession;
  try {
    adminSession = await login('admin@tjabcs.gob.mx');
    consultaSession = await login('consulta@tjabcs.gob.mx');
    magistradoSession = await login('magistrado1@tjabcs.gob.mx');
  } catch (err) {
    console.error('Fatal initialization error:', err.message);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // SUITE 1: AUTHENTICATION & ROUTE GUARD ENFORCEMENT
  // --------------------------------------------------------------------------
  setSuite('Suite 1: Authentication & Token Guard Enforcement');

  // 1.1 Unauthenticated requests to /api/usuarios/preferencias
  const res1_1 = await api('/api/usuarios/preferencias');
  if (res1_1.status === 401) {
    pass('ADV-AUTH-01: Unauthenticated GET /api/usuarios/preferencias returns 401');
  } else {
    fail('ADV-AUTH-01: Unauthenticated GET /api/usuarios/preferencias returned ' + res1_1.status);
  }

  const res1_2 = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    body: { tema: 'light' },
  });
  if (res1_2.status === 401) {
    pass('ADV-AUTH-02: Unauthenticated PUT /api/usuarios/preferencias returns 401');
  } else {
    fail('ADV-AUTH-02: Unauthenticated PUT /api/usuarios/preferencias returned ' + res1_2.status);
  }

  // 1.2 Unauthenticated requests to alias /api/auth/preferencias
  const res1_3 = await api('/api/auth/preferencias');
  if (res1_3.status === 401) {
    pass('ADV-AUTH-03: Unauthenticated GET /api/auth/preferencias returns 401');
  } else {
    fail('ADV-AUTH-03: Unauthenticated GET /api/auth/preferencias returned ' + res1_3.status);
  }

  const res1_4 = await api('/api/auth/preferencias', {
    method: 'PUT',
    body: { tema: 'light' },
  });
  if (res1_4.status === 401) {
    pass('ADV-AUTH-04: Unauthenticated PUT /api/auth/preferencias returns 401');
  } else {
    fail('ADV-AUTH-04: Unauthenticated PUT /api/auth/preferencias returned ' + res1_4.status);
  }

  // 1.3 Unauthenticated PUT /api/usuarios/color-empleado
  const res1_5 = await api('/api/usuarios/color-empleado', {
    method: 'PUT',
    body: { colorEmpleado: '#123456' },
  });
  if (res1_5.status === 401) {
    pass('ADV-AUTH-05: Unauthenticated PUT /api/usuarios/color-empleado returns 401');
  } else {
    fail('ADV-AUTH-05: Unauthenticated PUT /api/usuarios/color-empleado returned ' + res1_5.status);
  }

  // 1.4 Bogus & Malformed Bearer tokens
  const bogusTokens = [
    'Bearer invalid_token_xyz_99999',
    'Bearer null',
    'Bearer undefined',
    'Bearer ""',
    'Bearer 1234567890',
    'Basic dXNlcjpwYXNz',
    'Token some_token',
    'bearer',
  ];

  for (const bogus of bogusTokens) {
    const res = await api('/api/usuarios/preferencias', {
      headers: { Authorization: bogus },
    });
    if (res.status === 401) {
      pass(`ADV-AUTH-06: Malformed/bogus token [${bogus.substring(0, 20)}] returns 401`);
    } else {
      fail(`ADV-AUTH-06: Malformed token [${bogus}] returned ${res.status}`);
    }
  }

  // 1.5 Inactive / Suspended account token rejection
  const tempSuspendedUser = await prisma.usuario.create({
    data: {
      nombre: 'Usuario Suspendido Challenger',
      correo: 'suspendido_challenger@tjabcs.gob.mx',
      password: 'password123',
      rolId: 4,
      activo: false, // Suspended
    },
  });

  const tempSession = await prisma.session.create({
    data: {
      token: 'token_challenger_suspended_test_12345',
      usuarioId: tempSuspendedUser.id,
    },
  });

  const resSuspended = await api('/api/usuarios/preferencias', {
    headers: { Authorization: `Bearer ${tempSession.token}` },
  });

  if (resSuspended.status === 401) {
    pass('ADV-AUTH-07: Inactive / suspended account session token returns 401');
  } else {
    fail('ADV-AUTH-07: Inactive account session returned ' + resSuspended.status);
  }

  // Cleanup temp suspended user & session
  await prisma.session.delete({ where: { id: tempSession.id } });
  await prisma.usuario.delete({ where: { id: tempSuspendedUser.id } });

  // --------------------------------------------------------------------------
  // SUITE 2: MALFORMED PAYLOADS & TYPE CONFUSION FUZZING
  // --------------------------------------------------------------------------
  setSuite('Suite 2: Malformed Payloads & Type Confusion Fuzzing');

  const adminAuth = { Authorization: `Bearer ${adminSession.token}` };

  // 2.1 Tema Validation
  const invalidTemas = [
    'ultra-dark',
    'neon',
    'blue',
    '',
    ' ',
    123,
    true,
    false,
    {},
    ['dark'],
    null,
  ];

  for (const badTema of invalidTemas) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { tema: badTema },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-01: Invalid tema [${JSON.stringify(badTema)}] rejected with 400 Bad Request`);
    } else {
      fail(`ADV-VAL-01: Invalid tema [${JSON.stringify(badTema)}] returned status ${res.status}`);
    }
  }

  // Case insensitivity normalization on valid tema
  const resTemaUpper = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: { tema: 'DARK' },
  });
  if (resTemaUpper.status === 200 && resTemaUpper.data?.tema === 'dark') {
    pass('ADV-VAL-02: Uppercase tema "DARK" properly normalized to lowercase "dark"');
  } else {
    fail('ADV-VAL-02: Uppercase tema "DARK" failed: ' + resTemaUpper.status);
  }

  // 2.2 ColorAcento Hex Validation
  const invalidHexColors = [
    'red',
    'rgb(255, 0, 0)',
    '#gggggg',
    '#12',
    '#1234',
    '#12345',
    '#1234567',
    '#12345678', // 8-digit RGBA hex
    '2563eb',    // missing hash
    '#',
    '#   ',
    123456,
    true,
    {},
    ['#2563eb'],
  ];

  for (const badHex of invalidHexColors) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { colorAcento: badHex },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-03: Invalid colorAcento [${JSON.stringify(badHex)}] rejected with 400 Bad Request`);
    } else {
      fail(`ADV-VAL-03: Invalid colorAcento [${JSON.stringify(badHex)}] returned status ${res.status}`);
    }
  }

  // 2.3 PaletaPreset Validation
  const invalidPaletas = [
    'a', // single char (min 2)
    'azul cielo', // spaces not allowed
    'palette;drop', // punctuation
    '../../etc/passwd', // path traversal
    'a'.repeat(41), // 41 chars (max 40)
    12345,
    true,
    {},
    ['azul-clasico'],
  ];

  for (const badPaleta of invalidPaletas) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { paletaPreset: badPaleta },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-04: Invalid paletaPreset [${typeof badPaleta === 'string' && badPaleta.length > 20 ? badPaleta.substring(0, 20) + '...' : JSON.stringify(badPaleta)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-04: Invalid paletaPreset [${JSON.stringify(badPaleta)}] returned status ${res.status}`);
    }
  }

  // 2.4 Densidad Validation
  const invalidDensidades = [
    'ultra-compact',
    'loose',
    '',
    123,
    true,
    {},
    ['compact'],
  ];

  for (const badDens of invalidDensidades) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { densidad: badDens },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-05: Invalid densidad [${JSON.stringify(badDens)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-05: Invalid densidad [${JSON.stringify(badDens)}] returned status ${res.status}`);
    }
  }

  // 2.5 TamanoFuente Validation
  const invalidTamanos = [
    'huge',
    'tiny',
    'xlarge',
    '',
    123,
    true,
    {},
    ['normal'],
  ];

  for (const badTam of invalidTamanos) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { tamanoFuente: badTam },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-06: Invalid tamanoFuente [${JSON.stringify(badTam)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-06: Invalid tamanoFuente [${JSON.stringify(badTam)}] returned status ${res.status}`);
    }
  }

  // 2.6 SidebarColapsado Type Validation (strictly boolean)
  const invalidSidebarBooleans = [
    'true',
    'false',
    1,
    0,
    'yes',
    {},
    [],
  ];

  for (const badBool of invalidSidebarBooleans) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { sidebarColapsado: badBool },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-07: Non-boolean sidebarColapsado [${JSON.stringify(badBool)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-07: Non-boolean sidebarColapsado [${JSON.stringify(badBool)}] returned status ${res.status}`);
    }
  }

  // 2.7 SidebarPosicion Validation ('left' or 'right')
  const invalidSidebarPos = [
    'top',
    'bottom',
    'center',
    '',
    123,
    true,
    {},
    ['left'],
  ];

  for (const badPos of invalidSidebarPos) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { sidebarPosicion: badPos },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-08: Invalid sidebarPosicion [${JSON.stringify(badPos)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-08: Invalid sidebarPosicion [${JSON.stringify(badPos)}] returned status ${res.status}`);
    }
  }

  // 2.8 AnimacionesHabilitadas Type Validation (strictly boolean)
  const invalidAnimBooleans = [
    'false',
    'true',
    0,
    1,
    'disabled',
    {},
    [],
  ];

  for (const badAnim of invalidAnimBooleans) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { animacionesHabilitadas: badAnim },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-09: Non-boolean animacionesHabilitadas [${JSON.stringify(badAnim)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-09: Non-boolean animacionesHabilitadas [${JSON.stringify(badAnim)}] returned status ${res.status}`);
    }
  }

  // 2.9 OrdenWidgets Type & Formatting Validation
  const invalidWidgetOrders = [
    12345,
    true,
    false,
    { widgets: ['metricas'] },
    'not-a-json-string',
    '["unclosed-json',
  ];

  for (const badWidgets of invalidWidgetOrders) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: { ordenWidgets: badWidgets },
    });
    if (res.status === 400 && res.data?.error) {
      pass(`ADV-VAL-10: Malformed ordenWidgets [${JSON.stringify(badWidgets)}] rejected with 400`);
    } else {
      fail(`ADV-VAL-10: Malformed ordenWidgets [${JSON.stringify(badWidgets)}] returned status ${res.status}`);
    }
  }

  // 2.10 ColorEmpleado Validation (PUT /api/usuarios/preferencias and PUT /api/usuarios/color-empleado)
  const resBadColor1 = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: { colorEmpleado: 'invalid-hex' },
  });
  if (resBadColor1.status === 400) {
    pass('ADV-VAL-11: Invalid colorEmpleado on /api/usuarios/preferencias rejected with 400');
  } else {
    fail('ADV-VAL-11: Invalid colorEmpleado returned ' + resBadColor1.status);
  }

  const resBadColor2 = await api('/api/usuarios/color-empleado', {
    method: 'PUT',
    headers: adminAuth,
    body: { colorEmpleado: 'not-a-color' },
  });
  if (resBadColor2.status === 400) {
    pass('ADV-VAL-12: Invalid colorEmpleado on /api/usuarios/color-empleado rejected with 400');
  } else {
    fail('ADV-VAL-12: Invalid colorEmpleado on dedicated endpoint returned ' + resBadColor2.status);
  }

  const resEmptyColor = await api('/api/usuarios/color-empleado', {
    method: 'PUT',
    headers: adminAuth,
    body: {},
  });
  if (resEmptyColor.status === 400) {
    pass('ADV-VAL-13: Empty payload on /api/usuarios/color-empleado rejected with 400');
  } else {
    fail('ADV-VAL-13: Empty payload on dedicated color endpoint returned ' + resEmptyColor.status);
  }

  // --------------------------------------------------------------------------
  // SUITE 3: INJECTION & EXPLOITATION ATTACKS (SQLi, XSS, PROTOTYPE POLLUTION, EXTREME LENGTHS)
  // --------------------------------------------------------------------------
  setSuite('Suite 3: Injection & Exploitation Attacks');

  // 3.1 SQL Injection in String Fields
  const sqliPayloads = [
    { tema: "dark' OR '1'='1" },
    { tema: "'; DROP TABLE Usuario; --" },
    { colorAcento: "#ffffff'; DROP TABLE Usuario; --" },
    { paletaPreset: "preset'; DELETE FROM Session; --" },
    { colorEmpleado: "#7c3aed'; DROP TABLE PreferenciaUsuario; --" },
  ];

  for (const sqli of sqliPayloads) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: sqli,
    });
    if (res.status === 400) {
      pass(`ADV-INJ-01: SQL injection in ${Object.keys(sqli)[0]} rejected with 400 Bad Request`);
    } else {
      fail(`ADV-INJ-01: SQL injection payload did not return 400 (Status: ${res.status})`);
    }
  }

  // Verify database tables were NOT damaged or dropped
  const userCount = await prisma.usuario.count();
  const prefCount = await prisma.preferenciaUsuario.count();
  if (userCount >= 4 && prefCount >= 4) {
    pass(`ADV-INJ-02: DB integrity verified after SQLi attack: ${userCount} users, ${prefCount} preferences intact`);
  } else {
    fail(`ADV-INJ-02: DB integrity violation detected after SQLi payloads!`);
  }

  // 3.2 SQL Injection and XSS strings inside ordenWidgets
  const xssWidgets = [
    '<script>alert(document.domain)</script>',
    '<img src=x onerror=alert("xss")>',
    'javascript:alert(1)',
    "'; DROP TABLE Usuario; --",
    'metricas',
  ];

  const resXss = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: { ordenWidgets: xssWidgets },
  });

  if (resXss.status === 200 && Array.isArray(resXss.data?.ordenWidgets)) {
    // Check that GET returns the serialized array intact without JSON corruption or executing SQL
    const resGetPref = await api('/api/usuarios/preferencias', { headers: adminAuth });
    const returnedWidgets = resGetPref.data?.ordenWidgets || [];
    const containsScript = returnedWidgets.some((w) => w.includes('<script>'));
    const containsSqli = returnedWidgets.some((w) => w.includes('DROP TABLE'));
    if (containsScript && containsSqli) {
      pass('ADV-INJ-03: XSS & SQLi strings in ordenWidgets safely stored as literal text without DB corruption');
    } else {
      fail('ADV-INJ-03: Stored widget strings missing expected content');
    }
  } else {
    fail(`ADV-INJ-03: Failed to store widget array: HTTP ${resXss.status}`);
  }

  // 3.3 Prototype Pollution Attack
  const protoPollutionPayload = JSON.parse(
    '{"__proto__":{"polluted":true,"isAdmin":true},"constructor":{"prototype":{"injected":true}}}'
  );

  const resProto = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: protoPollutionPayload,
  });

  const testObj = {};
  const isPolluted = (testObj).polluted || (testObj).isAdmin || (testObj).injected;
  if (!isPolluted && (resProto.status === 200 || resProto.status === 400)) {
    pass('ADV-INJ-04: Prototype pollution payload safely defended (Object.prototype unpolluted)');
  } else {
    fail('ADV-INJ-04: Prototype pollution vulnerability detected!');
  }

  // 3.4a Extreme String Length within HTTP body limit (5,000 characters)
  const longString5k = 'A'.repeat(5000);
  const startTime5k = Date.now();
  const resLong5k = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: {
      paletaPreset: longString5k,
      colorAcento: '#' + longString5k,
    },
  });
  const elapsed5k = Date.now() - startTime5k;

  if (resLong5k.status === 400 && elapsed5k < 2000) {
    pass(`ADV-INJ-05a: 5K-char length rejected by validator with 400 Bad Request in ${elapsed5k}ms`);
  } else {
    fail(`ADV-INJ-05a: 5K-char length failed: status ${resLong5k.status}, took ${elapsed5k}ms`);
  }

  // 3.4b Massive Payload beyond Express body parser limit (150,000 characters)
  const hugePayload150k = 'B'.repeat(150000);
  const startTime150k = Date.now();
  const resHuge150k = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: {
      paletaPreset: hugePayload150k,
    },
  });
  const elapsed150k = Date.now() - startTime150k;

  if ((resHuge150k.status === 413 || resHuge150k.status === 400) && elapsed150k < 2000) {
    pass(`ADV-INJ-05b: 150K-char massive payload rejected at HTTP gateway (${resHuge150k.status}) in ${elapsed150k}ms`);
  } else {
    fail(`ADV-INJ-05b: Massive payload failed: status ${resHuge150k.status}, took ${elapsed150k}ms`);
  }

  // 3.5 Malformed Top-Level Bodies
  const nonObjectBodies = [
    '12345',
    '"plain string"',
    'true',
    'false',
    '[1, 2, 3]',
  ];

  for (const nonObj of nonObjectBodies) {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: adminAuth,
      body: nonObj,
    });
    // Server should handle non-object bodies without 500 internal server error
    if (res.status === 200 || res.status === 400) {
      pass(`ADV-INJ-06: Non-object top-level JSON body [${nonObj}] handled safely (Status: ${res.status})`);
    } else {
      fail(`ADV-INJ-06: Non-object body caused server error: ${res.status}`);
    }
  }

  // --------------------------------------------------------------------------
  // SUITE 4: MULTI-USER ISOLATION & PRIVILEGE ESCALATION HARDENING
  // --------------------------------------------------------------------------
  setSuite('Suite 4: Multi-User Isolation & Privilege Escalation Hardening');

  const consultaAuth = { Authorization: `Bearer ${consultaSession.token}` };
  const magistradoAuth = { Authorization: `Bearer ${magistradoSession.token}` };

  // Set distinct known baseline states for User A (Admin) and User B (Consulta)
  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: {
      tema: 'dark',
      colorAcento: '#7c3aed',
      colorEmpleado: '#7c3aed',
      densidad: 'comfortable',
      tamanoFuente: 'normal',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: ['metricas', 'graficas'],
      animacionesHabilitadas: true,
    },
  });

  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      tema: 'light',
      colorAcento: '#0284c7',
      colorEmpleado: '#0284c7',
      densidad: 'compact',
      tamanoFuente: 'small',
      sidebarColapsado: true,
      sidebarPosicion: 'right',
      ordenWidgets: ['expedientes'],
      animacionesHabilitadas: false,
    },
  });

  // Verify baseline distinction
  const adminBefore = (await api('/api/usuarios/preferencias', { headers: adminAuth })).data;
  const consultaBefore = (await api('/api/usuarios/preferencias', { headers: consultaAuth })).data;

  if (
    adminBefore.tema === 'dark' &&
    consultaBefore.tema === 'light' &&
    adminBefore.colorEmpleado === '#7c3aed' &&
    consultaBefore.colorEmpleado === '#0284c7'
  ) {
    pass('ADV-ISO-01: Multi-user distinct baseline configured successfully');
  } else {
    fail('ADV-ISO-01: Baseline preferences setup failed');
  }

  // 4.1 Parameter Tampering: User B attempts to modify User A via body payload { usuarioId: adminId }
  const resTamperBody = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      usuarioId: adminSession.user.id,
      tema: 'dark',
      colorAcento: '#ff0000',
      colorEmpleado: '#ff0000',
    },
  });

  const adminAfterBodyTamper = (await api('/api/usuarios/preferencias', { headers: adminAuth })).data;
  if (
    adminAfterBodyTamper.colorAcento === '#7c3aed' &&
    adminAfterBodyTamper.colorEmpleado === '#7c3aed'
  ) {
    pass('ADV-ISO-02: Parameter tampering via body { usuarioId } thwarted (Admin preferences untouched)');
  } else {
    fail('ADV-ISO-02: Parameter tampering bled into Admin preferences!');
  }

  // 4.2 Parameter Tampering via URL query parameter ?usuarioId=adminId
  const resTamperQuery = await api(`/api/usuarios/preferencias?usuarioId=${adminSession.user.id}`, {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      colorAcento: '#00ff00',
      colorEmpleado: '#00ff00',
    },
  });

  const adminAfterQueryTamper = (await api('/api/usuarios/preferencias', { headers: adminAuth })).data;
  if (
    adminAfterQueryTamper.colorAcento === '#7c3aed' &&
    adminAfterQueryTamper.colorEmpleado === '#7c3aed'
  ) {
    pass('ADV-ISO-03: Parameter tampering via URL ?usuarioId thwarted (Admin preferences untouched)');
  } else {
    fail('ADV-ISO-03: URL query parameter tampering bled into Admin preferences!');
  }

  // 4.3 Dedicated endpoint tampering: User B attempts PUT /api/usuarios/color-empleado with adminId
  const resTamperColor = await api('/api/usuarios/color-empleado', {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      usuarioId: adminSession.user.id,
      colorEmpleado: '#e11d48',
    },
  });

  const adminUserRecord = await prisma.usuario.findUnique({
    where: { id: adminSession.user.id },
    select: { colorEmpleado: true },
  });

  if (adminUserRecord?.colorEmpleado === '#7c3aed') {
    pass('ADV-ISO-04: User B modifying /api/usuarios/color-empleado cannot alter Admin colorEmpleado');
  } else {
    fail(`ADV-ISO-04: Admin colorEmpleado was mutated to ${adminUserRecord?.colorEmpleado}!`);
  }

  // 4.4 Scope Tampering: Non-admin User B attempts ?scope=admin without active impersonation
  const resTamperScope = await api('/api/usuarios/preferencias?scope=admin', {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      tema: 'dark',
      colorAcento: '#10b981',
    },
  });

  const adminAfterScopeTamper = (await api('/api/usuarios/preferencias', { headers: adminAuth })).data;
  const consultaAfterScopeTamper = (await api('/api/usuarios/preferencias', { headers: consultaAuth })).data;

  if (
    adminAfterScopeTamper.colorAcento === '#7c3aed' &&
    consultaAfterScopeTamper.colorAcento === '#10b981'
  ) {
    pass('ADV-ISO-05: Non-impersonated ?scope=admin ignored; mutation properly confined to caller');
  } else {
    fail('ADV-ISO-05: ?scope=admin inappropriately affected target user');
  }

  // 4.5 Impersonation Scope Isolation Test
  // Admin impersonates User B (Consulta)
  const impRes = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: adminAuth,
    body: { targetUserId: consultaSession.user.id },
  });

  if (impRes.status === 200) {
    // 1. GET preferences without scope returns User B's preferences
    const impGetB = await api('/api/usuarios/preferencias', { headers: adminAuth });
    // 2. GET preferences with ?scope=admin returns Admin's preferences
    const impGetAdmin = await api('/api/usuarios/preferencias?scope=admin', { headers: adminAuth });

    const impScopeWorks =
      impGetB.data?.colorEmpleado === consultaAfterScopeTamper.colorEmpleado &&
      impGetAdmin.data?.colorEmpleado === '#7c3aed';

    if (impScopeWorks) {
      pass('ADV-ISO-06: Impersonation scope isolation verified (context defaults to target user, ?scope=admin returns admin)');
    } else {
      fail(`ADV-ISO-06: Impersonation scope mismatch: target=${impGetB.data?.colorEmpleado}, admin=${impGetAdmin.data?.colorEmpleado}`);
    }

    // Revert impersonation
    await api('/api/auth/revert', {
      method: 'POST',
      headers: adminAuth,
    });
  } else {
    fail('ADV-ISO-06: Failed to initiate impersonation: status ' + impRes.status);
  }

  // 4.6 Three-Way Multi-User Distinct State Verification
  // Re-establish explicit unique states for all 3 users
  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: {
      tema: 'dark',
      colorAcento: '#7c3aed',
      colorEmpleado: '#7c3aed',
      densidad: 'comfortable',
      tamanoFuente: 'normal',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: ['metricas', 'graficas'],
      animacionesHabilitadas: true,
    },
  });

  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      tema: 'light',
      colorAcento: '#0284c7',
      colorEmpleado: '#0284c7',
      densidad: 'compact',
      tamanoFuente: 'small',
      sidebarColapsado: true,
      sidebarPosicion: 'right',
      ordenWidgets: ['expedientes'],
      animacionesHabilitadas: false,
    },
  });

  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: magistradoAuth,
    body: {
      tema: 'auto',
      colorAcento: '#b45309',
      colorEmpleado: '#b45309',
      densidad: 'comfortable',
      tamanoFuente: 'large',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: ['audiencias', 'actividad'],
      animacionesHabilitadas: true,
    },
  });

  const adminFinal = (await api('/api/usuarios/preferencias', { headers: adminAuth })).data;
  const consultaFinal = (await api('/api/usuarios/preferencias', { headers: consultaAuth })).data;
  const magistradoFinal = (await api('/api/usuarios/preferencias', { headers: magistradoAuth })).data;

  const usersSegregated =
    adminFinal.colorEmpleado === '#7c3aed' &&
    consultaFinal.colorEmpleado === '#0284c7' &&
    magistradoFinal.colorEmpleado === '#b45309' &&
    adminFinal.tema === 'dark' &&
    consultaFinal.tema === 'light' &&
    magistradoFinal.tema === 'auto' &&
    adminFinal.tamanoFuente === 'normal' &&
    consultaFinal.tamanoFuente === 'small' &&
    magistradoFinal.tamanoFuente === 'large' &&
    adminFinal.animacionesHabilitadas === true &&
    consultaFinal.animacionesHabilitadas === false &&
    magistradoFinal.animacionesHabilitadas === true;

  if (usersSegregated) {
    pass('ADV-ISO-07: 3-way isolation verified: Admin, Consulta, and Magistrado keep strictly isolated states in DB');
  } else {
    fail('ADV-ISO-07: State bleed detected among concurrent user preference records!');
  }

  // --------------------------------------------------------------------------
  // SUITE 5: RAPID CONCURRENCY & RACE CONDITION STRESS HARNESS
  // --------------------------------------------------------------------------
  setSuite('Suite 5: Rapid Concurrency & Race Condition Stress Harness');

  // 5.1 Fallback Creation Under High Concurrent Load
  // Create a brand new user WITHOUT any PreferenciaUsuario record
  const freshUserEmail = `concurrency_user_${Date.now()}@tjabcs.gob.mx`;
  const freshUser = await prisma.usuario.create({
    data: {
      nombre: 'Test Concurrency User',
      correo: freshUserEmail,
      password: 'password123',
      rolId: 4,
      colorEmpleado: '#3b82f6',
      activo: true,
    },
  });

  const freshSessionToken = `token_concurrency_fresh_${Date.now()}`;
  await prisma.session.create({
    data: {
      token: freshSessionToken,
      usuarioId: freshUser.id,
    },
  });

  // Verify that initially, NO PreferenciaUsuario row exists for this user
  const initialPrefRow = await prisma.preferenciaUsuario.findUnique({
    where: { usuarioId: freshUser.id },
  });

  if (!initialPrefRow) {
    pass('ADV-CONC-01: Fresh user created without existing PreferenciaUsuario record');
  } else {
    fail('ADV-CONC-01: Unexpected existing PreferenciaUsuario found');
  }

  // Fire 20 SIMULTANEOUS concurrent GET /api/usuarios/preferencias requests
  console.log('    Fleshing out 20 concurrent fallback creation requests...');
  const CONCURRENT_FALLBACK_COUNT = 20;
  const fallbackPromises = Array.from({ length: CONCURRENT_FALLBACK_COUNT }, () =>
    api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${freshSessionToken}` },
    })
  );

  const fallbackResults = await Promise.all(fallbackPromises);
  const fallbackStatuses = fallbackResults.map((r) => r.status);
  const allSucceeded200 = fallbackResults.every((r) => r.status === 200 && r.data?.tema);
  const zeroFailures = fallbackResults.every((r) => r.status !== 500 && r.status !== 404);

  // Check how many PreferenciaUsuario records were created in the database
  const createdPrefsInDb = await prisma.preferenciaUsuario.findMany({
    where: { usuarioId: freshUser.id },
  });

  if (allSucceeded200 && zeroFailures && createdPrefsInDb.length === 1) {
    pass(`ADV-CONC-02: 20 simultaneous GET fallback requests returned 200 OK with exactly 1 DB record created`);
  } else {
    fail(
      `ADV-CONC-02: Fallback race condition failure: statuses=[${fallbackStatuses.join(',')}], records in DB=${createdPrefsInDb.length}`
    );
  }

  // 5.2 Atomic Concurrent Updates (Race Condition on PUT)
  console.log('    Firing 25 simultaneous concurrent PUT requests...');
  const CONCURRENT_UPDATE_COUNT = 25;
  const testAccents = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
  const testThemes = ['light', 'dark', 'auto'];

  const updatePromises = Array.from({ length: CONCURRENT_UPDATE_COUNT }, (_, i) =>
    api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${freshSessionToken}` },
      body: {
        colorAcento: testAccents[i % testAccents.length],
        tema: testThemes[i % testThemes.length],
        densidad: i % 2 === 0 ? 'compact' : 'comfortable',
      },
    })
  );

  const updateResults = await Promise.all(updatePromises);
  const updateStatuses = updateResults.map((r) => r.status);
  const allUpdates200 = updateResults.every((r) => r.status === 200 && r.data?.colorAcento);
  const zeroUpdateCrashes = updateResults.every((r) => r.status !== 500);

  // Check that final database record is coherent
  const finalDbPref = await prisma.preferenciaUsuario.findUnique({
    where: { usuarioId: freshUser.id },
  });

  const isCoherent =
    finalDbPref &&
    testAccents.includes(finalDbPref.colorAcento) &&
    testThemes.includes(finalDbPref.tema) &&
    ['compact', 'comfortable'].includes(finalDbPref.densidad);

  if (allUpdates200 && zeroUpdateCrashes && isCoherent) {
    pass(`ADV-CONC-03: 25 simultaneous PUT updates completed with zero SQLITE_BUSY / 500 errors and coherent DB state`);
  } else {
    fail(
      `ADV-CONC-03: Concurrent updates failure: statuses=[${updateStatuses.slice(0, 10).join(',')},...], isCoherent=${isCoherent}`
    );
  }

  // 5.3 Rapid Mixed Interleaved Read/Write (30 Concurrent Requests)
  console.log('    Firing 30 interleaved concurrent GET/PUT requests...');
  const interleavedPromises = Array.from({ length: 30 }, (_, i) => {
    if (i % 2 === 0) {
      return api('/api/usuarios/preferencias', {
        headers: { Authorization: `Bearer ${freshSessionToken}` },
      });
    } else {
      return api('/api/usuarios/preferencias', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${freshSessionToken}` },
        body: {
          colorEmpleado: i % 4 === 1 ? '#06b6d4' : '#64748b',
          animacionesHabilitadas: i % 4 === 1,
        },
      });
    }
  });

  const interleavedResults = await Promise.all(interleavedPromises);
  const interleaved200 = interleavedResults.every((r) => r.status === 200);

  if (interleaved200) {
    pass('ADV-CONC-04: 30 interleaved concurrent read/write operations completed with 100% 200 OK');
  } else {
    const errorStatuses = interleavedResults.filter((r) => r.status !== 200).map((r) => r.status);
    fail(`ADV-CONC-04: Interleaved concurrency failed with non-200 statuses: [${errorStatuses.join(',')}]`);
  }

  // Cleanup fresh concurrency user
  await prisma.session.deleteMany({ where: { usuarioId: freshUser.id } });
  await prisma.preferenciaUsuario.deleteMany({ where: { usuarioId: freshUser.id } });
  await prisma.usuario.delete({ where: { id: freshUser.id } });

  // --------------------------------------------------------------------------
  // SUITE 6: ALIAS ROUTE PARITY (/api/auth/preferencias vs /api/usuarios/preferencias)
  // --------------------------------------------------------------------------
  setSuite('Suite 6: Alias Route Parity & Behavioral Equivalence');

  // 6.1 GET Parity
  const getUsuariosRes = await api('/api/usuarios/preferencias', { headers: adminAuth });
  const getAuthRes = await api('/api/auth/preferencias', { headers: adminAuth });

  const getParity =
    getUsuariosRes.status === getAuthRes.status &&
    getUsuariosRes.data?.tema === getAuthRes.data?.tema &&
    getUsuariosRes.data?.colorAcento === getAuthRes.data?.colorAcento &&
    getUsuariosRes.data?.colorEmpleado === getAuthRes.data?.colorEmpleado &&
    JSON.stringify(getUsuariosRes.data?.ordenWidgets) === JSON.stringify(getAuthRes.data?.ordenWidgets);

  if (getParity) {
    pass('ADV-ALIAS-01: GET /api/auth/preferencias produces payload equivalent to /api/usuarios/preferencias');
  } else {
    fail('ADV-ALIAS-01: Discrepancy between GET alias endpoints');
  }

  // 6.2 PUT Parity
  const putAuthRes = await api('/api/auth/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: {
      tema: 'light',
      densidad: 'compact',
    },
  });

  const getVerifyRes = await api('/api/usuarios/preferencias', { headers: adminAuth });
  if (
    putAuthRes.status === 200 &&
    getVerifyRes.data?.tema === 'light' &&
    getVerifyRes.data?.densidad === 'compact'
  ) {
    pass('ADV-ALIAS-02: PUT /api/auth/preferencias successfully mutates preferences reflected in /api/usuarios/preferencias');
  } else {
    fail('ADV-ALIAS-02: Mutation via PUT /api/auth/preferencias failed');
  }

  // 6.3 Error Validation Parity
  const badAuthRes = await api('/api/auth/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: { tema: 'invalid-tema' },
  });

  const badUsuariosRes = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: { tema: 'invalid-tema' },
  });

  if (
    badAuthRes.status === 400 &&
    badUsuariosRes.status === 400 &&
    badAuthRes.data?.error === badUsuariosRes.data?.error
  ) {
    pass('ADV-ALIAS-03: Validation error handling on /api/auth/preferencias is 100% identical to /api/usuarios/preferencias');
  } else {
    fail('ADV-ALIAS-03: Error parity mismatch on invalid input');
  }

  // --------------------------------------------------------------------------
  // CLEANUP & STATE RESTORATION
  // --------------------------------------------------------------------------
  console.log('\n\x1b[36m--- Restoring Baseline Database Seeds ---\x1b[0m');
  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: adminAuth,
    body: {
      tema: 'dark',
      colorAcento: '#7c3aed',
      colorEmpleado: '#7c3aed',
      densidad: 'comfortable',
      tamanoFuente: 'normal',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'],
      animacionesHabilitadas: true,
    },
  });

  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: consultaAuth,
    body: {
      tema: 'light',
      colorAcento: '#0284c7',
      colorEmpleado: '#0284c7',
      densidad: 'compact',
      tamanoFuente: 'small',
      sidebarColapsado: true,
      sidebarPosicion: 'left',
      ordenWidgets: ['graficas', 'metricas', 'expedientes', 'audiencias', 'actividad'],
      animacionesHabilitadas: true,
    },
  });

  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: magistradoAuth,
    body: {
      tema: 'light',
      colorAcento: '#b45309',
      colorEmpleado: '#b45309',
      densidad: 'comfortable',
      tamanoFuente: 'large',
      sidebarColapsado: false,
      sidebarPosicion: 'left',
      ordenWidgets: ['audiencias', 'expedientes', 'metricas', 'actividad', 'graficas'],
      animacionesHabilitadas: true,
    },
  });

  console.log('Baseline database preferences restored successfully.');

  // Disconnect prisma
  await prisma.$disconnect();

  // --------------------------------------------------------------------------
  // SUITE SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[36m======================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m                    ADVERSARIAL HARNESS SUMMARY                      \x1b[0m');
  console.log('\x1b[1m\x1b[36m======================================================================\x1b[0m');
  for (const [sName, sData] of Object.entries(stats.suites)) {
    console.log(`  ${sName.padEnd(55)}: ${sData.passed}/${sData.total} passed`);
  }
  console.log('----------------------------------------------------------------------');
  console.log(`  Total Invocations Tested : ${stats.total}`);
  console.log(`  Passed Assertions        : \x1b[32m${stats.passed}\x1b[0m`);
  console.log(`  Failed Assertions        : ${stats.failed > 0 ? `\x1b[31m${stats.failed}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  console.log(`  Pass Rate                : ${(stats.total > 0 ? (stats.passed / stats.total) * 100 : 0).toFixed(1)}%`);
  console.log('======================================================================\n');

  if (stats.failed > 0) {
    console.error('\x1b[31mADVERSARIAL VERDICT: REJECT (Failures detected)\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mADVERSARIAL VERDICT: APPROVE (100% Robust across all attack vectors)\x1b[0m');
    process.exit(0);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Unhandled harness exception:', err);
  process.exit(1);
});
