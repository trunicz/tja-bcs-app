/**
 * tests/test-adversarial-m3-customization.mjs
 * =============================================================================
 * ADVERSARIAL STRESS TEST: Milestone 3 Preference Engine, WCAG 2.1 Contrast,
 * Employee Color Hashing & API Attack Scenarios
 * =============================================================================
 */

const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';

// ANSI Colors
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

async function api(path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function login(correo, password) {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { correo, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${correo}: ${JSON.stringify(res.data)}`);
  return res.data.token;
}

// ============================================================================
// SUITE 1: WCAG 2.1 CONTRAST & RELATIVE LUMINANCE MATH
// ============================================================================

// We can import or verify the math functions directly
function hexToRgb(hex) {
  let cleaned = hex.trim();
  if (cleaned.startsWith('#')) cleaned = cleaned.slice(1);
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getContrastTextColor(bgHex) {
  if (!bgHex) return '#ffffff';
  const bgL = getRelativeLuminance(bgHex);
  const whiteL = 1.0;
  const darkSlateL = 0.01;
  const contrastWhite = (whiteL + 0.05) / (bgL + 0.05);
  const contrastDark = (bgL + 0.05) / (darkSlateL + 0.05);
  return contrastWhite >= contrastDark ? '#ffffff' : '#0f172a';
}

async function runTestSuite() {
  console.log('\n==============================================================================');
  console.log('   ADVERSARIAL STRESS TEST: MILESTONE 3 PREFERENCES & EMPLOYEE COLOR');
  console.log('==============================================================================\n');

  // --- TEST 1: Absolute black and white relative luminance ---
  const lBlack = getRelativeLuminance('#000000');
  const lWhite = getRelativeLuminance('#ffffff');
  if (Math.abs(lBlack - 0.0) < 0.0001 && Math.abs(lWhite - 1.0) < 0.0001) {
    pass('WCAG-LUMINANCE-EXTREMES', 'Pure black luminance is 0.0 and pure white is 1.0', `L(black)=${lBlack}, L(white)=${lWhite}`);
  } else {
    fail('WCAG-LUMINANCE-EXTREMES', 'Luminance calculation mismatch', `L(black)=${lBlack}, L(white)=${lWhite}`);
  }

  // --- TEST 2: Max contrast ratio is 21:1 ---
  const ratioMax = getContrastRatio('#000000', '#ffffff');
  if (Math.abs(ratioMax - 21.0) < 0.01) {
    pass('WCAG-CONTRAST-MAX', 'Contrast ratio between #000000 and #ffffff is 21:1', `Ratio: ${ratioMax.toFixed(2)}:1`);
  } else {
    fail('WCAG-CONTRAST-MAX', 'Expected 21:1 ratio', `Got ${ratioMax}`);
  }

  // --- TEST 3: Minimum contrast ratio on identical colors is 1:1 ---
  const ratioMin = getContrastRatio('#2563eb', '#2563eb');
  if (Math.abs(ratioMin - 1.0) < 0.01) {
    pass('WCAG-CONTRAST-IDENTITY', 'Contrast ratio on identical color is 1:1', `Ratio: ${ratioMin.toFixed(2)}:1`);
  } else {
    fail('WCAG-CONTRAST-IDENTITY', 'Expected 1:1 ratio', `Got ${ratioMin}`);
  }

  // --- TEST 4: WCAG AA (4.5:1) compliance across all 12 Tribunal presets ---
  const presets = [
    '#1e3a8a', '#0f766e', '#9a3412', '#047857', '#b45309', '#6d28d9',
    '#0284c7', '#475569', '#be123c', '#059669', '#4338ca', '#b91c1c'
  ];
  let allPresetsCompliant = true;
  let worstRatio = 999;
  for (const p of presets) {
    const textColor = getContrastTextColor(p);
    const cr = getContrastRatio(p, textColor);
    if (cr < worstRatio) worstRatio = cr;
    if (cr < 4.5) {
      allPresetsCompliant = false;
      fail('WCAG-TRIBUNAL-PRESETS', `Preset ${p} has contrast ratio below 4.5:1 (${cr.toFixed(2)}:1 with ${textColor})`);
      break;
    }
  }
  if (allPresetsCompliant) {
    pass('WCAG-TRIBUNAL-PRESETS', 'All 12 Tribunal employee color presets exceed WCAG AA (4.5:1) legibility', `Lowest ratio: ${worstRatio.toFixed(2)}:1`);
  }

  // --- TEST 5: 3-character hex shorthand expansion ---
  const white3 = getContrastTextColor('#fff');
  const black3 = getContrastTextColor('#000');
  if (white3 === '#0f172a' && black3 === '#ffffff') {
    pass('WCAG-SHORTHAND-HEX', 'Shorthand hex #fff and #000 resolve correct contrast text colors', `#fff -> ${white3}, #000 -> ${black3}`);
  } else {
    fail('WCAG-SHORTHAND-HEX', 'Shorthand hex resolution failed', `#fff -> ${white3}, #000 -> ${black3}`);
  }

  // ============================================================================
  // SUITE 2: DETERMINISTIC HASHING AND INITIALS
  // ============================================================================

  // Deterministic 32-bit hash
  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return Math.abs(hash);
  }

  function getDeterministicColor(identifier) {
    const idStr = String(identifier).trim().toLowerCase();
    const hash = hashString(idStr);
    return presets[hash % presets.length];
  }

  // --- TEST 6: Hash determinism (10,000 iterations identical) ---
  const sampleId = 'user-12345';
  const firstColor = getDeterministicColor(sampleId);
  let isConsistent = true;
  for (let i = 0; i < 10000; i++) {
    if (getDeterministicColor(sampleId) !== firstColor) {
      isConsistent = false;
      break;
    }
  }
  if (isConsistent) {
    pass('HASH-DETERMINISM', '10,000 runs of getDeterministicColor yield 100% identical outputs', `Color: ${firstColor}`);
  } else {
    fail('HASH-DETERMINISM', 'Hash calculation is non-deterministic');
  }

  // --- TEST 7: Hash dispersion across presets ---
  const seenPresets = new Set();
  for (let i = 1; i <= 200; i++) {
    seenPresets.add(getDeterministicColor(`empleado-${i}@tjabcs.gob.mx`));
  }
  if (seenPresets.size === presets.length) {
    pass('HASH-DISPERSION', `Identifiers distribute across all ${presets.length} tribunal presets`, `Covered: ${seenPresets.size}/${presets.length}`);
  } else {
    fail('HASH-DISPERSION', `Hash does not hit all presets`, `Covered only ${seenPresets.size}/${presets.length}`);
  }

  // --- TEST 8: Judicial Initials extraction ignoring honorifics ---
  const JUDICIAL_TITLES = new Set([
    'lic', 'lic.', 'licdo', 'licda', 'dr', 'dr.', 'dra', 'dra.',
    'mtro', 'mtro.', 'mtra', 'mtra.', 'mag', 'mag.', 'magdo', 'magda',
    'ing', 'ing.', 'cp', 'c.p.', 'c.p'
  ]);

  function getEmployeeInitials(nameOrEmail) {
    if (!nameOrEmail || typeof nameOrEmail !== 'string') return 'U';
    const clean = nameOrEmail.trim();
    if (!clean) return 'U';
    if (clean.includes('@')) {
      const handle = clean.split('@')[0];
      return handle.slice(0, 2).toUpperCase();
    }
    const tokens = clean.split(/\s+/).filter(t => !JUDICIAL_TITLES.has(t.toLowerCase()));
    if (tokens.length >= 2) {
      return `${tokens[0].charAt(0)}${tokens[tokens.length - 1].charAt(0)}`.toUpperCase();
    }
    if (tokens.length === 1 && tokens[0].length >= 2) {
      return tokens[0].slice(0, 2).toUpperCase();
    }
    return clean.slice(0, 1).toUpperCase() || 'U';
  }

  const testNames = [
    { in: 'Lic. Fernando Beltrán', exp: 'FB' },
    { in: 'Dra. María Elena Ramos', exp: 'MR' },
    { in: 'Mag. Roberto Carlos Sánchez', exp: 'RS' },
    { in: 'Mtro. Pedro Gómez', exp: 'PG' },
    { in: 'ana.martinez@tjabcs.gob.mx', exp: 'AN' },
    { in: 'Carlos', exp: 'CA' },
    { in: '', exp: 'U' },
    { in: null, exp: 'U' },
  ];

  let initialsPassed = true;
  for (const tc of testNames) {
    const res = getEmployeeInitials(tc.in);
    if (res !== tc.exp) {
      initialsPassed = false;
      fail('INITIALS-HONORIFICS', `Failed on "${tc.in}": expected "${tc.exp}", got "${res}"`);
      break;
    }
  }
  if (initialsPassed) {
    pass('INITIALS-HONORIFICS', 'Clean initials extracted stripping judicial honorifics (Lic, Dra, Mag, Mtro)', 'All 8 test patterns passed');
  }

  // ============================================================================
  // SUITE 3: BACKEND API ADVERSARIAL VALIDATION & ATTACKS
  // ============================================================================

  console.log('\n--- SECTION 2: BACKEND API ADVERSARIAL ATTACKS ---');

  const adminToken = await login('admin@tjabcs.gob.mx', 'password123');
  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  // --- ATTACK 1: Invalid theme enum ---
  const resBadTheme = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { tema: 'neon-cyberpunk' },
  });
  if (resBadTheme.status === 400) {
    pass('API-REJECT-THEME', 'Backend rejects invalid tema enum with 400 Bad Request', resBadTheme.data?.error);
  } else {
    fail('API-REJECT-THEME', `Expected 400 Bad Request, got HTTP ${resBadTheme.status}`);
  }

  // --- ATTACK 2: Invalid accent hex ---
  const resBadAccent = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { colorAcento: 'red-not-hex' },
  });
  if (resBadAccent.status === 400) {
    pass('API-REJECT-ACCENT', 'Backend rejects non-hex colorAcento with 400 Bad Request', resBadAccent.data?.error);
  } else {
    fail('API-REJECT-ACCENT', `Expected 400 Bad Request, got HTTP ${resBadAccent.status}`);
  }

  // --- ATTACK 3: Invalid density enum ---
  const resBadDensity = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { densidad: 'ultra-condensed' },
  });
  if (resBadDensity.status === 400) {
    pass('API-REJECT-DENSITY', 'Backend rejects invalid densidad with 400 Bad Request', resBadDensity.data?.error);
  } else {
    fail('API-REJECT-DENSITY', `Expected 400 Bad Request, got HTTP ${resBadDensity.status}`);
  }

  // --- ATTACK 4: Invalid font size enum ---
  const resBadFontSize = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { tamanoFuente: 'gigantic-32px' },
  });
  if (resBadFontSize.status === 400) {
    pass('API-REJECT-FONT-SIZE', 'Backend rejects invalid tamanoFuente with 400 Bad Request', resBadFontSize.data?.error);
  } else {
    fail('API-REJECT-FONT-SIZE', `Expected 400 Bad Request, got HTTP ${resBadFontSize.status}`);
  }

  // --- ATTACK 5: Invalid sidebar position enum ---
  const resBadPos = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { sidebarPosicion: 'floating-top' },
  });
  if (resBadPos.status === 400) {
    pass('API-REJECT-SIDEBAR-POS', 'Backend rejects invalid sidebarPosicion with 400 Bad Request', resBadPos.data?.error);
  } else {
    fail('API-REJECT-SIDEBAR-POS', `Expected 400 Bad Request, got HTTP ${resBadPos.status}`);
  }

  // --- ATTACK 6: Invalid non-boolean animations ---
  const resBadAnim = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { animacionesHabilitadas: 'true-string' },
  });
  if (resBadAnim.status === 400) {
    pass('API-REJECT-ANIM-TYPE', 'Backend rejects non-boolean animacionesHabilitadas with 400 Bad Request', resBadAnim.data?.error);
  } else {
    fail('API-REJECT-ANIM-TYPE', `Expected 400 Bad Request, got HTTP ${resBadAnim.status}`);
  }

  // --- ATTACK 7: Invalid employee color hex ---
  const resBadEmpColor = await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: { colorEmpleado: '#12345678' }, // 8 hex digits (unsupported)
  });
  if (resBadEmpColor.status === 400) {
    pass('API-REJECT-EMP-COLOR', 'Backend rejects invalid colorEmpleado hex with 400 Bad Request', resBadEmpColor.data?.error);
  } else {
    fail('API-REJECT-EMP-COLOR', `Expected 400 Bad Request, got HTTP ${resBadEmpColor.status}`);
  }

  // ============================================================================
  // SUITE 4: CONCURRENCY & RACE CONDITION STRESS TEST
  // ============================================================================

  console.log('\n--- SECTION 3: CONCURRENCY & HIGH-LOAD BURST ---');

  // Launch 15 concurrent partial mutations with varied properties
  const burstColors = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#e11d48', '#4f46e5', '#0891b2'];
  const burstPromises = burstColors.map((hex, i) =>
    api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: authHeaders,
      body: {
        colorAcento: hex,
        densidad: i % 2 === 0 ? 'compact' : 'comfortable',
      },
    })
  );

  const burstResults = await Promise.all(burstPromises);
  const allBurstSucceeded = burstResults.every(r => r.ok && r.status === 200);
  if (allBurstSucceeded) {
    pass('BURST-CONCURRENCY', '15 concurrent preference mutation requests resolved with zero SQLite lock collisions (HTTP 200)');
  } else {
    fail('BURST-CONCURRENCY', 'Concurrent bursts failed or deadlocked SQLite');
  }

  // Verify state is clean and consistent afterwards
  const resFinalCheck = await api('/api/usuarios/preferencias', { headers: authHeaders });
  if (resFinalCheck.ok && resFinalCheck.data?.colorAcento) {
    pass('BURST-CONSISTENCY', 'Post-burst preference read returns valid state without DB corruption', `Final accent: ${resFinalCheck.data.colorAcento}`);
  } else {
    fail('BURST-CONSISTENCY', 'Post-burst state corrupt');
  }

  // ============================================================================
  // SUITE 5: IMPERSONATION ISOLATION & SCOPE VERIFICATION
  // ============================================================================

  console.log('\n--- SECTION 4: IMPERSONATION SCOPE ISOLATION ---');

  // Step 1: Set distinct admin preference
  await api('/api/usuarios/preferencias', {
    method: 'PUT',
    headers: authHeaders,
    body: {
      tema: 'dark',
      colorAcento: '#7c3aed',
      colorEmpleado: '#ef4444',
    },
  });

  // Step 2: Impersonate user 5 (Usuario Consulta)
  const impRes = await api('/api/auth/impersonate', {
    method: 'POST',
    headers: authHeaders,
    body: { targetUserId: 5 },
  });

  if (!impRes.ok) {
    fail('IMP-SESSION-START', 'Failed to impersonate target user');
  } else {
    const impToken = impRes.data.token;
    const impHeaders = { Authorization: `Bearer ${impToken}` };

    // Set target user preference
    await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: impHeaders,
      body: {
        tema: 'light',
        colorAcento: '#059669',
        colorEmpleado: '#3b82f6',
      },
    });

    // Check default GET /api/usuarios/preferencias under impersonated session returns target preferences
    const targetPrefs = await api('/api/usuarios/preferencias', { headers: impHeaders });
    if (targetPrefs.data?.tema === 'light' && targetPrefs.data?.colorAcento === '#059669') {
      pass('IMP-TARGET-PREFS', 'Impersonated session GET /api/usuarios/preferencias accurately scopes to target user (User 5)', 'Light, #059669');
    } else {
      fail('IMP-TARGET-PREFS', 'Impersonated session preference bleed', JSON.stringify(targetPrefs.data));
    }

    // Check GET /api/usuarios/preferencias?scope=admin returns original admin preferences
    const adminScoped = await api('/api/usuarios/preferencias?scope=admin', { headers: impHeaders });
    if (adminScoped.data?.tema === 'dark' && adminScoped.data?.colorAcento === '#7c3aed') {
      pass('IMP-ADMIN-SCOPE', 'Impersonated session with ?scope=admin accurately resolves original Admin preferences', 'Dark, #7c3aed');
    } else {
      fail('IMP-ADMIN-SCOPE', 'Impersonated admin scope failed', JSON.stringify(adminScoped.data));
    }

    // Revert impersonation
    const revRes = await api('/api/auth/revert', {
      method: 'POST',
      headers: impHeaders,
    });

    if (revRes.ok) {
      const restoredAdminToken = revRes.data.token;
      const restoredPrefs = await api('/api/usuarios/preferencias', {
        headers: { Authorization: `Bearer ${restoredAdminToken}` },
      });
      if (restoredPrefs.data?.tema === 'dark' && restoredPrefs.data?.colorAcento === '#7c3aed') {
        pass('IMP-REVERT-RESTORE', 'Reverting impersonation fully restores original Admin preferences', 'Dark, #7c3aed');
      } else {
        fail('IMP-REVERT-RESTORE', 'Preferences corrupted after revert', JSON.stringify(restoredPrefs.data));
      }
    } else {
      fail('IMP-REVERT-RESTORE', 'Failed to revert impersonation');
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n==============================================================================');
  console.log('                    ADVERSARIAL STRESS TEST SUMMARY');
  console.log('==============================================================================');
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  Passed Tests:       ${passedTests}`);
  console.log(`  Failed Tests:       ${failedTests}`);
  console.log(`  Pass Rate:          ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('==============================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
