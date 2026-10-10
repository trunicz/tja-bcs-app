/**
 * frontend/src/components/common/Skeleton.tsx
 * TJA BCS - Unified Skeleton Loader Component
 *
 * Implements:
 * 1. Variants: 'text', 'circular' | 'avatar', 'rectangular' | 'card', 'table-row', 'badge', 'button'.
 * 2. Animations: 'pulse' (opacity oscillation), 'wave' (shimmer gradient), 'none' (static).
 * 3. Theme Integration: Harmonizes with slate design tokens (light: bg-slate-200/80, dark: bg-slate-800/80).
 * 4. Motion Kill-Switch: Complies with html[data-animations="disabled"] and prefers-reduced-motion.
 * 5. SSR & Hydration Safe: 100% deterministic layout, zero DOM/storage branching on initial render.
 */

import React from 'react';

export type SkeletonVariant =
  | 'text'
  | 'circular'
  | 'avatar'
  | 'rectangular'
  | 'card'
  | 'table-row'
  | 'badge'
  | 'button';

export type SkeletonAnimation = 'pulse' | 'wave' | 'none';

export interface SkeletonProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual variant of the skeleton */
  variant?: SkeletonVariant;
  /** Animation style: 'pulse', 'wave' (shimmer), or 'none' */
  animation?: SkeletonAnimation;
  /** Explicit width (e.g. '100%', '4rem', 120) */
  width?: string | number;
  /** Explicit height (e.g. '1.5rem', 24) */
  height?: string | number;
  /** Number of skeleton instances to render (for lists/multi-lines) */
  count?: number;
  /** Number of table columns (only used when variant="table-row") */
  columns?: number;
  /** Optional custom CSS classes */
  className?: string;
  /** Inline style overrides */
  style?: React.CSSProperties;
  /** Semantic HTML tag override */
  as?: React.ElementType;
  /** Accessibility label */
  'aria-label'?: string;
}

// Deterministic widths for multi-row text to prevent hydration mismatches
const DETERMINISTIC_WIDTHS = ['100%', '92%', '84%', '96%', '78%', '88%'];

export function Skeleton({
  variant = 'text',
  animation = 'pulse',
  width,
  height,
  count = 1,
  columns = 5,
  className = '',
  style,
  as: Component,
  'aria-label': ariaLabel = 'Cargando contenido...',
  ...rest
}: SkeletonProps) {
  // 1. Resolve Animation Classes
  let animationClass = '';
  if (animation === 'pulse') {
    animationClass = 'animate-pulse motion-reduce:animate-none';
  } else if (animation === 'wave') {
    animationClass =
      'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/30 dark:before:via-white/10 before:to-transparent motion-reduce:before:hidden';
  }

  // 2. Base Surface Colors (harmonized with light/dark theme tokens)
  const baseColor = 'bg-slate-200/80 dark:bg-slate-800/80';

  // 3. Variant Classes
  let variantClass = '';
  let defaultTag: React.ElementType = 'div';

  switch (variant) {
    case 'text':
      variantClass = 'inline-block h-4 w-full rounded align-middle';
      defaultTag = 'span';
      break;
    case 'circular':
    case 'avatar':
      variantClass = 'rounded-full flex-shrink-0 aspect-square';
      defaultTag = 'div';
      break;
    case 'rectangular':
    case 'card':
      variantClass = 'rounded-xl w-full';
      defaultTag = 'div';
      break;
    case 'badge':
      variantClass = 'inline-block h-5 w-20 rounded-full align-middle';
      defaultTag = 'span';
      break;
    case 'button':
      variantClass = 'inline-block h-8 w-24 rounded-lg align-middle';
      defaultTag = 'div';
      break;
    case 'table-row':
      // Table-row handled separately below
      break;
  }

  const Tag = Component || defaultTag;

  // 4. Handle table-row variant
  if (variant === 'table-row') {
    const rowCount = count > 0 ? count : 1;
    const colCount = columns > 0 ? columns : 5;

    return (
      <>
        {Array.from({ length: rowCount }).map((_, rIdx) => (
          <tr
            key={rIdx}
            className={`border-b border-slate-100 dark:border-slate-800/80 ${className}`}
            style={style}
            role="row"
            aria-busy="true"
          >
            {Array.from({ length: colCount }).map((_, cIdx) => (
              <td key={cIdx} className="p-3">
                <div
                  className={`${baseColor} ${animationClass} h-4 rounded`}
                  style={{
                    width: cIdx === 0 ? '60%' : cIdx === colCount - 1 ? '35%' : DETERMINISTIC_WIDTHS[cIdx % DETERMINISTIC_WIDTHS.length],
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  // 5. Dimension Style Resolution
  const resolvedStyle: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
  };

  // 6. Multi-count list rendering
  if (count > 1) {
    return (
      <div className="space-y-2 w-full" role="status" aria-busy="true" aria-label={ariaLabel}>
        {Array.from({ length: count }).map((_, idx) => (
          <Tag
            key={idx}
            className={`${baseColor} ${variantClass} ${animationClass} ${className}`}
            style={{
              ...resolvedStyle,
              ...(variant === 'text' && !width
                ? { width: DETERMINISTIC_WIDTHS[idx % DETERMINISTIC_WIDTHS.length] }
                : {}),
            }}
            {...rest}
          />
        ))}
      </div>
    );
  }

  // 7. Single element rendering
  return (
    <Tag
      className={`${baseColor} ${variantClass} ${animationClass} ${className}`}
      style={resolvedStyle}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      {...rest}
    />
  );
}

// ============================================================================
// CONVENIENT COMPOSITE SKELETON HELPERS
// ============================================================================

export function SkeletonText(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="text" {...props} />;
}

export function SkeletonAvatar(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="circular" width="2.5rem" height="2.5rem" {...props} />;
}

export function SkeletonCard(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="rectangular" className="min-h-[6rem] p-4" {...props} />;
}

export function SkeletonBadge(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="badge" {...props} />;
}

export function SkeletonTableRow(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="table-row" {...props} />;
}

export default Skeleton;
