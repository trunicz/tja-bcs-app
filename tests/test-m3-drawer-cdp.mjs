import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function testDrawer() {
  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9444;
  const tempDir = path.join(os.tmpdir(), 'cdp-drawer-test-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  const proc = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempDir}`,
    '--disable-gpu',
    '--no-first-run'
  ]);

  try {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const v = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (v.ok) break;
      } catch {}
    }

    // Login admin
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' })
    });
    const { token } = await loginRes.json();

    const newTab = await fetch(`http://127.0.0.1:${cdpPort}/json/new?http://localhost:4321/`, { method: 'PUT' });
    const tab = await newTab.json();

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 0;
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++msgId;
      const handler = (evt) => {
        const m = JSON.parse(evt.data);
        if (m.id === id) {
          ws.removeEventListener('message', handler);
          resolve(m.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');

    await send('Network.setCookie', {
      name: 'auth_token',
      value: token,
      domain: 'localhost',
      path: '/'
    });

    await send('Page.navigate', { url: 'http://localhost:4321/' });
    await new Promise(r => setTimeout(r, 1200));

    // Test 1: Open drawer via event
    await send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new CustomEvent('tja:open-appearance-drawer'))`
    });
    await new Promise(r => setTimeout(r, 500));

    // Test 2: Check drawer DOM presence
    const domRes = await send('Runtime.evaluate', {
      expression: `
        (function() {
          const drawer = document.querySelector('[role="dialog"]');
          const title = drawer ? drawer.querySelector('h2')?.textContent : null;
          return {
            hasDrawer: Boolean(drawer),
            title
          };
        })()
      `,
      returnByValue: true
    });
    console.log('1. Drawer presence:', JSON.stringify(domRes.result.value));

    // Test 3: Live palette switch to purpura
    const switchPalette = await send('Runtime.evaluate', {
      expression: `
        (function() {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Púrpura'));
          if (btn) {
            btn.click();
            return {
              clicked: true,
              dataAccent: document.documentElement.getAttribute('data-accent')
            };
          }
          return { clicked: false };
        })()
      `,
      returnByValue: true
    });
    console.log('2. Palette switch:', JSON.stringify(switchPalette.result.value));

    // Test 4: Live theme toggle to dark
    const switchTheme = await send('Runtime.evaluate', {
      expression: `
        (function() {
          const darkBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Oscuro'));
          if (darkBtn) {
            darkBtn.click();
            return {
              clicked: true,
              dataTheme: document.documentElement.getAttribute('data-theme'),
              hasDarkClass: document.documentElement.classList.contains('dark')
            };
          }
          return { clicked: false };
        })()
      `,
      returnByValue: true
    });
    console.log('3. Theme switch:', JSON.stringify(switchTheme.result.value));

    // Test 5: Live animation toggle
    const toggleAnim = await send('Runtime.evaluate', {
      expression: `
        (function() {
          const switchBtn = document.querySelector('button[role="switch"]');
          if (switchBtn) {
            switchBtn.click();
            return {
              clicked: true,
              dataAnim: document.documentElement.getAttribute('data-animations')
            };
          }
          return { clicked: false };
        })()
      `,
      returnByValue: true
    });
    console.log('4. Animation switch:', JSON.stringify(toggleAnim.result.value));

    // Test 6: Escape key closes drawer
    await send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`
    });
    await new Promise(r => setTimeout(r, 400));

    const closedRes = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('[role="dialog"]'))`,
      returnByValue: true
    });
    console.log('5. Drawer closed after Escape:', !closedRes.result.value);

    ws.close();
  } finally {
    proc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

testDrawer().catch(console.error);
