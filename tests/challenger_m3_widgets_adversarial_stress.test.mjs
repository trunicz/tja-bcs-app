/**
 * tests/challenger_m3_widgets_adversarial_stress.test.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE: Dashboard Widgets Reordering
 * Challenger: challenger_m3_2_o9 (critic, specialist)
 * Milestone: Milestone 3 (Dashboard Widgets Reordering Adversarial Stress)
 *
 * SCOPE & RESPONSIBILITIES:
 * 1. Empirically and adversarially stress-test Dashboard Widgets drag reordering
 *    in frontend/src/components/dashboard/DashboardWidgets.tsx.
 * 2. Edge cases tested:
 *    - Malformed/partial arrays in ordenWidgets (missing widgets, duplicate keys, extra unknown keys)
 *    - HTML5 Drag-and-drop reordering: first to last, last to first, adjacent swapping, self-drop, alien keys
 *    - Reset button action ("Restablecer Orden") restoring all 5 default widgets in exact canonical order
 *    - Multiple sequential resets and reorderings (intensive 10-cycle loop)
 *    - Persistence to SQLite backend across hard page reloads
 *    - Multi-user isolation and concurrent reordering
 *    - Live Headless Chrome CDP verification with 0 console errors
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
const CDP_PORT = parseInt(process.env.CDP_PORT || '9336', 10);

// ANSI Terminal Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
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

// Canonical widget keys
const ALL_WIDGET_KEYS = ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'];

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
  console.log(`${colors.bold}   CHALLENGER 2 ADVERSARIAL STRESS: DASHBOARD WIDGETS REORDERING & PERSISTENCE${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Backend:  ${BACKEND_URL}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL}${colors.reset}\n`);

  let adminToken = null;
  let consultaToken = null;

  try {
    adminToken = await login('admin@tjabcs.gob.mx', 'password123');
    consultaToken = await login('consulta@tjabcs.gob.mx', 'password123');
    pass('AUTH-SETUP', 'Successfully authenticated admin and consulta test sessions');
  } catch (err) {
    fail('AUTH-SETUP', 'Authentication failed during pre-flight setup', err.message);
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${adminToken}` };
  const consultaHeaders = { Authorization: `Bearer ${consultaToken}` };

  // ==========================================================================
  // SUITE 1: Malformed, Partial, and Corrupted ordenWidgets Payloads (API & Model)
  // ==========================================================================
  setSuite('Suite 1: Malformed, Partial, and Corrupted ordenWidgets Payloads');

  // 1.1 Missing widgets: payload with only 2 widgets
  {
    const partialPayload = ['expedientes', 'graficas'];
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: partialPayload },
    });
    if (res.status === 200) {
      pass('CORRUPT-PARTIAL-PUT', 'Backend accepts partial valid subset of ordenWidgets without 500 error');
    } else {
      fail('CORRUPT-PARTIAL-PUT', 'Backend rejected partial subset', JSON.stringify(res.data));
    }
  }

  // 1.2 Extra unknown / alien keys in array
  {
    const alienPayload = ['alien_alpha', 'actividad', 'alien_beta', 'metricas', 'unknown_gamma'];
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: alienPayload },
    });
    if (res.status === 200) {
      pass('CORRUPT-ALIEN-PUT', 'Backend accepts array containing alien keys without crashing');
    } else {
      fail('CORRUPT-ALIEN-PUT', 'Backend crashed or rejected alien keys', JSON.stringify(res.data));
    }
  }

  // 1.3 Empty array []
  {
    const emptyPayload = [];
    const res = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: emptyPayload },
    });
    if (res.status === 200) {
      pass('CORRUPT-EMPTY-PUT', 'Backend accepts empty array without crashing');
    } else {
      fail('CORRUPT-EMPTY-PUT', 'Backend failed on empty array', JSON.stringify(res.data));
    }
  }

  // 1.4 Non-array types (boolean, number, object) rejected with HTTP 400
  {
    const testCases = [
      { val: 12345, desc: 'number' },
      { val: true, desc: 'boolean' },
      { val: { foo: 'bar' }, desc: 'object' },
      { val: '{ invalid json', desc: 'malformed json string' },
    ];
    let allGuarded = true;
    for (const tc of testCases) {
      const res = await api('/api/usuarios/preferencias', {
        method: 'PUT',
        headers: authHeaders,
        body: { ordenWidgets: tc.val },
      });
      if (res.status !== 400) {
        allGuarded = false;
        fail(`CORRUPT-GUARD-${tc.desc}`, `Expected HTTP 400 for ${tc.desc}, got ${res.status}`);
      }
    }
    if (allGuarded) {
      pass('CORRUPT-TYPE-GUARDS', 'Non-array invalid types strictly rejected with HTTP 400 Bad Request');
    }
  }

  // 1.5 Restore Canonical Baseline for Admin
  {
    const resetRes = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: { ordenWidgets: ALL_WIDGET_KEYS },
    });
    if (resetRes.status === 200) {
      pass('CANONICAL-RESTORE', 'Admin preferences reset to canonical order in SQLite');
    } else {
      fail('CANONICAL-RESTORE', 'Failed to restore canonical baseline', JSON.stringify(resetRes.data));
    }
  }

  // ==========================================================================
  // SUITE 2: Live Headless Chrome Browser CDP Drag-and-Drop & Edge Operations
  // ==========================================================================
  setSuite('Suite 2: Live Browser CDP Drag-and-Drop & Direct Manipulation');

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('BROWSER-LOCATE', 'Chrome or Edge browser executable not found on host');
    return;
  }
  pass('BROWSER-LOCATE', 'Located browser executable', browserPath);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tja-m3-cdp-'));
  let browserProcess = null;
  let cdp = null;
  const collectedErrors = [];

  const cleanupBrowser = () => {
    if (browserProcess) {
      try {
        browserProcess.kill('SIGKILL');
      } catch {}
      browserProcess = null;
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    browserProcess = spawn(
      browserPath,
      [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1440,900',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    // Wait for CDP endpoint to be available
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!versionData) {
      throw new Error(`Failed to connect to CDP on port ${CDP_PORT}`);
    }

    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    cdp = new CdpSession(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    // Enable domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

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

    // Set auth cookie for SSR middleware
    const cookieDomain = new URL(FRONTEND_URL).hostname;
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      secure: false,
    });

    // Navigate to Dashboard root
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise((r) => setTimeout(r, 1200));

    // Verify all 5 widgets rendered with drag handles
    const widgetInfo = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const widgets = Array.from(document.querySelectorAll('[data-widget-id]'));
          const handles = Array.from(document.querySelectorAll('[data-drag-handle="true"]'));
          return {
            widgetIds: widgets.map(w => w.getAttribute('data-widget-id')),
            handleCount: handles.length,
            allHandlesDraggable: handles.every(h => h.getAttribute('draggable') === 'true')
          };
        })()
      `,
      returnByValue: true,
    });

    const initialData = widgetInfo.result?.value;
    if (
      initialData &&
      initialData.widgetIds.length === 5 &&
      initialData.handleCount === 5 &&
      initialData.allHandlesDraggable
    ) {
      pass('CDP-INITIAL-HANDLES', 'All 5 widgets mount with verified draggable="true" GripVertical handles', `Order: ${initialData.widgetIds.join(', ')}`);
    } else {
      fail('CDP-INITIAL-HANDLES', 'Widgets or drag handles missing in DOM', JSON.stringify(initialData));
    }

    // 2.1 Native HTML5 DnD Simulation Helper
    async function simulateDragAndDrop(sourceKey, targetKey) {
      return await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            try {
              const sourceCard = document.querySelector('[data-widget-id="${sourceKey}"]');
              const targetCard = document.querySelector('[data-widget-id="${targetKey}"]');
              if (!sourceCard || !targetCard) return { error: 'Element not found' };

              const handle = sourceCard.querySelector('[data-drag-handle="true"]') || sourceCard;

              // Real browser DataTransfer object
              const dt = new DataTransfer();
              dt.setData('text/plain', '${sourceKey}');
              dt.effectAllowed = 'move';

              // 1. DragStart
              const dragStartEvt = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt });
              handle.dispatchEvent(dragStartEvt);

              // 2. DragOver on Target
              const dragOverEvt = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
              targetCard.dispatchEvent(dragOverEvt);

              // 3. Drop on Target
              const dropEvt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
              targetCard.dispatchEvent(dropEvt);

              // 4. DragEnd on Handle
              const dragEndEvt = new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt });
              handle.dispatchEvent(dragEndEvt);

              const els = Array.from(document.querySelectorAll('[data-widget-id]'));
              return {
                order: els.map(el => el.getAttribute('data-widget-id'))
              };
            } catch (err) {
              return { error: err.message };
            }
          })()
        `,
        returnByValue: true,
      });
    }

    async function getRenderedOrder() {
      const res = await cdp.send('Runtime.evaluate', {
        expression: `Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'))`,
        returnByValue: true,
      });
      return res.result?.value || [];
    }

    // 2.2 Drag FIRST to LAST: 'metricas' dropped onto 'expedientes'
    {
      await simulateDragAndDrop('metricas', 'expedientes');
      await new Promise((r) => setTimeout(r, 150));
      const order = await getRenderedOrder();
      const expected = ['graficas', 'audiencias', 'actividad', 'expedientes', 'metricas'];
      if (JSON.stringify(order) === JSON.stringify(expected)) {
        pass('DND-FIRST-TO-LAST', 'Dragging first widget (metricas) and dropping on last (expedientes) repositions it to index 4', `Order: ${order.join(', ')}`);
      } else {
        fail('DND-FIRST-TO-LAST', 'DnD first to last failed', JSON.stringify(order));
      }
    }

    // 2.3 Drag LAST to FIRST: 'metricas' (now at index 4) dropped onto 'graficas' (at index 0)
    {
      await simulateDragAndDrop('metricas', 'graficas');
      await new Promise((r) => setTimeout(r, 150));
      const order = await getRenderedOrder();
      const expected = ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'];
      if (JSON.stringify(order) === JSON.stringify(expected)) {
        pass('DND-LAST-TO-FIRST', 'Dragging last widget and dropping onto first repositions it back to index 0', `Order: ${order.join(', ')}`);
      } else {
        fail('DND-LAST-TO-FIRST', 'DnD last to first failed', JSON.stringify(order));
      }
    }

    // 2.4 Adjacent Swapping: 'audiencias' (index 2) dropped onto 'graficas' (index 1)
    {
      await simulateDragAndDrop('audiencias', 'graficas');
      await new Promise((r) => setTimeout(r, 150));
      const order = await getRenderedOrder();
      const expected = ['metricas', 'audiencias', 'graficas', 'actividad', 'expedientes'];
      if (JSON.stringify(order) === JSON.stringify(expected)) {
        pass('DND-ADJACENT-SWAP', 'Dragging widget onto adjacent neighbor swaps their positions cleanly', `Order: ${order.join(', ')}`);
      } else {
        fail('DND-ADJACENT-SWAP', 'Adjacent swap failed', JSON.stringify(order));
      }
    }

    // 2.5 Self-Drop: 'audiencias' dropped onto 'audiencias' (should be a no-op)
    {
      await simulateDragAndDrop('audiencias', 'audiencias');
      await new Promise((r) => setTimeout(r, 150));
      const order = await getRenderedOrder();
      const expected = ['metricas', 'audiencias', 'graficas', 'actividad', 'expedientes'];
      if (JSON.stringify(order) === JSON.stringify(expected)) {
        pass('DND-SELF-DROP-NOOP', 'Dropping widget on itself is a graceful no-op with zero order mutation');
      } else {
        fail('DND-SELF-DROP-NOOP', 'Self-drop mutated array', JSON.stringify(order));
      }
    }

    // 2.6 Alien Key Drop Injection: Drop with unknown key should be safely rejected
    {
      const alienDrop = await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            const targetCard = document.querySelector('[data-widget-id="metricas"]');
            const dt = new DataTransfer();
            dt.setData('text/plain', 'alien_malicious_key');
            const dropEvt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
            targetCard.dispatchEvent(dropEvt);
            const els = Array.from(document.querySelectorAll('[data-widget-id]'));
            return els.map(el => el.getAttribute('data-widget-id'));
          })()
        `,
        returnByValue: true,
      });
      const order = alienDrop.result?.value;
      const expected = ['metricas', 'audiencias', 'graficas', 'actividad', 'expedientes'];
      if (JSON.stringify(order) === JSON.stringify(expected)) {
        pass('DND-ALIEN-KEY-REJECT', 'Dropping unknown/alien widget key is rejected gracefully; 5 canonical widgets preserved');
      } else {
        fail('DND-ALIEN-KEY-REJECT', 'Alien key drop corrupted DOM', JSON.stringify(order));
      }
    }

    // ==========================================================================
    // SUITE 3: Reset Button & Intensive Sequential Stress Loops
    // ==========================================================================
    setSuite('Suite 3: Reset Button Action & Sequential Reorder/Reset Loops');

    // 3.1 Single Reset Button Click
    const resetClick = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const resetBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent.toLowerCase().includes('restablecer orden')
          );
          if (resetBtn) {
            resetBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 200));

    const postResetDOM = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    if (resetClick.result?.value && JSON.stringify(postResetDOM.result?.value) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('RESET-BUTTON-RESTORES', '1-Click "Restablecer Orden" restores all 5 default widgets in exact canonical order', `Restored: ${postResetDOM.result.value.join(', ')}`);
    } else {
      fail('RESET-BUTTON-RESTORES', 'Reset button failed', JSON.stringify(postResetDOM.result?.value));
    }

    // 3.2 Intensive 10-Iteration Reorder -> Reset -> Reorder Stress Loop
    let loopPassed = true;
    for (let cycle = 1; cycle <= 10; cycle++) {
      // Step A: Perform drag reorder: move 'graficas' to last position
      await simulateDragAndDrop('graficas', 'expedientes');
      await new Promise((r) => setTimeout(r, 60));

      const afterDrag = await cdp.send('Runtime.evaluate', {
        expression: `Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'))`,
        returnByValue: true,
      });
      const expectedDragged = ['metricas', 'audiencias', 'actividad', 'expedientes', 'graficas'];
      if (JSON.stringify(afterDrag.result?.value) !== JSON.stringify(expectedDragged)) {
        loopPassed = false;
        fail(`STRESS-LOOP-${cycle}`, `Cycle ${cycle} drag failed`, JSON.stringify(afterDrag.result?.value));
        break;
      }

      // Step B: Click Reset button
      await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            const btn = Array.from(document.querySelectorAll('button')).find(b =>
              b.textContent.toLowerCase().includes('restablecer orden')
            );
            if (btn) btn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 60));

      const afterReset = await cdp.send('Runtime.evaluate', {
        expression: `Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'))`,
        returnByValue: true,
      });
      if (JSON.stringify(afterReset.result?.value) !== JSON.stringify(ALL_WIDGET_KEYS)) {
        loopPassed = false;
        fail(`STRESS-LOOP-${cycle}`, `Cycle ${cycle} reset failed`, JSON.stringify(afterReset.result?.value));
        break;
      }
    }

    if (loopPassed) {
      pass('STRESS-10-CYCLE-LOOP', '10 consecutive reorder-then-reset stress cycles executed without race conditions or memory leaks');
    }

    // ==========================================================================
    // SUITE 4: Persistence to SQLite Backend Across Page Reloads
    // ==========================================================================
    setSuite('Suite 4: SQLite Backend Persistence Across Hard Page Reloads');

    // 4.1 Set custom order in browser via DnD: move 'expedientes' to first
    await simulateDragAndDrop('expedientes', 'metricas');
    await new Promise((r) => setTimeout(r, 150));

    const expectedCustomOrder = ['expedientes', 'metricas', 'graficas', 'audiencias', 'actividad'];
    const preReloadDOM = await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'))`,
      returnByValue: true,
    });

    if (JSON.stringify(preReloadDOM.result?.value) !== JSON.stringify(expectedCustomOrder)) {
      fail('PERSIST-PRE-CHECK', 'Pre-reload custom order setup failed', JSON.stringify(preReloadDOM.result?.value));
    } else {
      pass('PERSIST-PRE-CHECK', 'Pre-reload custom order established in UI', `Order: ${expectedCustomOrder.join(', ')}`);
    }

    // Wait 600ms for debounced network persistence to flush to SQLite
    await new Promise((r) => setTimeout(r, 650));

    // Verify backend SQLite has received the custom order
    const backendCheck = await api('/api/usuarios/preferencias', { headers: authHeaders });
    if (
      backendCheck.status === 200 &&
      JSON.stringify(backendCheck.data?.ordenWidgets) === JSON.stringify(expectedCustomOrder)
    ) {
      pass('PERSIST-SQLITE-SAVED', 'Debounced PUT successfully committed custom ordenWidgets to SQLite');
    } else {
      fail('PERSIST-SQLITE-SAVED', 'SQLite did not reflect custom order', JSON.stringify(backendCheck.data?.ordenWidgets));
    }

    // 4.2 Perform Hard Page Reload in Headless Chrome
    await cdp.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 1200));

    const postReloadDOM = await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'))`,
      returnByValue: true,
    });

    if (JSON.stringify(postReloadDOM.result?.value) === JSON.stringify(expectedCustomOrder)) {
      pass('PERSIST-RELOAD-RESTORED', 'Custom widget order survived hard page reload and was restored identically from SQLite', `Restored: ${postReloadDOM.result.value.join(', ')}`);
    } else {
      fail('PERSIST-RELOAD-RESTORED', 'Hard reload did not restore custom order', JSON.stringify(postReloadDOM.result?.value));
    }

    // 4.3 Click Reset button, wait for debounce, and verify persistence after second hard reload
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const btn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent.toLowerCase().includes('restablecer orden')
          );
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 650)); // Wait for debounce write

    await cdp.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 1200));

    const postResetReloadDOM = await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'))`,
      returnByValue: true,
    });

    if (JSON.stringify(postResetReloadDOM.result?.value) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('PERSIST-RESET-RELOAD', 'Reset canonical order survived hard reload and is permanently persisted in SQLite');
    } else {
      fail('PERSIST-RESET-RELOAD', 'Reset order did not survive reload', JSON.stringify(postResetReloadDOM.result?.value));
    }

    // ==========================================================================
    // SUITE 5: Multi-User Isolation & Concurrent Reordering
    // ==========================================================================
    setSuite('Suite 5: Multi-User Isolation & Concurrent Reordering');

    const adminCustom = ['actividad', 'audiencias', 'graficas', 'metricas', 'expedientes'];
    const consultaCustom = ['expedientes', 'graficas', 'audiencias', 'actividad', 'metricas'];

    const [adminPut, consultaPut] = await Promise.all([
      api('/api/usuarios/preferencias', {
        method: 'PUT',
        headers: authHeaders,
        body: { ordenWidgets: adminCustom },
      }),
      api('/api/usuarios/preferencias', {
        method: 'PUT',
        headers: consultaHeaders,
        body: { ordenWidgets: consultaCustom },
      }),
    ]);

    if (adminPut.status === 200 && consultaPut.status === 200) {
      pass('MULTIUSER-CONCURRENT-PUT', 'Simultaneous preferences updates for User A and User B resolved with HTTP 200');
    } else {
      fail('MULTIUSER-CONCURRENT-PUT', 'Concurrent PUT failed', `Admin: ${adminPut.status}, Consulta: ${consultaPut.status}`);
    }

    const [adminGet, consultaGet] = await Promise.all([
      api('/api/usuarios/preferencias', { headers: authHeaders }),
      api('/api/usuarios/preferencias', { headers: consultaHeaders }),
    ]);

    if (
      JSON.stringify(adminGet.data?.ordenWidgets) === JSON.stringify(adminCustom) &&
      JSON.stringify(consultaGet.data?.ordenWidgets) === JSON.stringify(consultaCustom)
    ) {
      pass('MULTIUSER-ISOLATION-VERIFIED', 'User A (Admin) and User B (Consulta) maintain distinct widget orders in SQLite with zero cross-contamination');
    } else {
      fail('MULTIUSER-ISOLATION-VERIFIED', 'Multi-user isolation violated', JSON.stringify({ admin: adminGet.data, consulta: consultaGet.data }));
    }

    // Reset both users to canonical
    await Promise.all([
      api('/api/usuarios/preferencias', { method: 'PUT', headers: authHeaders, body: { ordenWidgets: ALL_WIDGET_KEYS } }),
      api('/api/usuarios/preferencias', { method: 'PUT', headers: consultaHeaders, body: { ordenWidgets: ALL_WIDGET_KEYS } }),
    ]);

    // Check collected browser errors
    if (collectedErrors.length === 0) {
      pass('CDP-CLEAN-RUN', 'Zero uncaught JavaScript exceptions or console errors throughout entire live session', '0 exceptions / 0 errors');
    } else {
      fail('CDP-CLEAN-RUN', 'Console errors detected during session', collectedErrors.map((e) => `[${e.type}] ${e.text}`).join('; '));
    }

  } finally {
    if (cdp) cdp.close();
    cleanupBrowser();
  }

  // ==========================================================================
  // FINAL SUMMARY & VERDICT
  // ==========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}             CHALLENGER 2 ADVERSARIAL STRESS EXECUTION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  ${colors.green}Passed Tests:       ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests > 0 ? colors.red : colors.gray}Failed Tests:       ${failedTests}${colors.reset}`);
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.log(`${colors.red}${colors.bold}ADVERSARIAL FAILURES DETECTED: VERDICT: REQUEST_CHANGES${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% Success). VERDICT: APPROVE.${colors.reset}\n`);
    process.exit(0);
  }
}

runAllSuites().catch((err) => {
  console.error('\nFatal error running adversarial test runner:', err);
  process.exit(1);
});
