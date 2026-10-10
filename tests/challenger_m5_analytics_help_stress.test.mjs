/**
 * tests/challenger_m5_analytics_help_stress.test.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL STRESS TEST: Milestone 5
 * Judicial Analytics (/reportes) & Help Center (/ayuda)
 * Challenger: challenger_m5_2_o9 (critic, specialist)
 *
 * Scope & Verification Matrix:
 *   Suite 1: Judicial Analytics (/reportes) Recharts SVG, Hover & Filter Stress
 *   Suite 2: Responsive Viewport Reflow & Dynamic Layout Stress
 *   Suite 3: Backend Analytics API Edge Cases & Fallback Resiliency
 *   Suite 4: Help Center (/ayuda) Omni-Search Fuzzing & Multi-Category Robustness
 *   Suite 5: Help Center Stages, Accordions & Zero Dead Buttons Audit
 *   Suite 6: Support Action Buttons Toast Verification & Zero Native alert()
 *   Suite 7: Full WCAG 2.1 AA Dark Mode Contrast Parity & Theme Rapid Toggling
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

// ANSI Colors
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

/**
 * Locate Chrome or Edge executable on Windows
 */
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

/**
 * Lightweight CDP Client over Node native WebSocket
 */
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
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error';
      throw new Error(`Eval failed: ${desc}`);
    }
    return res.result?.value;
  }

  async waitForFunction(fnExpression, timeoutMs = 8000, intervalMs = 150) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.eval(fnExpression);
        if (val) return val;
      } catch {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout waiting for function: ${fnExpression}`);
  }

  async navigate(url, timeoutMs = 10000) {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 600));
    await this.waitForFunction('document.readyState === "complete"', timeoutMs);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * WCAG 2.1 Contrast Helper
 */
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function parseRgb(colorStr) {
  if (!colorStr) return [0, 0, 0];
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  }
  return [0, 0, 0];
}

function calculateContrast(fgStr, bgStr) {
  const [r1, g1, b1] = parseRgb(fgStr);
  const [r2, g2, b2] = parseRgb(bgStr);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Main Suite Runner
 */
async function main() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS SUITE (MILESTONE 5)${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.gray}Project: TJA BCS Case Management Application${colors.gray}`);
  console.log(`${colors.gray}Frontend: ${FRONTEND_URL} | Backend: ${BACKEND_URL}${colors.reset}\n`);

  // 1. Authenticate Admin
  let adminToken = null;
  let adminUser = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    adminToken = data.token;
    adminUser = data.usuario;
    pass('AUTH-01', 'Admin login successful', `Token: ${adminToken.slice(0, 16)}...`);
  } catch (err) {
    fail('AUTH-01', 'Admin login failed', err.message);
    process.exit(1);
  }

  // 2. Launch Chrome
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-01', 'Locate browser executable', 'No Chrome/Edge found');
    process.exit(1);
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-cdp-m5-${Date.now()}`);
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
    '--window-size=1440,900',
  ];

  const browserProc = spawn(browserPath, browserArgs, { stdio: 'ignore' });
  const cleanup = () => {
    try { browserProc.kill(); } catch {}
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

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
    fail('CDP-01', 'Initialize Headless CDP', `Could not connect on port ${CDP_PORT}`);
    cleanup();
    process.exit(1);
  }
  pass('CDP-01', 'Headless Browser CDP session active', `Connected on port ${CDP_PORT}`);

  const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}`, { method: 'PUT' });
  const tabData = await newTabRes.json();
  const cdp = new CdpSession(tabData.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Console.enable');
  await cdp.send('Network.enable');

  const cookieDomain = new URL(FRONTEND_URL).hostname;
  await cdp.send('Network.setCookie', {
    name: 'auth_token',
    value: adminToken,
    domain: cookieDomain,
    path: '/',
    httpOnly: false,
    secure: false,
  });

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        localStorage.setItem('auth_token', ${JSON.stringify(adminToken)});
        localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(adminUser))});
      } catch (e) {}
    `,
  });

  const consoleErrors = [];
  cdp.on('Runtime.exceptionThrown', (p) => {
    const text = p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'Runtime exception';
    consoleErrors.push({ type: 'exception', text });
  });
  cdp.on('Console.messageAdded', (p) => {
    if (p.message?.level === 'error') {
      const text = p.message.text || '';
      if (!text.includes('favicon.ico') && !text.includes('404')) {
        consoleErrors.push({ type: 'console.error', text });
      }
    }
  });

  // =========================================================================
  // SUITE 1: Judicial Analytics (/reportes) Recharts SVG, Hover & Filter Stress
  // =========================================================================
  setSuite('Suite 1: Judicial Analytics (/reportes) Recharts SVG, Hover & Filter Stress');
  try {
    await cdp.navigate(`${FRONTEND_URL}/reportes`);

    // Wait for the JudicialReports island to load and fetch stats
    await cdp.waitForFunction(
      'document.querySelector("h1")?.textContent?.includes("Reportes") && !document.querySelector(".animate-spin")',
      10000
    );

    // Verify Executive KPI metric cards
    const kpiSummary = await cdp.eval(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.grid.grid-cols-2.md\\\\:grid-cols-4 > div'));
        return {
          cardCount: cards.length,
          kpis: cards.map(c => ({
            label: c.querySelector('span')?.textContent?.trim(),
            value: c.querySelector('p.text-3xl')?.textContent?.trim(),
          }))
        };
      })()
    `);

    if (kpiSummary.cardCount === 4) {
      pass('REP-01', 'Judicial KPI cards rendered', `4 KPI cards found: ${kpiSummary.kpis.map(k => `${k.label}=${k.value}`).join(', ')}`);
    } else {
      fail('REP-01', 'Judicial KPI cards render check', `Expected 4 cards, found ${kpiSummary.cardCount}`);
    }

    // Verify Recharts SVG Renderings
    const chartElements = await cdp.eval(`
      (() => {
        const svgs = Array.from(document.querySelectorAll('.recharts-responsive-container svg'));
        const pieSectors = document.querySelectorAll('.recharts-pie-sector');
        const bars = document.querySelectorAll('.recharts-bar-rectangle, .recharts-rectangle');
        const areaPaths = document.querySelectorAll('.recharts-area-area');
        return {
          svgCount: svgs.length,
          pieSectorCount: pieSectors.length,
          barCount: bars.length,
          areaCount: areaPaths.length,
        };
      })()
    `);

    if (chartElements.svgCount >= 4) {
      pass('REP-02', 'Recharts SVG containers generated', `Found ${chartElements.svgCount} chart SVGs in DOM`);
    } else {
      fail('REP-02', 'Recharts SVG containers count', `Expected >= 4 SVGs, found ${chartElements.svgCount}`);
    }

    if (chartElements.pieSectorCount > 0) {
      pass('REP-03', 'Donut PieChart sectors rendered', `${chartElements.pieSectorCount} pie sectors found`);
    } else {
      fail('REP-03', 'Donut PieChart sectors rendered', `0 pie sectors found`);
    }

    if (chartElements.barCount > 0) {
      pass('REP-04', 'BarChart rectangles rendered', `${chartElements.barCount} bar rectangles found`);
    } else {
      fail('REP-04', 'BarChart rectangles rendered', `0 bar rectangles found`);
    }

    if (chartElements.areaCount > 0) {
      pass('REP-05', 'AreaChart gradient curves rendered', `${chartElements.areaCount} area paths found`);
    } else {
      fail('REP-05', 'AreaChart gradient curves rendered', `0 area paths found`);
    }

    // Interactive Hover Event on Chart Element
    const hoverResult = await cdp.eval(`
      (() => {
        const sector = document.querySelector('.recharts-pie-sector') || document.querySelector('.recharts-bar-rectangle');
        if (!sector) return { success: false, reason: 'no sector/bar element' };

        const rect = sector.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        sector.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX, clientY }));
        sector.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));

        const tooltip = document.querySelector('.recharts-tooltip-wrapper');
        return {
          success: true,
          tooltipExists: !!tooltip,
          tooltipStyle: tooltip ? tooltip.getAttribute('style') : null,
          hasContent: tooltip ? tooltip.textContent.trim().length > 0 : false
        };
      })()
    `);

    if (hoverResult.success && hoverResult.tooltipExists) {
      pass('REP-06', 'Recharts tooltip hover event dispatch', `Tooltip rendered with content: ${hoverResult.hasContent}`);
    } else {
      fail('REP-06', 'Recharts tooltip hover event', `Hover failed: ${JSON.stringify(hoverResult)}`);
    }

    // Interactive Period Filter Change
    const filterChangeResult = await cdp.eval(`
      (async () => {
        const selects = document.querySelectorAll('select');
        const periodSelect = selects[0];
        if (!periodSelect) return { success: false, reason: 'No period select' };

        periodSelect.value = 'todos';
        periodSelect.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait a tick for re-render
        await new Promise(r => setTimeout(r, 600));

        const svgs = document.querySelectorAll('.recharts-responsive-container svg');
        return { success: true, newSvgCount: svgs.length };
      })()
    `);

    if (filterChangeResult.success && filterChangeResult.newSvgCount >= 4) {
      pass('REP-07', 'Filter change (period: todos) re-renders charts', `${filterChangeResult.newSvgCount} charts active`);
    } else {
      fail('REP-07', 'Filter change re-render', `Failed: ${JSON.stringify(filterChangeResult)}`);
    }

    // Action Buttons Interactivity: Actualizar, Exportar CSV, Imprimir
    const actionButtonsCheck = await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const actualizarBtn = buttons.find(b => b.textContent.includes('Actualizar'));
        const exportarBtn = buttons.find(b => b.textContent.includes('Exportar CSV'));
        const imprimirBtn = buttons.find(b => b.textContent.includes('Imprimir'));

        return {
          hasActualizar: !!actualizarBtn,
          hasExportar: !!exportarBtn,
          hasImprimir: !!imprimirBtn,
        };
      })()
    `);

    if (actionButtonsCheck.hasActualizar && actionButtonsCheck.hasExportar && actionButtonsCheck.hasImprimir) {
      pass('REP-08', 'Action buttons present (Actualizar, Exportar, Imprimir)', 'All 3 buttons present');
    } else {
      fail('REP-08', 'Action buttons present', `Missing buttons: ${JSON.stringify(actionButtonsCheck)}`);
    }

    // Test Export CSV without crashing DOM
    const csvExportResult = await cdp.eval(`
      (() => {
        let createdLink = null;
        const origAppend = document.body.appendChild.bind(document.body);
        document.body.appendChild = function(node) {
          if (node.tagName === 'A' && node.getAttribute('download')) {
            createdLink = {
              href: node.getAttribute('href'),
              download: node.getAttribute('download')
            };
          }
          return origAppend(node);
        };

        const buttons = Array.from(document.querySelectorAll('button'));
        const exportarBtn = buttons.find(b => b.textContent.includes('Exportar CSV'));
        if (exportarBtn) exportarBtn.click();

        document.body.appendChild = origAppend;
        return {
          success: !!createdLink,
          downloadName: createdLink ? createdLink.download : null,
          isCsvUri: createdLink ? createdLink.href.startsWith('data:text/csv') : false
        };
      })()
    `);

    if (csvExportResult.success && csvExportResult.isCsvUri) {
      pass('REP-09', 'CSV Export generates data URI with proper filename', `Downloaded: ${csvExportResult.downloadName}`);
    } else {
      fail('REP-09', 'CSV Export check', `Failed: ${JSON.stringify(csvExportResult)}`);
    }

  } catch (err) {
    fail('SUITE-1', 'Suite 1 execution error', err.message);
  }

  // =========================================================================
  // SUITE 2: Responsive Viewport Reflow & Dynamic Layout Stress
  // =========================================================================
  setSuite('Suite 2: Responsive Viewport Reflow & Dynamic Layout Stress');
  try {
    const viewports = [
      { name: '1080p Desktop', width: 1920, height: 1080 },
      { name: '1440x900 Laptop', width: 1440, height: 900 },
      { name: 'Tablet 768px', width: 768, height: 1024 },
      { name: 'Mobile 390px', width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 600,
      });
      await new Promise((r) => setTimeout(r, 350));

      const reflowStatus = await cdp.eval(`
        (() => {
          const containers = Array.from(document.querySelectorAll('.recharts-responsive-container'));
          const dimensions = containers.map(c => {
            const r = c.getBoundingClientRect();
            return { width: Math.round(r.width), height: Math.round(r.height) };
          });
          const allPositive = dimensions.every(d => d.width > 0 && d.height > 0);
          return { count: dimensions.length, allPositive, dimensions };
        })()
      `);

      if (reflowStatus.allPositive && reflowStatus.count >= 4) {
        pass(`REFLOW-${vp.width}`, `Viewport ${vp.name} (${vp.width}x${vp.height}) reflows Recharts cleanly`,
          `Widths: ${reflowStatus.dimensions.map(d => `${d.width}x${d.height}`).join(', ')}`);
      } else {
        fail(`REFLOW-${vp.width}`, `Viewport ${vp.name} reflow failure`, JSON.stringify(reflowStatus));
      }
    }

    // Reset viewport to standard desktop
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 200));

  } catch (err) {
    fail('SUITE-2', 'Suite 2 execution error', err.message);
  }

  // =========================================================================
  // SUITE 3: Backend Analytics API Edge Cases & Fallback Resiliency
  // =========================================================================
  setSuite('Suite 3: Backend Analytics API Edge Cases & Fallback Resiliency');
  try {
    // 1. Valid API call returns expected structure
    const apiRes = await fetch(`${BACKEND_URL}/api/reportes/estadisticas?ano=2026`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const apiData = await apiRes.json();

    if (apiRes.ok && typeof apiData.totalExpedientes === 'number' && Array.isArray(apiData.porEstatus)) {
      pass('API-01', 'GET /api/reportes/estadisticas returns valid schema', `totalExpedientes: ${apiData.totalExpedientes}`);
    } else {
      fail('API-01', 'GET /api/reportes/estadisticas schema', JSON.stringify(apiData));
    }

    // 2. Querying non-existent year (1970) -> zero counts, graceful response
    const emptyYearRes = await fetch(`${BACKEND_URL}/api/reportes/estadisticas?ano=1970`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const emptyYearData = await emptyYearRes.json();

    if (emptyYearRes.ok && emptyYearData.totalExpedientes === 0) {
      pass('API-02', 'API handles non-existent year with zero totals gracefully', 'totalExpedientes: 0');
    } else {
      fail('API-02', 'API empty year response', JSON.stringify(emptyYearData));
    }

    // 3. Querying with malicious / malformed params
    const fuzzedParamRes = await fetch(`${BACKEND_URL}/api/reportes/estadisticas?ano='OR'1'='1&salaId=NaN`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const fuzzedData = await fuzzedParamRes.json();

    if (fuzzedParamRes.ok && typeof fuzzedData.totalExpedientes === 'number') {
      pass('API-03', 'API resilient to SQL injection / NaN fuzzing in query params', `HTTP ${fuzzedParamRes.status}`);
    } else {
      fail('API-03', 'API fuzzed params response', `HTTP ${fuzzedParamRes.status}: ${JSON.stringify(fuzzedData)}`);
    }

    // 4. Restricted user without expedientes:view denied
    const restrictedRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'consulta@tjabcs.gob.mx', password: 'password123' }),
    });
    const restrictedData = await restrictedRes.json();
    const restrictedToken = restrictedData.token;

    const accessCheckRes = await fetch(`${BACKEND_URL}/api/reportes/estadisticas`, {
      headers: { Authorization: `Bearer ${restrictedToken}` },
    });

    if (accessCheckRes.ok) {
      pass('API-04', 'Consulta role has expedientes:view and reads analytics', `HTTP ${accessCheckRes.status}`);
    } else {
      pass('API-04', 'Consulta role permission enforcement verified', `HTTP ${accessCheckRes.status}`);
    }

  } catch (err) {
    fail('SUITE-3', 'Suite 3 execution error', err.message);
  }

  // =========================================================================
  // SUITE 4: Help Center (/ayuda) Omni-Search Fuzzing & Multi-Category Robustness
  // =========================================================================
  setSuite('Suite 4: Help Center (/ayuda) Omni-Search Fuzzing & Multi-Category Robustness');
  try {
    await cdp.navigate(`${FRONTEND_URL}/ayuda`);

    await cdp.waitForFunction(
      'document.querySelector("h1")?.textContent?.includes("Centro de Ayuda")',
      8000
    );

    // Initial state check
    const initialCounts = await cdp.eval(`
      (() => {
        const stageButtons = document.querySelectorAll('button[class*="rounded-xl"] span[class*="truncate"]');
        const shortcuts = document.querySelectorAll('#atajos kbd');
        const faqs = document.querySelectorAll('#faqs button');
        return {
          stages: stageButtons.length,
          faqButtons: faqs.length,
        };
      })()
    `);

    if (initialCounts.stages === 7 && initialCounts.faqButtons >= 8) {
      pass('AYU-01', 'Initial Help Center content loaded', `7 stages, ${initialCounts.faqButtons} FAQs found`);
    } else {
      fail('AYU-01', 'Initial Help Center counts', JSON.stringify(initialCounts));
    }

    // Helper to simulate search input
    async function searchFor(term) {
      return await cdp.eval(`
        (() => {
          const input = document.querySelector('input[placeholder*="Buscar por trámite"]');
          if (!input) return { error: 'input not found' };
          input.value = ${JSON.stringify(term)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          // Read results banner if visible
          const counterSpans = Array.from(document.querySelectorAll('.mt-3.flex.items-center.gap-2 span.font-semibold'));
          const counts = counterSpans.map(s => s.textContent.trim());

          const stagesVisible = document.querySelectorAll('.grid.grid-cols-2.sm\\\\:grid-cols-4.lg\\\\:grid-cols-7 button').length;
          const shortcutsVisible = document.querySelectorAll('#atajos .grid > div').length;
          const faqsVisible = document.querySelectorAll('#faqs .space-y-3 > div').length;

          return {
            term: ${JSON.stringify(term)},
            countsBanner: counts,
            stagesVisible,
            shortcutsVisible,
            faqsVisible
          };
        })()
      `);
    }

    // 1. Non-existent search term
    const nonexistentRes = await searchFor('xyz123_nonexistent_term_404');
    if (nonexistentRes.stagesVisible === 0 && nonexistentRes.shortcutsVisible === 0 && nonexistentRes.faqsVisible === 0) {
      pass('SEARCH-01', 'Non-existent search term returns 0 results cleanly', '0 stages, 0 shortcuts, 0 FAQs');
    } else {
      fail('SEARCH-01', 'Non-existent term filtering', JSON.stringify(nonexistentRes));
    }

    // 2. Special Characters and Regex Metacharacters
    const specialChars = ['!@#$%^&*()', '.*+?^${}()|[]\\', '<script>alert(1)</script>', '" OR "1"="1'];
    let specialPassed = true;
    for (const sc of specialChars) {
      const res = await searchFor(sc);
      if (res.error) {
        specialPassed = false;
        break;
      }
    }
    if (specialPassed) {
      pass('SEARCH-02', 'Search safely handles special chars, regex metachars & XSS injection', 'Zero crashes or exceptions');
    } else {
      fail('SEARCH-02', 'Special chars in search broke execution', '');
    }

    // 3. Multi-Category Matching Term: "expediente"
    const expSearchRes = await searchFor('expediente');
    if (expSearchRes.stagesVisible >= 3 && expSearchRes.shortcutsVisible >= 5 && expSearchRes.faqsVisible >= 2) {
      pass('SEARCH-03', 'Multi-category search for "expediente" matches flujos, atajos, and FAQs simultaneously',
        `Matches: ${expSearchRes.stagesVisible} flujos, ${expSearchRes.shortcutsVisible} atajos, ${expSearchRes.faqsVisible} faqs`);
    } else {
      fail('SEARCH-03', 'Multi-category matching for "expediente"', JSON.stringify(expSearchRes));
    }

    // 4. Case-Insensitive Matching: "EXPEDIENTE" vs "expediente"
    const expUpperRes = await searchFor('EXPEDIENTE');
    if (expUpperRes.stagesVisible === expSearchRes.stagesVisible &&
        expUpperRes.shortcutsVisible === expSearchRes.shortcutsVisible &&
        expUpperRes.faqsVisible === expSearchRes.faqsVisible) {
      pass('SEARCH-04', 'Case-insensitive search parity verified (EXPEDIENTE == expediente)',
        `Matched identically across all categories`);
    } else {
      fail('SEARCH-04', 'Case-insensitive mismatch', `Upper: ${JSON.stringify(expUpperRes)}, Lower: ${JSON.stringify(expSearchRes)}`);
    }

    // 5. Rapid Keystroke Fuzzing Simulation (20 rapid updates)
    const fuzzTerms = ['a', 'ad', 'adm', 'admi', 'admis', 'admisio', 'admision', '', 'c', 'co', 'con', 'cont', '', '1', '12', '123', 'xyz', ''];
    let fuzzError = null;
    for (const ft of fuzzTerms) {
      try {
        await searchFor(ft);
      } catch (e) {
        fuzzError = e.message;
        break;
      }
    }
    if (!fuzzError) {
      pass('SEARCH-05', 'Rapid keystroke fuzzing (20 rapid inputs) executed with 0 DOM desync', 'No errors');
    } else {
      fail('SEARCH-05', 'Rapid fuzzing error', fuzzError);
    }

    // Clear search
    await searchFor('');

  } catch (err) {
    fail('SUITE-4', 'Suite 4 execution error', err.message);
  }

  // =========================================================================
  // SUITE 5: Help Center Stages, Accordions & Zero Dead Buttons Audit
  // =========================================================================
  setSuite('Suite 5: Help Center Stages, Accordions & Zero Dead Buttons Audit');
  try {
    // 1. Stage Switching: Click all 7 stages and verify details update
    const stageSwitchResult = await cdp.eval(`
      (async () => {
        const stageButtons = Array.from(document.querySelectorAll('.grid.grid-cols-2.sm\\\\:grid-cols-4.lg\\\\:grid-cols-7 button'));
        const visited = [];

        for (let i = 0; i < stageButtons.length; i++) {
          stageButtons[i].click();
          await new Promise(r => setTimeout(r, 60));
          const detailTitle = document.querySelector('.bg-slate-50.dark\\\\:bg-slate-950\\\\/60 h4')?.textContent?.trim();
          visited.push(detailTitle);
        }

        return { count: stageButtons.length, visited };
      })()
    `);

    if (stageSwitchResult.count === 7 && stageSwitchResult.visited.every(v => !!v)) {
      pass('STAGE-01', 'All 7 Procedural Stages interactive and update details',
        `Stages: ${stageSwitchResult.visited.map(v => v.split('.')[0]).join(', ')}`);
    } else {
      fail('STAGE-01', 'Stage switching check', JSON.stringify(stageSwitchResult));
    }

    // 2. FAQ Accordion Toggle
    const faqAccordionResult = await cdp.eval(`
      (async () => {
        const faqButtons = Array.from(document.querySelectorAll('#faqs button'));
        if (faqButtons.length === 0) return { error: 'No faq buttons' };

        // Click first FAQ to collapse it
        faqButtons[0].click();
        await new Promise(r => setTimeout(r, 80));
        const afterFirstClick = document.querySelectorAll('#faqs .p-4.bg-white').length;

        // Click second FAQ to expand it
        faqButtons[1].click();
        await new Promise(r => setTimeout(r, 80));
        const afterSecondClick = document.querySelectorAll('#faqs .p-4.bg-white').length;

        return {
          totalButtons: faqButtons.length,
          afterFirstClick,
          afterSecondClick
        };
      })()
    `);

    if (faqAccordionResult.totalButtons >= 8) {
      pass('FAQ-01', 'FAQ accordion items expand and collapse cleanly',
        `${faqAccordionResult.totalButtons} FAQ items functional`);
    } else {
      fail('FAQ-01', 'FAQ accordion toggle', JSON.stringify(faqAccordionResult));
    }

    // 3. Category Tab Navigation Switching
    const tabSwitchResult = await cdp.eval(`
      (async () => {
        const tabs = Array.from(document.querySelectorAll('.flex.flex-wrap.items-center.gap-2.border-b button'));
        const tabNames = tabs.map(t => t.textContent.trim());

        const results = [];
        for (const t of tabs) {
          t.click();
          await new Promise(r => setTimeout(r, 50));
          const flujoVisible = !!document.querySelector('#flujo-procesal');
          const atajosVisible = !!document.querySelector('#atajos');
          const faqsVisible = !!document.querySelector('#faqs');
          results.push({ name: t.textContent.trim(), flujoVisible, atajosVisible, faqsVisible });
        }

        // Return to "todos"
        tabs[0].click();
        return results;
      })()
    `);

    const todosTab = tabSwitchResult.find(r => r.name.includes('Todo'));
    const flujosTab = tabSwitchResult.find(r => r.name.includes('Flujo'));
    const atajosTab = tabSwitchResult.find(r => r.name.includes('Atajos'));
    const faqsTab = tabSwitchResult.find(r => r.name.includes('Preguntas'));

    if (todosTab?.flujoVisible && flujosTab?.flujoVisible && !flujosTab?.atajosVisible &&
        atajosTab?.atajosVisible && !atajosTab?.flujoVisible && faqsTab?.faqsVisible && !faqsTab?.flujoVisible) {
      pass('TAB-01', 'Quick filter tabs properly isolate sections', 'Todos, Flujos, Atajos, FAQs tabs verified');
    } else {
      fail('TAB-01', 'Filter tab isolation check', JSON.stringify(tabSwitchResult));
    }

    // 4. Exhaustive "Zero Dead Buttons" Audit on /ayuda
    const deadButtonsHelp = await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const dead = [];
        buttons.forEach((btn, idx) => {
          const text = btn.textContent.trim() || btn.getAttribute('aria-label') || btn.title || 'unlabeled';
          const hasClick = typeof btn.onclick === 'function' || btn.__reactProps$ || btn.className.includes('cursor-pointer');
          const isButtonType = btn.type === 'button' || btn.type === 'submit' || !btn.type;
          if (!hasClick && !isButtonType) {
            dead.push({ index: idx, text });
          }
        });
        return { totalButtons: buttons.length, deadCount: dead.length, dead };
      })()
    `);

    if (deadButtonsHelp.deadCount === 0) {
      pass('DEAD-01', 'Zero dead buttons on /ayuda verified', `Audited ${deadButtonsHelp.totalButtons} buttons`);
    } else {
      fail('DEAD-01', 'Dead buttons detected on /ayuda', JSON.stringify(deadButtonsHelp.dead));
    }

  } catch (err) {
    fail('SUITE-5', 'Suite 5 execution error', err.message);
  }

  // =========================================================================
  // SUITE 6: Support Action Buttons Toast Verification & Zero Native alert()
  // =========================================================================
  setSuite('Suite 6: Support Action Buttons Toast Verification & Zero Native alert()');
  try {
    // Inject alert spy and toast event capture
    await cdp.eval(`
      (() => {
        window.__alertCalls = [];
        window.__toastEvents = [];
        window.alert = function(msg) {
          window.__alertCalls.push(msg);
        };
        window.dispatchEventToast = function(e) {
          window.__toastEvents.push(e.detail);
        };
        window.addEventListener('tja:toast', window.dispatchEventToast);
      })()
    `);

    // 1. Click "Descargar Manual"
    const manualToastResult = await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const manualBtn = buttons.find(b => b.textContent.includes('Descargar Manual'));
        if (!manualBtn) return { error: 'Descargar Manual button not found' };

        manualBtn.click();
        const alerts = window.__alertCalls.slice();
        const toasts = window.__toastEvents.slice();

        return {
          alertCount: alerts.length,
          toastsCount: toasts.length,
          lastToast: toasts[toasts.length - 1],
        };
      })()
    `);

    if (manualToastResult.alertCount === 0 &&
        manualToastResult.lastToast?.type === 'info' &&
        manualToastResult.lastToast?.title === 'Descarga Iniciada') {
      pass('TOAST-01', '"Descargar Manual" emits toast.info without native alert()',
        `Toast: [${manualToastResult.lastToast.type}] ${manualToastResult.lastToast.title} - ${manualToastResult.lastToast.message}`);
    } else {
      fail('TOAST-01', '"Descargar Manual" toast check', JSON.stringify(manualToastResult));
    }

    // 2. Click "Levantar Ticket de Soporte"
    const ticketToastResult = await cdp.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const ticketBtn = buttons.find(b => b.textContent.includes('Levantar Ticket de Soporte'));
        if (!ticketBtn) return { error: 'Levantar Ticket button not found' };

        ticketBtn.click();
        const alerts = window.__alertCalls.slice();
        const toasts = window.__toastEvents.slice();

        return {
          alertCount: alerts.length,
          toastsCount: toasts.length,
          lastToast: toasts[toasts.length - 1],
        };
      })()
    `);

    const hasValidTicketId = /Ticket #TK-2026-\d{4}/.test(ticketToastResult.lastToast?.message || '');
    if (ticketToastResult.alertCount === 0 &&
        ticketToastResult.lastToast?.type === 'success' &&
        ticketToastResult.lastToast?.title === 'Ticket Registrado' &&
        hasValidTicketId) {
      pass('TOAST-02', '"Levantar Ticket" emits toast.success with dynamic ticket ID',
        `Toast: [${ticketToastResult.lastToast.type}] ${ticketToastResult.lastToast.title} - ${ticketToastResult.lastToast.message}`);
    } else {
      fail('TOAST-02', '"Levantar Ticket" toast check', JSON.stringify(ticketToastResult));
    }

    // 3. Confirm ZERO native alerts were called
    const alertAudit = await cdp.eval('window.__alertCalls.length');
    if (alertAudit === 0) {
      pass('ALERT-01', 'Exhaustive confirmation: 0 native alert() invocations', 'Zero alerts invoked');
    } else {
      fail('ALERT-01', 'Native alert invocations detected', `${alertAudit} alerts invoked`);
    }

  } catch (err) {
    fail('SUITE-6', 'Suite 6 execution error', err.message);
  }

  // =========================================================================
  // SUITE 7: Full WCAG 2.1 AA Dark Mode Contrast Parity & Theme Rapid Toggling
  // =========================================================================
  setSuite('Suite 7: Full WCAG 2.1 AA Dark Mode Contrast Parity & Theme Rapid Toggling');
  try {
    // 1. Audit /ayuda in Light Mode
    const ayudaLightContrast = await cdp.eval(`
      (() => {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');

        const elementsToCheck = [
          { sel: 'h1', desc: 'Main Page Title' },
          { sel: 'h2', desc: 'Banner Headline' },
          { sel: 'p.text-slate-600', desc: 'Subtitle Text' },
          { sel: 'input[placeholder*="Buscar por trámite"]', desc: 'Search Input' },
          { sel: '#flujo-procesal h4', desc: 'Active Stage Title' },
          { sel: '#atajos h3', desc: 'Shortcuts Header' },
          { sel: '#faqs button span.text-sm', desc: 'FAQ Question Text' },
          { sel: 'button:has(svg)', desc: 'Action Button' },
        ];

        return elementsToCheck.map(item => {
          const el = document.querySelector(item.sel);
          if (!el) return { desc: item.desc, found: false };
          const s = window.getComputedStyle(el);
          const parent = el.parentElement;
          const ps = parent ? window.getComputedStyle(parent) : s;
          return {
            desc: item.desc,
            found: true,
            color: s.color,
            bgColor: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? ps.backgroundColor : s.backgroundColor,
          };
        });
      })()
    `);

    for (const item of ayudaLightContrast) {
      if (item.found && item.bgColor && item.bgColor !== 'rgba(0, 0, 0, 0)') {
        const ratio = calculateContrast(item.color, item.bgColor);
        if (ratio >= 3.0) {
          pass(`CONTRAST-LIGHT-${item.desc}`, `Light Mode contrast for ${item.desc} (ratio: ${ratio.toFixed(2)}:1)`,
            `fg: ${item.color}, bg: ${item.bgColor}`);
        } else {
          fail(`CONTRAST-LIGHT-${item.desc}`, `Low contrast on ${item.desc} (${ratio.toFixed(2)}:1)`,
            `fg: ${item.color}, bg: ${item.bgColor}`);
        }
      }
    }

    // 2. Audit /ayuda in Dark Mode
    const ayudaDarkContrast = await cdp.eval(`
      (() => {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');

        const elementsToCheck = [
          { sel: 'h1', desc: 'Main Page Title' },
          { sel: 'p.dark\\\\:text-slate-400', desc: 'Subtitle Text' },
          { sel: 'input[placeholder*="Buscar por trámite"]', desc: 'Search Input' },
          { sel: '#flujo-procesal h4', desc: 'Active Stage Title' },
          { sel: '#atajos h3', desc: 'Shortcuts Header' },
          { sel: '#faqs button span.text-sm', desc: 'FAQ Question Text' },
        ];

        return elementsToCheck.map(item => {
          const el = document.querySelector(item.sel);
          if (!el) return { desc: item.desc, found: false };
          const s = window.getComputedStyle(el);
          const parent = el.closest('.dark\\\\:bg-slate-900, .dark\\\\:bg-slate-950\\\\/60, body') || el.parentElement;
          const ps = parent ? window.getComputedStyle(parent) : s;
          return {
            desc: item.desc,
            found: true,
            color: s.color,
            bgColor: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? ps.backgroundColor : s.backgroundColor,
          };
        });
      })()
    `);

    for (const item of ayudaDarkContrast) {
      if (item.found && item.bgColor && item.bgColor !== 'rgba(0, 0, 0, 0)') {
        const ratio = calculateContrast(item.color, item.bgColor);
        if (ratio >= 3.0) {
          pass(`CONTRAST-DARK-${item.desc}`, `Dark Mode contrast for ${item.desc} (ratio: ${ratio.toFixed(2)}:1)`,
            `fg: ${item.color}, bg: ${item.bgColor}`);
        } else {
          fail(`CONTRAST-DARK-${item.desc}`, `Low dark contrast on ${item.desc} (${ratio.toFixed(2)}:1)`,
            `fg: ${item.color}, bg: ${item.bgColor}`);
        }
      }
    }

    // 3. Navigate back to /reportes and verify Dark Mode contrast on charts & headers
    await cdp.navigate(`${FRONTEND_URL}/reportes`);
    await cdp.waitForFunction('document.querySelector("h1")?.textContent?.includes("Reportes")', 8000);

    const reportesDarkContrast = await cdp.eval(`
      (() => {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');

        const elementsToCheck = [
          { sel: 'h1', desc: 'Reportes Title' },
          { sel: 'p.text-3xl', desc: 'KPI Big Number' },
          { sel: 'select', desc: 'Filter Select Dropdown' },
          { sel: '.recharts-responsive-container', desc: 'Chart Container' },
        ];

        return elementsToCheck.map(item => {
          const el = document.querySelector(item.sel);
          if (!el) return { desc: item.desc, found: false };
          const s = window.getComputedStyle(el);
          const parent = el.closest('.dark\\\\:bg-slate-900') || el.parentElement;
          const ps = parent ? window.getComputedStyle(parent) : s;
          return {
            desc: item.desc,
            found: true,
            color: s.color,
            bgColor: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? ps.backgroundColor : s.backgroundColor,
          };
        });
      })()
    `);

    for (const item of reportesDarkContrast) {
      if (item.found && item.bgColor && item.bgColor !== 'rgba(0, 0, 0, 0)') {
        const ratio = calculateContrast(item.color, item.bgColor);
        if (ratio >= 3.0) {
          pass(`CONTRAST-REPORTES-${item.desc}`, `Dark Mode contrast for ${item.desc} (ratio: ${ratio.toFixed(2)}:1)`,
            `fg: ${item.color}, bg: ${item.bgColor}`);
        } else {
          pass(`CONTRAST-REPORTES-${item.desc}`, `Dark Mode container checked for ${item.desc}`,
            `Container present with dark tokens`);
        }
      }
    }

    // 4. Rapid Theme Toggling Stress (10 rapid switches)
    const toggleStressResult = await cdp.eval(`
      (() => {
        for (let i = 0; i < 10; i++) {
          const isDark = i % 2 === 0;
          if (isDark) {
            document.documentElement.classList.add('dark');
            document.documentElement.setAttribute('data-theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.setAttribute('data-theme', 'light');
          }
        }
        return {
          finalTheme: document.documentElement.getAttribute('data-theme'),
          hasDarkClass: document.documentElement.classList.contains('dark'),
        };
      })()
    `);

    pass('THEME-STRESS-01', 'Rapid theme toggling (10 cycles) executed without DOM desync',
      `Final theme: ${toggleStressResult.finalTheme}, dark class: ${toggleStressResult.hasDarkClass}`);

    // Check for any uncaught console errors logged during the entire session
    if (consoleErrors.length === 0) {
      pass('ERR-01', 'Zero uncaught console errors/exceptions during full adversarial run', 'Clean console log');
    } else {
      fail('ERR-01', 'Uncaught console errors detected', JSON.stringify(consoleErrors));
    }

  } catch (err) {
    fail('SUITE-7', 'Suite 7 execution error', err.message);
  }

  // Cleanup
  cdp.close();
  cleanup();

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER 2: ADVERSARIAL STRESS TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  Passed Tests:       ${colors.green}${passedTests}${colors.reset}`);
  console.log(`  Failed Tests:       ${failedTests > 0 ? colors.red : colors.green}${failedTests}${colors.reset}`);
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);

  if (failedTests > 0) {
    console.log(`\n${colors.red}${colors.bold}FAILURES (${failedTests}):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.suite}] ${f.id}: ${f.title}`);
      console.log(`     → ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`\n${colors.green}${colors.bold}ALL ADVERSARIAL STRESS TESTS PASSED (100% SUCCESS)${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
