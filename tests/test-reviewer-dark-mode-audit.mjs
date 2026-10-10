import fs from 'fs';

const files = [
  'frontend/src/components/UsuariosList.tsx',
  'frontend/src/components/RoleConfiguration.tsx',
  'frontend/src/components/CreateUsuario.tsx',
  'frontend/src/components/EditUsuario.tsx',
  'frontend/src/components/UsuarioDetail.tsx',
  'frontend/src/components/ayuda/HelpCenter.tsx',
  'frontend/src/components/reportes/JudicialReports.tsx',
  'frontend/src/pages/usuarios/index.astro',
  'frontend/src/pages/configuracion/roles.astro',
  'frontend/src/pages/ayuda.astro',
  'frontend/src/pages/reportes.astro'
];

let totalIssues = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  console.log(`\n=== Checking ${file} ===`);
  const classMatches = content.matchAll(/class(?:Name)?="([^"]+)"/g);
  let fileIssues = 0;

  for (const m of classMatches) {
    const classStr = m[1];
    const classes = classStr.split(/\s+/);

    // Light background tokens
    const lightBgs = classes.filter(c => 
      /^(bg-white|bg-slate-[5-9]0|bg-gray-[5-9]0|bg-blue-[5-9]0|bg-indigo-[5-9]0|bg-emerald-[5-9]0|bg-amber-[5-9]0|bg-red-[5-9]0|bg-purple-[5-9]0)(\/\d+)?$/.test(c)
    );

    const hasDarkBg = classes.some(c => 
      c.startsWith('dark:bg-') || 
      c.startsWith('dark:from-') || 
      c.startsWith('dark:to-') ||
      c.startsWith('dark:hover:bg-')
    );

    if (lightBgs.length > 0 && !hasDarkBg) {
      console.log(`  [MISSING DARK BG] Found ${lightBgs.join(', ')}: "${classStr}"`);
      fileIssues++;
    }

    // Light text tokens that might be invisible on dark backgrounds if not adapted
    const lightTexts = classes.filter(c =>
      /^(text-slate-[6-9]00|text-gray-[6-9]00|text-black)$/.test(c)
    );
    const hasDarkText = classes.some(c => c.startsWith('dark:text-'));
    if (lightTexts.length > 0 && !hasDarkText) {
      // Check if this element is inside a light-only container or button
      console.log(`  [INFO: TEXT WITHOUT DARK:TEXT] ${lightTexts.join(', ')}: "${classStr}"`);
    }

    // Borders without dark:border
    const lightBorders = classes.filter(c =>
      /^(border-slate-[2-3]00|border-gray-[2-3]00)$/.test(c)
    );
    const hasDarkBorder = classes.some(c => c.startsWith('dark:border-'));
    if (lightBorders.length > 0 && !hasDarkBorder) {
      console.log(`  [INFO: BORDER WITHOUT DARK:BORDER] ${lightBorders.join(', ')}: "${classStr}"`);
    }
  }

  if (fileIssues === 0) {
    console.log(`  PASS: Zero un-paired light backgrounds!`);
  } else {
    totalIssues += fileIssues;
  }
}

console.log(`\n========================================`);
console.log(`Total missing dark bg issues: ${totalIssues}`);
console.log(`========================================`);
