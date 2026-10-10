import fs from 'fs';
const p = 'frontend/src/components/shell/AppSidebar.tsx';
let s = fs.readFileSync(p, 'utf8');
const a = s.indexOf('  // Hierarchical Accordion Groups');
const b = s.indexOf('  // Accordion State Initialization');
const data = `  // Hierarchical Accordion Groups: Judicial first, then Usuarios
  // (search, notifications, appearance and settings live ONLY in the header)
  const accordionGroups: NavAccordionGroup[] = [
    {
      id: 'judicial',
      title: 'Judicial',
      icon: Scale,
      defaultOpen: true,
      items: [
        { id: 'expedientes', label: 'Expedientes', href: '/expedientes', icon: FolderOpen },
        { id: 'agenda', label: 'Agenda y Audiencias', href: '/agenda', icon: Calendar },
        { id: 'reportes', label: 'Analítica Avanzada', href: '/reportes', icon: BarChart3 },
        { id: 'documentos', label: 'Archivo Judicial Digital', href: '/documentos', icon: Archive, badge: 'Próximamente', badgeType: 'coming-soon' },
        { id: 'mensajeria', label: 'Mensajería Procesal', href: '/mensajeria', icon: MessageSquare, badge: 'Próximamente', badgeType: 'coming-soon' },
      ],
    },
    {
      id: 'usuarios',
      title: 'Usuarios',
      icon: Users,
      items: [
        { id: 'directorio-usuarios', label: 'Directorio de Usuarios', href: '/usuarios', icon: Users, permission: 'usuarios:view' },
        { id: 'roles-permisos', label: 'Roles y Permisos', href: '/configuracion/roles', icon: ShieldCheck, adminOnly: !canManageRoles && !hasPerm('roles:manage') },
      ],
    },
  ];

  // Sistema section
  const systemStandaloneItems: StandaloneNavItem[] = [
    { id: 'ayuda', label: 'Centro de Ayuda', href: '/ayuda', icon: HelpCircle },
  ];

`;
s = s.slice(0, a) + data + s.slice(b);
const c = s.indexOf('            {topStandaloneItems.filter(isItemVisible).map((item) => {');
const d = s.indexOf('          </div>', c);
const block = s.slice(c, d);
s = s.slice(0, c) + '            {renderStandalone(topStandaloneItems, collapsed, isDrawer)}\n' + s.slice(d);
let body = block.replace('{topStandaloneItems.filter(isItemVisible).map((item) => {', 'items.filter(isItemVisible).map((item) => {').replace(/\}\)\}\s*$/, '});');
const fn = '  const renderStandalone = (items: StandaloneNavItem[], collapsed: boolean, isDrawer: boolean) =>\n' + body.replace(/^ {12}/gm, '    ') + '\n';
s = s.replace('  const renderNavContent = (isDrawer = false) => {', fn + '  const renderNavContent = (isDrawer = false) => {');
s = s.replace('Áreas de Gestión', 'Gestión').replace('(Dashboard, Búsqueda)', '(Dashboard)');
s = s.replace('        </nav>', `
          <div className="h-px bg-slate-800/80 my-2 mx-2" />
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Sistema
              </p>
            )}
            {renderStandalone(systemStandaloneItems, collapsed, isDrawer)}
          </div>
        </nav>`);
fs.writeFileSync(p, s);
