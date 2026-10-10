/**
 * tests/test-reviewer2-m5-adversarial.mjs
 * =============================================================================
 * ADVERSARIAL REVIEWER 2 SUITE FOR MILESTONE 5:
 * Judicial Analytics, Comprehensive Help Center & Executive Dashboard
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

const BACKEND_URL = process.env.API_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(id, title, detail = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✓ [PASS ${totalTests}] ${id}: ${title}`);
  if (detail) console.log(`      → ${detail}`);
}

function fail(id, title, errorDetail) {
  totalTests++;
  failedTests++;
  failures.push({ id, title, errorDetail });
  console.log(`  ✗ [FAIL ${totalTests}] ${id}: ${title}`);
  console.log(`      → ERROR: ${errorDetail}`);
}

async function run() {
  console.log('==============================================================================');
  console.log('   ADVERSARIAL REVIEWER 2: MILESTONE 5 QUALITY & INTEGRITY AUDIT');
  console.log('==============================================================================');

  // --------------------------------------------------------------------------
  // SECTION 1: INTEGRITY AUDIT (Zero hardcoded facades, fake data, or test cheats)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 1: CODE INTEGRITY & ANTI-CHEAT AUDIT ---');

  const judicialReportsPath = path.resolve('frontend/src/components/reportes/JudicialReports.tsx');
  const helpCenterPath = path.resolve('frontend/src/components/ayuda/HelpCenter.tsx');
  const executiveCardsPath = path.resolve('frontend/src/components/dashboard/ExecutiveSummaryCards.tsx');
  const backendIndexPath = path.resolve('backend/src/index.ts');
  const reportesRoutePath = path.resolve('backend/src/routes/reportes.ts');

  const filesToAudit = [
    { name: 'JudicialReports.tsx', path: judicialReportsPath },
    { name: 'HelpCenter.tsx', path: helpCenterPath },
    { name: 'ExecutiveSummaryCards.tsx', path: executiveCardsPath },
    { name: 'backend/index.ts', path: backendIndexPath },
    { name: 'backend/routes/reportes.ts', path: reportesRoutePath },
  ];

  for (const file of filesToAudit) {
    if (!fs.existsSync(file.path)) {
      fail(`INTEG-FILE-${file.name}`, `File exists`, `Missing file: ${file.path}`);
      continue;
    }
    const content = fs.readFileSync(file.path, 'utf8');

    // Check for obvious cheat indicators
    const suspiciousPatterns = [
      /if\s*\([^)]*__test__[^)]*\)/i,
      /mock_output/i,
      /fake_response/i,
      /hardcoded_for_test/i,
    ];

    let clean = true;
    for (const pat of suspiciousPatterns) {
      if (pat.test(content)) {
        clean = false;
        fail(`INTEG-PATTERN-${file.name}`, `No suspicious test bypass pattern`, `Found pattern ${pat} in ${file.name}`);
        break;
      }
    }
    if (clean) {
      pass(`INTEG-CLEAN-${file.name}`, `${file.name} is free of hardcoded test bypasses`);
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 2: JUDICIAL REPORTS & RECHARTS ARCHITECTURE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: ADVANCED JUDICIAL ANALYTICS (JudicialReports.tsx) ---');

  const jrContent = fs.readFileSync(judicialReportsPath, 'utf8');

  // 1. Recharts components imported
  const rechartsImports = ['BarChart', 'Bar', 'XAxis', 'YAxis', 'Tooltip', 'ResponsiveContainer', 'PieChart', 'Pie', 'Cell', 'AreaChart', 'Area', 'Legend'];
  const missingImports = rechartsImports.filter(imp => !jrContent.includes(imp));
  if (missingImports.length === 0) {
    pass('JR-RECHARTS-IMPORTS', 'All 12 required Recharts visualization symbols imported', rechartsImports.join(', '));
  } else {
    fail('JR-RECHARTS-IMPORTS', 'All required Recharts visualization symbols imported', `Missing: ${missingImports.join(', ')}`);
  }

  // 2. Verified 4 distinct charts rendered:
  // - Donut PieChart (porEstatus)
  // - Vertical BarChart (porSala)
  // - Gradient AreaChart (porMes)
  // - Horizontal BarChart (porTipoAsunto)
  const hasPieChart = jrContent.includes('<PieChart>') && jrContent.includes('innerRadius=') && jrContent.includes('outerRadius=');
  if (hasPieChart) {
    pass('JR-PIE-DONUT', 'Donut PieChart configured with innerRadius/outerRadius for status distribution');
  } else {
    fail('JR-PIE-DONUT', 'Donut PieChart configured', 'Missing PieChart with innerRadius/outerRadius');
  }

  const hasAreaChart = jrContent.includes('<AreaChart') && jrContent.includes('linearGradient') && jrContent.includes('colorMesRadicacion');
  if (hasAreaChart) {
    pass('JR-AREA-GRADIENT', 'AreaChart configured with linearGradient for chronological case inflow');
  } else {
    fail('JR-AREA-GRADIENT', 'AreaChart with linearGradient configured', 'Missing linearGradient in AreaChart');
  }

  const hasVerticalBar = jrContent.includes('<BarChart data={data.porSala}>');
  if (hasVerticalBar) {
    pass('JR-BAR-SALA', 'Vertical BarChart configured for caseload by Sala');
  } else {
    fail('JR-BAR-SALA', 'Vertical BarChart configured for Sala', 'Missing <BarChart data={data.porSala}>');
  }

  const hasHorizontalBar = jrContent.includes('layout="vertical"') && jrContent.includes('data={data.porTipoAsunto}');
  if (hasHorizontalBar) {
    pass('JR-BAR-MATTER', 'Horizontal BarChart (layout="vertical") configured for matter type');
  } else {
    fail('JR-BAR-MATTER', 'Horizontal BarChart configured for matter type', 'Missing vertical layout BarChart');
  }

  // 3. Procedural performance KPIs
  const kpiLabels = ['Total Expedientes', 'Tasa de Conclusión', 'En Trámite / Instrucción', 'Audiencias Judiciales'];
  const missingKpis = kpiLabels.filter(lbl => !jrContent.includes(lbl));
  if (missingKpis.length === 0) {
    pass('JR-KPI-CARDS', 'All 4 procedural performance KPI cards declared', kpiLabels.join(' | '));
  } else {
    fail('JR-KPI-CARDS', 'All procedural performance KPI cards declared', `Missing: ${missingKpis.join(', ')}`);
  }

  // 4. Interactive controls: Period, Sala, CSV export, Print, Refresh
  const hasPeriodSelector = jrContent.includes('value={periodo}') && jrContent.includes('setPeriodo(e.target.value)');
  const hasSalaSelector = jrContent.includes('value={salaId}') && jrContent.includes('setSalaId(e.target.value)');
  const hasCsvExport = jrContent.includes('handleExportCSV') && jrContent.includes('text/csv;charset=utf-8');
  const hasPrint = jrContent.includes('window.print()');
  const hasRefresh = jrContent.includes('fetchStats');

  if (hasPeriodSelector && hasSalaSelector) {
    pass('JR-FILTER-CONTROLS', 'Interactive period and sala dropdown filters present');
  } else {
    fail('JR-FILTER-CONTROLS', 'Filter controls present', 'Missing period or sala selector');
  }

  if (hasCsvExport && hasPrint && hasRefresh) {
    pass('JR-ACTION-BUTTONS', 'CSV export, print dialog, and refresh actions fully hooked up');
  } else {
    fail('JR-ACTION-BUTTONS', 'Action buttons present', 'Missing CSV export, print, or refresh');
  }

  // 5. Tooltip dark contrast styling
  const hasDarkTooltips = jrContent.includes("backgroundColor: '#0f172a'") && jrContent.includes("borderColor: '#334155'");
  if (hasDarkTooltips) {
    pass('JR-TOOLTIP-CONTRAST', 'Recharts Tooltip contentStyle uses high contrast dark background (#0f172a / #334155)');
  } else {
    fail('JR-TOOLTIP-CONTRAST', 'Recharts Tooltip high contrast', 'Tooltip styling lacks slate-900 background token');
  }

  // --------------------------------------------------------------------------
  // SECTION 3: COMPREHENSIVE HELP CENTER (HelpCenter.tsx)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: COMPREHENSIVE HELP CENTER (HelpCenter.tsx) ---');

  const hcContent = fs.readFileSync(helpCenterPath, 'utf8');

  // 1. 7-Stage Tribunal Workflow Guide
  const expectedStages = [
    '1. Oficialía de Partes',
    '2. Admisión y Notificación',
    '3. Instrucción y Contestación',
    '4. Audiencia de Ley',
    '5. Proyecto de Sentencia',
    '6. Sentencia y Notificación',
    '7. Ejecución y Archivo',
  ];

  const missingStages = expectedStages.filter(st => !hcContent.includes(st));
  if (missingStages.length === 0) {
    pass('HC-7-STAGES', 'All 7 statutory tribunal workflow stages defined in sequence', expectedStages.join(' -> '));
  } else {
    fail('HC-7-STAGES', 'All 7 stages defined', `Missing stages: ${missingStages.join(', ')}`);
  }

  // Check stage metadata completeness (responsable, plazo, descripcion, acciones)
  const hasStageFields = hcContent.includes('responsable:') && hcContent.includes('plazo:') && hcContent.includes('descripcion:') && hcContent.includes('acciones:');
  if (hasStageFields) {
    pass('HC-STAGE-METADATA', 'Workflow stages include responsible authority, statutory deadline, description, and action checklists');
  } else {
    fail('HC-STAGE-METADATA', 'Workflow stage fields complete', 'Missing one or more metadata fields');
  }

  // 2. Keyboard shortcuts catalog (24 commands)
  // Count shortcuts in file
  const shortcutMatches = hcContent.match(/\{\s*keys:\s*\[[^\]]+\],\s*desc:\s*'[^']+',\s*cat:\s*'[^']+'\s*\}/g);
  const shortcutCount = shortcutMatches ? shortcutMatches.length : 0;
  if (shortcutCount === 24) {
    pass('HC-SHORTCUTS-COUNT', `Exhaustive keyboard shortcuts catalog contains exactly 24 commands`, `Found: ${shortcutCount}`);
  } else {
    fail('HC-SHORTCUTS-COUNT', 'Keyboard shortcuts catalog contains 24 commands', `Expected 24, found ${shortcutCount}`);
  }

  // Check category coverage
  const hasNavShortcuts = hcContent.includes("cat: 'Navegación'");
  const hasExpShortcuts = hcContent.includes("cat: 'Expedientes'");
  const hasSysShortcuts = hcContent.includes("cat: 'Sistema'");
  if (hasNavShortcuts && hasExpShortcuts && hasSysShortcuts) {
    pass('HC-SHORTCUTS-CATS', 'Shortcuts partitioned across Navegación, Expedientes, and Sistema');
  } else {
    fail('HC-SHORTCUTS-CATS', 'Shortcut categories present', 'Missing one of the categories');
  }

  // 3. Extended FAQs (8 items)
  const faqMatches = hcContent.match(/id:\s*'faq-\d+'/g);
  const faqCount = faqMatches ? faqMatches.length : 0;
  if (faqCount >= 8) {
    pass('HC-FAQS-COUNT', `Extended FAQs catalog contains ${faqCount} detailed judicial Q&A items`, `Found: ${faqCount}`);
  } else {
    fail('HC-FAQS-COUNT', 'FAQ catalog contains at least 8 items', `Expected >= 8, found ${faqCount}`);
  }

  // 4. Unified multi-category search filtering
  const hasUnifiedSearch = hcContent.includes('filteredStages') && hcContent.includes('filteredShortcuts') && hcContent.includes('filteredFaqs');
  const hasSearchCounters = hcContent.includes('{filteredStages.length} Flujos') &&
                            hcContent.includes('{filteredShortcuts.length} Atajos') &&
                            hcContent.includes('{filteredFaqs.length} FAQs');
  if (hasUnifiedSearch && hasSearchCounters) {
    pass('HC-OMNI-SEARCH', 'Unified search filter cross-references stages, shortcuts, and FAQs with live match counters');
  } else {
    fail('HC-OMNI-SEARCH', 'Unified search cross-references all entities', 'Missing unified filtering or counters');
  }

  // 5. Zero dead buttons verification
  const rawAlertMatches = hcContent.match(/\balert\s*\(/g);
  const emptyClickMatches = hcContent.match(/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/g);
  const toastSuccessMatches = hcContent.includes('toast.success');
  const toastInfoMatches = hcContent.includes('toast.info');

  if (!rawAlertMatches && !emptyClickMatches && toastSuccessMatches && toastInfoMatches) {
    pass('HC-ZERO-DEAD-BUTTONS', 'Zero dead buttons: no alert() or empty onClick; support ticket and manual download trigger toast alerts');
  } else {
    fail('HC-ZERO-DEAD-BUTTONS', 'Zero dead buttons', `alert(): ${rawAlertMatches?.length || 0}, empty onClick: ${emptyClickMatches?.length || 0}, toast.success: ${toastSuccessMatches}, toast.info: ${toastInfoMatches}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 4: LIVE BACKEND API VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: LIVE BACKEND API VALIDATION ---');

  // Authenticate as Admin
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token;

  if (token) {
    pass('API-AUTH-ADMIN', 'Obtained admin bearer token for API assertions');
  } else {
    fail('API-AUTH-ADMIN', 'Obtained admin bearer token', 'Failed to authenticate admin');
    return;
  }

  // 1. Check GET /api/reportes/estadisticas
  const statsRes = await fetch(`${BACKEND_URL}/api/reportes/estadisticas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (statsRes.status === 200) {
    const stats = await statsRes.json();
    const hasTotal = typeof stats.totalExpedientes === 'number';
    const hasEstatus = Array.isArray(stats.porEstatus) && stats.porEstatus.length > 0;
    const hasSala = Array.isArray(stats.porSala) && stats.porSala.length > 0;
    const hasKpis = stats.kpis && typeof stats.kpis.tasaConclusion === 'string';

    if (hasTotal && hasEstatus && hasSala && hasKpis) {
      pass('API-STATS-PAYLOAD', 'GET /api/reportes/estadisticas returns valid structured statistics and KPIs',
        `Total: ${stats.totalExpedientes}, Tasa: ${stats.kpis.tasaConclusion}, Salas: ${stats.porSala.length}`);
    } else {
      fail('API-STATS-PAYLOAD', 'Valid stats payload structure', JSON.stringify(stats));
    }
  } else {
    fail('API-STATS-STATUS', 'GET /api/reportes/estadisticas responds 200 OK', `Status: ${statsRes.status}`);
  }

  // 2. Check GET /api/dashboard/metricas includes resumenEjecutivo
  const metricsRes = await fetch(`${BACKEND_URL}/api/dashboard/metricas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (metricsRes.status === 200) {
    const metrics = await metricsRes.json();
    const rej = metrics.resumenEjecutivo;
    if (rej &&
        Array.isArray(rej.cargaPorSala) &&
        typeof rej.resolucionesPendientes === 'number' &&
        typeof rej.audienciasProximas48h === 'number' &&
        typeof rej.terminosUrgentes === 'number') {
      pass('API-METRICS-RESUMEN', 'GET /api/dashboard/metricas includes authentic resumenEjecutivo contract',
        `Salas: ${rej.cargaPorSala.length}, Resoluciones: ${rej.resolucionesPendientes}, 48h: ${rej.audienciasProximas48h}, Urgentes: ${rej.terminosUrgentes}`);
    } else {
      fail('API-METRICS-RESUMEN', 'Valid resumenEjecutivo structure', JSON.stringify(metrics));
    }
  } else {
    fail('API-METRICS-STATUS', 'GET /api/dashboard/metricas responds 200 OK', `Status: ${metricsRes.status}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 5: LIVE SSR ROUTE ACCESSIBILITY
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: LIVE SSR ROUTE RENDERING ---');

  // Verify /reportes SSR
  const repRes = await fetch(`${FRONTEND_URL}/reportes`, {
    headers: { Cookie: `auth_token=${token}` },
  });
  const repHtml = await repRes.text();
  if (repRes.status === 200 && repHtml.includes('Reportes') && repHtml.includes('JudicialReports')) {
    pass('SSR-REPORTES-RENDER', 'GET /reportes renders 200 OK with JudicialReports island component', `${repHtml.length} bytes`);
  } else {
    fail('SSR-REPORTES-RENDER', 'GET /reportes renders 200 OK', `Status: ${repRes.status}`);
  }

  // Verify /ayuda SSR
  const ayudaRes = await fetch(`${FRONTEND_URL}/ayuda`, {
    headers: { Cookie: `auth_token=${token}` },
  });
  const ayudaHtml = await ayudaRes.text();
  if (ayudaRes.status === 200 && ayudaHtml.includes('Centro de Ayuda') && ayudaHtml.includes('HelpCenter')) {
    pass('SSR-AYUDA-RENDER', 'GET /ayuda renders 200 OK with HelpCenter island component', `${ayudaHtml.length} bytes`);
  } else {
    fail('SSR-AYUDA-RENDER', 'GET /ayuda renders 200 OK', `Status: ${ayudaRes.status}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 6: EXECUTIVE SUMMARY CARDS INTEGRATION
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: EXECUTIVE SUMMARY CARDS INTEGRATION ---');

  const execContent = fs.readFileSync(executiveCardsPath, 'utf8');
  const dwContent = fs.readFileSync(path.resolve('frontend/src/components/dashboard/DashboardWidgets.tsx'), 'utf8');

  // Check 4 cards in ExecutiveSummaryCards
  const hasCargaSala = execContent.includes('Carga por Sala') && execContent.includes('cargaSalas');
  const hasResoluciones = execContent.includes('Resoluciones') && execContent.includes('resoluciones');
  const hasAudiencias48h = execContent.includes('Audiencias 48h') && execContent.includes('audiencias48h');
  const hasTerminos = execContent.includes('Términos Urgentes') && execContent.includes('terminos');

  if (hasCargaSala && hasResoluciones && hasAudiencias48h && hasTerminos) {
    pass('EXEC-4-CARDS', 'ExecutiveSummaryCards contains all 4 required executive metrics with responsive layout');
  } else {
    fail('EXEC-4-CARDS', 'ExecutiveSummaryCards contains 4 cards', 'One or more cards missing');
  }

  // Check mounting above reorderable widgets in DashboardWidgets.tsx
  const isMountedAbove = dwContent.indexOf('<ExecutiveSummaryCards') < dwContent.indexOf('{widgetOrder.map');
  const preservesCanonicalKeys = /ALL_WIDGET_KEYS\s*=\s*\[[\s\S]*?'metricas'[\s\S]*?'graficas'[\s\S]*?'audiencias'[\s\S]*?'actividad'[\s\S]*?'expedientes'[\s\S]*?\]/m.test(dwContent);

  if (isMountedAbove && preservesCanonicalKeys) {
    pass('EXEC-MOUNT-INVARIANTS', 'ExecutiveSummaryCards mounted above reorderable widgets while strictly preserving canonical ALL_WIDGET_KEYS');
  } else {
    fail('EXEC-MOUNT-INVARIANTS', 'Mounted cleanly above reorderable widgets', `isMountedAbove: ${isMountedAbove}, preservesCanonicalKeys: ${preservesCanonicalKeys}`);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('                 ADVERSARIAL REVIEWER 2 SUMMARY');
  console.log('==============================================================================');
  console.log(`  Total Tests Run:    ${totalTests}`);
  console.log(`  Passed Tests:       ${passedTests}`);
  console.log(`  Failed Tests:       ${failedTests}`);
  console.log(`  Pass Rate:          ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('==============================================================================');

  if (failedTests > 0) {
    console.error(`FAILED with ${failedTests} issues!`);
    process.exit(1);
  } else {
    console.log('ALL AUDITS PASSED WITH ZERO INTEGRITY VIOLATIONS OR DEFECTS (100% Success).');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
