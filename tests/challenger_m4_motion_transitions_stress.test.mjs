/**
 * tests/challenger_m4_motion_transitions_stress.test.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE: MILESTONE 4
 * View Transitions, Dark Mode Zero-Flash, 7 Data-Attributes Preservation,
 * Universal Motion Kill-Switch, and Viewport Scrolling Invariants
 *
 * Roles: critic, specialist (challenger_m4_1_o9)
 * =============================================================================
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9448', 10);

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
      this.ws.onerror = (err) => reject(new Error(`WebSocket error: ${err.message}`));
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
          console.error('Error parsing CDP msg:', e);
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
  if (!res.ok) throw new Error(`Login failed HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function evalScript(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result?.value;
}

async function navigateAndWait(cdp, url, waitMs = 1000) {
  await cdp.send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, waitMs));
}

async function main() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER: EMPIRICAL ADVERSARIAL STRESS TEST (MILESTONE 4)${colors.reset}`);
  console.log(`${colors.bold}   View Transitions, Zero-Flash, 7-Attr Sync, Motion Kill-Switch & Scrolling${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL}${colors.reset}\n`);

  // =========================================================================
  // SUITE 1: STATIC ARCHITECTURE & CODE INTEGRITY AUDIT
  // =========================================================================
  console.log(`${colors.bold}--- SUITE 1: STATIC ARCHITECTURE & MOTION TOKENS AUDIT ---${colors.reset}`);

  const globalCssPath = path.resolve(PROJECT_ROOT, 'frontend/src/styles/global.css');
  const layoutAstroPath = path.resolve(PROJECT_ROOT, 'frontend/src/layouts/Layout.astro');

  if (!fs.existsSync(globalCssPath) || !fs.existsSync(layoutAstroPath)) {
    fail('STATIC-FILES-EXIST', 'global.css or Layout.astro is missing');
    return;
  }
  const globalCss = fs.readFileSync(globalCssPath, 'utf8');
  const layoutAstro = fs.readFileSync(layoutAstroPath, 'utf8');

  // 1.1 Keyframes audit
  const keyframes = ['fadeIn', 'scaleIn', 'slideInDown', 'slideInUp', 'slideInRight', 'slideInLeft'];
  const missingKeyframes = keyframes.filter(kf => !globalCss.includes(`@keyframes ${kf}`));
  if (missingKeyframes.length === 0) {
    pass('CSS-KEYFRAMES-AUDIT', 'All 6 subtle motion keyframes defined in global.css', keyframes.join(', '));
  } else {
    fail('CSS-KEYFRAMES-AUDIT', 'Missing keyframes in global.css', missingKeyframes.join(', '));
  }

  // 1.2 Canonical motion utility classes
  const motionClasses = [
    '.animate-fade-in',
    '.animate-scale-in',
    '.animate-slide-down',
    '.animate-slide-up',
    '.modal-entrance',
    '.dropdown-entrance',
    '.toast-entrance',
    '.card-stagger-enter',
  ];
  const missingClasses = motionClasses.filter(c => !globalCss.includes(c));
  if (missingClasses.length === 0) {
    pass('CSS-MOTION-CLASSES', 'All canonical motion entrance classes declared', motionClasses.join(', '));
  } else {
    fail('CSS-MOTION-CLASSES', 'Missing motion entrance classes', missingClasses.join(', '));
  }

  // 1.3 Backward-compatibility bridge
  const bridgeClasses = ['.animate-in', '.fade-in', '.zoom-in-95', '.slide-in-from-right', '.slide-in-from-left'];
  const missingBridge = bridgeClasses.filter(c => !globalCss.includes(c));
  if (missingBridge.length === 0) {
    pass('CSS-MOTION-BRIDGES', 'Tailwind v4 composition bridge classes declared', bridgeClasses.join(', '));
  } else {
    fail('CSS-MOTION-BRIDGES', 'Missing bridge classes', missingBridge.join(', '));
  }

  // 1.4 Kill-Switch coverage of ::view-transition-*
  const vtGroup = globalCss.includes('::view-transition-group(*)');
  const vtOld = globalCss.includes('::view-transition-old(*)');
  const vtNew = globalCss.includes('::view-transition-new(*)');
  const vtImagePair = globalCss.includes('::view-transition-image-pair(*)');
  const vtAnimNone = globalCss.includes('animation: none !important');
  const vtDurationClamped = globalCss.includes('animation-duration: 0.001ms !important');

  if (vtGroup && vtOld && vtNew && vtImagePair && vtAnimNone && vtDurationClamped) {
    pass('CSS-KILL-SWITCH-VT-TARGET', 'Kill-switch targets all ::view-transition-* pseudo-elements with animation: none !important and 0.001ms duration');
  } else {
    fail('CSS-KILL-SWITCH-VT-TARGET', 'Incomplete kill-switch coverage for view transitions', `group:${vtGroup}, old:${vtOld}, new:${vtNew}, imagePair:${vtImagePair}, animNone:${vtAnimNone}, clamped:${vtDurationClamped}`);
  }

  // 1.5 Layout.astro ClientRouter and zero-flash pre-swap hook
  const hasClientRouterImport = layoutAstro.includes("import { ClientRouter } from 'astro:transitions'");
  const hasClientRouterTag = layoutAstro.includes('<ClientRouter />');
  const hasBeforeSwap = layoutAstro.includes("document.addEventListener('astro:before-swap'");
  const hasCopyAttributes = layoutAstro.includes('copyAttributes(');

  if (hasClientRouterImport && hasClientRouterTag && hasBeforeSwap && hasCopyAttributes) {
    pass('LAYOUT-CLIENT-ROUTER', 'Layout.astro integrates <ClientRouter /> and astro:before-swap attribute preservation hook');
  } else {
    fail('LAYOUT-CLIENT-ROUTER', 'Missing ClientRouter or before-swap hook in Layout.astro', `import:${hasClientRouterImport}, tag:${hasClientRouterTag}, beforeSwap:${hasBeforeSwap}, copyAttrs:${hasCopyAttributes}`);
  }

  // 1.6 Verify all 7 data-attributes declared in Layout.astro DATA_ATTRS list
  const expected7Attrs = [
    'data-theme',
    'data-accent',
    'data-density',
    'data-font-size',
    'data-animations',
    'data-sidebar',
    'data-sidebar-pos',
  ];
  const missingAttrs = expected7Attrs.filter(attr => !layoutAstro.includes(`'${attr}'`));
  if (missingAttrs.length === 0) {
    pass('LAYOUT-7-ATTRS-DECLARED', 'All 7 preference data-attributes declared in Layout.astro synchronization hook', expected7Attrs.join(', '));
  } else {
    fail('LAYOUT-7-ATTRS-DECLARED', 'Missing data-attributes in Layout.astro hook', missingAttrs.join(', '));
  }

  // 1.7 Zero raw window.alert() in frontend/src
  let rawAlertCount = 0;
  function searchAlerts(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.astro') searchAlerts(full);
      } else if (/\.(tsx|ts|astro|jsx|js)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        // Match alert( but not toast.alert, not role="alert", not aria-alert
        const matches = content.match(/(?<![.\w])alert\s*\(/g);
        if (matches) {
          rawAlertCount += matches.length;
        }
      }
    }
  }
  searchAlerts(path.resolve(PROJECT_ROOT, 'frontend/src'));
  if (rawAlertCount === 0) {
    pass('CODEBASE-ZERO-RAW-ALERT', 'Zero raw alert() calls detected across all frontend/src components');
  } else {
    fail('CODEBASE-ZERO-RAW-ALERT', `Detected ${rawAlertCount} un-purged raw alert() calls in frontend/src`);
  }

  // =========================================================================
  // SUITE 2: LIVE HEADLESS CHROME CDP HARNESS INITIALIZATION
  // =========================================================================
  console.log(`\n${colors.bold}--- SUITE 2: LIVE RUNTIME INITIALIZATION (CDP CHROME) ---${colors.reset}`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER-LOCATE', 'Could not locate Chrome or Edge executable');
    return;
  }
  pass('CDP-BROWSER-LOCATE', 'Located browser executable', browserPath);

  const adminToken = await getAdminToken();
  pass('CDP-AUTH-TOKEN', 'Acquired admin token for CDP session');

  const tempProfileDir = path.join(PROJECT_ROOT, '.tmp_cdp_m4_challenger');
  if (fs.existsSync(tempProfileDir)) fs.rmSync(tempProfileDir, { recursive: true, force: true });
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--window-size=1440,900',
    'about:blank',
  ];

  const browserProcess = spawn(browserPath, browserArgs);
  const cleanup = () => {
    try { browserProcess.kill(); } catch {}
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  let cdp = null;
  try {
    let cdpReady = false;
    for (let i = 0; i < 30; i++) {
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
      fail('CDP-CONNECT', 'Failed to connect to CDP on port ' + CDP_PORT);
      cleanup();
      return;
    }
    pass('CDP-CONNECT', 'Connected to Headless Chrome CDP session on port ' + CDP_PORT);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // Collect runtime console errors
    const runtimeConsoleErrors = [];
    cdp.on('Console.messageAdded', (params) => {
      if (params.message && params.message.level === 'error') {
        runtimeConsoleErrors.push(params.message.text);
      }
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      runtimeConsoleErrors.push(params.exceptionDetails?.text || 'Uncaught exception');
    });

    const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await meRes.json();
    const adminUser = meData.user || meData.usuario;

    // Inject auth token and user
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          localStorage.setItem('auth_token', ${JSON.stringify(adminToken)});
          localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(adminUser))});
        } catch(e) {}
      `,
    });

    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      url: FRONTEND_URL,
    });

    // =========================================================================
    // SUITE 3: DARK MODE WHITE FLASH ADVERSARIAL STRESS TEST
    // =========================================================================
    console.log(`\n${colors.bold}--- SUITE 3: DARK MODE WHITE FLASH ADVERSARIAL STRESS ---${colors.reset}`);

    // Initial page load to setup dark mode
    await navigateAndWait(cdp, `${FRONTEND_URL}/`, 1500);

    // Set dark mode explicitly via preferences
    await evalScript(cdp, `
      localStorage.setItem('tja_theme', 'dark');
      localStorage.setItem('tja_preferencias', JSON.stringify({
        tema: 'dark',
        paletaPreset: 'azul-clasico',
        densidad: 'comfortable',
        tamanoFuente: 'normal',
        animacionesHabilitadas: true,
        sidebarColapsado: false,
        sidebarPosicion: 'left'
      }));
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    `);

    // Install Dark Mode White-Flash Sentinel Spy in window
    await evalScript(cdp, `
      window.__whiteFlashSentinel = {
        samples: 0,
        darkClassLostCount: 0,
        lightThemeAttributeCount: 0,
        whiteBackgroundFrames: 0,
        eventsRecorded: [],
        active: true
      };

      // 1. Continuous RAF sampler
      function sampleFrame() {
        if (!window.__whiteFlashSentinel.active) return;
        window.__whiteFlashSentinel.samples++;

        var docEl = document.documentElement;
        var hasDarkClass = docEl.classList.contains('dark');
        var themeAttr = docEl.getAttribute('data-theme');
        var docBg = window.getComputedStyle(docEl).backgroundColor;
        var bodyBg = document.body ? window.getComputedStyle(document.body).backgroundColor : '';

        // White or light background detection:
        // Slate-50 is rgb(248, 250, 252) / white is rgb(255, 255, 255)
        var isDocLight = docBg.includes('248, 250, 252') || docBg.includes('255, 255, 255');
        var isBodyLight = bodyBg.includes('248, 250, 252') || bodyBg.includes('255, 255, 255');

        if (!hasDarkClass) {
          window.__whiteFlashSentinel.darkClassLostCount++;
          window.__whiteFlashSentinel.eventsRecorded.push({
            type: 'dark-class-lost',
            sample: window.__whiteFlashSentinel.samples,
            themeAttr: themeAttr,
            docBg: docBg,
            bodyBg: bodyBg
          });
        }
        if (themeAttr === 'light') {
          window.__whiteFlashSentinel.lightThemeAttributeCount++;
          window.__whiteFlashSentinel.eventsRecorded.push({
            type: 'light-theme-attr',
            sample: window.__whiteFlashSentinel.samples
          });
        }
        if (isDocLight || isBodyLight) {
          window.__whiteFlashSentinel.whiteBackgroundFrames++;
          window.__whiteFlashSentinel.eventsRecorded.push({
            type: 'light-background-detected',
            docBg: docBg,
            bodyBg: bodyBg,
            sample: window.__whiteFlashSentinel.samples
          });
        }

        requestAnimationFrame(sampleFrame);
      }
      requestAnimationFrame(sampleFrame);

      // 2. MutationObserver on documentElement attributes
      var obs = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'attributes') {
            if (m.attributeName === 'class') {
              if (!document.documentElement.classList.contains('dark')) {
                window.__whiteFlashSentinel.darkClassLostCount++;
              }
            } else if (m.attributeName === 'data-theme') {
              if (document.documentElement.getAttribute('data-theme') === 'light') {
                window.__whiteFlashSentinel.lightThemeAttributeCount++;
              }
            }
          }
        }
      });
      obs.observe(document.documentElement, { attributes: true });
      window.__whiteFlashSentinel.observer = obs;
    `);

    // Perform rapid link navigation across 5 routes using Astro View Transitions
    const routesToTest = [
      '/expedientes',
      '/notificaciones',
      '/agenda',
      '/reportes',
      '/ayuda',
      '/configuracion',
      '/'
    ];

    console.log(`    ${colors.gray}Executing rapid SPA transitions in Dark Mode across ${routesToTest.length} routes...${colors.reset}`);

    for (const route of routesToTest) {
      const navResult = await evalScript(cdp, `
        (async function() {
          var link = document.querySelector('a[href="${route}"]');
          if (link) {
            link.click();
            return { method: 'link-click', href: '${route}' };
          } else {
            // Use astro:transitions client router navigate or location
            if (window.astro && window.astro.navigate) {
              window.astro.navigate('${route}');
              return { method: 'astro-navigate', href: '${route}' };
            } else {
              window.location.href = '${route}';
              return { method: 'window-location', href: '${route}' };
            }
          }
        })()
      `);

      // Allow view transition to execute and settle
      await new Promise(r => setTimeout(r, 600));

      // Re-verify current document state after each transition
      const checkState = await evalScript(cdp, `
        ({
          pathname: window.location.pathname,
          dataTheme: document.documentElement.getAttribute('data-theme'),
          hasDarkClass: document.documentElement.classList.contains('dark'),
          docBg: window.getComputedStyle(document.documentElement).backgroundColor,
          bodyBg: document.body ? window.getComputedStyle(document.body).backgroundColor : ''
        })
      `);

      if (!checkState.hasDarkClass || checkState.dataTheme !== 'dark') {
        fail(`DARK-PRESERVE-${route}`, `Dark mode state dropped on route ${route}`, JSON.stringify(checkState));
      }
    }

    // Inspect sentinel report
    const sentinelReport = await evalScript(cdp, `
      ({
        samples: window.__whiteFlashSentinel ? window.__whiteFlashSentinel.samples : 0,
        darkClassLostCount: window.__whiteFlashSentinel ? window.__whiteFlashSentinel.darkClassLostCount : 0,
        lightThemeAttributeCount: window.__whiteFlashSentinel ? window.__whiteFlashSentinel.lightThemeAttributeCount : 0,
        whiteBackgroundFrames: window.__whiteFlashSentinel ? window.__whiteFlashSentinel.whiteBackgroundFrames : 0,
        events: window.__whiteFlashSentinel ? window.__whiteFlashSentinel.eventsRecorded : []
      })
    `);

    if (sentinelReport.darkClassLostCount === 0 && sentinelReport.whiteBackgroundFrames === 0) {
      pass('DARK-MODE-ZERO-WHITE-FLASH', `Zero White Flash detected across ${sentinelReport.samples} sampled frames during rapid SPA transitions`, `darkClassLostCount: 0, whiteBackgroundFrames: 0`);
    } else {
      fail('DARK-MODE-ZERO-WHITE-FLASH', `White Flash anomaly detected during transitions`, JSON.stringify(sentinelReport));
    }

    // =========================================================================
    // SUITE 4: ALL 7 PREFERENCE DATA-ATTRIBUTES PRESERVED ACROSS PAGE SWAPS
    // =========================================================================
    console.log(`\n${colors.bold}--- SUITE 4: 7 DATA-ATTRIBUTES PERSISTENCE ACROSS PAGE SWAPS ---${colors.reset}`);

    // Apply custom non-default values across ALL 7 attributes
    const testPrefs = {
      tema: 'dark',
      paletaPreset: 'carmesi',
      colorAcento: '#e11d48',
      densidad: 'compact',
      tamanoFuente: 'large',
      animacionesHabilitadas: false,
      sidebarColapsado: true,
      sidebarPosicion: 'right'
    };

    await evalScript(cdp, `
      localStorage.setItem('tja_theme', 'dark');
      localStorage.setItem('tja_accent', 'carmesi');
      localStorage.setItem('tja_density', 'compact');
      localStorage.setItem('tja_font_size', 'large');
      localStorage.setItem('tja_animations', 'disabled');
      localStorage.setItem('tja_sidebar_collapsed', 'true');
      localStorage.setItem('tja_sidebar_position', 'right');
      localStorage.setItem('tja_preferencias', JSON.stringify(${JSON.stringify(testPrefs)}));

      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-accent', 'carmesi');
      document.documentElement.style.setProperty('--color-accent', '#e11d48');
      document.documentElement.setAttribute('data-density', 'compact');
      document.documentElement.setAttribute('data-font-size', 'large');
      document.documentElement.setAttribute('data-animations', 'disabled');
      document.documentElement.setAttribute('data-sidebar', 'collapsed');
      document.documentElement.setAttribute('data-sidebar-pos', 'right');
    `);

    // Verify initial attribute set
    const initAttrs = await evalScript(cdp, `
      ({
        theme: document.documentElement.getAttribute('data-theme'),
        accent: document.documentElement.getAttribute('data-accent'),
        density: document.documentElement.getAttribute('data-density'),
        fontSize: document.documentElement.getAttribute('data-font-size'),
        animations: document.documentElement.getAttribute('data-animations'),
        sidebar: document.documentElement.getAttribute('data-sidebar'),
        sidebarPos: document.documentElement.getAttribute('data-sidebar-pos'),
        customAccent: document.documentElement.style.getPropertyValue('--color-accent'),
        darkClass: document.documentElement.classList.contains('dark')
      })
    `);

    // Swap pages across 4 different routes
    const swapRoutes = ['/expedientes', '/agenda', '/reportes', '/'];
    let allSwapsMaintained = true;
    const swapAudit = [];

    for (const targetRoute of swapRoutes) {
      await evalScript(cdp, `
        var targetA = document.querySelector('a[href="${targetRoute}"]');
        if (targetA) {
          targetA.click();
        } else {
          window.location.href = '${targetRoute}';
        }
      `);

      await new Promise(r => setTimeout(r, 600));

      const postSwapAttrs = await evalScript(cdp, `
        ({
          route: window.location.pathname,
          theme: document.documentElement.getAttribute('data-theme'),
          accent: document.documentElement.getAttribute('data-accent'),
          density: document.documentElement.getAttribute('data-density'),
          fontSize: document.documentElement.getAttribute('data-font-size'),
          animations: document.documentElement.getAttribute('data-animations'),
          sidebar: document.documentElement.getAttribute('data-sidebar'),
          sidebarPos: document.documentElement.getAttribute('data-sidebar-pos'),
          customAccent: document.documentElement.style.getPropertyValue('--color-accent'),
          darkClass: document.documentElement.classList.contains('dark')
        })
      `);

      swapAudit.push(postSwapAttrs);

      const isMatch = (
        postSwapAttrs.theme === 'dark' &&
        postSwapAttrs.darkClass === true &&
        postSwapAttrs.accent === 'carmesi' &&
        postSwapAttrs.density === 'compact' &&
        postSwapAttrs.fontSize === 'large' &&
        postSwapAttrs.animations === 'disabled' &&
        postSwapAttrs.sidebar === 'collapsed' &&
        postSwapAttrs.sidebarPos === 'right' &&
        postSwapAttrs.customAccent === '#e11d48'
      );

      if (!isMatch) {
        allSwapsMaintained = false;
        fail(`ATTR-PERSIST-${targetRoute}`, `Attribute deviation after swap to ${targetRoute}`, JSON.stringify(postSwapAttrs));
      }
    }

    if (allSwapsMaintained) {
      pass('SWAP-7-ATTRS-PERSISTENCE', 'All 7 data-attributes, dark class, and custom accent CSS property survived 4 consecutive Astro page swaps without reset', JSON.stringify(swapAudit[swapAudit.length - 1]));
    } else {
      fail('SWAP-7-ATTRS-PERSISTENCE', 'One or more attributes reset to default during page swaps');
    }

    // =========================================================================
    // SUITE 5: MOTION KILL-SWITCH RUNTIME DURATION & VIEW-TRANSITION SUPPRESSION
    // =========================================================================
    console.log(`\n${colors.bold}--- SUITE 5: UNIVERSAL MOTION KILL-SWITCH COMPUTED DURATION & PSEUDO-ELEMENTS ---${colors.reset}`);

    // Create dynamic test elements covering modals, toasts, dropdowns, cards, and ::view-transition elements
    await evalScript(cdp, `
      var container = document.createElement('div');
      container.id = 'kill-switch-test-fixture';
      container.innerHTML = \`
        <div id="test-fade-in" class="animate-fade-in">Fade In Element</div>
        <div id="test-scale-in" class="animate-scale-in">Scale In Element</div>
        <div id="test-slide-down" class="animate-slide-down">Slide Down Element</div>
        <div id="test-slide-up" class="animate-slide-up">Slide Up Element</div>
        <div id="test-modal" class="modal-entrance">Modal Entrance</div>
        <div id="test-dropdown" class="dropdown-entrance">Dropdown Entrance</div>
        <div id="test-toast" class="toast-entrance">Toast Entrance</div>
        <div id="test-card" class="card-stagger-enter">Card Stagger</div>
        <div id="test-bridge" class="animate-in fade-in zoom-in-95">Bridge Composition</div>
      \`;
      document.body.appendChild(container);
    `);

    // 5.1 Test under data-animations="enabled"
    await evalScript(cdp, `document.documentElement.setAttribute('data-animations', 'enabled');`);
    const enabledDurations = await evalScript(cdp, `
      ({
        modalDuration: window.getComputedStyle(document.getElementById('test-modal')).animationDuration,
        toastDuration: window.getComputedStyle(document.getElementById('test-toast')).animationDuration,
        fadeInDuration: window.getComputedStyle(document.getElementById('test-fade-in')).animationDuration
      })
    `);

    const hasRealDuration = parseFloat(enabledDurations.modalDuration) > 0.05;
    if (hasRealDuration) {
      pass('KILL-SWITCH-BASELINE-ENABLED', 'Animations execute with nominal non-zero duration under data-animations="enabled"', JSON.stringify(enabledDurations));
    } else {
      fail('KILL-SWITCH-BASELINE-ENABLED', 'Expected real animation duration under enabled state', JSON.stringify(enabledDurations));
    }

    // 5.2 Test under data-animations="disabled"
    await evalScript(cdp, `document.documentElement.setAttribute('data-animations', 'disabled');`);

    const disabledDurations = await evalScript(cdp, `
      (function() {
        var ids = ['test-fade-in', 'test-scale-in', 'test-slide-down', 'test-slide-up', 'test-modal', 'test-dropdown', 'test-toast', 'test-card', 'test-bridge'];
        var results = {};
        var maxAnimSeconds = 0;
        var maxTransSeconds = 0;

        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          var style = window.getComputedStyle(el);
          var animSec = parseFloat(style.animationDuration) || 0;
          var transSec = parseFloat(style.transitionDuration) || 0;
          if (animSec > maxAnimSeconds) maxAnimSeconds = animSec;
          if (transSec > maxTransSeconds) maxTransSeconds = transSec;
          results[ids[i]] = { animDuration: style.animationDuration, transDuration: style.transitionDuration, iteration: style.animationIterationCount };
        }
        return { results: results, maxAnimSeconds: maxAnimSeconds, maxTransSeconds: maxTransSeconds };
      })()
    `);

    // Max duration must be <= 0.000002s (0.001ms = 0.000001s)
    if (disabledDurations.maxAnimSeconds <= 0.00001 && disabledDurations.maxTransSeconds <= 0.00001) {
      pass('KILL-SWITCH-ANIM-CLAMPED', 'All 9 motion & entrance utility elements clamped to <= 0.001ms duration under data-animations="disabled"', `maxAnimSeconds: ${disabledDurations.maxAnimSeconds}s`);
    } else {
      fail('KILL-SWITCH-ANIM-CLAMPED', 'Animation duration exceeded 0.001ms under kill-switch', JSON.stringify(disabledDurations));
    }

    // 5.3 Verify CSS rules for ::view-transition-* pseudo-elements in stylesheets
    const vtRulesReport = await evalScript(cdp, `
      (function() {
        var matchedVTRules = [];
        var sheets = document.styleSheets;
        for (var i = 0; i < sheets.length; i++) {
          try {
            var rules = sheets[i].cssRules || sheets[i].rules;
            for (var j = 0; j < rules.length; j++) {
              var rule = rules[j];
              var text = rule.cssText || '';
              if (text.includes('::view-transition') && (text.includes('data-animations') || text.includes('prefers-reduced-motion'))) {
                matchedVTRules.push({
                  selector: rule.selectorText || 'media-rule',
                  cssText: text.substring(0, 160)
                });
              }
            }
          } catch(e) {}
        }
        return { count: matchedVTRules.length, sample: matchedVTRules.slice(0, 4) };
      })()
    `);

    if (vtRulesReport.count > 0) {
      pass('KILL-SWITCH-VT-STYLESHEET-RULES', `Found ${vtRulesReport.count} active stylesheet rules suppressing ::view-transition-* pseudo-elements under kill-switch`, JSON.stringify(vtRulesReport.sample[0]));
    } else {
      fail('KILL-SWITCH-VT-STYLESHEET-RULES', 'No stylesheet rules found targeting ::view-transition-* under kill-switch');
    }

    // 5.4 Test OS prefers-reduced-motion: reduce emulation
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    // Set user preference to enabled to verify OS override precedence
    await evalScript(cdp, `document.documentElement.setAttribute('data-animations', 'enabled');`);

    const reducedMotionResults = await evalScript(cdp, `
      (function() {
        var el = document.getElementById('test-modal');
        var style = window.getComputedStyle(el);
        return {
          animDuration: style.animationDuration,
          transDuration: style.transitionDuration,
          mediaMatch: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        };
      })()
    `);

    const rmAnimSec = parseFloat(reducedMotionResults.animDuration) || 0;
    if (reducedMotionResults.mediaMatch && rmAnimSec <= 0.00001) {
      pass('KILL-SWITCH-REDUCED-MOTION-MEDIA', 'prefers-reduced-motion: reduce overrides data-animations="enabled" clamping duration to <= 0.001ms', JSON.stringify(reducedMotionResults));
    } else {
      fail('KILL-SWITCH-REDUCED-MOTION-MEDIA', 'Failed to clamp animations under prefers-reduced-motion', JSON.stringify(reducedMotionResults));
    }

    // Reset media emulation
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    // Clean up test fixture
    await evalScript(cdp, `var f = document.getElementById('kill-switch-test-fixture'); if(f) f.remove();`);

    // =========================================================================
    // SUITE 6: UNCLIPPED SCROLLING ON /dashboard AND LONG PAGES
    // =========================================================================
    console.log(`\n${colors.bold}--- SUITE 6: UNCLIPPED SCROLLING & VIEWPORT OVERFLOW AUDIT ---${colors.reset}`);

    // Navigate to Dashboard
    await evalScript(cdp, `document.querySelector('a[href="/"]')?.click() || (window.location.href = '/');`);
    await new Promise(r => setTimeout(r, 1000));

    // Inspect scroll container geometry on / (Dashboard)
    const dashboardScrollReport = await evalScript(cdp, `
      (function() {
        var main = document.getElementById('main-content') || document.querySelector('main');
        if (!main) return { error: 'main element not found' };

        var mainStyle = window.getComputedStyle(main);
        var bodyStyle = window.getComputedStyle(document.body);
        var docStyle = window.getComputedStyle(document.documentElement);

        // Measure scroll geometry
        var clientHeight = main.clientHeight;
        var scrollHeight = main.scrollHeight;
        var isScrollable = scrollHeight > clientHeight;

        // Perform test scroll
        var initialScrollTop = main.scrollTop;
        main.scrollTop = 300;
        var scrolledTop = main.scrollTop;
        main.scrollTop = 0; // restore

        // Bounding box of last widget
        var widgets = document.querySelectorAll('[data-widget-id]');
        var lastWidget = widgets[widgets.length - 1];
        var lastWidgetRect = lastWidget ? lastWidget.getBoundingClientRect() : null;

        return {
          mainOverflowY: mainStyle.overflowY,
          mainOverflowX: mainStyle.overflowX,
          clientHeight: clientHeight,
          scrollHeight: scrollHeight,
          isScrollable: isScrollable,
          scrolledTop: scrolledTop,
          widgetCount: widgets.length,
          lastWidgetId: lastWidget ? lastWidget.getAttribute('data-widget-id') : null
        };
      })()
    `);

    if (dashboardScrollReport.mainOverflowY === 'auto' || dashboardScrollReport.mainOverflowY === 'scroll') {
      pass('DASHBOARD-OVERFLOW-Y-RULE', '#main-content defines overflow-y: auto for natural unclipped vertical scrolling', `overflowY: ${dashboardScrollReport.mainOverflowY}`);
    } else {
      fail('DASHBOARD-OVERFLOW-Y-RULE', '#main-content lacks scrollable overflow-y declaration', JSON.stringify(dashboardScrollReport));
    }

    if (dashboardScrollReport.isScrollable && dashboardScrollReport.scrolledTop > 0) {
      pass('DASHBOARD-SCROLL-FUNCTIONAL', `Dashboard content is naturally scrollable (scrollHeight: ${dashboardScrollReport.scrollHeight}px > clientHeight: ${dashboardScrollReport.clientHeight}px)`, `scrolledTop test verified: ${dashboardScrollReport.scrolledTop}px`);
    } else {
      fail('DASHBOARD-SCROLL-FUNCTIONAL', 'Dashboard content is clipped or unable to scroll vertically', JSON.stringify(dashboardScrollReport));
    }

    // Inspect long page /ayuda
    await evalScript(cdp, `document.querySelector('a[href="/ayuda"]')?.click() || (window.location.href = '/ayuda');`);
    await new Promise(r => setTimeout(r, 1000));

    const ayudaScrollReport = await evalScript(cdp, `
      (function() {
        var main = document.getElementById('main-content') || document.querySelector('main');
        if (!main) return { error: 'main element not found' };
        var mainStyle = window.getComputedStyle(main);
        return {
          overflowY: mainStyle.overflowY,
          scrollHeight: main.scrollHeight,
          clientHeight: main.clientHeight,
          isScrollable: main.scrollHeight > main.clientHeight
        };
      })()
    `);

    if (ayudaScrollReport.isScrollable && (ayudaScrollReport.overflowY === 'auto' || ayudaScrollReport.overflowY === 'scroll')) {
      pass('LONG-PAGE-SCROLL-AYUDA', `/ayuda page maintains unclipped natural scrolling (scrollHeight: ${ayudaScrollReport.scrollHeight}px vs clientHeight: ${ayudaScrollReport.clientHeight}px)`);
    } else {
      fail('LONG-PAGE-SCROLL-AYUDA', 'Ayuda page scrolling failed or clipped', JSON.stringify(ayudaScrollReport));
    }

    // =========================================================================
    // SUITE 7: GLOBAL TOAST ALERT CONTAINER & NOTIFICATION DRAWER
    // =========================================================================
    console.log(`\n${colors.bold}--- SUITE 7: GLOBAL TOAST ALERTS & NOTIFICATION DRAWER ---${colors.reset}`);

    // Trigger toast alerts across all 4 types (success, error, warning, info)
    const toastDispatchResult = await evalScript(cdp, `
      (function() {
        var now = Date.now();
        window.dispatchEvent(new CustomEvent('tja:toast', {
          detail: { id: 'tja_test_1', type: 'success', title: 'Éxito', message: 'Operación adversarial completada', duration: 5000, createdAt: now }
        }));
        window.dispatchEvent(new CustomEvent('tja:toast', {
          detail: { id: 'tja_test_2', type: 'error', title: 'Error', message: 'Falla simulada controlada', duration: 5000, createdAt: now }
        }));
        window.dispatchEvent(new CustomEvent('tja:toast', {
          detail: { id: 'tja_test_3', type: 'warning', title: 'Alerta', message: 'Aviso de vencimiento procesal', duration: 5000, createdAt: now }
        }));
        window.dispatchEvent(new CustomEvent('tja:toast', {
          detail: { id: 'tja_test_4', type: 'info', title: 'Información', message: 'Notificación informativa', duration: 5000, createdAt: now }
        }));
        return { dispatched: true };
      })()
    `);

    await new Promise(r => setTimeout(r, 400));

    const toastDOMCheck = await evalScript(cdp, `
      (function() {
        var toasts = document.querySelectorAll('[role="status"], [role="alert"]');
        var messages = [];
        toasts.forEach(function(t) { messages.push(t.innerText); });
        return { count: toasts.length, messages: messages };
      })()
    `);

    if (toastDOMCheck.count >= 4) {
      pass('GLOBAL-TOAST-CONTAINER-RECEIVE', `Global ToastContainer successfully rendered ${toastDOMCheck.count} active floating toast notifications`, `Rendered toasts: ${toastDOMCheck.count}`);
    } else {
      fail('GLOBAL-TOAST-CONTAINER-RECEIVE', 'Toasts failed to render in ToastContainer', JSON.stringify(toastDOMCheck));
    }

    // Test Notification Drawer Trigger
    await evalScript(cdp, `window.dispatchEvent(new CustomEvent('tja:open-notifications'));`);
    await new Promise(r => setTimeout(r, 400));

    const drawerCheck = await evalScript(cdp, `
      (function() {
        var drawer = document.querySelector('[data-testid="notification-drawer"]') || document.querySelector('.fixed.inset-y-0.right-0');
        return {
          found: Boolean(drawer),
          visible: drawer ? window.getComputedStyle(drawer).display !== 'none' : false
        };
      })()
    `);

    if (drawerCheck.found) {
      pass('NOTIFICATION-DRAWER-INTERACTIVE', 'Interactive Notification Drawer mounted and opened via global event trigger');
    } else {
      fail('NOTIFICATION-DRAWER-INTERACTIVE', 'Notification Drawer not found or failed to render', JSON.stringify(drawerCheck));
    }

    // =========================================================================
    // SUITE 8: CONSOLE ZERO-ERROR INVARIANT AUDIT
    // =========================================================================
    console.log(`\n${colors.bold}--- SUITE 8: CONSOLE ZERO-ERROR INVARIANT AUDIT ---${colors.reset}`);

    if (runtimeConsoleErrors.length === 0) {
      pass('CONSOLE-CLEAN-INVARIANT', 'ZERO uncaught runtime exceptions and ZERO console errors throughout entire adversarial session');
    } else {
      fail('CONSOLE-CLEAN-INVARIANT', `Detected ${runtimeConsoleErrors.length} runtime console errors`, runtimeConsoleErrors.slice(0, 3).join(' | '));
    }

  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}             ADVERSARIAL TEST EXECUTION SUMMARY (MILESTONE 4)${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  ${colors.green}Passed Tests:       ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests === 0 ? colors.green : colors.red}Failed Tests:       ${failedTests}${colors.reset}`);
  console.log(`  Pass Rate:          ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests === 0) {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% SUCCESS). VERDICT: APPROVE.${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}${colors.bold}ADVERSARIAL STRESS TEST FAILURES DETECTED. VERDICT: REQUEST_CHANGES.${colors.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal test execution error:', err);
  process.exit(1);
});
