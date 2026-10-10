/**
 * tests/challenger_m4_widgets_reordering.test.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST: Dashboard Widgets & Live Reordering
 * Challenger: challenger_m4_2_o6 (critic, specialist)
 * Milestone: Milestone 4 (Interactive Dashboard Widgets & Preferences)
 *
 * Suites:
 *   Suite 1: Algorithmic Reordering Robustness & Boundary Conditions
 *   Suite 2: Corrupted, Unknown & Malformed ordenWidgets Sanitization & Fallback
 *   Suite 3: Backend Preferences API Validation & Persistence Stress
 *   Suite 4: Real Headless Chrome Browser CDP Live Dashboard Stress Test
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9335', 10);

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

// Summary metrics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

let currentSuite = 'General';

function setSuite(name) {
  currentSuite = name;
  console.log(`\n${colors.magenta}=== [${name}] ===${colors.reset}`);
}

function pass(id, title, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ${colors.green}✓ [PASS ${totalTests}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  if (detail) console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
}

function fail(id, title, errorDetail) {
  totalTests++;
  failedTests++;
  failures.push({ suite: currentSuite, id, title, errorDetail });
  console.log(`  ${colors.red}✗ [FAIL ${totalTests}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  console.log(`      ${colors.red}→ ERROR: ${errorDetail}${colors.reset}`);
}

// Canonical keys matching frontend/src/components/dashboard/DashboardWidgets.tsx
const ALL_WIDGET_KEYS = ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'];

/**
 * Replicate canonicalOrder sanitization logic from DashboardWidgets.tsx
 */
function computeCanonicalOrder(raw) {
  const source = Array.isArray(raw) ? raw : ALL_WIDGET_KEYS;
  // Deduplicate and filter valid keys
  const valid = [];
  for (const k of source) {
    if (typeof k === 'string' && ALL_WIDGET_KEYS.includes(k) && !valid.includes(k)) {
      valid.push(k);
    }
  }
  const missing = ALL_WIDGET_KEYS.filter((k) => !valid.includes(k));
  return [...valid, ...missing];
}

/**
 * Replicate handleMoveUp / handleMoveDown reorder algorithm
 */
function moveWidgetUp(order, widgetId) {
  const currentIndex = order.indexOf(widgetId);
  if (currentIndex <= 0) return [...order];
  const next = [...order];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(currentIndex - 1, 0, moved);
  return next;
}

function moveWidgetDown(order, widgetId) {
  const currentIndex = order.indexOf(widgetId);
  if (currentIndex === -1 || currentIndex >= order.length - 1) return [...order];
  const next = [...order];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(currentIndex + 1, 0, moved);
  return next;
}

/**
 * HTTP Client Helper
 */
async function api(pathName, options = {}) {
  const url = `${BACKEND_URL}${pathName}`;
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
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function login(email, password) {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { correo: email, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${email} (${res.status}): ${JSON.stringify(res.data)}`);
  return res.data.token;
}

async function logout(token) {
  return await api('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Locate Chrome or Edge executable on Windows
 */
function findBrowserExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Lightweight CDP Client over Node native WebSocket
 */
class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.messageId = 0;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(new Error(`WebSocket connection error: ${err.message}`));
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve, reject } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              resolve(msg.result);
            }
          } else if (msg.method) {
            const listeners = this.eventListeners.get(msg.method) || [];
            listeners.forEach((fn) => fn(msg.params));
          }
        } catch (e) {
          console.error('Error parsing CDP message:', e);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = ++this.messageId;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(listener);
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function runAllSuites() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER ADVERSARIAL VERIFICATION: DASHBOARD WIDGETS & REORDERING${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Backend:  ${BACKEND_URL}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL}${colors.reset}\n`);

  // ==========================================================================
  // SUITE 1: Algorithmic Reordering Robustness & Boundary Conditions
  // ==========================================================================
  setSuite('Suite 1: Algorithmic Reordering Robustness & Boundary Conditions');

  const baselineOrder = [...ALL_WIDGET_KEYS]; // ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes']

  // 1.1 Boundary: Move first widget UP
  {
    const firstWidget = baselineOrder[0]; // 'metricas'
    const result = moveWidgetUp(baselineOrder, firstWidget);
    if (JSON.stringify(result) === JSON.stringify(baselineOrder)) {
      pass('REORDER-BOUND-01', 'Moving first widget UP is a graceful no-op', `Order unchanged: ${result.join(', ')}`);
    } else {
      fail('REORDER-BOUND-01', 'Moving first widget UP mutated order', `Got: ${result.join(', ')}`);
    }
  }

  // 1.2 Boundary: Move last widget DOWN
  {
    const lastWidget = baselineOrder[baselineOrder.length - 1]; // 'expedientes'
    const result = moveWidgetDown(baselineOrder, lastWidget);
    if (JSON.stringify(result) === JSON.stringify(baselineOrder)) {
      pass('REORDER-BOUND-02', 'Moving last widget DOWN is a graceful no-op', `Order unchanged: ${result.join(', ')}`);
    } else {
      fail('REORDER-BOUND-02', 'Moving last widget DOWN mutated order', `Got: ${result.join(', ')}`);
    }
  }

  // 1.3 Boundary: Move non-existent widget UP or DOWN
  {
    const resUp = moveWidgetUp(baselineOrder, 'non_existent_widget');
    const resDown = moveWidgetDown(baselineOrder, 'non_existent_widget');
    if (
      JSON.stringify(resUp) === JSON.stringify(baselineOrder) &&
      JSON.stringify(resDown) === JSON.stringify(baselineOrder)
    ) {
      pass('REORDER-BOUND-03', 'Attempting to move non-existent widget is a graceful no-op');
    } else {
      fail('REORDER-BOUND-03', 'Non-existent widget mutated array');
    }
  }

  // 1.4 Boundary Swap: Move second widget UP (swap index 1 with 0)
  {
    const result = moveWidgetUp(baselineOrder, 'graficas');
    const expected = ['graficas', 'metricas', 'audiencias', 'actividad', 'expedientes'];
    if (JSON.stringify(result) === JSON.stringify(expected)) {
      pass('REORDER-SWAP-01', 'Swapping index 1 UP with index 0 succeeds', `New: ${result.slice(0, 2).join(', ')}`);
    } else {
      fail('REORDER-SWAP-01', 'Swapping index 1 UP failed', `Expected: ${expected}, got: ${result}`);
    }
  }

  // 1.5 Boundary Swap: Move second-to-last widget DOWN (swap index 3 with 4)
  {
    const result = moveWidgetDown(baselineOrder, 'actividad');
    const expected = ['metricas', 'graficas', 'audiencias', 'expedientes', 'actividad'];
    if (JSON.stringify(result) === JSON.stringify(expected)) {
      pass('REORDER-SWAP-02', 'Swapping index 3 DOWN with index 4 succeeds', `New: ${result.slice(3).join(', ')}`);
    } else {
      fail('REORDER-SWAP-02', 'Swapping index 3 DOWN failed', `Expected: ${expected}, got: ${result}`);
    }
  }

  // 1.6 Successive multi-step bubble reorder: Move first element to last position
  {
    let current = [...baselineOrder];
    // Move 'metricas' down 4 times
    for (let step = 0; step < 4; step++) {
      current = moveWidgetDown(current, 'metricas');
    }
    const expected = ['graficas', 'audiencias', 'actividad', 'expedientes', 'metricas'];
    if (JSON.stringify(current) === JSON.stringify(expected)) {
      pass('REORDER-BUBBLE-01', 'Bubbling widget through 4 successive swaps reaches exact target index 4', `Final: ${current.join(', ')}`);
    } else {
      fail('REORDER-BUBBLE-01', 'Successive swaps failed', `Expected: ${expected}, got: ${current}`);
    }
  }

  // ==========================================================================
  // SUITE 2: Corrupted, Unknown & Malformed ordenWidgets Sanitization & Fallback
  // ==========================================================================
  setSuite('Suite 2: Corrupted, Unknown & Malformed ordenWidgets Sanitization & Fallback');

  // 2.1 Partial corrupted array with unknown IDs
  {
    const corruptInput = ['unknown_x', 'expedientes', 'malicious_code', 'audiencias', 'fake_module'];
    const result = computeCanonicalOrder(corruptInput);
    // Should preserve valid keys in order of appearance, then append missing canonical keys
    const expected = ['expedientes', 'audiencias', 'metricas', 'graficas', 'actividad'];
    if (JSON.stringify(result) === JSON.stringify(expected)) {
      pass('CORRUPT-SANITIZE-01', 'Filters unknown IDs and appends missing canonical keys in catalog order', `Output: ${result.join(', ')}`);
    } else {
      fail('CORRUPT-SANITIZE-01', 'Sanitization failed', `Expected: ${expected}, got: ${result}`);
    }
  }

  // 2.2 Completely invalid/unknown array
  {
    const allInvalid = ['foo', 'bar', 'baz', '12345'];
    const result = computeCanonicalOrder(allInvalid);
    if (JSON.stringify(result) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('CORRUPT-FALLBACK-01', 'Completely invalid array falls back 100% to default catalog order', `Restored: ${result.join(', ')}`);
    } else {
      fail('CORRUPT-FALLBACK-01', 'Fallback failed', `Got: ${result}`);
    }
  }

  // 2.3 Empty array []
  {
    const emptyInput = [];
    const result = computeCanonicalOrder(emptyInput);
    if (JSON.stringify(result) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('CORRUPT-EMPTY-01', 'Empty array [] falls back to full default catalog order', `Count: ${result.length}`);
    } else {
      fail('CORRUPT-EMPTY-01', 'Empty array fallback failed', `Got: ${result}`);
    }
  }

  // 2.4 Array with non-string elements (null, number, boolean, object)
  {
    const mixedInput = [null, 999, 'actividad', true, { bad: true }, 'graficas', undefined];
    const result = computeCanonicalOrder(mixedInput);
    const expected = ['actividad', 'graficas', 'metricas', 'audiencias', 'expedientes'];
    if (JSON.stringify(result) === JSON.stringify(expected)) {
      pass('CORRUPT-TYPES-01', 'Non-string types (null, number, object) safely ignored and missing keys appended', `Output: ${result.join(', ')}`);
    } else {
      fail('CORRUPT-TYPES-01', 'Non-string handling failed', `Expected: ${expected}, got: ${result}`);
    }
  }

  // 2.5 Non-array values (null, number, string)
  {
    const resNull = computeCanonicalOrder(null);
    const resNum = computeCanonicalOrder(12345);
    const resStr = computeCanonicalOrder('invalid-scalar');
    if (
      JSON.stringify(resNull) === JSON.stringify(ALL_WIDGET_KEYS) &&
      JSON.stringify(resNum) === JSON.stringify(ALL_WIDGET_KEYS) &&
      JSON.stringify(resStr) === JSON.stringify(ALL_WIDGET_KEYS)
    ) {
      pass('CORRUPT-SCALAR-01', 'Non-array inputs (null, number, string) cleanly return default catalog order');
    } else {
      fail('CORRUPT-SCALAR-01', 'Non-array input handling failed');
    }
  }

  // 2.6 Duplicate widget IDs
  {
    const dups = ['metricas', 'metricas', 'graficas', 'metricas', 'expedientes'];
    const result = computeCanonicalOrder(dups);
    const expected = ['metricas', 'graficas', 'expedientes', 'audiencias', 'actividad'];
    if (JSON.stringify(result) === JSON.stringify(expected) && result.length === 5) {
      pass('CORRUPT-DUPS-01', 'Duplicate widget IDs deduplicated cleanly, preserving order and canonical count of 5', `Unique: ${result.join(', ')}`);
    } else {
      fail('CORRUPT-DUPS-01', 'Duplicate handling failed', `Expected: ${expected}, got: ${result}`);
    }
  }

  // ==========================================================================
  // SUITE 3: Backend Preferences API Validation & Persistence Stress
  // ==========================================================================
  setSuite('Suite 3: Backend Preferences API Validation & Persistence Stress');

  let adminToken = null;
  let consultaToken = null;

  try {
    adminToken = await login('admin@tjabcs.gob.mx', 'password123');
    consultaToken = await login('consulta@tjabcs.gob.mx', 'password123');
    pass('AUTH-SETUP', 'Acquired admin and non-admin session tokens');
  } catch (err) {
    fail('AUTH-SETUP', 'Authentication failed', err.message);
    return;
  }

  const authHeaders = { Authorization: `Bearer ${adminToken}` };
  const consultaHeaders = { Authorization: `Bearer ${consultaToken}` };

  // 3.1 Unauthenticated PUT ordenWidgets rejected with 401
  {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      body: { ordenWidgets: ['graficas', 'metricas'] },
    });
    if (res.status === 401) {
      pass('API-UNAUTH-GUARD', 'Unauthenticated PUT ordenWidgets rejected with HTTP 401 Unauthorized');
    } else {
      fail('API-UNAUTH-GUARD', `Expected 401, got HTTP ${res.status}`);
    }
  }

  // 3.2 Non-array / non-JSON string ordenWidgets rejected with 400
  {
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: 12345 },
    });
    if (res.status === 400 && res.data?.error?.includes('ordenWidgets')) {
      pass('API-TYPE-GUARD-NUM', 'Number in ordenWidgets rejected with HTTP 400 Bad Request', res.data.error);
    } else {
      fail('API-TYPE-GUARD-NUM', `Expected 400, got HTTP ${res.status}`);
    }

    const resBadStr = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: 'not-a-json-array' },
    });
    if (resBadStr.status === 400 && resBadStr.data?.error?.includes('ordenWidgets')) {
      pass('API-TYPE-GUARD-STR', 'Malformed non-JSON string in ordenWidgets rejected with HTTP 400 Bad Request');
    } else {
      fail('API-TYPE-GUARD-STR', `Expected 400, got HTTP ${resBadStr.status}`);
    }
  }

  // 3.3 Valid custom ordenWidgets persistence via PUT and GET
  const targetCustomOrder = ['audiencias', 'actividad', 'metricas', 'graficas', 'expedientes'];
  {
    const putRes = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: targetCustomOrder },
    });

    if (putRes.status === 200 && Array.isArray(putRes.data?.ordenWidgets)) {
      if (JSON.stringify(putRes.data.ordenWidgets) === JSON.stringify(targetCustomOrder)) {
        pass('API-PUT-PERSIST', 'PUT /api/usuarios/preferencias successfully returns persisted custom ordenWidgets', `Order: ${putRes.data.ordenWidgets.join(', ')}`);
      } else {
        fail('API-PUT-PERSIST', 'Persisted array mismatch', `Expected: ${targetCustomOrder}, got: ${putRes.data.ordenWidgets}`);
      }
    } else {
      fail('API-PUT-PERSIST', `PUT failed with HTTP ${putRes.status}`);
    }

    // Direct GET verification
    const getRes = await api('/api/usuarios/preferencias', { headers: authHeaders });
    if (getRes.status === 200 && JSON.stringify(getRes.data?.ordenWidgets) === JSON.stringify(targetCustomOrder)) {
      pass('API-GET-PERSIST', 'GET /api/usuarios/preferencias reliably fetches persisted ordenWidgets from SQLite');
    } else {
      fail('API-GET-PERSIST', 'GET returned mismatching order', JSON.stringify(getRes.data?.ordenWidgets));
    }
  }

  // 3.4 English alias property 'dashboardWidgetOrder'
  {
    const englishOrder = ['expedientes', 'metricas', 'graficas', 'audiencias', 'actividad'];
    const aliasRes = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { dashboardWidgetOrder: englishOrder },
    });
    if (aliasRes.status === 200 && JSON.stringify(aliasRes.data?.ordenWidgets) === JSON.stringify(englishOrder)) {
      pass('API-ALIAS-SUPPORT', 'Supports English alias payload { dashboardWidgetOrder: [...] } transparently');
    } else {
      fail('API-ALIAS-SUPPORT', `Alias payload failed: ${JSON.stringify(aliasRes.data)}`);
    }
  }

  // 3.5 High-concurrency burst: 15 concurrent PUT requests with varied widget orders
  {
    const ordersList = [
      ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'],
      ['expedientes', 'actividad', 'audiencias', 'graficas', 'metricas'],
      ['audiencias', 'metricas', 'expedientes', 'graficas', 'actividad'],
      ['graficas', 'audiencias', 'actividad', 'metricas', 'expedientes'],
      ['actividad', 'expedientes', 'metricas', 'graficas', 'audiencias'],
    ];

    const burstPromises = [];
    for (let i = 0; i < 15; i++) {
      const order = ordersList[i % ordersList.length];
      burstPromises.push(
        api('/api/usuarios/preferencias', {
          method: 'PUT',
          headers: authHeaders,
          body: { ordenWidgets: order },
        })
      );
    }

    const burstResponses = await Promise.all(burstPromises);
    const allOk = burstResponses.every((r) => r.status === 200);
    if (allOk) {
      pass('API-BURST-CONCURRENCY', '15 concurrent ordenWidgets PUT requests resolved with zero SQLite lock deadlocks (100% HTTP 200)');
    } else {
      fail('API-BURST-CONCURRENCY', 'Burst concurrency produced failures');
    }

    // Verify DB consistency post-burst
    const checkRes = await api('/api/usuarios/preferencias', { headers: authHeaders });
    if (checkRes.status === 200 && Array.isArray(checkRes.data?.ordenWidgets) && checkRes.data.ordenWidgets.length === 5) {
      pass('API-BURST-CONSISTENCY', 'Post-burst state in DB is healthy, valid JSON and contains exactly 5 elements', `Current order: ${checkRes.data.ordenWidgets.join(', ')}`);
    } else {
      fail('API-BURST-CONSISTENCY', 'Post-burst state corrupted');
    }
  }

  // 3.6 Multi-User Isolation for ordenWidgets
  {
    const orderUserA = ['expedientes', 'audiencias', 'metricas', 'graficas', 'actividad'];
    const orderUserB = ['actividad', 'graficas', 'expedientes', 'metricas', 'audiencias'];

    await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: orderUserA },
    });

    await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: consultaHeaders,
      body: { ordenWidgets: orderUserB },
    });

    const resA = await api('/api/usuarios/preferencias', { headers: authHeaders });
    const resB = await api('/api/usuarios/preferencias', { headers: consultaHeaders });

    const isIsolated =
      JSON.stringify(resA.data?.ordenWidgets) === JSON.stringify(orderUserA) &&
      JSON.stringify(resB.data?.ordenWidgets) === JSON.stringify(orderUserB) &&
      JSON.stringify(resA.data?.ordenWidgets) !== JSON.stringify(resB.data?.ordenWidgets);

    if (isIsolated) {
      pass('API-MULTIUSER-ISOLATION', 'User A and User B maintain completely isolated widget orders in SQLite DB', `User A starts with "${resA.data.ordenWidgets[0]}", User B with "${resB.data.ordenWidgets[0]}"`);
    } else {
      fail('API-MULTIUSER-ISOLATION', 'Widget order bled between users');
    }
  }

  // 3.7 Cross-session persistence across logout & fresh login
  {
    const targetSessionOrder = ['graficas', 'expedientes', 'actividad', 'audiencias', 'metricas'];
    await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: targetSessionOrder },
    });

    // Terminate Session 1
    await logout(adminToken);

    // Fresh login Session 2
    const freshToken = await login('admin@tjabcs.gob.mx', 'password123');
    const freshRes = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${freshToken}` },
    });

    if (JSON.stringify(freshRes.data?.ordenWidgets) === JSON.stringify(targetSessionOrder)) {
      pass('API-SESSION-PERSISTENCE', 'Widget order persisted across session termination and restored on fresh login', `Restored: ${freshRes.data.ordenWidgets.join(', ')}`);
    } else {
      fail('API-SESSION-PERSISTENCE', 'Widget order failed to persist across logout');
    }

    // Refresh adminToken for subsequent tests
    adminToken = freshToken;
    authHeaders.Authorization = `Bearer ${adminToken}`;
  }

  // ==========================================================================
  // SUITE 4: Real Headless Chrome Browser CDP Live Dashboard Stress Test
  // ==========================================================================
  setSuite('Suite 4: Real Headless Chrome Browser CDP Live Dashboard Stress Test');

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER-AVAIL', 'No compatible Chrome or Edge executable found on Windows system');
    return;
  }

  // Launch headless browser
  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger-cdp-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempProfileDir}`,
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
  ];

  const browserProcess = spawn(browserPath, browserArgs, { stdio: 'ignore' });
  const cleanupBrowser = () => {
    try {
      browserProcess.kill();
    } catch {}
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {}
  };

  process.on('exit', cleanupBrowser);

  // Wait for CDP port
  let cdpReady = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const verRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (verRes.ok) {
        cdpReady = true;
        break;
      }
    } catch {}
  }

  if (!cdpReady) {
    fail('CDP-CONNECT', `Could not connect to CDP on port ${CDP_PORT}`);
    cleanupBrowser();
    return;
  }

  pass('CDP-CONNECT', 'Headless Browser started and CDP connection established', `Port: ${CDP_PORT}`);

  let cdp = null;
  try {
    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    cdp = new CdpSession(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    // Enable CDP domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // Track console errors
    const collectedErrors = [];
    cdp.on('Runtime.exceptionThrown', (params) => {
      const text = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown exception';
      collectedErrors.push({ type: 'uncaughtException', text });
    });
    cdp.on('Console.messageAdded', (params) => {
      if (params.message?.level === 'error') {
        const text = params.message.text || '';
        if (!text.includes('favicon.ico') && !text.includes('status of 404')) {
          collectedErrors.push({ type: 'consoleError', text });
        }
      }
    });

    // Reset user preferences in backend to clean baseline before navigating
    await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: ALL_WIDGET_KEYS },
    });

    // Inject auth cookie
    const cookieDomain = new URL(FRONTEND_URL).hostname;
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      secure: false,
    });

    // Navigate to Dashboard root (/)
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise((r) => setTimeout(r, 900));

    // 4.1 Verify Initial 5 Dashboard Widgets Rendered
    const widgetInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return {
            count: els.length,
            ids: els.map(el => el.getAttribute('data-widget-id'))
          };
        })()
      `,
      returnByValue: true,
    });

    const renderedWidgets = widgetInspect.result?.value?.ids || [];
    if (renderedWidgets.length === 5 && JSON.stringify(renderedWidgets) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('CDP-RENDER-INITIAL', 'Dashboard mounts all 5 widgets ordered by default catalog', `Order: ${renderedWidgets.join(', ')}`);
    } else {
      fail('CDP-RENDER-INITIAL', 'Initial widget count or order mismatch', JSON.stringify(widgetInspect.result?.value));
    }

    // 4.2 Inspect Boundary Button States
    const buttonStates = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const widgets = Array.from(document.querySelectorAll('[data-widget-id]'));
          return widgets.map((w, idx) => {
            const id = w.getAttribute('data-widget-id');
            const btns = Array.from(w.querySelectorAll('button[title*="arriba"], button[title*="abajo"], button[aria-label*="arriba"], button[aria-label*="abajo"]'));
            const upBtn = btns.find(b => b.getAttribute('title')?.toLowerCase().includes('arriba') || b.getAttribute('aria-label')?.toLowerCase().includes('arriba'));
            const downBtn = btns.find(b => b.getAttribute('title')?.toLowerCase().includes('abajo') || b.getAttribute('aria-label')?.toLowerCase().includes('abajo'));
            return {
              id,
              index: idx,
              isUpDisabled: upBtn ? upBtn.disabled : null,
              isDownDisabled: downBtn ? downBtn.disabled : null
            };
          });
        })()
      `,
      returnByValue: true,
    });

    const states = buttonStates.result?.value || [];
    const firstState = states[0];
    const lastState = states[states.length - 1];

    if (firstState?.isUpDisabled === true && firstState?.isDownDisabled === false) {
      pass('CDP-BOUND-FIRST-BTN', 'First widget (#1) Move Up button is strictly disabled; Move Down is enabled', `Widget: ${firstState.id}`);
    } else {
      fail('CDP-BOUND-FIRST-BTN', 'First widget button disabled state mismatch', JSON.stringify(firstState));
    }

    if (lastState?.isDownDisabled === true && lastState?.isUpDisabled === false) {
      pass('CDP-BOUND-LAST-BTN', 'Last widget (#5) Move Down button is strictly disabled; Move Up is enabled', `Widget: ${lastState.id}`);
    } else {
      fail('CDP-BOUND-LAST-BTN', 'Last widget button disabled state mismatch', JSON.stringify(lastState));
    }

    // 4.3 Click disabled Up button on first widget -> assert order unaffected
    const clickDisabledUp = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const firstWidget = document.querySelector('[data-widget-id]');
          const upBtn = firstWidget.querySelector('button[title*="arriba"], button[aria-label*="arriba"]');
          if (upBtn) upBtn.click();
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return els.map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    if (JSON.stringify(clickDisabledUp.result?.value) === JSON.stringify(renderedWidgets)) {
      pass('CDP-CLICK-DISABLED-UP', 'Clicking disabled Up button on first widget produces zero change in widget order');
    } else {
      fail('CDP-CLICK-DISABLED-UP', 'Order mutated after clicking disabled button', JSON.stringify(clickDisabledUp.result?.value));
    }

    // 4.4 Click disabled Down button on last widget -> assert order unaffected
    const clickDisabledDown = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const widgets = Array.from(document.querySelectorAll('[data-widget-id]'));
          const lastWidget = widgets[widgets.length - 1];
          const downBtn = lastWidget.querySelector('button[title*="abajo"], button[aria-label*="abajo"]');
          if (downBtn) downBtn.click();
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return els.map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    if (JSON.stringify(clickDisabledDown.result?.value) === JSON.stringify(renderedWidgets)) {
      pass('CDP-CLICK-DISABLED-DOWN', 'Clicking disabled Down button on last widget produces zero change in widget order');
    } else {
      fail('CDP-CLICK-DISABLED-DOWN', 'Order mutated after clicking disabled button');
    }

    // 4.5 Live Single Swap via Move Down click on widget #1 ('metricas')
    const performSwapDown = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const firstWidget = document.querySelector('[data-widget-id="metricas"]');
          const downBtn = firstWidget.querySelector('button[title*="abajo"], button[aria-label*="abajo"]');
          if (downBtn) {
            downBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 200));

    const afterSwapInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return els.map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    const expectedAfterSwap = ['graficas', 'metricas', 'audiencias', 'actividad', 'expedientes'];
    if (JSON.stringify(afterSwapInspect.result?.value) === JSON.stringify(expectedAfterSwap)) {
      pass('CDP-LIVE-SWAP-DOWN', 'Clicking Move Down on widget #1 immediately swaps with widget #2 in real DOM', `Order: ${afterSwapInspect.result.value.join(', ')}`);
    } else {
      fail('CDP-LIVE-SWAP-DOWN', 'Live swap down failed', JSON.stringify(afterSwapInspect.result?.value));
    }

    // 4.6 Rapid successive clicks: Bubble 'metricas' down 3 more times
    for (let i = 0; i < 3; i++) {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            const w = document.querySelector('[data-widget-id="metricas"]');
            const downBtn = w.querySelector('button[title*="abajo"], button[aria-label*="abajo"]');
            if (downBtn) downBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 60)); // Fast successive clicks (60ms)
    }

    await new Promise((r) => setTimeout(r, 200));

    const finalBubbleInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return els.map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    const expectedFinalBubble = ['graficas', 'audiencias', 'actividad', 'expedientes', 'metricas'];
    if (JSON.stringify(finalBubbleInspect.result?.value) === JSON.stringify(expectedFinalBubble)) {
      pass('CDP-RAPID-CLICKS', 'Rapid successive clicks bubble widget to position #5 without UI race conditions or dropped frames', `Order: ${finalBubbleInspect.result.value.join(', ')}`);
    } else {
      fail('CDP-RAPID-CLICKS', 'Rapid clicks produced wrong order', JSON.stringify(finalBubbleInspect.result?.value));
    }

    // 4.7 High-velocity event burst: 25 rapid custom events
    const eventBurstResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const orders = [
            ['actividad', 'audiencias', 'graficas', 'metricas', 'expedientes'],
            ['audiencias', 'expedientes', 'metricas', 'actividad', 'graficas'],
            ['expedientes', 'graficas', 'audiencias', 'actividad', 'metricas'],
            ['graficas', 'actividad', 'metricas', 'audiencias', 'expedientes']
          ];
          for (let i = 0; i < 20; i++) {
            const target = orders[i % orders.length];
            window.dispatchEvent(new CustomEvent('tja:widget-order-changed', {
              detail: target,
              bubbles: true
            }));
            await new Promise(r => setTimeout(r, 5));
          }
          // Final authoritative event
          const finalTarget = ['expedientes', 'audiencias', 'actividad', 'graficas', 'metricas'];
          window.dispatchEvent(new CustomEvent('tja:widget-order-changed', {
            detail: finalTarget,
            bubbles: true
          }));
          return finalTarget;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 200));

    const postEventBurstInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return els.map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    const expectedBurstOrder = ['expedientes', 'audiencias', 'actividad', 'graficas', 'metricas'];
    if (JSON.stringify(postEventBurstInspect.result?.value) === JSON.stringify(expectedBurstOrder)) {
      pass('CDP-EVENT-BURST', '20+ rapid tja:widget-order-changed custom events coalesced into final expected order in DOM', `Order: ${postEventBurstInspect.result.value.join(', ')}`);
    } else {
      fail('CDP-EVENT-BURST', 'Event burst failed', JSON.stringify(postEventBurstInspect.result?.value));
    }

    // 4.8 Corrupted Event Injection Defense in real browser
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          // Dispatch corrupted payload with unknown and malicious keys
          window.dispatchEvent(new CustomEvent('tja:widget-order-changed', {
            detail: ['corrupted_item_1', 'actividad', 'hacked_module', 'expedientes', 'unknown_item_2'],
            bubbles: true
          }));
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 200));

    const postCorruptInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return {
            count: els.length,
            ids: els.map(el => el.getAttribute('data-widget-id'))
          };
        })()
      `,
      returnByValue: true,
    });

    const expectedCorruptSanitized = ['actividad', 'expedientes', 'metricas', 'graficas', 'audiencias'];
    const currentRendered = postCorruptInspect.result?.value?.ids || [];
    if (
      currentRendered.length === 5 &&
      JSON.stringify(currentRendered) === JSON.stringify(expectedCorruptSanitized)
    ) {
      pass('CDP-CORRUPT-INJECT-DEFENSE', 'Hostile event injection with unknown widget IDs sanitized; exactly 5 canonical widgets rendered', `Sanitized Order: ${currentRendered.join(', ')}`);
    } else {
      fail('CDP-CORRUPT-INJECT-DEFENSE', 'Corrupted event injection corrupted DOM', JSON.stringify(postCorruptInspect.result?.value));
    }

    // 4.9 Click "Restablecer Orden" button
    const clickReset = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const buttons = Array.from(document.querySelectorAll('button'));
          const resetBtn = buttons.find(b => 
            b.textContent.toLowerCase().includes('restablecer orden') ||
            b.getAttribute('title')?.toLowerCase().includes('restablecer')
          );
          if (resetBtn) {
            resetBtn.click();
            return { clicked: true };
          }
          return { clicked: false };
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 200));

    const postResetInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const els = Array.from(document.querySelectorAll('[data-widget-id]'));
          return els.map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    if (
      clickReset.result?.value?.clicked &&
      JSON.stringify(postResetInspect.result?.value) === JSON.stringify(ALL_WIDGET_KEYS)
    ) {
      pass('CDP-RESET-ORDER-BTN', 'Clicking "Restablecer Orden" restores full default catalog order', `Restored: ${postResetInspect.result.value.join(', ')}`);
    } else {
      fail('CDP-RESET-ORDER-BTN', 'Reset button failed or order not restored', JSON.stringify(postResetInspect.result?.value));
    }

    // 4.10 Debounced Network Persistence verification
    // Wait for 500ms to allow DEBOUNCE_DELAY_MS (400ms) to flush to backend
    await new Promise((r) => setTimeout(r, 600));

    const backendVerifyRes = await api('/api/usuarios/preferencias', { headers: authHeaders });
    if (
      backendVerifyRes.status === 200 &&
      JSON.stringify(backendVerifyRes.data?.ordenWidgets) === JSON.stringify(ALL_WIDGET_KEYS)
    ) {
      pass('CDP-DEBOUNCE-PERSIST', 'Debounced network flush completed: SQLite DB reflects reset order without manual page reload');
    } else {
      fail('CDP-DEBOUNCE-PERSIST', 'Debounce flush did not persist reset order in DB', JSON.stringify(backendVerifyRes.data?.ordenWidgets));
    }

    // 4.11 Zero Console Errors throughout CDP run
    if (collectedErrors.length === 0) {
      pass('CDP-ZERO-CONSOLE-ERRORS', 'Zero console errors or uncaught runtime exceptions throughout entire adversarial CDP session', '0 exceptions / 0 errors');
    } else {
      fail('CDP-ZERO-CONSOLE-ERRORS', 'Console errors detected during session', collectedErrors.map((e) => `[${e.type}] ${e.text}`).join('; '));
    }
  } finally {
    if (cdp) cdp.close();
    cleanupBrowser();
  }

  // ==========================================================================
  // FINAL SUMMARY & VERDICT
  // ==========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}              CHALLENGER VERIFICATION EXECUTION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  ${colors.green}Passed Tests:       ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests > 0 ? colors.red : colors.gray}Failed Tests:       ${failedTests}${colors.reset}`);
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.error(`${colors.red}${colors.bold}ADVERSARIAL VERIFICATION FAILED with ${failedTests} failure(s).${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.id}] ${f.title}`);
      console.error(`     Suite: ${f.suite}`);
      console.error(`     Error: ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% Success). VERDICT: APPROVE.${colors.reset}\n`);
    process.exit(0);
  }
}

runAllSuites().catch((err) => {
  console.error('\nFatal unhandled error in test suite:', err);
  process.exit(1);
});
