/**
 * TJA BCS - Client Preference State Engine
 * File: frontend/src/lib/preferences.ts
 *
 * Implements:
 * 1. Unified User Preference Data Model (supports dual schema: Spanish and English keys).
 * 2. Multi-tier Initial Hydration: Server API (/api/usuarios/preferencias) -> localStorage -> defaults.
 * 3. Synchronous DOM Mutation: zero-FOUC contract on document.documentElement data attributes
 *    (data-theme, data-accent, data-density, data-font-size, data-animations, data-sidebar, data-sidebar-pos).
 * 4. Debounced Network Persistence: coalesces rapid UI adjustments (color picker, sliders)
 *    and persists changes to SQLite via PUT /api/usuarios/preferencias.
 * 5. Event Bus: emits 'tja:preferences-changed', 'tja:widget-order-changed', and 'tja:employee-color-changed'.
 * 6. React Hook: usePreferences() for seamless island component integration.
 */

import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { getToken } from './auth';

// ============================================================================
// TYPES & DATA MODEL
// ============================================================================

export type ThemeMode = 'light' | 'dark' | 'auto';
export type DensityMode = 'comfortable' | 'compact';
export type FontSize = 'small' | 'normal' | 'large';
export type SidebarPosition = 'left' | 'right';

export type PresetPalette =
  | 'azul-clasico'
  | 'esmeralda'
  | 'purpura'
  | 'ambar'
  | 'carmesi'
  | 'indigo'
  | 'cian'
  | string;

export interface UserPreferences {
  // Spanish Canonical Properties (matching Backend & Prisma)
  tema: ThemeMode;
  colorAcento: string;
  paletaPreset: PresetPalette;
  densidad: DensityMode;
  tamanoFuente: FontSize;
  sidebarColapsado: boolean;
  sidebarPosicion: SidebarPosition;
  ordenWidgets: string[];
  animacionesHabilitadas: boolean;
  colorEmpleado: string;

  // English Aliases (matching React/TS idiomatic naming)
  theme: ThemeMode;
  accentColor: string;
  presetPalette: PresetPalette;
  density: DensityMode;
  fontSize: FontSize;
  sidebarCollapsed: boolean;
  sidebarPosition: SidebarPosition;
  dashboardWidgetOrder: string[];
  animationsEnabled: boolean;
  employeeColor: string;
}

export interface BackendPreferencias {
  id?: number;
  usuarioId?: number;
  tema?: ThemeMode;
  colorAcento?: string;
  paletaPreset?: string;
  densidad?: DensityMode;
  tamanoFuente?: FontSize;
  sidebarColapsado?: boolean;
  sidebarPosicion?: SidebarPosition;
  ordenWidgets?: string[];
  animacionesHabilitadas?: boolean;
  colorEmpleado?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Canonical defaults matching backend/src/routes/preferencias.ts & global.css
export const DEFAULT_PREFERENCES: Readonly<UserPreferences> = Object.freeze({
  tema: 'auto',
  colorAcento: '#2563eb',
  paletaPreset: 'azul-clasico',
  densidad: 'comfortable',
  tamanoFuente: 'normal',
  sidebarColapsado: false,
  sidebarPosicion: 'left',
  ordenWidgets: ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'],
  animacionesHabilitadas: true,
  colorEmpleado: '#2563eb',

  theme: 'auto',
  accentColor: '#2563eb',
  presetPalette: 'azul-clasico',
  density: 'comfortable',
  fontSize: 'normal',
  sidebarCollapsed: false,
  sidebarPosition: 'left',
  dashboardWidgetOrder: ['metricas', 'graficas', 'audiencias', 'actividad', 'expedientes'],
  animationsEnabled: true,
  employeeColor: '#2563eb',
});

// Storage keys matching zero-FOUC inline script in Layout.astro
export const STORAGE_KEY_PREFERENCES = 'tja_preferencias';
export const STORAGE_KEY_THEME = 'tja_theme';
export const STORAGE_KEY_ACCENT = 'tja_accent';
export const STORAGE_KEY_DENSITY = 'tja_density';
export const STORAGE_KEY_FONT_SIZE = 'tja_font_size';
export const STORAGE_KEY_ANIMATIONS = 'tja_animations';
export const STORAGE_KEY_SIDEBAR_COLLAPSED = 'tja_sidebar_collapsed';
export const STORAGE_KEY_SIDEBAR_POSITION = 'tja_sidebar_position';
export const STORAGE_KEY_EMPLOYEE_COLOR = 'tja_employee_color';

// Custom DOM Events for React island reactivity
export const EVENT_PREFERENCES_CHANGED = 'tja:preferences-changed';
export const EVENT_WIDGET_ORDER_CHANGED = 'tja:widget-order-changed';
export const EVENT_EMPLOYEE_COLOR_CHANGED = 'tja:employee-color-changed';

// Network debounce delay in milliseconds
const DEBOUNCE_DELAY_MS = 400;

// Hex color validator regex
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Pre-defined accent palette presets matching global.css
export const ACCENT_PRESETS = [
  { id: 'azul-clasico', name: 'Azul Clásico', hex: '#2563eb' },
  { id: 'esmeralda', name: 'Esmeralda', hex: '#059669' },
  { id: 'purpura', name: 'Púrpura Real', hex: '#7c3aed' },
  { id: 'ambar', name: 'Ámbar Judicial', hex: '#d97706' },
  { id: 'carmesi', name: 'Carmesí', hex: '#e11d48' },
  { id: 'indigo', name: 'Índigo', hex: '#4f46e5' },
  { id: 'cian', name: 'Cian', hex: '#0891b2' },
] as const;

// ============================================================================
// SINGLETON STATE & PERSISTENCE QUEUE
// ============================================================================

let memoryPreferences: UserPreferences = { ...DEFAULT_PREFERENCES };
let pendingSaveQueue: Record<string, any> = {};
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;
let activeSubscribers: Array<(prefs: UserPreferences) => void> = [];

// ============================================================================
// NORMALIZATION & PAYLOAD CONVERTERS
// ============================================================================

/**
 * Normalizes any partial or backend representation into strict UserPreferences
 * keeping both Spanish and English keys synchronized.
 */
export function normalizePreferences(raw: any): UserPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }

  // 1. Theme resolution (supports English 'theme' or Spanish 'tema')
  const rawTheme = (raw.tema !== undefined ? raw.tema : raw.theme || '').toLowerCase();
  const theme: ThemeMode = ['light', 'dark', 'auto'].includes(rawTheme)
    ? (rawTheme as ThemeMode)
    : DEFAULT_PREFERENCES.tema;

  // 2. Preset Palette
  const rawPreset = (raw.paletaPreset !== undefined ? raw.paletaPreset : raw.presetPalette || '').trim();
  const presetPalette: PresetPalette =
    rawPreset && /^[a-zA-Z0-9_-]{2,40}$/.test(rawPreset)
      ? rawPreset
      : DEFAULT_PREFERENCES.paletaPreset;

  // 3. Accent Color (supports 'colorAcento' or 'accentColor')
  let rawAccent = (raw.colorAcento !== undefined ? raw.colorAcento : raw.accentColor || '').trim();
  if (!HEX_COLOR_REGEX.test(rawAccent)) {
    // If invalid or missing, lookup from preset palette
    const matched = ACCENT_PRESETS.find((p) => p.id === presetPalette);
    rawAccent = matched ? matched.hex : DEFAULT_PREFERENCES.colorAcento;
  }
  const accentColor = rawAccent;

  // 4. Density (supports 'densidad' or 'density')
  const rawDensity = (raw.densidad !== undefined ? raw.densidad : raw.density || '').toLowerCase();
  const density: DensityMode = ['comfortable', 'compact'].includes(rawDensity)
    ? (rawDensity as DensityMode)
    : DEFAULT_PREFERENCES.densidad;

  // 5. Font Size (supports 'tamanoFuente' or 'fontSize')
  const rawFontSize = (raw.tamanoFuente !== undefined ? raw.tamanoFuente : raw.fontSize || '').toLowerCase();
  const fontSize: FontSize = ['small', 'normal', 'large'].includes(rawFontSize)
    ? (rawFontSize as FontSize)
    : DEFAULT_PREFERENCES.tamanoFuente;

  // 6. Sidebar Collapsed (supports 'sidebarColapsado' or 'sidebarCollapsed')
  const sidebarCollapsed =
    typeof raw.sidebarColapsado === 'boolean'
      ? raw.sidebarColapsado
      : typeof raw.sidebarCollapsed === 'boolean'
      ? raw.sidebarCollapsed
      : DEFAULT_PREFERENCES.sidebarColapsado;

  // 7. Sidebar Position (supports 'sidebarPosicion' or 'sidebarPosition')
  const rawSidebarPos = (raw.sidebarPosicion !== undefined ? raw.sidebarPosicion : raw.sidebarPosition || '').toLowerCase();
  const sidebarPosition: SidebarPosition = ['left', 'right'].includes(rawSidebarPos)
    ? (rawSidebarPos as SidebarPosition)
    : DEFAULT_PREFERENCES.sidebarPosicion;

  // 8. Dashboard Widget Order
  let dashboardWidgetOrder: string[] = [...DEFAULT_PREFERENCES.ordenWidgets];
  const rawWidgets = raw.ordenWidgets !== undefined ? raw.ordenWidgets : raw.dashboardWidgetOrder;
  if (Array.isArray(rawWidgets)) {
    const filtered = rawWidgets.filter((w): w is string => typeof w === 'string' && w.trim().length > 0);
    if (filtered.length > 0) dashboardWidgetOrder = filtered;
  } else if (typeof rawWidgets === 'string') {
    try {
      const parsed = JSON.parse(rawWidgets);
      if (Array.isArray(parsed) && parsed.length > 0) {
        dashboardWidgetOrder = parsed.filter((w): w is string => typeof w === 'string' && w.trim().length > 0);
      }
    } catch {
      // Keep defaults on parse failure
    }
  }

  // 9. Animations Enabled
  const animationsEnabled =
    typeof raw.animacionesHabilitadas === 'boolean'
      ? raw.animacionesHabilitadas
      : typeof raw.animationsEnabled === 'boolean'
      ? raw.animationsEnabled
      : DEFAULT_PREFERENCES.animacionesHabilitadas;

  // 10. Employee Identifying Color
  const rawEmpColor = (raw.colorEmpleado !== undefined ? raw.colorEmpleado : raw.employeeColor || '').trim();
  const employeeColor = HEX_COLOR_REGEX.test(rawEmpColor)
    ? rawEmpColor
    : DEFAULT_PREFERENCES.colorEmpleado;

  return {
    tema: theme,
    colorAcento: accentColor,
    paletaPreset: presetPalette,
    densidad: density,
    tamanoFuente: fontSize,
    sidebarColapsado: sidebarCollapsed,
    sidebarPosicion: sidebarPosition,
    ordenWidgets: dashboardWidgetOrder,
    animacionesHabilitadas: animationsEnabled,
    colorEmpleado: employeeColor,

    theme,
    accentColor,
    presetPalette,
    density,
    fontSize,
    sidebarCollapsed,
    sidebarPosition,
    dashboardWidgetOrder,
    animationsEnabled,
    employeeColor,
  };
}

/**
 * Maps partial preferences into dual-schema payload for backend persistence.
 */
export function toBackendPayload(partial: Partial<UserPreferences>): Record<string, any> {
  const payload: Record<string, any> = {};

  if (partial.tema !== undefined || partial.theme !== undefined) {
    const val = partial.tema !== undefined ? partial.tema : partial.theme;
    payload.tema = val;
    payload.theme = val;
  }
  if (partial.colorAcento !== undefined || partial.accentColor !== undefined) {
    const val = partial.colorAcento !== undefined ? partial.colorAcento : partial.accentColor;
    payload.colorAcento = val;
    payload.accentColor = val;
  }
  if (partial.paletaPreset !== undefined || partial.presetPalette !== undefined) {
    const val = partial.paletaPreset !== undefined ? partial.paletaPreset : partial.presetPalette;
    payload.paletaPreset = val;
    payload.presetPalette = val;
  }
  if (partial.densidad !== undefined || partial.density !== undefined) {
    const val = partial.densidad !== undefined ? partial.densidad : partial.density;
    payload.densidad = val;
    payload.density = val;
  }
  if (partial.tamanoFuente !== undefined || partial.fontSize !== undefined) {
    const val = partial.tamanoFuente !== undefined ? partial.tamanoFuente : partial.fontSize;
    payload.tamanoFuente = val;
    payload.fontSize = val;
  }
  if (partial.sidebarColapsado !== undefined || partial.sidebarCollapsed !== undefined) {
    const val = partial.sidebarColapsado !== undefined ? partial.sidebarColapsado : partial.sidebarCollapsed;
    payload.sidebarColapsado = val;
    payload.sidebarCollapsed = val;
  }
  if (partial.sidebarPosicion !== undefined || partial.sidebarPosition !== undefined) {
    const val = partial.sidebarPosicion !== undefined ? partial.sidebarPosicion : partial.sidebarPosition;
    payload.sidebarPosicion = val;
    payload.sidebarPosition = val;
  }
  if (partial.ordenWidgets !== undefined || partial.dashboardWidgetOrder !== undefined) {
    const val = partial.ordenWidgets !== undefined ? partial.ordenWidgets : partial.dashboardWidgetOrder;
    payload.ordenWidgets = val;
    payload.dashboardWidgetOrder = val;
  }
  if (partial.animacionesHabilitadas !== undefined || partial.animationsEnabled !== undefined) {
    const val = partial.animacionesHabilitadas !== undefined ? partial.animacionesHabilitadas : partial.animationsEnabled;
    payload.animacionesHabilitadas = val;
    payload.animationsEnabled = val;
  }
  if (partial.colorEmpleado !== undefined || partial.employeeColor !== undefined) {
    const val = partial.colorEmpleado !== undefined ? partial.colorEmpleado : partial.employeeColor;
    payload.colorEmpleado = val;
    payload.employeeColor = val;
  }

  return payload;
}

// ============================================================================
// SYNCHRONOUS DOM MUTATION (Zero-FOUC & Live Preview)
// ============================================================================

/**
 * Resolves active dark mode status accounting for system media preference.
 */
export function resolveEffectiveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Checks whether animations should be suppressed due to preference or OS reduced motion.
 */
export function resolveEffectiveAnimationState(animationsEnabled: boolean): 'enabled' | 'disabled' {
  if (typeof window === 'undefined') return 'enabled';
  if (!animationsEnabled) return 'disabled';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'disabled';
  }
  return 'enabled';
}

/**
 * Synchronously mutates document.documentElement attributes in real-time.
 * Guarantees zero latency and instantaneous live visual feedback.
 */
export function applyPreferencesToDOM(prefs: UserPreferences): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // 1. Theme (data-theme & .dark class)
  const effectiveTheme = resolveEffectiveTheme(prefs.tema);
  root.setAttribute('data-theme', effectiveTheme);
  if (effectiveTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 2. Accent & Preset Palette
  const accent = prefs.paletaPreset || 'azul-clasico';
  root.setAttribute('data-accent', accent);
  const isKnownPreset = ACCENT_PRESETS.some((p) => p.id === accent);
  if (isKnownPreset) {
    // Allow global.css [data-accent] and [data-theme] rules to set --color-accent dynamically
    root.style.removeProperty('--color-accent');
  } else if (HEX_COLOR_REGEX.test(prefs.colorAcento)) {
    root.style.setProperty('--color-accent', prefs.colorAcento);
  }

  // 3. Density
  root.setAttribute('data-density', prefs.densidad);

  // 4. Font Size
  root.setAttribute('data-font-size', prefs.tamanoFuente);

  // 5. Animations & Universal Kill-Switch
  const effectiveAnim = resolveEffectiveAnimationState(prefs.animacionesHabilitadas);
  root.setAttribute('data-animations', effectiveAnim);

  // 6. Sidebar Collapsed & Position
  root.setAttribute('data-sidebar', prefs.sidebarColapsado ? 'collapsed' : 'expanded');
  root.setAttribute('data-sidebar-pos', prefs.sidebarPosicion);
}

// ============================================================================
// STORAGE HELPERS (localStorage & Cookies)
// ============================================================================

function setClientCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const maxAge = days * 24 * 60 * 60;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * Writes preferences to localStorage and syncs cookies for SSR layout alignment.
 */
export function writePreferencesToStorage(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    // 1. Unified JSON object matching Layout.astro STORAGE_KEY
    localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(prefs));

    // 2. Granular keys for backwards-compatibility and instant lookup
    localStorage.setItem(STORAGE_KEY_THEME, prefs.tema);
    localStorage.setItem(STORAGE_KEY_ACCENT, prefs.paletaPreset || prefs.colorAcento);
    localStorage.setItem(STORAGE_KEY_DENSITY, prefs.densidad);
    localStorage.setItem(STORAGE_KEY_FONT_SIZE, prefs.tamanoFuente);
    localStorage.setItem(STORAGE_KEY_ANIMATIONS, prefs.animacionesHabilitadas ? 'enabled' : 'disabled');
    localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, String(prefs.sidebarColapsado));
    localStorage.setItem(STORAGE_KEY_SIDEBAR_POSITION, prefs.sidebarPosicion);
    localStorage.setItem(STORAGE_KEY_EMPLOYEE_COLOR, prefs.colorEmpleado);

    // 3. Cookies for Astro SSR pre-hydration alignment
    setClientCookie(STORAGE_KEY_THEME, prefs.tema);
    setClientCookie(STORAGE_KEY_ACCENT, prefs.paletaPreset || prefs.colorAcento);
    setClientCookie(STORAGE_KEY_DENSITY, prefs.densidad);
    setClientCookie(STORAGE_KEY_FONT_SIZE, prefs.tamanoFuente);
    setClientCookie(STORAGE_KEY_ANIMATIONS, prefs.animacionesHabilitadas ? 'enabled' : 'disabled');
    setClientCookie(STORAGE_KEY_SIDEBAR_COLLAPSED, String(prefs.sidebarColapsado));
    setClientCookie(STORAGE_KEY_SIDEBAR_POSITION, prefs.sidebarPosicion);
  } catch (err) {
    console.warn('[preferences] Storage write warning:', err);
  }
}

/**
 * Reads local preferences from localStorage fallback hierarchy.
 */
export function readPreferencesFromStorage(): UserPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const rawJson = localStorage.getItem(STORAGE_KEY_PREFERENCES);
    if (rawJson) {
      return normalizePreferences(JSON.parse(rawJson));
    }

    // Fallback to individual granular keys if unified JSON is missing
    const partial: Partial<UserPreferences> = {};
    const theme = localStorage.getItem(STORAGE_KEY_THEME);
    if (theme) partial.tema = theme as ThemeMode;

    const accent = localStorage.getItem(STORAGE_KEY_ACCENT);
    if (accent) {
      if (HEX_COLOR_REGEX.test(accent)) partial.colorAcento = accent;
      else partial.paletaPreset = accent;
    }

    const density = localStorage.getItem(STORAGE_KEY_DENSITY);
    if (density) partial.densidad = density as DensityMode;

    const fontSize = localStorage.getItem(STORAGE_KEY_FONT_SIZE);
    if (fontSize) partial.tamanoFuente = fontSize as FontSize;

    const anim = localStorage.getItem(STORAGE_KEY_ANIMATIONS);
    if (anim) partial.animacionesHabilitadas = anim !== 'disabled';

    const collapsed = localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED);
    if (collapsed !== null) partial.sidebarColapsado = collapsed === 'true';

    const sidebarPos = localStorage.getItem(STORAGE_KEY_SIDEBAR_POSITION);
    if (sidebarPos) partial.sidebarPosicion = sidebarPos as SidebarPosition;

    const empColor = localStorage.getItem(STORAGE_KEY_EMPLOYEE_COLOR);
    if (empColor) partial.colorEmpleado = empColor;

    return normalizePreferences(partial);
  } catch (err) {
    console.warn('[preferences] Storage read fallback warning:', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

// ============================================================================
// EVENT DISPATCHER & SUBSCRIPTIONS
// ============================================================================

/**
 * Dispatches custom events to notify all listening React islands.
 */
export function emitPreferencesChanged(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;

  // 1. In-memory subscriber callbacks
  for (const sub of activeSubscribers) {
    try {
      sub(prefs);
    } catch (e) {
      console.error('[preferences] Subscriber callback error:', e);
    }
  }

  // 2. DOM CustomEvents for cross-island decoupling
  try {
    window.dispatchEvent(
      new CustomEvent<UserPreferences>(EVENT_PREFERENCES_CHANGED, {
        detail: prefs,
        bubbles: true,
      })
    );
    window.dispatchEvent(
      new CustomEvent<string[]>(EVENT_WIDGET_ORDER_CHANGED, {
        detail: prefs.ordenWidgets,
        bubbles: true,
      })
    );
    window.dispatchEvent(
      new CustomEvent<string>(EVENT_EMPLOYEE_COLOR_CHANGED, {
        detail: prefs.colorEmpleado,
        bubbles: true,
      })
    );
  } catch (err) {
    console.warn('[preferences] CustomEvent dispatch error:', err);
  }
}

/**
 * Subscribes a listener to preference change events.
 * Returns an unsubscribe cleanup function.
 */
export function subscribePreferences(callback: (prefs: UserPreferences) => void): () => void {
  activeSubscribers.push(callback);

  // Cross-component DOM event listener fallback
  const domListener = (e: Event) => {
    const custom = e as CustomEvent<UserPreferences>;
    if (custom.detail) callback(custom.detail);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(EVENT_PREFERENCES_CHANGED, domListener);
  }

  return () => {
    activeSubscribers = activeSubscribers.filter((s) => s !== callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener(EVENT_PREFERENCES_CHANGED, domListener);
    }
  };
}

// ============================================================================
// NETWORK PERSISTENCE & DEBOUNCING
// ============================================================================

/**
 * Flushes all pending changes immediately to the backend SQLite database.
 */
export async function flushPreferences(): Promise<UserPreferences> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const payloadToSend = { ...pendingSaveQueue };
  pendingSaveQueue = {};

  if (Object.keys(payloadToSend).length === 0) {
    return memoryPreferences;
  }

  const token = getToken();
  if (!token) {
    // Unauthenticated user: local state is preserved, no backend sync
    return memoryPreferences;
  }

  try {
    const backendPayload = toBackendPayload(payloadToSend);
    const response = await apiFetch('/api/usuarios/preferencias', {
      method: 'PUT',
      body: JSON.stringify(backendPayload),
    });

    if (response.ok) {
      const data = await response.json();
      const updated = normalizePreferences(data);
      memoryPreferences = { ...memoryPreferences, ...updated };
      writePreferencesToStorage(memoryPreferences);
      applyPreferencesToDOM(memoryPreferences);
      return memoryPreferences;
    } else {
      console.warn(`[preferences] Backend persist failed with HTTP ${response.status}`);
    }
  } catch (err) {
    console.warn('[preferences] Network persistence error:', err);
  }

  return memoryPreferences;
}

/**
 * Schedules debounced network persistence.
 */
function scheduleDebouncedSave(partial: Partial<UserPreferences>): void {
  pendingSaveQueue = { ...pendingSaveQueue, ...toBackendPayload(partial) };

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    flushPreferences().catch((e) => console.error('[preferences] Debounced flush error:', e));
  }, DEBOUNCE_DELAY_MS);
}

// ============================================================================
// CORE PUBLIC API
// ============================================================================

/**
 * Returns current snapshot of user preferences synchronously.
 */
export function getPreferences(): UserPreferences {
  if (!isInitialized && typeof window !== 'undefined') {
    initPreferencesSync();
  }
  return { ...memoryPreferences };
}

/**
 * Updates user preferences with immediate synchronous DOM mutation,
 * local storage synchronization, event broadcast, and debounced backend persistence.
 */
export function setPreferences(partial: Partial<UserPreferences>): UserPreferences {
  const normalizedPartial = normalizePreferences({ ...memoryPreferences, ...partial });
  memoryPreferences = normalizedPartial;

  // 1. Instant synchronous DOM mutation (zero-FOUC, zero delay)
  applyPreferencesToDOM(memoryPreferences);

  // 2. Synchronous local storage persistence
  writePreferencesToStorage(memoryPreferences);

  // 3. Emit real-time event to React islands
  emitPreferencesChanged(memoryPreferences);

  // 4. Schedule debounced SQLite persistence
  scheduleDebouncedSave(partial);

  return memoryPreferences;
}

/**
 * Convenience helper to set a single preference property.
 */
export function setPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K]
): UserPreferences {
  return setPreferences({ [key]: value } as Partial<UserPreferences>);
}

/**
 * Synchronous initialization from localStorage for immediate DOM bootstrap.
 */
export function initPreferencesSync(): UserPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }

  memoryPreferences = readPreferencesFromStorage();
  applyPreferencesToDOM(memoryPreferences);
  isInitialized = true;
  return memoryPreferences;
}

/**
 * Full lifecycle initializer:
 * 1. Synchronously restores from localStorage and applies to DOM.
 * 2. Asynchronously fetches authoritative preferences from /api/usuarios/preferencias.
 * 3. Registers listeners for OS theme / reduced-motion changes.
 */
export async function initPreferences(): Promise<UserPreferences> {
  // Step 1: Instant sync bootstrap
  initPreferencesSync();

  if (typeof window === 'undefined') {
    return memoryPreferences;
  }

  // Step 2: Register OS media query reactive listeners
  if (window.matchMedia) {
    const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkMediaQuery.addEventListener('change', () => {
      if (memoryPreferences.tema === 'auto') {
        applyPreferencesToDOM(memoryPreferences);
        emitPreferencesChanged(memoryPreferences);
      }
    });

    const motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionMediaQuery.addEventListener('change', () => {
      if (memoryPreferences.animacionesHabilitadas) {
        applyPreferencesToDOM(memoryPreferences);
        emitPreferencesChanged(memoryPreferences);
      }
    });
  }

  // Flush pending changes on window unload
  window.addEventListener('beforeunload', () => {
    if (Object.keys(pendingSaveQueue).length > 0) {
      flushPreferences().catch(() => {});
    }
  });

  // Step 3: Authenticated fetch from server
  const token = getToken();
  if (!token) {
    return memoryPreferences;
  }

  try {
    const res = await apiFetch('/api/usuarios/preferencias');
    if (res.ok) {
      const serverData = await res.json();
      const serverPrefs = normalizePreferences(serverData);

      memoryPreferences = { ...memoryPreferences, ...serverPrefs };
      writePreferencesToStorage(memoryPreferences);
      applyPreferencesToDOM(memoryPreferences);
      emitPreferencesChanged(memoryPreferences);
    }
  } catch (err) {
    console.warn('[preferences] Remote fetch warning, using offline/local state:', err);
  }

  return memoryPreferences;
}

/**
 * Resets preferences to system defaults both locally and in backend.
 */
export async function resetPreferencesToDefault(): Promise<UserPreferences> {
  return setPreferences({ ...DEFAULT_PREFERENCES });
}

/**
 * React Hook for seamless island subscription to user preferences.
 */
export function usePreferences(): [UserPreferences, (partial: Partial<UserPreferences>) => void] {
  const [prefs, setPrefsState] = useState<UserPreferences>(() => getPreferences());

  useEffect(() => {
    setPrefsState(getPreferences());
    const unsub = subscribePreferences((newPrefs) => {
      setPrefsState(newPrefs);
    });
    return unsub;
  }, []);

  return [prefs, setPreferences];
}

// Auto-initialize synchronously if in browser context
if (typeof window !== 'undefined') {
  initPreferencesSync();
}
