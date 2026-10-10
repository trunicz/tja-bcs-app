import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getUser, isImpersonating, clearSession, subscribeAuthChange, type User } from '../lib/auth';
import { getAvatarStyle, getEmployeeColor } from '../lib/employeeColor';

/**
 * UserNav
 * 
 * Dynamic client island mounted at the bottom of the sidebar in Layout.astro.
 * Replaces the static hardcoded "Administrador" badge.
 * Displays the current user's initial, name, email, role badge,
 * an indicator tag when impersonation is active,
 * and an interactive "Cerrar Sesión" (Logout) button that calls POST /api/auth/logout,
 * clears the session, and redirects to /login.
 */
export default function UserNav() {
  const [user, setUser] = useState<User | null>(null);
  const [impersonated, setImpersonated] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const syncUser = () => {
    try {
      const u = getUser();
      const imp = isImpersonating();

      setUser(u);
      setImpersonated(Boolean(imp));
    } catch (e) {
      console.error('Error synchronizing user nav:', e);
      setUser(null);
      setImpersonated(false);
    }
  };

  useEffect(() => {
    syncUser();
    setMounted(true);

    const unsubscribe = subscribeAuthChange(() => {
      syncUser();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      // Call backend logout endpoint
      await apiFetch('/api/auth/logout', {
        method: 'POST',
      }).catch((e) => {
        console.warn('Backend logout non-critical error:', e);
      });

      // Clear client session tokens & data
      clearSession();

      // Redirect to login
      window.location.href = '/login';
    } catch (err) {
      console.error('Error during logout:', err);
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
    }
  };

  // SSR skeleton placeholder matching dimensions
  if (!mounted) {
    return (
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-slate-700" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 bg-slate-700 rounded w-24" />
            <div className="h-2 bg-slate-800 rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  const initial = user?.nombre ? user.nombre.charAt(0).toUpperCase() : 'U';
  const displayName = user?.nombre || 'Usuario';
  const displayEmail = user?.correo || 'usuario@tjabcs.gob.mx';
  const displayRole = user?.rol || 'Personal';

  return (
    <div className="p-4 border-t border-slate-800 flex flex-col gap-3">
      {/* User Information */}
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors flex-shrink-0 ${
            impersonated
              ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/50'
              : ''
          }`}
          style={!impersonated ? getAvatarStyle(getEmployeeColor(user)) : undefined}
          title={displayName}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate" title={displayName}>
            {displayName}
          </p>
          <p className="text-xs text-slate-400 truncate" title={displayEmail}>
            {displayEmail}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className={`inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                impersonated
                  ? 'bg-amber-950/70 text-amber-300 border-amber-700/60'
                  : 'bg-slate-800 text-blue-400 border-slate-700'
              }`}
            >
              {displayRole}
            </span>
            {impersonated && (
              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                Suplantado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Logout Action */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-800/80 active:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="Cerrar sesión actual"
      >
        <LogOut className={`w-3.5 h-3.5 ${isLoggingOut ? 'animate-spin' : ''}`} />
        <span>{isLoggingOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}</span>
      </button>
    </div>
  );
}
