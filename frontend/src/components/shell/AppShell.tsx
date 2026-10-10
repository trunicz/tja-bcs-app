import React, { useState, useEffect, createContext, useContext } from 'react';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import CommandPalette from './CommandPalette';
import AppearanceDrawer from './AppearanceDrawer';
import ToastContainer from '../common/ToastContainer';
import NotificationDrawer from '../notifications/NotificationDrawer';
import ImpersonationBanner from '../ImpersonationBanner';
import { subscribeAuthChange, getUser, type User } from '../../lib/auth';

export interface ShellContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  sidebarPosition: 'left' | 'right';
  setSidebarPosition: (pos: 'left' | 'right') => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  isAppearanceDrawerOpen: boolean;
  setIsAppearanceDrawerOpen: (open: boolean) => void;
  isNotificationDrawerOpen: boolean;
  setIsNotificationDrawerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  currentPath: string;
}

export const AppShellContext = createContext<ShellContextType | null>(null);

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used within an AppShellProvider');
  }
  return context;
}

export interface AppShellProps {
  currentPath?: string;
  initialUser?: User | null;
  canManageRoles?: boolean;
}

/**
 * AppShell
 *
 * Master layout coordinator island for TJA BCS application.
 * Manages responsive layout, sidebar collapse, right/left docking,
 * modal command palette (Ctrl+K), notifications sync, and appearance drawer slot.
 */
export default function AppShell({
  currentPath: initialPath = '/',
  initialUser = null,
  canManageRoles = false,
}: AppShellProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [user, setUser] = useState<User | null>(initialUser);
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(false);
  const [sidebarPosition, setSidebarPositionState] = useState<'left' | 'right'>('left');
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isAppearanceDrawerOpen, setIsAppearanceDrawerOpen] = useState<boolean>(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Persisted island: props are not refreshed on navigation, so track the route ourselves.
  useEffect(() => {
    const sync = () => {
      setCurrentPath(window.location.pathname);
      setIsMobileOpen(false);
    };
    sync();
    document.addEventListener('astro:page-load', sync);
    document.addEventListener('astro:after-swap', sync);
    return () => {
      document.removeEventListener('astro:page-load', sync);
      document.removeEventListener('astro:after-swap', sync);
    };
  }, []);

  // Sync collapsed state with localStorage and HTML attribute
  const setIsCollapsed = (action: boolean | ((prev: boolean) => boolean)) => {
    setIsCollapsedState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem('tja_sidebar_collapsed', String(next));
        document.documentElement.setAttribute('data-sidebar', next ? 'collapsed' : 'expanded');
      } catch (e) {
        // Ignore storage exceptions
      }
      return next;
    });
  };

  // Sync sidebar position with localStorage and HTML attribute
  const setSidebarPosition = (pos: 'left' | 'right') => {
    setSidebarPositionState(pos);
    try {
      localStorage.setItem('tja_sidebar_position', pos);
      document.documentElement.setAttribute('data-sidebar-pos', pos);
    } catch (e) {
      // Ignore storage exceptions
    }
  };

  // Initial client hydration & preference restore
  useEffect(() => {
    setIsMounted(true);

    // Read stored user
    const activeUser = getUser();
    if (activeUser) setUser(activeUser);

    // Subscribe to auth changes
    const unsubAuth = subscribeAuthChange((session) => {
      setUser(session.user);
    });

    // Read stored preferences
    try {
      const storedCollapsed = localStorage.getItem('tja_sidebar_collapsed');
      if (storedCollapsed !== null) {
        const val = storedCollapsed === 'true';
        setIsCollapsedState(val);
        document.documentElement.setAttribute('data-sidebar', val ? 'collapsed' : 'expanded');
      }

      const storedPos = localStorage.getItem('tja_sidebar_position') as 'left' | 'right' | null;
      if (storedPos === 'left' || storedPos === 'right') {
        setSidebarPositionState(storedPos);
        document.documentElement.setAttribute('data-sidebar-pos', storedPos);
      }
    } catch (e) {
      // Ignore storage read error
    }

    // Keyboard shortcuts (Ctrl+K, Cmd+K, Ctrl+B, Esc)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K: Command Palette (supports lowercase, uppercase, and KeyK code)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      // Ctrl+B or Cmd+B: Sidebar Collapse Toggle
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
        e.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
      // Escape: Close all modals/drawers
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsAppearanceDrawerOpen(false);
        setIsMobileOpen(false);
      }
    };

    // Custom window events
    const handleOpenCmd = () => setIsCommandPaletteOpen(true);
    const handleToggleSidebar = () => setIsCollapsed((prev) => !prev);
    const handleOpenAppearance = () => setIsAppearanceDrawerOpen(true);
    const handleOpenNotifications = () => setIsNotificationDrawerOpen(true);
    const handleUnreadUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ count: number }>;
      if (typeof custom.detail?.count === 'number') {
        setUnreadCount(custom.detail.count);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tja:open-command-palette', handleOpenCmd);
    window.addEventListener('tja:toggle-sidebar', handleToggleSidebar);
    window.addEventListener('tja:open-appearance-drawer', handleOpenAppearance);
    window.addEventListener('tja:open-notifications', handleOpenNotifications);
    window.addEventListener('tja:unread-notifications-updated', handleUnreadUpdate);

    return () => {
      unsubAuth();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tja:open-command-palette', handleOpenCmd);
      window.removeEventListener('tja:toggle-sidebar', handleToggleSidebar);
      window.removeEventListener('tja:open-appearance-drawer', handleOpenAppearance);
      window.removeEventListener('tja:open-notifications', handleOpenNotifications);
      window.removeEventListener('tja:unread-notifications-updated', handleUnreadUpdate);
    };
  }, []);

  // Fetch unread notifications count
  useEffect(() => {
    let isCancelled = false;
    const fetchUnread = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const res = await fetch('/api/notificaciones/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && typeof data.count === 'number') {
            setUnreadCount(data.count);
          }
        }
      } catch (err) {
        // Silently catch network errors during offline dev
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 60000); // Poll every 60s
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  const shellContextValue: ShellContextType = {
    isCollapsed,
    setIsCollapsed,
    sidebarPosition,
    setSidebarPosition,
    isMobileOpen,
    setIsMobileOpen,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    isAppearanceDrawerOpen,
    setIsAppearanceDrawerOpen,
    isNotificationDrawerOpen,
    setIsNotificationDrawerOpen,
    unreadCount,
    setUnreadCount,
    currentPath,
  };

  return (
    <AppShellContext.Provider value={shellContextValue}>
      {/* display: contents -> children participate directly in the .app-grid defined in Layout.astro.
          <main> is rendered by Astro (outside this persisted island) so only it swaps on navigation. */}
      <div className="contents">
        <div className="[grid-area:banner] min-w-0">
          <ImpersonationBanner />
        </div>

        <div className="[grid-area:side] min-h-0 flex">
          <AppSidebar
            currentPath={currentPath}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
            isMobileOpen={isMobileOpen}
            onCloseMobile={() => setIsMobileOpen(false)}
            unreadCount={unreadCount}
            user={user}
            canManageRoles={canManageRoles}
            position={sidebarPosition}
          />
        </div>

        <div className="[grid-area:header] min-w-0 relative z-30">
          <AppHeader
            currentPath={currentPath}
            unreadCount={unreadCount}
            onOpenMobileMenu={() => setIsMobileOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenAppearance={() => setIsAppearanceDrawerOpen(true)}
            onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
            user={user}
          />
        </div>

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          currentPath={currentPath}
          onOpenAppearance={() => {
            setIsCommandPaletteOpen(false);
            setIsAppearanceDrawerOpen(true);
          }}
          canManageRoles={canManageRoles}
          user={user}
        />

        <AppearanceDrawer
          isOpen={isAppearanceDrawerOpen}
          onClose={() => setIsAppearanceDrawerOpen(false)}
        />

        <ToastContainer />

        <NotificationDrawer
          isOpen={isNotificationDrawerOpen}
          onClose={() => setIsNotificationDrawerOpen(false)}
          onUnreadCountChange={setUnreadCount}
        />
      </div>
    </AppShellContext.Provider>
  );
}