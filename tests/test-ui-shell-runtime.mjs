// Runtime verification: persistent shell (no fade/remount), main-only swap, active route, scroll reset, dark mode.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FRONT = 'http://localhost:4321', BACK = 'http://localhost:3001', PORT = 9444;
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
const login = await (await fetch(`${BACK}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: 'admin@tjabcs.gob.mx', password: 'password123' }) })).json();
const token = login.token || login.data?.token;
const me = await (await fetch(`${BACK}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
const user = me.user || me.data || me;
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-first-run', '--window-size=1400,900', `--user-data-dir=${path.join(os.tmpdir(), 'rt-' + Date.now())}`], { stdio: 'ignore' });
let ready = false;
for (let i = 0; i < 40 && !ready; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); ready = true; } catch { await new Promise(r => setTimeout(r, 250)); } }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const cb = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && cb.has(d.id)) { cb.get(d.id)(d); cb.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; cb.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCookie', { name: 'auth_token', value: token, domain: 'localhost', path: '/' });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('auth_token',${JSON.stringify(token)});localStorage.setItem('auth_user',${JSON.stringify(JSON.stringify(user))});}catch(e){}` });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

await send('Page.navigate', { url: `${FRONT}/` }); await sleep(2500);
await ev(`window.__aside=document.querySelector('aside'); window.__header=document.querySelector('header'); window.__main=document.querySelector('main'); window.__marks=[]; ['astro:before-swap','astro:after-swap','astro:page-load'].forEach(n=>document.addEventListener(n,()=>window.__marks.push(n))); 1`);
const hasShell = await ev(`!!(window.__aside && window.__header && window.__main)`);
check('shell present (aside, header, main)', hasShell);

const routes = ['/expedientes', '/agenda', '/usuarios', '/'];
let prevText = await ev(`document.querySelector('main').innerText.slice(0,200)`);
for (const r of routes) {
  await ev(`document.querySelector('main').scrollTop=500; window.__tag = document.querySelector('main').scrollTop; 1`);
  await ev(`(()=>{const a=document.querySelector('aside a[href="${r}"]'); if(!a) return 'nolink'; window.__anims=[]; const iv=setInterval(()=>{ for(const s of [document.querySelector('aside'),document.querySelector('header')]) { s.getAnimations({subtree:true}).forEach(x=>{ if(x.transitionProperty===undefined && (x.effect?.getKeyframes?.().some(k=>k.opacity!==undefined))) window.__anims.push(s.tagName); }); } },10); window.__iv=iv; a.click(); return 'ok'})()`);
  await sleep(1800);
  await ev(`clearInterval(window.__iv); 1`);
  const res = JSON.parse(await ev(`JSON.stringify({
    path: location.pathname,
    sameAside: document.querySelector('aside')===window.__aside,
    sameHeader: document.querySelector('header')===window.__header,
    sameMain: document.querySelector('main')===window.__main,
    anims: window.__anims.length,
    scroll: document.querySelector('main').scrollTop,
    text: document.querySelector('main').innerText.slice(0,200),
    active: Array.from(document.querySelectorAll('aside a')).filter(a=>/text-blue-400/.test(a.className) && /font-semibold/.test(a.className)).map(a=>a.getAttribute('href')),
    title: document.querySelector('header h1')?.innerText,
    marks: window.__marks.slice(-3)
  })`));
  check(`nav ${r}: url changed`, res.path === r, res.path);
  check(`nav ${r}: aside persisted (same node)`, res.sameAside);
  check(`nav ${r}: header persisted (same node)`, res.sameHeader);
  check(`nav ${r}: main swapped`, !res.sameMain);
  check(`nav ${r}: no opacity animations on aside/header`, res.anims === 0, `anims=${res.anims}`);
  check(`nav ${r}: main scroll reset`, res.scroll === 0, `scrollTop=${res.scroll}`);
  check(`nav ${r}: main content changed`, res.text !== prevText);
  check(`nav ${r}: active link updated`, res.active.includes(r), JSON.stringify(res.active));
  check(`nav ${r}: page-load fired`, res.marks.includes('astro:page-load'));
  console.log('      header title:', res.title);
  prevText = res.text;
  await ev(`window.__main=document.querySelector('main'); 1`);
}
// main fade present in layout
await send('Page.navigate', { url: `${FRONT}/` }); await sleep(2000);
check('main has fade transition scope', await ev(`document.querySelector('main').hasAttribute('data-astro-transition-scope')`));
check('shell island has persist attr', await ev(`!!document.querySelector('[data-astro-transition-persist]')`));

// dark mode contrast: toggle dark & scan pages for light backgrounds
await ev(`localStorage.setItem('tja_preferencias', JSON.stringify({tema:'dark'})); 1`);
const pages = ['/', '/expedientes', '/expedientes/nuevo', '/agenda', '/usuarios', '/usuarios/nuevo', '/configuracion', '/reportes', '/notificaciones', '/ayuda', '/busqueda', '/documentos', '/mensajeria', '/configuracion/roles'];
for (const p of pages) {
  await send('Page.navigate', { url: `${FRONT}${p}` }); await sleep(2200);
  const r = JSON.parse(await ev(`(()=>{
    const lum=(c)=>{const m=c.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const [r,g,b,a=1]=m[1].split(',').map(parseFloat); if(a<0.3) return null; return (0.2126*r+0.7152*g+0.0722*b)/255;};
    const isDark=document.documentElement.classList.contains('dark');
    const bad=[]; document.querySelectorAll('main *').forEach(el=>{const cs=getComputedStyle(el); if(el.offsetParent===null) return; const l=lum(cs.backgroundColor); if(l!==null && l>0.85){const rect=el.getBoundingClientRect(); if(rect.width>40&&rect.height>16) bad.push(el.tagName+'.'+String(el.className).slice(0,50));}});
    return JSON.stringify({isDark,bodyBg:getComputedStyle(document.body).backgroundColor,bad:bad.slice(0,5),n:bad.length});
  })()`));
  check(`dark ${p}: html.dark & no light surfaces`, r.isDark && r.n === 0, `lightEls=${r.n} ${r.bad.join(' | ')}`);
}
// theme toggle in /configuracion
await send('Page.navigate', { url: `${FRONT}/configuracion` }); await sleep(2000);
const t1 = await ev(`document.getElementById('cfg-theme-toggle').getAttribute('aria-checked')`);
await ev(`document.getElementById('cfg-theme-toggle').click(); 1`); await sleep(500);
const t2 = await ev(`[document.getElementById('cfg-theme-toggle').getAttribute('aria-checked'), document.documentElement.classList.contains('dark'), JSON.parse(localStorage.getItem('tja_preferencias')).tema].join(',')`);
check('configuracion theme toggle works (dark->light)', t1 === 'true' && t2 === 'false,false,light', `${t1} -> ${t2}`);
console.log(`\nTOTAL pass=${pass} fail=${fail}`);
ws.close(); proc.kill(); process.exit(fail ? 1 : 0);
