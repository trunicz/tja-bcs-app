/**
 * frontend/src/components/common/ToastContainer.tsx
 * ============================================================================
 * Floating Global Toast Notification Stack for TJA BCS.
 * Subscribes to 'tja:toast', 'tja:toast-dismiss', and 'tja:toast-clear'.
 * Features:
 *   - Auto-dismiss with configurable timers
 *   - Pause timer on hover
 *   - Visual progress indicator bar
 *   - Manual close button
 *   - Accessible ARIA roles (role="status" / role="alert")
 *   - High contrast dark mode styling (WCAG 2.1 AA)
 *   - Suppressed animations under data-animations="disabled"
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import type { ToastPayload, ToastType } from '../../lib/toast';

const MAX_TOASTS = 5;

interface ActiveToastItem {
  payload: ToastPayload;
  remainingTime: number;
  isPaused: boolean;
  timerStartedAt: number;
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ActiveToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Listen to custom window events
  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastPayload>;
      const payload = customEvent.detail;
      if (!payload || !payload.id || !payload.message) return;

      setToasts((prev) => {
        // Remove existing toast with identical ID if already queued
        const filtered = prev.filter((t) => t.payload.id !== payload.id);
        const newItem: ActiveToastItem = {
          payload,
          remainingTime: payload.duration,
          isPaused: false,
          timerStartedAt: Date.now(),
        };
        // Enforce MAX_TOASTS limit (keep newest)
        const updated = [...filtered, newItem];
        if (updated.length > MAX_TOASTS) {
          const removed = updated.shift();
          if (removed && timeoutsRef.current.has(removed.payload.id)) {
            clearTimeout(timeoutsRef.current.get(removed.payload.id));
            timeoutsRef.current.delete(removed.payload.id);
          }
        }
        return updated;
      });
    };

    const handleDismiss = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const id = customEvent.detail?.id;
      if (id) dismissToast(id);
    };

    const handleClear = () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
      setToasts([]);
    };

    window.addEventListener('tja:toast', handleToast);
    window.addEventListener('tja:toast-dismiss', handleDismiss);
    window.addEventListener('tja:toast-clear', handleClear);

    return () => {
      window.removeEventListener('tja:toast', handleToast);
      window.removeEventListener('tja:toast-dismiss', handleDismiss);
      window.removeEventListener('tja:toast-clear', handleClear);
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
    };
  }, []);

  const dismissToast = (id: string) => {
    if (timeoutsRef.current.has(id)) {
      clearTimeout(timeoutsRef.current.get(id));
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.payload.id !== id));
  };

  // Schedule dismiss timeout for each active toast
  useEffect(() => {
    toasts.forEach((item) => {
      const { id } = item.payload;
      if (item.isPaused) {
        if (timeoutsRef.current.has(id)) {
          clearTimeout(timeoutsRef.current.get(id));
          timeoutsRef.current.delete(id);
        }
        return;
      }

      if (!timeoutsRef.current.has(id) && item.remainingTime > 0) {
        const timeout = setTimeout(() => {
          dismissToast(id);
        }, item.remainingTime);
        timeoutsRef.current.set(id, timeout);
      }
    });
  }, [toasts]);

  const handleMouseEnter = (id: string) => {
    setToasts((prev) =>
      prev.map((item) => {
        if (item.payload.id !== id) return item;
        const elapsed = Date.now() - item.timerStartedAt;
        const remaining = Math.max(0, item.remainingTime - elapsed);
        if (timeoutsRef.current.has(id)) {
          clearTimeout(timeoutsRef.current.get(id));
          timeoutsRef.current.delete(id);
        }
        return {
          ...item,
          isPaused: true,
          remainingTime: remaining,
        };
      })
    );
  };

  const handleMouseLeave = (id: string) => {
    setToasts((prev) =>
      prev.map((item) => {
        if (item.payload.id !== id) return item;
        return {
          ...item,
          isPaused: false,
          timerStartedAt: Date.now(),
        };
      })
    );
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none p-4 sm:p-0 select-none"
      aria-live="polite"
      aria-label="Notificaciones del sistema"
      role="region"
    >
      {toasts.map(({ payload, isPaused, remainingTime }) => {
        const typeConfig = getTypeConfig(payload.type);
        const Icon = typeConfig.icon;
        const ariaRole = payload.type === 'error' || payload.type === 'warning' ? 'alert' : 'status';
        const ariaLive = payload.type === 'error' ? 'assertive' : 'polite';

        return (
          <div
            key={payload.id}
            role={ariaRole}
            aria-live={ariaLive}
            onMouseEnter={() => handleMouseEnter(payload.id)}
            onMouseLeave={() => handleMouseLeave(payload.id)}
            className={`pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-md shadow-lg transition-all duration-200 animate-in slide-in-from-right-4 fade-in ${typeConfig.containerClasses}`}
          >
            <div className="p-3.5 sm:p-4 flex items-start gap-3">
              {/* Type Icon */}
              <div className={`p-1.5 rounded-lg flex-shrink-0 ${typeConfig.iconWrapClasses}`}>
                <Icon className={`w-4 h-4 ${typeConfig.iconClasses}`} />
              </div>

              {/* Text Body */}
              <div className="flex-1 min-w-0 pr-1">
                {payload.title && (
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-4 mb-0.5 truncate">
                    {payload.title}
                  </h4>
                )}
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                  {payload.message}
                </p>

                {/* Optional Action Button */}
                {payload.action && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        payload.action?.onClick();
                        dismissToast(payload.id);
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer"
                    >
                      {payload.action.label}
                    </button>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismissToast(payload.id)}
                className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                aria-label="Cerrar notificación"
                title="Cerrar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Countdown Progress Indicator */}
            {payload.duration > 0 && (
              <div className="h-1 w-full bg-slate-100/40 dark:bg-slate-800/40 overflow-hidden">
                <div
                  className={`h-full ${typeConfig.progressClasses} transition-all`}
                  style={{
                    width: isPaused ? `${(remainingTime / payload.duration) * 100}%` : '0%',
                    transitionDuration: isPaused ? '0ms' : `${remainingTime}ms`,
                    transitionTimingFunction: 'linear',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getTypeConfig(type: ToastType) {
  switch (type) {
    case 'success':
      return {
        icon: CheckCircle2,
        containerClasses: 'bg-white/95 dark:bg-slate-900/95 border-emerald-200 dark:border-emerald-800/80 ring-1 ring-emerald-500/10',
        iconWrapClasses: 'bg-emerald-50 dark:bg-emerald-950/50',
        iconClasses: 'text-emerald-600 dark:text-emerald-400',
        progressClasses: 'bg-emerald-500',
      };
    case 'error':
      return {
        icon: AlertCircle,
        containerClasses: 'bg-white/95 dark:bg-slate-900/95 border-red-200 dark:border-red-800/80 ring-1 ring-red-500/10',
        iconWrapClasses: 'bg-red-50 dark:bg-red-950/50',
        iconClasses: 'text-red-600 dark:text-red-400',
        progressClasses: 'bg-red-500',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        containerClasses: 'bg-white/95 dark:bg-slate-900/95 border-amber-200 dark:border-amber-800/80 ring-1 ring-amber-500/10',
        iconWrapClasses: 'bg-amber-50 dark:bg-amber-950/50',
        iconClasses: 'text-amber-600 dark:text-amber-400',
        progressClasses: 'bg-amber-500',
      };
    case 'info':
    default:
      return {
        icon: Info,
        containerClasses: 'bg-white/95 dark:bg-slate-900/95 border-blue-200 dark:border-blue-800/80 ring-1 ring-blue-500/10',
        iconWrapClasses: 'bg-blue-50 dark:bg-blue-950/50',
        iconClasses: 'text-blue-600 dark:text-blue-400',
        progressClasses: 'bg-blue-500',
      };
  }
}
