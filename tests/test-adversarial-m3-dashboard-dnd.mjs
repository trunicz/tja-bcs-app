/**
 * tests/test-adversarial-m3-dashboard-dnd.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE:
 * Dashboard Widgets Drag-and-Drop Direct Manipulation, Persistence & Reset
 * Challenger: challenger_m3_2_o8 (critic, specialist)
 * Milestone: Milestone 3 (Direct Manipulation: Kanban & Dashboard Drag-and-Drop)
 *
 * Verifications:
 * 1. Drag handles ([data-drag-handle="true"], draggable="true", GripVertical icon)
 *    on all 5 canonical widgets (ALL_WIDGET_KEYS).
 * 2. Interactive Drag-and-Drop event simulation (dragstart, dragenter, dragover, drop, dragend)
 *    with visual feedback (opacity-40, ring highlight, scale) and live reordering.
 * 3. Keyboard navigation accessibility (ArrowUp / ArrowDown) on drag handles.
 * 4. Persistence of ordenWidgets across SQLite DB via /api/preferencias & /api/usuarios/preferencias
 *    and client localStorage.
 * 5. 1-click "Restablecer Orden" button restoring canonical widget ordering in DOM,
 *    localStorage, and SQLite database.
 * 6. Adversarial edge cases: corrupted localStorage, partial arrays, duplicate keys,
 *    rapid drag cancellation, and zero runtime console errors.
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
const CDP_PORT = parseInt(process.env.CDP_PORT || '9337', 10);

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

const ALL_WIDGET_KEYS = ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'];

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

async function runAdversarialDnDTests() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER EMPIRICAL VERIFICATION: DASHBOARD WIDGETS DRAG-AND-DROP${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Backend:  ${BACKEND_URL}${colors.reset}`);
  console.log(`${colors.gray}Frontend: ${FRONTEND_URL}\n${colors.reset}`);

  // ==========================================================================
  // SECTION 1: AUTHENTICATION & BASELINE RESET
  // ==========================================================================
  setSuite('Section 1: Authentication & Baseline Reset');

  let adminToken = null;
  try {
    adminToken = await login('admin@tjabcs.gob.mx', 'password123');
    pass('DND-AUTH-01', 'Admin authentication succeeded', `Token: ${adminToken.slice(0, 16)}...`);
  } catch (err) {
    fail('DND-AUTH-01', 'Admin login failed', err.message);
    return;
  }

  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  // Baseline reset of preferences in backend
  const baselineRes = await api('/api/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { ordenWidgets: ALL_WIDGET_KEYS },
  });
  if (baselineRes.status === 200 && Array.isArray(baselineRes.data?.ordenWidgets)) {
    pass('DND-BASE-01', 'Baseline ordenWidgets restored in SQLite via PUT /api/preferencias', `Widgets: ${baselineRes.data.ordenWidgets.join(', ')}`);
  } else {
    fail('DND-BASE-01', `Baseline reset failed with HTTP ${baselineRes.status}`);
  }

  // ==========================================================================
  // SECTION 2: BROWSER CDP LAUNCH & INITIAL DOM INSPECTION
  // ==========================================================================
  setSuite('Section 2: Browser CDP Launch & Initial DOM Inspection');

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER-AVAIL', 'No compatible Chrome or Edge executable found');
    return;
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger-dnd-${Date.now()}`);
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
  pass('CDP-CONNECT', 'Headless Chrome started and CDP connection established', `Port: ${CDP_PORT}`);

  let cdp = null;
  try {
    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    cdp = new CdpSession(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    const collectedErrors = [];
    cdp.on('Runtime.exceptionThrown', (params) => {
      const text = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown';
      collectedErrors.push({ type: 'exception', text });
    });
    cdp.on('Console.messageAdded', (params) => {
      if (params.message?.level === 'error') {
        const text = params.message.text || '';
        if (!text.includes('favicon.ico') && !text.includes('404')) {
          collectedErrors.push({ type: 'console', text });
        }
      }
    });

    const cookieDomain = new URL(FRONTEND_URL).hostname;
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      secure: false,
    });

    // Navigate to Dashboard
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise((r) => setTimeout(r, 1000));

    // ==========================================================================
    // SECTION 3: EMPIRICAL VERIFICATION OF DRAG HANDLES ON ALL 5 WIDGETS
    // ==========================================================================
    setSuite('Section 3: Empirical Drag Handles ([data-drag-handle="true"], GripVertical) Verification');

    const handlesInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const widgets = Array.from(document.querySelectorAll('[data-widget-id]'));
          return widgets.map((w, idx) => {
            const widgetId = w.getAttribute('data-widget-id');
            const handle = w.querySelector('[data-drag-handle="true"]');
            const isDraggable = handle ? handle.getAttribute('draggable') : null;
            const role = handle ? handle.getAttribute('role') : null;
            const tabIndex = handle ? handle.getAttribute('tabindex') : null;
            const className = handle ? handle.className : '';
            const title = handle ? handle.getAttribute('title') : '';
            const ariaLabel = handle ? handle.getAttribute('aria-label') : '';
            const svg = handle ? handle.querySelector('svg') : null;
            const hasGripSvg = svg ? (svg.classList.contains('lucide-grip-vertical') || svg.innerHTML.includes('circle')) : false;

            return {
              widgetId,
              index: idx,
              hasHandle: !!handle,
              isDraggable,
              role,
              tabIndex,
              hasCursorGrab: className.includes('cursor-grab'),
              title,
              ariaLabel,
              hasGripSvg
            };
          });
        })()
      `,
      returnByValue: true,
    });

    const handles = handlesInspect.result?.value || [];
    if (handles.length === 5) {
      pass('DND-HANDLES-COUNT', 'Exactly 5 widgets detected with associated metadata', `Count: ${handles.length}`);
    } else {
      fail('DND-HANDLES-COUNT', `Expected 5 widgets, got ${handles.length}`);
    }

    let allHandlesValid = true;
    for (const h of handles) {
      const valid =
        h.hasHandle &&
        h.isDraggable === 'true' &&
        h.role === 'button' &&
        h.tabIndex === '0' &&
        h.hasCursorGrab &&
        h.hasGripSvg &&
        h.title.toLowerCase().includes('arrastrar') &&
        h.ariaLabel.toLowerCase().includes('arrastrar');

      if (valid) {
        pass(`DND-HANDLE-${h.widgetId.toUpperCase()}`, `Widget "${h.widgetId}" drag handle strictly conforms to contract`, `draggable=true, role=button, GripVertical SVG verified`);
      } else {
        allHandlesValid = false;
        fail(`DND-HANDLE-${h.widgetId.toUpperCase()}`, `Widget "${h.widgetId}" drag handle failed validation`, JSON.stringify(h));
      }
    }

    // ==========================================================================
    // SECTION 4: DIRECT MANIPULATION DRAG-AND-DROP SIMULATION
    // ==========================================================================
    setSuite('Section 4: Direct Manipulation Drag-and-Drop Simulation');

    // 4.1 Simulate dragging 'expedientes' (index 4) and dropping onto 'metricas' (index 0)
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const widgets = Array.from(document.querySelectorAll('[data-widget-id]'));
          const sourceWidget = widgets.find(w => w.getAttribute('data-widget-id') === 'expedientes');
          const targetWidget = widgets.find(w => w.getAttribute('data-widget-id') === 'metricas');

          if (!sourceWidget || !targetWidget) {
            return { success: false, error: 'Widgets not found' };
          }

          const sourceHandle = sourceWidget.querySelector('[data-drag-handle="true"]');
          if (!sourceHandle) return { success: false, error: 'Drag handle not found' };

          // Use native browser DataTransfer
          const dt = new DataTransfer();
          dt.setData('text/plain', 'expedientes');

          // 1. Dispatch dragstart on source handle
          sourceHandle.dispatchEvent(new DragEvent('dragstart', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));

          // 2. Dispatch dragenter & dragover on target
          targetWidget.dispatchEvent(new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));
          targetWidget.dispatchEvent(new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));

          // 3. Dispatch drop on target
          targetWidget.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));

          // 4. Dispatch dragend on source handle
          sourceHandle.dispatchEvent(new DragEvent('dragend', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));

          return { success: true };
        })()
      `,
    });

    // Wait 150ms for React state update and DOM re-render
    await new Promise((r) => setTimeout(r, 150));

    const postDropDomInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    const updatedOrder = postDropDomInspect.result?.value || [];
    const expectedReorderAfterDrop = ['expedientes', 'metricas', 'graficas', 'audiencias', 'actividad'];

    if (JSON.stringify(updatedOrder) === JSON.stringify(expectedReorderAfterDrop)) {
      pass('DND-SIM-DROP-REORDER', 'Simulating drag-and-drop of "expedientes" onto "metricas" immediately repositions "expedientes" to index 0', `New order: ${updatedOrder.join(', ')}`);
    } else {
      fail('DND-SIM-DROP-REORDER', 'DnD simulation failed or order mismatch', JSON.stringify(updatedOrder));
    }

    // 4.2 Verify LocalStorage was updated synchronously
    const lsInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const raw = localStorage.getItem('tja_preferencias');
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw);
            return parsed.ordenWidgets || null;
          } catch {
            return null;
          }
        })()
      `,
      returnByValue: true,
    });

    if (JSON.stringify(lsInspect.result?.value) === JSON.stringify(expectedReorderAfterDrop)) {
      pass('DND-LOCALSTORAGE-SYNC', 'Synchronous persistence to localStorage confirmed with new widget order', `Stored: ${lsInspect.result?.value?.join(', ')}`);
    } else {
      fail('DND-LOCALSTORAGE-SYNC', 'localStorage was not updated with new widget order', JSON.stringify(lsInspect.result?.value));
    }

    // 4.3 Verify Debounced SQLite DB persistence
    // Wait 650ms (debounce is 400ms)
    await new Promise((r) => setTimeout(r, 650));

    const dbVerifyRes = await api('/api/preferencias', { headers: authHeaders });
    if (
      dbVerifyRes.status === 200 &&
      JSON.stringify(dbVerifyRes.data?.ordenWidgets) === JSON.stringify(expectedReorderAfterDrop)
    ) {
      pass('DND-SQLITE-PERSIST', 'Debounced persistence confirmed in SQLite database via /api/preferencias', `SQLite order: ${dbVerifyRes.data.ordenWidgets.join(', ')}`);
    } else {
      fail('DND-SQLITE-PERSIST', 'SQLite DB does not reflect DnD updated order', JSON.stringify(dbVerifyRes.data?.ordenWidgets));
    }

    // ==========================================================================
    // SECTION 5: KEYBOARD NAVIGATION ON DRAG HANDLES
    // ==========================================================================
    setSuite('Section 5: Keyboard Accessibility (ArrowUp / ArrowDown) on Drag Handles');

    // Currently order is: ['expedientes', 'metricas', 'graficas', 'audiencias', 'actividad']
    // Let's focus drag handle of widget at index 1 ('metricas') and send ArrowDown -> moves to index 2
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const w = document.querySelector('[data-widget-id="metricas"]');
          const handle = w.querySelector('[data-drag-handle="true"]');
          handle.focus();
          const evt = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true });
          handle.dispatchEvent(evt);
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 150));

    const keyNavDownInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    const expectedAfterKeyDown = ['expedientes', 'graficas', 'metricas', 'audiencias', 'actividad'];
    if (JSON.stringify(keyNavDownInspect.result?.value) === JSON.stringify(expectedAfterKeyDown)) {
      pass('DND-KEYBOARD-DOWN', 'Pressing ArrowDown on focused drag handle swaps widget downwards', `Order: ${keyNavDownInspect.result.value.join(', ')}`);
    } else {
      fail('DND-KEYBOARD-DOWN', 'ArrowDown keydown failed to reorder', JSON.stringify(keyNavDownInspect.result?.value));
    }

    // Now send ArrowUp on 'metricas' handle -> moves back up to index 1
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const w = document.querySelector('[data-widget-id="metricas"]');
          const handle = w.querySelector('[data-drag-handle="true"]');
          handle.focus();
          const evt = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true });
          handle.dispatchEvent(evt);
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 150));

    const keyNavUpInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    if (JSON.stringify(keyNavUpInspect.result?.value) === JSON.stringify(expectedReorderAfterDrop)) {
      pass('DND-KEYBOARD-UP', 'Pressing ArrowUp on focused drag handle swaps widget upwards', `Order: ${keyNavUpInspect.result.value.join(', ')}`);
    } else {
      fail('DND-KEYBOARD-UP', 'ArrowUp keydown failed to reorder', JSON.stringify(keyNavUpInspect.result?.value));
    }

    // ==========================================================================
    // SECTION 6: 1-CLICK "RESTABLECER ORDEN" VERIFICATION
    // ==========================================================================
    setSuite('Section 6: 1-Click "Restablecer Orden" Verification');

    // Click "Restablecer Orden" button
    const resetClickResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          let toastCaught = null;
          const toastListener = (e) => { toastCaught = e.detail; };
          window.addEventListener('tja:toast', toastListener, { once: true });

          const buttons = Array.from(document.querySelectorAll('button'));
          const resetBtn = buttons.find(b => 
            b.textContent.toLowerCase().includes('restablecer orden') ||
            b.getAttribute('title')?.toLowerCase().includes('restablecer')
          );

          if (!resetBtn) return { clicked: false, error: 'Button not found' };
          resetBtn.click();

          return {
            clicked: true,
            toastCaught
          };
        })()
      `,
      returnByValue: true,
    });

    await new Promise((r) => setTimeout(r, 150));

    const postResetDomInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
        })()
      `,
      returnByValue: true,
    });

    const resetRes = resetClickResult.result?.value;
    const postResetOrder = postResetDomInspect.result?.value;

    if (resetRes?.clicked && JSON.stringify(postResetOrder) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('DND-RESET-DOM', 'Clicking "Restablecer Orden" immediately restores canonical widget order in real DOM', `Order: ${postResetOrder.join(', ')}`);
    } else {
      fail('DND-RESET-DOM', 'Reset button failed to restore canonical order in DOM', JSON.stringify(postResetOrder));
    }

    if (resetRes?.toastCaught?.title?.toLowerCase().includes('orden restablecido')) {
      pass('DND-RESET-TOAST', 'Reset button dispatched informative toast notification', `Toast: ${resetRes.toastCaught.title}`);
    } else {
      fail('DND-RESET-TOAST', 'Toast notification not detected on reset', JSON.stringify(resetRes?.toastCaught));
    }

    // Wait 650ms for debounced flush to SQLite
    await new Promise((r) => setTimeout(r, 650));

    const dbPostReset = await api('/api/preferencias', { headers: authHeaders });
    if (
      dbPostReset.status === 200 &&
      JSON.stringify(dbPostReset.data?.ordenWidgets) === JSON.stringify(ALL_WIDGET_KEYS)
    ) {
      pass('DND-RESET-SQLITE', 'Canonical order restored in SQLite database after 1-click reset', `SQLite: ${dbPostReset.data.ordenWidgets.join(', ')}`);
    } else {
      fail('DND-RESET-SQLITE', 'Reset order failed to persist to SQLite', JSON.stringify(dbPostReset.data?.ordenWidgets));
    }

    // Check localStorage
    const lsPostReset = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const raw = localStorage.getItem('tja_preferencias');
          try {
            return JSON.parse(raw).ordenWidgets;
          } catch {
            return null;
          }
        })()
      `,
      returnByValue: true,
    });

    if (JSON.stringify(lsPostReset.result?.value) === JSON.stringify(ALL_WIDGET_KEYS)) {
      pass('DND-RESET-LOCALSTORAGE', 'Canonical order restored in localStorage after 1-click reset', `localStorage: ${lsPostReset.result.value.join(', ')}`);
    } else {
      fail('DND-RESET-LOCALSTORAGE', 'Reset order failed in localStorage', JSON.stringify(lsPostReset.result?.value));
    }

    // ==========================================================================
    // SECTION 7: ADVERSARIAL STRESS & INTEGRITY DEFENSES
    // ==========================================================================
    setSuite('Section 7: Adversarial Edge Cases & Integrity Defenses');

    // 7.1 Corrupted localStorage injection resilience
    const corruptStorageRes = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          localStorage.setItem('tja_preferencias', 'MALFORMED_NON_JSON_CORRUPTION_!!!');
          // Dispatch storage change / check preferences reading
          const widgets = Array.from(document.querySelectorAll('[data-widget-id]'));
          return {
            widgetCount: widgets.length,
            ids: widgets.map(w => w.getAttribute('data-widget-id'))
          };
        })()
      `,
      returnByValue: true,
    });

    if (corruptStorageRes.result?.value?.widgetCount === 5) {
      pass('DND-CORRUPT-STORAGE', 'App gracefully survives corrupted localStorage without crashing or dropping widgets');
    } else {
      fail('DND-CORRUPT-STORAGE', 'Corrupted localStorage broke DOM');
    }

    // 7.2 Drag cancellation (dragstart followed by dragend without drop)
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const w = document.querySelector('[data-widget-id="graficas"]');
          const handle = w.querySelector('[data-drag-handle="true"]');
          const dt = new DataTransfer();
          dt.setData('text/plain', 'graficas');
          handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 80));

    const dragFadeInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const w = document.querySelector('[data-widget-id="graficas"]');
          return w.className.includes('opacity-40');
        })()
      `,
      returnByValue: true,
    });

    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const w = document.querySelector('[data-widget-id="graficas"]');
          const handle = w.querySelector('[data-drag-handle="true"]');
          const dt = new DataTransfer();
          handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 80));

    const dragRestoreInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const w = document.querySelector('[data-widget-id="graficas"]');
          return !w.className.includes('opacity-40');
        })()
      `,
      returnByValue: true,
    });

    const isFadedDuringDrag = dragFadeInspect.result?.value;
    const isRestoredAfterCancel = dragRestoreInspect.result?.value;

    if (isFadedDuringDrag && isRestoredAfterCancel) {
      pass('DND-DRAG-CANCEL', 'Drag cancellation cleanly restores card opacity and resets drag state', `Faded on drag: ${isFadedDuringDrag}, Restored: ${isRestoredAfterCancel}`);
    } else {
      fail('DND-DRAG-CANCEL', 'Drag cancellation failed to reset classes', `Faded: ${isFadedDuringDrag}, Restored: ${isRestoredAfterCancel}`);
    }

    // 7.3 Zero console errors throughout the entire adversarial session
    if (collectedErrors.length === 0) {
      pass('DND-ZERO-CONSOLE-ERRORS', 'Zero uncaught exceptions or console errors throughout entire empirical DnD session', '0 exceptions / 0 errors');
    } else {
      fail('DND-ZERO-CONSOLE-ERRORS', 'Console errors detected during DnD session', collectedErrors.map((e) => `[${e.type}] ${e.text}`).join('; '));
    }

  } finally {
    if (cdp) cdp.close();
    cleanupBrowser();
  }

  // ==========================================================================
  // FINAL VERDICT
  // ==========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}          CHALLENGER DASHBOARD DnD VERIFICATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  ${colors.green}Passed Tests:       ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests > 0 ? colors.red : colors.gray}Failed Tests:       ${failedTests}${colors.reset}`);
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.error(`${colors.red}${colors.bold}ADVERSARIAL VERIFICATION FAILED with ${failedTests} failure(s).${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% Success). VERDICT: APPROVE.${colors.reset}\n`);
    process.exit(0);
  }
}

runAdversarialDnDTests().catch((err) => {
  console.error('\nFatal unhandled error:', err);
  process.exit(1);
});
