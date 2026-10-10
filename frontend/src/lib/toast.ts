/**
 * frontend/src/lib/toast.ts
 * ============================================================================
 * Decoupled Global Toast Client Utility for TJA BCS.
 * Dispatches standard 'tja:toast' CustomEvents to the global event bus.
 * Fully compatible with SSR (safe no-op when window is undefined).
 * ============================================================================
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  duration?: number; // ms. Default: 4000ms for success/info/warning, 5500ms for error
  action?: ToastAction;
}

export interface ToastPayload {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  action?: ToastAction;
  createdAt: number;
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 4500,
  error: 5500,
};

let toastCounter = 0;

function generateToastId(): string {
  toastCounter = (toastCounter + 1) % 100000;
  return `tja_toast_${Date.now()}_${toastCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function parseOptions(optionsOrTitle?: string | ToastOptions): ToastOptions {
  if (typeof optionsOrTitle === 'string') {
    return { title: optionsOrTitle };
  }
  return optionsOrTitle || {};
}

function dispatchToastEvent(type: ToastType, message: string, optionsOrTitle?: string | ToastOptions): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const opts = parseOptions(optionsOrTitle);
  const id = opts.id || generateToastId();
  const duration = typeof opts.duration === 'number' ? opts.duration : DEFAULT_DURATIONS[type];

  const payload: ToastPayload = {
    id,
    type,
    title: opts.title,
    message: String(message || '').trim(),
    duration,
    action: opts.action,
    createdAt: Date.now(),
  };

  try {
    window.dispatchEvent(
      new CustomEvent<ToastPayload>('tja:toast', {
        detail: payload,
        bubbles: true,
        cancelable: true,
      })
    );
  } catch (err) {
    console.warn('[toast] Failed to dispatch toast event:', err);
  }

  return id;
}

export const toast = {
  success(message: string, optionsOrTitle?: string | ToastOptions): string {
    return dispatchToastEvent('success', message, optionsOrTitle);
  },

  error(message: string, optionsOrTitle?: string | ToastOptions): string {
    return dispatchToastEvent('error', message, optionsOrTitle);
  },

  warning(message: string, optionsOrTitle?: string | ToastOptions): string {
    return dispatchToastEvent('warning', message, optionsOrTitle);
  },

  info(message: string, optionsOrTitle?: string | ToastOptions): string {
    return dispatchToastEvent('info', message, optionsOrTitle);
  },

  dismiss(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(
        new CustomEvent<{ id: string }>('tja:toast-dismiss', {
          detail: { id },
          bubbles: true,
        })
      );
    } catch {}
  },

  clearAll(): void {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('tja:toast-clear', { bubbles: true }));
    } catch {}
  },
};

export default toast;
