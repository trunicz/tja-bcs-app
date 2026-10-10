function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function sRGBtoLin(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function getLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}

function getContrast(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const backgrounds = {
  'root-dark (#090d16)': '#090d16',
  'slate-900 (#0f172a)': '#0f172a',
  'slate-800 (#1e293b)': '#1e293b',
  'slate-950 (#020617)': '#020617',
  'amber-950 (#451a03)': '#451a03',
  'blue-950 (#172554)': '#172554',
  'purple-950 (#3b0764)': '#3b0764'
};

const texts = {
  'slate-100 (#f1f5f9)': '#f1f5f9',
  'slate-200 (#e2e8f0)': '#e2e8f0',
  'slate-300 (#cbd5e1)': '#cbd5e1',
  'slate-400 (#94a3b8)': '#94a3b8',
  'amber-200 (#fde68a)': '#fde68a',
  'amber-300 (#fcd34d)': '#fcd34d',
  'amber-400 (#fbbf24)': '#fbbf24',
  'blue-200 (#bfdbfe)': '#bfdbfe',
  'blue-300 (#93c5fd)': '#93c5fd',
  'blue-400 (#60a5fa)': '#60a5fa',
  'purple-200 (#e9d5ff)': '#e9d5ff',
  'purple-300 (#d8b4fe)': '#d8b4fe',
  'emerald-200 (#a7f3d0)': '#a7f3d0',
  'emerald-400 (#34d399)': '#34d399',
  'red-200 (#fecaca)': '#fecaca',
  'red-400 (#f87171)': '#f87171'
};

console.log('================================================================');
console.log('       WCAG 2.1 AA CONTRAST RATIO VERIFICATION MATRIX');
console.log('================================================================');

let allPassed = true;

// Evaluate pairs commonly used across the components
const componentPairs = [
  // General text on main dark backgrounds
  ['slate-900 (#0f172a)', 'slate-100 (#f1f5f9)', 'Primary headings & titles', 4.5],
  ['slate-900 (#0f172a)', 'slate-200 (#e2e8f0)', 'Input text & buttons', 4.5],
  ['slate-900 (#0f172a)', 'slate-300 (#cbd5e1)', 'Body descriptions & form labels', 4.5],
  ['slate-900 (#0f172a)', 'slate-400 (#94a3b8)', 'Secondary hints & breadcrumbs', 4.5],
  ['root-dark (#090d16)', 'slate-100 (#f1f5f9)', 'Page title on root dark', 4.5],
  ['root-dark (#090d16)', 'slate-300 (#cbd5e1)', 'Breadcrumb links on root dark', 4.5],
  ['root-dark (#090d16)', 'slate-400 (#94a3b8)', 'Subtitle on root dark', 4.5],

  // Role Configuration & matrix
  ['slate-800 (#1e293b)', 'slate-200 (#e2e8f0)', 'Role list button & action controls', 4.5],
  ['slate-800 (#1e293b)', 'slate-300 (#cbd5e1)', 'Selected role details & metadata', 4.5],
  ['amber-950 (#451a03)', 'amber-200 (#fde68a)', 'Lockout warning callout text', 4.5],
  ['amber-950 (#451a03)', 'amber-300 (#fcd34d)', 'Impersonation alert banner badge', 4.5],

  // Badges & Pills
  ['blue-950 (#172554)', 'blue-300 (#93c5fd)', 'Module badge & filter pill', 4.5],
  ['purple-950 (#3b0764)', 'purple-200 (#e9d5ff)', 'Superusuario badge text', 4.5],
  ['purple-950 (#3b0764)', 'purple-300 (#d8b4fe)', 'Suplantación Activa badge text', 4.5],

  // KPI cards & Analytics
  ['slate-900 (#0f172a)', 'emerald-400 (#34d399)', 'Tasa de conclusión KPI value', 3.0],
  ['slate-900 (#0f172a)', 'blue-400 (#60a5fa)', 'En trámite KPI value', 3.0],
  ['slate-900 (#0f172a)', 'amber-400 (#fbbf24)', 'Warning metrics & alerts', 3.0],
  ['slate-900 (#0f172a)', 'red-400 (#f87171)', 'Access denied icons & errors', 3.0],

  // Form Inputs
  ['slate-800 (#1e293b)', 'slate-100 (#f1f5f9)', 'Input text in dark form field', 4.5],
  ['slate-900 (#0f172a)', 'slate-300 (#cbd5e1)', 'Label text in dark form field', 4.5]
];

for (const [bgKey, textKey, context, minRatio] of componentPairs) {
  const bgHex = backgrounds[bgKey];
  const textHex = texts[textKey];
  const ratio = getContrast(bgHex, textHex);
  const passed = ratio >= minRatio;
  if (!passed) allPassed = false;
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${ratio.toFixed(2)}:1 (min ${minRatio}:1) | ${context}`);
  console.log(`       Bg: ${bgKey} | Text: ${textKey}`);
}

console.log('================================================================');
console.log(`ALL CONTRAST CHECKS PASSED: ${allPassed}`);
console.log('================================================================');
