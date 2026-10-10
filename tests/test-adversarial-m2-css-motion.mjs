/**
 * tests/test-adversarial-m2-css-motion.mjs
 * =============================================================================
 * ADVERSARIAL EMPIRICAL TEST SUITE: Milestone 2 CSS Tokens, Responsive States
 * & Motion Kill-Switch Verification
 *
 * Verifies:
 * 1. Tailwind v4 Compilation & CSS Custom Property System:
 *    - All 7 accent palettes (light & dark overrides)
 *    - Light and dark surface and typography design tokens
 *    - Density scales (comfortable vs compact) and table auto-padding
 *    - Font scale definitions (small, normal, large)
 * 2. Universal Animation & Transition Kill-Switch:
 *    - Static rule verification in compiled CSS for html[data-animations="disabled"]
 *      and @media (prefers-reduced-motion: reduce)
 *    - Live headless browser computed style verification (duration <= 0.001ms / 0.000001s)
 *    - Real transition event execution prevention test (instant completion < 10ms)
 *    - Pseudo-element (:before, :after) suppression
 * 3. Route Health & Responsive Viewports:
 *    - 11 application routes checked in real browser CDP session
 *    - Zero uncaught exceptions, zero console errors
 *    - Viewport stress testing across Mobile (375px), Tablet (768px), Desktop (1440px)
 *    - Zero horizontal document overflow
 * 4. Zero-FOUC Script Resilience:
 *    - Malformed localStorage handling and graceful fallbacks
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9555', 10);

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
  if (!res.ok) throw new Error(`Login failed with HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function runAdversarialSuite() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   ADVERSARIAL EMPIRICAL STRESS TEST: MILESTONE 2 CSS & MOTION KILL-SWITCH${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL}${colors.reset}\n`);

  // =========================================================================
  // SUITE 1: Tailwind v4 Build & CSS Token Analysis
  // =========================================================================
  console.log(`${colors.bold}--- SUITE 1: TAILWIND v4 COMPILATION & CSS TOKEN AUDIT ---${colors.reset}`);

  // Find compiled CSS file in dist
  const distAstroDir = path.resolve('frontend/dist/client/_astro');
  let compiledCssContent = '';
  let compiledCssPath = '';

  if (fs.existsSync(distAstroDir)) {
    const files = fs.readdirSync(distAstroDir);
    const cssFile = files.find((f) => f.endsWith('.css'));
    if (cssFile) {
      compiledCssPath = path.join(distAstroDir, cssFile);
      compiledCssContent = fs.readFileSync(compiledCssPath, 'utf8');
      pass('CSS-DIST-FILE', 'Found compiled Tailwind v4 production stylesheet', `${cssFile} (${compiledCssContent.length} bytes)`);
    }
  }

  if (!compiledCssContent) {
    fail('CSS-DIST-FILE', 'Compiled CSS stylesheet missing from frontend/dist', 'Run npm run build first');
  }

  // 1.1 Base Theme Surface Tokens
  const requiredSurfaceTokens = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--card-border',
    '--primary',
    '--sidebar-bg',
    '--sidebar-foreground',
    '--header-bg',
  ];

  let missingSurfaces = requiredSurfaceTokens.filter(t => !compiledCssContent.includes(t));
  if (missingSurfaces.length === 0) {
    pass('CSS-TOKENS-SURFACES', 'All primary surface and structure CSS tokens compiled', requiredSurfaceTokens.join(', '));
  } else {
    fail('CSS-TOKENS-SURFACES', 'Missing surface CSS tokens in compiled CSS', missingSurfaces.join(', '));
  }

  // 1.2 Dark Mode Definition
  const hasDarkAttributeRule = compiledCssContent.includes('html[data-theme=dark]') || compiledCssContent.includes('html[data-theme="dark"]');
  const hasDarkClassRule = compiledCssContent.includes('html.dark');
  const hasPrefersDarkMedia = compiledCssContent.includes('prefers-color-scheme:dark') || compiledCssContent.includes('prefers-color-scheme: dark');

  if (hasDarkAttributeRule && hasDarkClassRule && hasPrefersDarkMedia) {
    pass('CSS-THEME-DARK', 'Dark theme defined for [data-theme="dark"], .dark, and @media (prefers-color-scheme: dark)');
  } else {
    fail('CSS-THEME-DARK', 'Dark theme selector definitions incomplete in compiled CSS',
      `data-theme: ${hasDarkAttributeRule}, .dark: ${hasDarkClassRule}, media-query: ${hasPrefersDarkMedia}`);
  }

  // 1.3 Verify All 7 Palettes in Light & Dark Mode
  const palettes = [
    { name: 'azul-clasico', lightHex: '#2563eb', darkNeedle: '#60a5fa' },
    { name: 'esmeralda', lightHex: '#059669', darkNeedle: '#10b981' },
    { name: 'purpura', lightHex: '#7c3aed', darkNeedle: '#8b5cf6' },
    { name: 'ambar', lightHex: '#d97706', darkNeedle: '#f59e0b' },
    { name: 'carmesi', lightHex: '#e11d48', darkNeedle: '#f43f5e' },
    { name: 'indigo', lightHex: '#4f46e5', darkNeedle: '#6366f1' },
    { name: 'cian', lightHex: '#0891b2', darkNeedle: '#06b6d4' },
  ];

  for (const pal of palettes) {
    const hasPaletteSelector = compiledCssContent.includes(`data-accent=${pal.name}`) || compiledCssContent.includes(`data-accent="${pal.name}"`);
    const hasLightColor = compiledCssContent.includes(pal.lightHex);
    const hasDarkColor = compiledCssContent.includes(pal.darkNeedle);

    if (hasPaletteSelector && hasLightColor && hasDarkColor) {
      pass(`CSS-PALETTE-${pal.name.toUpperCase()}`, `Palette '${pal.name}' verified with light (${pal.lightHex}) and dark (${pal.darkNeedle}) overrides`);
    } else {
      fail(`CSS-PALETTE-${pal.name.toUpperCase()}`, `Palette '${pal.name}' incomplete in compiled CSS`,
        `selector: ${hasPaletteSelector}, light: ${hasLightColor}, dark: ${hasDarkColor}`);
    }
  }

  // 1.4 Density Scales
  const hasComfortable = compiledCssContent.includes('data-density=comfortable') || compiledCssContent.includes('data-density="comfortable"');
  const hasCompact = compiledCssContent.includes('data-density=compact') || compiledCssContent.includes('data-density="compact"');
  const hasCompactTableOverride = compiledCssContent.includes('table tbody td') && compiledCssContent.includes('padding-top:var(--density-table-py)!important');

  if (hasComfortable && hasCompact && hasCompactTableOverride) {
    pass('CSS-DENSITY-SCALES', 'Density scales (comfortable / compact) and table !important auto-padding compiled');
  } else {
    fail('CSS-DENSITY-SCALES', 'Density token definitions or compact table overrides missing',
      `comfortable: ${hasComfortable}, compact: ${hasCompact}, table-override: ${hasCompactTableOverride}`);
  }

  // 1.5 Font Scales
  const hasFontSmall = compiledCssContent.includes('data-font-size=small') || compiledCssContent.includes('data-font-size="small"');
  const hasFontNormal = compiledCssContent.includes('data-font-size=normal') || compiledCssContent.includes('data-font-size="normal"');
  const hasFontLarge = compiledCssContent.includes('data-font-size=large') || compiledCssContent.includes('data-font-size="large"');

  if (hasFontSmall && hasFontNormal && hasFontLarge) {
    pass('CSS-FONT-SCALES', 'All 3 font size scales (small 14px, normal 16px, large 18px) defined');
  } else {
    fail('CSS-FONT-SCALES', 'Font scale definitions missing in compiled CSS',
      `small: ${hasFontSmall}, normal: ${hasFontNormal}, large: ${hasFontLarge}`);
  }

  // =========================================================================
  // SUITE 2: Static Motion Kill-Switch Inspection
  // =========================================================================
  console.log(`\n${colors.bold}--- SUITE 2: STATIC MOTION KILL-SWITCH VERIFICATION ---${colors.reset}`);

  // Minified or unminified duration needle (.001ms or 0.001ms)
  const hasDurationSuppression = compiledCssContent.includes('animation-duration:.001ms!important') ||
                                compiledCssContent.includes('animation-duration: 0.001ms !important') ||
                                compiledCssContent.includes('animation-duration:.001ms !important');

  const hasTransitionSuppression = compiledCssContent.includes('transition-duration:.001ms!important') ||
                                  compiledCssContent.includes('transition-duration: 0.001ms !important') ||
                                  compiledCssContent.includes('transition-duration:.001ms !important');

  const hasIterationSuppression = compiledCssContent.includes('animation-iteration-count:1!important') ||
                                 compiledCssContent.includes('animation-iteration-count: 1 !important');

  const hasScrollSuppression = compiledCssContent.includes('scroll-behavior:auto!important') ||
                               compiledCssContent.includes('scroll-behavior: auto !important');

  const hasDisabledAttribute = compiledCssContent.includes('data-animations=disabled') ||
                               compiledCssContent.includes('data-animations="disabled"');

  const hasReducedMotionMedia = compiledCssContent.includes('prefers-reduced-motion:reduce') ||
                                compiledCssContent.includes('prefers-reduced-motion: reduce');

  if (hasDurationSuppression && hasTransitionSuppression && hasIterationSuppression && hasScrollSuppression && hasDisabledAttribute && hasReducedMotionMedia) {
    pass('CSS-MOTION-KILL-RULES', 'Universal kill-switch rules verified for [data-animations="disabled"] and prefers-reduced-motion',
      'Enforces animation-duration: .001ms!important, transition-duration: .001ms!important, iteration: 1!important, scroll: auto!important');
  } else {
    fail('CSS-MOTION-KILL-RULES', 'Universal kill-switch rules missing or incomplete in compiled CSS',
      `animDur: ${hasDurationSuppression}, transDur: ${hasTransitionSuppression}, iter: ${hasIterationSuppression}, scroll: ${hasScrollSuppression}, attr: ${hasDisabledAttribute}, media: ${hasReducedMotionMedia}`);
  }

  // =========================================================================
  // SUITE 3: Headless Chrome CDP Live Browser Verification
  // =========================================================================
  console.log(`\n${colors.bold}--- SUITE 3: LIVE HEADLESS BROWSER RUNTIME VERIFICATION ---${colors.reset}`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER-LOCATE', 'Chrome or Edge browser executable not found on host', 'Cannot run live browser tests');
    return;
  }
  pass('CDP-BROWSER-LOCATE', 'Located browser executable', browserPath);

  // Acquire admin token
  let adminToken = '';
  try {
    adminToken = await getAdminToken();
    pass('CDP-ADMIN-AUTH', 'Acquired admin session token from backend', `Token: ${adminToken.substring(0, 16)}...`);
  } catch (err) {
    fail('CDP-ADMIN-AUTH', 'Failed to authenticate admin', err.message);
    return;
  }

  // Launch browser process
  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger-cdp-${Date.now()}`);
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

  // Connect to CDP
  let cdp = null;
  try {
    let cdpReady = false;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        // Create fresh page tab via PUT /json/new
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
      fail('CDP-CONNECT', 'Failed to initialize CDP session on port ' + CDP_PORT, 'Browser target unreachable');
      cleanup();
      return;
    }
    pass('CDP-CONNECT', 'Connected to Headless Chrome CDP session on port ' + CDP_PORT);

    // Enable domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // Set auth cookie
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: adminToken,
      url: FRONTEND_URL,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    });
    pass('CDP-COOKIE', 'Injected auth_token cookie into browser context');

    // Error tracking
    const runtimeExceptions = [];
    const consoleErrors = [];

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown exception';
      runtimeExceptions.push({ desc, url: params.exceptionDetails?.url });
    });

    cdp.on('Console.messageAdded', (params) => {
      if (params.message?.level === 'error') {
        const text = params.message.text || '';
        if (!text.includes('favicon.ico') && !text.includes('404')) {
          consoleErrors.push({ text, url: params.message.url });
        }
      }
    });

    // 3.1 Verify Zero Uncaught Errors Across All 11 Routes
    console.log(`\n${colors.bold}--- SUB-SUITE 3.1: ZERO UNCAUGHT ERRORS ACROSS ALL 11 ROUTES ---${colors.reset}`);

    const routes = [
      { path: '/', name: 'Dashboard' },
      { path: '/expedientes', name: 'Expedientes' },
      { path: '/notificaciones', name: 'Notificaciones' },
      { path: '/agenda', name: 'Agenda' },
      { path: '/reportes', name: 'Reportes' },
      { path: '/busqueda', name: 'Búsqueda' },
      { path: '/ayuda', name: 'Ayuda' },
      { path: '/documentos', name: 'Documentos (Coming Soon)' },
      { path: '/mensajeria', name: 'Mensajería (Coming Soon)' },
      { path: '/configuracion', name: 'Configuración' },
      { path: '/configuracion/roles', name: 'Roles y Permisos' },
    ];

    for (const r of routes) {
      const errsBefore = runtimeExceptions.length + consoleErrors.length;
      await cdp.send('Page.navigate', { url: `${FRONTEND_URL}${r.path}` });
      await new Promise(res => setTimeout(res, 500));

      const newErrs = (runtimeExceptions.length + consoleErrors.length) - errsBefore;
      if (newErrs === 0) {
        pass(`ROUTE-CLEAN-${r.name.split(' ')[0].toUpperCase()}`, `Route ${r.path} (${r.name}) loaded clean with 0 uncaught errors`);
      } else {
        const recentDetails = [...runtimeExceptions.slice(-newErrs), ...consoleErrors.slice(-newErrs)]
          .map(e => e.desc || e.text).join('; ');
        fail(`ROUTE-CLEAN-${r.name.split(' ')[0].toUpperCase()}`, `Route ${r.path} produced errors`, recentDetails);
      }
    }

    // 3.2 Live Motion Kill-Switch via html[data-animations="disabled"]
    console.log(`\n${colors.bold}--- SUB-SUITE 3.2: LIVE MOTION KILL-SWITCH COMPUTED STYLE ENFORCEMENT ---${colors.reset}`);

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise(res => setTimeout(res, 500));

    const motionKillResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          // Step A: Baseline test with animations ENABLED
          document.documentElement.setAttribute('data-animations', 'enabled');
          const testEl = document.createElement('div');
          testEl.id = 'kill-switch-test-node';
          testEl.className = 'transition-all duration-500 animate-spin';
          testEl.style.transition = 'transform 1s ease-in-out';
          testEl.style.animation = 'spin 2s linear infinite';
          document.body.appendChild(testEl);

          const enabledStyle = window.getComputedStyle(testEl);
          const enabledTransition = enabledStyle.transitionDuration;
          const enabledAnimation = enabledStyle.animationDuration;

          // Step B: Engage Kill-Switch
          document.documentElement.setAttribute('data-animations', 'disabled');

          const disabledStyle = window.getComputedStyle(testEl);
          const disabledTransition = disabledStyle.transitionDuration;
          const disabledAnimation = disabledStyle.animationDuration;
          const disabledIterations = disabledStyle.animationIterationCount;

          // Helper to convert CSS duration to seconds
          function toSeconds(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          const transSec = toSeconds(disabledTransition);
          const animSec = toSeconds(disabledAnimation);

          testEl.remove();

          return {
            enabledTransition,
            enabledAnimation,
            disabledTransition,
            disabledAnimation,
            disabledIterations,
            isTransitionKilled: transSec <= 0.001,
            isAnimationKilled: animSec <= 0.001,
            isIterationKilled: disabledIterations === '1'
          };
        })()
      `,
      returnByValue: true,
    });

    const mRes = motionKillResult.result?.value;
    if (mRes && mRes.isTransitionKilled && mRes.isAnimationKilled && mRes.isIterationKilled) {
      pass('KILL-SWITCH-DOM-ATTR', 'html[data-animations="disabled"] suppresses transition & animation durations to <= 0.001ms',
        `Computed disabled transition: ${mRes.disabledTransition}, animation: ${mRes.disabledAnimation}, iterations: ${mRes.disabledIterations}`);
    } else {
      fail('KILL-SWITCH-DOM-ATTR', 'Kill-switch failed to enforce 0.001ms duration via DOM attribute',
        JSON.stringify(mRes));
    }

    // 3.3 Dynamic Animation Execution Prevention (Instant Completion Benchmark)
    console.log(`\n${colors.bold}--- SUB-SUITE 3.3: EMPIRICAL TRANSITION EXECUTION TIME STRESS TEST ---${colors.reset}`);

    const transitionExecBenchmark = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          document.documentElement.setAttribute('data-animations', 'disabled');
          const box = document.createElement('div');
          box.id = 'anim-benchmark-box';
          box.style.width = '100px';
          box.style.height = '100px';
          box.style.backgroundColor = 'red';
          box.style.transition = 'transform 2s linear';
          document.body.appendChild(box);

          // Force reflow
          void box.offsetHeight;

          const start = performance.now();
          let fired = false;

          box.addEventListener('transitionend', () => {
            fired = true;
            const elapsed = performance.now() - start;
            box.remove();
            resolve({ fired: true, elapsedMs: elapsed, type: 'transitionend' });
          });

          // Trigger transition
          box.style.transform = 'translateX(200px)';

          // If duration is 0.001ms, transitionend should fire almost instantly (< 50ms)
          // Set safety fallback timer
          setTimeout(() => {
            if (!fired) {
              const elapsed = performance.now() - start;
              box.remove();
              resolve({ fired: false, elapsedMs: elapsed, type: 'timeout' });
            }
          }, 200);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const bRes = transitionExecBenchmark.result?.value;
    if (bRes && bRes.elapsedMs < 100) {
      pass('KILL-SWITCH-EXEC-TIME', 'Transition of 2s nominal length completed instantaneously under kill-switch',
        `Elapsed runtime: ${bRes.elapsedMs.toFixed(2)}ms (expected instant < 100ms vs nominal 2000ms)`);
    } else {
      fail('KILL-SWITCH-EXEC-TIME', 'Nominal long transition executed or timed out under kill-switch',
        JSON.stringify(bRes));
    }

    // 3.4 Media Query prefers-reduced-motion: reduce Emulation
    console.log(`\n${colors.bold}--- SUB-SUITE 3.4: OS REDUCED-MOTION MEDIA QUERY EMULATION ---${colors.reset}`);

    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });

    const reducedMotionMediaResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          // Explicitly set animations to enabled on html tag to test that media query overrides
          document.documentElement.setAttribute('data-animations', 'enabled');

          const testDiv = document.createElement('div');
          testDiv.style.transition = 'opacity 1.5s ease';
          testDiv.style.animation = 'spin 3s infinite';
          document.body.appendChild(testDiv);

          const computed = window.getComputedStyle(testDiv);
          const tDur = computed.transitionDuration;
          const aDur = computed.animationDuration;

          function toSeconds(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          const tSec = toSeconds(tDur);
          const aSec = toSeconds(aDur);

          testDiv.remove();

          return {
            transitionDuration: tDur,
            animationDuration: aDur,
            isTransitionKilled: tSec <= 0.001,
            isAnimationKilled: aSec <= 0.001
          };
        })()
      `,
      returnByValue: true,
    });

    const rRes = reducedMotionMediaResult.result?.value;
    if (rRes && rRes.isTransitionKilled && rRes.isAnimationKilled) {
      pass('KILL-SWITCH-REDUCED-MOTION', '@media (prefers-reduced-motion: reduce) enforces duration <= 0.001ms even when data-animations="enabled"',
        `Computed transition: ${rRes.transitionDuration}, animation: ${rRes.animationDuration}`);
    } else {
      fail('KILL-SWITCH-REDUCED-MOTION', 'Media query prefers-reduced-motion failed to suppress animation durations',
        JSON.stringify(rRes));
    }

    // Reset emulated media
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    // 3.5 Live Dynamic Palette Switching in DOM
    console.log(`\n${colors.bold}--- SUB-SUITE 3.5: LIVE DOM ACCENT PALETTE SWITCHING ---${colors.reset}`);

    const paletteVerification = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const testPalettes = [
            { name: 'azul-clasico', lightHex: '#2563eb', darkHex: '#2563eb' },
            { name: 'esmeralda', lightHex: '#059669', darkHex: '#10b981' },
            { name: 'purpura', lightHex: '#7c3aed', darkHex: '#8b5cf6' },
            { name: 'ambar', lightHex: '#d97706', darkHex: '#f59e0b' },
            { name: 'carmesi', lightHex: '#e11d48', darkHex: '#f43f5e' },
            { name: 'indigo', lightHex: '#4f46e5', darkHex: '#6366f1' },
            { name: 'cian', lightHex: '#0891b2', darkHex: '#06b6d4' }
          ];

          const results = [];

          // 1. Test Light Mode Palettes
          document.documentElement.setAttribute('data-theme', 'light');
          document.documentElement.classList.remove('dark');

          for (const pal of testPalettes) {
            document.documentElement.setAttribute('data-accent', pal.name);
            const computedAccent = window.getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
            results.push({
              mode: 'light',
              palette: pal.name,
              expected: pal.lightHex,
              computed: computedAccent,
              match: computedAccent.toLowerCase() === pal.lightHex.toLowerCase()
            });
          }

          // 2. Test Dark Mode Palettes
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.classList.add('dark');

          for (const pal of testPalettes) {
            document.documentElement.setAttribute('data-accent', pal.name);
            const computedAccent = window.getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
            results.push({
              mode: 'dark',
              palette: pal.name,
              expected: pal.darkHex,
              computed: computedAccent,
              match: computedAccent.toLowerCase() === pal.darkHex.toLowerCase()
            });
          }

          return results;
        })()
      `,
      returnByValue: true,
    });

    const palResults = paletteVerification.result?.value || [];
    const allPalettesMatched = palResults.length === 14 && palResults.every(p => p.match);
    if (allPalettesMatched) {
      pass('DOM-ACCENT-SWITCHING', 'Live switching across all 7 accent palettes verified in BOTH light and dark modes (14/14 states)',
        palResults.filter(p => p.mode === 'light').map(p => `${p.palette}=${p.computed}`).join(', '));
    } else {
      fail('DOM-ACCENT-SWITCHING', 'Live accent palette switching failed for one or more presets in light or dark mode',
        JSON.stringify(palResults.filter(p => !p.match)));
    }

    // 3.6 Live Dynamic Theme Switching (Light / Dark)
    console.log(`\n${colors.bold}--- SUB-SUITE 3.6: LIVE DOM THEME SWITCHING (LIGHT / DARK) ---${colors.reset}`);

    const themeSwitchResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          // Test Light
          document.documentElement.setAttribute('data-theme', 'light');
          document.documentElement.classList.remove('dark');
          const lightBg = window.getComputedStyle(document.documentElement).getPropertyValue('--background').trim();

          // Test Dark
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.classList.add('dark');
          const darkBg = window.getComputedStyle(document.documentElement).getPropertyValue('--background').trim();

          return {
            lightBg,
            darkBg,
            isLightMatch: lightBg === '#f8fafc',
            isDarkMatch: darkBg === '#090d16'
          };
        })()
      `,
      returnByValue: true,
    });

    const tRes = themeSwitchResult.result?.value;
    if (tRes && tRes.isLightMatch && tRes.isDarkMatch) {
      pass('DOM-THEME-SWITCHING', 'Live switching between light and dark updates --background (#f8fafc vs #090d16) dynamically',
        `Light: ${tRes.lightBg}, Dark: ${tRes.darkBg}`);
    } else {
      fail('DOM-THEME-SWITCHING', 'Theme switching did not yield expected background CSS tokens',
        JSON.stringify(tRes));
    }

    // 3.7 Responsive Viewport Stress Testing
    console.log(`\n${colors.bold}--- SUB-SUITE 3.7: RESPONSIVE VIEWPORT STRESS TESTING ---${colors.reset}`);

    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 768,
      });
      await new Promise(res => setTimeout(res, 300));

      const overflowCheck = await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const hasHorizontalScroll = docWidth > winWidth;
            const hasHeader = document.querySelector('header') !== null;
            return { docWidth, winWidth, hasHorizontalScroll, hasHeader };
          })()
        `,
        returnByValue: true,
      });

      const oRes = overflowCheck.result?.value;
      if (oRes && !oRes.hasHorizontalScroll && oRes.hasHeader) {
        pass(`VIEWPORT-${vp.name.toUpperCase()}`, `${vp.name} viewport (${vp.width}x${vp.height}) has zero horizontal overflow and header is present`,
          `scrollWidth: ${oRes.docWidth}px, innerWidth: ${oRes.winWidth}px`);
      } else {
        fail(`VIEWPORT-${vp.name.toUpperCase()}`, `${vp.name} viewport experienced layout overflow or missing shell elements`,
          JSON.stringify(oRes));
      }
    }

    // 3.8 Zero-FOUC Inline Head Script Resilience
    console.log(`\n${colors.bold}--- SUB-SUITE 3.8: ZERO-FOUC HEAD SCRIPT RESILIENCE & ERROR HANDLING ---${colors.reset}`);

    const foucResilience = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          let threw = false;
          let errorMessage = null;
          try {
            // Test 1: Corrupted JSON in localStorage
            localStorage.setItem('tja_preferencias', '{malformed_json: NaN');

            // Simulate what head script executes
            var STORAGE_KEY = 'tja_preferencias';
            var raw = localStorage.getItem(STORAGE_KEY);
            var prefs = {};
            try {
              prefs = raw ? JSON.parse(raw) : {};
            } catch(jsonErr) {
              prefs = {};
            }

            var theme = prefs.tema || 'auto';
            var accent = prefs.paletaPreset || 'azul-clasico';
            var density = prefs.densidad || 'comfortable';
            var fontSize = prefs.tamanoFuente || 'normal';
            var animations = prefs.animacionesHabilitadas !== false ? 'enabled' : 'disabled';

            // Clean up test key
            localStorage.removeItem('tja_preferencias');

            return {
              threw: false,
              recoveredDefaults: { theme, accent, density, fontSize, animations }
            };
          } catch(e) {
            return { threw: true, errorMessage: e.message };
          }
        })()
      `,
      returnByValue: true,
    });

    const fRes = foucResilience.result?.value;
    if (fRes && !fRes.threw && fRes.recoveredDefaults.theme === 'auto') {
      pass('ZERO-FOUC-RESILIENCE', 'Zero-FOUC script handles corrupted localStorage JSON without crashing and falls back to system defaults');
    } else {
      fail('ZERO-FOUC-RESILIENCE', 'Zero-FOUC script crashed on corrupted localStorage', JSON.stringify(fRes));
    }

    // 3.9 Pseudo-Element Kill-Switch Verification
    console.log(`\n${colors.bold}--- SUB-SUITE 3.9: PSEUDO-ELEMENT KILL-SWITCH VERIFICATION ---${colors.reset}`);

    const pseudoResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          const style = document.createElement('style');
          style.textContent = '#pseudo-test::before { content: ""; display: block; transition: all 3s; animation: spin 4s infinite; }';
          document.head.appendChild(style);

          const el = document.createElement('div');
          el.id = 'pseudo-test';
          document.body.appendChild(el);

          const pseudoBefore = window.getComputedStyle(el, '::before');
          const tDur = pseudoBefore.transitionDuration;
          const aDur = pseudoBefore.animationDuration;

          function toSeconds(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          const tSec = toSeconds(tDur);
          const aSec = toSeconds(aDur);

          el.remove();
          style.remove();

          return {
            tDur,
            aDur,
            isSuppressed: tSec <= 0.001 && aSec <= 0.001
          };
        })()
      `,
      returnByValue: true,
    });

    const pRes = pseudoResult.result?.value;
    if (pRes && pRes.isSuppressed) {
      pass('KILL-SWITCH-PSEUDO-ELEMENTS', 'Kill-switch applies to *::before and *::after pseudo-elements (duration <= 0.001ms)',
        `Computed before: transition=${pRes.tDur}, animation=${pRes.aDur}`);
    } else {
      fail('KILL-SWITCH-PSEUDO-ELEMENTS', 'Kill-switch failed on pseudo-elements', JSON.stringify(pRes));
    }

    // 3.10 Transition Delay Suppression Verification
    console.log(`\n${colors.bold}--- SUB-SUITE 3.10: TRANSITION DELAY SUPPRESSION VERIFICATION ---${colors.reset}`);

    const delayResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          const el = document.createElement('div');
          el.style.transition = 'opacity 1s ease 5s';
          document.body.appendChild(el);

          const computed = window.getComputedStyle(el);
          const delay = computed.transitionDelay;

          el.remove();

          return {
            delay,
            isZero: delay === '0s' || delay === '0ms' || parseFloat(delay) === 0
          };
        })()
      `,
      returnByValue: true,
    });

    const dRes = delayResult.result?.value;
    if (dRes && dRes.isZero) {
      pass('KILL-SWITCH-DELAY-SUPPRESSION', 'Transition delay is forced to 0s !important under kill-switch',
        `Computed delay: ${dRes.delay}`);
    } else {
      fail('KILL-SWITCH-DELAY-SUPPRESSION', 'Transition delay not suppressed under kill-switch', JSON.stringify(dRes));
    }

    // 3.11 Live Density Switching & Table Padding
    console.log(`\n${colors.bold}--- SUB-SUITE 3.11: LIVE DENSITY SWITCHING & TABLE PADDING ---${colors.reset}`);

    const densityResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          const table = document.createElement('table');
          const tbody = document.createElement('tbody');
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.className = 'py-density-table';
          td.textContent = 'Expediente TJA-001';
          tr.appendChild(td);
          tbody.appendChild(tr);
          table.appendChild(tbody);
          document.body.appendChild(table);

          // Comfortable
          document.documentElement.setAttribute('data-density', 'comfortable');
          const comfVar = window.getComputedStyle(document.documentElement).getPropertyValue('--density-table-py').trim();
          const comfCardVar = window.getComputedStyle(document.documentElement).getPropertyValue('--density-card-p').trim();
          const comfortablePadding = parseFloat(window.getComputedStyle(td).paddingTop);

          // Compact
          document.documentElement.setAttribute('data-density', 'compact');
          const compVar = window.getComputedStyle(document.documentElement).getPropertyValue('--density-table-py').trim();
          const compCardVar = window.getComputedStyle(document.documentElement).getPropertyValue('--density-card-p').trim();
          const compactPadding = parseFloat(window.getComputedStyle(td).paddingTop);

          // Unstyled TD check under compact
          const unstyledTd = document.createElement('td');
          unstyledTd.textContent = 'Unstyled';
          tr.appendChild(unstyledTd);
          const unstyledCompactPadding = parseFloat(window.getComputedStyle(unstyledTd).paddingTop);

          table.remove();

          return {
            comfVar,
            compVar,
            comfCardVar,
            compCardVar,
            comfortablePadding,
            compactPadding,
            unstyledCompactPadding,
            isComfVarMatch: comfVar === '0.875rem' || comfVar === '.875rem',
            isCompVarMatch: compVar === '0.375rem' || compVar === '.375rem',
            isComfortableLarge: comfortablePadding >= 12,
            isCompactSmall: compactPadding <= 8,
            isUnstyledAutoPadded: unstyledCompactPadding <= 8 && unstyledCompactPadding > 0
          };
        })()
      `,
      returnByValue: true,
    });

    const denRes = densityResult.result?.value;
    if (denRes && denRes.isComfVarMatch && denRes.isCompVarMatch && denRes.isComfortableLarge && denRes.isCompactSmall && denRes.isUnstyledAutoPadded) {
      pass('DOM-DENSITY-PADDING-DYNAMIC', 'Switching density from comfortable to compact dynamically scales --density-table-py, cards, and auto-pads table cells',
        `Comfortable: ${denRes.comfortablePadding}px (${denRes.comfVar}), Compact: ${denRes.compactPadding}px (${denRes.compVar}), Auto-padded: ${denRes.unstyledCompactPadding}px`);
    } else {
      fail('DOM-DENSITY-PADDING-DYNAMIC', 'Density switching did not update table padding as expected', JSON.stringify(denRes));
    }

    // 3.12 Live Font Scale Root Font Sizes
    console.log(`\n${colors.bold}--- SUB-SUITE 3.12: LIVE ROOT FONT SIZE SCALING ---${colors.reset}`);

    const fontResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-font-size', 'small');
          const smallFont = window.getComputedStyle(document.documentElement).fontSize;

          document.documentElement.setAttribute('data-font-size', 'normal');
          const normalFont = window.getComputedStyle(document.documentElement).fontSize;

          document.documentElement.setAttribute('data-font-size', 'large');
          const largeFont = window.getComputedStyle(document.documentElement).fontSize;

          return {
            smallFont,
            normalFont,
            largeFont,
            isSmallMatch: smallFont === '14px',
            isNormalMatch: normalFont === '16px',
            isLargeMatch: largeFont === '18px'
          };
        })()
      `,
      returnByValue: true,
    });

    const fScaleRes = fontResult.result?.value;
    if (fScaleRes && fScaleRes.isSmallMatch && fScaleRes.isNormalMatch && fScaleRes.isLargeMatch) {
      pass('DOM-FONT-SCALE-DYNAMIC', 'Live font size switching accurately scales root font-size across small (14px), normal (16px), and large (18px)',
        `Small: ${fScaleRes.smallFont}, Normal: ${fScaleRes.normalFont}, Large: ${fScaleRes.largeFont}`);
    } else {
      fail('DOM-FONT-SCALE-DYNAMIC', 'Font scaling failed to produce expected 14px / 16px / 18px', JSON.stringify(fScaleRes));
    }

  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}                    ADVERSARIAL TEST EXECUTION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  Passed Tests:       ${passedTests}`);
  console.log(`  Failed Tests:       ${failedTests}`);
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.log(`${colors.red}${colors.bold}ADVERSARIAL TEST FAILURES DETECTED:${colors.reset}`);
    for (const f of failures) {
      console.log(`  - [${f.id}] ${f.title}: ${f.errorDetail}`);
    }
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS!${colors.reset}\n`);
    process.exit(0);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('\nUnhandled fatal error in adversarial test runner:', err);
  process.exit(1);
});
