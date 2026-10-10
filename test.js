async function run() {
  try {
    let r = await fetch('http://localhost:3001/api/usuarios', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ nombre: 'Test User', correo: 'test@test.com', password: '123', rolId: 1 })
    });
    let u = await r.json();
    console.log('Created:', u);

    r = await fetch('http://localhost:3001/api/usuarios/' + u.id, { 
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ nombre: 'Updated User', correo: 'test@test.com', rolId: 1, salaId: '' }) 
    });
    console.log('Updated with empty salaId:', await r.json());

    r = await fetch('http://localhost:3001/api/usuarios/' + u.id, { method: 'DELETE' });
    console.log('Deleted:', await r.json());
  } catch (e) {
    console.error(e);
  }
}
run();
