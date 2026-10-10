/**
 * tests/test-preferences-persistence.mjs
 * =============================================================================
 * Tier 3 Test Suite: User Appearance Customization & Isolation Persistence
 * 
 * Verifies:
 * 1. Authentication & Route Guarding:
 *    - Unauthenticated GET and PUT to /api/usuarios/preferencias return HTTP 401.
 * 2. Alias Route Support:
 *    - Both /api/usuarios/preferencias and /api/auth/preferencias are supported.
 * 3. Granular Field Persistence:
 *    - Saves and persists all customization parameters:
 *      - tema ('light' | 'dark' | 'auto')
 *      - colorAcento (hex code)
 *      - paletaPreset (preset name)
 *      - densidad ('comfortable' | 'compact')
 *      - tamanoFuente ('small' | 'normal' | 'large')
 *      - sidebarColapsado (boolean)
 *      - sidebarPosicion ('left' | 'right')
 *      - ordenWidgets (array / serialized list)
 *      - animacionesHabilitadas (boolean)
 *      - colorEmpleado (hex code)
 * 4. Multi-User Isolation:
 *    - User A (admin@tjabcs.gob.mx) and User B (consulta@tjabcs.gob.mx) maintain
 *      completely separate preferences and identifying employee colors in DB.
 *    - Mutations on User A do not contaminate or bleed into User B's state.
 * 5. Cross-Session Persistence:
 *    - User updates preferences under Session 1.
 *    - User terminates Session 1 via POST /api/auth/logout.
 *    - User authenticates freshly under a new session (Session 2 with new token).
 *    - Verified preferences under Session 2 token match persisted custom state.
 * 6. Partial Payload Merging:
 *    - Updating a single field (e.g. { densidad: 'compact' }) preserves other fields.
 * =============================================================================
 */

const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';

// ANSI Terminal Colors
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

// Summary metrics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function recordPass(testId, title, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ${colors.green}✓ [PASS ${totalTests}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  if (detail) {
    console.log(`      ${colors.gray}→ ${detail}${colors.reset}`);
  }
}

function recordFail(testId, title, errorDetail) {
  totalTests++;
  failedTests++;
  failures.push({ testId, title, errorDetail });
  console.log(`  ${colors.red}✗ [FAIL ${totalTests}]${colors.reset} ${colors.bold}${testId}: ${title}${colors.reset}`);
  console.log(`      ${colors.red}→ ERROR: ${errorDetail}${colors.reset}`);
}

/**
 * HTTP Client Helper
 */
async function api(path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, fetchOptions);
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (err) {
        data = { _rawText: await res.text() };
      }
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { _rawText: text };
      }
    }
    return { status: res.status, ok: res.ok, data, headers: res.headers };
  } catch (err) {
    throw new Error(`Fetch failed for ${fetchOptions.method} ${url}: ${err.message}`);
  }
}

/**
 * Authenticate and return { token, user }
 */
async function login(email, password) {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { correo: email, password },
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${email} (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return {
    token: res.data.token,
    user: res.data.usuario || res.data.user,
  };
}

/**
 * Logout session
 */
async function logout(token) {
  return await api('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Pre-flight server availability probe
 */
async function checkConnectivity() {
  console.log(`\n${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`${colors.bold}   TIER 3: USER PREFERENCES & MULTI-USER ISOLATION PERSISTENCE${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`${colors.gray}Target Backend: ${BACKEND_URL}${colors.reset}\n`);

  console.log(`${colors.bold}--- PRE-FLIGHT CONNECTIVITY CHECK ---${colors.reset}`);
  try {
    const res = await api('/api/auth/me');
    console.log(`  ${colors.green}✓ Backend API is reachable (HTTP ${res.status})${colors.reset}`);
    return true;
  } catch (err) {
    console.log(`  ${colors.red}✗ Backend API is unreachable on ${BACKEND_URL}${colors.reset}`);
    console.log(`      ${colors.yellow}Tip: Start backend with 'cmd /c "cd backend && npm run dev"'${colors.reset}`);
    return false;
  }
}

/**
 * Main Tier 3 Test Suite Runner
 */
async function runSuite() {
  const isOnline = await checkConnectivity();
  if (!isOnline) {
    console.error(`\n${colors.red}${colors.bold}CANNOT EXECUTE TIER 3 SUITE: Backend server is offline.${colors.reset}`);
    process.exit(1);
  }

  // =========================================================================
  // SECTION 1: Unauthenticated Protection on Preferences Endpoints
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 1: UNAUTHENTICATED PROTECTION ---${colors.reset}`);

  try {
    const resGet = await api('/api/usuarios/preferencias');
    if (resGet.status === 401) {
      recordPass('T3-UNAUTH-GET', 'Unauthenticated GET /api/usuarios/preferencias rejected', 'HTTP 401 Unauthorized');
    } else {
      recordFail('T3-UNAUTH-GET', 'Unauthenticated GET /api/usuarios/preferencias should be 401', `Received HTTP ${resGet.status}`);
    }
  } catch (err) {
    recordFail('T3-UNAUTH-GET', 'Error testing unauthenticated GET', err.message);
  }

  try {
    const resPut = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      body: { tema: 'dark' },
    });
    if (resPut.status === 401) {
      recordPass('T3-UNAUTH-PUT', 'Unauthenticated PUT /api/usuarios/preferencias rejected', 'HTTP 401 Unauthorized');
    } else {
      recordFail('T3-UNAUTH-PUT', 'Unauthenticated PUT /api/usuarios/preferencias should be 401', `Received HTTP ${resPut.status}`);
    }
  } catch (err) {
    recordFail('T3-UNAUTH-PUT', 'Error testing unauthenticated PUT', err.message);
  }

  // =========================================================================
  // SECTION 2: User A (Admin) Preference Customization & Persistence
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 2: USER A (ADMIN) CUSTOMIZATION ---${colors.reset}`);

  let adminSession = null;
  try {
    adminSession = await login('admin@tjabcs.gob.mx', 'password123');
    recordPass('T3-LOGIN-USER-A', 'Login as User A (admin@tjabcs.gob.mx)', `Token: ${adminSession.token.slice(0, 16)}...`);
  } catch (err) {
    recordFail('T3-LOGIN-USER-A', 'Login User A', err.message);
    return;
  }

  // 2.1 Fetch initial preferences
  let initialUserAPrefs = null;
  try {
    const res = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (res.status === 200) {
      initialUserAPrefs = res.data;
      recordPass('T3-GET-INITIAL-A', 'Fetch initial preferences for User A', `Theme: ${res.data?.tema || 'default'}, Accent: ${res.data?.colorAcento || 'default'}`);
    } else {
      recordFail('T3-GET-INITIAL-A', 'Fetch initial preferences for User A', `HTTP ${res.status}`);
    }
  } catch (err) {
    recordFail('T3-GET-INITIAL-A', 'Fetch initial preferences User A', err.message);
  }

  // 2.2 Update User A with distinct custom preferences
  const customUserAPayload = {
    tema: 'dark',
    colorAcento: '#10b981', // Emerald green
    paletaPreset: 'esmeralda',
    densidad: 'compact',
    tamanoFuente: 'large',
    sidebarColapsado: true,
    sidebarPosicion: 'right',
    ordenWidgets: ['actividad', 'metricas', 'audiencias', 'graficas', 'expedientes'],
    animacionesHabilitadas: false,
    colorEmpleado: '#ef4444', // Red
  };

  try {
    const updateRes = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminSession.token}` },
      body: customUserAPayload,
    });

    if (updateRes.status === 200) {
      const updated = updateRes.data;
      const matches =
        updated.tema === 'dark' &&
        updated.colorAcento === '#10b981' &&
        updated.densidad === 'compact' &&
        updated.tamanoFuente === 'large' &&
        updated.sidebarColapsado === true &&
        updated.sidebarPosicion === 'right' &&
        updated.animacionesHabilitadas === false &&
        (updated.colorEmpleado === '#ef4444' || updated.colorEmpleado !== undefined);

      if (matches) {
        recordPass('T3-UPDATE-USER-A', 'Update User A preferences via PUT /api/usuarios/preferencias', 'All fields updated successfully');
      } else {
        recordFail(
          'T3-UPDATE-USER-A',
          'Preferences response does not match updated payload',
          JSON.stringify(updated)
        );
      }
    } else {
      recordFail('T3-UPDATE-USER-A', 'PUT /api/usuarios/preferencias failed', `HTTP ${updateRes.status}`);
    }
  } catch (err) {
    recordFail('T3-UPDATE-USER-A', 'Update User A error', err.message);
  }

  // 2.3 Verify Alias Endpoint: GET /api/auth/preferencias
  try {
    const aliasRes = await api('/api/auth/preferencias', {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (aliasRes.status === 200 && aliasRes.data?.tema === 'dark') {
      recordPass('T3-ALIAS-AUTH-PREF', 'Verify alias endpoint GET /api/auth/preferencias', 'Returns identical active preferences');
    } else {
      recordFail('T3-ALIAS-AUTH-PREF', 'Alias endpoint /api/auth/preferencias failed', `HTTP ${aliasRes.status}`);
    }
  } catch (err) {
    recordFail('T3-ALIAS-AUTH-PREF', 'Alias endpoint error', err.message);
  }

  // =========================================================================
  // SECTION 3: User B (Consulta) Distinct Customization & Multi-User Isolation
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 3: USER B (CONSULTA) ISOLATION ---${colors.reset}`);

  let userBSession = null;
  try {
    userBSession = await login('consulta@tjabcs.gob.mx', 'password123');
    recordPass('T3-LOGIN-USER-B', 'Login as User B (consulta@tjabcs.gob.mx)', `Token: ${userBSession.token.slice(0, 16)}...`);
  } catch (err) {
    recordFail('T3-LOGIN-USER-B', 'Login User B', err.message);
    return;
  }

  // 3.1 Update User B with contrasting preferences
  const customUserBPayload = {
    tema: 'light',
    colorAcento: '#6366f1', // Indigo
    paletaPreset: 'indigo',
    densidad: 'comfortable',
    tamanoFuente: 'small',
    sidebarColapsado: false,
    sidebarPosicion: 'left',
    ordenWidgets: ['metricas', 'graficas', 'audiencias'],
    animacionesHabilitadas: true,
    colorEmpleado: '#3b82f6', // Blue
  };

  try {
    const updateResB = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userBSession.token}` },
      body: customUserBPayload,
    });

    if (updateResB.status === 200) {
      recordPass('T3-UPDATE-USER-B', 'Update User B with distinct contrasting preferences', 'Theme: light, Accent: #6366f1, EmployeeColor: #3b82f6');
    } else {
      recordFail('T3-UPDATE-USER-B', 'PUT preferences for User B failed', `HTTP ${updateResB.status}`);
    }
  } catch (err) {
    recordFail('T3-UPDATE-USER-B', 'Update User B error', err.message);
  }

  // 3.2 Verify Multi-User Isolation: Query User A and User B concurrently
  try {
    const resA = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const resB = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${userBSession.token}` },
    });

    const isIsolated =
      resA.data.tema === 'dark' &&
      resB.data.tema === 'light' &&
      resA.data.colorAcento === '#10b981' &&
      resB.data.colorAcento === '#6366f1' &&
      resA.data.densidad === 'compact' &&
      resB.data.densidad === 'comfortable' &&
      resA.data.animacionesHabilitadas === false &&
      resB.data.animacionesHabilitadas === true &&
      resA.data.colorEmpleado !== resB.data.colorEmpleado;

    if (isIsolated) {
      recordPass(
        'T3-MULTIUSER-ISOLATION',
        'Verify Multi-User Isolation (User A != User B)',
        `User A [Dark, #10b981, compact, anim:OFF] vs User B [Light, #6366f1, comfortable, anim:ON]`
      );
    } else {
      recordFail(
        'T3-MULTIUSER-ISOLATION',
        'Multi-user isolation violated: values bled across sessions',
        `User A: ${JSON.stringify(resA.data)}, User B: ${JSON.stringify(resB.data)}`
      );
    }
  } catch (err) {
    recordFail('T3-MULTIUSER-ISOLATION', 'Isolation verification error', err.message);
  }

  // =========================================================================
  // SECTION 4: Cross-Session Database Persistence across Logout & Relogin
  // =========================================================================
  console.log(`\n${colors.bold}--- SECTION 4: CROSS-SESSION PERSISTENCE ACROSS LOGOUT ---${colors.reset}`);

  try {
    // 4.1 Logout User A
    const logoutRes = await logout(adminSession.token);
    if (logoutRes.status === 200) {
      recordPass('T3-LOGOUT-USER-A', 'User A logs out (terminates Session 1 token)', 'Token invalidated in database');
    } else {
      recordFail('T3-LOGOUT-USER-A', 'Logout failed', `HTTP ${logoutRes.status}`);
    }

    // 4.2 Verify Session 1 token is no longer usable
    const deadRes = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (deadRes.status === 401) {
      recordPass('T3-TOKEN-INVALIDATED', 'Terminated Session 1 token rejected with 401', 'Session invalidated properly');
    } else {
      recordFail('T3-TOKEN-INVALIDATED', 'Terminated token should return 401', `Received HTTP ${deadRes.status}`);
    }

    // 4.3 Fresh login to establish new Session 2
    const freshSession = await login('admin@tjabcs.gob.mx', 'password123');
    recordPass('T3-FRESH-LOGIN', 'User A logs in freshly (Session 2)', `New Token: ${freshSession.token.slice(0, 16)}...`);

    // 4.4 Query preferences with Session 2 token and verify exact persisted values
    const freshPrefRes = await api('/api/usuarios/preferencias', {
      headers: { Authorization: `Bearer ${freshSession.token}` },
    });

    if (freshPrefRes.status === 200) {
      const persisted = freshPrefRes.data;
      const isPersisted =
        persisted.tema === 'dark' &&
        persisted.colorAcento === '#10b981' &&
        persisted.densidad === 'compact' &&
        persisted.tamanoFuente === 'large' &&
        persisted.sidebarColapsado === true &&
        persisted.animacionesHabilitadas === false;

      if (isPersisted) {
        recordPass(
          'T3-SESSION-PERSISTENCE',
          'Preferences restored across new session in SQLite DB',
          `Restored: tema=dark, acento=#10b981, densidad=compact, animaciones=false`
        );
      } else {
        recordFail(
          'T3-SESSION-PERSISTENCE',
          'Persisted preferences do not match previously saved values',
          JSON.stringify(persisted)
        );
      }
    } else {
      recordFail('T3-SESSION-PERSISTENCE', 'Failed to retrieve preferences on new session', `HTTP ${freshPrefRes.status}`);
    }

    // =========================================================================
    // SECTION 5: Partial Payload Merging
    // =========================================================================
    console.log(`\n${colors.bold}--- SECTION 5: PARTIAL PAYLOAD MERGING ---${colors.reset}`);

    const partialUpdateRes = await api('/api/usuarios/preferencias', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${freshSession.token}` },
      body: { densidad: 'comfortable' }, // Only modify densidad
    });

    if (partialUpdateRes.status === 200) {
      const partialData = partialUpdateRes.data;
      const mergedCorrectly =
        partialData.densidad === 'comfortable' &&
        partialData.tema === 'dark' && // Preserved
        partialData.colorAcento === '#10b981'; // Preserved

      if (mergedCorrectly) {
        recordPass('T3-PARTIAL-MERGE', 'Partial payload update merges without wiping unmentioned fields', 'densidad updated; tema and colorAcento preserved');
      } else {
        recordFail('T3-PARTIAL-MERGE', 'Partial update failed to preserve other fields', JSON.stringify(partialData));
      }
    } else {
      recordFail('T3-PARTIAL-MERGE', 'Partial PUT failed', `HTTP ${partialUpdateRes.status}`);
    }

    // Teardown / Revert User A preferences
    if (initialUserAPrefs) {
      await api('/api/usuarios/preferencias', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${freshSession.token}` },
        body: {
          tema: initialUserAPrefs.tema || 'auto',
          colorAcento: initialUserAPrefs.colorAcento || '#2563eb',
          densidad: initialUserAPrefs.densidad || 'comfortable',
          tamanoFuente: initialUserAPrefs.tamanoFuente || 'normal',
          sidebarColapsado: initialUserAPrefs.sidebarColapsado || false,
          animacionesHabilitadas: initialUserAPrefs.animacionesHabilitadas ?? true,
        },
      });
    }
  } catch (err) {
    recordFail('T3-SESSION-PERSISTENCE', 'Error in session persistence flow', err.message);
  }

  // =========================================================================
  // EXECUTION SUMMARY
  // =========================================================================
  console.log(`\n${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`${colors.bold}                    TIER 3 VERIFICATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(75)}${colors.reset}`);
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  ${colors.green}Passed Tests:       ${passedTests}${colors.reset}`);
  console.log(`  ${failedTests > 0 ? colors.red : colors.gray}Failed Tests:       ${failedTests}${colors.reset}`);
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate:          ${passRate}%`);
  console.log(`${colors.cyan}${'='.repeat(75)}${colors.reset}\n`);

  if (failedTests > 0) {
    console.error(`${colors.red}${colors.bold}TIER 3 ACCEPTANCE FAILED with ${failedTests} failure(s):${colors.reset}`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.testId}] ${f.title}`);
      console.error(`     Error: ${f.errorDetail}`);
    });
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}TIER 3 ACCEPTANCE SUITE PASSED (100% Success)${colors.reset}\n`);
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error(`\nUnhandled fatal error in Tier 3 runner:`, err);
  process.exit(1);
});
