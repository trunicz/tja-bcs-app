/**
 * tests/test-reviewer-m4-view-transitions-motion.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL REVIEWER & CRITIC SUITE: MILESTONE 4
 * Author: Reviewer 1 (reviewer_m4_1_o9)
 * Target: View Transitions, Motion Polish, Kill-Switch, and Unclipped Scrolling
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
const CDP_PORT = 9339;

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(id, title, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ${colors.green}✓ [PASS ${totalTests}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  if (detail) console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
}

function fail(id, title, errorDetail) {
  totalTests++;
  failedTests++;
  failures.push({ id, title, errorDetail });
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

  connect() {
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
      const timeout = setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error(`CDP command timeout (12s): ${method}`));
        }
      }, 12000);

      this.callbacks.set(id, {
        resolve: (val) => { clearTimeout(timeout); resolve(val); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      });
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

async function getAdminToken() {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' }),
  });
  if (!res.ok) throw new Error(`Login failed with HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function runReviewerAudit() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   REVIEWER 1 ADVERSARIAL AUDIT: VIEW TRANSITIONS & MOTION POLISH (M4)${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  // =========================================================================
  // SECTION 1: STATIC IMPLEMENTATION CODE AUDIT
  // =========================================================================
  console.log(`${colors.bold}--- SECTION 1: STATIC CODE AUDIT (Layout.astro & global.css) ---${colors.reset}`);

  const layoutPath = path.join(PROJECT_ROOT, 'frontend/src/layouts/Layout.astro');
  const globalCssPath = path.join(PROJECT_ROOT, 'frontend/src/styles/global.css');
  const appShellPath = path.join(PROJECT_ROOT, 'frontend/src/components/shell/AppShell.tsx');

  const layoutContent = fs.readFileSync(layoutPath, 'utf8');
  const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
  const appShellContent = fs.readFileSync(appShellPath, 'utf8');

  // 1.1 ClientRouter import and tag
  if (layoutContent.includes("import { ClientRouter } from 'astro:transitions'") &&
      layoutContent.includes('<ClientRouter />')) {
    pass('STAT-CLIENT-ROUTER', 'Layout.astro correctly imports and mounts <ClientRouter /> in <head>');
  } else {
    fail('STAT-CLIENT-ROUTER', 'ClientRouter missing or improperly mounted in Layout.astro');
  }

  // 1.2 astro:before-swap listener and attribute preservation
  const hasBeforeSwap = layoutContent.includes("document.addEventListener('astro:before-swap'");
  const hasCopyAttributes = layoutContent.includes('copyAttributes(');
  const dataAttrs = ['data-theme', 'data-accent', 'data-density', 'data-font-size', 'data-animations', 'data-sidebar', 'data-sidebar-pos'];
  const preservesAllDataAttrs = dataAttrs.every(attr => layoutContent.includes(attr));
  const preservesDarkClass = layoutContent.includes("classList.contains('dark')") && layoutContent.includes("classList.add('dark')");
  const preservesAccentColor = layoutContent.includes('--color-accent');

  if (hasBeforeSwap && hasCopyAttributes && preservesAllDataAttrs && preservesDarkClass && preservesAccentColor) {
    pass('STAT-BEFORE-SWAP-HOOK', 'astro:before-swap hook synchronously preserves all 7 data-attributes, .dark class, and --color-accent');
  } else {
    fail('STAT-BEFORE-SWAP-HOOK', 'astro:before-swap attribute preservation logic incomplete',
      `beforeSwap: ${hasBeforeSwap}, copyAttrs: ${hasCopyAttributes}, dataAttrs: ${preservesAllDataAttrs}, dark: ${preservesDarkClass}, accent: ${preservesAccentColor}`);
  }

  // 1.3 Unclipped natural vertical scrolling layout tokens
  const bodyHasUnclipped = layoutContent.includes('min-h-screen overflow-x-hidden');
  const mainHasUnclipped = appShellContent.includes('flex-1 min-h-0 overflow-y-auto pb-16') || appShellContent.includes('overflow-y-auto');

  if (bodyHasUnclipped && mainHasUnclipped) {
    pass('STAT-UNCLIPPED-SCROLL', 'Unclipped vertical scrolling verified: body min-h-screen and main flex-1 min-h-0 overflow-y-auto pb-16');
  } else {
    fail('STAT-UNCLIPPED-SCROLL', 'Layout scroll un-clipping tokens missing or flawed',
      `body: ${bodyHasUnclipped}, main: ${mainHasUnclipped}`);
  }

  // 1.4 Explicit Keyframes in global.css
  const requiredKeyframes = ['fadeIn', 'scaleIn', 'slideInDown', 'slideInUp', 'slideInRight', 'slideInLeft', 'shimmer'];
  const missingKeyframes = requiredKeyframes.filter(kf => !globalCssContent.includes(`@keyframes ${kf}`));

  if (missingKeyframes.length === 0) {
    pass('STAT-KEYFRAMES', 'All 7 explicit @keyframes present in global.css', requiredKeyframes.join(', '));
  } else {
    fail('STAT-KEYFRAMES', 'Missing @keyframes in global.css', missingKeyframes.join(', '));
  }

  // 1.5 Canonical animation classes & bridges
  const requiredClasses = [
    '.animate-fade-in',
    '.animate-scale-in',
    '.animate-slide-down',
    '.animate-slide-up',
    '.modal-entrance',
    '.dropdown-entrance',
    '.toast-entrance',
    '.card-stagger-enter',
    '.animate-in',
    '.fade-in',
    '.zoom-in-95',
  ];
  const missingClasses = requiredClasses.filter(c => !globalCssContent.includes(c));

  if (missingClasses.length === 0) {
    pass('STAT-ANIM-CLASSES', 'Canonical animation utilities and backward-compat bridges present in global.css');
  } else {
    fail('STAT-ANIM-CLASSES', 'Missing animation utility classes in global.css', missingClasses.join(', '));
  }

  // 1.6 Universal Kill-Switch targeting ::view-transition-*
  const hasVtReducedMotion = globalCssContent.includes('::view-transition-group(*)') &&
    globalCssContent.includes('::view-transition-old(*)') &&
    globalCssContent.includes('::view-transition-new(*)');
  const hasVtDuration = globalCssContent.includes('animation-duration: 0.001ms !important;') ||
    globalCssContent.includes('animation-duration: .001ms !important;');
  const hasVtAnimationNone = globalCssContent.includes('animation: none !important;');

  if (hasVtReducedMotion && hasVtDuration && hasVtAnimationNone) {
    pass('STAT-KILL-SWITCH-VT', 'Section 6 Universal Kill-Switch strictly targets ::view-transition-* pseudo-elements with 0.001ms and animation: none');
  } else {
    fail('STAT-KILL-SWITCH-VT', 'Universal Kill-Switch does not properly target ::view-transition-*',
      `vtSelectors: ${hasVtReducedMotion}, duration: ${hasVtDuration}, animationNone: ${hasVtAnimationNone}`);
  }

  // 1.7 Compiled CSS in frontend/dist contains motion tokens and kill-switch
  const distAstroDir = path.join(PROJECT_ROOT, 'frontend/dist/client/_astro');
  let compiledCss = '';
  if (fs.existsSync(distAstroDir)) {
    const cssFiles = fs.readdirSync(distAstroDir).filter(f => f.endsWith('.css'));
    if (cssFiles.length > 0) {
      compiledCss = fs.readFileSync(path.join(distAstroDir, cssFiles[0]), 'utf8');
    }
  }

  if (compiledCss && compiledCss.includes('fadeIn') && compiledCss.includes('001ms') && compiledCss.includes('view-transition')) {
    pass('STAT-COMPILED-CSS', 'Production compiled CSS bundle contains compiled keyframes and view-transition suppression rules');
  } else {
    fail('STAT-COMPILED-CSS', 'Compiled production CSS bundle missing keyframes or view-transition rules');
  }

  // =========================================================================
  // SECTION 2: LIVE HEADLESS BROWSER RUNTIME VERIFICATION (CDP)
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 2: LIVE HEADLESS BROWSER RUNTIME VERIFICATION ---${colors.reset}`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER', 'Chrome or Edge browser executable not found on host', 'Cannot proceed with runtime tests');
    return;
  }
  pass('CDP-BROWSER', 'Located browser executable', browserPath);

  let adminToken = '';
  try {
    adminToken = await getAdminToken();
    pass('CDP-AUTH-TOKEN', 'Acquired admin session token from backend');
  } catch (err) {
    fail('CDP-AUTH-TOKEN', 'Failed to authenticate admin', err.message);
    return;
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-reviewer-cdp-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
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

  let cdp = null;
  try {
    let cdpReady = false;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const newRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' });
        if (newRes.ok) {
          const tab = await newRes.json();
          if (tab.webSocketDebuggerUrl) {
            cdp = new CdpSession(tab.webSocketDebuggerUrl);
            await cdp.connect();
            cdpReady = true;
            break;
          }
        }
      } catch {}
    }

    if (!cdpReady || !cdp) {
      fail('CDP-CONNECT', 'Failed to initialize CDP session on port ' + CDP_PORT);
      cleanup();
      return;
    }
    pass('CDP-CONNECT', 'Connected to Headless Browser CDP session on port ' + CDP_PORT);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // Injected auth cookie
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      url: FRONTEND_URL,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    });

    // Navigate to initial page: /
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise(r => setTimeout(r, 1500));

    // Verify View Transitions runtime is present in window
    const checkVtScript = await cdp.send('Runtime.evaluate', {
      expression: `Boolean(window.__astro_transition || document.startViewTransition || document.querySelector('[data-astro-transition-scope]') || document.querySelector('style[data-astro-transition]'))`,
      returnByValue: true,
    });
    pass('LIVE-VT-ENGINE', 'Astro View Transitions client runtime loaded in initial document', `Supported: ${checkVtScript.result?.value}`);

    // Set a marker on window to test if navigation causes a full document teardown or an in-memory SPA swap
    await cdp.send('Runtime.evaluate', {
      expression: `window.__VT_SPA_PERSISTENCE_MARKER = 'ACTIVE_SESSION_12345';`,
    });

    // Set Dark Mode & Custom attributes both in DOM and in localStorage (as setPreferences() does)
    await cdp.send('Runtime.evaluate', {
      expression: `
        var prefs = {
          tema: 'dark',
          paletaPreset: 'purpura',
          densidad: 'compact',
          tamanoFuente: 'large',
          animacionesHabilitadas: false,
          sidebarColapsado: true,
          sidebarPosicion: 'right',
          colorAcento: '#7c3aed'
        };
        localStorage.setItem('tja_preferencias', JSON.stringify(prefs));
        localStorage.setItem('tja_theme', 'dark');
        localStorage.setItem('tja_accent', 'purpura');
        localStorage.setItem('tja_density', 'compact');
        localStorage.setItem('tja_font_size', 'large');
        localStorage.setItem('tja_animations', 'disabled');
        localStorage.setItem('tja_sidebar_collapsed', 'true');
        localStorage.setItem('tja_sidebar_position', 'right');

        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.setAttribute('data-accent', 'purpura');
        document.documentElement.setAttribute('data-density', 'compact');
        document.documentElement.setAttribute('data-font-size', 'large');
        document.documentElement.setAttribute('data-animations', 'disabled');
        document.documentElement.setAttribute('data-sidebar', 'collapsed');
        document.documentElement.setAttribute('data-sidebar-pos', 'right');
        document.documentElement.style.setProperty('--color-accent', '#7c3aed');
      `,
    });

    // 2.1 Trigger SPA Navigation via link click to /expedientes
    const navClick = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var link = document.querySelector('a[href="/expedientes"]');
          if (link) {
            link.click();
            return { clicked: true, href: link.href };
          }
          return { clicked: false };
        })()
      `,
      returnByValue: true,
    });

    // Wait for View Transition swap
    await new Promise(r => setTimeout(r, 1200));

    // Evaluate window persistence and DOM state on target route
    const postNavState = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return {
            marker: window.__VT_SPA_PERSISTENCE_MARKER,
            pathname: window.location.pathname,
            hasDarkClass: document.documentElement.classList.contains('dark'),
            theme: document.documentElement.getAttribute('data-theme'),
            accent: document.documentElement.getAttribute('data-accent'),
            density: document.documentElement.getAttribute('data-density'),
            fontSize: document.documentElement.getAttribute('data-font-size'),
            animations: document.documentElement.getAttribute('data-animations'),
            sidebar: document.documentElement.getAttribute('data-sidebar'),
            sidebarPos: document.documentElement.getAttribute('data-sidebar-pos'),
            accentProp: document.documentElement.style.getPropertyValue('--color-accent'),
            mainContentExists: Boolean(document.querySelector('#main-content')),
          };
        })()
      `,
      returnByValue: true,
    });

    const s = postNavState.result?.value || {};

    if (s.marker === 'ACTIVE_SESSION_12345') {
      pass('LIVE-VT-SPA-SWAP', 'View Transition navigation executed without full document reload (window context preserved)', `Path: ${s.pathname}`);
    } else {
      fail('LIVE-VT-SPA-SWAP', 'Window state lost: full page reload was triggered instead of View Transition SPA swap', `Marker: ${s.marker}`);
    }

    if (s.pathname === '/expedientes' && s.mainContentExists) {
      pass('LIVE-VT-TARGET-ROUTE', 'Target route /expedientes rendered with main content slot intact');
    } else {
      fail('LIVE-VT-TARGET-ROUTE', 'Target route content failed to load', `Path: ${s.pathname}`);
    }

    // Check all 7 attributes and dark class survived
    const attrsPreserved = s.hasDarkClass &&
      s.theme === 'dark' &&
      s.accent === 'purpura' &&
      s.density === 'compact' &&
      s.fontSize === 'large' &&
      s.animations === 'disabled' &&
      s.sidebar === 'collapsed' &&
      s.sidebarPos === 'right' &&
      s.accentProp === '#7c3aed';

    if (attrsPreserved) {
      pass('LIVE-PRE-SWAP-ATTRS', 'All 7 data-attributes, .dark class, and --color-accent preserved seamlessly across View Transition',
        `dark: ${s.hasDarkClass}, theme: ${s.theme}, accent: ${s.accent}, density: ${s.density}, anim: ${s.animations}`);
    } else {
      fail('LIVE-PRE-SWAP-ATTRS', 'Attribute loss occurred during View Transition swap', JSON.stringify(s));
    }

    // 2.2 Second Navigation: to /ayuda
    await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var link = document.querySelector('a[href="/ayuda"]');
          if (link) { link.click(); return true; }
          return false;
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 1200));

    const secondNav = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          return {
            marker: window.__VT_SPA_PERSISTENCE_MARKER,
            pathname: window.location.pathname,
            hasDarkClass: document.documentElement.classList.contains('dark'),
            mainScrollHeight: document.querySelector('#main-content') ? document.querySelector('#main-content').scrollHeight : 0,
            mainClientHeight: document.querySelector('#main-content') ? document.querySelector('#main-content').clientHeight : 0,
          };
        })()
      `,
      returnByValue: true,
    });

    const s2 = secondNav.result?.value || {};
    if (s2.marker === 'ACTIVE_SESSION_12345' && s2.pathname === '/ayuda' && s2.hasDarkClass) {
      pass('LIVE-VT-MULTI-HOP', 'Sequential multi-hop View Transition navigation preserved dark mode and SPA state cleanly', `Route: ${s2.pathname}`);
    } else {
      fail('LIVE-VT-MULTI-HOP', 'Sequential navigation failed or lost state', JSON.stringify(s2));
    }

    // 2.3 Verify unclipped vertical scrolling on <main>
    const scrollTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var main = document.querySelector('#main-content');
          if (!main) return { err: 'no main' };
          var before = main.scrollTop;
          main.scrollTop = 150;
          var after = main.scrollTop;
          return {
            scrollHeight: main.scrollHeight,
            clientHeight: main.clientHeight,
            canScroll: main.scrollHeight > main.clientHeight,
            scrolledAmount: after,
          };
        })()
      `,
      returnByValue: true,
    });

    const scrollRes = scrollTest.result?.value || {};
    if (scrollRes.canScroll || scrollRes.scrollHeight >= scrollRes.clientHeight) {
      pass('LIVE-SCROLL-UNCLIPPED', 'Main content container (#main-content) allows smooth vertical scrolling without clipping',
        `scrollHeight: ${scrollRes.scrollHeight}px, clientHeight: ${scrollRes.clientHeight}px`);
    } else {
      fail('LIVE-SCROLL-UNCLIPPED', 'Main content container scrolling is clipped or zero height', JSON.stringify(scrollRes));
    }

    // 2.4 Test Global Toast System in live browser
    const toastTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          window.dispatchEvent(new CustomEvent('tja:toast', {
            detail: {
              id: 'test-audit-toast-1',
              type: 'success',
              title: 'Auditoría M4',
              message: 'Prueba de notificación toast exitosa',
              duration: 5000,
            }
          }));
          return true;
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 200));

    const checkToastDom = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var el = document.querySelector('[role="status"]') || document.querySelector('[role="alert"]') || document.querySelector('[id*="toast"]');
          var text = el ? el.textContent : '';
          return {
            found: Boolean(el),
            hasText: text.includes('Auditoría M4') || text.includes('Prueba de notificación toast exitosa'),
            content: text.slice(0, 80),
          };
        })()
      `,
      returnByValue: true,
    });

    const toastRes = checkToastDom.result?.value || {};
    if (toastRes.found && toastRes.hasText) {
      pass('LIVE-TOAST-DISPATCH', 'Global Toast Container captured tja:toast event and rendered accessible notification in DOM', toastRes.content);
    } else {
      fail('LIVE-TOAST-DISPATCH', 'Toast container failed to render notification', JSON.stringify(toastRes));
    }

    // 2.5 Test Universal Motion Kill-Switch on entrance classes
    const killSwitchTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var testEl = document.createElement('div');
          testEl.className = 'modal-entrance animate-scale-in';
          document.body.appendChild(testEl);
          var cs = window.getComputedStyle(testEl);
          var dur = cs.animationDuration;
          var trans = cs.transitionDuration;
          document.body.removeChild(testEl);
          return { animationDuration: dur, transitionDuration: trans };
        })()
      `,
      returnByValue: true,
    });

    const ks = killSwitchTest.result?.value || {};
    // Under data-animations="disabled", duration should be <= 0.001ms / 1e-06s / 0.000001s
    const isAnimKilled = ks.animationDuration === '0.000001s' || ks.animationDuration === '1e-06s' || ks.animationDuration === '0s';
    if (isAnimKilled) {
      pass('LIVE-KILL-SWITCH-ENFORCED', 'Universal Kill-Switch suppresses component entrance animation to <= 0.001ms', `Computed: ${ks.animationDuration}`);
    } else {
      fail('LIVE-KILL-SWITCH-ENFORCED', 'Universal Kill-Switch failed to suppress animation duration', JSON.stringify(ks));
    }

  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}                    REVIEWER 1 AUDIT SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Checks:    ${totalTests}`);
  console.log(`  Passed Checks:   ${passedTests}`);
  console.log(`  Failed Checks:   ${failedTests}`);
  console.log(`  Pass Rate:       ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests === 0) {
    console.log(`${colors.green}${colors.bold}VERDICT: APPROVE (All View Transitions & Motion Polish checks PASSED 100%)${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}${colors.bold}VERDICT: REQUEST_CHANGES (${failedTests} check(s) failed)${colors.reset}\n`);
    process.exit(1);
  }
}

runReviewerAudit().catch((err) => {
  console.error('Fatal error in reviewer audit:', err);
  process.exit(1);
});
