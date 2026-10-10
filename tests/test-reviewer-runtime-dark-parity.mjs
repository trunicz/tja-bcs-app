import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const FRONTEND_URL = 'http://localhost:4321';
const BACKEND_URL = 'http://localhost:3001';
const CDP_PORT = 9777;

function findBrowserExecutable() {
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

  async connect() {
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
      this.callbacks.set(id, { resolve, reject });
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
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function getAdminToken() {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return { token: data.token, usuario: data.usuario };
}

async function main() {
  console.log('================================================================');
  console.log('   RUNTIME DARK MODE CONTRAST & BACKGROUND AUDIT (CDP)');
  console.log('================================================================');

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    console.error('No Chrome/Edge found!');
    process.exit(1);
  }

  const { token, usuario } = await getAdminToken();
  console.log('Acquired Admin token:', token.substring(0, 16) + '...');

  const tempProfileDir = path.join(os.tmpdir(), `tja-dark-cdp-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempProfileDir}`,
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
  ];

  const browserProc = spawn(browserPath, browserArgs, { stdio: 'ignore' });

  try {
    let cdp = null;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const newRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' });
        if (newRes.ok) {
          const tab = await newRes.json();
          if (tab.webSocketDebuggerUrl) {
            cdp = new CdpSession(tab.webSocketDebuggerUrl);
            await cdp.connect();
            break;
          }
        }
      } catch {}
    }

    if (!cdp) throw new Error('Could not connect to CDP WebSocket tab');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // Set cookie for authentication
    await cdp.send('Network.setCookie', {
      name: 'auth_token',
      value: token,
      url: FRONTEND_URL,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    });

    const authUserPayload = JSON.stringify({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol?.nombre || 'Administrador',
        salaId: usuario.salaId,
        colorEmpleado: usuario.colorEmpleado || '#2563eb',
        permisos: usuario.permisos || [],
      },
      originalAdmin: null,
      isImpersonated: false,
    });

    const initScript = `
      try {
        localStorage.setItem('auth_token', ${JSON.stringify(token)});
        localStorage.setItem('auth_user', ${JSON.stringify(authUserPayload)});
        localStorage.setItem('tja_theme_preference', 'dark');
        localStorage.setItem('tja_user_preferences', JSON.stringify({
          tema: 'dark',
          colorAcento: '#2563eb',
          densidad: 'comfortable',
          tamanoFuente: 'normal',
          animaciones: true
        }));
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
      } catch (e) {}
    `;

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });

    const routesToTest = [
      { name: 'Directorio de Usuarios', url: `${FRONTEND_URL}/usuarios` },
      { name: 'Roles y Permisos', url: `${FRONTEND_URL}/configuracion/roles` },
      { name: 'Centro de Ayuda', url: `${FRONTEND_URL}/ayuda` },
      { name: 'Reportes y Estadísticas', url: `${FRONTEND_URL}/reportes` },
    ];

    let allRoutesClean = true;

    for (const route of routesToTest) {
      console.log(`\n--- Testing Route: ${route.name} (${route.url}) ---`);
      await cdp.send('Page.navigate', { url: route.url });
      await new Promise(r => setTimeout(r, 1500));

      // Re-assert dark mode
      await cdp.send('Runtime.evaluate', {
        expression: `
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.classList.add('dark');
        `
      });
      await new Promise(r => setTimeout(r, 400));

      const auditResult = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const rootTheme = document.documentElement.getAttribute('data-theme');
          const hasDarkClass = document.documentElement.classList.contains('dark');

          // Check visible elements for blinding white backgrounds
          const allEls = Array.from(document.querySelectorAll('main *, body *'));
          const whiteElements = [];

          for (const el of allEls) {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

            const bg = style.backgroundColor;
            const match = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
            if (match) {
              const r = parseInt(match[1]);
              const g = parseInt(match[2]);
              const b = parseInt(match[3]);
              const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

              // White or near-white background container (> 240, 240, 240 with high alpha)
              // Exclude intentional small elements like white badges, svg icons, or text elements
              if (a > 0.7 && r > 240 && g > 240 && b > 240 && rect.width > 20 && rect.height > 20) {
                const tagName = el.tagName.toLowerCase();
                const classList = el.className || '';
                whiteElements.push({
                  tag: tagName,
                  classes: typeof classList === 'string' ? classList.slice(0, 80) : '',
                  bg: bg,
                  size: Math.round(rect.width) + 'x' + Math.round(rect.height)
                });
              }
            }
          }

          const bodyBg = window.getComputedStyle(document.body).backgroundColor;

          return {
            rootTheme,
            hasDarkClass,
            bodyBg,
            whiteElementsCount: whiteElements.length,
            sampleWhiteElements: whiteElements.slice(0, 5)
          };
        })()`,
        returnByValue: true
      });

      const res = auditResult.result.value;
      console.log(`  Root data-theme: ${res.rootTheme}, dark class: ${res.hasDarkClass}`);
      console.log(`  Body computed bg: ${res.bodyBg}`);
      console.log(`  Blinding white elements (r,g,b > 240, size > 20x20): ${res.whiteElementsCount}`);

      if (res.whiteElementsCount > 0) {
        console.log(`  Found white elements:`, res.sampleWhiteElements);
        allRoutesClean = false;
      } else {
        console.log(`  ✓ PASS: Zero blinding white backgrounds detected.`);
      }
    }

    cdp.close();
    console.log('\n================================================================');
    console.log(`RUNTIME DARK MODE ZERO WHITE BACKGROUND VERIFIED: ${allRoutesClean}`);
    console.log('================================================================');

    if (!allRoutesClean) {
      process.exit(1);
    }
  } finally {
    try {
      browserProc.kill();
    } catch {}
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
