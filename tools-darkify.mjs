import fs from 'fs';
import path from 'path';
const root = 'frontend/src';
const skip = ['AppSidebar.tsx', 'AppHeader.tsx'];
const C = '(?:blue|green|red|amber|emerald|yellow|orange|purple|indigo|rose|sky|teal|violet|cyan)';
const rules = [
  [/^bg-white(\/\d+)?$/, (m) => `bg-slate-900${m[1] || ''}`, 'bg'],
  [/^bg-slate-50(\/\d+)?$/, (m) => `bg-slate-800/50`, 'bg'],
  [/^bg-slate-100$/, () => 'bg-slate-800', 'bg'],
  [/^bg-slate-200$/, () => 'bg-slate-700', 'bg'],
  [/^text-slate-(900|800)$/, () => 'text-slate-100', 'text'],
  [/^text-slate-700$/, () => 'text-slate-200', 'text'],
  [/^text-slate-600$/, () => 'text-slate-300', 'text'],
  [/^text-slate-500$/, () => 'text-slate-400', 'text'],
  [/^border-slate-(100|200)$/, (m) => (m[1] === '100' ? 'border-slate-800' : 'border-slate-700'), 'border'],
  [/^border-slate-300$/, () => 'border-slate-600', 'border'],
  [/^divide-slate-(100|200)$/, () => 'divide-slate-800', 'divide'],
  [new RegExp(`^bg-(${C})-(50|100)$`), (m) => `bg-${m[1]}-950/40`, 'bg'],
  [new RegExp(`^text-(${C})-(600|700|800|900)$`), (m) => `text-${m[1]}-300`, 'text'],
  [new RegExp(`^border-(${C})-(200|300)$`), (m) => `border-${m[1]}-800`, 'border'],
];
const hov = [
  [/^bg-slate-(50|100)$/, 'bg-slate-800'],
  [/^bg-white$/, 'bg-slate-800'],
  [/^text-slate-(900|800|700)$/, 'text-white'],
  [new RegExp(`^bg-(${C})-(50|100)$`), null],
];
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|astro)$/.test(f) && !skip.includes(f)) out.push(p);
  }
  return out;
}
let changed = [];
for (const file of walk(root)) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let mod = false;
  const res = lines.map((line) => {
    if (!/(bg-|text-|border-|divide-)/.test(line)) return line;
    return line.replace(/(?<![\w:\-\/\[])((?:hover:|focus:|group-hover:)?)((?:bg|text|border|divide)-[a-z]+(?:-\d+)?(?:\/\d+)?)(?![\w\-\/\]])/g, (all, pre, tok) => {
      const kind = tok.split('-')[0];
      const key = pre ? `dark:${pre}${kind}-` : `dark:${kind}-`;
      if (line.includes(key)) return all;
      if (pre === 'hover:') {
        for (const [re, rep] of hov) {
          const m = tok.match(re);
          if (m) {
            if (rep) { mod = true; return `${all} dark:hover:${rep}`; }
            const mm = tok.match(new RegExp(`^bg-(${C})-`));
            mod = true; return `${all} dark:hover:bg-${mm[1]}-900/40`;
          }
        }
        return all;
      }
      if (pre) return all;
      for (const [re, fn] of rules) {
        const m = tok.match(re);
        if (m) { mod = true; return `${all} dark:${fn(m)}`; }
      }
      return all;
    });
  });
  if (mod) { fs.writeFileSync(file, res.join('\n')); changed.push(file); }
}
console.log(changed.join('\n'));
