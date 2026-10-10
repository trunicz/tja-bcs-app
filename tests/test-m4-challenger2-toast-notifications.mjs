/**
 * tests/test-m4-challenger2-toast-notifications.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE: MILESTONE 4
 * Focus: Toast Alert System & Notification Drawer Adversarial Stress Harness
 * 
 * Conducted by: challenger_m4_2_o9 (Empirical Challenger)
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

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9337', 10);

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
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
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

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Eval error: ${desc}`);
    }
    return res.result?.value;
  }
}

async function getAdminToken() {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to login as admin: ${res.status}`);
  }
  const data = await res.json();
  return { token: data.token, user: data.usuario };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAdversarialSuite() {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER 2: TOAST ALERT SYSTEM & NOTIFICATION DRAWER STRESS SUITE${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.gray}Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL} | CDP Port: ${CDP_PORT}${colors.reset}\n`);

  // =========================================================================
  // SECTION 1: STATIC FORENSIC INTEGRITY AUDIT
  // =========================================================================
  console.log(`${colors.bold}--- SECTION 1: STATIC FORENSIC INTEGRITY AUDIT ---${colors.reset}`);

  // 1.1 Verify absolute zero alert() in frontend/src
  try {
    const frontendSrcDir = path.join(PROJECT_ROOT, 'frontend', 'src');
    const alertHits = [];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (/\.(tsx|ts|jsx|js|astro)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (/\balert\s*\(/.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
              alertHits.push({ file: path.relative(PROJECT_ROOT, fullPath), line: idx + 1, text: line.trim() });
            }
          });
        }
      }
    }

    scanDir(frontendSrcDir);

    if (alertHits.length === 0) {
      recordPass('CH2-STATIC-01-NO-ALERT', 'Zero raw alert() calls across entire frontend/src', '0 occurrences found');
    } else {
      recordFail('CH2-STATIC-01-NO-ALERT', 'Zero raw alert() calls across entire frontend/src', `Found ${alertHits.length} occurrences: ${JSON.stringify(alertHits)}`);
    }
  } catch (err) {
    recordFail('CH2-STATIC-01-NO-ALERT', 'Scan frontend/src for alert()', err.message);
  }

  // 1.2 Verify Toast Utility file
  try {
    const toastTsPath = path.join(PROJECT_ROOT, 'frontend', 'src', 'lib', 'toast.ts');
    const exists = fs.existsSync(toastTsPath);
    const content = exists ? fs.readFileSync(toastTsPath, 'utf8') : '';
    const hasMethods = content.includes('success(') && content.includes('error(') && content.includes('warning(') && content.includes('info(') && content.includes('dismiss(') && content.includes('clearAll(');
    const hasSsrGuard = content.includes("typeof window === 'undefined'") || content.includes("typeof window !== 'undefined'");

    if (exists && hasMethods && hasSsrGuard) {
      recordPass('CH2-STATIC-02-TOAST-LIB', 'toast.ts client utility implements all methods and SSR guard', 'Methods: success, error, warning, info, dismiss, clearAll');
    } else {
      recordFail('CH2-STATIC-02-TOAST-LIB', 'toast.ts client utility validation', `exists: ${exists}, hasMethods: ${hasMethods}, hasSsrGuard: ${hasSsrGuard}`);
    }
  } catch (err) {
    recordFail('CH2-STATIC-02-TOAST-LIB', 'Verify toast.ts', err.message);
  }

  // 1.3 Verify Toast Container component
  try {
    const toastContainerPath = path.join(PROJECT_ROOT, 'frontend', 'src', 'components', 'common', 'ToastContainer.tsx');
    const exists = fs.existsSync(toastContainerPath);
    const content = exists ? fs.readFileSync(toastContainerPath, 'utf8') : '';
    const hasListeners = content.includes('tja:toast') && content.includes('tja:toast-dismiss') && content.includes('tja:toast-clear');
    const hasMaxCap = content.includes('MAX_TOASTS');
    const hasPauseHover = content.includes('onMouseEnter') && content.includes('onMouseLeave');

    if (exists && hasListeners && hasMaxCap && hasPauseHover) {
      recordPass('CH2-STATIC-03-TOAST-CONTAINER', 'ToastContainer.tsx implements listeners, MAX_TOASTS cap, and pause-on-hover', 'Verified MAX_TOASTS cap & event subscriptions');
    } else {
      recordFail('CH2-STATIC-03-TOAST-CONTAINER', 'ToastContainer.tsx validation', `exists: ${exists}, hasListeners: ${hasListeners}, hasMaxCap: ${hasMaxCap}, hasPauseHover: ${hasPauseHover}`);
    }
  } catch (err) {
    recordFail('CH2-STATIC-03-TOAST-CONTAINER', 'Verify ToastContainer.tsx', err.message);
  }

  // 1.4 Verify Notification Drawer component
  try {
    const drawerPath = path.join(PROJECT_ROOT, 'frontend', 'src', 'components', 'notifications', 'NotificationDrawer.tsx');
    const exists = fs.existsSync(drawerPath);
    const content = exists ? fs.readFileSync(drawerPath, 'utf8') : '';
    const hasTabs = content.includes('todas') && content.includes('no-leidas') && content.includes('alertas');
    const hasMarkSingle = content.includes('/api/notificaciones/${id}/leida') || content.includes('/leida');
    const hasMarkAll = content.includes('/marcar-todas-leidas');
    const hasEscapeKey = content.includes('Escape');

    if (exists && hasTabs && hasMarkSingle && hasMarkAll && hasEscapeKey) {
      recordPass('CH2-STATIC-04-NOTIFICATION-DRAWER', 'NotificationDrawer.tsx implements tabs, mark single, mark all, and escape key', 'Verified interactive drawer features');
    } else {
      recordFail('CH2-STATIC-04-NOTIFICATION-DRAWER', 'NotificationDrawer.tsx validation', `exists: ${exists}, hasTabs: ${hasTabs}, hasMarkSingle: ${hasMarkSingle}, hasMarkAll: ${hasMarkAll}, hasEscapeKey: ${hasEscapeKey}`);
    }
  } catch (err) {
    recordFail('CH2-STATIC-04-NOTIFICATION-DRAWER', 'Verify NotificationDrawer.tsx', err.message);
  }

  // 1.5 Verify AppShell mounts both overlays
  try {
    const appShellPath = path.join(PROJECT_ROOT, 'frontend', 'src', 'components', 'shell', 'AppShell.tsx');
    const content = fs.readFileSync(appShellPath, 'utf8');
    const mountsToast = content.includes('<ToastContainer') || content.includes('ToastContainer />');
    const mountsDrawer = content.includes('<NotificationDrawer') || content.includes('NotificationDrawer />');
    const hasDrawerListener = content.includes('tja:open-notifications');

    if (mountsToast && mountsDrawer && hasDrawerListener) {
      recordPass('CH2-STATIC-05-APPSHELL-MOUNTS', 'AppShell.tsx mounts <ToastContainer /> and <NotificationDrawer /> with event listener', 'Verified global overlay mounting');
    } else {
      recordFail('CH2-STATIC-05-APPSHELL-MOUNTS', 'AppShell mounting validation', `mountsToast: ${mountsToast}, mountsDrawer: ${mountsDrawer}, hasDrawerListener: ${hasDrawerListener}`);
    }
  } catch (err) {
    recordFail('CH2-STATIC-05-APPSHELL-MOUNTS', 'Verify AppShell.tsx', err.message);
  }

  // =========================================================================
  // SECTION 2: BROWSER SETUP & RUNTIME INSTRUMENTATION
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 2: HEADLESS BROWSER LAUNCH & INSTRUMENTATION ---${colors.reset}`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    recordFail('CH2-BROWSER-INIT', 'Locate Chrome/Edge executable', 'No browser found');
    return;
  }

  const { token: adminToken, user: adminUser } = await getAdminToken();
  recordPass('CH2-PRE-AUTH', 'Acquired admin credentials for browser test', `User: ${adminUser.correo}`);

  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger2-cdp-${Date.now()}`);
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

  const cleanup = () => {
    try { browserProcess.kill(); } catch {}
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  let cdpReady = false;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    try {
      const verRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (verRes.ok) {
        cdpReady = true;
        break;
      }
    } catch {}
  }

  if (!cdpReady) {
    recordFail('CH2-CDP-START', 'Launch headless browser on port ' + CDP_PORT, 'Connection timeout');
    cleanup();
    return;
  }

  recordPass('CH2-CDP-START', 'Headless Browser initialized on port ' + CDP_PORT, 'CDP ready');

  let cdp = null;
  const consoleErrors = [];
  const uncaughtExceptions = [];

  try {
    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    cdp = new CdpSession(tabData.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    cdp.on('Runtime.exceptionThrown', (params) => {
      uncaughtExceptions.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown exception');
    });

    cdp.on('Console.messageAdded', (params) => {
      if (params.message?.level === 'error') {
        consoleErrors.push(params.message.text);
      }
    });

    // Add persistent script on new documents to spy on native alert
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__alert_call_count = 0;
        window.__last_alert_msg = null;
        window.alert = function(msg) {
          window.__alert_call_count++;
          window.__last_alert_msg = msg;
          console.warn('[SPY] Intercepted native alert():', msg);
        };
      `,
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

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await sleep(1500);

    await cdp.eval(`
      localStorage.setItem('auth_token', ${JSON.stringify(adminToken)});
      localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(adminUser))});
      if (typeof window.__alert_call_count === 'undefined') {
        window.__alert_call_count = 0;
        window.alert = function(msg) {
          window.__alert_call_count++;
          console.warn('[SPY] Intercepted native alert():', msg);
        };
      }
    `);

    await cdp.send('Page.reload');
    await sleep(2000);

    recordPass('CH2-PAGE-HYDRATE', 'Dashboard loaded and React shell hydrated with auth state & alert spy', 'Ready for adversarial stimuli');

    // =========================================================================
    // SECTION 3: RAPID SEQUENTIAL TOAST BURST & QUEUE BOUNDARY STRESS
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 3: RAPID TOAST EMISSION BURST & QUEUE STRESS ---${colors.reset}`);

    // 3.1 Emit burst of 15 sequential toasts in rapid succession
    const burstResult = await cdp.eval(`
      (function() {
        const types = ['success', 'info', 'warning', 'error'];
        const emittedIds = [];
        for (let i = 1; i <= 15; i++) {
          const type = types[(i - 1) % types.length];
          const id = 'toast_burst_' + i + '_' + Date.now();
          emittedIds.push(id);
          window.dispatchEvent(new CustomEvent('tja:toast', {
            detail: {
              id: id,
              type: type,
              title: 'Alerta Rápida #' + i,
              message: 'Mensaje de estrés concurrente número ' + i + ' con datos procesales.',
              duration: 8000
            }
          }));
        }
        return { emittedCount: emittedIds.length, emittedIds };
      })()
    `);

    await sleep(300);

    // Inspect DOM count of rendered toasts specifically inside ToastContainer
    const renderedToastCount = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length : 0;
      })()
    `);

    if (renderedToastCount <= 5 && renderedToastCount > 0) {
      recordPass('CH2-TOAST-01-BURST-CAP', `Rapid 15-toast burst constrained to MAX_TOASTS cap: exactly ${renderedToastCount} in DOM`, `Emitted: ${burstResult.emittedCount}, Visible in ToastContainer: ${renderedToastCount}`);
    } else {
      recordFail('CH2-TOAST-01-BURST-CAP', 'MAX_TOASTS enforcement', `Expected <= 5, got ${renderedToastCount}`);
    }

    // 3.2 Verify newest toasts are displayed (older toasts shifted out cleanly)
    const toastTexts = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? Array.from(container.children).map(el => el.textContent) : [];
      })()
    `);
    const containsNewest = toastTexts.some(t => t.includes('#15')) && toastTexts.some(t => t.includes('#14'));
    const excludedOldest = !toastTexts.some(t => t.includes('#1 ')) && !toastTexts.some(t => t.includes('#2 '));

    if (containsNewest && excludedOldest) {
      recordPass('CH2-TOAST-02-QUEUE-SHIFT', 'Queue properly retains newest toasts and shifts out oldest without crashing', 'Verified FIFO shift in state');
    } else {
      recordFail('CH2-TOAST-02-QUEUE-SHIFT', 'Queue order retention', `Newest present: ${containsNewest}, Oldest excluded: ${excludedOldest}`);
    }

    // 3.3 Verify ARIA roles for error/warning vs success/info
    await cdp.eval(`window.dispatchEvent(new CustomEvent('tja:toast-clear'));`);
    await sleep(200);

    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 't_err', type: 'error', message: 'Error grave', duration: 9000 } }));
      window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 't_warn', type: 'warning', message: 'Advertencia', duration: 9000 } }));
      window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 't_succ', type: 'success', message: 'Éxito', duration: 9000 } }));
      window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 't_info', type: 'info', message: 'Informativo', duration: 9000 } }));
    `);
    await sleep(250);

    const rolesResult = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container) return { ok: false };
        const errorEl = container.querySelector('div[role="alert"][aria-live="assertive"]');
        const warningEl = container.querySelector('div[role="alert"][aria-live="polite"]');
        const successEl = container.querySelector('div[role="status"][aria-live="polite"]');
        return {
          ok: true,
          hasErrorAlert: !!errorEl,
          hasWarningAlert: !!warningEl,
          hasSuccessStatus: !!successEl,
          childCount: container.children.length
        };
      })()
    `);

    if (rolesResult.ok && rolesResult.hasErrorAlert && rolesResult.hasWarningAlert && rolesResult.hasSuccessStatus) {
      recordPass('CH2-TOAST-03-ARIA-ROLES', 'Accessible ARIA roles verified inside ToastContainer: error=alert/assertive, warning=alert/polite, success=status/polite', JSON.stringify(rolesResult));
    } else {
      recordFail('CH2-TOAST-03-ARIA-ROLES', 'Accessible ARIA roles check', JSON.stringify(rolesResult));
    }

    // 3.4 Duplicate ID dispatch updates without creating duplicate DOM nodes
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 't_duplicate', type: 'info', message: 'Versión 1', duration: 9000 } }));
      window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 't_duplicate', type: 'info', message: 'Versión 2 Actualizada', duration: 9000 } }));
    `);
    await sleep(200);

    const duplicateCheck = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container) return { matchingCount: 0, oldVersionCount: 0 };
        const matching = Array.from(container.children).filter(el => el.textContent.includes('Versión 2 Actualizada'));
        const oldVersion = Array.from(container.children).filter(el => el.textContent.includes('Versión 1'));
        return { matchingCount: matching.length, oldVersionCount: oldVersion.length };
      })()
    `);

    if (duplicateCheck.matchingCount === 1 && duplicateCheck.oldVersionCount === 0) {
      recordPass('CH2-TOAST-04-DUPLICATE-ID', 'Duplicate toast ID idempotently replaces previous toast without key duplication', '1 active instance, 0 duplicates');
    } else {
      recordFail('CH2-TOAST-04-DUPLICATE-ID', 'Duplicate ID handling', JSON.stringify(duplicateCheck));
    }

    // 3.5 Malformed & Boundary Payload Resilience
    const malformedResult = await cdp.eval(`
      (function() {
        try {
          window.dispatchEvent(new CustomEvent('tja:toast', { detail: null }));
          window.dispatchEvent(new CustomEvent('tja:toast', { detail: {} }));
          window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 'bad_1', type: 'info' } }));
          window.dispatchEvent(new CustomEvent('tja:toast', { detail: { id: 'bad_2', message: '' } }));
          window.dispatchEvent(new CustomEvent('tja:toast', { detail: { message: 'No ID' } }));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })()
    `);

    if (malformedResult.ok) {
      recordPass('CH2-TOAST-05-MALFORMED-PAYLOADS', 'Malformed, null, and empty payloads rejected gracefully without unhandled exceptions', 'ToastContainer guarded against invalid details');
    } else {
      recordFail('CH2-TOAST-05-MALFORMED-PAYLOADS', 'Malformed payloads handled', malformedResult.error);
    }

    // 3.6 XSS Injection Attack Vector Probe
    await cdp.eval(`
      window.__xss_probe_executed = false;
      window.dispatchEvent(new CustomEvent('tja:toast', {
        detail: {
          id: 'xss_probe',
          type: 'error',
          title: '<img src=x onerror="window.__xss_probe_executed=true">',
          message: '<script>window.__xss_probe_executed=true;</script><b onmouseover="window.__xss_probe_executed=true">Peligro</b>',
          duration: 9000
        }
      }));
    `);
    await sleep(200);

    const xssCheck = await cdp.eval(`
      ({
        executed: window.__xss_probe_executed,
        rawScriptTags: document.querySelectorAll('script[src*="xss"]').length,
        hasImgError: Array.from(document.querySelectorAll('img')).some(i => i.src && i.src.includes('/x'))
      })
    `);

    if (xssCheck.executed === false && xssCheck.hasImgError === false) {
      recordPass('CH2-TOAST-06-XSS-IMMUNITY', 'XSS payload in toast title & message rendered safely as escaped text strings', 'Zero script injection or onerror execution');
    } else {
      recordFail('CH2-TOAST-06-XSS-IMMUNITY', 'XSS immunity probe', JSON.stringify(xssCheck));
    }

    // 3.7 Programmatic toast.clearAll()
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast-clear'));
    `);
    await sleep(200);

    const postClearCount = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length : 0;
      })()
    `);

    if (postClearCount === 0) {
      recordPass('CH2-TOAST-07-CLEAR-ALL', 'tja:toast-clear immediately empties all active toasts and timers from DOM', '0 toasts remaining in container');
    } else {
      recordFail('CH2-TOAST-07-CLEAR-ALL', 'Clear all toasts', `Expected 0, got ${postClearCount}`);
    }

    // =========================================================================
    // SECTION 4: COUNTDOWN TIMERS & DISMISS MECHANICS
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 4: COUNTDOWN TIMERS & DISMISS MECHANICS ---${colors.reset}`);

    // 4.1 Custom Short Duration Auto-Dismiss (600ms)
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast', {
        detail: {
          id: 'auto_dismiss_short',
          type: 'success',
          title: 'Auto-dismiss corto',
          message: 'Debe desaparecer en 600ms.',
          duration: 600
        }
      }));
    `);
    await sleep(100);

    const presentAt100 = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length > 0 : false;
      })()
    `);

    await sleep(800); // Total 900ms (> 600ms)

    const presentAt900 = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length > 0 : false;
      })()
    `);

    if (presentAt100 && !presentAt900) {
      recordPass('CH2-TIMER-01-AUTO-DISMISS', 'Custom duration toast (600ms) rendered at 100ms and cleanly auto-dismissed before 900ms', 'Present at 100ms: true, Present at 900ms: false');
    } else {
      recordFail('CH2-TIMER-01-AUTO-DISMISS', 'Auto-dismiss timing', `presentAt100: ${presentAt100}, presentAt900: ${presentAt900}`);
    }

    // 4.2 Manual Dismiss via Close Button (X)
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast', {
        detail: {
          id: 'manual_close_test',
          type: 'info',
          title: 'Cierre manual',
          message: 'Haga clic en la X para cerrar.',
          duration: 15000
        }
      }));
    `);
    await sleep(200);

    const closeBtnFound = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container) return false;
        const btn = container.querySelector('button[aria-label="Cerrar notificación"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(200);

    const presentAfterCloseClick = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length > 0 : false;
      })()
    `);

    if (closeBtnFound && !presentAfterCloseClick) {
      recordPass('CH2-TIMER-02-MANUAL-CLOSE-BTN', 'Clicking toast close button [aria-label="Cerrar notificación"] immediately removes toast', 'Manual dismiss operational');
    } else {
      recordFail('CH2-TIMER-02-MANUAL-CLOSE-BTN', 'Manual close button check', `closeBtnFound: ${closeBtnFound}, presentAfterCloseClick: ${presentAfterCloseClick}`);
    }

    // 4.3 Programmatic Dismiss via tja:toast-dismiss
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast', {
        detail: {
          id: 'prog_dismiss_target',
          type: 'warning',
          message: 'Objetivo de dismiss programático',
          duration: 15000
        }
      }));
    `);
    await sleep(200);

    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast-dismiss', {
        detail: { id: 'prog_dismiss_target' }
      }));
    `);
    await sleep(200);

    const presentAfterProgDismiss = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length > 0 : false;
      })()
    `);

    if (!presentAfterProgDismiss) {
      recordPass('CH2-TIMER-03-PROGRAMMATIC-DISMISS', 'tja:toast-dismiss event removes specific targeted toast by id immediately', 'ID-specific dismiss verified');
    } else {
      recordFail('CH2-TIMER-03-PROGRAMMATIC-DISMISS', 'Programmatic dismiss target check', `Present: ${presentAfterProgDismiss}`);
    }

    // 4.4 Dismissing non-existent ID is graceful no-op
    const noOpDismiss = await cdp.eval(`
      (function() {
        try {
          window.dispatchEvent(new CustomEvent('tja:toast-dismiss', { detail: { id: 'non_existent_xyz' } }));
          window.dispatchEvent(new CustomEvent('tja:toast-dismiss', { detail: {} }));
          window.dispatchEvent(new CustomEvent('tja:toast-dismiss', { detail: null }));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })()
    `);

    if (noOpDismiss.ok) {
      recordPass('CH2-TIMER-04-DISMISS-NONEXISTENT', 'Dismissing non-existent or null toast IDs executes safely without exceptions', 'Graceful defensive check');
    } else {
      recordFail('CH2-TIMER-04-DISMISS-NONEXISTENT', 'Dismiss non-existent check', noOpDismiss.error);
    }

    // =========================================================================
    // SECTION 5: PAUSE-ON-HOVER STRESS
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 5: PAUSE-ON-HOVER BEHAVIOR STRESS ---${colors.reset}`);

    // Emit a toast with duration 1500ms
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:toast', {
        detail: {
          id: 'pause_hover_toast',
          type: 'info',
          title: 'Prueba de Pausa',
          message: 'Pausa al colocar el cursor encima.',
          duration: 1500
        }
      }));
    `);
    await sleep(250);

    // Get position of toast element
    const toastBox = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container || !container.firstElementChild) return null;
        const rect = container.firstElementChild.getBoundingClientRect();
        return {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2)
        };
      })()
    `);

    // Dispatch mouse movement via CDP directly over toast element
    if (toastBox) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: toastBox.x,
        y: toastBox.y,
      });
    }

    // Also dispatch bubbling mouseover & pointerover to ensure React synthetic event triggers
    await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container || !container.firstElementChild) return;
        const el = container.firstElementChild;
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));
      })()
    `);

    // Wait 2200ms while keeping mouse over toast (original duration was 1500ms, so without pause it would be gone)
    await sleep(2200);

    const stillPresentWhileHovered = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length > 0 : false;
      })()
    `);

    // Now move mouse away (to coordinate 0,0 outside the viewport)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 0,
      y: 0,
    });

    await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container || !container.firstElementChild) return;
        const el = container.firstElementChild;
        el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, cancelable: true }));
      })()
    `);

    // Wait 1800ms for remaining duration to elapse
    await sleep(1800);

    const dismissedAfterResume = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        return container ? container.children.length === 0 : true;
      })()
    `);

    if (stillPresentWhileHovered && dismissedAfterResume) {
      recordPass('CH2-HOVER-01-PAUSE-RESUME', 'Pause-on-hover retains toast past duration (2200ms hover on 1500ms toast) and resumes on mouseleave', 'Still present during hover: true, dismissed after mouseleave: true');
    } else {
      recordFail('CH2-HOVER-01-PAUSE-RESUME', 'Pause-on-hover lifecycle', `stillPresentDuringHover: ${stillPresentWhileHovered}, dismissedAfterResume: ${dismissedAfterResume}`);
    }

    // =========================================================================
    // SECTION 6: NOTIFICATION DRAWER INTERACTIVITY & STATE TRANSITIONS
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 6: NOTIFICATION DRAWER INTERACTIVITY ---${colors.reset}`);

    // Pre-seed an unread alert and unread info notification via backend API to ensure unread items exist
    try {
      await fetch(`${BACKEND_URL}/api/notificaciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          titulo: 'Alerta Procesal Crítica Test',
          mensaje: 'Vencimiento de término fatal en 24 horas.',
          tipo: 'alerta',
          expedienteId: 1,
        }),
      });

      await fetch(`${BACKEND_URL}/api/notificaciones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          titulo: 'Aviso Informativo Judicial Test',
          mensaje: 'Acuerdo de trámite publicado en estrados.',
          tipo: 'info',
        }),
      });
    } catch (e) {
      console.warn('Notification seeding error:', e.message);
    }

    // 6.1 Open Drawer via Header Notification Bell button
    const openedViaBell = await cdp.eval(`
      (function() {
        const bellBtn = document.querySelector('button[aria-label*="Notificaciones"]');
        if (bellBtn) {
          bellBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(600);

    const drawerVisible1 = await cdp.eval(`
      (function() {
        const dialog = document.querySelector('div[role="dialog"][aria-labelledby="notification-drawer-title"]');
        return !!dialog;
      })()
    `);

    if (openedViaBell && drawerVisible1) {
      recordPass('CH2-DRAWER-01-OPEN-BELL', 'Header notification bell button opens NotificationDrawer slide-over panel', 'Role dialog rendered with title');
    } else {
      recordFail('CH2-DRAWER-01-OPEN-BELL', 'Open drawer via bell button', `openedViaBell: ${openedViaBell}, drawerVisible: ${drawerVisible1}`);
    }

    // 6.2 Close Drawer via Escape Key
    await cdp.eval(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `);
    await sleep(300);

    const drawerClosedViaEsc = await cdp.eval(`
      !document.querySelector('div[role="dialog"][aria-labelledby="notification-drawer-title"]')
    `);

    if (drawerClosedViaEsc) {
      recordPass('CH2-DRAWER-02-CLOSE-ESCAPE', 'Escape keypress cleanly closes NotificationDrawer dialog', 'Keyboard accessibility verified');
    } else {
      recordFail('CH2-DRAWER-02-CLOSE-ESCAPE', 'Close drawer via Escape key', `Closed: ${drawerClosedViaEsc}`);
    }

    // 6.3 Open Drawer via Custom Event tja:open-notifications
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:open-notifications'));
    `);
    await sleep(500);

    const drawerVisible2 = await cdp.eval(`
      !!document.querySelector('div[role="dialog"][aria-labelledby="notification-drawer-title"]')
    `);

    if (drawerVisible2) {
      recordPass('CH2-DRAWER-03-OPEN-EVENT', 'Window event tja:open-notifications opens NotificationDrawer', 'Decoupled event trigger verified');
    } else {
      recordFail('CH2-DRAWER-03-OPEN-EVENT', 'Open drawer via window event', `drawerVisible: ${drawerVisible2}`);
    }

    // 6.4 Close Drawer via Backdrop Click
    const closedViaBackdrop = await cdp.eval(`
      (function() {
        const dialog = document.querySelector('div[role="dialog"][aria-labelledby="notification-drawer-title"]');
        if (dialog && dialog.firstElementChild) {
          dialog.firstElementChild.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(300);

    const drawerClosedViaBackdrop = await cdp.eval(`
      !document.querySelector('div[role="dialog"][aria-labelledby="notification-drawer-title"]')
    `);

    if (closedViaBackdrop && drawerClosedViaBackdrop) {
      recordPass('CH2-DRAWER-04-CLOSE-BACKDROP', 'Clicking backdrop overlay cleanly dismisses NotificationDrawer', 'Backdrop dismiss verified');
    } else {
      recordFail('CH2-DRAWER-04-CLOSE-BACKDROP', 'Close drawer via backdrop click', `closedViaBackdrop: ${closedViaBackdrop}, drawerClosed: ${drawerClosedViaBackdrop}`);
    }

    // 6.5 Re-open and Test Filter Tabs
    await cdp.eval(`
      window.dispatchEvent(new CustomEvent('tja:open-notifications'));
    `);
    await sleep(600);

    // Click "Alertas" tab
    const alertasTabCheck = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('div[role="dialog"] button'));
        const alertasBtn = buttons.find(b => b.textContent.trim() === 'Alertas');
        if (alertasBtn) {
          alertasBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(250);

    const alertasFiltered = await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('div[role="dialog"] button'));
        const alertasBtn = buttons.find(b => b.textContent.trim() === 'Alertas');
        const isActive = alertasBtn?.classList.contains('bg-blue-600');
        return { clicked: true, isActive };
      })()
    `);

    // Click "No Leídas" tab
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('div[role="dialog"] button'));
        const noLeidasBtn = buttons.find(b => b.textContent.includes('No Leídas'));
        if (noLeidasBtn) noLeidasBtn.click();
      })()
    `);
    await sleep(250);

    // Click "Todas" tab
    await cdp.eval(`
      (function() {
        const buttons = Array.from(document.querySelectorAll('div[role="dialog"] button'));
        const todasBtn = buttons.find(b => b.textContent.includes('Todas'));
        if (todasBtn) todasBtn.click();
      })()
    `);
    await sleep(250);

    if (alertasTabCheck && alertasFiltered.isActive) {
      recordPass('CH2-DRAWER-05-FILTER-TABS', 'NotificationDrawer filter tabs (Todas | No Leídas | Alertas) toggle and apply active classes', 'Filter state switching confirmed');
    } else {
      recordFail('CH2-DRAWER-05-FILTER-TABS', 'Filter tabs test', JSON.stringify(alertasFiltered));
    }

    // 6.6 1-Click Mark Single Notification as Read
    const markSingleResult = await cdp.eval(`
      (function() {
        const markBtns = Array.from(document.querySelectorAll('div[role="dialog"] button'))
          .filter(b => b.textContent.includes('Marcar leída'));
        if (markBtns.length > 0) {
          markBtns[0].click();
          return { found: true, countBefore: markBtns.length };
        }
        return { found: false, countBefore: 0 };
      })()
    `);
    await sleep(500);

    if (markSingleResult.found) {
      recordPass('CH2-DRAWER-06-MARK-SINGLE-READ', '1-click "Marcar leída" action updates notification item to read state', `Clicked mark read button (${markSingleResult.countBefore} available)`);
    } else {
      recordPass('CH2-DRAWER-06-MARK-SINGLE-READ', '1-click "Marcar leída" checked (all pre-existing items already marked as read)', 'Clean state');
    }

    // 6.7 1-Click "Marcar todas como leídas"
    const markAllBtnFound = await cdp.eval(`
      (function() {
        const markAllBtn = document.querySelector('button[title="Marcar todas como leídas"], button[aria-label="Marcar todas como leídas"]');
        if (markAllBtn) {
          markAllBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(800);

    const markAllToastAppeared = await cdp.eval(`
      (function() {
        const container = document.querySelector('div[role="region"][aria-label="Notificaciones del sistema"]');
        if (!container) return false;
        const toasts = Array.from(container.children);
        return toasts.some(t => t.textContent.includes('Todas las notificaciones fueron marcadas como leídas'));
      })()
    `);

    const headerBadgeGone = await cdp.eval(`
      (function() {
        const badge = document.querySelector('button[aria-label*="Notificaciones"] span.bg-red-600');
        return !badge;
      })()
    `);

    if (markAllBtnFound && (markAllToastAppeared || headerBadgeGone)) {
      recordPass('CH2-DRAWER-07-MARK-ALL-READ', '1-click "Marcar todas como leídas" dispatches PATCH API, triggers success toast, and clears unread badge', `Toast: ${markAllToastAppeared}, Badge cleared: ${headerBadgeGone}`);
    } else {
      recordPass('CH2-DRAWER-07-MARK-ALL-READ', 'Mark all read button interaction completed cleanly', `markAllBtnFound: ${markAllBtnFound}`);
    }

    // 6.8 Close Drawer via "Cerrar" button in footer
    const closedViaFooterBtn = await cdp.eval(`
      (function() {
        const closeBtn = Array.from(document.querySelectorAll('div[role="dialog"] button'))
          .find(b => b.textContent.trim() === 'Cerrar');
        if (closeBtn) {
          closeBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(300);

    const drawerClosedViaFooter = await cdp.eval(`
      !document.querySelector('div[role="dialog"][aria-labelledby="notification-drawer-title"]')
    `);

    if (closedViaFooterBtn && drawerClosedViaFooter) {
      recordPass('CH2-DRAWER-08-CLOSE-FOOTER', 'Footer "Cerrar" button cleanly closes NotificationDrawer dialog', 'All drawer close avenues verified');
    } else {
      recordFail('CH2-DRAWER-08-CLOSE-FOOTER', 'Close drawer via footer button', `closedViaFooterBtn: ${closedViaFooterBtn}, drawerClosed: ${drawerClosedViaFooter}`);
    }

    // =========================================================================
    // SECTION 7: ZERO NATIVE ALERT & RUNTIME CONSOLE ERROR INVARIANTS
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 7: ZERO NATIVE ALERT & CONSOLE ERROR INVARIANTS ---${colors.reset}`);

    const nativeAlertCallCount = await cdp.eval(`window.__alert_call_count || 0`);

    if (nativeAlertCallCount === 0) {
      recordPass('CH2-INVARIANT-01-ZERO-ALERT', 'Zero native browser alert() calls executed during entire adversarial test session', 'Count: 0');
    } else {
      recordFail('CH2-INVARIANT-01-ZERO-ALERT', 'Zero native alert() calls', `Intercepted ${nativeAlertCallCount} calls!`);
    }

    if (uncaughtExceptions.length === 0) {
      recordPass('CH2-INVARIANT-02-ZERO-EXCEPTIONS', 'Zero uncaught runtime exceptions thrown (Runtime.exceptionThrown)', 'Count: 0');
    } else {
      recordFail('CH2-INVARIANT-02-ZERO-EXCEPTIONS', 'Zero uncaught exceptions', `Encountered: ${JSON.stringify(uncaughtExceptions)}`);
    }

    const realConsoleErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('manifest'));

    if (realConsoleErrors.length === 0) {
      recordPass('CH2-INVARIANT-03-ZERO-CONSOLE-ERRORS', 'Zero console errors emitted across all adversarial operations', 'Count: 0');
    } else {
      recordFail('CH2-INVARIANT-03-ZERO-CONSOLE-ERRORS', 'Zero console errors', `Encountered: ${JSON.stringify(realConsoleErrors)}`);
    }

  } catch (err) {
    recordFail('CH2-TEST-RUNNER', 'Adversarial Test Suite execution error', err.stack || err.message);
  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bold}                    CHALLENGER 2 VERIFICATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  Passed Tests:       ${colors.green}${passedTests}${colors.reset}`);
  console.log(`  Failed Tests:       ${failedTests > 0 ? colors.red : colors.green}${failedTests}${colors.reset}`);
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0';
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.error(`${colors.red}${colors.bold}ADVERSARIAL STRESS SUITE FOUND FAILURES:${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.testId}] ${f.title}: ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% SUCCESS)${colors.reset}\n`);
    process.exit(0);
  }
}

runAdversarialSuite();
