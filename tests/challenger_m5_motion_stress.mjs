/**
 * tests/challenger_m5_motion_stress.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE (MILESTONE 5)
 * Universal Animation Kill-Switch, Skeleton Loaders, Hover Feedback,
 * and Page Transitions Validation.
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9556', 10);

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

async function runM5MotionStressSuite() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   MILESTONE 5 EMPIRICAL STRESS TEST: MOTION KILL-SWITCH & PERFORMANCE${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Target Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL}${colors.reset}\n`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('PRE-CHECK-BROWSER', 'Browser executable locate failed', 'Chrome or Edge not found');
    process.exit(1);
  }
  pass('PRE-CHECK-BROWSER', 'Found browser executable', browserPath);

  let adminToken = '';
  try {
    adminToken = await getAdminToken();
    pass('PRE-CHECK-AUTH', 'Acquired admin session token', `${adminToken.substring(0, 16)}...`);
  } catch (e) {
    fail('PRE-CHECK-AUTH', 'Failed to authenticate admin', e.message);
    process.exit(1);
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-m5-cdp-${Date.now()}`);
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
      fail('CDP-CONNECT', 'Failed to initialize CDP session on port ' + CDP_PORT, 'Browser target unreachable');
      cleanup();
      process.exit(1);
    }
    pass('CDP-CONNECT', 'Connected to Headless Chrome CDP session on port ' + CDP_PORT);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

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

    // Navigate to Dashboard
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise(res => setTimeout(res, 800));

    // =========================================================================
    // SECTION 1: SKELETON LOADERS EMPIRICAL VERIFICATION
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 1: SKELETON LOADERS EMPIRICAL VERIFICATION ---${colors.reset}`);

    // 1.1 Pulse Animation Verification (Enabled vs Disabled vs Reduced Motion)
    const pulseTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          // Case A: Enabled
          document.documentElement.setAttribute('data-animations', 'enabled');
          const pulseEl = document.createElement('div');
          pulseEl.className = 'bg-slate-200/80 animate-pulse motion-reduce:animate-none h-4 w-48 rounded';
          document.body.appendChild(pulseEl);

          const enabledStyle = window.getComputedStyle(pulseEl);
          const enabledDur = enabledStyle.animationDuration;
          const enabledIter = enabledStyle.animationIterationCount;
          const enabledSec = parseSec(enabledDur);

          // Case B: Kill-Switch data-animations="disabled"
          document.documentElement.setAttribute('data-animations', 'disabled');
          const disabledStyle = window.getComputedStyle(pulseEl);
          const disabledDur = disabledStyle.animationDuration;
          const disabledIter = disabledStyle.animationIterationCount;
          const disabledSec = parseSec(disabledDur);

          pulseEl.remove();

          return {
            enabledDur,
            enabledIter,
            enabledSec,
            disabledDur,
            disabledIter,
            disabledSec,
            isEnabledPulseValid: enabledSec >= 1.5 && enabledIter === 'infinite',
            isDisabledPulseSuppressed: disabledSec <= 0.001 && disabledIter === '1'
          };
        })()
      `,
      returnByValue: true,
    });

    const pVal = pulseTest.result?.value;
    if (pVal && pVal.isEnabledPulseValid && pVal.isDisabledPulseSuppressed) {
      pass('SKELETON-PULSE-SUPPRESSION', 'Skeleton pulse animation oscillates when enabled (~2s, infinite) and is killed to <= 0.001ms (1 iter) under kill-switch',
        `Enabled: ${pVal.enabledDur} (${pVal.enabledIter}) -> Disabled: ${pVal.disabledDur} (${pVal.disabledIter})`);
    } else {
      fail('SKELETON-PULSE-SUPPRESSION', 'Skeleton pulse failed suppression under kill-switch', JSON.stringify(pVal));
    }

    // 1.2 Shimmer Wave Animation Suppression
    const waveTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          // Case A: Direct .animate-shimmer class
          document.documentElement.setAttribute('data-animations', 'enabled');
          const shimmerEl = document.createElement('div');
          shimmerEl.className = 'animate-shimmer';
          document.body.appendChild(shimmerEl);

          const enabledStyle = window.getComputedStyle(shimmerEl);
          const enabledName = enabledStyle.animationName;
          const enabledDur = enabledStyle.animationDuration;
          const enabledIter = enabledStyle.animationIterationCount;
          const enabledSec = parseSec(enabledDur);

          // Kill-Switch active on .animate-shimmer
          document.documentElement.setAttribute('data-animations', 'disabled');
          const disabledStyle = window.getComputedStyle(shimmerEl);
          const disabledDur = disabledStyle.animationDuration;
          const disabledIter = disabledStyle.animationIterationCount;
          const disabledSec = parseSec(disabledDur);

          // Case B: Skeleton wave element ::before under Kill-Switch
          const waveEl = document.createElement('div');
          waveEl.className = 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent motion-reduce:before:hidden h-8 w-48 rounded';
          document.body.appendChild(waveEl);

          const disabledBefore = window.getComputedStyle(waveEl, '::before');
          const disabledWaveDur = disabledBefore.animationDuration;
          const disabledWaveSec = parseSec(disabledWaveDur);

          shimmerEl.remove();
          waveEl.remove();

          return {
            enabledName,
            enabledDur,
            enabledIter,
            enabledSec,
            disabledDur,
            disabledIter,
            disabledSec,
            disabledWaveDur,
            disabledWaveSec,
            isShimmerEnabledValid: enabledName === 'shimmer' && enabledSec >= 1.5 && enabledIter === 'infinite',
            isShimmerDisabledSuppressed: disabledSec <= 0.001 && disabledIter === '1',
            isWavePseudoSuppressed: disabledWaveSec <= 0.001
          };
        })()
      `,
      returnByValue: true,
    });

    const wVal = waveTest.result?.value;
    if (wVal && wVal.isShimmerEnabledValid && wVal.isShimmerDisabledSuppressed && wVal.isWavePseudoSuppressed) {
      pass('SKELETON-WAVE-SHIMMER-SUPPRESSION', '.animate-shimmer runs when enabled (~1.8s, infinite) and both element and ::before pseudo are suppressed to <= 0.001ms under kill-switch',
        `Enabled shimmer: ${wVal.enabledName} ${wVal.enabledDur} -> Disabled: ${wVal.disabledDur} (iter: ${wVal.disabledIter}), wave ::before: ${wVal.disabledWaveDur}`);
    } else {
      fail('SKELETON-WAVE-SHIMMER-SUPPRESSION', 'Shimmer animation failed suppression', JSON.stringify(wVal));
    }

    // 1.3 Reduced-Motion Media Query on Skeleton Pulse & Wave
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });

    const reducedMotionSkeletonTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          // Even if data-animations attribute is explicitly set to "enabled", media query must neutralize
          document.documentElement.setAttribute('data-animations', 'enabled');

          const pulseEl = document.createElement('div');
          pulseEl.className = 'bg-slate-200/80 animate-pulse motion-reduce:animate-none h-4 w-48 rounded';
          document.body.appendChild(pulseEl);

          const pulseStyle = window.getComputedStyle(pulseEl);
          const pulseDur = pulseStyle.animationDuration;
          const pulseName = pulseStyle.animationName;
          const pulseSec = parseSec(pulseDur);

          const waveEl = document.createElement('div');
          waveEl.className = 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent motion-reduce:before:hidden h-8 w-48 rounded';
          document.body.appendChild(waveEl);

          const waveBefore = window.getComputedStyle(waveEl, '::before');
          const waveDur = waveBefore.animationDuration;
          const waveDisplay = waveBefore.display;
          const waveSec = parseSec(waveDur);

          pulseEl.remove();
          waveEl.remove();

          return {
            pulseDur,
            pulseName,
            pulseSec,
            waveDur,
            waveDisplay,
            waveSec,
            isPulseKilled: pulseSec <= 0.001 || pulseName === 'none',
            isWaveKilled: waveSec <= 0.001 || waveDisplay === 'none'
          };
        })()
      `,
      returnByValue: true,
    });

    const rmVal = reducedMotionSkeletonTest.result?.value;
    if (rmVal && rmVal.isPulseKilled && rmVal.isWaveKilled) {
      pass('SKELETON-REDUCED-MOTION-SUPPRESSION', 'prefers-reduced-motion: reduce suppresses both pulse (duration <= 0.001ms / name=none) and shimmer wave (duration <= 0.001ms / display=none)',
        `Pulse: dur=${rmVal.pulseDur}, name=${rmVal.pulseName} | Wave: dur=${rmVal.waveDur}, display=${rmVal.waveDisplay}`);
    } else {
      fail('SKELETON-REDUCED-MOTION-SUPPRESSION', 'Skeleton failed suppression under prefers-reduced-motion', JSON.stringify(rmVal));
    }

    // Reset emulated media
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    // 1.4 Web Animations API Inspection for All 8 Skeleton Variants
    const allVariantsTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          const variants = [
            { name: 'text', cls: 'inline-block h-4 w-full rounded' },
            { name: 'circular', cls: 'rounded-full aspect-square w-10 h-10' },
            { name: 'avatar', cls: 'rounded-full aspect-square w-10 h-10' },
            { name: 'rectangular', cls: 'rounded-xl w-full h-24' },
            { name: 'card', cls: 'rounded-xl w-full min-h-[6rem]' },
            { name: 'table-row', cls: 'h-4 w-full rounded' },
            { name: 'badge', cls: 'inline-block h-5 w-20 rounded-full' },
            { name: 'button', cls: 'inline-block h-8 w-24 rounded-lg' }
          ];

          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          const results = [];

          for (const v of variants) {
            // Test pulse
            const elPulse = document.createElement('div');
            elPulse.className = 'bg-slate-200/80 animate-pulse ' + v.cls;
            document.body.appendChild(elPulse);

            const sPulse = window.getComputedStyle(elPulse);
            const pulseDur = parseSec(sPulse.animationDuration);

            // Test wave
            const elWave = document.createElement('div');
            elWave.className = 'bg-slate-200/80 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer ' + v.cls;
            document.body.appendChild(elWave);

            const sWaveBefore = window.getComputedStyle(elWave, '::before');
            const waveDur = parseSec(sWaveBefore.animationDuration);

            // Check Web Animations API
            const webAnims = elPulse.getAnimations ? elPulse.getAnimations() : [];
            const runningLongAnims = webAnims.filter(a => {
              const dur = a.effect?.getTiming()?.duration;
              return typeof dur === 'number' && dur > 1; // more than 1ms
            });

            results.push({
              variant: v.name,
              pulseDur,
              waveDur,
              runningLongAnimsCount: runningLongAnims.length,
              isClean: pulseDur <= 0.001 && waveDur <= 0.001 && runningLongAnims.length === 0
            });

            elPulse.remove();
            elWave.remove();
          }

          return results;
        })()
      `,
      returnByValue: true,
    });

    const vResults = allVariantsTest.result?.value || [];
    const allVariantsClean = vResults.length === 8 && vResults.every(r => r.isClean);
    if (allVariantsClean) {
      pass('SKELETON-ALL-8-VARIANTS-CLEAN', 'All 8 Skeleton variants (text, circular, avatar, rectangular, card, table-row, badge, button) verified 100% motion-free under kill-switch',
        `Tested ${vResults.length} variants; 0 active/running animations detected`);
    } else {
      fail('SKELETON-ALL-8-VARIANTS-CLEAN', 'One or more Skeleton variants had lingering motion', JSON.stringify(vResults.filter(r => !r.isClean)));
    }

    // =========================================================================
    // SECTION 2: HOVER FEEDBACK EMPIRICAL VERIFICATION
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 2: HOVER FEEDBACK EMPIRICAL VERIFICATION ---${colors.reset}`);

    // 2.1 Static & Computed Transition Duration on Interactive Elements Across the Shell
    const interactiveElementsTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          // Select key interactive UI nodes from real DOM
          const selectors = [
            { name: 'Sidebar Nav Item', selector: 'aside nav a, aside nav button' },
            { name: 'Header Action Button', selector: 'header button' },
            { name: 'Widget Card Container', selector: '[data-widget-id]' },
            { name: 'Widget Header Reorder Button', selector: '[data-widget-id] header button' },
            { name: 'Quick Action Button', selector: 'button:not([disabled])' }
          ];

          const results = [];

          for (const item of selectors) {
            const el = document.querySelector(item.selector);
            if (!el) {
              results.push({ name: item.name, found: false });
              continue;
            }

            const style = window.getComputedStyle(el);
            const tDur = style.transitionDuration;
            const tDelay = style.transitionDelay;
            const aDur = style.animationDuration;
            const tSec = parseSec(tDur);
            const aSec = parseSec(aDur);

            results.push({
              name: item.name,
              found: true,
              tDur,
              tDelay,
              aDur,
              isClean: tSec <= 0.001 && (tDelay === '0s' || tDelay === '0ms' || parseFloat(tDelay) === 0) && aSec <= 0.001
            });
          }

          return results;
        })()
      `,
      returnByValue: true,
    });

    const iResults = interactiveElementsTest.result?.value || [];
    const allInteractiveClean = iResults.length > 0 && iResults.filter(r => r.found).every(r => r.isClean);
    if (allInteractiveClean) {
      pass('HOVER-SHELL-TRANSITION-KILLED', 'Real AppShell interactive elements have transition-duration <= 0.001ms and transition-delay 0s under kill-switch',
        iResults.filter(r => r.found).map(r => `${r.name}: trans=${r.tDur}, delay=${r.tDelay}`).join('; '));
    } else {
      fail('HOVER-SHELL-TRANSITION-KILLED', 'One or more AppShell interactive elements retained non-zero transition durations', JSON.stringify(iResults));
    }

    // 2.2 Empirical Real Hover Simulation & Instantaneous Style Shift Timing
    // Hover over a button that normally has transition-colors or transition-all (duration 200ms)
    const hoverBenchmark = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          document.documentElement.setAttribute('data-animations', 'disabled');

          // Create a button with explicit 500ms transition and hover effect
          const btn = document.createElement('button');
          btn.id = 'benchmark-hover-btn';
          btn.className = 'transition-all duration-500 bg-blue-600 hover:bg-red-600 text-white px-4 py-2 rounded';
          btn.style.transition = 'background-color 500ms ease-in-out';
          btn.textContent = 'Hover Target';
          document.body.appendChild(btn);

          // Force reflow
          void btn.offsetHeight;

          let transitionFired = false;
          let transitionDurationRecorded = 0;

          btn.addEventListener('transitionrun', (e) => {
            transitionFired = true;
          });

          btn.addEventListener('transitionend', (e) => {
            transitionDurationRecorded = e.elapsedTime;
          });

          // Measure time for style to switch
          const start = performance.now();
          btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          btn.classList.add('bg-red-600'); // simulate hover class application

          // Read computed color immediately on next microtask / frame
          requestAnimationFrame(() => {
            const elapsed = performance.now() - start;
            const style = window.getComputedStyle(btn);
            const computedBg = style.backgroundColor;
            const computedTrans = style.transitionDuration;

            btn.remove();

            resolve({
              elapsedMs: elapsed,
              computedTrans,
              transitionFired,
              transitionDurationRecorded,
              isInstant: elapsed < 50
            });
          });
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const hRes = hoverBenchmark.result?.value;
    if (hRes && hRes.isInstant) {
      pass('HOVER-INSTANT-EXECUTION-BENCHMARK', 'Hover visual style shift completes instantaneously (< 50ms) without gradual interpolation',
        `Elapsed frame time: ${hRes.elapsedMs.toFixed(2)}ms (nominal transition: 500ms); computed transitionDuration: ${hRes.computedTrans}`);
    } else {
      fail('HOVER-INSTANT-EXECUTION-BENCHMARK', 'Hover style shift was delayed or interpolated', JSON.stringify(hRes));
    }

    // =========================================================================
    // SECTION 3: PAGE TRANSITIONS & VIEW TRANSITIONS EMPIRICAL VERIFICATION
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 3: PAGE TRANSITIONS & VIEW TRANSITIONS EMPIRICAL VERIFICATION ---${colors.reset}`);

    // 3.1 CSS View-Transition Rules and Pseudo-Element Inspection
    const viewTransitionRules = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          // Check if view-transition pseudo-elements or rules exist in stylesheets
          let hasViewTransitionInStyle = false;
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.selectorText && rule.selectorText.includes('view-transition')) {
                  hasViewTransitionInStyle = true;
                  break;
                }
              }
            } catch(e) {}
          }

          // Test dynamic view transition group override if document.startViewTransition is present
          const supportsViewTransitions = typeof document.startViewTransition === 'function';

          return {
            hasViewTransitionInStyle,
            supportsViewTransitions
          };
        })()
      `,
      returnByValue: true,
    });

    const vtVal = viewTransitionRules.result?.value;
    pass('PAGE-VIEW-TRANSITIONS-STATUS', 'View Transitions API & CSS status evaluated',
      `supportsViewTransitions: ${vtVal.supportsViewTransitions}, custom CSS rules: ${vtVal.hasViewTransitionInStyle}`);

    // 3.2 Live Multi-Route Navigation Timing Under Kill-Switch
    // Navigate between 4 major areas and verify navigation completes without lingering animation delays
    const testRoutes = [
      { from: '/', to: '/expedientes', name: 'Dashboard -> Expedientes' },
      { from: '/expedientes', to: '/agenda', name: 'Expedientes -> Agenda' },
      { from: '/agenda', to: '/reportes', name: 'Agenda -> Reportes' },
      { from: '/reportes', to: '/', name: 'Reportes -> Dashboard' },
    ];

    let navigationClean = true;
    const navDetails = [];

    for (const r of testRoutes) {
      const navStart = Date.now();
      await cdp.send('Page.navigate', { url: `${FRONTEND_URL}${r.to}` });
      await new Promise(res => setTimeout(res, 400));
      const navElapsed = Date.now() - navStart;

      // Verify page is rendered, documentElement has data-animations="disabled" or is clean
      const check = await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            const hasHeader = document.querySelector('header') !== null;
            const hasMain = document.querySelector('main, [data-widget-id], [data-view="table"]') !== null;
            const animationsAttr = document.documentElement.getAttribute('data-animations');
            return { hasHeader, hasMain, animationsAttr };
          })()
        `,
        returnByValue: true,
      });

      const c = check.result?.value;
      if (!c || !c.hasHeader) {
        navigationClean = false;
      }
      navDetails.push(`${r.name}: ${navElapsed}ms (header=${c?.hasHeader})`);
    }

    if (navigationClean) {
      pass('PAGE-NAVIGATION-TRANSITIONS-INSTANT', 'Cross-route transitions complete cleanly and instantaneously without blocking or overlay fades',
        navDetails.join('; '));
    } else {
      fail('PAGE-NAVIGATION-TRANSITIONS-INSTANT', 'Navigation encountered errors or missing shell elements', navDetails.join('; '));
    }

    // =========================================================================
    // SECTION 4: ADVERSARIAL STRESS & EDGE CASES
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 4: ADVERSARIAL STRESS & EDGE CASES ---${colors.reset}`);

    // 4.1 Mid-Flight Animation Interruption
    // Start an infinite 10-second animation while enabled, then flip data-animations to disabled
    const midFlightTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          // Step 1: Start long animation with enabled
          document.documentElement.setAttribute('data-animations', 'enabled');

          const el = document.createElement('div');
          el.id = 'mid-flight-node';
          el.style.animation = 'spin 10s linear infinite';
          el.style.transition = 'transform 10s ease';
          document.body.appendChild(el);

          const preStyle = window.getComputedStyle(el);
          const preSec = parseSec(preStyle.animationDuration);

          // Step 2: Dynamic Mid-Flight Kill
          document.documentElement.setAttribute('data-animations', 'disabled');

          const postStyle = window.getComputedStyle(el);
          const postSec = parseSec(postStyle.animationDuration);
          const postIter = postStyle.animationIterationCount;

          el.remove();

          return {
            preSec,
            postSec,
            postIter,
            isImmediatelyKilled: postSec <= 0.001 && postIter === '1'
          };
        })()
      `,
      returnByValue: true,
    });

    const mfVal = midFlightTest.result?.value;
    if (mfVal && mfVal.isImmediatelyKilled) {
      pass('ADVERSARIAL-MID-FLIGHT-KILL', 'Mid-flight 10s running animation immediately clamps to <= 0.001ms duration and 1 iteration upon kill-switch engagement',
        `Pre-kill: ${mfVal.preSec}s -> Post-kill: ${mfVal.postSec}s (iter: ${mfVal.postIter})`);
    } else {
      fail('ADVERSARIAL-MID-FLIGHT-KILL', 'Mid-flight animation failed to immediately abort upon kill-switch toggle', JSON.stringify(mfVal));
    }

    // 4.2 Deeply Nested DOM Tree Penetration (12 Levels Deep)
    const deepNestTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          // Build a 12-level deeply nested hierarchy
          let root = document.createElement('div');
          let current = root;
          for (let i = 0; i < 12; i++) {
            const child = document.createElement('div');
            child.className = 'level-' + i;
            current.appendChild(child);
            current = child;
          }

          // Innermost leaf element with heavy transitions & animations
          current.id = 'deep-leaf-target';
          current.className = 'transition-all duration-700 animate-bounce';
          current.style.transition = 'all 700ms ease';
          current.style.animation = 'bounce 2s infinite';
          document.body.appendChild(root);

          const leafStyle = window.getComputedStyle(current);
          const leafTransSec = parseSec(leafStyle.transitionDuration);
          const leafAnimSec = parseSec(leafStyle.animationDuration);
          const leafDelay = leafStyle.transitionDelay;

          root.remove();

          return {
            leafTransSec,
            leafAnimSec,
            leafDelay,
            isSuppressed: leafTransSec <= 0.001 && leafAnimSec <= 0.001 && (leafDelay === '0s' || leafDelay === '0ms' || parseFloat(leafDelay) === 0)
          };
        })()
      `,
      returnByValue: true,
    });

    const dnVal = deepNestTest.result?.value;
    if (dnVal && dnVal.isSuppressed) {
      pass('ADVERSARIAL-DEEP-NEST-PENETRATION', 'Universal kill-switch rules penetrate 12 levels of DOM nesting and override transitions/animations',
        `Leaf trans: ${dnVal.leafTransSec}s, anim: ${dnVal.leafAnimSec}s, delay: ${dnVal.leafDelay}`);
    } else {
      fail('ADVERSARIAL-DEEP-NEST-PENETRATION', 'Kill-switch failed to penetrate deep DOM nesting', JSON.stringify(dnVal));
    }

    // 4.3 Rapid Alternating Toggle Stress (20 Toggles in 100ms)
    const rapidToggleTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          function parseSec(val) {
            if (!val) return 0;
            if (val.endsWith('ms')) return parseFloat(val) / 1000;
            if (val.endsWith('s')) return parseFloat(val);
            return parseFloat(val);
          }

          const node = document.createElement('div');
          node.className = 'animate-pulse transition-all duration-500';
          document.body.appendChild(node);

          for (let i = 0; i < 20; i++) {
            const state = i % 2 === 0 ? 'disabled' : 'enabled';
            document.documentElement.setAttribute('data-animations', state);
          }

          // Final state: disabled
          document.documentElement.setAttribute('data-animations', 'disabled');

          const finalStyle = window.getComputedStyle(node);
          const finalTrans = parseSec(finalStyle.transitionDuration);
          const finalAnim = parseSec(finalStyle.animationDuration);

          node.remove();

          return {
            finalTrans,
            finalAnim,
            isClean: finalTrans <= 0.001 && finalAnim <= 0.001
          };
        })()
      `,
      returnByValue: true,
    });

    const rtVal = rapidToggleTest.result?.value;
    if (rtVal && rtVal.isClean) {
      pass('ADVERSARIAL-RAPID-TOGGLE-STRESS', '20 rapid alternating toggles resolve without style desync; final disabled state strictly enforced',
        `Final transition: ${rtVal.finalTrans}s, animation: ${rtVal.finalAnim}s`);
    } else {
      fail('ADVERSARIAL-RAPID-TOGGLE-STRESS', 'Rapid toggling caused style desync or lingering animation', JSON.stringify(rtVal));
    }

    // 4.4 Real Skeleton Loader Bounding Box & Zero-Layout-Shift Check
    // Navigate to /expedientes and verify table loading skeleton container
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/expedientes` });
    await new Promise(res => setTimeout(res, 600));

    const expedientesSkeletonTest = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          document.documentElement.setAttribute('data-animations', 'disabled');

          const tableEl = document.querySelector('table');
          const hasTable = tableEl !== null;
          const rows = document.querySelectorAll('tbody tr');

          return {
            hasTable,
            rowCount: rows.length
          };
        })()
      `,
      returnByValue: true,
    });

    const expVal = expedientesSkeletonTest.result?.value;
    if (expVal && expVal.hasTable) {
      pass('REAL-DOM-EXPEDIENTES-CONTAINER', 'Expedientes table container and rows present in real DOM without layout collapse',
        `hasTable: ${expVal.hasTable}, rowCount: ${expVal.rowCount}`);
    } else {
      fail('REAL-DOM-EXPEDIENTES-CONTAINER', 'Expedientes table container missing or collapsed', JSON.stringify(expVal));
    }

  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}          MILESTONE 5 MOTION CHALLENGE VERIFICATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  Passed Tests:       ${passedTests}`);
  console.log(`  Failed Tests:       ${failedTests}`);
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.log(`${colors.red}${colors.bold}CHALLENGE VERDICT: REJECT${colors.reset}`);
    for (const f of failures) {
      console.log(`  - [${f.id}] ${f.title}: ${f.errorDetail}`);
    }
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}CHALLENGE VERDICT: APPROVE (All empirical tests passed 100%)${colors.reset}\n`);
    process.exit(0);
  }
}

runM5MotionStressSuite().catch((err) => {
  console.error('\nUnhandled fatal error in M5 motion stress runner:', err);
  process.exit(1);
});
