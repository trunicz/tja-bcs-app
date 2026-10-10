import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sun,
  Moon,
  Monitor,
  Palette,
  Check,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Sidebar,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Sparkles,
  EyeOff,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getPreferences,
  setPreferences,
  setPreference,
  resetPreferencesToDefault,
  subscribePreferences,
  ACCENT_PRESETS,
  DEFAULT_PREFERENCES,
  type UserPreferences,
  type ThemeMode,
  type DensityMode,
  type FontSize,
  type SidebarPosition,
  type PresetPalette,
} from '../../lib/preferences';
import {
  getContrastTextColor,
  getAvatarStyle,
  TRIBUNAL_EMPLOYEE_PALETTES,
} from '../../lib/employeeColor';
import { getUser, type User as AuthUser } from '../../lib/auth';

// ============================================================================
// TYPES & CATALOGS
// ============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error';

export interface AppearanceDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
}

// Dashboard Widget Catalog for Reordering
export interface WidgetItem {
  id: string;
  title: string;
  description: string;
}

export const WIDGET_CATALOG: Record<string, WidgetItem> = {
  metricas: {
    id: 'metricas',
    title: 'Métricas e Indicadores Clave',
    description: 'Totales de expedientes, acuerdos y términos perentorios',
  },
  graficas: {
    id: 'graficas',
    title: 'Gráficas de Ingresos y Estatus',
    description: 'Distribución estadística de juicios por sala y año',
  },
  audiencias: {
    id: 'audiencias',
    title: 'Agenda de Audiencias',
    description: 'Comparecencias y plazos jurisdiccionales programados',
  },
  actividad: {
    id: 'actividad',
    title: 'Bitácora de Actividad Reciente',
    description: 'Registro cronológico de movimientos y acuerdos',
  },
  expedientes: {
    id: 'expedientes',
    title: 'Expedientes Prioritarios',
    description: 'Acceso directo a expedientes con trámite urgente',
  },
};

// ============================================================================
// COMPONENT IMPLEMENTATION
// ============================================================================

export default function AppearanceDrawer({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: AppearanceDrawerProps) {
  // Uncontrolled fallback state if not wrapped in AppShell
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  // Synchronous State synced with preferences singleton
  const [prefs, setPrefs] = useState<UserPreferences>(() => getPreferences());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [activeTab, setActiveTab] = useState<'estilo' | 'disposicion' | 'empleado'>('estilo');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Initial Load & Subscriptions
  useEffect(() => {
    setUser(getUser());
    setPrefs(getPreferences());

    // Subscribe to state changes from anywhere
    const unsub = subscribePreferences((latest) => {
      setPrefs({ ...latest });
    });

    const handleOpenDrawer = () => {
      if (controlledIsOpen === undefined) {
        setInternalIsOpen(true);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    window.addEventListener('tja:open-appearance-drawer', handleOpenDrawer);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsub();
      window.removeEventListener('tja:open-appearance-drawer', handleOpenDrawer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // 2. Preference Mutator with Sync Status Feedback
  const handleUpdate = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setSyncStatus('syncing');

    // If palette preset changed, also update accent color to match
    if (key === 'paletaPreset') {
      const matched = ACCENT_PRESETS.find((p) => p.id === value);
      if (matched) {
        setPreferences({
          paletaPreset: value as string,
          colorAcento: matched.hex,
        });
      } else {
        setPreference(key, value);
      }
    } else {
      setPreference(key, value);
    }

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2500);
    }, 700);
  };

  // 3. Reset to Defaults
  const handleReset = async () => {
    setSyncStatus('syncing');
    await resetPreferencesToDefault();
    setSyncStatus('saved');
    setTimeout(() => setSyncStatus('idle'), 2000);
  };

  // 4. Widget Reordering Actions
  const moveWidget = (index: number, direction: 'up' | 'down') => {
    const list = [...prefs.ordenWidgets];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);

    handleUpdate('ordenWidgets', list);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appearance-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Slide-over Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-250 select-none">
          
          {/* =================================================================
              DRAWER HEADER
             ================================================================= */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Palette className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2
                  id="appearance-drawer-title"
                  className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
                >
                  Personalización de Apariencia
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Ajustes en vivo • Persistencia por usuario
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Reset to defaults button */}
              <button
                type="button"
                onClick={handleReset}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Restablecer valores predeterminados"
                aria-label="Restablecer valores predeterminados"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar panel de apariencia"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sync Status Banner */}
          <div className="px-5 py-2 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {syncStatus === 'syncing' && (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    Sincronizando con base de datos...
                  </span>
                </>
              )}
              {syncStatus === 'saved' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Guardado en servidor
                  </span>
                </>
              )}
              {syncStatus === 'error' && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Guardado local (sin conexión al servidor)
                  </span>
                </>
              )}
              {syncStatus === 'idle' && (
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  Vista previa en tiempo real
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              R2 Customization
            </span>
          </div>

          {/* Segmented Navigation Tabs */}
          <div className="px-5 pt-3 pb-1 border-b border-slate-200 dark:border-slate-800 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('estilo')}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg text-center transition-all cursor-pointer ${
                activeTab === 'estilo'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Estilo & Tema
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('disposicion')}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg text-center transition-all cursor-pointer ${
                activeTab === 'disposicion'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Disposición & Interfaz
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('empleado')}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg text-center transition-all cursor-pointer ${
                activeTab === 'empleado'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Color Empleado
            </button>
          </div>

          {/* =================================================================
              DRAWER SCROLLABLE BODY
             ================================================================= */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-sm text-slate-700 dark:text-slate-200">

            {/* TAB 1: ESTILO & TEMA */}
            {activeTab === 'estilo' && (
              <>
                {/* 1. Theme Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                    Modo de Tema
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'light' as ThemeMode, label: 'Claro', icon: Sun },
                      { id: 'dark' as ThemeMode, label: 'Oscuro', icon: Moon },
                      { id: 'auto' as ThemeMode, label: 'Automático', icon: Monitor },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = prefs.tema === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleUpdate('tema', item.id)}
                          className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30 shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Preset Palettes (7 Presets) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Paleta de Acento ({ACCENT_PRESETS.length} Presets)
                    </label>
                    <span className="text-[11px] font-semibold text-slate-400 capitalize">
                      {ACCENT_PRESETS.find((p) => p.id === prefs.paletaPreset)?.name || 'Personalizado'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
                    {ACCENT_PRESETS.map((palette) => {
                      const isSelected = prefs.paletaPreset === palette.id;
                      return (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={() => handleUpdate('paletaPreset', palette.id)}
                          title={`${palette.name}`}
                          className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-900 scale-105'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Color Swatch Circle */}
                          <div
                            className="w-8 h-8 rounded-full shadow-inner flex items-center justify-center transition-transform group-hover:scale-110"
                            style={{ backgroundColor: palette.hex }}
                          >
                            {isSelected && (
                              <Check className="w-4 h-4 text-white drop-shadow-sm animate-in zoom-in-75 duration-150" />
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 truncate w-full text-center">
                            {palette.name.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Font Size Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                    Tamaño de Tipografía
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'small' as FontSize, label: 'Pequeña', sub: '14px base', sample: 'Aa' },
                      { id: 'normal' as FontSize, label: 'Normal', sub: '16px base', sample: 'Aa' },
                      { id: 'large' as FontSize, label: 'Grande', sub: '18px base', sample: 'Aa' },
                    ].map((item) => {
                      const isSelected = prefs.tamanoFuente === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleUpdate('tamanoFuente', item.id)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30 shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`font-serif font-bold mb-1 ${
                              item.id === 'small' ? 'text-sm' : item.id === 'normal' ? 'text-base' : 'text-lg'
                            }`}
                          >
                            {item.sample}
                          </span>
                          <span className="text-xs font-semibold">{item.label}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">{item.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Density Toggle */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                    Densidad de Información
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      {
                        id: 'comfortable' as DensityMode,
                        label: 'Cómoda',
                        desc: 'Espaciado amplio para lectura confortable',
                        icon: Maximize2,
                      },
                      {
                        id: 'compact' as DensityMode,
                        label: 'Compacta',
                        desc: 'Mayor densidad de datos para listados judiciales',
                        icon: Minimize2,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = prefs.densidad === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleUpdate('densidad', item.id)}
                          className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30 shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <Icon className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-bold">{item.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {item.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Animations Toggle */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 mt-0.5">
                      {prefs.animacionesHabilitadas ? (
                        <Sparkles className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                        Efectos y Transiciones
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                        {prefs.animacionesHabilitadas
                          ? 'Animaciones visuales activas en navegación y componentes'
                          : 'Animaciones forzadas a 0ms (reducción de movimiento y accesibilidad)'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.animacionesHabilitadas}
                    onClick={() =>
                      handleUpdate('animacionesHabilitadas', !prefs.animacionesHabilitadas)
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      prefs.animacionesHabilitadas ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow-md ring-0 transition duration-200 ease-in-out ${
                        prefs.animacionesHabilitadas ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </>
            )}

            {/* TAB 2: DISPOSICIÓN & INTERFAZ */}
            {activeTab === 'disposicion' && (
              <>
                {/* 1. Sidebar Controls */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                    Comportamiento de la Barra Lateral
                  </label>

                  <div className="space-y-3">
                    {/* Collapsed / Expanded */}
                    <div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
                        Estado Inicial
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdate('sidebarColapsado', false)}
                          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                            !prefs.sidebarColapsado
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <PanelLeft className="w-4 h-4" />
                          <span>Expandida</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdate('sidebarColapsado', true)}
                          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                            prefs.sidebarColapsado
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Sidebar className="w-4 h-4" />
                          <span>Colapsada</span>
                        </button>
                      </div>
                    </div>

                    {/* Left / Right Position */}
                    <div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
                        Posición en Pantalla
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdate('sidebarPosicion', 'left')}
                          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                            prefs.sidebarPosicion === 'left'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <PanelLeft className="w-4 h-4" />
                          <span>Izquierda</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdate('sidebarPosicion', 'right')}
                          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                            prefs.sidebarPosicion === 'right'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <PanelRight className="w-4 h-4" />
                          <span>Derecha</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Dashboard Widget Order (Reorderable Controls) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Orden de Widgets en Dashboard
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdate('ordenWidgets', [
                          'metricas',
                          'graficas',
                          'audiencias',
                          'actividad',
                          'expedientes',
                        ])
                      }
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Restablecer orden
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Reordena los módulos del Panel Principal según tu flujo de trabajo judicial:
                  </p>

                  <div className="space-y-2">
                    {prefs.ordenWidgets.map((widgetId, index) => {
                      const item = WIDGET_CATALOG[widgetId] || {
                        id: widgetId,
                        title: widgetId,
                        description: '',
                      };
                      const isFirst = index === 0;
                      const isLast = index === prefs.ordenWidgets.length - 1;

                      return (
                        <div
                          key={widgetId}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                              {index + 1}
                            </span>
                            <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {item.title}
                              </p>
                              {item.description && (
                                <p className="text-[10px] text-slate-400 truncate">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <button
                              type="button"
                              disabled={isFirst}
                              onClick={() => moveWidget(index, 'up')}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Mover arriba"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isLast}
                              onClick={() => moveWidget(index, 'down')}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Mover abajo"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* TAB 3: COLOR EMPLEADO */}
            {activeTab === 'empleado' && (
              <>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Color Identificador de Empleado
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Este color identifica tus intervenciones en el sistema (avatares, bitácoras de
                    acuerdos, comentarios y firmas procesales):
                  </p>

                  {/* Live Avatar Preview Card */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 mb-5 flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl shadow-md transition-all scale-105"
                      style={getAvatarStyle(prefs.colorEmpleado)}
                    >
                      {user?.nombre ? user.nombre.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 block">
                        Vista Previa de tu Distintivo
                      </span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {user?.nombre || 'Usuario Activo'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {user?.rol || 'Personal Judicial'} • {prefs.colorEmpleado.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {/* Quick Color Swatches */}
                  <div className="mb-4">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-2">
                      Paleta de Colores Predefinidos Tribunal
                    </span>
                    <div className="grid grid-cols-6 gap-2.5">
                      {TRIBUNAL_EMPLOYEE_PALETTES.map((swatch) => {
                        const isSelected =
                          prefs.colorEmpleado.toLowerCase() === swatch.hex.toLowerCase();
                        return (
                          <button
                            key={swatch.id}
                            type="button"
                            onClick={() => handleUpdate('colorEmpleado', swatch.hex)}
                            title={`${swatch.nombre} (${swatch.cargoSugerido})`}
                            className={`h-9 rounded-xl flex items-center justify-center transition-transform hover:scale-110 cursor-pointer shadow-xs ${
                              isSelected
                                ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-105'
                                : ''
                            }`}
                            style={{ backgroundColor: swatch.hex }}
                          >
                            {isSelected && (
                              <Check
                                className="w-4 h-4 drop-shadow-sm"
                                style={{ color: getContrastTextColor(swatch.hex) }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Hex Picker Input */}
                  <div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
                      Color Hexadecimal Personalizado
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <input
                          type="color"
                          value={prefs.colorEmpleado}
                          onChange={(e) => handleUpdate('colorEmpleado', e.target.value)}
                          className="w-10 h-10 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer p-0.5 bg-transparent"
                          title="Abrir selector de color nativo"
                        />
                      </div>
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={prefs.colorEmpleado}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                              setPrefs((prev) => ({ ...prev, colorEmpleado: val }));
                              if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                                handleUpdate('colorEmpleado', val);
                              }
                            }
                          }}
                          placeholder="#2563eb"
                          maxLength={7}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>

          {/* =================================================================
              DRAWER FOOTER
             ================================================================= */}
          <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Restablecer Predeterminados
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Cerrar Panel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
