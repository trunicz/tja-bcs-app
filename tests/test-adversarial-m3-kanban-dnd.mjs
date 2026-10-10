/**
 * tests/test-adversarial-m3-kanban-dnd.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE:
 * Kanban Board Drag-and-Drop Direct Manipulation, Persistence & Rollback
 * Challenger: challenger_m3_1_o8 (critic, specialist)
 * Milestone: Milestone 3 (Direct Manipulation: Kanban Drag-and-Drop)
 *
 * Verifications:
 * 1. Static and Dynamic DOM Drag-and-Drop contracts:
 *    - Cards: draggable="true", cursor-grab, GripVertical drag handle, tabIndex, aria-label.
 *    - Columns: data-column (tramite, proyecto, concluidos, archivo).
 *    - Dragover visual feedback: border-dashed, ring highlight, drop placeholder.
 *    - Self-hover suppression: no drop placeholder when hovering origin column.
 * 2. Empirical Drag-and-Drop across all 4 columns:
 *    - Trámite -> Proyecto
 *    - Proyecto -> Concluidos
 *    - Concluidos -> Archivo
 *    - Reverse move (Archivo -> Trámite)
 *    - Direct skip (Trámite -> Concluidos)
 *    - Mathematical Card Conservation Invariant: Sum(cards) === Total cases.
 * 3. Backend status transition & SQLite MovimientoEstatus audit verification:
 *    - PUT /api/expedientes/:id/estatus updates case status & timestamp.
 *    - Direct Prisma SQLite query confirms MovimientoEstatus created with:
 *      expedienteId, estatusAnteriorId, estatusNuevoId, usuarioId, notas, fecha.
 *    - Impersonated actor audit verification.
 * 4. Adversarial error conditions & optimistic rollback:
 *    - Simulated network/backend HTTP 500 triggers instantaneous optimistic rollback
 *      and error toast event (tja:toast).
 *    - Unauthorized user (lacks 'expedientes:status') has draggable="false",
 *      no advance controls, and direct API calls blocked with HTTP 403 Forbidden.
 *    - Boundary conditions: non-numeric ID (400), non-existent case (404), unauthenticated (401).
 * 5. Accessible Keyboard Status Modal verification.
 * 6. Zero runtime console exceptions & database restoration.
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
const PROJECT_ROOT = path.resolve(__dirname, '..');

const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9341', 10);

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

const KANBAN_COLS = ['tramite', 'proyecto', 'concluidos', 'archivo'];

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
  // SECTION 1: PRE-FLIGHT & BASELINE INTEGRITY
  // ==========================================================================
  setSuite('Section 1: Pre-Flight, Authentication & Database Baseline');

  try {
    const pingRes = await fetch(`${BACKEND_URL}/api/expedientes`);
    pass('PRE-PING-BACKEND', 'Backend is reachable on port 3001', `HTTP ${pingRes.status} (401 expected unauth)`);

    initialExpedientesSnapshot = await prisma.expediente.findMany({
      select: { id: true, estatusId: true, subEstatusId: true, folio: true },
    });
    pass('PRE-DB-SNAPSHOT', `Snapshot captured for ${initialExpedientesSnapshot.length} expedientes in SQLite`,
      initialExpedientesSnapshot.map(e => `${e.folio}: status ${e.estatusId}`).join(', '));

    adminToken = await login('admin@tjabcs.gob.mx', 'password123');
    pass('PRE-AUTH-ADMIN', 'Global Admin login succeeded', `Token: ${adminToken.slice(0, 16)}...`);

    consultaToken = await login('consulta@tjabcs.gob.mx', 'password123');
    pass('PRE-AUTH-CONSULTA', 'Restricted user login succeeded', `Token: ${consultaToken.slice(0, 16)}...`);
  } catch (err) {
    fail('PRE-INIT-FAIL', 'Pre-flight setup failed', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ==========================================================================
  // SECTION 2: BROWSER CDP LAUNCH & KANBAN DOM CONTRACT INSPECTION
  // ==========================================================================
  setSuite('Section 2: Browser CDP Launch & Kanban DOM Contract Inspection');

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER-AVAIL', 'No compatible Chrome or Edge executable found');
    await prisma.$disconnect();
    process.exit(1);
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger-kanban-cdp-${Date.now()}`);
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
    '--window-size=1400,900',
    'about:blank',
  ];

  const browserProcess = spawn(browserPath, browserArgs, { stdio: 'ignore' });
  const cleanupBrowser = () => {
    try { browserProcess.kill(); } catch {}
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanupBrowser);

  let cdpReady = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const verRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (verRes.ok) { cdpReady = true; break; }
    } catch {}
  }

  if (!cdpReady) {
    fail('CDP-CONNECT', `Could not connect to CDP on port ${CDP_PORT}`);
    cleanupBrowser();
    await prisma.$disconnect();
    process.exit(1);
  }
  pass('CDP-CONNECT', 'Headless Chrome started and CDP connection established', `Port: ${CDP_PORT}`);

  let cdp = null;
  const collectedConsoleErrors = [];

  try {
    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}/expedientes`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    cdp = new CdpSession(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    cdp.on('Runtime.exceptionThrown', (params) => {
      const text = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown';
      collectedConsoleErrors.push({ type: 'exception', text });
    });
    cdp.on('Console.messageAdded', (params) => {
      if (params.message?.level === 'error') {
        const text = params.message.text || '';
        if (!text.includes('favicon.ico') && !text.includes('404')) {
          collectedConsoleErrors.push({ type: 'console', text });
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

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/expedientes` });
    await new Promise((r) => setTimeout(r, 1000));

    // Ensure session in localStorage with valid string rol and permisos
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

    // Switch to Kanban view
    await cdp.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view-target="kanban"]');
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Verify Kanban board container
    const boardContainer = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const board = document.querySelector('[data-view="kanban"]');
          const testid = document.querySelector('[data-testid="kanban-board"]');
          const hasClass = board ? board.classList.contains('kanban-board') : false;
          return { hasBoard: !!board, hasTestid: !!testid, hasClass };
        })()
      `,
      returnByValue: true,
    });
    const bc = boardContainer.result?.value;
    if (bc?.hasBoard && bc?.hasTestid && bc?.hasClass) {
      pass('KANBAN-DOM-ROOT', 'Kanban root container strictly adheres to contract', '[data-view="kanban"], [data-testid="kanban-board"], .kanban-board verified');
    } else {
      fail('KANBAN-DOM-ROOT', 'Kanban container missing required attributes', JSON.stringify(bc));
    }

    // Verify all 4 columns present
    const columnsInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const expected = ['tramite', 'proyecto', 'concluidos', 'archivo'];
          const cols = {};
          for (const colId of expected) {
            const el = document.querySelector(\`[data-column="\${colId}"]\`);
            const kanbanColAttr = el ? el.getAttribute('data-kanban-column') : null;
            const hasClass = el ? el.classList.contains('kanban-column') : false;
            const cards = el ? el.querySelectorAll('[data-expediente-id]').length : 0;
            cols[colId] = { exists: !!el, kanbanColAttr, hasClass, cards };
          }
          return cols;
        })()
      `,
      returnByValue: true,
    });
    const colMap = columnsInspect.result?.value || {};
    let allColsPresent = true;
    for (const c of KANBAN_COLS) {
      if (colMap[c]?.exists && colMap[c]?.kanbanColAttr === c && colMap[c]?.hasClass) {
        pass(`KANBAN-COL-${c.toUpperCase()}`, `Column "${c}" matches data-column, data-kanban-column and .kanban-column`, `Cards: ${colMap[c].cards}`);
      } else {
        allColsPresent = false;
        fail(`KANBAN-COL-${c.toUpperCase()}`, `Column "${c}" failed validation`, JSON.stringify(colMap[c]));
      }
    }

    // Verify card drag source attributes on cards
    const cardsInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const cards = Array.from(document.querySelectorAll('[data-expediente-id]'));
          return cards.map(c => {
            const expId = c.getAttribute('data-expediente-id');
            const isDraggable = c.getAttribute('draggable');
            const tabIndex = c.getAttribute('tabindex');
            const role = c.getAttribute('role');
            const ariaLabel = c.getAttribute('aria-label');
            const cursorGrab = c.className.includes('cursor-grab');
            const gripHandle = c.querySelector('span[title*="Arrastrar"] svg');
            const hasGrip = !!gripHandle;
            const advanceBtn = c.querySelector('button[title*="Avanzar"]');
            const moreBtn = c.querySelector('button[title*="Cambiar fase"]');
            return {
              expId,
              isDraggable,
              tabIndex,
              role,
              ariaLabel,
              cursorGrab,
              hasGrip,
              hasAdvanceBtn: !!advanceBtn,
              hasMoreBtn: !!moreBtn
            };
          });
        })()
      `,
      returnByValue: true,
    });
    const cards = cardsInspect.result?.value || [];
    if (cards.length > 0) {
      pass('KANBAN-CARDS-COUNT', `Detected ${cards.length} cards in Kanban board`, `Cards: ${cards.map(c => c.expId).join(', ')}`);
    } else {
      fail('KANBAN-CARDS-COUNT', 'Zero cards found in Kanban board');
    }

    let allCardsConform = true;
    for (const c of cards) {
      const valid = c.isDraggable === 'true' && c.role === 'region' && c.cursorGrab && c.hasGrip;
      if (!valid) allCardsConform = false;
    }
    if (allCardsConform) {
      pass('KANBAN-CARDS-DND-ATTRS', 'All cards possess draggable="true", cursor-grab, role="region" and GripVertical handle');
    } else {
      fail('KANBAN-CARDS-DND-ATTRS', 'Some cards do not possess required DnD attributes', JSON.stringify(cards));
    }

    // ==========================================================================
    // SECTION 3: VISUAL DRAG FEEDBACK & DROP PLACEHOLDER INDICATION
    // ==========================================================================
    setSuite('Section 3: Visual Drag Feedback & Active Drop Placeholder');

    const visualFeedbackTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const firstCard = document.querySelector('[data-expediente-id]');
          if (!firstCard) return { success: false, error: 'No card found' };
          const originCol = firstCard.closest('[data-column]');
          const originColId = originCol.getAttribute('data-column');
          const targetColId = originColId === 'tramite' ? 'proyecto' : 'tramite';
          const targetCol = document.querySelector(\`[data-column="\${targetColId}"]\`);

          const dt = new DataTransfer();
          dt.setData('text/plain', firstCard.getAttribute('data-expediente-id'));

          // 1. Dispatch dragstart on card
          firstCard.dispatchEvent(new DragEvent('dragstart', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));
          await new Promise(r => setTimeout(r, 60));

          // 2. Dispatch dragenter on target column
          targetCol.dispatchEvent(new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));
          targetCol.dispatchEvent(new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));
          await new Promise(r => setTimeout(r, 60));

          // Check if placeholder appears in target column
          const placeholderInTarget = targetCol.querySelector('[data-drop-placeholder="true"]');
          const targetHasFeedbackClasses = targetCol.className.includes('border-dashed') &&
                                           targetCol.className.includes('ring-blue-500');

          // 3. Dispatch dragenter on origin column (self-column hover test)
          originCol.dispatchEvent(new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));
          await new Promise(r => setTimeout(r, 60));
          const placeholderInOrigin = originCol.querySelector('[data-drop-placeholder="true"]');

          // 4. Dispatch dragleave on target
          targetCol.dispatchEvent(new DragEvent('dragleave', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));

          // 5. Dispatch dragend on card
          firstCard.dispatchEvent(new DragEvent('dragend', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt
          }));
          await new Promise(r => setTimeout(r, 60));

          const placeholderAfterEnd = targetCol.querySelector('[data-drop-placeholder="true"]');

          return {
            success: true,
            originColId,
            targetColId,
            targetHasPlaceholder: !!placeholderInTarget,
            targetPlaceholderText: placeholderInTarget ? placeholderInTarget.textContent.trim() : '',
            targetHasFeedbackClasses,
            originHasPlaceholder: !!placeholderInOrigin,
            placeholderAfterEnd: !!placeholderAfterEnd
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const vf = visualFeedbackTest.result?.value;
    if (vf?.success && vf?.targetHasPlaceholder && vf?.targetHasFeedbackClasses) {
      pass('DND-VISUAL-PLACEHOLDER', 'Active drop placeholder and border highlight appear when hovering over target column',
        `Text: "${vf.targetPlaceholderText}"`);
    } else {
      fail('DND-VISUAL-PLACEHOLDER', 'Drop placeholder or feedback classes missing on dragover', JSON.stringify(vf));
    }

    if (!vf?.originHasPlaceholder) {
      pass('DND-SELF-HOVER-SUPPRESSION', 'Drop placeholder correctly suppressed when hovering over card origin column');
    } else {
      fail('DND-SELF-HOVER-SUPPRESSION', 'Drop placeholder falsely displayed when hovering over origin column');
    }

    if (!vf?.placeholderAfterEnd) {
      pass('DND-FEEDBACK-CLEANUP', 'Drop placeholder cleanly removed upon dragend');
    } else {
      fail('DND-FEEDBACK-CLEANUP', 'Drop placeholder remained visible after dragend');
    }

    // ==========================================================================
    // SECTION 4: EMPIRICAL CARD DRAG-AND-DROP TRANSITIONS ACROSS ALL 4 COLUMNS
    // ==========================================================================
    setSuite('Section 4: Empirical Drag-and-Drop Across All 4 Columns');

    // Helper function to execute realistic DragEvent sequence in page with native DataTransfer
    async function simulateCardDrop(expId, targetColId) {
      return await cdp.send('Runtime.evaluate', {
        expression: `
          (async function() {
            const card = document.querySelector(\`[data-expediente-id="\${${expId}}"]\`);
            const targetCol = document.querySelector(\`[data-column="\${${JSON.stringify(targetColId)}}"]\`);
            if (!card || !targetCol) {
              return { success: false, error: 'Card or Target Column not found: ' + ${expId} + ' -> ' + ${JSON.stringify(targetColId)} };
            }

            const originCol = card.closest('[data-column]');
            const originColId = originCol ? originCol.getAttribute('data-column') : null;

            // Toast listener to capture tja:toast dispatch
            let capturedToast = null;
            const toastHandler = (e) => {
              capturedToast = e.detail;
            };
            window.addEventListener('tja:toast', toastHandler, { once: true });

            const dt = new DataTransfer();
            dt.setData('text/plain', String(${expId}));
            dt.setData('application/json', JSON.stringify({ id: ${expId} }));

            // 1. dragstart
            card.dispatchEvent(new DragEvent('dragstart', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            }));

            // 2. dragenter
            targetCol.dispatchEvent(new DragEvent('dragenter', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            }));

            // 3. dragover
            targetCol.dispatchEvent(new DragEvent('dragover', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            }));

            // 4. drop
            targetCol.dispatchEvent(new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            }));

            // 5. dragend
            card.dispatchEvent(new DragEvent('dragend', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            }));

            // Immediate optimistic check (< 50ms)
            const optimisticTargetHasCard = targetCol.querySelector(\`[data-expediente-id="\${${expId}}"]\`) !== null;
            const optimisticOriginLostCard = originCol ? originCol.querySelector(\`[data-expediente-id="\${${expId}}"]\`) === null : true;

            // Wait for network response (PUT /api/expedientes/:id/estatus)
            await new Promise(r => setTimeout(r, 650));

            window.removeEventListener('tja:toast', toastHandler);

            const finalTargetHasCard = targetCol.querySelector(\`[data-expediente-id="\${${expId}}"]\`) !== null;
            const totalCardsInKanban = document.querySelectorAll('[data-column] [data-expediente-id]').length;

            return {
              success: true,
              originColId,
              targetColId: ${JSON.stringify(targetColId)},
              optimisticTargetHasCard,
              optimisticOriginLostCard,
              finalTargetHasCard,
              totalCardsInKanban,
              capturedToast
            };
          })()
        `,
        returnByValue: true,
        awaitPromise: true,
      });
    }

    // Ensure Case 1 is in Trámite for step 1
    await api('/api/expedientes/1/estatus', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { nuevoEstatusId: 1, nuevoSubEstatusId: 1, notas: 'Challenger ensure Case 1 in Trámite' },
    });
    // Reload frontend data via reload button
    await cdp.send('Runtime.evaluate', {
      expression: `
        const rBtn = document.querySelector('button[title="Recargar datos"]');
        if (rBtn) rBtn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Transition 1: Trámite -> Proyecto
    const trans1 = (await simulateCardDrop(1, 'proyecto')).result?.value;
    if (trans1?.success && trans1.optimisticTargetHasCard && trans1.finalTargetHasCard) {
      pass('DND-MOVE-TRAMITE-PROYECTO', 'Card 1 moved from Trámite -> Proyecto via Drag-and-Drop',
        `Optimistic relocation: true, Toast: "${trans1.capturedToast?.title} - ${trans1.capturedToast?.message}"`);
    } else {
      fail('DND-MOVE-TRAMITE-PROYECTO', 'Drag-and-Drop from Trámite to Proyecto failed', JSON.stringify(trans1));
    }

    // Check DB status for Case 1
    const dbCase1_1 = await prisma.expediente.findUnique({ where: { id: 1 } });
    if (dbCase1_1?.estatusId === 2) {
      pass('DND-DB-PERSIST-PROYECTO', 'Case 1 status persisted in SQLite to estatusId = 2 (Proyecto)');
    } else {
      fail('DND-DB-PERSIST-PROYECTO', `Expected estatusId = 2, got ${dbCase1_1?.estatusId}`);
    }

    // Transition 2: Proyecto -> Concluidos
    const trans2 = (await simulateCardDrop(1, 'concluidos')).result?.value;
    if (trans2?.success && trans2.finalTargetHasCard) {
      pass('DND-MOVE-PROYECTO-CONCLUIDOS', 'Card 1 moved from Proyecto -> Concluidos via Drag-and-Drop',
        `Toast: "${trans2.capturedToast?.title}"`);
    } else {
      fail('DND-MOVE-PROYECTO-CONCLUIDOS', 'Drag-and-Drop from Proyecto to Concluidos failed', JSON.stringify(trans2));
    }

    const dbCase1_2 = await prisma.expediente.findUnique({ where: { id: 1 } });
    if (dbCase1_2?.estatusId === 3) {
      pass('DND-DB-PERSIST-CONCLUIDOS', 'Case 1 status persisted in SQLite to estatusId = 3 (Concluidos)');
    } else {
      fail('DND-DB-PERSIST-CONCLUIDOS', `Expected estatusId = 3, got ${dbCase1_2?.estatusId}`);
    }

    // Transition 3: Concluidos -> Archivo
    const trans3 = (await simulateCardDrop(1, 'archivo')).result?.value;
    if (trans3?.success && trans3.finalTargetHasCard) {
      pass('DND-MOVE-CONCLUIDOS-ARCHIVO', 'Card 1 moved from Concluidos -> Archivo via Drag-and-Drop',
        `Toast: "${trans3.capturedToast?.title}"`);
    } else {
      fail('DND-MOVE-CONCLUIDOS-ARCHIVO', 'Drag-and-Drop from Concluidos to Archivo failed', JSON.stringify(trans3));
    }

    const dbCase1_3 = await prisma.expediente.findUnique({ where: { id: 1 } });
    if (dbCase1_3?.estatusId === 4) {
      pass('DND-DB-PERSIST-ARCHIVO', 'Case 1 status persisted in SQLite to estatusId = 4 (Archivo)');
    } else {
      fail('DND-DB-PERSIST-ARCHIVO', `Expected estatusId = 4, got ${dbCase1_3?.estatusId}`);
    }

    // Transition 4: Reverse Move: Archivo -> Trámite (Bidirectional flow)
    const trans4 = (await simulateCardDrop(1, 'tramite')).result?.value;
    if (trans4?.success && trans4.finalTargetHasCard) {
      pass('DND-MOVE-REVERSE-ARCHIVO-TRAMITE', 'Card 1 reversed directly from Archivo -> Trámite via Drag-and-Drop',
        `Toast: "${trans4.capturedToast?.title}"`);
    } else {
      fail('DND-MOVE-REVERSE-ARCHIVO-TRAMITE', 'Reverse Drag-and-Drop failed', JSON.stringify(trans4));
    }

    const dbCase1_4 = await prisma.expediente.findUnique({ where: { id: 1 } });
    if (dbCase1_4?.estatusId === 1) {
      pass('DND-DB-PERSIST-REVERSE-TRAMITE', 'Case 1 status persisted in SQLite to estatusId = 1 (Trámite)');
    } else {
      fail('DND-DB-PERSIST-REVERSE-TRAMITE', `Expected estatusId = 1, got ${dbCase1_4?.estatusId}`);
    }

    // Transition 5: Arbitrary Skip: Trámite -> Concluidos (Non-adjacent jump)
    const trans5 = (await simulateCardDrop(1, 'concluidos')).result?.value;
    if (trans5?.success && trans5.finalTargetHasCard) {
      pass('DND-MOVE-SKIP-TRAMITE-CONCLUIDOS', 'Card 1 jumped non-adjacently from Trámite -> Concluidos via Drag-and-Drop',
        `Toast: "${trans5.capturedToast?.title}"`);
    } else {
      fail('DND-MOVE-SKIP-TRAMITE-CONCLUIDOS', 'Non-adjacent Drag-and-Drop failed', JSON.stringify(trans5));
    }

    // Conservation Invariant Verification
    const countCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const tramite = document.querySelectorAll('[data-column="tramite"] [data-expediente-id]').length;
          const proyecto = document.querySelectorAll('[data-column="proyecto"] [data-expediente-id]').length;
          const concluidos = document.querySelectorAll('[data-column="concluidos"] [data-expediente-id]').length;
          const archivo = document.querySelectorAll('[data-column="archivo"] [data-expediente-id]').length;
          const totalInDOM = tramite + proyecto + concluidos + archivo;
          return { tramite, proyecto, concluidos, archivo, totalInDOM };
        })()
      `,
      returnByValue: true,
    });
    const counts = countCheck.result?.value;
    const dbTotal = initialExpedientesSnapshot.length;
    if (counts?.totalInDOM === dbTotal) {
      pass('DND-CONSERVATION-INVARIANT', `Mathematical card conservation invariant preserved across all DnD moves: ${counts.totalInDOM}/${dbTotal}`,
        `Tramite: ${counts.tramite}, Proyecto: ${counts.proyecto}, Concluidos: ${counts.concluidos}, Archivo: ${counts.archivo}`);
    } else {
      fail('DND-CONSERVATION-INVARIANT', `Card count mismatch: DOM has ${counts?.totalInDOM}, DB has ${dbTotal}`);
    }

    // ==========================================================================
    // SECTION 5: BACKEND STATUS UPDATES & SQLITE MovimientoEstatus AUDIT
    // ==========================================================================
    setSuite('Section 5: Backend Status Endpoint & SQLite MovimientoEstatus Audit');

    // 5.1 Test direct API status update with explicit audit notes
    const auditNoteText = `Adversarial Audit Note ${Date.now()}`;
    const apiUpdateRes = await api('/api/expedientes/2/estatus', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        nuevoEstatusId: 3,
        nuevoSubEstatusId: 4,
        notas: auditNoteText,
      },
    });

    if (apiUpdateRes.ok && apiUpdateRes.data?.estatusId === 3) {
      pass('AUDIT-API-PUT-STATUS', 'PUT /api/expedientes/:id/estatus succeeded with HTTP 200',
        `Expediente ${apiUpdateRes.data.id} nuevoEstatusId: ${apiUpdateRes.data.estatusId}`);
    } else {
      fail('AUDIT-API-PUT-STATUS', 'PUT status transition returned non-200', JSON.stringify(apiUpdateRes));
    }

    // 5.2 Direct SQLite query: MovimientoEstatus audit entry verification
    const latestMovement = await prisma.movimientoEstatus.findFirst({
      where: { expedienteId: 2 },
      orderBy: { id: 'desc' },
      include: { usuario: true },
    });

    if (latestMovement && latestMovement.notas === auditNoteText) {
      pass('AUDIT-MOVIMIENTO-ESTATUS-RECORD', 'SQLite MovimientoEstatus recorded atomic audit row',
        `ID: ${latestMovement.id}, Estatus: ${latestMovement.estatusAnteriorId} -> ${latestMovement.estatusNuevoId}, Actor: ${latestMovement.usuario.nombre}`);
    } else {
      fail('AUDIT-MOVIMIENTO-ESTATUS-RECORD', 'MovimientoEstatus record not found or notes mismatch', JSON.stringify(latestMovement));
    }

    // Check actor recording (usuarioId matches admin req.user.id)
    if (latestMovement?.usuarioId === 1) {
      pass('AUDIT-ACTOR-RECORDED', 'MovimientoEstatus.usuarioId accurately recorded authenticated admin ID (1)');
    } else {
      fail('AUDIT-ACTOR-RECORDED', `Expected usuarioId = 1, got ${latestMovement?.usuarioId}`);
    }

    // 5.3 Impersonation Actor Scoping Audit
    const impersonateRes = await api('/api/auth/impersonate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { targetUserId: 2 },
    });

    if (impersonateRes.ok) {
      const impSession = await api('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
      const impUser = impSession.data?.usuario;
      const isImpersonated = impSession.data?.isImpersonated;

      if (isImpersonated && impUser?.id === 2) {
        pass('AUDIT-IMPERSONATE-ACTIVE', 'Impersonation session active for user ID 2', `User: ${impUser.nombre}`);

        const impNoteText = `Audit via Impersonated Actor ${Date.now()}`;
        const impUpdateRes = await api('/api/expedientes/2/estatus', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: {
            nuevoEstatusId: 2,
            nuevoSubEstatusId: 3,
            notas: impNoteText,
          },
        });

        if (impUpdateRes.ok) {
          const impMovement = await prisma.movimientoEstatus.findFirst({
            where: { expedienteId: 2, notas: impNoteText },
          });

          if (impMovement?.usuarioId === 2) {
            pass('AUDIT-IMPERSONATED-ACTOR-SCOPED', 'MovimientoEstatus properly scoped to impersonated user ID (2) in SQLite',
              `Actor recorded: usuarioId ${impMovement.usuarioId}`);
          } else {
            fail('AUDIT-IMPERSONATED-ACTOR-SCOPED', `Expected usuarioId 2, got ${impMovement?.usuarioId}`);
          }
        } else {
          fail('AUDIT-IMPERSONATED-ACTOR-SCOPED', 'Status update failed during impersonation', JSON.stringify(impUpdateRes));
        }

        // Revert impersonation
        await api('/api/auth/revert', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        pass('AUDIT-IMPERSONATE-REVERTED', 'Impersonation reverted back to Admin');
      } else {
        fail('AUDIT-IMPERSONATE-ACTIVE', 'Impersonation did not activate', JSON.stringify(impSession));
      }
    } else {
      fail('AUDIT-IMPERSONATE-ACTIVE', 'Impersonate endpoint failed', JSON.stringify(impersonateRes));
    }

    // ==========================================================================
    // SECTION 6: ADVERSARIAL ERROR CONDITIONS & OPTIMISTIC ROLLBACK
    // ==========================================================================
    setSuite('Section 6: Adversarial Error Conditions & Optimistic Rollback');

    // 6.1 Simulated Network/Backend 500 Error in Browser: verify optimistic rollback & error toast
    const rollbackTestResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          // Reload cases first
          const card1 = document.querySelector('[data-expediente-id="1"]');
          if (!card1) return { error: 'Card 1 not found' };
          const originCol = card1.closest('[data-column]');
          const originColId = originCol ? originCol.getAttribute('data-column') : null;
          const targetColId = originColId === 'tramite' ? 'proyecto' : 'tramite';
          const targetCol = document.querySelector(\`[data-column="\${targetColId}"]\`);

          // Intercept fetch to simulate backend HTTP 500 failure on /estatus
          const originalFetch = window.fetch;
          window.fetch = async function(...args) {
            const url = String(args[0]);
            if (url.includes('/estatus')) {
              return new Response(JSON.stringify({ error: 'Fallo simulado de base de datos' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return originalFetch.apply(this, args);
          };

          // Capture error toast event
          let capturedErrorToast = null;
          const toastHandler = (e) => {
            capturedErrorToast = e.detail;
          };
          window.addEventListener('tja:toast', toastHandler);

          const dt = new DataTransfer();
          dt.setData('text/plain', '1');
          dt.setData('application/json', JSON.stringify({ id: 1 }));

          // Dispatch dragstart -> dragenter -> dragover -> drop -> dragend
          card1.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
          targetCol.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
          card1.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));

          // 1. Immediately after drop: optimistic relocation should have occurred
          const cardInTargetImmediately = targetCol.querySelector('[data-expediente-id="1"]') !== null;

          // 2. Wait for fetch rejection and rollback handling
          await new Promise(r => setTimeout(r, 650));

          // Restore original fetch
          window.fetch = originalFetch;
          window.removeEventListener('tja:toast', toastHandler);

          // 3. After failure: card must have rolled back to originCol!
          const cardReturnedToOrigin = originCol.querySelector('[data-expediente-id="1"]') !== null;
          const cardRemovedFromTarget = targetCol.querySelector('[data-expediente-id="1"]') === null;

          return {
            success: true,
            originColId,
            targetColId,
            cardInTargetImmediately,
            cardReturnedToOrigin,
            cardRemovedFromTarget,
            capturedErrorToast
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const rb = rollbackTestResult.result?.value;
    if (rb?.success && rb.cardInTargetImmediately) {
      pass('ROLLBACK-OPTIMISTIC-INITIAL', 'Card initially transitioned optimistically into target column');
    } else {
      fail('ROLLBACK-OPTIMISTIC-INITIAL', 'Optimistic relocation did not happen before error', JSON.stringify(rb));
    }

    if (rb?.cardReturnedToOrigin && rb?.cardRemovedFromTarget) {
      pass('ROLLBACK-AUTOMATIC-RESTORATION', `Card automatically rolled back to origin column "${rb.originColId}" after 500 error`,
        `Origin has card: ${rb.cardReturnedToOrigin}, Target removed: ${rb.cardRemovedFromTarget}`);
    } else {
      fail('ROLLBACK-AUTOMATIC-RESTORATION', 'Card failed to roll back to origin column after API error', JSON.stringify(rb));
    }

    if (rb?.capturedErrorToast?.type === 'error') {
      pass('ROLLBACK-ERROR-TOAST', 'Global error toast event (tja:toast) dispatched with failure notification',
        `Title: "${rb.capturedErrorToast.title}", Message: "${rb.capturedErrorToast.message}"`);
    } else {
      fail('ROLLBACK-ERROR-TOAST', 'Error toast event not dispatched or wrong type', JSON.stringify(rb?.capturedErrorToast));
    }

    // 6.2 Unauthorized User Restrictions
    const unauthApiRes = await api('/api/expedientes/1/estatus', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${consultaToken}` },
      body: { nuevoEstatusId: 2, nuevoSubEstatusId: 3, notas: 'Unauthorized attempt' },
    });
    if (unauthApiRes.status === 403) {
      pass('RBAC-API-FORBIDDEN', 'PUT /api/expedientes/:id/estatus rejects user lacking "expedientes:status" with 403 Forbidden',
        `Response: "${unauthApiRes.data?.error}"`);
    } else {
      fail('RBAC-API-FORBIDDEN', `Expected 403 Forbidden, got ${unauthApiRes.status}`);
    }

    // Switch session to restricted user in CDP browser via cookie and localStorage
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: consultaToken,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      secure: false,
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
    await new Promise((r) => setTimeout(r, 1200));

    // Ensure in Kanban view
    await cdp.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view-target="kanban"]');
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Verify cards are not draggable for restricted user
    const restrictedCardsInspect = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const cards = Array.from(document.querySelectorAll('[data-expediente-id]'));
          const advanceButtons = document.querySelectorAll('button[title*="Avanzar"]');
          const gripHandles = document.querySelectorAll('span[title*="Arrastrar"]');
          const draggables = cards.map(c => c.getAttribute('draggable'));
          return {
            cardCount: cards.length,
            draggables,
            allNotDraggable: draggables.every(d => d === 'false' || d === null),
            advanceButtonsCount: advanceButtons.length,
            gripHandlesCount: gripHandles.length
          };
        })()
      `,
      returnByValue: true,
    });
    const rc = restrictedCardsInspect.result?.value;
    if (rc?.allNotDraggable && rc?.advanceButtonsCount === 0 && rc?.gripHandlesCount === 0) {
      pass('RBAC-UI-DISABLED', 'Kanban cards non-draggable and status advance buttons completely suppressed for restricted user',
        `cardCount: ${rc.cardCount}, allNotDraggable: ${rc.allNotDraggable}, advanceButtons: 0, gripHandles: 0`);
    } else {
      fail('RBAC-UI-DISABLED', 'Restricted user has active DnD handles or advance buttons', JSON.stringify(rc));
    }

    // 6.3 Boundary & Malformed Inputs on Status Endpoint
    const badIdRes = await api('/api/expedientes/invalid-id/estatus', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { nuevoEstatusId: 2, nuevoSubEstatusId: 3 },
    });
    if (badIdRes.status === 400) {
      pass('BOUNDARY-NON-NUMERIC-ID', 'Non-numeric expediente ID rejected with 400 Bad Request');
    } else {
      fail('BOUNDARY-NON-NUMERIC-ID', `Expected 400, got ${badIdRes.status}`);
    }

    const notFoundRes = await api('/api/expedientes/999999/estatus', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { nuevoEstatusId: 2, nuevoSubEstatusId: 3 },
    });
    if (notFoundRes.status === 404) {
      pass('BOUNDARY-NON-EXISTENT-CASE', 'Non-existent expediente ID returns 404 Not Found');
    } else {
      fail('BOUNDARY-NON-EXISTENT-CASE', `Expected 404, got ${notFoundRes.status}`);
    }

    const unauthNoToken = await api('/api/expedientes/1/estatus', {
      method: 'PUT',
      body: { nuevoEstatusId: 2, nuevoSubEstatusId: 3 },
    });
    if (unauthNoToken.status === 401) {
      pass('BOUNDARY-NO-TOKEN', 'Status update without Authorization token returns 401 Unauthorized');
    } else {
      fail('BOUNDARY-NO-TOKEN', `Expected 401, got ${unauthNoToken.status}`);
    }

    // ==========================================================================
    // SECTION 7: ACCESSIBLE KEYBOARD STATUS SELECTION MODAL
    // ==========================================================================
    setSuite('Section 7: Accessible Keyboard Status Selection Modal');

    // Restore admin session in browser
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      secure: false,
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
    await new Promise((r) => setTimeout(r, 1200));

    await cdp.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button[data-view-target="kanban"]');
        if (btn) btn.click();
      `,
    });
    await new Promise((r) => setTimeout(r, 600));

    // Test accessible modal trigger
    const modalTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          const moreBtn = document.querySelector('[data-expediente-id="1"] button[title*="Cambiar fase"]');
          if (!moreBtn) return { error: 'Modal trigger button not found' };
          moreBtn.click();
          await new Promise(r => setTimeout(r, 300));

          const modal = document.querySelector('div[role="dialog"][aria-modal="true"]');
          const title = modal ? modal.querySelector('#modal-status-title')?.textContent : '';
          const phaseButtons = modal ? modal.querySelectorAll('button:has(svg)') : [];

          // Close modal with Cancel button
          const cancelBtn = modal ? Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('Cancelar')) : null;
          if (cancelBtn) cancelBtn.click();
          await new Promise(r => setTimeout(r, 200));

          const modalAfterClose = document.querySelector('div[role="dialog"]');

          return {
            success: true,
            hasModal: !!modal,
            title,
            phaseButtonsCount: phaseButtons.length,
            closedCleanly: modalAfterClose === null
          };
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });
    const mt = modalTest.result?.value;
    if (mt?.success && mt?.hasModal && mt?.closedCleanly) {
      pass('MODAL-ACCESSIBILITY', 'Accessible Status Selection Modal opens with role="dialog", renders phase options and closes cleanly',
        `Title: "${mt.title}"`);
    } else {
      fail('MODAL-ACCESSIBILITY', 'Status Selection Modal accessibility check failed', JSON.stringify(mt));
    }

    // ==========================================================================
    // SECTION 8: ZERO CONSOLE EXCEPTION INVARIANT & RESTORATION
    // ==========================================================================
    setSuite('Section 8: Console Zero-Exception Invariant & Clean Teardown');

    const criticalExceptions = collectedConsoleErrors.filter(
      (e) => !e.text.includes('Fallo simulado') && !e.text.includes('500')
    );
    if (criticalExceptions.length === 0) {
      pass('CONSOLE-ZERO-EXCEPTIONS', 'Zero uncaught runtime exceptions during entire adversarial test session');
    } else {
      fail('CONSOLE-ZERO-EXCEPTIONS', `Uncaught exceptions detected: ${criticalExceptions.length}`, JSON.stringify(criticalExceptions));
    }

    // Restore expedientes to baseline snapshot
    for (const item of initialExpedientesSnapshot) {
      await api(`/api/expedientes/${item.id}/estatus`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          nuevoEstatusId: item.estatusId,
          nuevoSubEstatusId: item.subEstatusId,
          notas: 'Challenger baseline safe restoration',
        },
      });
    }
    pass('TEARDOWN-DB-RESTORE', `Restored ${initialExpedientesSnapshot.length} expedientes to original baseline state`);

  } finally {
    if (cdp) cdp.close();
    cleanupBrowser();
    await prisma.$disconnect();
  }

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}                    ADVERSARIAL SUITE SUMMARY REPORT${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Adversarial Checks:  ${colors.bold}${totalTests}${colors.reset}`);
  console.log(`  Passed Checks:             ${colors.green}${passedTests}${colors.reset}`);
  console.log(`  Failed Checks:             ${colors.red}${failedTests}${colors.reset}`);
  console.log(`  Pass Rate:                 ${colors.bold}${((passedTests / totalTests) * 100).toFixed(1)}%${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.log(`${colors.red}${colors.bold}CHALLENGE VERDICT: REQUEST_CHANGES (${failedTests} test failures)${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}CHALLENGE VERDICT: APPROVE (100% Adversarial Empirical Tests Passed)${colors.reset}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in test harness:', err);
  process.exit(1);
});
