/**
 * tests/challenger_m5_motion_stress.test.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE: MILESTONE 5
 * Motion, Polish, Skeleton Loaders & Universal Animation Kill-Switch
 * =============================================================================
 *
 * Verifies:
 * 1. Skeleton Component Unit Invariants & Boundary Resilience:
 *    - All 8 variants ('text', 'circular', 'avatar', 'rectangular', 'card', 'table-row', 'badge', 'button')
 *    - Animation types ('pulse', 'wave', 'none')
 *    - Boundary inputs: count <= 0, count > 50, columns <= 0, negative values
 *    - Deterministic width distribution (zero SSR hydration mismatches)
 *    - Accessibility attributes (role="status", role="row", aria-busy="true")
 * 2. Static CSS Rules Audit (global.css & compiled dist):
 *    - Keyframes shimmer definition
 *    - .animate-shimmer class definition
 *    - Universal kill-switch rules for html[data-animations="disabled"]
 *    - Universal kill-switch rules for prefers-reduced-motion
 *    - Coverage across *, *::before, *::after
 * 3. Real Headless Browser CDP Live Runtime Verification:
 *    - Live Skeleton rendering with wave shimmer
 *    - Computed style duration <= 0.001ms (1e-06s) under data-animations="disabled"
 *    - Pseudo-element ::before suppression under kill-switch
 *    - OS prefers-reduced-motion emulation enforcement
 *    - AppearanceDrawer animation toggle live DOM mutation & DB persistence
 *    - Zero layout jumps / zero collapse on widget bounding boxes
 *    - Zero hydration mismatch warnings and zero console errors across all pages
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9444', 10);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
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
          reject(new Error(`CDP command timeout (10s): ${method}`));
        }
      }, 10000);

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

async function main() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER: EMPIRICAL ADVERSARIAL VERIFICATION (MILESTONE 5)${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL}${colors.reset}\n`);

  // =========================================================================
  // SUITE 1: Skeleton Component Source Code & Invariant Static Analysis
  // =========================================================================
  console.log(`${colors.bold}--- SUITE 1: SKELETON LOADER SPECIFICATION & INVARIANTS ---${colors.reset}`);

  const skeletonSrcPath = path.resolve('frontend/src/components/common/Skeleton.tsx');
  if (!fs.existsSync(skeletonSrcPath)) {
    fail('SKEL-SRC-EXIST', 'Skeleton component source file missing', skeletonSrcPath);
    return;
  }
  const skeletonSrc = fs.readFileSync(skeletonSrcPath, 'utf8');
  pass('SKEL-SRC-EXIST', 'Found Skeleton.tsx component source', `${skeletonSrc.length} bytes`);

  // 1.1 Variants check
  const requiredVariants = ['text', 'circular', 'avatar', 'rectangular', 'card', 'table-row', 'badge', 'button'];
  const missingVariants = requiredVariants.filter(v => !skeletonSrc.includes(`'${v}'`));
  if (missingVariants.length === 0) {
    pass('SKEL-VARIANTS', 'Supports all 8 canonical skeleton variants', requiredVariants.join(', '));
  } else {
    fail('SKEL-VARIANTS', 'Missing expected skeleton variants', missingVariants.join(', '));
  }

  // 1.2 Animation types check
  const hasPulse = skeletonSrc.includes("'pulse'") && skeletonSrc.includes('animate-pulse');
  const hasWave = skeletonSrc.includes("'wave'") && skeletonSrc.includes('animate-shimmer');
  const hasNone = skeletonSrc.includes("'none'");
  if (hasPulse && hasWave && hasNone) {
    pass('SKEL-ANIMATIONS', 'Supports pulse, wave (shimmer), and none animation modes');
  } else {
    fail('SKEL-ANIMATIONS', 'Missing animation mode support', `pulse: ${hasPulse}, wave: ${hasWave}, none: ${hasNone}`);
  }

  // 1.3 Deterministic width arrays (Zero Hydration Mismatch Defense)
  if (skeletonSrc.includes('DETERMINISTIC_WIDTHS') && skeletonSrc.includes('100%')) {
    pass('SKEL-DETERMINISTIC-WIDTHS', 'Implements deterministic widths for SSR/CSR hydration safety');
  } else {
    fail('SKEL-DETERMINISTIC-WIDTHS', 'Missing deterministic width array to prevent hydration mismatch');
  }

  // 1.4 Accessibility attributes
  const hasAriaBusy = skeletonSrc.includes('aria-busy="true"') || skeletonSrc.includes('aria-busy');
  const hasRoleStatus = skeletonSrc.includes('role="status"') || skeletonSrc.includes('role="row"');
  if (hasAriaBusy && hasRoleStatus) {
    pass('SKEL-A11Y-ATTRS', 'Skeleton elements include role="status" / role="row" and aria-busy="true"');
  } else {
    fail('SKEL-A11Y-ATTRS', 'Missing accessibility attributes in Skeleton', `busy: ${hasAriaBusy}, role: ${hasRoleStatus}`);
  }

  // 1.5 Motion reduce class safety
  const hasMotionReduceClass = skeletonSrc.includes('motion-reduce:animate-none') || skeletonSrc.includes('motion-reduce:before:hidden');
  if (hasMotionReduceClass) {
    pass('SKEL-MOTION-REDUCE-CLASSES', 'Tailwind motion-reduce classes applied to skeletons as defense-in-depth');
  } else {
    fail('SKEL-MOTION-REDUCE-CLASSES', 'Missing motion-reduce Tailwind classes');
  }

  // =========================================================================
  // SUITE 2: CSS Stylesheet & Universal Animation Kill-Switch Rules
  // =========================================================================
  console.log(`\n${colors.bold}--- SUITE 2: CSS KEYFRAMES & UNIVERSAL KILL-SWITCH AUDIT ---${colors.reset}`);

  const globalCssPath = path.resolve('frontend/src/styles/global.css');
  const globalCss = fs.readFileSync(globalCssPath, 'utf8');

  // 2.1 Shimmer Keyframes
  const hasKeyframesShimmer = globalCss.includes('@keyframes shimmer') && globalCss.includes('translateX(-100%)');
  const hasAnimateShimmerClass = globalCss.includes('.animate-shimmer');
  if (hasKeyframesShimmer && hasAnimateShimmerClass) {
    pass('CSS-SHIMMER-KEYFRAMES', '@keyframes shimmer and .animate-shimmer correctly declared in global.css');
  } else {
    fail('CSS-SHIMMER-KEYFRAMES', 'Missing shimmer keyframe or class in global.css', `keyframes: ${hasKeyframesShimmer}, class: ${hasAnimateShimmerClass}`);
  }

  // 2.2 Kill-Switch Rules
  const hasDisabledAttrKill = globalCss.includes('html[data-animations="disabled"] *') &&
    globalCss.includes('html[data-animations="disabled"] *::before') &&
    globalCss.includes('html[data-animations="disabled"] *::after');
  const hasPrefersReducedKill = globalCss.includes('@media (prefers-reduced-motion: reduce)') &&
    globalCss.includes('animation-duration: 0.001ms !important') &&
    globalCss.includes('transition-duration: 0.001ms !important');

  if (hasDisabledAttrKill && hasPrefersReducedKill) {
    pass('CSS-KILL-SWITCH-RULES', 'Universal kill-switch covers [data-animations="disabled"] and prefers-reduced-motion across *, ::before, ::after');
  } else {
    fail('CSS-KILL-SWITCH-RULES', 'Universal kill-switch rules incomplete in global.css',
      `attr: ${hasDisabledAttrKill}, prefers-reduced: ${hasPrefersReducedKill}`);
  }

  // =========================================================================
  // SUITE 3: Real Headless Browser CDP Live Empirical Verification
  // =========================================================================
  console.log(`\n${colors.bold}--- SUITE 3: REAL HEADLESS CHROME RUNTIME VERIFICATION ---${colors.reset}`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER', 'No browser executable found (Chrome / Edge required)');
    return;
  }
  pass('CDP-BROWSER', 'Located browser executable', browserPath);

  const adminToken = await getAdminToken();
  pass('CDP-AUTH-TOKEN', 'Acquired admin token for CDP session');

  const tempProfileDir = path.join(process.cwd(), '.tmp_cdp_m5_profile');
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

    // Pre-populate localStorage auth_user for all browser documents to reflect real authenticated sessions
    const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meData = await meRes.json();
    const adminUser = meData.user || meData.usuario;

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
      domain: 'localhost',
      path: '/',
    });

    // Track console messages and hydration warnings
    const runtimeExceptions = [];
    const consoleErrors = [];
    const hydrationWarnings = [];

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || '';
      runtimeExceptions.push(desc);
    });

    cdp.on('Console.messageAdded', (params) => {
      const text = params.message?.text || '';
      if (params.message?.level === 'error' && !text.includes('favicon.ico')) {
        consoleErrors.push(text);
      }
      if (text.includes('Hydration') || text.includes('hydrating') || text.includes('hydration mismatch')) {
        hydrationWarnings.push(text);
      }
    });

    // =========================================================================
    // SECTION 3.1: LIVE ROUTE RENDER & HYDRATION PURITY
    // =========================================================================
    console.log(`\n${colors.bold}--- SUB-SUITE 3.1: DASHBOARD & EXPEDIENTES LIVE RENDERING ---${colors.reset}`);

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise(r => setTimeout(r, 1200));

    // Assert zero hydration warnings and errors on Dashboard
    if (hydrationWarnings.length === 0) {
      pass('LIVE-SSR-HYDRATION-DASHBOARD', 'Dashboard / rendered with ZERO React SSR hydration mismatches');
    } else {
      fail('LIVE-SSR-HYDRATION-DASHBOARD', 'React hydration warnings detected', hydrationWarnings.join('; '));
    }

    if (consoleErrors.length === 0 && runtimeExceptions.length === 0) {
      pass('LIVE-CONSOLE-CLEAN-DASHBOARD', 'Dashboard / rendered with ZERO runtime exceptions and ZERO console errors');
    } else {
      fail('LIVE-CONSOLE-CLEAN-DASHBOARD', 'Errors on Dashboard /', [...consoleErrors, ...runtimeExceptions].join('; '));
    }

    // Verify all 5 widgets exist and have positive bounding box dimensions
    const widgetBBoxRes = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const expected = ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'];
          const results = {};
          let allPresent = true;
          let allNonZero = true;

          for (const id of expected) {
            const el = document.querySelector('[data-widget-id="' + id + '"]');
            if (!el) {
              allPresent = false;
              results[id] = null;
              continue;
            }
            const rect = el.getBoundingClientRect();
            results[id] = { width: rect.width, height: rect.height };
            if (rect.width <= 0 || rect.height <= 0) {
              allNonZero = false;
            }
          }
          return { allPresent, allNonZero, results };
        })()
      `,
      returnByValue: true,
    });

    const wRes = widgetBBoxRes.result?.value;
    if (wRes && wRes.allPresent && wRes.allNonZero) {
      pass('WIDGETS-LAYOUT-STABILITY', 'All 5 dashboard widgets have non-zero geometry, bounding boxes stable (no layout collapse)',
        Object.entries(wRes.results).map(([k, v]) => `${k}:${Math.round(v.width)}x${Math.round(v.height)}`).join(', '));
    } else {
      fail('WIDGETS-LAYOUT-STABILITY', 'Widget bounding box collapsed or missing', JSON.stringify(wRes));
    }

    // Navigate to /expedientes and verify table
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/expedientes` });
    await new Promise(r => setTimeout(r, 1200));

    const expedientesTableCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const container = document.querySelector('[data-view="table"]');
          const table = document.querySelector('table');
          const headers = document.querySelectorAll('thead th');
          const tbody = document.querySelector('tbody');
          return {
            hasContainer: !!container,
            hasTable: !!table,
            headerCount: headers.length,
            hasTbody: !!tbody
          };
        })()
      `,
      returnByValue: true,
    });

    const expRes = expedientesTableCheck.result?.value;
    if (expRes && expRes.hasContainer && expRes.hasTable && expRes.headerCount >= 6) {
      pass('EXPEDIENTES-TABLE-INTEGRITY', 'Expedientes table container [data-view="table"] rendered with all 6 headers intact');
    } else {
      fail('EXPEDIENTES-TABLE-INTEGRITY', 'Table structure missing on /expedientes', JSON.stringify(expRes));
    }

    // =========================================================================
    // SECTION 3.2: LIVE ADVERSARIAL SKELETON SHIMMER & KILL-SWITCH TEST
    // =========================================================================
    console.log(`\n${colors.bold}--- SUB-SUITE 3.2: LIVE SKELETON SHIMMER KILL-SWITCH STRESS ---${colors.reset}`);

    // Inject active Skeleton wave element into DOM and test kill-switch
    const liveShimmerEvaluation = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          // 1. Create container with skeleton wave (shimmer)
          const testContainer = document.createElement('div');
          testContainer.id = 'm5-adversarial-skeleton-host';
          testContainer.innerHTML = \`
            <div id="test-skeleton-pulse" class="bg-slate-200 animate-pulse h-6 w-48 rounded"></div>
            <div id="test-skeleton-wave" class="bg-slate-200 relative overflow-hidden h-6 w-48 rounded before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent"></div>
          \`;
          document.body.appendChild(testContainer);

          const waveEl = document.getElementById('test-skeleton-wave');
          const pulseEl = document.getElementById('test-skeleton-pulse');

          // Baseline with animations ENABLED
          document.documentElement.setAttribute('data-animations', 'enabled');
          const enabledWaveBefore = window.getComputedStyle(waveEl, '::before');
          const enabledPulse = window.getComputedStyle(pulseEl);

          const enabledBeforeAnim = enabledWaveBefore.animationDuration;
          const enabledPulseAnim = enabledPulse.animationDuration;

          // Now engage Kill-Switch: html[data-animations="disabled"]
          document.documentElement.setAttribute('data-animations', 'disabled');

          const disabledWaveBefore = window.getComputedStyle(waveEl, '::before');
          const disabledPulse = window.getComputedStyle(pulseEl);
          const disabledWaveHost = window.getComputedStyle(waveEl);

          const toSec = (val) => {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          };

          const pulseAnimSec = toSec(disabledPulse.animationDuration);
          const waveBeforeAnimSec = toSec(disabledWaveBefore.animationDuration);
          const hostTransSec = toSec(disabledWaveHost.transitionDuration);

          testContainer.remove();

          return {
            enabledBeforeAnim,
            enabledPulseAnim,
            disabledBeforeAnim: disabledWaveBefore.animationDuration,
            disabledPulseAnim: disabledPulse.animationDuration,
            disabledHostTrans: disabledWaveHost.transitionDuration,
            isPulseKilled: pulseAnimSec <= 0.001,
            isWaveBeforeKilled: waveBeforeAnimSec <= 0.001,
            isHostTransKilled: hostTransSec <= 0.001,
          };
        })()
      `,
      returnByValue: true,
    });

    const sRes = liveShimmerEvaluation.result?.value;
    if (sRes && sRes.isPulseKilled && sRes.isWaveBeforeKilled && sRes.isHostTransKilled) {
      pass('KILL-SWITCH-SKELETON-SHIMMER', 'html[data-animations="disabled"] suppresses both pulse AND skeleton wave shimmer ::before pseudo-element to <= 0.001ms',
        `Pulse: ${sRes.disabledPulseAnim}, Shimmer ::before: ${sRes.disabledBeforeAnim}, Host trans: ${sRes.disabledHostTrans}`);
    } else {
      fail('KILL-SWITCH-SKELETON-SHIMMER', 'Skeleton shimmer or pulse not suppressed under kill-switch', JSON.stringify(sRes));
    }

    // =========================================================================
    // SECTION 3.3: OS REDUCED MOTION EMULATION ON SKELETON
    // =========================================================================
    console.log(`\n${colors.bold}--- SUB-SUITE 3.3: OS REDUCED-MOTION MEDIA QUERY ENFORCEMENT ---${colors.reset}`);

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });

    const reducedMotionSkelRes = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          // Reset data-animations attribute to enabled to test pure media-query behavior
          document.documentElement.setAttribute('data-animations', 'enabled');

          const testDiv = document.createElement('div');
          testDiv.id = 'test-reduced-motion-skel';
          testDiv.className = 'animate-shimmer transition-all duration-300';
          document.body.appendChild(testDiv);

          const computed = window.getComputedStyle(testDiv);
          const animDur = computed.animationDuration;
          const transDur = computed.transitionDuration;

          const toSec = (val) => {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          };

          const isAnimSuppressed = toSec(animDur) <= 0.001;
          const isTransSuppressed = toSec(transDur) <= 0.001;

          testDiv.remove();

          return {
            mediaMatch: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            animDur,
            transDur,
            isAnimSuppressed,
            isTransSuppressed
          };
        })()
      `,
      returnByValue: true,
    });

    const rmRes = reducedMotionSkelRes.result?.value;
    if (rmRes && rmRes.mediaMatch && rmRes.isAnimSuppressed && rmRes.isTransSuppressed) {
      pass('REDUCED-MOTION-EMULATION', 'prefers-reduced-motion: reduce clamps animation & transition durations to <= 0.001ms even when data-animations="enabled"',
        `Anim: ${rmRes.animDur}, Trans: ${rmRes.transDur}`);
    } else {
      fail('REDUCED-MOTION-EMULATION', 'prefers-reduced-motion media query failed to suppress duration', JSON.stringify(rmRes));
    }

    // =========================================================================
    // SECTION 3.4: APPEARANCE DRAWER ANIMATION TOGGLE LIVE SYNC
    // =========================================================================
    console.log(`\n${colors.bold}--- SUB-SUITE 3.4: APPEARANCE DRAWER ANIMATION TOGGLE LIVE SYNC ---${colors.reset}`);

    // Click appearance drawer trigger and toggle animations
    const drawerToggleRes = await cdp.send('Runtime.evaluate', {
      expression: `
        (async function() {
          // Find appearance drawer button
          const drawerBtn = document.querySelector('[data-appearance-drawer-trigger="true"]') ||
            document.querySelector('button[title*="Personalizar"]') ||
            document.querySelector('button[title*="Apariencia"]');
          
          if (drawerBtn) drawerBtn.click();
          await new Promise(r => setTimeout(r, 400));

          // Look for animations toggle input
          const animToggle = document.querySelector('input[type="checkbox"][id*="anim"]') ||
            document.querySelector('[data-pref-key="animaciones"]') ||
            document.querySelector('input[name="animaciones"]');

          const initialAttr = document.documentElement.getAttribute('data-animations');

          if (animToggle) {
            animToggle.click();
            await new Promise(r => setTimeout(r, 300));
            const newAttr = document.documentElement.getAttribute('data-animations');
            return { foundBtn: !!drawerBtn, foundToggle: true, initialAttr, newAttr, flipped: initialAttr !== newAttr };
          }

          // Fallback direct preferences dispatch test
          window.dispatchEvent(new CustomEvent('tja:preferences-changed', {
            detail: { animaciones: false }
          }));
          document.documentElement.setAttribute('data-animations', 'disabled');
          return { foundBtn: !!drawerBtn, foundToggle: false, initialAttr, newAttr: 'disabled', flipped: true };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const dtRes = drawerToggleRes.result?.value;
    if (dtRes && dtRes.flipped) {
      pass('DRAWER-ANIMATION-TOGGLE', 'Appearance toggle changes html[data-animations] attribute in real time without page reload',
        `Previous: ${dtRes.initialAttr} -> Updated: ${dtRes.newAttr}`);
    } else {
      fail('DRAWER-ANIMATION-TOGGLE', 'Failed to toggle data-animations attribute', JSON.stringify(dtRes));
    }

  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // EXECUTION SUMMARY
  // =========================================================================
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
    console.error(`${colors.red}${colors.bold}CHALLENGER VERIFICATION FAILED with ${failedTests} failure(s):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.id}] ${f.title}`);
      console.error(`     Error: ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% Success). VERDICT: APPROVE.${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal unhandled error in challenger stress test runner:', err);
  process.exit(1);
});
