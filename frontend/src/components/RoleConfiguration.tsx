import React, { useEffect, useState, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  Lock,
  FileText,
  Users,
  Sliders,
  Key,
  Save,
  RotateCcw,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  CheckSquare,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getUser, hasPermission, setSession, getToken, subscribeAuthChange, type User } from '../lib/auth';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PermisoItem {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  modulo: string;
}

export interface RoleItem {
  id: number;
  nombre: string;
  usuariosCount: number;
  permisos: PermisoItem[];
}

interface ModuleMeta {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODULE_METADATA: Record<string, ModuleMeta> = {
  expedientes: {
    label: 'Expedientes Judiciales',
    description: 'Gestión procesal, registro de demandas, bitácora y cambios de estatus',
    icon: FileText,
  },
  usuarios: {
    label: 'Usuarios y Operadores',
    description: 'Directorio de personal, creación, edición y suspensión de cuentas',
    icon: Users,
  },
  roles: {
    label: 'Roles y Autorizaciones',
    description: 'Consulta y asignación de permisos en la matriz de seguridad',
    icon: Shield,
  },
  catalogos: {
    label: 'Catálogos del Tribunal',
    description: 'Salas jurisdiccionales, tipos de asunto y leyes aplicables',
    icon: Sliders,
  },
  seguridad: {
    label: 'Seguridad y Suplantación',
    description: 'Facultades críticas del sistema, auditoría y cambio de identidad',
    icon: Key,
  },
};

// Permissions that must NEVER be removed from 'Administrador' (T2-ROLE-04)
const LOCKED_ADMIN_CODES = ['roles:manage', 'impersonate:use'];

// ============================================================================
// Main Component: RoleConfiguration
// ============================================================================

export default function RoleConfiguration() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [allPermisos, setAllPermisos] = useState<PermisoItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  // In-memory working copies of permission IDs per role
  const [workingPermisos, setWorkingPermisos] = useState<Record<number, Set<number>>>({});
  // Baseline snapshot for computing dirty state
  const [originalPermisos, setOriginalPermisos] = useState<Record<number, Set<number>>>({});

  // Loading & async states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User permission level with reactive listener (Deterministic SSR & Initial Client Hydration)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [canManage, setCanManage] = useState<boolean>(false);
  const [canView, setCanView] = useState<boolean>(false);

  useEffect(() => {
    setCurrentUser(getUser());
    setCanManage(hasPermission('roles:manage'));
    setCanView(hasPermission('roles:view') || hasPermission('roles:manage'));

    const unsubscribe = subscribeAuthChange((state) => {
      setCurrentUser(state.user);
      setCanManage(hasPermission('roles:manage'));
      setCanView(hasPermission('roles:view') || hasPermission('roles:manage'));
    });
    return unsubscribe;
  }, []);

  // --------------------------------------------------------------------------
  // Data Fetching
  // --------------------------------------------------------------------------
  const loadData = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);

      const [rolesRes, permisosRes] = await Promise.all([
        apiFetch('/api/roles'),
        apiFetch('/api/permisos'),
      ]);

      if (!rolesRes.ok) {
        const err = await rolesRes.json().catch(() => ({}));
        throw new Error(err.error || 'Error al obtener roles del sistema');
      }
      if (!permisosRes.ok) {
        const err = await permisosRes.json().catch(() => ({}));
        throw new Error(err.error || 'Error al obtener catálogo de permisos');
      }

      const rolesData: RoleItem[] = await rolesRes.json();
      const permisosData: PermisoItem[] = await permisosRes.json();

      setRoles(rolesData);
      setAllPermisos(permisosData);

      // Build initial sets
      const initialMap: Record<number, Set<number>> = {};
      const originalMap: Record<number, Set<number>> = {};

      for (const r of rolesData) {
        const idSet = new Set<number>(r.permisos.map((p) => p.id));
        initialMap[r.id] = new Set(idSet);
        originalMap[r.id] = new Set(idSet);
      }

      setWorkingPermisos(initialMap);
      setOriginalPermisos(originalMap);

      if (rolesData.length > 0 && selectedRoleId === null) {
        setSelectedRoleId(rolesData[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching role configuration:', err);
      setLoadError(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --------------------------------------------------------------------------
  // Dirty-State Calculations & Warnings
  // --------------------------------------------------------------------------
  const isRoleDirty = (roleId: number): boolean => {
    const orig = originalPermisos[roleId];
    const curr = workingPermisos[roleId];
    if (!orig || !curr) return false;
    if (orig.size !== curr.size) return true;
    for (const id of curr) {
      if (!orig.has(id)) return true;
    }
    return false;
  };

  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId) || null;
  }, [roles, selectedRoleId]);

  const activeIsDirty = selectedRoleId !== null ? isRoleDirty(selectedRoleId) : false;

  // Prompt before navigating away from page if changes are pending
  useEffect(() => {
    const hasAnyDirty = roles.some((r) => isRoleDirty(r.id));
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasAnyDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [roles, workingPermisos, originalPermisos]);

  // --------------------------------------------------------------------------
  // Group Permissions by Module
  // --------------------------------------------------------------------------
  const groupedPermisos = useMemo(() => {
    const groups: Record<string, PermisoItem[]> = {};
    for (const p of allPermisos) {
      const mod = p.modulo || 'general';
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(p);
    }
    return groups;
  }, [allPermisos]);

  // --------------------------------------------------------------------------
  // Lockout Protection Helper
  // --------------------------------------------------------------------------
  const isPermissionLocked = (permisoCodigo: string): boolean => {
    if (!selectedRole) return false;
    return selectedRole.nombre === 'Administrador' && LOCKED_ADMIN_CODES.includes(permisoCodigo);
  };

  // --------------------------------------------------------------------------
  // Toggle & Batch Selection Actions
  // --------------------------------------------------------------------------
  const handleTogglePermission = (permisoId: number, permisoCodigo: string) => {
    if (!canManage || !selectedRoleId || isPermissionLocked(permisoCodigo)) {
      return;
    }

    setWorkingPermisos((prev) => {
      const currentSet = new Set(prev[selectedRoleId] || []);
      if (currentSet.has(permisoId)) {
        currentSet.delete(permisoId);
      } else {
        currentSet.add(permisoId);
      }
      return { ...prev, [selectedRoleId]: currentSet };
    });
  };

  const handleSelectAll = () => {
    if (!canManage || !selectedRoleId) return;
    setWorkingPermisos((prev) => {
      const allIds = new Set(allPermisos.map((p) => p.id));
      return { ...prev, [selectedRoleId]: allIds };
    });
  };

  const handleDeselectAll = () => {
    if (!canManage || !selectedRoleId || !selectedRole) return;
    setWorkingPermisos((prev) => {
      // If role is Administrador, preserve locked admin permissions
      const preservedIds = new Set<number>();
      if (selectedRole.nombre === 'Administrador') {
        allPermisos
          .filter((p) => LOCKED_ADMIN_CODES.includes(p.codigo))
          .forEach((p) => preservedIds.add(p.id));
      }
      return { ...prev, [selectedRoleId]: preservedIds };
    });
  };

  const handleDiscardChanges = () => {
    if (!selectedRoleId || !originalPermisos[selectedRoleId]) return;
    setWorkingPermisos((prev) => ({
      ...prev,
      [selectedRoleId]: new Set(originalPermisos[selectedRoleId]),
    }));
    setFeedback(null);
  };

  // --------------------------------------------------------------------------
  // Save Permissions Mutation
  // --------------------------------------------------------------------------
  const handleSavePermissions = async () => {
    if (!canManage || !selectedRoleId || !selectedRole) return;

    try {
      setIsSaving(true);
      setFeedback(null);

      const activeSet = workingPermisos[selectedRoleId] || new Set();
      const permisoIds = Array.from(activeSet);

      const response = await apiFetch(`/api/roles/${selectedRoleId}/permisos`, {
        method: 'PUT',
        body: JSON.stringify({ permisoIds }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al actualizar los permisos del rol');
      }

      const updated = await response.json();

      // Update state snapshot
      setOriginalPermisos((prev) => ({
        ...prev,
        [selectedRoleId]: new Set(permisoIds),
      }));

      // Update roles collection
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRoleId
            ? {
                ...r,
                permisos: updated.rol?.permisos || r.permisos,
              }
            : r
        )
      );

      // If updating the active user's own role, sync local session
      if (currentUser && currentUser.rol === selectedRole.nombre) {
        try {
          const meRes = await apiFetch('/api/auth/me');
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.usuario) {
              setSession(meData.token || getToken() || '', meData.usuario, meData.originalAdmin, meData.isImpersonated);
            }
          }
        } catch (syncErr) {
          console.warn('Error syncing session after permission change:', syncErr);
        }
      }

      setFeedback({
        type: 'success',
        text: `Los permisos del rol "${selectedRole.nombre}" fueron actualizados correctamente.`,
      });

      // Auto dismiss success toast after 4 seconds
      setTimeout(() => {
        setFeedback((f) => (f?.type === 'success' ? null : f));
      }, 4000);
    } catch (err: any) {
      console.error('Error saving role permissions:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Error inesperado al guardar los permisos.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --------------------------------------------------------------------------
  // Render: Access Denied Placeholder
  // --------------------------------------------------------------------------
  if (!canView && !isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-12 text-center max-w-2xl mx-auto">
        <ShieldAlert className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Acceso Denegado</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Su cuenta no cuenta con el permiso <code className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">roles:view</code> necesario para consultar la matriz de configuración de roles del tribunal.
        </p>
        <a
          href="/"
          className="inline-flex items-center px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
        >
          Regresar al Inicio
        </a>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Loading Skeleton
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-16 text-center flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Cargando roles y permisos del sistema...</p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Error Loading
  // --------------------------------------------------------------------------
  if (loadError) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-8 text-center max-w-xl mx-auto">
        <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-red-900 dark:text-red-200 mb-1">Error al cargar configuración</h3>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">{loadError}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const activeSet = selectedRoleId ? workingPermisos[selectedRoleId] || new Set() : new Set();
  const activeCount = activeSet.size;
  const totalCount = allPermisos.length;

  return (
    <div className="space-y-6">
      {/* Read-Only Notice if user lacks roles:manage */}
      {!canManage && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 flex items-center gap-3 text-sm text-blue-900 dark:text-blue-200">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div>
            <span className="font-semibold">Modo de Solo Consulta:</span> Cuenta con acceso de visualización (<code className="font-mono text-xs bg-blue-100/70 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-1 py-0.5 rounded">roles:view</code>). Para modificar los permisos asignados a cada rol, se requiere el permiso <code className="font-mono text-xs bg-blue-100/70 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-1 py-0.5 rounded">roles:manage</code>.
          </div>
        </div>
      )}

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Roles Selection Tabs / Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Roles del Tribunal ({roles.length})
            </h3>
          </div>

          <div className="space-y-2">
            {roles.map((role) => {
              const isSelected = role.id === selectedRoleId;
              const isDirty = isRoleDirty(role.id);
              const assignedCount = (workingPermisos[role.id] || new Set()).size;

              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-500 shadow-sm ring-1 ring-blue-400 dark:ring-blue-500'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                          role.nombre === 'Administrador'
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 dark:border dark:border-purple-800/50'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 dark:border dark:border-blue-800/50'
                        }`}
                      >
                        <Shield className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {role.nombre}
                      </span>
                    </div>

                    {isDirty && (
                      <span
                        className="inline-flex items-center text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 px-2 py-0.5 rounded-full"
                        title="Hay cambios sin guardar en este rol"
                      >
                        • Modificado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      {assignedCount} de {totalCount} permisos
                    </span>
                    <span className="text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                      {role.usuariosCount} {role.usuariosCount === 1 ? 'usuario' : 'usuarios'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Permission Matrix Configuration (8 cols) */}
        <div className="lg:col-span-8">
          {selectedRole ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
              {/* Role Header Panel */}
              <div className="p-6 bg-slate-50/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedRole.nombre}</h2>
                    {selectedRole.nombre === 'Administrador' && (
                      <span className="text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 px-2 py-0.5 rounded-full">
                        Superusuario
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {activeCount} de {totalCount} permisos habilitados para este perfil.
                  </p>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 transition-colors shadow-sm cursor-pointer"
                    >
                      Marcar todos
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 transition-colors shadow-sm cursor-pointer"
                    >
                      Desmarcar todos
                    </button>
                  </div>
                )}
              </div>

              {/* Administrador Lockout Security Notice (T2-ROLE-04) */}
              {selectedRole.nombre === 'Administrador' && (
                <div className="px-6 py-3.5 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200/80 dark:border-amber-900/60 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Protección contra Bloqueo Administrativo:</strong> Los permisos <code className="font-mono font-semibold bg-amber-100/70 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100 px-1 rounded">roles:manage</code> y <code className="font-mono font-semibold bg-amber-100/70 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100 px-1 rounded">impersonate:use</code> están protegidos y bloqueados permanentemente para el rol Administrador para prevenir pérdida irreversible de control en la plataforma.
                  </div>
                </div>
              )}

              {/* Feedback Alert Banner */}
              {feedback && (
                <div
                  className={`px-6 py-3 border-b flex items-center justify-between text-xs font-medium ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                    <span>{feedback.text}</span>
                  </div>
                  <button
                    onClick={() => setFeedback(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold ml-4 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Modules & Permissions Accordion / Grouped List */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[600px]">
                {Object.entries(groupedPermisos).map(([modulo, permisosList]) => {
                  const meta = MODULE_METADATA[modulo] || {
                    label: modulo.charAt(0).toUpperCase() + modulo.slice(1),
                    description: 'Permisos del módulo',
                    icon: Shield,
                  };
                  const Icon = meta.icon;

                  const moduleAssignedCount = permisosList.filter((p) =>
                    activeSet.has(p.id)
                  ).length;

                  return (
                    <div
                      key={modulo}
                      className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm"
                    >
                      {/* Module Header */}
                      <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 dark:border dark:border-blue-800/50 flex items-center justify-center">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{meta.label}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                              {meta.description}
                            </p>
                          </div>
                        </div>

                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {moduleAssignedCount} / {permisosList.length}
                        </span>
                      </div>

                      {/* Permissions List */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {permisosList.map((perm) => {
                          const isChecked = activeSet.has(perm.id);
                          const isLocked = isPermissionLocked(perm.codigo);
                          const isDisabled = !canManage || isLocked;

                          return (
                            <label
                              key={perm.id}
                              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                                isDisabled
                                  ? isLocked
                                    ? 'bg-amber-50/30 dark:bg-amber-950/20 cursor-not-allowed'
                                    : 'bg-slate-50/50 dark:bg-slate-800/30 cursor-not-allowed opacity-75'
                                  : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="pt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() =>
                                      handleTogglePermission(perm.id, perm.codigo)
                                    }
                                    className="w-4 h-4 text-blue-600 dark:text-blue-300 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-blue-500 dark:focus:ring-offset-slate-900 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                      {perm.nombre}
                                    </span>
                                    <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                      {perm.codigo}
                                    </code>
                                    {isLocked && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/60 px-1.5 py-0.5 rounded">
                                        <Lock className="w-2.5 h-2.5" />
                                        Protegido
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    {perm.descripcion}
                                  </p>
                                </div>
                              </div>

                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                  isChecked
                                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 dark:border dark:border-blue-800/50'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-400'
                                }`}
                              >
                                {isChecked ? 'Habilitado' : 'Inactivo'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sticky Action Footer */}
              {canManage && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {activeIsDirty ? (
                      <span className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        Tienes cambios sin guardar en este rol.
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">
                        No hay cambios pendientes en este rol.
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleDiscardChanges}
                      disabled={!activeIsDirty || isSaving}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" />
                        Descartar
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSavePermissions}
                      disabled={!activeIsDirty || isSaving}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shadow-sm disabled:bg-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Guardar Permisos</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 dark:text-slate-400">
              Seleccione un rol de la columna izquierda para configurar sus permisos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
