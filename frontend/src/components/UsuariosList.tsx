import React, { useEffect, useState } from 'react';
import {
  User,
  Shield,
  Building,
  Eye,
  UserCheck,
  Edit2,
  UserX,
  Trash2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import toast from '../lib/toast';
import {
  getUser,
  isGlobalAdmin,
  isImpersonating,
  getOriginalAdmin,
  setSession,
  subscribeAuthChange,
  type User as AuthUser,
  type OriginalAdmin,
} from '../lib/auth';

interface UsuarioItem {
  id: number;
  nombre: string;
  correo: string;
  activo: boolean;
  rolId: number;
  salaId: number | null;
  colorEmpleado?: string;
  rol?: {
    id: number;
    nombre: string;
  };
  sala?: {
    id: number;
    nombre: string;
  };
}

export default function UsuariosList() {
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Reactive Session State (Deterministic SSR & Initial Client Hydration)
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [impersonationActive, setImpersonationActive] = useState<boolean>(false);
  const [originalAdmin, setOriginalAdmin] = useState<OriginalAdmin | null>(null);

  // Synchronize state across islands, tabs, and local storage changes post-mount
  useEffect(() => {
    setIsMounted(true);

    const syncAuthState = () => {
      setCurrentUser(getUser());
      setImpersonationActive(isImpersonating());
      setOriginalAdmin(getOriginalAdmin());
    };

    syncAuthState();
    const unsubscribe = subscribeAuthChange(() => {
      syncAuthState();
    });

    return () => unsubscribe();
  }, []);

  // Permission Queries (Guarded by isMounted to guarantee SSR & Client hydration parity)
  const isCurrentlyAdmin = isMounted && currentUser?.rol === 'Administrador';
  // Operator can start impersonation ONLY if they are an active Global Admin and NOT currently impersonating
  const canStartImpersonation = isMounted && isCurrentlyAdmin && !impersonationActive;
  const canEdit = isMounted && (isCurrentlyAdmin || Boolean(currentUser?.permisos?.includes('usuarios:edit')));
  const canDelete = isMounted && (isCurrentlyAdmin || Boolean(currentUser?.permisos?.includes('usuarios:delete')));

  const loadUsuarios = () => {
    setLoading(true);
    setAccessDenied(false);
    apiFetch('/api/usuarios')
      .then(async (res) => {
        if (res.status === 403) {
          setAccessDenied(true);
          return [];
        }
        if (!res.ok) throw new Error('Error al consultar usuarios');
        return res.json();
      })
      .then((data) => setUsuarios(data || []))
      .catch((err) => {
        console.error('Error al cargar usuarios:', err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsuarios();
  }, []);

  // Handle starting impersonation ("Ver como")
  const handleImpersonate = async (targetUser: UsuarioItem) => {
    if (!confirm(`¿Desea iniciar sesión como ${targetUser.nombre} (${targetUser.rol?.nombre || 'Usuario'})?\n\nSu contexto de navegación cambiará a las facultades de esta cuenta.`)) {
      return;
    }

    try {
      setImpersonatingId(targetUser.id);
      setFeedback(null);

      const res = await apiFetch('/api/auth/impersonate', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: targetUser.id }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || 'Error al iniciar suplantación de identidad';
        setFeedback({ type: 'error', message: errorMsg });
        setImpersonatingId(null);
        return;
      }

      const data = await res.json();
      // Persist the impersonated session context
      setSession(data.token, data.usuario, data.originalAdmin, true);

      // Trigger global toast if supported
      try {
        window.dispatchEvent(
          new CustomEvent('tja:toast', {
            detail: {
              type: 'warning',
              title: 'Modo Suplantación Iniciado',
              message: `Navegando como ${data.usuario?.nombre || targetUser.nombre}.`,
              duration: 4000,
            },
          })
        );
      } catch {
        // Ignore custom event error
      }

      // Redirect to home dashboard under target user scope
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error en suplantación:', err);
      setFeedback({ type: 'error', message: err.message || 'Error de conexión al intentar suplantar usuario' });
      setImpersonatingId(null);
    }
  };

  // Handle reverting impersonation (1-click revert)
  const handleRevert = async () => {
    try {
      setIsReverting(true);
      setFeedback(null);

      const res = await apiFetch('/api/auth/revert', {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al revertir la sesión de suplantación');
      }

      const data = await res.json();
      // Restore original admin session
      setSession(data.token, data.usuario, null, false);

      // Trigger global toast if supported
      try {
        window.dispatchEvent(
          new CustomEvent('tja:toast', {
            detail: {
              type: 'success',
              title: 'Sesión Restaurada',
              message: 'Se ha restablecido la sesión de Administrador Global con éxito.',
              duration: 3500,
            },
          })
        );
      } catch {
        // Ignore custom event error
      }

      // Refresh /usuarios to load full admin SSR context
      window.location.href = '/usuarios';
    } catch (err: any) {
      console.error('Error al revertir suplantación:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'No fue posible revertir la sesión de suplantación.',
      });
      setIsReverting(false);
    }
  };

  const handleToggleSuspender = async (targetUser: UsuarioItem) => {
    const action = targetUser.activo ? 'suspender' : 'activar';
    if (!confirm(`¿Desea ${action} a ${targetUser.nombre}?`)) return;

    try {
      const res = await apiFetch(`/api/usuarios/${targetUser.id}/suspender`, { method: 'PATCH' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || `Error al ${action} usuario`, 'Error Operativo');
        return;
      }
      toast.success(`Usuario ${targetUser.nombre} ${action === 'suspender' ? 'suspendido' : 'activado'} correctamente`, 'Estado de Usuario');
      loadUsuarios();
    } catch (err) {
      console.error(err);
      toast.error(`Error de conexión al ${action} usuario`, 'Fallo de Red');
    }
  };

  const handleDelete = async (targetUser: UsuarioItem) => {
    if (!confirm(`¿Desea eliminar PERMANENTEMENTE a ${targetUser.nombre}?`)) return;

    try {
      const res = await apiFetch(`/api/usuarios/${targetUser.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se puede eliminar porque tiene movimientos asociados.', 'Eliminación Denegada');
        return;
      }
      toast.success(`Usuario ${targetUser.nombre} eliminado del sistema`, 'Usuario Eliminado');
      loadUsuarios();
    } catch (err) {
      console.error(err);
      toast.error('Error al intentar eliminar el usuario', 'Fallo de Red');
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. CALLOUT BANNER FOR GLOBAL ADMINS (Explaining Impersonation Hub)         */}
      {/* Visible strictly when user is Global Admin and NOT currently impersonating */}
      {/* ========================================================================= */}
      {canStartImpersonation && (
        <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-blue-50/90 dark:from-slate-900/90 dark:via-blue-950/20 dark:to-slate-900/90 border border-blue-200 dark:border-blue-900/60 rounded-xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs flex-shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Centro de Suplantación de Identidad (Modo "Ver Como")
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Exclusivo Administrador Global
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Como Administrador Global, puede ingresar temporalmente a la plataforma adoptando el contexto, rol y facultades de cualquier operador activo. Esta herramienta permite verificar la visibilidad de expedientes, comprobar asignaciones por sala y auditar flujos procesales.
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <strong>Auditoría integral:</strong> Trazabilidad en movimientos
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <strong>Solo cuentas activas:</strong> No admite auto-suplantación
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <strong>Reversión en 1 clic:</strong> Restablece su sesión al instante
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. INLINE CONTEXTUAL ALERT BANNER (When Impersonation is Active)           */}
      {/* Displays active persona + original admin + 1-click Revert button          */}
      {/* ========================================================================= */}
      {isMounted && impersonationActive && currentUser && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600/80 rounded-xl p-5 shadow-sm"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="p-2 bg-amber-500/20 dark:bg-amber-800/40 text-amber-900 dark:text-amber-200 rounded-lg flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6 animate-pulse text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-bold tracking-wide uppercase text-[11px] px-2.5 py-0.5 bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100 rounded-full border border-amber-300 dark:border-amber-700">
                    Modo Suplantación Activo
                  </span>
                  <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                    Sesión original: <strong>{originalAdmin?.nombre || 'Administrador Global'}</strong>
                  </span>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-100 leading-snug">
                  Estás navegando en el sistema como{' '}
                  <strong className="font-bold underline decoration-amber-500 decoration-2">
                    {currentUser.nombre}
                  </strong>{' '}
                  (<span className="font-semibold text-amber-900 dark:text-amber-300">{currentUser.rol}</span>
                  {currentUser.salaId ? ` - Sala ${currentUser.salaId}` : ''}).
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Las acciones y consultas están acotadas a las facultades específicas de este usuario.
                </p>
              </div>
            </div>

            <div className="flex-shrink-0 w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                onClick={handleRevert}
                disabled={isReverting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:active:bg-amber-600 dark:text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm hover:shadow transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Restaurar de inmediato su sesión original de Administrador Global"
              >
                <RotateCcw className={`w-4 h-4 ${isReverting ? 'animate-spin' : ''}`} />
                <span>{isReverting ? 'Restableciendo Sesión...' : 'Revertir Sesión (1 Clic)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action feedback / error notification */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm font-medium border flex items-center justify-between gap-3 ${
            feedback.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
              : feedback.type === 'success'
              ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800'
              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold uppercase tracking-wider hover:underline cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ACCESS RESTRICTED IN IMPERSONATION MODE (Target user lacks permission)  */}
      {/* ========================================================================= */}
      {isMounted && accessDenied && impersonationActive && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 p-8 text-center max-w-xl mx-auto">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
            Directorio Restringido para este Rol
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
            El usuario suplantado actual (<strong>{currentUser?.nombre}</strong> - {currentUser?.rol}) no dispone del permiso <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">usuarios:view</code> para consultar el directorio.
          </p>
          <button
            onClick={handleRevert}
            disabled={isReverting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReverting ? 'animate-spin' : ''}`} />
            <span>Restablecer Sesión de Administrador</span>
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-900/60 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-4"></div>
          Cargando directorio de usuarios...
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. USER DIRECTORY TABLE (Full Dark Mode Parity & Impersonation Hub Rows)  */}
      {/* ========================================================================= */}
      {!loading && !accessDenied && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700/80 text-xs tracking-wider text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  <th className="p-4">Usuario</th>
                  <th className="p-4">Rol / Permisos</th>
                  <th className="p-4">Sala / Adscripción</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No se encontraron usuarios registrados en el sistema.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((user) => {
                    const isSelf = currentUser?.id === user.id;
                    const isActivelyImpersonated = impersonationActive && currentUser?.id === user.id;
                    const isImpersonatingThis = impersonatingId === user.id;

                    return (
                      <tr
                        key={user.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          isActivelyImpersonated ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''
                        }`}
                      >
                        {/* Usuario (Avatar, Nombre, Email, Badges) */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0"
                              style={{ backgroundColor: user.colorEmpleado || '#2563eb' }}
                            >
                              {user.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1.5 text-sm">
                                <span>{user.nombre}</span>

                                {/* Distinct "Suplantación Activa" Badge */}
                                {isActivelyImpersonated && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700 shadow-xs animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    Suplantación Activa
                                  </span>
                                )}

                                {/* Self indicator */}
                                {isSelf && !impersonationActive && (
                                  <span className="text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                                {user.correo}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Rol */}
                        <td className="p-4 space-y-1">
                          <div>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60">
                              <Shield className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400" />
                              {user.rol?.nombre}
                            </span>
                          </div>
                          {!user.activo && (
                            <div>
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60">
                                Suspendido
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Sala / Adscripción */}
                        <td className="p-4">
                          <span className="inline-flex items-center text-sm text-slate-600 dark:text-slate-300">
                            <Building className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500" />
                            {user.sala?.nombre || 'General / Pleno'}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* =================================================================== */}
                            {/* CASE A: Active user is Global Admin, not currently impersonating    */}
                            {/* Enabled "Ver como" for all active other users                       */}
                            {/* =================================================================== */}
                            {canStartImpersonation && !isSelf && user.activo && (
                              <button
                                onClick={() => handleImpersonate(user)}
                                disabled={isImpersonatingThis}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                                title={`Navegar como ${user.nombre}`}
                              >
                                {isImpersonatingThis ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                                <span>Ver como</span>
                              </button>
                            )}

                            {/* =================================================================== */}
                            {/* CASE B: Active impersonation session                                */}
                            {/* 1. On actively impersonated user: disabled button with tooltip     */}
                            {/* 2. On other users: disabled button explaining revert requirement   */}
                            {/* =================================================================== */}
                            {impersonationActive && isActivelyImpersonated && (
                              <button
                                disabled
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700/60 dark:text-purple-300/50 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-800/40 rounded-lg cursor-not-allowed opacity-60"
                                title="Esta cuenta se encuentra actualmente en sesión activa de suplantación"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Ver como</span>
                              </button>
                            )}

                            {impersonationActive && !isActivelyImpersonated && user.activo && (
                              <button
                                disabled
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg cursor-not-allowed opacity-50"
                                title="Debe revertir la sesión de suplantación actual antes de cambiar a otro usuario"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Ver como</span>
                              </button>
                            )}

                            {/* Ver Actividad */}
                            <a
                              href={`/usuarios/${user.id}`}
                              className="inline-flex items-center p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Ver Actividad"
                            >
                              <Eye className="w-4 h-4" />
                            </a>

                            {/* Editar Usuario */}
                            {canEdit && (
                              <a
                                href={`/usuarios/editar/${user.id}`}
                                className="inline-flex items-center p-2 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                title="Editar Usuario"
                              >
                                <Edit2 className="w-4 h-4" />
                              </a>
                            )}

                            {/* Suspender / Activar */}
                            {canEdit && !isSelf && (
                              <button
                                onClick={() => handleToggleSuspender(user)}
                                className={`inline-flex items-center p-2 rounded-lg transition-colors cursor-pointer ${
                                  user.activo
                                    ? 'text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-800'
                                    : 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/60'
                                }`}
                                title={user.activo ? 'Suspender Usuario' : 'Activar Usuario'}
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            )}

                            {/* Eliminar Usuario */}
                            {canDelete && !isSelf && (
                              <button
                                onClick={() => handleDelete(user)}
                                className="inline-flex items-center p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar Usuario"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

