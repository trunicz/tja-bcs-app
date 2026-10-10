import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Search,
  Bell,
  Palette,
  Sun,
  Moon,
  LogOut,
  Settings,
  ChevronDown,
  Shield,
  Loader2,
} from 'lucide-react';
import { type User, getUser, clearSession } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { usePreferences, resolveEffectiveTheme } from '../../lib/preferences';
import {
  getAvatarStyle,
  getEmployeeColor,
  getEmployeeInitials,
  TRIBUNAL_EMPLOYEE_PALETTES,
} from '../../lib/employeeColor';

export interface AppHeaderProps {
  currentPath: string;
  unreadCount?: number;
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  onOpenAppearance: () => void;
  onOpenNotifications?: () => void;
  user?: User | null;
}

/**
 * AppHeader
 *
 * Universal top masthead component for TJA BCS.
 * Provides mobile menu toggle, omnibar search trigger (Ctrl+K),
 * live notification bell badge, appearance drawer trigger,
 * and an interactive personal user profile menu island.
 *
 * NOTE: Administrative impersonation ("Ver como") is strictly reserved
 * for the Users Directory (/usuarios) and is not rendered here.
 */
export default function AppHeader({
  currentPath,
  unreadCount = 0,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onOpenAppearance,
  onOpenNotifications,
  user,
}: AppHeaderProps) {
  // Breadcrumb / title resolution
  const getPageTitle = (path: string) => {
    if (path === '/') return 'Panel de Control';
    if (path.startsWith('/expedientes')) return 'Control de Expedientes';
    if (path.startsWith('/notificaciones')) return 'Centro de Notificaciones';
    if (path.startsWith('/agenda')) return 'Agenda Judicial';
    if (path.startsWith('/reportes')) return 'Reportes y Estadísticas';
    if (path.startsWith('/busqueda')) return 'Búsqueda Global';
    if (path.startsWith('/ayuda')) return 'Centro de Ayuda';
    if (path.startsWith('/documentos')) return 'Archivo Digital';
    if (path.startsWith('/mensajeria')) return 'Mensajería Interna';
    if (path.startsWith('/configuracion/roles')) return 'Roles y Permisos';
    if (path.startsWith('/configuracion')) return 'Configuración del Sistema';
    if (path.startsWith('/usuarios')) return 'Directorio de Usuarios';
    return 'Tribunal de Justicia Administrativa';
  };

  // State management for user profile dropdown
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // User preferences hook for theme toggling
  const [prefs, setPreferences] = usePreferences();
  const effectiveTheme = resolveEffectiveTheme(prefs.tema);
  const isDarkMode = effectiveTheme === 'dark';

  // Active user resolution
  const activeUser = user || (typeof window !== 'undefined' ? getUser() : null);

  // Employee identifying color resolution
  const [colorOverride, setColorOverride] = useState<string | null>(null);

  useEffect(() => {
    const handleColorChange = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (typeof custom.detail === 'string') {
        setColorOverride(custom.detail);
      }
    };
    window.addEventListener('tja:employee-color-changed', handleColorChange);
    return () => window.removeEventListener('tja:employee-color-changed', handleColorChange);
  }, []);

  const effectiveEmployeeColor = colorOverride || getEmployeeColor(activeUser);
  const initials = getEmployeeInitials(activeUser?.nombre || activeUser?.correo);
  const avatarStyle = getAvatarStyle(effectiveEmployeeColor);

  // Match institutional role palette description
  const matchingPalette = TRIBUNAL_EMPLOYEE_PALETTES.find(
    (p) => p.hex.toLowerCase() === effectiveEmployeeColor.toLowerCase()
  );
  const colorLabel = matchingPalette ? matchingPalette.nombre : 'Color asignado';

  // Dropdown dismissal on outside click and Escape key
  useEffect(() => {
    if (!isProfileOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen]);

  // Handler: Quick Theme Toggle
  const handleToggleTheme = () => {
    const nextTheme = isDarkMode ? 'light' : 'dark';
    setPreferences({ tema: nextTheme });
  };

  // Handler: Open Appearance Drawer
  const handleOpenAppearanceDrawer = () => {
    setIsProfileOpen(false);
    onOpenAppearance();
  };

  // Handler: Operational Logout
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await apiFetch('/api/auth/logout', {
        method: 'POST',
      }).catch((err) => {
        console.warn('Backend logout non-critical error:', err);
      });
      clearSession();
      window.location.href = '/login';
    } catch (err) {
      console.error('Error during logout:', err);
      clearSession();
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
      setIsProfileOpen(false);
    }
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 shadow-xs z-10 transition-colors">
      {/* Left: Mobile Menu Toggle & Page Heading */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
            {getPageTitle(currentPath)}
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden lg:block truncate">
            Tribunal de Justicia Administrativa de Baja California Sur
          </p>
        </div>
      </div>

      {/* Center: Search Trigger (Ctrl+K) */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs border border-slate-200/80 dark:border-slate-700/60 shadow-xs transition-all cursor-pointer group"
          title="Abrir paleta de comandos (Ctrl+K)"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            <span className="truncate">Buscar expedientes, acuerdos, personas...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-300 shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right: Actions Cluster */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Mobile Search Button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          title="Buscar (Ctrl+K)"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Live Notification Bell with Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenNotifications || (() => { window.location.href = '/notificaciones'; })}
          className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer"
          title={unreadCount > 0 ? `${unreadCount} notificaciones no leídas` : 'Notificaciones'}
          aria-label={`Notificaciones (${unreadCount} no leídas)`}
          aria-haspopup="dialog"
        >
          <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white font-bold text-[10px] rounded-full flex items-center justify-center shadow-xs animate-in zoom-in-75 duration-150">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Appearance Customization Trigger */}
        <button
          type="button"
          onClick={onOpenAppearance}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer group"
          title="Personalizar apariencia (Tema, Acento, Densidad)"
          aria-label="Personalizar apariencia"
        >
          <Palette className="w-5 h-5 group-hover:rotate-12 transition-transform text-slate-600 dark:text-slate-300" />
        </button>

        {/* User Profile Interactive Dropdown Island */}
        <div className="relative pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800" ref={profileDropdownRef}>
          {/* Interactive Trigger Button */}
          <button
            type="button"
            onClick={() => setIsProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 sm:p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer text-left group"
            aria-expanded={isProfileOpen}
            aria-haspopup="true"
            aria-label="Menú de perfil de usuario"
            id="user-profile-menu-button"
          >
            {/* User Avatar with Employee Identifying Color */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs transition-transform group-hover:scale-105 flex-shrink-0"
              style={avatarStyle}
              title={activeUser ? `${activeUser.nombre} (${activeUser.rol})` : 'Usuario'}
            >
              {initials}
            </div>

            {/* User Name & Role labels (desktop) */}
            <div className="hidden xl:block text-left leading-tight">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                {activeUser?.nombre || 'Usuario'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]">
                {activeUser?.rol || 'Personal'}
              </p>
            </div>

            {/* Subtle Chevron Indicator */}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 hidden sm:block ${
                isProfileOpen ? 'rotate-180 text-blue-500' : 'group-hover:text-slate-600 dark:group-hover:text-slate-300'
              }`}
            />
          </button>

          {/* Dedicated User Profile Dropdown Menu */}
          {isProfileOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100 dark:divide-slate-800"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="user-profile-menu-button"
            >
              {/* 1. Header Section: Identity, Role, Employee Color */}
              <div className="p-4 bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0 ring-2 ring-white dark:ring-slate-800"
                    style={avatarStyle}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activeUser?.nombre || 'Usuario del Tribunal'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeUser?.correo || 'usuario@tjabcs.gob.mx'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {/* Role Badge */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80">
                        <Shield className="w-2.5 h-2.5" />
                        {activeUser?.rol || 'Personal Judicial'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Assigned Employee Identifying Color Swatch */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20 shadow-2xs flex-shrink-0"
                      style={{ backgroundColor: effectiveEmployeeColor }}
                      aria-hidden="true"
                    />
                    <span className="truncate max-w-[150px]" title={colorLabel}>
                      {colorLabel}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                    {effectiveEmployeeColor}
                  </span>
                </div>
              </div>

              {/* 2. Quick Actions: Preferences & Navigation */}
              <div className="p-2 space-y-1">
                {/* Quick Theme Toggle */}
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                  role="menuitem"
                >
                  <div className="flex items-center gap-2.5">
                    {isDarkMode ? (
                      <Sun className="w-4 h-4 text-amber-500 group-hover:rotate-45 transition-transform" />
                    ) : (
                      <Moon className="w-4 h-4 text-indigo-500 group-hover:-rotate-12 transition-transform" />
                    )}
                    <span>Modo {isDarkMode ? 'Oscuro' : 'Claro'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                    Cambiar a {isDarkMode ? 'Claro' : 'Oscuro'}
                  </span>
                </button>

                {/* Appearance Preferences Drawer Link */}
                <button
                  type="button"
                  onClick={handleOpenAppearanceDrawer}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                  role="menuitem"
                >
                  <Palette className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span>Personalizar Apariencia</span>
                </button>

                {/* System Configuration Link */}
                <a
                  href="/configuracion"
                  onClick={() => setIsProfileOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                  role="menuitem"
                >
                  <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span>Configuración del Sistema</span>
                </a>
              </div>

              {/* 3. Operational Logout Action */}
              <div className="p-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
                  role="menuitem"
                >
                  {isLoggingOut ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                  ) : (
                    <LogOut className="w-4 h-4 text-red-500 group-hover:translate-x-0.5 transition-transform" />
                  )}
                  <span>{isLoggingOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
