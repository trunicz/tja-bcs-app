/**
 * tests/test-reviewer-fuzzy-sidebar.mjs
 * =============================================================================
 * Independent Reviewer Verification Suite: Milestone 1
 * Hierarchical Accordion Sidebar & Fuzzy Command Palette Omnibar
 * =============================================================================
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Extract fuzzyScore and escapeRegex logic identical to CommandPalette.tsx
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fuzzyScore(query, target) {
  if (!query || !target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q || !t) return 0;

  if (t === q) return 100;

  if (t.startsWith(q)) {
    return 80 + Math.min(15, (q.length / t.length) * 15);
  }

  const wordBoundaryRegex = new RegExp(`(?:^|[\\s/\\-_.])${escapeRegex(q)}`);
  if (wordBoundaryRegex.test(t)) {
    return 70 + Math.min(15, (q.length / t.length) * 15);
  }

  if (t.includes(q)) {
    return 50 + Math.min(15, (q.length / t.length) * 15);
  }

  let qIdx = 0;
  let score = 0;
  let consecutiveCount = 0;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
      consecutiveCount++;
      score += 5;
      if (consecutiveCount > 1) score += 4;
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '-' || t[i - 1] === '_') {
        score += 8;
      }
    } else {
      consecutiveCount = 0;
    }
  }

  if (qIdx === q.length) {
    const coverageRatio = q.length / t.length;
    return Math.min(48, Math.max(10, Math.round(score * coverageRatio)));
  }

  return 0;
}

// AppSidebar route matching function logic
function isLinkActive(currentPath, href) {
  if (href === '/') {
    return currentPath === '/' || currentPath === '';
  }
  if (href === '/configuracion') {
    return currentPath.startsWith('/configuracion') && !currentPath.startsWith('/configuracion/roles');
  }
  if (href === '/configuracion/roles') {
    return currentPath.startsWith('/configuracion/roles');
  }
  if (href === '/documentos' || href === '/archivo-judicial') {
    return currentPath.startsWith('/documentos') || currentPath.startsWith('/archivo-judicial');
  }
  if (href === '/mensajeria' || href === '/mensajeria-procesal') {
    return currentPath.startsWith('/mensajeria') || currentPath.startsWith('/mensajeria-procesal');
  }
  return currentPath.startsWith(href);
}

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS ${total}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL ${total}] ${name}:`, err.message);
  }
}

console.log('=============================================================================');
console.log('   INDEPENDENT REVIEWER VERIFICATION: SIDEBAR & COMMAND PALETTE');
console.log('=============================================================================\n');

console.log('--- SECTION 1: FUZZY SCORE MATCHING HIERARCHY ---');

test('Exact match yields score 100', () => {
  assert.strictEqual(fuzzyScore('usuarios', 'usuarios'), 100);
  assert.strictEqual(fuzzyScore('expedientes', 'Expedientes'), 100);
});

test('Prefix match yields score 80 - 95', () => {
  const score = fuzzyScore('dir', 'Directorio de Usuarios');
  assert(score >= 80 && score <= 95, `Expected 80-95, got ${score}`);
});

test('Word boundary match yields score 70 - 85', () => {
  const score = fuzzyScore('usuarios', 'Directorio de Usuarios');
  assert(score >= 70 && score <= 85, `Expected 70-85, got ${score}`);
});

test('Substring match yields score 50 - 65', () => {
  const score = fuzzyScore('torio', 'Directorio de Usuarios');
  assert(score >= 50 && score <= 65, `Expected 50-65, got ${score}`);
});

test('Sequential fuzzy subsequence match yields score 10 - 48', () => {
  const score = fuzzyScore('dusr', 'Directorio de Usuarios');
  assert(score >= 10 && score <= 48, `Expected 10-48, got ${score}`);
});

test('Non-matching query yields 0', () => {
  assert.strictEqual(fuzzyScore('xyz123', 'Directorio de Usuarios'), 0);
  assert.strictEqual(fuzzyScore('admin', 'Directorio de Usuarios'), 0);
});

test('Fuzz: Regex special characters in search do not throw or crash', () => {
  const score1 = fuzzyScore('foo[bar', 'foo[bar] index');
  assert(score1 >= 80, `Expected prefix match, got ${score1}`);
  const score2 = fuzzyScore('(test)', 'unit (test) run');
  assert(score2 >= 70, `Expected word boundary match, got ${score2}`);
  const score3 = fuzzyScore('.*+?^$', 'literal .*+?^$ characters');
  assert(score3 >= 70, `Expected word boundary match, got ${score3}`);
});

test('Fuzz: Empty and whitespace queries safely return 0', () => {
  assert.strictEqual(fuzzyScore('', 'Usuarios'), 0);
  assert.strictEqual(fuzzyScore('   ', 'Usuarios'), 0);
  assert.strictEqual(fuzzyScore('Usuarios', ''), 0);
  assert.strictEqual(fuzzyScore(null, 'Usuarios'), 0);
  assert.strictEqual(fuzzyScore(undefined, 'Usuarios'), 0);
});

console.log('\n--- SECTION 2: SIDEBAR ROUTE DISAMBIGUATION & ACCORDION AUTO-EXPANSION ---');

test('Dashboard (/) is strictly matched and does not collide with subpaths', () => {
  assert.strictEqual(isLinkActive('/', '/'), true);
  assert.strictEqual(isLinkActive('', '/'), true);
  assert.strictEqual(isLinkActive('/expedientes', '/'), false);
  assert.strictEqual(isLinkActive('/usuarios', '/'), false);
});

test('Roles y Permisos (/configuracion/roles) does not activate standalone /configuracion', () => {
  assert.strictEqual(isLinkActive('/configuracion/roles', '/configuracion/roles'), true);
  assert.strictEqual(isLinkActive('/configuracion/roles', '/configuracion'), false);
});

test('Configuracion del Sistema (/configuracion) activates for /configuracion and general subpaths', () => {
  assert.strictEqual(isLinkActive('/configuracion', '/configuracion'), true);
  assert.strictEqual(isLinkActive('/configuracion/general', '/configuracion'), true);
  assert.strictEqual(isLinkActive('/configuracion', '/configuracion/roles'), false);
});

test('Directorio de Usuarios (/usuarios) matches child paths like /usuarios/123 or /usuarios/nuevo', () => {
  assert.strictEqual(isLinkActive('/usuarios', '/usuarios'), true);
  assert.strictEqual(isLinkActive('/usuarios/123', '/usuarios'), true);
  assert.strictEqual(isLinkActive('/usuarios/nuevo', '/usuarios'), true);
  assert.strictEqual(isLinkActive('/usuario-externo', '/usuarios'), false);
});

test('Judicial group aliases (/documentos / /archivo-judicial and /mensajeria / /mensajeria-procesal)', () => {
  assert.strictEqual(isLinkActive('/archivo-judicial', '/documentos'), true);
  assert.strictEqual(isLinkActive('/documentos', '/documentos'), true);
  assert.strictEqual(isLinkActive('/mensajeria-procesal', '/mensajeria'), true);
  assert.strictEqual(isLinkActive('/mensajeria', '/mensajeria'), true);
});

console.log('\n--- SECTION 3: SOURCE CODE CONTRACT AUDIT ---');

const sidebarPath = path.resolve('frontend/src/components/shell/AppSidebar.tsx');
const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

test('AppSidebar defines Usuarios accordion group with Directorio and Roles', () => {
  assert(sidebarCode.includes("id: 'usuarios'"));
  assert(sidebarCode.includes("title: 'Usuarios'"));
  assert(sidebarCode.includes("href: '/usuarios'"));
  assert(sidebarCode.includes("href: '/configuracion/roles'"));
});

test('AppSidebar defines Judicial / Procesal accordion group with all 6 items', () => {
  assert(sidebarCode.includes("id: 'judicial'"));
  assert(sidebarCode.includes("title: 'Judicial / Procesal'"));
  assert(sidebarCode.includes("href: '/expedientes'"));
  assert(sidebarCode.includes("href: '/agenda'"));
  assert(sidebarCode.includes("href: '/reportes'"));
  assert(sidebarCode.includes("href: '/ayuda'"));
  assert(sidebarCode.includes("href: '/documentos'"));
  assert(sidebarCode.includes("href: '/mensajeria'"));
});

test('AppSidebar implements grid-rows-[1fr] vs grid-rows-[0fr] CSS grid animation', () => {
  assert(sidebarCode.includes("grid-rows-[1fr]"));
  assert(sidebarCode.includes("grid-rows-[0fr]"));
  assert(sidebarCode.includes("transition-[grid-template-rows]"));
});

test('AppSidebar implements collapsed overflow-visible for flyouts and tooltips', () => {
  assert(sidebarCode.includes("overflow-visible"));
  assert(sidebarCode.includes("group-hover:visible"));
  assert(sidebarCode.includes("group-focus-within:visible"));
});

test('AppSidebar implements indicator bars and Activo badges for collapsed state', () => {
  assert(sidebarCode.includes("!isExpanded && hasActiveChild"));
  assert(sidebarCode.includes("Activo"));
});

const cmdPalettePath = path.resolve('frontend/src/components/shell/CommandPalette.tsx');
const cmdPaletteCode = fs.readFileSync(cmdPalettePath, 'utf-8');

test('CommandPalette includes Directorio de Usuarios in navigation', () => {
  assert(cmdPaletteCode.includes("id: 'nav-usuarios'"));
  assert(cmdPaletteCode.includes("title: 'Directorio de Usuarios'"));
  assert(cmdPaletteCode.includes("navigateTo('/usuarios')"));
});

test('CommandPalette includes fuzzyScore algorithm export', () => {
  assert(cmdPaletteCode.includes("export function fuzzyScore"));
});

test('CommandPalette integrates multi-entity search across cases, users, navigation, actions', () => {
  assert(cmdPaletteCode.includes("/api/expedientes?q="));
  assert(cmdPaletteCode.includes("/api/usuarios"));
  assert(cmdPaletteCode.includes("allCandidates: CommandItem[] = [...caseCommands, ...userCommands, ...baseCommands]"));
  assert(cmdPaletteCode.includes("tja:widget-order-changed"));
  assert(cmdPaletteCode.includes("tja:toast"));
});

const headerPath = path.resolve('frontend/src/components/shell/AppHeader.tsx');
const headerCode = fs.readFileSync(headerPath, 'utf-8');

test('AppHeader has zero ImpersonationSelector references and interactive profile menu', () => {
  assert(!headerCode.includes('ImpersonationSelector'), 'ImpersonationSelector must not exist in AppHeader');
  assert(headerCode.includes('id="user-profile-menu-button"'));
  assert(headerCode.includes('role="menu"'));
  assert(headerCode.includes('handleLogout'));
});

console.log('\n=============================================================================');
console.log(`Reviewer Verification Complete: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
console.log('=============================================================================');

if (passed !== total) {
  process.exit(1);
}
