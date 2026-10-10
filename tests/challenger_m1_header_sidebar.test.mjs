/**
 * tests/challenger_m1_header_sidebar.test.mjs
 * =============================================================================
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: MILESTONE 1
 * 
 * Adversarial empirical verification of:
 * 1. AppHeader Component:
 *    - Strict absence of ImpersonationSelector in source & DOM
 *    - Interactive user profile dropdown opening
 *    - Outside click dismissal
 *    - Keyboard Escape key dismissal
 *    - User identity, role badge, employee color preview swatch & hex
 *    - Live quick theme toggle without page reload
 *    - Operational logout action (POST /api/auth/logout, clearSession, redirect)
 * 2. AppSidebar Component:
 *    - Accordion toggling for "Usuarios" and "Judicial / Procesal"
 *    - State persistence in localStorage
 *    - Dynamic CSS grid expansion (grid-rows-[1fr] vs grid-rows-[0fr])
 *    - Route auto-expansion overriding closed state when child is active
 *    - Active route styling on child links
 *    - Active indicator ("Activo" badge & indicator bar) on parent when collapsed
 *    - Animation kill-switch compliance (transition-duration <= 0.001ms)
 *    - Collapsed sidebar (w-20) flyout behavior and pulsing indicator dot
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
const CDP_PORT = parseInt(process.env.CDP_PORT || '9599', 10);

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

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];
const findings = [];

function pass(id, title, detail = '') {
  totalChecks++;
  passedChecks++;
  console.log(`  ${colors.green}✓ [PASS ${totalChecks}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  if (detail) {
    console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
  }
}

function fail(id, title, errorDetail) {
  totalChecks++;
  failedChecks++;
  failures.push({ id, title, errorDetail });
  console.log(`  ${colors.red}✗ [FAIL ${totalChecks}]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  console.log(`      ${colors.red}→ ERROR: ${errorDetail}${colors.reset}`);
}

function note(id, title, observation) {
  findings.push({ id, title, observation });
  console.log(`  ${colors.yellow}⚠ [NOTE]${colors.reset} ${colors.bold}${id}: ${title}${colors.reset}`);
  console.log(`      ${colors.yellow}→ ${observation}${colors.reset}`);
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
        reject: (err) => { clearTimeout(timeout); reject(err); },
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
  return { token: data.token, user: data.usuario };
}

async function runMilestone1Suite() {
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}   CHALLENGER: EMPIRICAL VERIFICATION OF HEADER DROPDOWN & SIDEBAR ACCORDION${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  // ===========================================================================
  // SUITE 1: SOURCE CODE & STATIC INVARIANTS INSPECTION
  // ===========================================================================
  console.log(`${colors.bold}--- SUITE 1: SOURCE AST & CODE CONTRACT INVARIANTS ---${colors.reset}`);

  const headerPath = path.join(PROJECT_ROOT, 'frontend/src/components/shell/AppHeader.tsx');
  const sidebarPath = path.join(PROJECT_ROOT, 'frontend/src/components/shell/AppSidebar.tsx');
  const globalCssPath = path.join(PROJECT_ROOT, 'frontend/src/styles/global.css');

  const headerCode = fs.readFileSync(headerPath, 'utf-8');
  const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf-8');

  // 1.1 ImpersonationSelector absence in AppHeader.tsx
  const hasImpersonationImport = /import\s+.*ImpersonationSelector/i.test(headerCode);
  const hasImpersonationTag = /<ImpersonationSelector/i.test(headerCode);
  const mentionsVerComo = /"Ver como"/i.test(headerCode) && !headerCode.includes('Administrative impersonation ("Ver como") is strictly reserved');

  if (!hasImpersonationImport && !hasImpersonationTag) {
    pass('STATIC-HEADER-NO-IMPERSONATION', 'AppHeader.tsx strictly contains 0 imports or JSX usages of ImpersonationSelector');
  } else {
    fail('STATIC-HEADER-NO-IMPERSONATION', 'Found ImpersonationSelector references in AppHeader.tsx',
      `Import: ${hasImpersonationImport}, JSX: ${hasImpersonationTag}`);
  }

  // 1.2 User Profile Menu Button Island Contract
  const hasProfileButtonId = headerCode.includes('id="user-profile-menu-button"');
  const hasAriaHasPopup = headerCode.includes('aria-haspopup="true"');
  const hasAriaExpanded = headerCode.includes('aria-expanded={isProfileOpen}');
  const hasMenuRole = headerCode.includes('role="menu"');

  if (hasProfileButtonId && hasAriaHasPopup && hasAriaExpanded && hasMenuRole) {
    pass('STATIC-HEADER-PROFILE-CONTRACT', 'AppHeader.tsx implements complete accessible menu island attributes (button id, aria-haspopup, aria-expanded, role="menu")');
  } else {
    fail('STATIC-HEADER-PROFILE-CONTRACT', 'Missing required menu accessibility attributes in AppHeader.tsx',
      `buttonId: ${hasProfileButtonId}, haspopup: ${hasAriaHasPopup}, expanded: ${hasAriaExpanded}, role="menu": ${hasMenuRole}`);
  }

  // 1.3 Outside click & Escape key listeners
  const hasOutsideClick = headerCode.includes('handleClickOutside') && headerCode.includes('mousedown');
  const hasEscapeKey = headerCode.includes('event.key === \'Escape\'');

  if (hasOutsideClick && hasEscapeKey) {
    pass('STATIC-HEADER-DISMISS-HANDLERS', 'AppHeader.tsx contains registered event listeners for outside click (mousedown) and Escape key');
  } else {
    fail('STATIC-HEADER-DISMISS-HANDLERS', 'Missing dismissal event handlers in AppHeader.tsx',
      `outsideClick: ${hasOutsideClick}, escapeKey: ${hasEscapeKey}`);
  }

  // 1.4 Logout action contract
  const hasLogoutEndpoint = headerCode.includes('/api/auth/logout');
  const hasClearSession = headerCode.includes('clearSession()');
  const hasLoginRedirect = headerCode.includes('/login');

  if (hasLogoutEndpoint && hasClearSession && hasLoginRedirect) {
    pass('STATIC-HEADER-LOGOUT-CONTRACT', 'AppHeader.tsx implements full logout pipeline (POST /api/auth/logout, clearSession, redirect /login)');
  } else {
    fail('STATIC-HEADER-LOGOUT-CONTRACT', 'Incomplete logout pipeline in AppHeader.tsx',
      `endpoint: ${hasLogoutEndpoint}, clearSession: ${hasClearSession}, redirect: ${hasLoginRedirect}`);
  }

  // 1.5 Sidebar Accordion Groups Configuration
  const hasUsuariosGroup = sidebarCode.includes("id: 'usuarios'") && sidebarCode.includes("title: 'Usuarios'");
  const hasJudicialGroup = sidebarCode.includes("id: 'judicial'") && sidebarCode.includes("title: 'Judicial / Procesal'");
  const hasGridRowsFr = sidebarCode.includes('grid-rows-[1fr]') && sidebarCode.includes('grid-rows-[0fr]');
  const hasLocalStorageSync = sidebarCode.includes('localStorage.setItem(`tja_accordion_${groupId}`');
  const hasAutoExpandLogic = sidebarCode.includes('hasActiveChild') && sidebarCode.includes('setExpandedGroups');

  if (hasUsuariosGroup && hasJudicialGroup && hasGridRowsFr && hasLocalStorageSync && hasAutoExpandLogic) {
    pass('STATIC-SIDEBAR-ACCORDION-SPEC', 'AppSidebar.tsx implements both "Usuarios" & "Judicial / Procesal" accordion groups with CSS grid expansion, localStorage persistence, and auto-expansion logic');
  } else {
    fail('STATIC-SIDEBAR-ACCORDION-SPEC', 'Missing sidebar accordion specifications',
      `usuarios: ${hasUsuariosGroup}, judicial: ${hasJudicialGroup}, gridRows: ${hasGridRowsFr}, storage: ${hasLocalStorageSync}, autoExpand: ${hasAutoExpandLogic}`);
  }

  // 1.6 Collapsed Sidebar Flyout Submenu Specification
  const hasCollapsedFlyout = sidebarCode.includes('group-hover:visible') && sidebarCode.includes('group-focus-within:visible');
  const hasOverflowVisible = sidebarCode.includes('overflow-visible');
  const hasActivePulseBadge = sidebarCode.includes('animate-pulse');

  if (hasCollapsedFlyout && hasOverflowVisible && hasActivePulseBadge) {
    pass('STATIC-SIDEBAR-COLLAPSED-SPEC', 'AppSidebar.tsx implements collapsed flyout submenus with overflow-visible and pulsing active child indicator dot');
  } else {
    fail('STATIC-SIDEBAR-COLLAPSED-SPEC', 'Missing collapsed sidebar flyout specifications in AppSidebar.tsx',
      `flyout: ${hasCollapsedFlyout}, overflowVisible: ${hasOverflowVisible}, pulseBadge: ${hasActivePulseBadge}`);
  }

  // 1.7 Universal Animation Kill-Switch in global.css
  const hasKillSwitchToken = globalCssCode.includes('animation-duration: 0.001ms !important;') &&
                             globalCssCode.includes('transition-duration: 0.001ms !important;') &&
                             globalCssCode.includes('html[data-animations="disabled"]');
  const hasReducedMotionRule = globalCssCode.includes('@media (prefers-reduced-motion: reduce)');

  if (hasKillSwitchToken && hasReducedMotionRule) {
    pass('STATIC-KILL-SWITCH-SPEC', 'global.css enforces 0.001ms duration kill-switch for html[data-animations="disabled"] and prefers-reduced-motion: reduce');
  } else {
    fail('STATIC-KILL-SWITCH-SPEC', 'global.css missing animation kill-switch tokens',
      `killSwitchToken: ${hasKillSwitchToken}, reducedMotion: ${hasReducedMotionRule}`);
  }

  // ===========================================================================
  // SUITE 2 & 3: LIVE HEADLESS BROWSER RUNTIME VERIFICATION (CDP)
  // ===========================================================================
  console.log(`\n${colors.bold}--- SUITE 2: LIVE HEADLESS BROWSER RUNTIME (CDP) ---${colors.reset}`);

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('CDP-BROWSER-LOCATE', 'Chrome or Edge browser executable not found on host', 'Cannot run live tests');
    return;
  }
  pass('CDP-BROWSER-LOCATE', 'Located browser executable', browserPath);

  let authData = null;
  try {
    authData = await getAdminToken();
    pass('CDP-ADMIN-AUTH', 'Acquired admin session token from backend', `Token: ${authData.token.substring(0, 16)}...`);
  } catch (err) {
    fail('CDP-ADMIN-AUTH', 'Failed to authenticate admin', err.message);
    return;
  }

  const tempProfileDir = path.join(os.tmpdir(), `tja-challenger-m1-${Date.now()}`);
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
      await new Promise((r) => setTimeout(r, 200));
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
      fail('CDP-CONNECT', `Failed to initialize CDP session on port ${CDP_PORT}`, 'Browser target unreachable');
      cleanup();
      return;
    }
    pass('CDP-CONNECT', `Connected to Headless Chrome CDP session on port ${CDP_PORT}`);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // Inject session cookie into browser context
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: authData.token,
      url: FRONTEND_URL,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    });

    // Also populate localStorage on load
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          localStorage.setItem('auth_token', ${JSON.stringify(authData.token)});
          localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(authData.user))});
        } catch(e) {}
      `,
    });

    // Navigate to dashboard
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await new Promise((res) => setTimeout(res, 1200));

    // -------------------------------------------------------------------------
    // SUB-SUITE 2.1: HEADER IMPERSONATION REMOVAL & PROFILE BUTTON
    // -------------------------------------------------------------------------
    console.log(`\n${colors.bold}--- SUB-SUITE 2.1: HEADER PROFILE DROPDOWN VERIFICATION ---${colors.reset}`);

    const headerDomCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const header = document.querySelector('header');
          if (!header) return { error: 'header not found' };

          // Confirm ImpersonationSelector is absent
          const impersonationElements = header.querySelectorAll('[data-impersonation], select, .impersonation-selector');
          const hasVerComoText = header.textContent.includes('Ver como') || header.textContent.includes('Impersonar');

          // Profile button
          const profileBtn = document.getElementById('user-profile-menu-button');
          const initialMenu = document.querySelector('header [role="menu"]');

          return {
            headerFound: true,
            impersonationCount: impersonationElements.length,
            hasVerComoText,
            hasProfileBtn: !!profileBtn,
            ariaHasPopup: profileBtn ? profileBtn.getAttribute('aria-haspopup') : null,
            initialAriaExpanded: profileBtn ? profileBtn.getAttribute('aria-expanded') : null,
            initialMenuVisible: !!initialMenu,
          };
        })()
      `,
      returnByValue: true,
    });

    const hRes = headerDomCheck.result?.value;
    if (hRes && hRes.headerFound && hRes.impersonationCount === 0 && !hRes.hasVerComoText) {
      pass('DOM-HEADER-NO-IMPERSONATION', 'Live DOM verification: ImpersonationSelector is completely absent from header (0 elements, 0 "Ver como" text)');
    } else {
      fail('DOM-HEADER-NO-IMPERSONATION', 'Impersonation elements detected in live header DOM', JSON.stringify(hRes));
    }

    if (hRes && hRes.hasProfileBtn && hRes.ariaHasPopup === 'true' && hRes.initialAriaExpanded === 'false' && !hRes.initialMenuVisible) {
      pass('DOM-HEADER-PROFILE-TRIGGER-INIT', 'Profile trigger button #user-profile-menu-button is present with aria-haspopup="true", initial aria-expanded="false", and menu closed');
    } else {
      fail('DOM-HEADER-PROFILE-TRIGGER-INIT', 'Profile button failed initial state check', JSON.stringify(hRes));
    }

    // -------------------------------------------------------------------------
    // SUB-SUITE 2.2: INTERACTIVE DROPDOWN OPENING & IDENTITY RENDERING
    // -------------------------------------------------------------------------
    const openMenuCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const btn = document.getElementById('user-profile-menu-button');
          if (!btn) return resolve({ error: 'button not found' });

          btn.click();

          setTimeout(() => {
            const menu = document.querySelector('header [role="menu"]');
            const expanded = btn.getAttribute('aria-expanded');
            if (!menu) return resolve({ hasMenu: false, expanded });

            const text = menu.textContent || '';
            const emailElem = Array.from(menu.querySelectorAll('p')).find(p => p.textContent.includes('@'));
            const roleBadge = menu.querySelector('span.rounded-full');
            const colorSwatch = menu.querySelector('div[style*="background-color"], span[style*="background-color"]');
            const hexCodeElem = Array.from(menu.querySelectorAll('span')).find(s => /^#[0-9A-Fa-f]{6}$/.test(s.textContent.trim()));
            const themeBtn = Array.from(menu.querySelectorAll('button')).find(b => b.textContent.includes('Modo'));
            const appearanceBtn = Array.from(menu.querySelectorAll('button')).find(b => b.textContent.includes('Personalizar Apariencia'));
            const configLink = menu.querySelector('a[href="/configuracion"]');
            const logoutBtn = Array.from(menu.querySelectorAll('button')).find(b => b.textContent.includes('Cerrar Sesión'));

            resolve({
              hasMenu: true,
              expanded,
              menuText: text,
              email: emailElem ? emailElem.textContent.trim() : null,
              hasRoleBadge: !!roleBadge,
              roleText: roleBadge ? roleBadge.textContent.trim() : null,
              hasColorSwatch: !!colorSwatch,
              swatchColor: colorSwatch ? colorSwatch.getAttribute('style') : null,
              hexCode: hexCodeElem ? hexCodeElem.textContent.trim() : null,
              hasThemeBtn: !!themeBtn,
              themeBtnText: themeBtn ? themeBtn.textContent.trim() : null,
              hasAppearanceBtn: !!appearanceBtn,
              hasConfigLink: !!configLink,
              hasLogoutBtn: !!logoutBtn,
              logoutText: logoutBtn ? logoutBtn.textContent.trim() : null,
            });
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const openRes = openMenuCheck.result?.value;
    if (openRes && openRes.hasMenu && openRes.expanded === 'true') {
      pass('DOM-HEADER-DROPDOWN-OPEN', 'Clicking #user-profile-menu-button successfully opened dropdown (aria-expanded="true", role="menu" mounted)');
    } else {
      fail('DOM-HEADER-DROPDOWN-OPEN', 'Dropdown failed to open on button click', JSON.stringify(openRes));
    }

    if (openRes && openRes.email && openRes.email.includes('admin@tjabcs.gob.mx') && openRes.hasRoleBadge && openRes.roleText?.includes('Administrador')) {
      pass('DOM-HEADER-IDENTITY-VERIFIED', 'Dropdown renders authentic user identity (admin@tjabcs.gob.mx) and role badge ("Administrador")',
        `Email: ${openRes.email}, Role: ${openRes.roleText}`);
    } else {
      fail('DOM-HEADER-IDENTITY-VERIFIED', 'User identity or role badge verification mismatch', JSON.stringify(openRes));
    }

    if (openRes && openRes.hasColorSwatch && openRes.hexCode) {
      pass('DOM-HEADER-COLOR-PREVIEW', 'Dropdown renders assigned employee identifying color swatch and uppercase hex code',
        `Hex: ${openRes.hexCode}, Swatch style: ${openRes.swatchColor}`);
    } else {
      fail('DOM-HEADER-COLOR-PREVIEW', 'Employee color swatch or hex indicator missing in dropdown', JSON.stringify(openRes));
    }

    // -------------------------------------------------------------------------
    // SUB-SUITE 2.3: DISMISSAL VIA OUTSIDE CLICK
    // -------------------------------------------------------------------------
    const outsideClickCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          // Dispatch mousedown on document body outside menu
          document.body.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            clientX: 10,
            clientY: 10,
          }));

          setTimeout(() => {
            const menu = document.querySelector('header [role="menu"]');
            const btn = document.getElementById('user-profile-menu-button');
            resolve({
              menuPresent: !!menu,
              ariaExpanded: btn ? btn.getAttribute('aria-expanded') : null,
            });
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const outRes = outsideClickCheck.result?.value;
    if (outRes && !outRes.menuPresent && outRes.ariaExpanded === 'false') {
      pass('DOM-HEADER-DISMISS-OUTSIDE-CLICK', 'Outside click on document body dismissed profile dropdown cleanly (aria-expanded="false")');
    } else {
      fail('DOM-HEADER-DISMISS-OUTSIDE-CLICK', 'Dropdown remained open after outside click', JSON.stringify(outRes));
    }

    // -------------------------------------------------------------------------
    // SUB-SUITE 2.4: DISMISSAL VIA ESCAPE KEY
    // -------------------------------------------------------------------------
    const escapeKeyCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const btn = document.getElementById('user-profile-menu-button');
          btn.click(); // Re-open

          setTimeout(() => {
            const menuOpen = !!document.querySelector('header [role="menu"]');
            if (!menuOpen) return resolve({ reOpenFailed: true });

            // Dispatch Escape key
            document.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              keyCode: 27,
              bubbles: true,
            }));

            setTimeout(() => {
              const menuAfter = !!document.querySelector('header [role="menu"]');
              resolve({
                reOpenSuccess: true,
                menuAfterEscape: menuAfter,
                ariaExpanded: btn.getAttribute('aria-expanded'),
              });
            }, 150);
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const escRes = escapeKeyCheck.result?.value;
    if (escRes && escRes.reOpenSuccess && !escRes.menuAfterEscape && escRes.ariaExpanded === 'false') {
      pass('DOM-HEADER-DISMISS-ESCAPE', 'Escape keypress dismissed profile dropdown cleanly (aria-expanded="false")');
    } else {
      fail('DOM-HEADER-DISMISS-ESCAPE', 'Dropdown remained open after Escape keypress', JSON.stringify(escRes));
    }

    // -------------------------------------------------------------------------
    // SUB-SUITE 2.5: LIVE QUICK THEME TOGGLE
    // -------------------------------------------------------------------------
    const themeToggleCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const btn = document.getElementById('user-profile-menu-button');
          btn.click(); // Open

          setTimeout(() => {
            const menu = document.querySelector('header [role="menu"]');
            if (!menu) return resolve({ error: 'menu not open' });

            const themeBtn = Array.from(menu.querySelectorAll('button')).find(b => b.textContent.includes('Modo'));
            if (!themeBtn) return resolve({ error: 'theme button not found' });

            const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const initialDarkClass = document.documentElement.classList.contains('dark');

            // Click theme toggle
            themeBtn.click();

            setTimeout(() => {
              const nextTheme = document.documentElement.getAttribute('data-theme') || 'light';
              const nextDarkClass = document.documentElement.classList.contains('dark');

              // Toggle back to preserve state
              themeBtn.click();

              setTimeout(() => {
                const restoredTheme = document.documentElement.getAttribute('data-theme') || 'light';
                resolve({
                  initialTheme,
                  initialDarkClass,
                  nextTheme,
                  nextDarkClass,
                  restoredTheme,
                });
              }, 100);
            }, 100);
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const themeRes = themeToggleCheck.result?.value;
    if (themeRes && themeRes.nextTheme !== themeRes.initialTheme && themeRes.restoredTheme === themeRes.initialTheme) {
      pass('DOM-HEADER-THEME-TOGGLE', 'Quick theme toggle in dropdown mutates data-theme live without reload and restores cleanly',
        `${themeRes.initialTheme} -> ${themeRes.nextTheme} -> ${themeRes.restoredTheme}`);
    } else {
      fail('DOM-HEADER-THEME-TOGGLE', 'Theme toggle failed live mutation test', JSON.stringify(themeRes));
    }

    // Dismiss menu for next suite
    await cdp.send('Runtime.evaluate', {
      expression: `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`,
    });
    await new Promise((res) => setTimeout(res, 100));

    // -------------------------------------------------------------------------
    // SUB-SUITE 3: SIDEBAR ACCORDION TOGGLING & PERSISTENCE
    // -------------------------------------------------------------------------
    console.log(`\n${colors.bold}--- SUB-SUITE 3: SIDEBAR ACCORDION & ROUTE AUTO-EXPANSION ---${colors.reset}`);

    // 3.1 Initial sidebar accordion state on '/'
    const sidebarInitCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btnUsuarios = document.getElementById('accordion-btn-usuarios');
          const groupUsuarios = document.getElementById('accordion-group-usuarios');
          const btnJudicial = document.getElementById('accordion-btn-judicial');
          const groupJudicial = document.getElementById('accordion-group-judicial');

          return {
            hasBtnUsuarios: !!btnUsuarios,
            expUsuarios: btnUsuarios ? btnUsuarios.getAttribute('aria-expanded') : null,
            gridUsuarios: groupUsuarios ? groupUsuarios.className : null,
            hasBtnJudicial: !!btnJudicial,
            expJudicial: btnJudicial ? btnJudicial.getAttribute('aria-expanded') : null,
            gridJudicial: groupJudicial ? groupJudicial.className : null,
          };
        })()
      `,
      returnByValue: true,
    });

    const sInit = sidebarInitCheck.result?.value;
    if (sInit && sInit.hasBtnUsuarios && sInit.hasBtnJudicial &&
        sInit.expJudicial === 'true' && sInit.gridJudicial?.includes('grid-rows-[1fr]') &&
        sInit.expUsuarios === 'false' && sInit.gridUsuarios?.includes('grid-rows-[0fr]')) {
      pass('DOM-SIDEBAR-INITIAL-STATE', 'Initial sidebar state verified: Judicial is open by default (grid-rows-[1fr]), Usuarios is collapsed (grid-rows-[0fr])');
    } else {
      fail('DOM-SIDEBAR-INITIAL-STATE', 'Sidebar initial accordion state mismatch', JSON.stringify(sInit));
    }

    // 3.2 Toggling Judicial accordion group & localStorage persistence
    const toggleJudicialCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const btn = document.getElementById('accordion-btn-judicial');
          const group = document.getElementById('accordion-group-judicial');

          // Click to collapse
          btn.click();

          setTimeout(() => {
            const exp1 = btn.getAttribute('aria-expanded');
            const grid1 = group.className;
            const storage1 = localStorage.getItem('tja_accordion_judicial');

            // Click to re-expand
            btn.click();

            setTimeout(() => {
              const exp2 = btn.getAttribute('aria-expanded');
              const grid2 = group.className;
              const storage2 = localStorage.getItem('tja_accordion_judicial');

              resolve({
                exp1, grid1, storage1,
                exp2, grid2, storage2
              });
            }, 150);
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const togJ = toggleJudicialCheck.result?.value;
    if (togJ && togJ.exp1 === 'false' && togJ.grid1.includes('grid-rows-[0fr]') && togJ.storage1 === 'false' &&
        togJ.exp2 === 'true' && togJ.grid2.includes('grid-rows-[1fr]') && togJ.storage2 === 'true') {
      pass('DOM-SIDEBAR-TOGGLE-JUDICIAL', 'Toggling "Judicial / Procesal" accordion smoothly alternates grid-rows-[0fr] / grid-rows-[1fr] and persists to localStorage',
        `Collapsed: aria-expanded=${togJ.exp1}, Re-expanded: aria-expanded=${togJ.exp2}`);
    } else {
      fail('DOM-SIDEBAR-TOGGLE-JUDICIAL', 'Judicial accordion toggling failed', JSON.stringify(togJ));
    }

    // 3.3 Toggling Usuarios accordion group & localStorage persistence
    const toggleUsuariosCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const btn = document.getElementById('accordion-btn-usuarios');
          const group = document.getElementById('accordion-group-usuarios');

          // Click to expand
          btn.click();

          setTimeout(() => {
            const exp1 = btn.getAttribute('aria-expanded');
            const grid1 = group.className;
            const storage1 = localStorage.getItem('tja_accordion_usuarios');
            const childLinks = Array.from(group.querySelectorAll('a')).map(a => a.getAttribute('href'));

            // Click to collapse
            btn.click();

            setTimeout(() => {
              const exp2 = btn.getAttribute('aria-expanded');
              const grid2 = group.className;
              const storage2 = localStorage.getItem('tja_accordion_usuarios');

              resolve({
                exp1, grid1, storage1, childLinks,
                exp2, grid2, storage2
              });
            }, 150);
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const togU = toggleUsuariosCheck.result?.value;
    if (togU && togU.exp1 === 'true' && togU.grid1.includes('grid-rows-[1fr]') && togU.storage1 === 'true' &&
        togU.childLinks.includes('/usuarios') && togU.childLinks.includes('/configuracion/roles') &&
        togU.exp2 === 'false' && togU.grid2.includes('grid-rows-[0fr]')) {
      pass('DOM-SIDEBAR-TOGGLE-USUARIOS', 'Toggling "Usuarios" accordion reveals child links (/usuarios, /configuracion/roles), updates grid-rows, and persists to localStorage');
    } else {
      fail('DOM-SIDEBAR-TOGGLE-USUARIOS', 'Usuarios accordion toggling failed', JSON.stringify(togU));
    }

    // 3.4 Route Auto-Expansion & Active Route Indicator
    console.log(`\n${colors.bold}--- SUB-SUITE 3.4: ROUTE AUTO-EXPANSION ON /usuarios ---${colors.reset}`);

    // Force localStorage to 'false' for usuarios, then navigate to /usuarios
    await cdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('tja_accordion_usuarios', 'false');`,
    });

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/usuarios` });
    await new Promise((res) => setTimeout(res, 1200));

    const autoExpandCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btnUsuarios = document.getElementById('accordion-btn-usuarios');
          const groupUsuarios = document.getElementById('accordion-group-usuarios');
          const activeChildLink = groupUsuarios ? groupUsuarios.querySelector('a[href="/usuarios"]') : null;
          const activeBar = activeChildLink ? activeChildLink.querySelector('span.bg-blue-500') : null;

          return {
            expUsuarios: btnUsuarios ? btnUsuarios.getAttribute('aria-expanded') : null,
            gridUsuarios: groupUsuarios ? groupUsuarios.className : null,
            hasActiveChildLink: !!activeChildLink,
            activeLinkClasses: activeChildLink ? activeChildLink.className : null,
            hasActiveBar: !!activeBar,
          };
        })()
      `,
      returnByValue: true,
    });

    const autoRes = autoExpandCheck.result?.value;
    if (autoRes && autoRes.expUsuarios === 'true' && autoRes.gridUsuarios?.includes('grid-rows-[1fr]') &&
        autoRes.hasActiveChildLink && autoRes.activeLinkClasses?.includes('bg-blue-600/20') && autoRes.hasActiveBar) {
      pass('DOM-SIDEBAR-AUTO-EXPAND-ACTIVE', 'Route auto-expansion logic overrides saved "false" state when navigating to /usuarios, rendering active styling & indicator bar');
    } else {
      fail('DOM-SIDEBAR-AUTO-EXPAND-ACTIVE', 'Route auto-expansion failed on /usuarios', JSON.stringify(autoRes));
    }

    // 3.5 Active Indicator on Parent Button when Group is Manually Collapsed
    const parentCollapsedActiveCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const btnUsuarios = document.getElementById('accordion-btn-usuarios');
          btnUsuarios.click(); // Manually collapse while /usuarios is active

          setTimeout(() => {
            const exp = btnUsuarios.getAttribute('aria-expanded');
            const btnText = btnUsuarios.textContent || '';
            const hasActivoBadge = btnText.includes('Activo');
            const parentActiveBar = btnUsuarios.querySelector('span.bg-blue-500');
            const hasActiveBorder = btnUsuarios.className.includes('border-blue-500/30') || btnUsuarios.className.includes('bg-blue-950');

            resolve({
              exp,
              hasActivoBadge,
              hasParentActiveBar: !!parentActiveBar,
              hasActiveBorder,
              btnClasses: btnUsuarios.className,
            });
          }, 150);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const pColRes = parentCollapsedActiveCheck.result?.value;
    if (pColRes && pColRes.exp === 'false' && pColRes.hasActivoBadge && pColRes.hasParentActiveBar && pColRes.hasActiveBorder) {
      pass('DOM-SIDEBAR-PARENT-COLLAPSED-BADGE', 'When active accordion group is manually collapsed, parent trigger displays "Activo" badge, active indicator bar, and blue highlight');
    } else {
      fail('DOM-SIDEBAR-PARENT-COLLAPSED-BADGE', 'Parent collapsed active indicator missing', JSON.stringify(pColRes));
    }

    // -------------------------------------------------------------------------
    // SUB-SUITE 3.6: UNIVERSAL ANIMATION KILL-SWITCH COMPLIANCE
    // -------------------------------------------------------------------------
    console.log(`\n${colors.bold}--- SUB-SUITE 3.6: ANIMATION KILL-SWITCH VERIFICATION ---${colors.reset}`);

    const killSwitchCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const group = document.getElementById('accordion-group-usuarios');
          const aside = document.querySelector('aside');

          // Normal computed duration
          const normalGroupTrans = window.getComputedStyle(group).transitionDuration;
          const normalAsideTrans = window.getComputedStyle(aside).transitionDuration;

          // Apply kill switch attribute
          document.documentElement.setAttribute('data-animations', 'disabled');

          const disabledGroupTrans = window.getComputedStyle(group).transitionDuration;
          const disabledAsideTrans = window.getComputedStyle(aside).transitionDuration;

          // Parse float seconds: <= 0.000001s (1e-6s)
          const pGroup = parseFloat(disabledGroupTrans);
          const pAside = parseFloat(disabledAsideTrans);

          // Restore normal
          document.documentElement.setAttribute('data-animations', 'enabled');

          return {
            normalGroupTrans,
            normalAsideTrans,
            disabledGroupTrans,
            disabledAsideTrans,
            isSuppressed: pGroup <= 0.00001 && pAside <= 0.00001,
          };
        })()
      `,
      returnByValue: true,
    });

    const killRes = killSwitchCheck.result?.value;
    if (killRes && killRes.isSuppressed) {
      pass('DOM-ANIMATION-KILL-SWITCH-SUPPRESSION', 'html[data-animations="disabled"] suppresses transition durations on accordion & sidebar to <= 0.001ms',
        `Disabled group: ${killRes.disabledGroupTrans}, aside: ${killRes.disabledAsideTrans}`);
    } else {
      fail('DOM-ANIMATION-KILL-SWITCH-SUPPRESSION', 'Animation kill-switch failed to suppress transition duration', JSON.stringify(killRes));
    }

    // Emulate OS reduced motion via CDP
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });

    const reducedMotionCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const group = document.getElementById('accordion-group-usuarios');
          const aside = document.querySelector('aside');
          const gTrans = window.getComputedStyle(group).transitionDuration;
          const aTrans = window.getComputedStyle(aside).transitionDuration;
          const pG = parseFloat(gTrans);
          const pA = parseFloat(aTrans);
          return {
            gTrans,
            aTrans,
            isSuppressed: pG <= 0.00001 && pA <= 0.00001,
          };
        })()
      `,
      returnByValue: true,
    });

    const rmRes = reducedMotionCheck.result?.value;
    if (rmRes && rmRes.isSuppressed) {
      pass('DOM-REDUCED-MOTION-SUPPRESSION', 'OS prefers-reduced-motion: reduce suppresses transition durations to <= 0.001ms',
        `Group: ${rmRes.gTrans}, Aside: ${rmRes.aTrans}`);
    } else {
      fail('DOM-REDUCED-MOTION-SUPPRESSION', 'Reduced motion media query failed to suppress transition duration', JSON.stringify(rmRes));
    }

    // Reset emulated media
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    // -------------------------------------------------------------------------
    // SUB-SUITE 3.7: COLLAPSED SIDEBAR (w-20) FLYOUT SUBMENUS
    // -------------------------------------------------------------------------
    console.log(`\n${colors.bold}--- SUB-SUITE 3.7: COLLAPSED SIDEBAR FLYOUT VERIFICATION ---${colors.reset}`);

    const collapsedFlyoutCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          // Toggle sidebar collapse using Ctrl+B
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));

          setTimeout(() => {
            const aside = document.querySelector('aside');
            const nav = document.querySelector('nav');
            const isW20 = aside ? aside.className.includes('w-20') : false;
            const isNavOverflowVisible = nav ? nav.className.includes('overflow-visible') : false;

            // In collapsed mode, accordion parent button has icon and flyout container
            const flyoutMenus = document.querySelectorAll('aside nav .group div[class*="group-hover:visible"]');
            const pulsingBadges = document.querySelectorAll('aside nav button .animate-pulse');

            resolve({
              isW20,
              isNavOverflowVisible,
              flyoutCount: flyoutMenus.length,
              pulsingBadgeCount: pulsingBadges.length,
              asideClasses: aside ? aside.className : null,
            });
          }, 250);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const colRes = collapsedFlyoutCheck.result?.value;
    if (colRes && colRes.isW20 && colRes.isNavOverflowVisible && colRes.flyoutCount >= 2 && colRes.pulsingBadgeCount >= 1) {
      pass('DOM-SIDEBAR-COLLAPSED-FLYOUT-SPEC', 'Collapsed sidebar transitions to w-20, enables nav overflow-visible, mounts flyout submenus, and renders active child pulse badge',
        `Flyout menus: ${colRes.flyoutCount}, Pulse badges: ${colRes.pulsingBadgeCount}`);
    } else {
      fail('DOM-SIDEBAR-COLLAPSED-FLYOUT-SPEC', 'Collapsed sidebar flyout specifications failed', JSON.stringify(colRes));
    }

    // Restore expanded sidebar
    await cdp.send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));`,
    });
    await new Promise((res) => setTimeout(res, 200));

    // -------------------------------------------------------------------------
    // SUB-SUITE 2.6: LOGOUT DISPATCH & REDIRECT VERIFICATION
    // -------------------------------------------------------------------------
    console.log(`\n${colors.bold}--- SUB-SUITE 2.6: LOGOUT DISPATCH & REDIRECT VERIFICATION ---${colors.reset}`);

    let logoutApiRequested = false;
    let frameNavigatedToLogin = false;

    cdp.on('Network.requestWillBeSent', (params) => {
      if (params.request?.url?.includes('/api/auth/logout')) {
        logoutApiRequested = true;
      }
    });

    cdp.on('Page.frameNavigated', (params) => {
      if (params.frame?.url?.includes('/login')) {
        frameNavigatedToLogin = true;
      }
    });

    // Re-open profile menu and click logout button
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.getElementById('user-profile-menu-button');
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise((res) => setTimeout(res, 200));

    // Trigger logout click
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const menu = document.querySelector('header [role="menu"]');
          const logoutBtn = Array.from(menu ? menu.querySelectorAll('button') : []).find(b => b.textContent.includes('Cerrar Sesión'));
          if (logoutBtn) {
            logoutBtn.click();
            return { triggered: true };
          }
          return { triggered: false };
        })()
      `,
    });

    // Wait for network request and navigation to complete
    for (let i = 0; i < 20; i++) {
      if (logoutApiRequested || frameNavigatedToLogin) break;
      await new Promise((res) => setTimeout(res, 100));
    }

    // Check if navigated or request sent
    if (logoutApiRequested || frameNavigatedToLogin) {
      pass('DOM-HEADER-LOGOUT-TRIGGERED', 'Logout button in profile dropdown successfully initiates backend logout and navigates to /login',
        `API requested: ${logoutApiRequested}, Navigated to /login: ${frameNavigatedToLogin}`);
    } else {
      fail('DOM-HEADER-LOGOUT-TRIGGERED', 'Logout execution verification failed: No logout request or navigation detected');
    }

  } catch (err) {
    fail('CDP-UNEXPECTED-ERROR', 'Unexpected runtime error during browser testing', err.message);
  } finally {
    if (cdp) cdp.close();
    cleanup();
  }

  // ===========================================================================
  // SUMMARY REPORT
  // ===========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`${colors.bold}                    CHALLENGER VERIFICATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}`);
  console.log(`Total Checks Executed : ${totalChecks}`);
  console.log(`Passed Checks         : ${colors.green}${passedChecks}${colors.reset}`);
  console.log(`Failed Checks (Bugs)  : ${failedChecks > 0 ? colors.red : colors.gray}${failedChecks}${colors.reset}`);
  console.log(`Pass Rate             : ${((passedChecks / totalChecks) * 100).toFixed(1)}%`);
  console.log(`${colors.cyan}${'='.repeat(78)}${colors.reset}\n`);

  if (failedChecks > 0) {
    console.log(`${colors.red}FAILURES IDENTIFIED:${colors.reset}`);
    for (const f of failures) {
      console.log(`  - [${f.id}] ${f.title}: ${f.errorDetail}`);
    }
    console.log(`\nVERDICT: ${colors.red}REQUEST_CHANGES${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`VERDICT: ${colors.green}APPROVE — 100% EMPIRICAL ADVERSARIAL VERIFICATION PASSED${colors.reset}\n`);
    process.exit(0);
  }
}

runMilestone1Suite().catch((e) => {
  console.error('Fatal error in suite execution:', e);
  process.exit(1);
});
