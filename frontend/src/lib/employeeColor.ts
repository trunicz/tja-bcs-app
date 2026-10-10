/**
 * TJA BCS - Employee Color Mapping & Accessible Contrast Engine
 * File: frontend/src/lib/employeeColor.ts
 *
 * Implements:
 * 1. Pre-configured Tribunal Employee Palette Presets (dignified judicial colors).
 * 2. WCAG 2.1 Accessible Contrast Text Color Calculation (relative luminance formula).
 * 3. Employee identifying color extraction & normalization with deterministic fallback hashing.
 * 4. Helper styling methods for badges, chips, initials, and avatars across tables and feeds.
 */

import type { CSSProperties } from 'react';

// ============================================================================
// TYPES & TRIBUNAL PRESET PALETTES
// ============================================================================

export interface TribunalColorPreset {
  id: string;
  nombre: string;
  hex: string;
  cargoSugerido: string;
  descripcion: string;
}

/**
 * Pre-configured judicial palette presets tailored for Tribunal roles & departments.
 */
export const TRIBUNAL_EMPLOYEE_PALETTES: readonly TribunalColorPreset[] = Object.freeze([
  {
    id: 'magistrado-presidencia',
    nombre: 'Azul Magistratura / Presidencia',
    hex: '#1e3a8a', // Deep Judicial Navy
    cargoSugerido: 'Magistrado Presidente / Magistratura',
    descripcion: 'Dignidad institucional y máxima jerarquía judicial.',
  },
  {
    id: 'primera-sala',
    nombre: 'Verde Petróleo Primera Sala',
    hex: '#0f766e', // Deep Teal
    cargoSugerido: 'Magistrado / Titular de Primera Sala',
    descripcion: 'Identidad asignada a la Primera Sala Unitaria.',
  },
  {
    id: 'segunda-sala',
    nombre: 'Terracota Judicial Segunda Sala',
    hex: '#9a3412', // Rust / Terracotta
    cargoSugerido: 'Magistrado / Titular de Segunda Sala',
    descripcion: 'Identidad asignada a la Segunda Sala Unitaria.',
  },
  {
    id: 'secretaria-acuerdos',
    nombre: 'Verde Notarial / Acuerdos',
    hex: '#047857', // Emerald
    cargoSugerido: 'Secretario General de Acuerdos / Secretarios de Estudio',
    descripcion: 'Fe pública procesal y certificación de acuerdos y sentencias.',
  },
  {
    id: 'actuaria-notificaciones',
    nombre: 'Ámbar Judicial / Notificaciones',
    hex: '#b45309', // Warm Amber Gold
    cargoSugerido: 'Actuario Judicial / Diligenciario',
    descripcion: 'Celeridad en cédulas de notificación y términos procesales.',
  },
  {
    id: 'ponencia-proyeccion',
    nombre: 'Púrpura Imperial Ponencias',
    hex: '#6d28d9', // Deep Purple
    cargoSugerido: 'Secretario Proyectista / Auxiliar Jurisdiccional',
    descripcion: 'Elaboración y análisis de proyectos de resolución.',
  },
  {
    id: 'oficialia-partes',
    nombre: 'Azul Océano Oficialía',
    hex: '#0369a1', // Sky 700 / Ocean Blue (L=0.127, Contrast 5.93:1 with white)
    cargoSugerido: 'Oficial de Partes / Recepción de Escritos',
    descripcion: 'Atención a justiciables e ingreso de promociones y demandas.',
  },
  {
    id: 'archivo-judicial',
    nombre: 'Grafito / Pizarra Notarial',
    hex: '#475569', // Slate
    cargoSugerido: 'Encargado de Archivo / Digitalización',
    descripcion: 'Custodia del archivo histórico y expedientes concluidos.',
  },
  {
    id: 'organo-control',
    nombre: 'Rubí Borgoña Órgano Interno',
    hex: '#be123c', // Ruby / Crimson
    cargoSugerido: 'Titular de Órgano Interno de Control / Auditoría',
    descripcion: 'Supervisión deontológica, transparencia y rendición de cuentas.',
  },
  {
    id: 'administracion-finanzas',
    nombre: 'Verde Jade Administrativo',
    hex: '#059669', // Jade
    cargoSugerido: 'Secretario Administrativo / Recursos Humanos',
    descripcion: 'Gestión patrimonial, presupuestal y de personal.',
  },
  {
    id: 'informatica-sistemas',
    nombre: 'Índigo Digital / Tecnologías',
    hex: '#4338ca', // Tech Indigo
    cargoSugerido: 'Jefe de Informática / Sistemas e Infraestructura',
    descripcion: 'Firma electrónica avanzada y plataformas digitales del Tribunal.',
  },
  {
    id: 'defensoria-auxiliar',
    nombre: 'Carmesí / Asesoría Jurídica',
    hex: '#b91c1c', // Cardinal Red
    cargoSugerido: 'Defensor de Oficio / Personal de Apoyo Judicial',
    descripcion: 'Orientación jurídica gratuita y diligencias en audiencia.',
  },
]);

// Default system color
export const DEFAULT_EMPLOYEE_COLOR = '#2563eb';

// ============================================================================
// COLOR NORMALIZATION & RGB MATH
// ============================================================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Normalizes hex string to standardized 7-character lowercase format (#rrggbb).
 */
export function normalizeHexColor(input?: string | null, fallback = DEFAULT_EMPLOYEE_COLOR): string {
  if (!input || typeof input !== 'string') return fallback;

  let cleaned = input.trim();
  if (!cleaned.startsWith('#')) cleaned = `#${cleaned}`;

  if (!HEX_REGEX.test(cleaned)) return fallback;

  // Expand 3-character hex shorthand (#abc -> #aabbcc)
  if (cleaned.length === 4) {
    const r = cleaned[1];
    const g = cleaned[2];
    const b = cleaned[3];
    cleaned = `#${r}${r}${g}${g}${b}${b}`;
  }

  return cleaned.toLowerCase();
}

/**
 * Parses hex color string into RGB channel components.
 */
export function hexToRgb(hex: string): RGB | null {
  const normalized = normalizeHexColor(hex, '');
  if (!normalized) return null;

  const num = parseInt(normalized.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Converts RGB components back to 6-digit hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

// ============================================================================
// WCAG 2.1 RELATIVE LUMINANCE & ACCESSIBLE TEXT CONTRAST
// ============================================================================

/**
 * Calculates WCAG 2.1 relative luminance (L) of an sRGB color.
 * Range: 0.0 (absolute black) to 1.0 (pure white).
 * Spec: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(hexColor: string): number {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return 0;

  const [rLin, gLin, bLin] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two relative luminance values.
 * Formula: (L1 + 0.05) / (L2 + 0.05), range: 1:1 to 21:1.
 */
export function getContrastRatio(hexColor1: string, hexColor2: string): number {
  const l1 = getRelativeLuminance(hexColor1);
  const l2 = getRelativeLuminance(hexColor2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns accessible text color ('#ffffff', '#0f172a', or '#000000') for an avatar or badge background.
 * Strictly guarantees WCAG 2.1 AA (>= 4.5:1) contrast ratio across 100% of the 24-bit sRGB color space.
 *
 * Algorithm:
 * 1. Evaluates pure white (#ffffff, L=1.0) and dark slate (#0f172a, L=0.0088).
 * 2. If background relative luminance falls in the failure gap (0.1833 < L_bg < 0.2147) where
 *    neither #ffffff nor #0f172a can reach 4.5:1, falls back to pure black (#000000, L=0.0),
 *    which guarantees contrast >= 4.58:1 across the entire gap.
 */
export function getContrastTextColor(
  backgroundColorHex?: string | null
): '#ffffff' | '#0f172a' | '#000000' {
  if (!backgroundColorHex) return '#ffffff';
  const normalized = normalizeHexColor(backgroundColorHex);
  const bgLuminance = getRelativeLuminance(normalized);

  // Exact relative luminances
  const whiteLum = 1.0;
  const slateLum = getRelativeLuminance('#0f172a'); // ~0.008815

  const contrastWhite = (whiteLum + 0.05) / (bgLuminance + 0.05);
  const contrastSlate = (bgLuminance + 0.05) / (slateLum + 0.05);

  // 1. If white achieves WCAG AA (>= 4.5:1) and is better than or equal to slate
  if (contrastWhite >= 4.5 && contrastWhite >= contrastSlate) {
    return '#ffffff';
  }

  // 2. If slate achieves WCAG AA (>= 4.5:1) and is better than white
  if (contrastSlate >= 4.5 && contrastSlate > contrastWhite) {
    return '#0f172a';
  }

  // 3. If white alone satisfies WCAG AA
  if (contrastWhite >= 4.5) {
    return '#ffffff';
  }

  // 4. If slate alone satisfies WCAG AA
  if (contrastSlate >= 4.5) {
    return '#0f172a';
  }

  // 5. Gap Fallback (0.1833 < L_bg < 0.2147):
  // Pure black (#000000, L=0.0) yields (L_bg + 0.05) / 0.05 >= 4.58:1
  const contrastBlack = (bgLuminance + 0.05) / 0.05;
  if (contrastBlack >= 4.5) {
    return '#000000';
  }

  // Optimal fallback among all three candidates
  if (contrastWhite >= contrastSlate && contrastWhite >= contrastBlack) {
    return '#ffffff';
  }
  return contrastSlate >= contrastBlack ? '#0f172a' : '#000000';
}

// ============================================================================
// DETERMINISTIC COLOR HASHING & RESOLUTION
// ============================================================================

/**
 * Computes deterministic 32-bit hash on arbitrary employee identifier.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Maps employee identifier deterministically to one of the 12 Tribunal presets.
 */
export function getDeterministicColor(identifier: string | number): string {
  const idStr = String(identifier).trim().toLowerCase();
  if (!idStr) return DEFAULT_EMPLOYEE_COLOR;
  const hash = hashString(idStr);
  const index = hash % TRIBUNAL_EMPLOYEE_PALETTES.length;
  return TRIBUNAL_EMPLOYEE_PALETTES[index].hex;
}

/**
 * Resolves authoritative identifying color for an employee user object.
 * Hierarchy:
 * 1. Explicit user.colorEmpleado (if valid hex).
 * 2. Deterministic hash of user.id.
 * 3. Deterministic hash of user.correo.
 * 4. Deterministic hash of user.nombre.
 * 5. Default judicial blue (#2563eb).
 */
export function getEmployeeColor(
  user?: {
    id?: number;
    colorEmpleado?: string | null;
    correo?: string | null;
    nombre?: string | null;
  } | null
): string {
  if (!user) return DEFAULT_EMPLOYEE_COLOR;

  // 1. Explicit assigned color
  if (user.colorEmpleado && HEX_REGEX.test(user.colorEmpleado.trim())) {
    return normalizeHexColor(user.colorEmpleado);
  }

  // 2. Deterministic fallback by id
  if (typeof user.id === 'number' && user.id > 0) {
    return getDeterministicColor(`user-${user.id}`);
  }

  // 3. Deterministic fallback by email
  if (user.correo && user.correo.trim().length > 0) {
    return getDeterministicColor(user.correo.trim());
  }

  // 4. Deterministic fallback by name
  if (user.nombre && user.nombre.trim().length > 0) {
    return getDeterministicColor(user.nombre.trim());
  }

  return DEFAULT_EMPLOYEE_COLOR;
}

// ============================================================================
// AVATAR INITIALS & FORMATTING HELPERS
// ============================================================================

// Academic/judicial titles to strip when extracting clean initials
const JUDICIAL_TITLES = new Set([
  'lic',
  'lic.',
  'licdo',
  'licda',
  'dr',
  'dr.',
  'dra',
  'dra.',
  'mtro',
  'mtro.',
  'mtra',
  'mtra.',
  'mag',
  'mag.',
  'magdo',
  'magda',
  'ing',
  'ing.',
  'cp',
  'c.p.',
  'c.p',
]);

/**
 * Extracts 2-letter uppercase initials from full name or email.
 * Properly ignores honorifics ("Lic. Fernando Beltrán" -> "FB").
 */
export function getEmployeeInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail || typeof nameOrEmail !== 'string') return 'U';

  const clean = nameOrEmail.trim();
  if (clean.length === 0) return 'U';

  // If email address passed
  if (clean.includes('@')) {
    const handle = clean.split('@')[0];
    return handle.slice(0, 2).toUpperCase();
  }

  // Split tokens and filter honorific titles
  const tokens = clean
    .split(/\s+/)
    .filter((token) => !JUDICIAL_TITLES.has(token.toLowerCase()));

  if (tokens.length >= 2) {
    const first = tokens[0].charAt(0);
    const last = tokens[tokens.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  }

  if (tokens.length === 1 && tokens[0].length >= 2) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return clean.slice(0, 1).toUpperCase() || 'U';
}

/**
 * Suggests an employee color preset based on role or title keywords.
 */
export function suggestEmployeeColorByRole(roleOrTitle?: string | null): string {
  if (!roleOrTitle || typeof roleOrTitle !== 'string') return DEFAULT_EMPLOYEE_COLOR;

  const normalized = roleOrTitle.toLowerCase().trim();

  if (normalized.includes('presidente') || normalized.includes('presidencia')) {
    return '#1e3a8a'; // Navy Presidencia
  }
  if (normalized.includes('primera') || normalized.includes('sala 1')) {
    return '#0f766e'; // Teal Primera Sala
  }
  if (normalized.includes('segunda') || normalized.includes('sala 2')) {
    return '#9a3412'; // Terracotta Segunda Sala
  }
  if (normalized.includes('estudio y cuenta') || normalized.includes('proyectista')) {
    return '#6d28d9'; // Púrpura Ponencias
  }
  if (normalized.includes('secretario general') || normalized.includes('acuerdos')) {
    return '#047857'; // Verde Acuerdos
  }
  if (normalized.includes('actuario') || normalized.includes('notificador')) {
    return '#b45309'; // Ámbar Actuaría
  }
  if (normalized.includes('partes') || normalized.includes('recepcion')) {
    return '#0369a1'; // Azul Oficialía (Sky 700)
  }
  if (normalized.includes('archivo')) {
    return '#475569'; // Pizarra Archivo
  }
  if (normalized.includes('control') || normalized.includes('auditor')) {
    return '#be123c'; // Rubí Órgano de Control
  }
  if (normalized.includes('sistema') || normalized.includes('tecnolog') || normalized.includes('informatica')) {
    return '#4338ca'; // Índigo Sistemas
  }
  if (normalized.includes('administrador') || normalized.includes('admin')) {
    return '#059669'; // Jade Admin
  }
  if (normalized.includes('defensor') || normalized.includes('auxiliar')) {
    return '#b91c1c'; // Carmesí Defensoría
  }

  return getDeterministicColor(roleOrTitle);
}

// ============================================================================
// UI STYLING GENERATORS (React Style Objects)
// ============================================================================

export type BadgeVariant = 'solid' | 'subtle' | 'outline';

/**
 * Generates inline React CSS properties for avatars with identifying employee color.
 */
export function getAvatarStyle(hexColor?: string | null): CSSProperties {
  const bg = normalizeHexColor(hexColor);
  const text = getContrastTextColor(bg);
  return {
    backgroundColor: bg,
    color: text,
  };
}

/**
 * Alias for getAvatarStyle matching explorer conventions.
 */
export function getEmployeeAvatarStyle(color?: string | null): CSSProperties {
  return getAvatarStyle(color);
}

/**
 * Generates badge or tag styling with contrast accessibility.
 */
export function getEmployeeBadgeStyle(
  hexColor?: string | null,
  variant: BadgeVariant = 'subtle'
): CSSProperties {
  const color = normalizeHexColor(hexColor);
  const textColor = getContrastTextColor(color);

  switch (variant) {
    case 'solid':
      return {
        backgroundColor: color,
        color: textColor,
        borderColor: color,
      };

    case 'outline':
      return {
        backgroundColor: 'transparent',
        color: color,
        borderColor: color,
      };

    case 'subtle':
    default:
      // Subtle transparent background with matching border and darkened text
      return {
        backgroundColor: `${color}18`, // ~9% opacity
        borderColor: `${color}40`,     // ~25% opacity
        color: color,
      };
  }
}
