/**
 * tests/test-reviewer2-m3-adversarial.mjs
 * Adversarial validation script written by Reviewer 2 (reviewer_m3_2_o9)
 * Stress-tests Dashboard direct drag-drop manipulation, keyboard accessibility,
 * event notifications, and backend persistence.
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
const CDP_PORT = 9338;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ${colors.green}✓ PASS:${colors.reset} ${label} ${detail ? `(${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  ${colors.red}✗ FAIL:${colors.reset} ${label} ${detail ? `(${detail})` : ''}`);
  }
}

async function api(pathname, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${pathname}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function findChrome() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log(`\n${colors.cyan}${colors.bold}=== Reviewer 2 Adversarial Stress Suite for Dashboard Widgets DnD ===${colors.reset}\n`);

  // 1. Authenticate admin
  const loginRes = await api('/api/auth/login', {
    method: 'POST',
    body: { correo: 'admin@tjabcs.gob.mx', password: 'password123' },
  });
  check('Admin authentication', loginRes.ok && loginRes.data.token);
  const token = loginRes.data.token;

  // 2. Reset backend preferences
  const resetRes = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: { ordenWidgets: ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'] },
  });
  check('Reset initial preferences in SQLite', resetRes.ok);

  // 3. Launch browser
  const chromePath = findChrome();
  check('Browser executable found', !!chromePath, chromePath);

  const tmpDir = path.join(os.tmpdir(), `r2-cdp-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    `--user-data-dir=${tmpDir}`,
  ], { stdio: 'ignore' });

  try {
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (v.ok) { ready = true; break; }
      } catch {}
    }
    check('CDP connection ready', ready);

    const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}/`, { method: 'PUT' });
    const tabInfo = await newTab.json();
    const cdp = new Cdp(tabInfo.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const domain = new URL(FRONTEND_URL).hostname;
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: token,
      domain,
      path: '/',
    });

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise((r) => setTimeout(r, 1200));

    // CHECK 1: Presence of all 5 GripVertical drag handles with data-drag-handle="true"
    const handleInfo = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const handles = Array.from(document.querySelectorAll('[data-drag-handle="true"]'));
          const icons = handles.map(h => {
            const svg = h.querySelector('svg');
            return {
              isDraggable: h.getAttribute('draggable') === 'true',
              tabIndex: h.getAttribute('tabindex'),
              role: h.getAttribute('role'),
              hasSvg: !!svg,
              ariaLabel: h.getAttribute('aria-label') || ''
            };
          });
          return { count: handles.length, icons };
        })()
      `,
      returnByValue: true,
    });
    const handles = handleInfo.result.value;
    check('Found 5 direct manipulation drag handles', handles.count === 5);
    check('All handles have draggable="true", tabIndex="0", role="button"',
      handles.icons.every(i => i.isDraggable && i.tabIndex === '0' && i.role === 'button'));
    check('All handles contain SVG Grip icon and accessible label',
      handles.icons.every(i => i.hasSvg && i.ariaLabel.includes('Arrastrar')));

    // CHECK 2: Keyboard accessibility (ArrowDown on first handle)
    const keyboardTest1 = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const handle = document.querySelector('[data-widget-id="metricas"] [data-drag-handle="true"]');
          handle.focus();
          const evt = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
          handle.dispatchEvent(evt);
          await new Promise(r => setTimeout(r, 100));
          const currentOrder = Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
          return currentOrder;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    check('Keyboard ArrowDown on handle moves widget down',
      keyboardTest1.result.value[0] === 'graficas' && keyboardTest1.result.value[1] === 'metricas',
      `New order: ${keyboardTest1.result.value.join(', ')}`);

    // CHECK 3: Keyboard accessibility (ArrowUp moves it back)
    const keyboardTest2 = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const handle = document.querySelector('[data-widget-id="metricas"] [data-drag-handle="true"]');
          handle.focus();
          const evt = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
          handle.dispatchEvent(evt);
          await new Promise(r => setTimeout(r, 100));
          const currentOrder = Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
          return currentOrder;
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    check('Keyboard ArrowUp on handle moves widget back up',
      keyboardTest2.result.value[0] === 'metricas',
      `Restored order: ${keyboardTest2.result.value.join(', ')}`);

    // CHECK 4: Direct HTML5 Drag and Drop event simulation from position 4 to position 0
    const dndTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const toasts = [];
          const orderEvents = [];
          window.addEventListener('tja:toast', (e) => toasts.push(e.detail));
          window.addEventListener('tja:widget-order-changed', (e) => orderEvents.push(e.detail));

          const sourceCard = document.querySelector('[data-widget-id="expedientes"]');
          const targetCard = document.querySelector('[data-widget-id="metricas"]');
          const sourceHandle = sourceCard.querySelector('[data-drag-handle="true"]');

          // Simulate drag start
          const dt = new DataTransfer();
          const dragStartEvt = new DragEvent('dragstart', {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true
          });
          sourceHandle.dispatchEvent(dragStartEvt);

          // Simulate dragover and drop on target card
          const dragOverEvt = new DragEvent('dragover', {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true
          });
          targetCard.dispatchEvent(dragOverEvt);

          const dropEvt = new DragEvent('drop', {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true
          });
          targetCard.dispatchEvent(dropEvt);

          const dragEndEvt = new DragEvent('dragend', {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true
          });
          sourceHandle.dispatchEvent(dragEndEvt);

          await new Promise(r => setTimeout(r, 100));

          const newOrder = Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
          return { newOrder, toasts, orderEvents };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    const dndResult = dndTest.result.value;
    check('Drag-and-drop moved "expedientes" to index 0',
      dndResult.newOrder[0] === 'expedientes',
      `Resulting order: ${dndResult.newOrder.join(', ')}`);
    check('tja:toast event dispatched with correct title and type',
      dndResult.toasts.length > 0 && dndResult.toasts[0].type === 'info' && dndResult.toasts[0].title === 'Panel Actualizado',
      `Toast: ${JSON.stringify(dndResult.toasts[0])}`);
    check('tja:widget-order-changed custom event dispatched with updated array',
      dndResult.orderEvents.length > 0 && dndResult.orderEvents[0][0] === 'expedientes');

    // CHECK 5: Restablecer Orden button click
    const resetTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const toasts = [];
          window.addEventListener('tja:toast', (e) => toasts.push(e.detail));

          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Restablecer Orden'));
          btn.click();

          await new Promise(r => setTimeout(r, 100));
          const restoredOrder = Array.from(document.querySelectorAll('[data-widget-id]')).map(el => el.getAttribute('data-widget-id'));
          return { restoredOrder, toasts };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    const resetResult = resetTest.result.value;
    const defaultCanonical = ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'];
    check('1-click "Restablecer Orden" restores canonical order',
      JSON.stringify(resetResult.restoredOrder) === JSON.stringify(defaultCanonical),
      `Order: ${resetResult.restoredOrder.join(', ')}`);
    check('"Restablecer Orden" dispatches confirmation toast',
      resetResult.toasts.some(t => t.title === 'Orden Restablecido'),
      `Toast: ${JSON.stringify(resetResult.toasts)}`);

    // CHECK 6: Persistence to SQLite backend verified
    await new Promise(r => setTimeout(r, 600)); // wait for debounce
    const verifyBackend = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${token}` }
    });
    check('SQLite backend successfully persisted reset order',
      verifyBackend.ok && JSON.stringify(verifyBackend.data.ordenWidgets) === JSON.stringify(defaultCanonical),
      `DB Value: ${JSON.stringify(verifyBackend.data?.ordenWidgets)}`);

    cdp.close();
  } finally {
    proc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==============================================================================`);
  console.log(`Reviewer 2 Adversarial Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==============================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
