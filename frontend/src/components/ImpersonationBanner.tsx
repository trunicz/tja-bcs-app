import React, { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getUser, isImpersonating, getOriginalAdmin, setSession, subscribeAuthChange, type User, type OriginalAdmin } from '../lib/auth';

/**
 * ImpersonationBanner
 * 
 * Persistent top banner across all pages.
 * Rendered when an active session is in impersonation mode (isImpersonated === true).
 * Displays who the operator is browsing as, who the original admin is,
 * and provides an active "Revertir Sesión" button that invokes POST /api/auth/revert
 * and restores the original administrator session.
 */
export default function ImpersonationBanner() {
  const [active, setActive] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [originalAdmin, setOriginalAdmin] = useState<OriginalAdmin | null>(null);
  const [isReverting, setIsReverting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const syncState = () => {
    try {
      const imp = isImpersonating();
      const user = getUser();
      const admin = getOriginalAdmin();

      setActive(Boolean(imp));
      setCurrentUser(user);
      setOriginalAdmin(admin);
    } catch (e) {
      console.error('Error synchronizing impersonation banner state:', e);
      setActive(false);
    }
  };

  useEffect(() => {
    syncState();
    const unsubscribe = subscribeAuthChange(() => {
      syncState();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRevert = async () => {
    try {
      setIsReverting(true);
      setErrorMsg(null);

      const response = await apiFetch('/api/auth/revert', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al revertir la sesión de suplantación');
      }

      const data = await response.json();

      // Restore original admin session
      setSession(data.token, data.usuario, null, false);

      // Full page reload/redirect to '/' restores SSR admin context
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error during revert impersonation:', err);
      setErrorMsg(err.message || 'No fue posible revertir la sesión.');
      setIsReverting(false);
    }
  };

  // If not in impersonation mode or missing target user context, do not render anything
  if (!active || !currentUser) {
    return null;
  }

  const originalAdminName = originalAdmin?.nombre || 'Administrador Global';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-amber-500 text-slate-950 px-4 py-2.5 sm:px-6 shadow-md border-b border-amber-600 transition-all z-50 sticky top-0"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 p-1.5 bg-amber-600/30 rounded-lg text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-950 animate-pulse" />
          </div>
          <div className="leading-snug">
            <span className="font-bold tracking-wide uppercase text-[11px] mr-2 px-2 py-0.5 bg-amber-600/40 rounded-full border border-amber-600/50">
              Modo Suplantación Activo
            </span>
            <span>
              Estás navegando como <strong className="font-bold underline decoration-amber-800/40">{currentUser.nombre}</strong> (
              <span className="font-semibold">{currentUser.rol}</span>
              ).
            </span>
            <span className="ml-2 text-amber-900 dark:text-amber-300 font-medium hidden md:inline">
              Sesión original: <strong className="font-bold">{originalAdminName}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {errorMsg && (
            <span className="text-xs text-red-900 dark:text-red-300 font-semibold bg-red-100/90 px-2.5 py-1 rounded border border-red-300 dark:border-red-800">
              {errorMsg}
            </span>
          )}
          <button
            onClick={handleRevert}
            disabled={isReverting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-slate-950 hover:bg-slate-900 active:bg-black text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReverting ? 'animate-spin' : ''}`} />
            {isReverting ? 'Revirtiendo...' : 'Revertir Sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
