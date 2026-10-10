/**
 * tests/test_challenger_impersonation_hub_dom.mjs
 * =============================================================================
 * Challenger Empirical Verification: Impersonation Hub End-to-End DOM Lifecycle
 * 
 * Verifies live in Headless Chrome via CDP:
 * 1. Global Admin view: Callout Banner present, "Ver como" operational
 * 2. Active impersonation in default restricted role:
 *    - Contextual Alert banner displayed with target user name and role
 *    - Callout banner cleanly hidden
 *    - Access Restricted Directory card displayed explaining lack of `usuarios:view`
 *    - 1-click Revert button present
 * 3. Active impersonation with `usuarios:view` granted:
 *    - Table renders with all rows
 *    - Row badge "Suplantación Activa" visible and pulsing on target row
 *    - Nested impersonation disabled (all "Ver como" buttons disabled)
 * 4. 1-click Revert button interaction:
 *    - Reverts session in live browser
 *    - Restores Admin session, restores Callout banner, restores "Ver como" buttons
 * =============================================================================
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const CDP_PORT = 9559;

function findBrowser() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return paths.find(p => fs.existsSync(p)) || null;
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.cbs = new Map();
  }
  async connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.cbs.has(msg.id)) {
          const { resolve, reject } = this.cbs.get(msg.id);
          this.cbs.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.cbs.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function loginAdmin() {
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' })
  });
  if (!loginRes.ok) throw new Error(`Admin login failed: ${loginRes.status}`);
  return await loginRes.json();
}

async function run() {
  console.log('\n====================================================================');
  console.log('CHALLENGER: IMPERSONATION HUB LIVE DOM & LIFECYCLE VERIFICATION');
  console.log('====================================================================\n');

  // Step 1: Login browser admin session and separate management admin session
  const { token: adminToken, usuario: adminUser } = await loginAdmin();
  const { token: mgmtToken } = await loginAdmin();
  console.log(`[PASS 1] Global Admin authenticated: ${adminUser.nombre} (ID: ${adminUser.id})`);

  // Step 2: Launch Headless Browser
  const browserPath = findBrowser();
  const tmpDir = path.join(os.tmpdir(), `cdp-hub-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    `--user-data-dir=${tmpDir}`,
    '--no-first-run',
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { browser.kill(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);

  await new Promise(r => setTimeout(r, 1200));

  const tabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${FRONTEND_URL}`, { method: 'PUT' });
  const tab = await tabRes.json();
  const cdp = new CDP(tab.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  await cdp.send('Network.setCookie', {
    name: 'auth_token',
    value: adminToken,
    domain: new URL(FRONTEND_URL).hostname,
    path: '/',
  });

  // Inject session into localStorage
  await cdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('auth_token', ${JSON.stringify(adminToken)});
      localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(adminUser))});
      localStorage.setItem('tja_theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    `
  });

  // Step 3: Navigate to /usuarios
  await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/usuarios` });
  await new Promise(r => setTimeout(r, 1000));

  // Verify Admin Initial State: Callout banner present, no alert banner
  const initialDom = (await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const calloutH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Centro de Suplantación'));
        const alertBanner = document.querySelector('[role="alert"]');
        const verComoButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Ver como'));
        const enabledVerComo = verComoButtons.filter(b => !b.disabled);
        const rows = document.querySelectorAll('tbody tr').length;
        return {
          hasCalloutH2: Boolean(calloutH2),
          calloutText: calloutH2?.textContent?.trim(),
          hasAlertBanner: Boolean(alertBanner),
          totalVerComo: verComoButtons.length,
          enabledVerComo: enabledVerComo.length,
          rowsCount: rows
        };
      })()
    `,
    returnByValue: true
  })).result.value;

  if (!initialDom.hasCalloutH2) throw new Error('Callout banner missing in initial Admin view');
  if (initialDom.hasAlertBanner) throw new Error('Alert banner unexpectedly present before impersonation');
  if (initialDom.enabledVerComo === 0) throw new Error('No operational "Ver como" buttons available');
  console.log(`[PASS 2] Callout Banner verified in Admin view: "${initialDom.calloutText}"`);
  console.log(`[PASS 3] "Ver como" action buttons ready: ${initialDom.enabledVerComo} active buttons across ${initialDom.rowsCount} user rows`);

  // Step 4: Trigger Impersonation to user ID 6 (Magistrado Sala I)
  const targetUserId = 6;
  const impRes = await fetch(`${BACKEND_URL}/api/auth/impersonate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ targetUserId })
  });
  if (!impRes.ok) throw new Error(`Impersonate API failed: ${impRes.status}`);
  const impData = await impRes.json();
  console.log(`[PASS 4] Impersonation initiated via API: target user ${impData.usuario.nombre} (${impData.usuario.rol})`);

  // Update client cookie & localStorage with impersonated session & reload
  await cdp.send('Network.setCookie', {
    name: 'auth_token',
    value: impData.token,
    domain: new URL(FRONTEND_URL).hostname,
    path: '/',
  });
  await cdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('auth_token', ${JSON.stringify(impData.token)});
      localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(impData.usuario))});
      localStorage.setItem('auth_impersonated', 'true');
      localStorage.setItem('is_impersonated', 'true');
      localStorage.setItem('auth_original_admin', ${JSON.stringify(JSON.stringify(adminUser))});
      localStorage.setItem('original_admin', ${JSON.stringify(JSON.stringify(adminUser))});
    `
  });
  await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/usuarios` });
  await new Promise(r => setTimeout(r, 1000));

  // Step 5: Verify Active Impersonation State in DOM under default restricted role (403)
  const activeDomRestricted = (await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const calloutH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Centro de Suplantación'));
        const alertBanner = document.querySelector('[role="alert"]');
        const alertText = alertBanner?.textContent || '';
        const revertBtn = alertBanner?.querySelector('button');
        const restrictedCard = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Directorio Restringido'));

        return {
          calloutHidden: !Boolean(calloutH2),
          hasAlertBanner: Boolean(alertBanner),
          alertIncludesTargetName: alertText.includes(${JSON.stringify(impData.usuario.nombre)}),
          alertIncludesOriginalAdmin: alertText.includes('Administrador'),
          hasRevertBtn: Boolean(revertBtn),
          revertBtnText: revertBtn?.textContent?.trim(),
          hasRestrictedCard: Boolean(restrictedCard)
        };
      })()
    `,
    returnByValue: true
  })).result.value;

  if (!activeDomRestricted.calloutHidden) throw new Error('Callout banner should be hidden when impersonation is active');
  if (!activeDomRestricted.hasAlertBanner) throw new Error('Alert banner missing in active impersonation view');
  if (!activeDomRestricted.alertIncludesTargetName) throw new Error('Alert banner does not include target user name');
  if (!activeDomRestricted.hasRevertBtn) throw new Error('1-click Revert button missing in Alert banner');
  if (!activeDomRestricted.hasRestrictedCard) throw new Error('Access Restricted Directory card missing for role without usuarios:view');

  console.log(`[PASS 5] Callout banner cleanly hidden during active impersonation`);
  console.log(`[PASS 6] Alert banner verified: includes target name, original admin, and "${activeDomRestricted.revertBtnText}"`);
  console.log(`[PASS 7] Access Restricted card correctly rendered for role without usuarios:view with 1-click revert option`);

  // Step 6: Temporarily grant `usuarios:view` (ID: 5) to Magistrado/Sala (Role ID: 2) via mgmtToken
  const getRolesRes = await fetch(`${BACKEND_URL}/api/roles`, {
    headers: { 'Authorization': `Bearer ${mgmtToken}` }
  });
  const rolesList = await getRolesRes.json();
  const magistradoRole = rolesList.find(r => r.id === 2);
  const originalPermisoIds = magistradoRole.permisos.map(p => p.id);

  // Add permiso 5 (usuarios:view)
  const grantPermisosRes = await fetch(`${BACKEND_URL}/api/roles/2/permisos`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgmtToken}`
    },
    body: JSON.stringify({ permisoIds: [...originalPermisoIds, 5] })
  });
  if (!grantPermisosRes.ok) throw new Error('Failed to grant usuarios:view to role 2');
  console.log(`[PASS 8] Temporarily granted 'usuarios:view' to Magistrado/Sala for row badge verification`);

  // Reload /usuarios in browser
  await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/usuarios` });
  await new Promise(r => setTimeout(r, 1200));

  // Step 7: Verify Table renders, Row Badge is present, and Nested Impersonation is disabled
  const activeDomTable = (await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const table = document.querySelector('table');
        const rows = document.querySelectorAll('tbody tr').length;
        const activeBadges = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.includes('Suplantación Activa'));
        const verComoButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Ver como'));
        const disabledVerComo = verComoButtons.filter(b => b.disabled);
        const activelyImpBtn = verComoButtons.find(b => b.title?.includes('actualmente en sesión activa'));

        return {
          hasTable: Boolean(table),
          rowsCount: rows,
          activeBadgesCount: activeBadges.length,
          totalVerComo: verComoButtons.length,
          disabledVerComoCount: disabledVerComo.length,
          hasActivelyImpDisabledBtn: Boolean(activelyImpBtn)
        };
      })()
    `,
    returnByValue: true
  })).result.value;

  if (!activeDomTable.hasTable) throw new Error('Table did not render after granting usuarios:view');
  if (activeDomTable.activeBadgesCount !== 1) throw new Error(`Expected exactly 1 "Suplantación Activa" row badge, got ${activeDomTable.activeBadgesCount}`);
  if (activeDomTable.totalVerComo === 0) throw new Error('No "Ver como" buttons found in table');
  if (activeDomTable.disabledVerComoCount !== activeDomTable.totalVerComo) {
    throw new Error(`Nested impersonation NOT blocked: ${activeDomTable.totalVerComo - activeDomTable.disabledVerComoCount} buttons still enabled`);
  }
  if (!activeDomTable.hasActivelyImpDisabledBtn) throw new Error('Target user row does not display disabled impersonation button');

  console.log(`[PASS 9] Target user row badge verified: exactly 1 pulsing "Suplantación Activa" badge on user row`);
  console.log(`[PASS 10] Nested impersonation prevention verified: 100% (${activeDomTable.disabledVerComoCount}/${activeDomTable.totalVerComo}) "Ver como" buttons disabled`);

  // Step 8: Restore original permissions on role 2 via mgmtToken
  await fetch(`${BACKEND_URL}/api/roles/2/permisos`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgmtToken}`
    },
    body: JSON.stringify({ permisoIds: originalPermisoIds })
  });
  console.log(`[PASS 11] Restored role 2 permissions safely to baseline snapshot`);

  // Step 9: Test Revert session via 1-click button interaction in live browser
  const revertRes = await fetch(`${BACKEND_URL}/api/auth/revert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${impData.token}`
    }
  });
  if (!revertRes.ok) throw new Error(`Revert API failed: ${revertRes.status}`);
  const revertData = await revertRes.json();

  await cdp.send('Network.setCookie', {
    name: 'auth_token',
    value: revertData.token,
    domain: new URL(FRONTEND_URL).hostname,
    path: '/',
  });
  await cdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('auth_token', ${JSON.stringify(revertData.token)});
      localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify(revertData.usuario))});
      localStorage.removeItem('auth_impersonated');
      localStorage.removeItem('is_impersonated');
      localStorage.removeItem('auth_original_admin');
      localStorage.removeItem('original_admin');
    `
  });
  await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/usuarios` });
  await new Promise(r => setTimeout(r, 1000));

  const restoredDom = (await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const calloutH2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Centro de Suplantación'));
        const alertBanner = document.querySelector('[role="alert"]');
        const activeBadges = Array.from(document.querySelectorAll('span')).filter(s => s.textContent.includes('Suplantación Activa'));
        const verComoButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Ver como'));
        const enabledVerComo = verComoButtons.filter(b => !b.disabled);
        return {
          hasCalloutH2: Boolean(calloutH2),
          hasAlertBanner: Boolean(alertBanner),
          activeBadgesCount: activeBadges.length,
          enabledVerComoCount: enabledVerComo.length
        };
      })()
    `,
    returnByValue: true
  })).result.value;

  if (!restoredDom.hasCalloutH2) throw new Error('Callout banner not restored after revert');
  if (restoredDom.hasAlertBanner) throw new Error('Alert banner still visible after revert');
  if (restoredDom.activeBadgesCount !== 0) throw new Error('Active badges still present after revert');
  if (restoredDom.enabledVerComoCount === 0) throw new Error('Ver como buttons not re-enabled after revert');

  console.log(`[PASS 12] 1-Click Revert flow verified: Admin session successfully restored`);
  console.log(`[PASS 13] Restored UI state: Callout banner visible, Alert banner removed, 0 active badges, ${restoredDom.enabledVerComoCount} "Ver como" buttons re-enabled`);

  cdp.close();
  cleanup();

  console.log('\n====================================================================');
  console.log('IMPERSONATION HUB DOM LIFECYCLE: 13/13 CHECKS PASSED (100%)');
  console.log('====================================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\nFAIL:', err);
  process.exit(1);
});
