const BASE_URL = 'http://localhost:3001';

async function runTests() {
  console.log('======================================================================');
  console.log('   TJA BCS — MILESTONE 1 ENDPOINTS VALIDATION SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Auth Login Admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const adminToken = loginData.token;
  assert(loginRes.status === 200 && !!adminToken, 'Admin authentication successful');

  // Auth Login Consulta
  const consultaRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'consulta@tjabcs.gob.mx', password: 'password123' })
  });
  const consultaData = await consultaRes.json();
  const consultaToken = consultaData.token;
  assert(consultaRes.status === 200 && !!consultaToken, 'Consulta authentication successful');

  // ============================================================================
  // PREFERENCIAS ENDPOINTS
  // ============================================================================
  console.log('\n--- [1] PREFERENCIAS API ---');

  // 1.1 Unauthenticated GET
  const unauthPref = await fetch(`${BASE_URL}/api/usuarios/preferencias`);
  assert(unauthPref.status === 401, 'Unauthenticated GET /api/usuarios/preferencias returns 401');

  // 1.2 Authenticated GET /api/usuarios/preferencias
  const getPref = await fetch(`${BASE_URL}/api/usuarios/preferencias`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const prefData = await getPref.json();
  assert(getPref.status === 200 && prefData.tema && prefData.colorEmpleado === '#7c3aed', 
    `GET /api/usuarios/preferencias returns 200 with colorEmpleado (${prefData.colorEmpleado}) and tema (${prefData.tema})`);

  // 1.3 Alias GET /api/auth/preferencias
  const getAliasPref = await fetch(`${BASE_URL}/api/auth/preferencias`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const aliasData = await getAliasPref.json();
  assert(getAliasPref.status === 200 && aliasData.colorEmpleado === prefData.colorEmpleado,
    'Alias GET /api/auth/preferencias returns identical payload');

  // 1.4 Valid PUT /api/usuarios/preferencias
  const putPref = await fetch(`${BASE_URL}/api/usuarios/preferencias`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tema: 'light',
      densidad: 'compact',
      colorEmpleado: '#6366f1',
      ordenWidgets: ['expedientes', 'metricas']
    })
  });
  const putData = await putPref.json();
  assert(putPref.status === 200 && putData.tema === 'light' && putData.densidad === 'compact' && putData.colorEmpleado === '#6366f1' && Array.isArray(putData.ordenWidgets),
    'PUT /api/usuarios/preferencias successfully updates preferences and colorEmpleado');

  // 1.5 Invalid PUT (bad hex color)
  const badColor = await fetch(`${BASE_URL}/api/usuarios/preferencias`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ colorAcento: 'not-hex' })
  });
  assert(badColor.status === 400, 'PUT with invalid hex color returns 400 Bad Request');

  // 1.6 Invalid PUT (bad tema)
  const badTema = await fetch(`${BASE_URL}/api/usuarios/preferencias`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tema: 'ultra-dark' })
  });
  assert(badTema.status === 400, 'PUT with invalid tema returns 400 Bad Request');

  // 1.7 Dedicated PUT /api/usuarios/color-empleado
  const putColor = await fetch(`${BASE_URL}/api/usuarios/color-empleado`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ colorEmpleado: '#7c3aed' })
  });
  const putColorData = await putColor.json();
  assert(putColor.status === 200 && putColorData.colorEmpleado === '#7c3aed',
    'PUT /api/usuarios/color-empleado updates colorEmpleado successfully');

  // Restore Admin original preferences
  await fetch(`${BASE_URL}/api/usuarios/preferencias`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tema: 'dark', densidad: 'comfortable', colorEmpleado: '#7c3aed' })
  });

  // ============================================================================
  // AUDIENCIAS ENDPOINTS
  // ============================================================================
  console.log('\n--- [2] AUDIENCIAS API ---');

  // 2.1 Unauthenticated GET
  const unauthAud = await fetch(`${BASE_URL}/api/audiencias`);
  assert(unauthAud.status === 401, 'Unauthenticated GET /api/audiencias returns 401');

  // 2.2 Authenticated GET
  const getAud = await fetch(`${BASE_URL}/api/audiencias`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const audList = await getAud.json();
  assert(getAud.status === 200 && Array.isArray(audList) && audList.length > 0,
    `GET /api/audiencias returns 200 with ${audList.length} seeded hearings`);

  // 2.3 Filtered GET by ano
  const filterAud = await fetch(`${BASE_URL}/api/audiencias?ano=2026`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const filterList = await filterAud.json();
  assert(filterAud.status === 200 && Array.isArray(filterList),
    `GET /api/audiencias?ano=2026 returns 200 with filtered items (${filterList.length})`);

  // 2.4 GET by ID
  const firstAudId = audList[0].id;
  const getOneAud = await fetch(`${BASE_URL}/api/audiencias/${firstAudId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const oneAudData = await getOneAud.json();
  assert(getOneAud.status === 200 && oneAudData.id === firstAudId,
    `GET /api/audiencias/${firstAudId} returns 200 with complete hearing details`);

  // 2.5 POST create new Audiencia
  const newAudRes = await fetch(`${BASE_URL}/api/audiencias`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expedienteId: audList[0].expedienteId,
      fecha: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      tipo: 'Audiencia de Conciliación',
      descripcion: 'Prueba unitaria de agendamiento',
      estado: 'programada'
    })
  });
  const createdAud = await newAudRes.json();
  assert(newAudRes.status === 201 && createdAud.tipo === 'Audiencia de Conciliación',
    `POST /api/audiencias creates new hearing (ID: ${createdAud.id})`);

  // 2.6 PUT update Audiencia
  const updateAudRes = await fetch(`${BASE_URL}/api/audiencias/${createdAud.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      descripcion: 'Descripción actualizada vía PUT test'
    })
  });
  const updatedAud = await updateAudRes.json();
  assert(updateAudRes.status === 200 && updatedAud.descripcion === 'Descripción actualizada vía PUT test',
    `PUT /api/audiencias/${createdAud.id} updates hearing details`);

  // 2.7 DELETE Audiencia
  const delAudRes = await fetch(`${BASE_URL}/api/audiencias/${createdAud.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert(delAudRes.status === 200, `DELETE /api/audiencias/${createdAud.id} returns 200 OK`);

  // 2.8 Unauthorized POST (Consulta role lacks create/edit)
  const unauthPost = await fetch(`${BASE_URL}/api/audiencias`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${consultaToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expedienteId: audList[0].expedienteId,
      fecha: new Date().toISOString(),
      tipo: 'Audiencia no permitida'
    })
  });
  assert(unauthPost.status === 403, 'POST /api/audiencias without permission returns 403 Forbidden');

  // ============================================================================
  // NOTIFICACIONES ENDPOINTS
  // ============================================================================
  console.log('\n--- [3] NOTIFICACIONES API ---');

  // 3.1 Unauthenticated GET
  const unauthNotif = await fetch(`${BASE_URL}/api/notificaciones`);
  assert(unauthNotif.status === 401, 'Unauthenticated GET /api/notificaciones returns 401');

  // 3.2 Authenticated GET
  const getNotifs = await fetch(`${BASE_URL}/api/notificaciones`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const notifList = await getNotifs.json();
  const unreadHeader = getNotifs.headers.get('x-unread-count');
  assert(getNotifs.status === 200 && Array.isArray(notifList) && unreadHeader !== null,
    `GET /api/notificaciones returns 200 with X-Unread-Count: ${unreadHeader}`);

  // 3.3 GET /unread-count
  const getUnread = await fetch(`${BASE_URL}/api/notificaciones/unread-count`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const unreadData = await getUnread.json();
  assert(getUnread.status === 200 && typeof unreadData.count === 'number',
    `GET /api/notificaciones/unread-count returns count: ${unreadData.count}`);

  // 3.4 POST temporary notification and PATCH as read
  const createNotif = await fetch(`${BASE_URL}/api/notificaciones`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      titulo: 'Notificación Test',
      mensaje: 'Prueba de marcación de lectura',
      tipo: 'info'
    })
  });
  const newNotif = await createNotif.json();
  assert(createNotif.status === 201 && newNotif.id, `POST /api/notificaciones created test notification ${newNotif.id}`);

  const patchRead = await fetch(`${BASE_URL}/api/notificaciones/${newNotif.id}/leida`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const patchData = await patchRead.json();
  assert(patchRead.status === 200 && patchData.success === true && patchData.notificacion.leida === true,
    `PATCH /api/notificaciones/${newNotif.id}/leida marks notification as read`);

  // 3.5 PATCH marcar-todas-leidas
  const markAll = await fetch(`${BASE_URL}/api/notificaciones/marcar-todas-leidas`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const markAllData = await markAll.json();
  assert(markAll.status === 200 && markAllData.success === true,
    `PATCH /api/notificaciones/marcar-todas-leidas returns success: true, count: ${markAllData.count}`);

  // ============================================================================
  // REPORTES ENDPOINTS
  // ============================================================================
  console.log('\n--- [4] REPORTES API ---');

  // 4.1 Unauthenticated GET
  const unauthRep = await fetch(`${BASE_URL}/api/reportes/estadisticas`);
  assert(unauthRep.status === 401, 'Unauthenticated GET /api/reportes/estadisticas returns 401');

  // 4.2 Authenticated GET
  const getRep = await fetch(`${BASE_URL}/api/reportes/estadisticas`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const repData = await getRep.json();
  assert(getRep.status === 200 &&
    typeof repData.totalExpedientes === 'number' &&
    Array.isArray(repData.porEstatus) &&
    Array.isArray(repData.porSala) &&
    Array.isArray(repData.porMes) &&
    repData.kpis &&
    typeof repData.kpis.totalAudiencias === 'number',
    `GET /api/reportes/estadisticas returns comprehensive stats: ${repData.totalExpedientes} expedientes, ${repData.porEstatus.length} estatus categories, ${repData.kpis.totalAudiencias} audiencias`);

  // ============================================================================
  // EXPEDIENTES FILTERING
  // ============================================================================
  console.log('\n--- [5] EXPEDIENTES FILTERING ---');

  // 5.1 Text search filter
  const searchExp = await fetch(`${BASE_URL}/api/expedientes?search=001`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const searchResults = await searchExp.json();
  assert(searchExp.status === 200 && Array.isArray(searchResults) && searchResults.every(e => e.folio.includes('001') || (e.notas && e.notas.includes('001'))),
    `GET /api/expedientes?search=001 returns filtered matches (${searchResults.length})`);

  // 5.2 Sala ID filter
  const salaExp = await fetch(`${BASE_URL}/api/expedientes?salaId=1`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const salaResults = await salaExp.json();
  assert(salaExp.status === 200 && Array.isArray(salaResults) && salaResults.every(e => e.salaId === 1),
    `GET /api/expedientes?salaId=1 returns only Sala I records (${salaResults.length})`);

  // 5.3 Estatus ID filter
  const estatusExp = await fetch(`${BASE_URL}/api/expedientes?estatusId=1`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const estatusResults = await estatusExp.json();
  assert(estatusExp.status === 200 && Array.isArray(estatusResults) && estatusResults.every(e => e.estatusId === 1),
    `GET /api/expedientes?estatusId=1 returns only matching status records (${estatusResults.length})`);

  console.log('\n======================================================================');
  console.log(`  Tests Passed: ${passed} | Tests Failed: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
