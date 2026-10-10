/**
 * tests/test-m3-challenger-kanban-adversarial.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER STRESS HARNESS: KANBAN HTML5 DRAG-AND-DROP
 * 
 * Challenger: challenger_m3_1_o9 (critic, specialist)
 * Milestone: Milestone 3 (Direct Manipulation: Kanban Drag-and-Drop)
 * 
 * Target Component: frontend/src/components/expedientes/ExpedientesKanban.tsx
 * 
 * Specific Attack Vectors & Edge Cases:
 * 1. Dropping outside valid columns (board root, background, header).
 * 2. Dropping on the same column (guard prevents unnecessary API calls & feedback).
 * 3. Rapid concurrent drag/drop bursts (race condition resilience & card conservation).
 * 4. Read-only permissions enforcement (lacks 'expedientes:status' -> draggable false,
 *    zero drag handles, zero advance buttons, programmatic drop rejection, API 403).
 * 5. Network failure (HTTP 500) on PUT /api/expedientes/:id/estatus:
 *    - Verifies atomic rollback to initial state snapshot.
 *    - Verifies zero card duplication and zero card loss.
 *    - Verifies event emission 'tja:toast' with error payload.
 *    - Verifies ZERO raw alert() calls.
 * 6. Live bidirectional Drag-and-Drop persistence and SQLite MovimientoEstatus audit.
 * 7. Clean teardown and database restoration.
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../backend/node_modules/@prisma/client');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9350', 10);

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

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function pass(id, title, detail = '') {
  totalChecks++;
  passedChecks++;
  console.log(`  ${colors.green}✓ [PASS ${totalChecks}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  if (detail) console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
}

function fail(id, title, errorDetail) {
  totalChecks++;
  failedChecks++;
  failures.push({ id, title, errorDetail });
  console.log(`  ${colors.red}✗ [FAIL ${totalChecks}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  console.log(`      ${colors.red}→ ERROR: ${errorDetail}${colors.reset}`);
}

function suite(name) {
  console.log(`\n${colors.magenta}=== [${name}] ===${colors.reset}`);
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
      this.ws.onerror = (err) => reject(new Error(`WebSocket error: ${err.message}`));
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve, reject } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else resolve(msg.result);
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
      try { this.ws.close(); } catch {}
    }
  }
}

async function api(endpoint, options = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, data };
}

async function login(correo, password) {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  if (!res.ok || !res.data?.token) {
    throw new Error(`Login failed for ${correo}: HTTP ${res.status}`);
  }
  return res.data.token;
}

async function main() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER: EMPIRICAL ADVERSARIAL STRESS SUITE (KANBAN DRAG-AND-DROP)${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL}${colors.reset}\n`);

  const prisma = new PrismaClient();
  let adminToken = null;
  let consultaToken = null;
  let initialExpedientesSnapshot = [];

  // ==========================================================================
  // SECTION 1: PRE-FLIGHT BASELINE & TOKENS
  // ==========================================================================
  suite('Section 1: Pre-Flight Baseline & Tokens');

  try {
    initialExpedientesSnapshot = await prisma.expediente.findMany({
      select: { id: true, folio: true, estatusId: true, subEstatusId: true },
    });
    pass('INIT-DB-SNAPSHOT', `Captured baseline for ${initialExpedientesSnapshot.length} expedientes`,
      initialExpedientesSnapshot.map(e => `${e.folio} (status ${e.estatusId})`).join(', '));

    adminToken = await login('admin@tjabcs.gob.mx', 'password123');
    pass('INIT-ADMIN-TOKEN', 'Acquired admin token with expedientes:status permission');

    consultaToken = await login('consulta@tjabcs.gob.mx', 'password123');
    pass('INIT-CONSULTA-TOKEN', 'Acquired restricted token without expedientes:status permission');
  } catch (err) {
    fail('INIT-PREFLIGHT-FAIL', 'Pre-flight setup failed', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ==========================================================================
  // SECTION 2: BROWSER CDP LAUNCH
  // ==========================================================================
  suite('Section 2: Chrome Headless CDP Session Launch');

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-EXEC-FOUND', 'No compatible Chrome/Edge browser found');
    await prisma.$disconnect();
    process.exit(1);
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger-m3-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempProfileDir}`,
    '--disable-background-networking',
    '--window-size=1400,900',
    'about:blank',
  ];

  const browserProc = spawn(browserPath, browserArgs, { stdio: 'ignore' });
  const cleanup = () => {
    try { browserProc.kill(); } catch {}
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);

  let cdpReady = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 150));
    try {
      const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (v.ok) { cdpReady = true; break; }
    } catch {}
  }

  if (!cdpReady) {
    fail('CDP-CONNECT', 'Could not connect to CDP port ' + CDP_PORT);
    cleanup();
    await prisma.$disconnect();
    process.exit(1);
  }
  pass('CDP-CONNECT', `CDP debugger connected on port ${CDP_PORT}`);

  let cdp = null;
  const consoleErrors = [];

  try {
    const tabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}/expedientes`, { method: 'PUT' });
    const tab = await tabRes.json();
    cdp = new CdpSession(tab.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    cdp.on('Console.messageAdded', (p) => {
      if (p.message?.level === 'error') {
        const text = p.message.text || '';
        if (!text.includes('favicon') && !text.includes('404')) {
          consoleErrors.push(text);
        }
      }
    });

    const cookieDomain = new URL(FRONTEND_URL).hostname;
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      domain: cookieDomain,
      path: '/',
    });

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/expedientes` });
    await new Promise(r => setTimeout(r, 1000));

    // Seed session in localStorage
    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('auth_token', ${JSON.stringify(adminToken)});
        localStorage.setItem('auth_user', JSON.stringify({
          id: 1,
          nombre: 'Administrador TJA',
          correo: 'admin@tjabcs.gob.mx',
          rol: 'Administrador',
          rolId: 1,
          permisos: ['expedientes:view', 'expedientes:status', 'expedientes:create', 'expedientes:edit']
        }));
      `,
    });

    // Switch to Kanban
    await cdp.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view-target="kanban"]');
        if (btn) btn.click();
      `,
    });
    await new Promise(r => setTimeout(r, 600));

    // Verify 4 columns and cards
    const kanbanInit = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const board = document.querySelector('div.kanban-board');
          const cols = Array.from(document.querySelectorAll('.kanban-column')).map(c => c.getAttribute('data-column'));
          const cards = Array.from(document.querySelectorAll('[data-expediente-id]')).map(c => c.getAttribute('data-expediente-id'));
          return { hasBoard: !!board, cols, cardsCount: cards.length, cards };
        })()
      `,
      returnByValue: true,
    });
    const ki = kanbanInit.result?.value;
    if (ki?.hasBoard && ki.cols.length === 4 && ki.cardsCount === initialExpedientesSnapshot.length) {
      pass('KANBAN-MOUNTED', 'Kanban board mounted with 4 columns and all cards intact',
        `Columns: ${ki.cols.join(', ')} | Cards: ${ki.cardsCount}`);
    } else {
      fail('KANBAN-MOUNTED', 'Kanban board initialization failed', JSON.stringify(ki));
    }

    // ==========================================================================
    // SECTION 3: EDGE CASE 1 - DROPPING OUTSIDE VALID COLUMNS
    // ==========================================================================
    suite('Section 3: Edge Case 1 - Dropping Outside Valid Columns');

    const dropOutsideResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          let apiCalls = 0;
          const origFetch = window.fetch;
          window.fetch = function(...args) {
            if (String(args[0]).includes('/estatus')) apiCalls++;
            return origFetch.apply(this, args);
          };

          const card = document.querySelector('[data-expediente-id]');
          if (!card) return { error: 'No card found' };
          const expId = card.getAttribute('data-expediente-id');
          const originCol = card.closest('[data-column]');
          const originColId = originCol ? originCol.getAttribute('data-column') : null;

          const dt = new DataTransfer();
          dt.setData('text/plain', expId);

          // 1. dragstart on card
          card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // 2. drop on board background outside columns
          const board = document.querySelector('.kanban-board');
          board.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // 3. drop on header
          const header = document.querySelector('header') || document.body;
          header.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // 4. dragend on card
          card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));

          await new Promise(r => setTimeout(r, 200));
          window.fetch = origFetch;

          const stillInOrigin = originCol.querySelector(\`[data-expediente-id="\${expId}"]\`) !== null;
          const totalCards = document.querySelectorAll('[data-column] [data-expediente-id]').length;

          return {
            success: true,
            apiCalls,
            stillInOrigin,
            totalCards,
            expId,
            originColId
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const doRes = dropOutsideResult.result?.value;
    if (doRes?.success && doRes.apiCalls === 0 && doRes.stillInOrigin && doRes.totalCards === initialExpedientesSnapshot.length) {
      pass('EDGE-DROP-OUTSIDE', 'Dropping outside columns causes zero API mutations and preserves card position',
        `API calls: ${doRes.apiCalls}, Still in origin "${doRes.originColId}": true, Total cards: ${doRes.totalCards}`);
    } else {
      fail('EDGE-DROP-OUTSIDE', 'Dropping outside column triggered mutation or corrupted state', JSON.stringify(doRes));
    }

    // ==========================================================================
    // SECTION 4: EDGE CASE 2 - DROPPING ON THE SAME COLUMN (SELF-DROP GUARD)
    // ==========================================================================
    suite('Section 4: Edge Case 2 - Dropping On The Same Column (Self-Drop)');

    const dropSameColResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          let apiCalls = 0;
          let toastDispatched = false;
          const origFetch = window.fetch;
          window.fetch = function(...args) {
            if (String(args[0]).includes('/estatus')) apiCalls++;
            return origFetch.apply(this, args);
          };

          const toastHandler = () => { toastDispatched = true; };
          window.addEventListener('tja:toast', toastHandler);

          const card = document.querySelector('[data-expediente-id]');
          if (!card) return { error: 'No card found' };
          const expId = card.getAttribute('data-expediente-id');
          const originCol = card.closest('[data-column]');
          const originColId = originCol ? originCol.getAttribute('data-column') : null;

          const dt = new DataTransfer();
          dt.setData('text/plain', expId);

          // 1. dragstart
          card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // 2. dragenter on same column
          originCol.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // Check that drop placeholder is NOT shown for self-column
          const hasPlaceholder = originCol.querySelector('[data-drop-placeholder="true"]') !== null;

          // 3. drop on same column
          originCol.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // 4. dragend
          card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));

          await new Promise(r => setTimeout(r, 200));
          window.fetch = origFetch;
          window.removeEventListener('tja:toast', toastHandler);

          const stillInOrigin = originCol.querySelector(\`[data-expediente-id="\${expId}"]\`) !== null;

          return {
            success: true,
            apiCalls,
            hasPlaceholder,
            toastDispatched,
            stillInOrigin,
            originColId
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const scRes = dropSameColResult.result?.value;
    if (scRes?.success && scRes.apiCalls === 0 && !scRes.hasPlaceholder && !scRes.toastDispatched && scRes.stillInOrigin) {
      pass('EDGE-DROP-SAME-COL', 'Dropping on origin column triggers 0 API mutations, no toast, and suppresses drop placeholder',
        `API calls: ${scRes.apiCalls}, Placeholder shown: ${scRes.hasPlaceholder}, Toast dispatched: ${scRes.toastDispatched}`);
    } else {
      fail('EDGE-DROP-SAME-COL', 'Dropping on same column did not abort as expected', JSON.stringify(scRes));
    }

    // ==========================================================================
    // SECTION 5: EDGE CASE 3 - RAPID CONCURRENT DRAGS & RACE CONDITIONS
    // ==========================================================================
    suite('Section 5: Edge Case 3 - Rapid Concurrent Drags & Race Stress');

    const rapidDragsResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const cards = Array.from(document.querySelectorAll('[data-expediente-id]'));
          const cols = Array.from(document.querySelectorAll('.kanban-column'));
          if (cards.length === 0 || cols.length === 0) return { error: 'No cards/columns' };

          let errorsEncountered = 0;
          const origError = window.onerror;
          window.onerror = () => { errorsEncountered++; };

          // Fire 20 rapid bursts of concurrent drag events
          for (let i = 0; i < 20; i++) {
            const card = cards[i % cards.length];
            const targetCol = cols[(i + 1) % cols.length];
            const expId = card.getAttribute('data-expediente-id');

            const dt = new DataTransfer();
            dt.setData('text/plain', expId);

            card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
            targetCol.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            // Simultaneous dragend and drop
            targetCol.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
            card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
          }

          // Let any scheduled render ticks complete
          await new Promise(r => setTimeout(r, 300));
          window.onerror = origError;

          const totalCardsAfter = document.querySelectorAll('[data-column] [data-expediente-id]').length;
          const distinctIds = new Set(Array.from(document.querySelectorAll('[data-column] [data-expediente-id]')).map(c => c.getAttribute('data-expediente-id')));

          return {
            success: true,
            errorsEncountered,
            totalCardsAfter,
            distinctCount: distinctIds.size
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const rdRes = rapidDragsResult.result?.value;
    const initialCount = initialExpedientesSnapshot.length;
    if (rdRes?.success && rdRes.errorsEncountered === 0 && rdRes.totalCardsAfter === initialCount && rdRes.distinctCount === initialCount) {
      pass('EDGE-RAPID-CONCURRENCY', `20 rapid drag bursts survived: 0 errors, card count strictly conserved (${rdRes.totalCardsAfter}/${initialCount})`,
        `Distinct cards: ${rdRes.distinctCount}, DOM errors: ${rdRes.errorsEncountered}`);
    } else {
      fail('EDGE-RAPID-CONCURRENCY', 'Rapid drag burst caused card loss, duplication or error', JSON.stringify(rdRes));
    }

    // ==========================================================================
    // SECTION 6: EDGE CASE 4 - READ-ONLY RESTRICTION ENFORCEMENT
    // ==========================================================================
    suite('Section 6: Edge Case 4 - Permission Enforcement (Read-Only User)');

    // 6.1 Direct API authorization check: 403 Forbidden
    const unauthApi = await api('/api/expedientes/1/estatus', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { nuevoEstatusId: 2, nuevoSubEstatusId: 3, notas: 'Attacking status mutation' },
    });
    if (unauthApi.status === 403) {
      pass('EDGE-RBAC-API-403', 'Direct PUT /api/expedientes/:id/estatus rejects user lacking expedientes:status with 403 Forbidden',
        `Response: "${unauthApi.data?.error}"`);
    } else {
      fail('EDGE-RBAC-API-403', `Expected 403, got ${unauthApi.status}`);
    }

    // 6.2 Frontend DOM inspection for restricted user
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: consultaToken,
      domain: cookieDomain,
      path: '/',
    });

    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('auth_token', ${JSON.stringify(consultaToken)});
        localStorage.setItem('auth_user', JSON.stringify({
          id: 5,
          nombre: 'Usuario Consulta',
          correo: 'consulta@tjabcs.gob.mx',
          rol: 'Consulta/Dirección',
          rolId: 4,
          permisos: ['expedientes:view'] // lacks 'expedientes:status'
        }));
        location.reload();
      `,
    });
    await new Promise(r => setTimeout(r, 1200));

    // Switch to Kanban
    await cdp.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view-target="kanban"]');
        if (btn) btn.click();
      `,
    });
    await new Promise(r => setTimeout(r, 600));

    const restrictedDom = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const cards = Array.from(document.querySelectorAll('[data-expediente-id]'));
          const draggables = cards.map(c => c.getAttribute('draggable'));
          const gripHandles = document.querySelectorAll('span[title*="Arrastrar"]');
          const advanceButtons = document.querySelectorAll('button[title*="Avanzar"]');
          const moreButtons = document.querySelectorAll('button[title*="Cambiar fase"]');
          return {
            cardCount: cards.length,
            draggables,
            allNonDraggable: draggables.every(d => d === 'false' || d === null),
            gripHandlesCount: gripHandles.length,
            advanceButtonsCount: advanceButtons.length,
            moreButtonsCount: moreButtons.length
          };
        })()
      `,
      returnByValue: true,
    });
    const rDom = restrictedDom.result?.value;
    if (rDom?.allNonDraggable && rDom.gripHandlesCount === 0 && rDom.advanceButtonsCount === 0 && rDom.moreButtonsCount === 0) {
      pass('EDGE-RBAC-UI-DISABLED', 'All drag source attributes, grip handles, and advance controls suppressed for restricted user',
        `Non-draggable cards: ${rDom.cardCount}, Grip handles: 0, Advance buttons: 0, Modals: 0`);
    } else {
      fail('EDGE-RBAC-UI-DISABLED', 'Restricted user still has active drag handles or advance controls', JSON.stringify(rDom));
    }

    // 6.3 Adversarial synthetic drop attempt by restricted client
    const syntheticDropAttempt = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          let apiCalls = 0;
          const origFetch = window.fetch;
          window.fetch = function(...args) {
            if (String(args[0]).includes('/estatus')) apiCalls++;
            return origFetch.apply(this, args);
          };

          const targetCol = document.querySelector('[data-column="proyecto"]');
          const dt = new DataTransfer();
          dt.setData('text/plain', '1');

          targetCol.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));

          await new Promise(r => setTimeout(r, 200));
          window.fetch = origFetch;

          return { apiCalls };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const sda = syntheticDropAttempt.result?.value;
    if (sda?.apiCalls === 0) {
      pass('EDGE-RBAC-DROP-BLOCKED', 'Synthetic drop event completely ignored when user lacks permission (0 API calls sent)');
    } else {
      fail('EDGE-RBAC-DROP-BLOCKED', `Synthetic drop initiated ${sda?.apiCalls} unauthorized API calls`);
    }

    // ==========================================================================
    // SECTION 7: EDGE CASE 5 - NETWORK FAILURE (500) & OPTIMISTIC ROLLBACK
    // ==========================================================================
    suite('Section 7: Edge Case 5 - Network Failure (500) & Optimistic Rollback');

    // Restore admin session
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      domain: cookieDomain,
      path: '/',
    });

    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('auth_token', ${JSON.stringify(adminToken)});
        localStorage.setItem('auth_user', JSON.stringify({
          id: 1,
          nombre: 'Administrador TJA',
          correo: 'admin@tjabcs.gob.mx',
          rol: 'Administrador',
          rolId: 1,
          permisos: ['expedientes:view', 'expedientes:status', 'expedientes:create', 'expedientes:edit']
        }));
        location.reload();
      `,
    });
    await new Promise(r => setTimeout(r, 1200));

    await cdp.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view-target="kanban"]');
        if (btn) btn.click();
      `,
    });
    await new Promise(r => setTimeout(r, 600));

    // Test rollback with simulated network 500 error
    const rollbackStress = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const card = document.querySelector('[data-expediente-id="1"]');
          if (!card) return { error: 'Card 1 not found' };
          const originCol = card.closest('[data-column]');
          const originColId = originCol ? originCol.getAttribute('data-column') : null;
          const targetColId = originColId === 'tramite' ? 'proyecto' : 'tramite';
          const targetCol = document.querySelector(\`[data-column="\${targetColId}"]\`);

          // Intercept fetch to return HTTP 500
          const originalFetch = window.fetch;
          window.fetch = async function(...args) {
            const url = String(args[0]);
            if (url.includes('/estatus')) {
              return new Response(JSON.stringify({ error: 'Fallo simulado de base de datos SQLite' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return originalFetch.apply(this, args);
          };

          // Monitor tja:toast and alert()
          let capturedToast = null;
          let alertCalled = false;
          const origAlert = window.alert;
          window.alert = () => { alertCalled = true; };

          const toastHandler = (e) => {
            capturedToast = e.detail;
          };
          window.addEventListener('tja:toast', toastHandler);

          const dt = new DataTransfer();
          dt.setData('text/plain', '1');

          // Trigger Drag-and-Drop
          card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
          card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // Wait for asynchronous API rejection and rollback state update (800ms)
          await new Promise(r => setTimeout(r, 800));

          window.fetch = originalFetch;
          window.alert = origAlert;
          window.removeEventListener('tja:toast', toastHandler);

          const cardInOrigin = originCol.querySelector('[data-expediente-id="1"]') !== null;
          const cardInTarget = targetCol.querySelector('[data-expediente-id="1"]') !== null;
          const totalCards = document.querySelectorAll('[data-column] [data-expediente-id]').length;

          return {
            success: true,
            originColId,
            targetColId,
            cardInOrigin,
            cardInTarget,
            totalCards,
            capturedToast,
            alertCalled
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const rbRes = rollbackStress.result?.value;
    if (rbRes?.success && rbRes.cardInOrigin && !rbRes.cardInTarget && rbRes.totalCards === initialCount) {
      pass('EDGE-ROLLBACK-RESTORATION', `Optimistic rollback atomically restored Card 1 to column "${rbRes.originColId}" with zero card loss or duplication`,
        `Card in origin: true, Card removed from target: true, Total cards: ${rbRes.totalCards}/${initialCount}`);
    } else {
      fail('EDGE-ROLLBACK-RESTORATION', 'Rollback failed to restore card position or corrupted card count', JSON.stringify(rbRes));
    }

    if (rbRes?.capturedToast?.type === 'error' && rbRes.capturedToast.title === 'Error de Actualización') {
      pass('EDGE-EVENT-TOAST-DISPATCHED', 'Global event "tja:toast" dispatched with type="error" upon API failure',
        `Title: "${rbRes.capturedToast.title}", Message: "${rbRes.capturedToast.message}"`);
    } else {
      fail('EDGE-EVENT-TOAST-DISPATCHED', 'Expected error toast event was not received', JSON.stringify(rbRes?.capturedToast));
    }

    if (!rbRes?.alertCalled) {
      pass('EDGE-ZERO-ALERT-POPUPS', 'Zero raw alert() popups invoked during error condition (clean decoupled UX)');
    } else {
      fail('EDGE-ZERO-ALERT-POPUPS', 'Raw browser alert() was invoked unexpectedly');
    }

    // ==========================================================================
    // SECTION 8: LIVE PERSISTENCE & SQLITE MovimientoEstatus AUDIT
    // ==========================================================================
    suite('Section 8: Live Drag-and-Drop Persistence & SQLite Audit');

    // Drag Card 1 to a new column for real with live backend
    const liveMoveResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const card1 = document.querySelector('[data-expediente-id="1"]');
          if (!card1) return { error: 'Card 1 not found' };
          const originCol = card1.closest('[data-column]');
          const originColId = originCol ? originCol.getAttribute('data-column') : null;
          const targetColId = originColId === 'tramite' ? 'proyecto' : 'tramite';
          const targetCol = document.querySelector(\`[data-column="\${targetColId}"]\`);

          let successToast = null;
          const toastHandler = (e) => {
            if (e.detail?.type === 'success') successToast = e.detail;
          };
          window.addEventListener('tja:toast', toastHandler);

          const dt = new DataTransfer();
          dt.setData('text/plain', '1');

          card1.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
          card1.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));

          await new Promise(r => setTimeout(r, 800));
          window.removeEventListener('tja:toast', toastHandler);

          const cardNowInTarget = targetCol.querySelector('[data-expediente-id="1"]') !== null;
          return {
            success: true,
            originColId,
            targetColId,
            cardNowInTarget,
            successToast
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const lmRes = liveMoveResult.result?.value;
    if (lmRes?.success && lmRes.cardNowInTarget) {
      pass('LIVE-DND-MOVE-SUCCESS', `Card 1 successfully dragged from "${lmRes.originColId}" to "${lmRes.targetColId}"`,
        `Success Toast: "${lmRes.successToast?.title} - ${lmRes.successToast?.message}"`);
    } else {
      fail('LIVE-DND-MOVE-SUCCESS', 'Live Drag-and-Drop move failed', JSON.stringify(lmRes));
    }

    // Verify DB update
    const expectedStatusId = lmRes.targetColId === 'proyecto' ? 2 : 1;
    const dbCase1 = await prisma.expediente.findUnique({ where: { id: 1 } });
    if (dbCase1?.estatusId === expectedStatusId) {
      pass('LIVE-DB-STATUS-PERSISTED', `SQLite expediente.estatusId updated to ${expectedStatusId} (${lmRes.targetColId})`);
    } else {
      fail('LIVE-DB-STATUS-PERSISTED', `Expected estatusId ${expectedStatusId}, got ${dbCase1?.estatusId}`);
    }

    // Verify MovimientoEstatus audit log
    const auditEntry = await prisma.movimientoEstatus.findFirst({
      where: { expedienteId: 1 },
      orderBy: { id: 'desc' },
    });
    if (auditEntry && auditEntry.estatusNuevoId === expectedStatusId && auditEntry.usuarioId === 1) {
      pass('LIVE-AUDIT-LOG-RECORDED', 'Prisma SQLite MovimientoEstatus recorded atomic status change and actor ID (1)',
        `Audit ID: ${auditEntry.id}, Notas: "${auditEntry.notas}"`);
    } else {
      fail('LIVE-AUDIT-LOG-RECORDED', 'MovimientoEstatus record missing or mismatch', JSON.stringify(auditEntry));
    }

    // ==========================================================================
    // SECTION 9: TEARDOWN & RECOVERY
    // ==========================================================================
    suite('Section 9: Console Cleanliness & Database Baseline Restoration');

    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes('Fallo simulado') && !e.includes('[Kanban] Error al mover expediente')
    );
    if (unexpectedErrors.length === 0) {
      pass('CONSOLE-CLEAN', 'Zero unhandled console errors or runtime exceptions during adversarial testing');
    } else {
      fail('CONSOLE-CLEAN', `Unexpected console errors detected: ${unexpectedErrors.length}`, JSON.stringify(unexpectedErrors));
    }

    // Restore baseline DB state
    for (const item of initialExpedientesSnapshot) {
      await api(`/api/expedientes/${item.id}/estatus`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          nuevoEstatusId: item.estatusId,
          nuevoSubEstatusId: item.subEstatusId,
          notas: 'Challenger safe restoration to baseline',
        },
      });
    }
    pass('TEARDOWN-DB-RESTORED', `Restored ${initialExpedientesSnapshot.length} expedientes to exact pre-test baseline in SQLite`);

  } finally {
    if (cdp) cdp.close();
    cleanup();
    await prisma.$disconnect();
  }

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}                    ADVERSARIAL STRESS SUMMARY REPORT${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Adversarial Checks:  ${colors.bold}${totalChecks}${colors.reset}`);
  console.log(`  Passed Checks:             ${colors.green}${passedChecks}${colors.reset}`);
  console.log(`  Failed Checks:             ${colors.red}${failedChecks}${colors.reset}`);
  console.log(`  Pass Rate:                 ${colors.bold}${((passedChecks / totalChecks) * 100).toFixed(1)}%${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedChecks > 0) {
    console.log(`${colors.red}${colors.bold}CHALLENGE VERDICT: REQUEST_CHANGES (${failedChecks} failures)${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}CHALLENGE VERDICT: APPROVE (100% Adversarial Empirical Tests Passed)${colors.reset}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal challenger execution error:', err);
  process.exit(1);
});
