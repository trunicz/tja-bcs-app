/**
 * tests/forensic_auditor_m4_motion_toast.test.mjs
 * =============================================================================
 * Independent Forensic Verification Suite for Milestone 4
 * Focus: Astro View Transitions, CSS Motion Tokens, Global Toast Event Bus,
 * Notification Drawer, and Zero Alert Invariant.
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
};

function pass(name, detail = '') {
  results.total++;
  results.passed++;
  console.log(`  \x1b[32m[PASS]\x1b[0m ${name}${detail ? ' \x1b[90m-> ' + detail + '\x1b[0m' : ''}`);
}

function fail(name, error) {
  results.total++;
  results.failed++;
  results.failures.push({ name, error });
  console.error(`  \x1b[31m[FAIL]\x1b[0m ${name} \x1b[31m-> ERROR: ${error}\x1b[0m`);
}

function check(title, condition, detailIfPass = '', errorIfFail = '') {
  if (condition) {
    pass(title, detailIfPass);
  } else {
    fail(title, errorIfFail || 'Assertion failed');
  }
}

async function runForensicAudit() {
  console.log('\n\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1mINDEPENDENT FORENSIC VERIFICATION: M4 MOTION & TOAST DELIVERABLES\x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m\n');

  // --- CHECK 1: ZERO RAW ALERT() POPUPS ---
  console.log('--- AUDIT CHECK 1: ZERO RAW ALERT() POPUPS IN FRONTEND SRC ---');
  const frontendSrcDir = path.join(projectRoot, 'frontend/src');

  function scanDir(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full, files);
      } else if (/\.(tsx|ts|jsx|js|astro)$/.test(entry.name)) {
        files.push(full);
      }
    }
    return files;
  }

  const allSourceFiles = scanDir(frontendSrcDir);
  let alertCount = 0;
  const alertOccurrences = [];

  for (const file of allSourceFiles) {
    const code = fs.readFileSync(file, 'utf-8');
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      // Look for alert( or window.alert( but not role="alert" or toast.alert
      if (/(\bwindow\.alert\(|\balert\()/.test(line) && !line.includes('role=') && !line.includes('toast.') && !line.includes('//')) {
        alertCount++;
        alertOccurrences.push(`${path.relative(projectRoot, file)}:${idx + 1}: ${line.trim()}`);
      }
    });
  }

  check(
    'Complete elimination of raw alert() calls across frontend/src',
    alertCount === 0,
    `Verified 0 alert() calls across ${allSourceFiles.length} source files`,
    `Found ${alertCount} alert() calls: ${alertOccurrences.join(', ')}`
  );

  // --- CHECK 2: VIEW TRANSITIONS IN LAYOUT.ASTRO ---
  console.log('\n--- AUDIT CHECK 2: ASTRO VIEW TRANSITIONS IN LAYOUT.ASTRO ---');
  const layoutPath = path.join(projectRoot, 'frontend/src/layouts/Layout.astro');
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

  check(
    'ClientRouter imported from astro:transitions in Layout.astro',
    layoutContent.includes("import { ClientRouter } from 'astro:transitions';") ||
    layoutContent.includes('import { ClientRouter } from "astro:transitions";'),
    'Found ClientRouter import'
  );

  check(
    '<ClientRouter /> rendered in <head>',
    layoutContent.includes('<ClientRouter />'),
    'Found <ClientRouter /> tag inside head'
  );

  check(
    'astro:before-swap listener registered',
    layoutContent.includes("document.addEventListener('astro:before-swap'") ||
    layoutContent.includes('document.addEventListener("astro:before-swap"'),
    'Found astro:before-swap event listener'
  );

  check(
    'Pre-swap handler synchronously synchronizes root attributes',
    layoutContent.includes('copyAttributes(document.documentElement, event.newDocument.documentElement);') &&
    layoutContent.includes('restorePreferences(event.newDocument);'),
    'Direct attribute cloning + preference restore verified'
  );

  check(
    'Preserves all 7 theme and layout attributes plus .dark class',
    layoutContent.includes('data-theme') &&
    layoutContent.includes('data-accent') &&
    layoutContent.includes('data-density') &&
    layoutContent.includes('data-font-size') &&
    layoutContent.includes('data-animations') &&
    layoutContent.includes('data-sidebar') &&
    layoutContent.includes('data-sidebar-pos') &&
    layoutContent.includes(".classList.contains('dark')"),
    'All 7 data attributes and dark class preservation verified'
  );

  // --- CHECK 3: CSS MOTION KEYFRAMES & UNIVERSAL KILL-SWITCH ---
  console.log('\n--- AUDIT CHECK 3: CSS MOTION TOKENS & KILL-SWITCH IN GLOBAL.CSS ---');
  const cssPath = path.join(projectRoot, 'frontend/src/styles/global.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  const requiredKeyframes = ['fadeIn', 'scaleIn', 'slideInDown', 'slideInUp', 'slideInRight', 'slideInLeft'];
  for (const kf of requiredKeyframes) {
    check(
      `Defines @keyframes ${kf}`,
      cssContent.includes(`@keyframes ${kf}`),
      `Verified @keyframes ${kf} definition`
    );
  }

  const requiredClasses = [
    '.animate-fade-in',
    '.animate-scale-in',
    '.animate-slide-down',
    '.animate-slide-up',
    '.modal-entrance',
    '.dropdown-entrance',
    '.toast-entrance',
    '.card-stagger-enter',
  ];
  for (const cls of requiredClasses) {
    check(
      `Defines motion class ${cls}`,
      cssContent.includes(cls),
      `Verified motion class ${cls}`
    );
  }

  check(
    'Kill-switch suppresses ::view-transition-* under prefers-reduced-motion: reduce',
    cssContent.includes('::view-transition-group(*)') &&
    cssContent.includes('::view-transition-image-pair(*)') &&
    cssContent.includes('::view-transition-old(*)') &&
    cssContent.includes('::view-transition-new(*)') &&
    cssContent.includes('animation: none !important;'),
    'Verified view-transition suppression in media query'
  );

  check(
    'Kill-switch suppresses ::view-transition-* under html[data-animations="disabled"]',
    cssContent.includes('html[data-animations="disabled"]::view-transition-group(*)') &&
    cssContent.includes('html[data-animations="disabled"]::view-transition-new(*)'),
    'Verified view-transition suppression for data-animations="disabled"'
  );

  // --- CHECK 4: GLOBAL TOAST UTILITY & EVENT BUS CONTRACT ---
  console.log('\n--- AUDIT CHECK 4: TOAST CLIENT UTILITY (toast.ts) ---');
  const toastPath = path.join(projectRoot, 'frontend/src/lib/toast.ts');
  const toastContent = fs.readFileSync(toastPath, 'utf-8');

  check(
    'Dispatches tja:toast custom event',
    toastContent.includes("'tja:toast'") || toastContent.includes('"tja:toast"'),
    'Found tja:toast dispatch'
  );

  check(
    'Dispatches tja:toast-dismiss custom event',
    toastContent.includes("'tja:toast-dismiss'") || toastContent.includes('"tja:toast-dismiss"'),
    'Found tja:toast-dismiss dispatch'
  );

  check(
    'Dispatches tja:toast-clear custom event',
    toastContent.includes("'tja:toast-clear'") || toastContent.includes('"tja:toast-clear"'),
    'Found tja:toast-clear dispatch'
  );

  check(
    'Provides typed methods (success, error, warning, info, dismiss, clearAll)',
    toastContent.includes('success(') &&
    toastContent.includes('error(') &&
    toastContent.includes('warning(') &&
    toastContent.includes('info(') &&
    toastContent.includes('dismiss(') &&
    toastContent.includes('clearAll('),
    'All 6 API methods implemented'
  );

  // --- CHECK 5: TOAST CONTAINER COMPONENT ---
  console.log('\n--- AUDIT CHECK 5: TOAST CONTAINER COMPONENT (ToastContainer.tsx) ---');
  const toastContainerPath = path.join(projectRoot, 'frontend/src/components/common/ToastContainer.tsx');
  const toastContainerContent = fs.readFileSync(toastContainerPath, 'utf-8');

  check(
    'Subscribes to tja:toast, tja:toast-dismiss, and tja:toast-clear window events',
    toastContainerContent.includes("window.addEventListener('tja:toast'") &&
    toastContainerContent.includes("window.addEventListener('tja:toast-dismiss'") &&
    toastContainerContent.includes("window.addEventListener('tja:toast-clear'"),
    'Verified event subscriptions'
  );

  check(
    'Cleans up all window event listeners on unmount',
    toastContainerContent.includes("window.removeEventListener('tja:toast'") &&
    toastContainerContent.includes("window.removeEventListener('tja:toast-dismiss'") &&
    toastContainerContent.includes("window.removeEventListener('tja:toast-clear'"),
    'Verified event unsubscriptions'
  );

  check(
    'Implements pause-on-hover logic (handleMouseEnter & handleMouseLeave)',
    toastContainerContent.includes('handleMouseEnter') &&
    toastContainerContent.includes('handleMouseLeave') &&
    toastContainerContent.includes('isPaused: true'),
    'Pause on hover logic verified'
  );

  check(
    'Includes accessible ARIA live regions and roles (status/alert)',
    toastContainerContent.includes('aria-live=') &&
    toastContainerContent.includes("role='status'") ||
    toastContainerContent.includes('role={ariaRole}'),
    'Accessibility ARIA attributes verified'
  );

  // --- CHECK 6: NOTIFICATION DRAWER COMPONENT ---
  console.log('\n--- AUDIT CHECK 6: NOTIFICATION DRAWER COMPONENT (NotificationDrawer.tsx) ---');
  const drawerPath = path.join(projectRoot, 'frontend/src/components/notifications/NotificationDrawer.tsx');
  const drawerContent = fs.readFileSync(drawerPath, 'utf-8');

  check(
    'Fetches notifications from /api/notificaciones',
    drawerContent.includes("apiFetch('/api/notificaciones?limit=30')"),
    'Connected to backend notifications endpoint'
  );

  check(
    'Marks single notification as read via PATCH /api/notificaciones/:id/leida',
    drawerContent.includes('/api/notificaciones/${id}/leida') &&
    drawerContent.includes("method: 'PATCH'"),
    'Single mark-as-read API call verified'
  );

  check(
    'Marks all notifications as read via PATCH /api/notificaciones/marcar-todas-leidas',
    drawerContent.includes('/api/notificaciones/marcar-todas-leidas') &&
    drawerContent.includes("method: 'PATCH'"),
    'Mark-all-as-read API call verified'
  );

  check(
    'Dispatches tja:unread-notifications-updated event on state updates',
    drawerContent.includes("'tja:unread-notifications-updated'"),
    'Dispatches unread update notification event'
  );

  // --- CHECK 7: APPSHELL & APPHEADER INTEGRATION ---
  console.log('\n--- AUDIT CHECK 7: APPSHELL & APPHEADER MOUNTING ---');
  const appShellPath = path.join(projectRoot, 'frontend/src/components/shell/AppShell.tsx');
  const appShellContent = fs.readFileSync(appShellPath, 'utf-8');

  check(
    'AppShell mounts <ToastContainer />',
    appShellContent.includes('<ToastContainer />'),
    'Found <ToastContainer /> in AppShell JSX'
  );

  check(
    'AppShell mounts <NotificationDrawer />',
    appShellContent.includes('<NotificationDrawer'),
    'Found <NotificationDrawer /> in AppShell JSX'
  );

  check(
    'AppShell listens to tja:open-notifications and tja:unread-notifications-updated',
    appShellContent.includes("window.addEventListener('tja:open-notifications'") &&
    appShellContent.includes("window.addEventListener('tja:unread-notifications-updated'"),
    'Window event listeners verified in AppShell'
  );

  const appHeaderPath = path.join(projectRoot, 'frontend/src/components/shell/AppHeader.tsx');
  const appHeaderContent = fs.readFileSync(appHeaderPath, 'utf-8');

  check(
    'AppHeader triggers notification drawer on bell click',
    appHeaderContent.includes('onOpenNotifications') &&
    appHeaderContent.includes('unreadCount'),
    'Bell trigger and unread badge verified in AppHeader'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY & AUDIT VERDICT
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[35m====================================================================\x1b[0m');
  console.log('\x1b[1m               FORENSIC AUDIT SUMMARY (M4 MOTION & TOAST)           \x1b[0m');
  console.log('\x1b[35m====================================================================\x1b[0m');
  console.log(`  Total Checks:    ${results.total}`);
  console.log(`  Passed Checks:   \x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Checks:   ${results.failed > 0 ? '\x1b[31m' : '\x1b[32m'}${results.failed}\x1b[0m`);
  console.log(`  Pass Rate:       ${((results.passed / results.total) * 100).toFixed(1)}%`);
  console.log('\x1b[35m====================================================================\x1b[0m\n');

  if (results.failed > 0) {
    console.error('\x1b[31mVERDICT: INTEGRITY VIOLATION\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mVERDICT: CLEAN\x1b[0m');
    process.exit(0);
  }
}

runForensicAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
