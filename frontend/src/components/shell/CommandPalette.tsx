import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  LayoutDashboard,
  FolderOpen,
  Calendar,
  Bell,
  BarChart3,
  Settings,
  HelpCircle,
  Archive,
  MessageSquare,
  PlusCircle,
  Palette,
  Moon,
  Sidebar,
  ShieldCheck,
  FileText,
  Loader2,
  X,
  Users,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import { getUser, hasPermission, type User as AuthUser } from '../../lib/auth';
import { setPreferences, DEFAULT_PREFERENCES } from '../../lib/preferences';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath?: string;
  onOpenAppearance?: () => void;
  canManageRoles?: boolean;
  user?: AuthUser | null;
}

export type CommandCategory = 'Navegación' | 'Acciones' | 'Expedientes' | 'Usuarios';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  color?: string; // Color de empleado asignado
  keywords?: string[];
  action: () => void;
}

interface ExpedienteSearchResult {
  id: number;
  folio: string;
  actor: string;
  demandado?: string;
  sala?: {
    nombre: string;
  };
  estatus?: {
    nombre: string;
  };
}

interface UsuarioSearchResult {
  id: number;
  nombre: string;
  correo: string;
  activo?: boolean;
  colorEmpleado?: string;
  rol?: { id: number; nombre: string } | string;
  sala?: { id: number; nombre: string } | string;
}

/**
 * Score-based fuzzy matching algorithm.
 * Evaluates match quality between a search query and target string.
 *
 * Scoring breakdown:
 * - Exact Match: 100
 * - Prefix Match: 80 - 95 (ratio bonus)
 * - Word Boundary Match: 70 - 85 (ratio bonus)
 * - Substring Match: 50 - 65 (ratio bonus)
 * - Fuzzy Subsequence Match: 10 - 48 (sequential char run + boundary bonus)
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q || !t) return 0;

  // 1. Exact match
  if (t === q) return 100;

  // 2. Prefix match
  if (t.startsWith(q)) {
    return 80 + Math.min(15, (q.length / t.length) * 15);
  }

  // 3. Word boundary substring match (e.g. searching "usuarios" in "Directorio de Usuarios")
  const wordBoundaryRegex = new RegExp(`(?:^|[\\s/\\-_.])${escapeRegex(q)}`);
  if (wordBoundaryRegex.test(t)) {
    return 70 + Math.min(15, (q.length / t.length) * 15);
  }

  // 4. General substring match
  if (t.includes(q)) {
    return 50 + Math.min(15, (q.length / t.length) * 15);
  }

  // 5. Sequential character subsequence matching (fuzzy)
  let qIdx = 0;
  let score = 0;
  let consecutiveCount = 0;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
      consecutiveCount++;
      // Base match points
      score += 5;
      // Consecutive characters bonus
      if (consecutiveCount > 1) score += 4;
      // Word boundary match bonus
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '-' || t[i - 1] === '_') {
        score += 8;
      }
    } else {
      consecutiveCount = 0;
    }
  }

  // Return normalized score only if ALL query characters were matched sequentially
  if (qIdx === q.length) {
    const coverageRatio = q.length / t.length;
    return Math.min(48, Math.max(10, Math.round(score * coverageRatio)));
  }

  return 0;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculates aggregate relevance score for a CommandItem.
 */
function calculateItemScore(item: CommandItem, q: string): number {
  if (!q.trim()) return 1;

  const titleScore = fuzzyScore(q, item.title);
  const descScore = item.description ? fuzzyScore(q, item.description) * 0.75 : 0;
  const badgeScore = item.badge ? fuzzyScore(q, item.badge) * 0.6 : 0;
  const catScore = fuzzyScore(q, item.category) * 0.4;

  let keywordScore = 0;
  if (item.keywords && item.keywords.length > 0) {
    keywordScore = Math.max(...item.keywords.map((kw) => fuzzyScore(q, kw) * 0.8));
  }

  return Math.max(titleScore, descScore, badgeScore, catScore, keywordScore);
}

export default function CommandPalette({
  isOpen,
  onClose,
  currentPath = '/',
  onOpenAppearance,
  canManageRoles = false,
  user = null,
}: CommandPaletteProps) {
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [caseResults, setCaseResults] = useState<ExpedienteSearchResult[]>([]);
  const [userResults, setUserResults] = useState<UsuarioSearchResult[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState<boolean>(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const userCacheRef = useRef<UsuarioSearchResult[]>([]);
  const hasUserPermRef = useRef<boolean>(true);

  // Determine active permissions
  const currentUser = user || getUser();
  const canViewUsers = currentUser
    ? currentUser.rol === 'Administrador' ||
      (Array.isArray(currentUser.permisos) && currentUser.permisos.includes('usuarios:view'))
    : hasPermission('usuarios:view');

  const canManageRolesEffective =
    canManageRoles ||
    (currentUser
      ? currentUser.rol === 'Administrador' ||
        (Array.isArray(currentUser.permisos) && currentUser.permisos.includes('roles:manage'))
      : hasPermission('roles:manage'));

  // Reset state & auto-focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setCaseResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Pre-fetch user directory if allowed and not yet cached
      if (canViewUsers && userCacheRef.current.length === 0 && hasUserPermRef.current) {
        setIsLoadingUsers(true);
        const token = localStorage.getItem('auth_token');
        fetch('/api/usuarios', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((res) => {
            if (res.ok) return res.json();
            if (res.status === 403) hasUserPermRef.current = false;
            return [];
          })
          .then((data) => {
            if (Array.isArray(data)) {
              userCacheRef.current = data;
              setUserResults(data);
            }
          })
          .catch(() => {
            // Silently catch network failures
          })
          .finally(() => {
            setIsLoadingUsers(false);
          });
      }
    }
  }, [isOpen, canViewUsers]);

  // Debounced search for expedientes
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      setCaseResults([]);
      setIsLoadingCases(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingCases(true);

    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/expedientes?q=${encodeURIComponent(query.trim())}`, {
          headers,
        });

        if (res.ok && isCurrent) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : data.expedientes || [];
          setCaseResults(items.slice(0, 8));
        }
      } catch (e) {
        // Silently catch error
      } finally {
        if (isCurrent) setIsLoadingCases(false);
      }
    }, 200);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  // Navigate helper
  const navigateTo = (path: string) => {
    onClose();
    window.location.href = path;
  };

  // Toggle theme helper
  const toggleTheme = () => {
    onClose();
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (nextTheme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    try {
      localStorage.setItem('tja_theme', nextTheme);
      setPreferences({ tema: nextTheme });
    } catch {}
  };

  // Toggle sidebar helper
  const toggleSidebar = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('tja:toggle-sidebar'));
  };

  // Reset widget order helper
  const resetWidgetOrder = () => {
    onClose();
    try {
      setPreferences({ ordenWidgets: [...DEFAULT_PREFERENCES.ordenWidgets] });
      window.dispatchEvent(
        new CustomEvent('tja:widget-order-changed', {
          detail: [...DEFAULT_PREFERENCES.ordenWidgets],
        })
      );
      window.dispatchEvent(
        new CustomEvent('tja:toast', {
          detail: {
            type: 'success',
            title: 'Widgets Restablecidos',
            message: 'Se ha restaurado el orden predeterminado en el Dashboard.',
          },
        })
      );
    } catch (err) {
      console.warn('[CommandPalette] Error resetting widgets:', err);
    }
  };

  // Base navigation commands & actions
  const baseCommands = useMemo<CommandItem[]>(() => {
    return [
      // --- Navegación ---
      {
        id: 'nav-dashboard',
        title: 'Panel de Control (Dashboard)',
        description: 'Métricas principales, gráficas y estado general',
        category: 'Navegación',
        icon: LayoutDashboard,
        keywords: ['inicio', 'home', 'kpis', 'estadisticas', 'tablero'],
        action: () => navigateTo('/'),
      },
      {
        id: 'nav-expedientes',
        title: 'Expedientes Judiciales',
        description: 'Consulta, tabla, kanban y calendario de juicios',
        category: 'Navegación',
        icon: FolderOpen,
        keywords: ['juicios', 'casos', 'demandas', 'acuerdos', 'tramite'],
        action: () => navigateTo('/expedientes'),
      },
      {
        id: 'nav-usuarios',
        title: 'Directorio de Usuarios',
        description: 'Gestión de personal, roles institucionales y asignación',
        category: 'Navegación',
        icon: Users,
        keywords: ['personal', 'empleados', 'directorio', 'magistrados', 'secretarios', 'actuarios'],
        action: () => navigateTo('/usuarios'),
      },
      ...(canManageRolesEffective
        ? [
            {
              id: 'nav-roles',
              title: 'Roles y Permisos',
              description: 'Matriz granular de privilegios y accesos',
              category: 'Navegación' as const,
              icon: ShieldCheck,
              keywords: ['seguridad', 'privilegios', 'administracion', 'rbac'],
              action: () => navigateTo('/configuracion/roles'),
            },
          ]
        : []),
      {
        id: 'nav-agenda',
        title: 'Agenda y Audiencias',
        description: 'Calendario de comparecencias y plazos perentorios',
        category: 'Navegación',
        icon: Calendar,
        keywords: ['calendario', 'audiencias', 'fechas', 'plazos', 'citas'],
        action: () => navigateTo('/agenda'),
      },
      {
        id: 'nav-notificaciones',
        title: 'Centro de Notificaciones',
        description: 'Alertas procesales y avisos del tribunal',
        category: 'Navegación',
        icon: Bell,
        keywords: ['alertas', 'mensajes', 'avisos', 'bandeja'],
        action: () => navigateTo('/notificaciones'),
      },
      {
        id: 'nav-reportes',
        title: 'Reportes y Estadísticas',
        description: 'Análisis de resoluciones por sala y temporalidad',
        category: 'Navegación',
        icon: BarChart3,
        keywords: ['graficas', 'metricas', 'analitica', 'informes'],
        action: () => navigateTo('/reportes'),
      },
      {
        id: 'nav-busqueda',
        title: 'Búsqueda Avanzada',
        description: 'Filtros combinados de expedientes y resoluciones',
        category: 'Navegación',
        icon: Search,
        keywords: ['filtros', 'consultas', 'archivo'],
        action: () => navigateTo('/busqueda'),
      },
      {
        id: 'nav-ayuda',
        title: 'Centro de Ayuda',
        description: 'Documentación técnica y atajos de teclado',
        category: 'Navegación',
        icon: HelpCircle,
        keywords: ['faq', 'soporte', 'manual', 'shortcuts', 'teclado'],
        action: () => navigateTo('/ayuda'),
      },
      {
        id: 'nav-configuracion',
        title: 'Configuración del Sistema',
        description: 'Preferencias generales del tribunal',
        category: 'Navegación',
        icon: Settings,
        keywords: ['ajustes', 'opciones', 'preferencias'],
        action: () => navigateTo('/configuracion'),
      },
      {
        id: 'nav-documentos',
        title: 'Archivo Judicial Digital',
        description: 'Repositorio documental digitalizado',
        category: 'Navegación',
        icon: Archive,
        badge: 'Próximamente',
        keywords: ['digitalizacion', 'documentos', 'pdf'],
        action: () => navigateTo('/documentos'),
      },
      {
        id: 'nav-mensajeria',
        title: 'Mensajería Procesal / Actuarios',
        description: 'Comunicaciones entre salas y juzgados',
        category: 'Navegación',
        icon: MessageSquare,
        badge: 'Próximamente',
        keywords: ['chat', 'actuarios', 'notificaciones'],
        action: () => navigateTo('/mensajeria'),
      },

      // --- Acciones Rápidas ---
      {
        id: 'act-nuevo-expediente',
        title: 'Registrar Nuevo Expediente',
        description: 'Crear un nuevo expediente o juicio contencioso',
        category: 'Acciones',
        icon: PlusCircle,
        keywords: ['crear', 'alta', 'nueva demanda'],
        action: () => navigateTo('/expedientes/nuevo'),
      },
      {
        id: 'act-nuevo-usuario',
        title: 'Registrar Nuevo Usuario',
        description: 'Dar de alta personal o funcionarios en el tribunal',
        category: 'Acciones',
        icon: PlusCircle,
        keywords: ['crear usuario', 'alta empleado', 'nuevo funcionario'],
        action: () => navigateTo('/usuarios/nuevo'),
      },
      {
        id: 'act-apariencia',
        title: 'Personalizar Apariencia',
        description: 'Ajustar paleta de acento, tema y densidad',
        category: 'Acciones',
        icon: Palette,
        keywords: ['colores', 'diseño', 'fuente', 'tema', 'personalizacion'],
        action: () => {
          onClose();
          if (onOpenAppearance) onOpenAppearance();
          else window.dispatchEvent(new CustomEvent('tja:open-appearance-drawer'));
        },
      },
      {
        id: 'act-tema',
        title: 'Alternar Tema Claro / Oscuro',
        description: 'Cambiar el contraste de la interfaz',
        category: 'Acciones',
        icon: Moon,
        keywords: ['dark mode', 'modo oscuro', 'modo claro', 'noche'],
        action: toggleTheme,
      },
      {
        id: 'act-sidebar',
        title: 'Alternar Barra Lateral',
        description: 'Expandir o colapsar menú de navegación (Ctrl+B)',
        category: 'Acciones',
        icon: Sidebar,
        keywords: ['colapsar', 'ocultar', 'menu'],
        action: toggleSidebar,
      },
      {
        id: 'act-reset-widgets',
        title: 'Restablecer Orden de Widgets',
        description: 'Restaurar disposición predeterminada en el Dashboard',
        category: 'Acciones',
        icon: RotateCcw,
        keywords: ['restaurar panel', 'reiniciar widgets', 'orden por defecto'],
        action: resetWidgetOrder,
      },
    ];
  }, [canManageRolesEffective]);

  // Dynamic Case Commands from API
  const caseCommands = useMemo<CommandItem[]>(() => {
    return caseResults.map((c) => ({
      id: `case-${c.id}`,
      title: `Expediente ${c.folio}`,
      description: `${c.actor || 'Sin Actor'}${c.demandado ? ` vs ${c.demandado}` : ''}${
        c.sala?.nombre ? ` • ${c.sala.nombre}` : ''
      }`,
      category: 'Expedientes',
      icon: FileText,
      badge: c.estatus?.nombre,
      keywords: [c.folio, c.actor, c.demandado || '', c.sala?.nombre || ''].filter(Boolean),
      action: () => navigateTo(`/expedientes/${c.id}`),
    }));
  }, [caseResults]);

  // Dynamic User Commands from Directory Cache
  const userCommands = useMemo<CommandItem[]>(() => {
    const source = userResults.length > 0 ? userResults : userCacheRef.current;
    return source.map((u) => {
      const rolName = typeof u.rol === 'object' && u.rol?.nombre ? u.rol.nombre : String(u.rol || 'Personal');
      const salaName = typeof u.sala === 'object' && u.sala?.nombre ? u.sala.nombre : '';

      return {
        id: `user-${u.id}`,
        title: u.nombre,
        description: `${u.correo} • ${rolName}${salaName ? ` • ${salaName}` : ''}`,
        category: 'Usuarios',
        icon: UserCheck,
        badge: rolName,
        color: u.colorEmpleado,
        keywords: [u.nombre, u.correo, rolName, salaName].filter(Boolean),
        action: () => navigateTo(`/usuarios/${u.id}`),
      };
    });
  }, [userResults]);

  // Multi-entity scored filtering
  const filteredCommands = useMemo(() => {
    const q = query.trim();

    if (!q) {
      // Default initial view: base navigation and quick actions
      return baseCommands;
    }

    // Combine all entity sources
    const allCandidates: CommandItem[] = [...caseCommands, ...userCommands, ...baseCommands];

    // Compute scores
    const scored = allCandidates
      .map((item) => ({
        item,
        score: calculateItemScore(item, q),
      }))
      .filter((res) => res.score > 0)
      .sort((a, b) => b.score - a.score);

    // Return top 25 highest-relevance items
    return scored.slice(0, 25).map((s) => s.item);
  }, [query, baseCommands, caseCommands, userCommands]);

  // Clamp selection on query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view during arrow navigation
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
          <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe un comando o busca expedientes, usuarios, acuerdos..."
            className="w-full bg-transparent text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {(isLoadingCases || isLoadingUsers) && (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2 flex-shrink-0" />
          )}
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Borrar texto"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded ml-2">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/40">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
              No se encontraron comandos, usuarios ni expedientes para "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = cmd.icon;

              return (
                <div
                  key={cmd.id}
                  data-index={idx}
                  onClick={() => cmd.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 font-medium'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg flex-shrink-0 relative ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {/* Personal Employee Color indicator dot */}
                      {cmd.color && (
                        <span
                          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-900 shadow-2xs"
                          style={{ backgroundColor: cmd.color }}
                          title={`Color de empleado: ${cmd.color}`}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate leading-snug">{cmd.title}</p>
                      </div>
                      {cmd.description && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate leading-snug">
                          {cmd.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {cmd.badge && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 max-w-[120px] truncate">
                        {cmd.badge}
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                      {cmd.category}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-1 py-0.5 rounded">
                ↑
              </kbd>{' '}
              <kbd className="font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-1 py-0.5 rounded">
                ↓
              </kbd>{' '}
              para navegar
            </span>
            <span>
              <kbd className="font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-1 py-0.5 rounded">
                ↵
              </kbd>{' '}
              para ejecutar
            </span>
          </div>
          <span>TJA BCS • Control Judicial Ágil</span>
        </div>
      </div>
    </div>
  );
}
