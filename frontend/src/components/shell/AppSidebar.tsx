import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  BarChart3,
  Users,
  ShieldCheck,
  HelpCircle,
  Archive,
  MessageSquare,
  Scale,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import type { User } from '../../lib/auth';

export interface AppSidebarProps {
  currentPath: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  unreadCount?: number;
  user?: User | null;
  canManageRoles?: boolean;
  position?: 'left' | 'right';
}

export interface NavChildItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeType?: 'count' | 'coming-soon';
  adminOnly?: boolean;
  permission?: string;
}

export interface NavAccordionGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  items: NavChildItem[];
}

export interface StandaloneNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeType?: 'count' | 'coming-soon';
  adminOnly?: boolean;
  permission?: string;
}

export default function AppSidebar({
  currentPath,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  unreadCount = 0,
  user,
  canManageRoles = false,
  position = 'left',
}: AppSidebarProps) {
  const isGlobalAdmin = user?.rol === 'Administrador';
  const userPermisos = Array.isArray(user?.permisos) ? user.permisos : [];

  const hasPerm = (code?: string, adminOnly?: boolean): boolean => {
    if (isGlobalAdmin) return true;
    if (adminOnly) return false;
    if (!code) return true;
    return userPermisos.includes(code);
  };

  // Helper to determine active link without collision
  const isLinkActive = (href: string): boolean => {
    if (href === '/') {
      return currentPath === '/' || currentPath === '';
    }
    if (href === '/configuracion') {
      return currentPath.startsWith('/configuracion') && !currentPath.startsWith('/configuracion/roles');
    }
    if (href === '/configuracion/roles') {
      return currentPath.startsWith('/configuracion/roles');
    }
    if (href === '/documentos' || href === '/archivo-judicial') {
      return currentPath.startsWith('/documentos') || currentPath.startsWith('/archivo-judicial');
    }
    if (href === '/mensajeria' || href === '/mensajeria-procesal') {
      return currentPath.startsWith('/mensajeria') || currentPath.startsWith('/mensajeria-procesal');
    }
    return currentPath.startsWith(href);
  };

  // Top Standalone Items
  const topStandaloneItems: StandaloneNavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
    },
  ];

  // Hierarchical Accordion Groups: Judicial first, then Usuarios
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

  // Accordion State Initialization with Route Persistence
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of accordionGroups) {
      const hasActiveChild = group.items.some((item) => isLinkActive(item.href));
      if (hasActiveChild) {
        initial[group.id] = true;
      } else {
        try {
          const saved = typeof window !== 'undefined' ? localStorage.getItem(`tja_accordion_${group.id}`) : null;
          initial[group.id] = saved !== null ? saved === 'true' : Boolean(group.defaultOpen);
        } catch {
          initial[group.id] = Boolean(group.defaultOpen);
        }
      }
    }
    return initial;
  });

  // Auto-expand group when currentPath changes and matches any child route
  useEffect(() => {
    for (const group of accordionGroups) {
      const hasActiveChild = group.items.some((item) => isLinkActive(item.href));
      if (hasActiveChild) {
        setExpandedGroups((prev) => {
          if (!prev[group.id]) {
            return { ...prev, [group.id]: true };
          }
          return prev;
        });
      }
    }
  }, [currentPath]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const nextState = !prev[groupId];
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`tja_accordion_${groupId}`, String(nextState));
        }
      } catch {
        // storage fallback
      }
      return { ...prev, [groupId]: nextState };
    });
  };

  const isItemVisible = (item: { adminOnly?: boolean; permission?: string }) => {
    if (item.adminOnly && !isGlobalAdmin && !canManageRoles && !hasPerm('roles:manage')) return false;
    if (item.permission && !hasPerm(item.permission)) return false;
    return true;
  };

  const renderStandalone = (items: StandaloneNavItem[], collapsed: boolean, isDrawer: boolean) =>
    items.filter(isItemVisible).map((item) => {
      const active = isLinkActive(item.href);
      const Icon = item.icon;

      return (
        <div key={item.id} className="relative group">
          <a
            href={item.href}
            onClick={() => isDrawer && onCloseMobile()}
            title={collapsed ? item.label : undefined}
            className={`group relative flex items-center rounded-xl transition-all duration-150 ${
              collapsed ? 'justify-center w-11 h-11 mx-auto' : 'px-3 py-2.5 gap-3'
            } ${
              active
                ? 'bg-blue-600/20 text-blue-400 font-semibold shadow-inner'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            {/* Active indicator bar */}
            {active && (
              <span
                className={`absolute inset-y-1 w-1 bg-blue-500 rounded-full ${
                  position === 'right' ? 'right-0' : 'left-0'
                }`}
              />
            )}

            <Icon
              className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${
                active ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
              }`}
            />

            {!collapsed && (
              <span className="truncate text-sm font-medium">{item.label}</span>
            )}

            {/* Collapsed dot badge */}
            {collapsed && item.badge !== undefined && (
              <span
                className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${
                  item.badgeType === 'coming-soon' ? 'bg-amber-400' : 'bg-blue-500 animate-pulse'
                }`}
              />
            )}
          </a>

          {/* Flyout Tooltip for Collapsed Sidebar */}
          {collapsed && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${
                position === 'right' ? 'right-full mr-2' : 'left-full ml-2'
              } px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-200 text-xs font-medium rounded-lg shadow-xl invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 z-50 whitespace-nowrap pointer-events-none`}
            >
              {item.label}
            </div>
          )}
        </div>
      );
    });

  const renderNavContent = (isDrawer = false) => {
    const collapsed = isDrawer ? false : isCollapsed;

    return (
      <div className="flex flex-col h-full bg-slate-900 text-slate-100 select-none">
        {/* Brand Header */}
        <div
          className={`h-16 flex items-center border-b border-slate-800 bg-slate-950 px-4 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <a href="/" className="flex items-center gap-3 overflow-hidden group">
            <span className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-lg group-hover:scale-105 transition-transform flex-shrink-0">
              ⚖
            </span>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-wide text-white truncate">TJA BCS</span>
                <span className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-wider">
                  Gestión Judicial
                </span>
              </div>
            )}
          </a>

          {isDrawer && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation List Container */}
        <nav
          className={`flex-1 px-3 py-4 space-y-4 ${
            collapsed
              ? 'overflow-visible'
              : 'overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-800'
          }`}
        >
          {/* SECTION 1: TOP STANDALONE LINKS (Dashboard) */}
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Principal
              </p>
            )}

            {renderStandalone(topStandaloneItems, collapsed, isDrawer)}
          </div>

          {/* Section Divider */}
          <div className="h-px bg-slate-800/80 my-2 mx-2" />

          {/* SECTION 2: HIERARCHICAL ACCORDION GROUPS (Usuarios, Judicial / Procesal) */}
          <div className="space-y-2">
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Gestión
              </p>
            )}

            {accordionGroups.map((group) => {
              const visibleChildren = group.items.filter(isItemVisible);
              if (visibleChildren.length === 0) return null;

              const isExpanded = Boolean(expandedGroups[group.id]);
              const hasActiveChild = visibleChildren.some((child) => isLinkActive(child.href));
              const GroupIcon = group.icon;

              if (collapsed) {
                // Collapsed sidebar rendering (icon with flyout)
                return (
                  <div key={group.id} className="relative group my-1">
                    <button
                      type="button"
                      aria-label={group.title}
                      onClick={onToggleCollapse}
                      className={`relative flex items-center justify-center w-11 h-11 mx-auto rounded-xl transition-all duration-150 cursor-pointer ${
                        hasActiveChild
                          ? 'bg-blue-600/20 text-blue-400 font-semibold shadow-inner'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                      title={group.title}
                    >
                      {hasActiveChild && (
                        <span
                          className={`absolute inset-y-1 w-1 bg-blue-500 rounded-full ${
                            position === 'right' ? 'right-0' : 'left-0'
                          }`}
                        />
                      )}

                      <GroupIcon className="w-5 h-5 flex-shrink-0" />

                      {/* Active indicator dot badge on parent icon when collapsed */}
                      {hasActiveChild && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      )}
                    </button>

                    {/* Flyout Submenu for Collapsed Mode */}
                    <div
                      className={`absolute top-0 ${
                        position === 'right' ? 'right-full mr-2' : 'left-full ml-2'
                      } w-60 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 invisible opacity-0 -translate-x-1 group-hover:visible group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-x-0 transition-all duration-150 z-50 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto`}
                    >
                      <div className="px-3 py-1.5 border-b border-slate-800 mb-1 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          {group.title}
                        </span>
                        {hasActiveChild && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500/20 text-blue-400 rounded-full">
                            Activo
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {visibleChildren.map((child) => {
                          const isChildActive = isLinkActive(child.href);
                          const ChildIcon = child.icon;
                          return (
                            <a
                              key={child.id}
                              href={child.href}
                              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                isChildActive
                                  ? 'bg-blue-600/25 text-blue-300 font-semibold'
                                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              <ChildIcon className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate flex-1">{child.label}</span>
                              {child.badge && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {child.badge}
                                </span>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              // Full-width Expanded Sidebar rendering (Accordion)
              return (
                <div key={group.id} className="space-y-1">
                  {/* Accordion Group Header Trigger Button */}
                  <button
                    type="button"
                    id={`accordion-btn-${group.id}`}
                    aria-expanded={isExpanded}
                    aria-controls={`accordion-group-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
                    className={`group relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer ${
                      !isExpanded && hasActiveChild
                        ? 'bg-blue-950/40 text-blue-300 border border-blue-500/30 font-semibold'
                        : isExpanded
                        ? 'text-slate-200 hover:bg-slate-800/60'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    {/* Active indicator bar on parent when group is collapsed */}
                    {!isExpanded && hasActiveChild && (
                      <span
                        className={`absolute inset-y-1 w-1 bg-blue-500 rounded-full ${
                          position === 'right' ? 'right-0' : 'left-0'
                        }`}
                      />
                    )}

                    <div className="flex items-center gap-3 min-w-0">
                      <GroupIcon
                        className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${
                          hasActiveChild ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      <span className="truncate text-sm font-medium">{group.title}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Indicator badge on parent when group is collapsed */}
                      {!isExpanded && hasActiveChild && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          Activo
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                          isExpanded ? 'rotate-0' : '-rotate-90'
                        }`}
                      />
                    </div>
                  </button>

                  {/* Smooth CSS Grid Accordion Content Container */}
                  <div
                    id={`accordion-group-${group.id}`}
                    role="region"
                    aria-labelledby={`accordion-btn-${group.id}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                      isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden min-h-0">
                      <div className="pt-1 pb-1.5 pl-3 space-y-1 border-l border-slate-800/80 ml-5 my-1">
                        {visibleChildren.map((item) => {
                          const active = isLinkActive(item.href);
                          const ItemIcon = item.icon;

                          return (
                            <a
                              key={item.id}
                              href={item.href}
                              onClick={() => isDrawer && onCloseMobile()}
                              className={`group relative flex items-center rounded-lg px-2.5 py-2 gap-2.5 text-xs transition-all duration-150 ${
                                active
                                  ? 'bg-blue-600/20 text-blue-400 font-semibold shadow-inner'
                                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                              }`}
                            >
                              {active && (
                                <span
                                  className={`absolute inset-y-1 w-0.5 bg-blue-500 rounded-full ${
                                    position === 'right' ? 'right-0' : 'left-0'
                                  }`}
                                />
                              )}
                              <ItemIcon
                                className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105 ${
                                  active ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                                }`}
                              />
                              <span className="truncate flex-1">{item.label}</span>
                              {item.badge !== undefined && (
                                <span
                                  className={`ml-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider flex-shrink-0 ${
                                    item.badgeType === 'coming-soon'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-blue-600 text-white'
                                  }`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-px bg-slate-800/80 my-2 mx-2" />
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Sistema
              </p>
            )}
            {renderStandalone(systemStandaloneItems, collapsed, isDrawer)}
          </div>
        </nav>

        {/* Desktop Collapse Toggle Footer */}
        {!isDrawer && (
          <div className="p-2 border-t border-slate-800/80 bg-slate-950/70 hidden md:flex items-center justify-end">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={collapsed ? 'Expandir (Ctrl+B)' : 'Colapsar (Ctrl+B)'}
            >
              {collapsed ? (
                position === 'right' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  {position === 'right' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  <span>Colapsar barra lateral</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        className={`hidden md:flex flex-col transition-[width] duration-200 ease-in-out z-20 shadow-md ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${position === 'right' ? 'border-l border-slate-800' : 'border-r border-slate-800'}`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />
          {/* Drawer Container */}
          <div
            className={`fixed inset-y-0 w-72 max-w-xs bg-slate-900 shadow-2xl z-50 transition-transform animate-in duration-250 ${
              position === 'right' ? 'right-0 slide-in-from-right' : 'left-0 slide-in-from-left'
            }`}
          >
            {renderNavContent(true)}
          </div>
        </div>
      )}
    </>
  );
}
