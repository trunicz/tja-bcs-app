import React, { useEffect, useState, useRef } from 'react';
import { Eye, Search, X, Shield, AlertCircle, Loader2, UserCheck, ChevronDown } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getUser, isImpersonating, isGlobalAdmin, setSession, subscribeAuthChange, type User } from '../lib/auth';

interface UsuarioItem {
  id: number;
  nombre: string;
  correo: string;
  activo: boolean;
  rolId?: number;
  salaId?: number | null;
  rol?: {
    id: number;
    nombre: string;
  };
  sala?: {
    id: number;
    nombre: string;
  };
}

/**
 * ImpersonationSelector
 * 
 * Top navigation bar dropdown exclusively rendered for Global Administrators
 * (rol === 'Administrador' && !isImpersonating).
 * Allows the administrator to browse and search active system users and initiate
 * impersonation via POST /api/auth/impersonate.
 */
export default function ImpersonationSelector() {
  const [canView, setCanView] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSelectingId, setIsSelectingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const syncVisibility = () => {
    try {
      const user = getUser();
      const impersonating = isImpersonating();
      const isAdm = isGlobalAdmin();

      setCurrentUser(user);
      setCanView(Boolean(isAdm && !impersonating));
    } catch (e) {
      console.error('Error synchronizing impersonation selector visibility:', e);
      setCanView(false);
    }
  };

  useEffect(() => {
    syncVisibility();
    const unsubscribe = subscribeAuthChange(() => {
      syncVisibility();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Load user list when opened for the first time
  useEffect(() => {
    if (isOpen && usuarios.length === 0 && !isLoadingUsers) {
      loadUsuarios();
    }
  }, [isOpen]);

  const loadUsuarios = async () => {
    try {
      setIsLoadingUsers(true);
      setErrorMsg(null);

      const response = await apiFetch('/api/usuarios');
      if (!response.ok) {
        throw new Error('Error al cargar la lista de usuarios');
      }

      const data = await response.json();
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching users for impersonation:', err);
      setErrorMsg('No se pudo cargar la lista de usuarios.');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleImpersonate = async (targetUserId: number) => {
    try {
      setIsSelectingId(targetUserId);
      setErrorMsg(null);

      const response = await apiFetch('/api/auth/impersonate', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al iniciar suplantación de identidad');
      }

      const data = await response.json();

      // Update session with impersonated context
      setSession(data.token, data.usuario, data.originalAdmin, true);

      setIsOpen(false);
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error initiating impersonation:', err);
      setErrorMsg(err.message || 'Error al suplantar usuario');
      setIsSelectingId(null);
    }
  };

  // Only visible to Global Admin who is not currently impersonating
  if (!canView) {
    return null;
  }

  // Filter users: exclude the current admin themselves and filter by search term
  const filteredUsers = usuarios.filter((u) => {
    if (currentUser && u.id === currentUser.id) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nombre = (u.nombre || '').toLowerCase();
    const correo = (u.correo || '').toLowerCase();
    const rol = (u.rol?.nombre || '').toLowerCase();
    return nombre.includes(term) || correo.includes(term) || rol.includes(term);
  });

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button in Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:bg-blue-200 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer"
        title="Suplantar usuario (Ver como...)"
      >
        <Eye className="w-4 h-4 text-blue-600 dark:text-blue-300" />
        <span className="font-semibold">Ver como...</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Panel Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Suplantar Identidad</h3>
                <p className="text-xs text-slate-400">Ver sistema con permisos de otro usuario</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nombre, correo o rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                autoFocus
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border-b border-red-100 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* User List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {isLoadingUsers ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-300" />
                Cargando usuarios del sistema...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {searchTerm ? 'No se encontraron usuarios coincidentes' : 'No hay usuarios disponibles'}
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = isSelectingId === user.id;
                const isDisabled = !user.activo || isSelectingId !== null;

                return (
                  <div
                    key={user.id}
                    className={`p-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                      !user.activo ? 'opacity-60 bg-slate-50/50 dark:bg-slate-800/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {user.nombre?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{user.nombre}</p>
                        <p className="text-[11px] text-slate-400 truncate">{user.correo}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            <Shield className="w-2.5 h-2.5 mr-1 text-slate-500 dark:text-slate-400" />
                            {user.rol?.nombre || 'Sin Rol'}
                          </span>
                          {!user.activo && (
                            <span className="text-[10px] font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-1 rounded">
                              Inactivo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleImpersonate(user.id)}
                      disabled={isDisabled}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0 cursor-pointer"
                      title={!user.activo ? 'Usuario inactivo' : `Suplantar a ${user.nombre}`}
                    >
                      {isSelected ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Cambiando...</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3" />
                          <span>Ver como</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Panel Footer */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400">
            <span>Solo disponible para la cuenta de Administrador</span>
          </div>
        </div>
      )}
    </div>
  );
}
