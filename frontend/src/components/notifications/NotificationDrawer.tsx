/**
 * frontend/src/components/notifications/NotificationDrawer.tsx
 * ============================================================================
 * Interactive Slide-over Notification Center Drawer for TJA BCS.
 * Connected to AppHeader notification bell.
 * Features:
 *   - Slide-over panel with smooth backdrop
 *   - Live unread notification count badge
 *   - Quick filter tabs: Todas | No Leídas | Alertas
 *   - 1-click "Marcar como leída" for individual items
 *   - 1-click "Marcar todas como leídas"
 *   - Deep link to associated Expediente folio
 *   - Footer link to full notification center archive (/notificaciones)
 *   - Full dark mode contrast parity (WCAG 2.1 AA)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  X,
  Calendar,
  FileText,
  AlertTriangle,
  Info,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import toast from '../../lib/toast';

export interface NotificationItem {
  id: number;
  titulo: string;
  mensaje: string;
  tipo: string;
  leida: boolean;
  fecha: string;
  expedienteId?: number | null;
  expediente?: {
    id: number;
    folio: string;
  } | null;
}

export interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export default function NotificationDrawer({
  isOpen,
  onClose,
  onUnreadCountChange,
}: NotificationDrawerProps) {
  const [notificaciones, setNotificaciones] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filter, setFilter] = useState<'todas' | 'no-leidas' | 'alertas'>('todas');
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  // Fetch notifications whenever drawer opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/notificaciones?limit=30');
        if (res.ok) {
          const data: NotificationItem[] = await res.json();
          if (isMounted) {
            setNotificaciones(Array.isArray(data) ? data : []);
            const unread = (Array.isArray(data) ? data : []).filter((n) => !n.leida).length;
            if (onUnreadCountChange) onUnreadCountChange(unread);
          }
        }
      } catch (err) {
        console.error('[NotificationDrawer] Error fetching notifications:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Keyboard accessibility: Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Mark single notification as read
  const handleMarkAsRead = async (id: number) => {
    try {
      const res = await apiFetch(`/api/notificaciones/${id}/leida`, { method: 'PATCH' });
      if (res.ok) {
        setNotificaciones((prev) =>
          prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
        );
        const newUnread = notificaciones.filter((n) => n.id !== id && !n.leida).length;
        if (onUnreadCountChange) onUnreadCountChange(newUnread);

        // Emit unread update event for AppHeader sync
        window.dispatchEvent(
          new CustomEvent('tja:unread-notifications-updated', {
            detail: { count: newUnread },
          })
        );
      }
    } catch (err) {
      console.error('[NotificationDrawer] Error marking notification as read:', err);
    }
  };

  // Mark all unread notifications as read
  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAll(true);
      const res = await apiFetch('/api/notificaciones/marcar-todas-leidas', { method: 'PATCH' });
      if (res.ok) {
        setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
        if (onUnreadCountChange) onUnreadCountChange(0);

        window.dispatchEvent(
          new CustomEvent('tja:unread-notifications-updated', {
            detail: { count: 0 },
          })
        );

        toast.success('Todas las notificaciones fueron marcadas como leídas', 'Notificaciones');
      }
    } catch (err) {
      console.error('[NotificationDrawer] Error marking all as read:', err);
      toast.error('No fue posible actualizar las notificaciones', 'Error');
    } finally {
      setMarkingAll(false);
    }
  };

  if (!isOpen) return null;

  const unreadCount = notificaciones.filter((n) => !n.leida).length;

  const filteredItems = notificaciones.filter((item) => {
    if (filter === 'no-leidas') return !item.leida;
    if (filter === 'alertas') {
      const t = (item.tipo || '').toLowerCase();
      return t === 'alerta' || t === 'urgente';
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-drawer-title"
    >
      {/* Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Right Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-250 select-none">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2
                    id="notification-drawer-title"
                    className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
                  >
                    Notificaciones
                  </h2>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800">
                      {unreadCount} nuevas
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Avisos judiciales y actividad procesal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={handleMarkAllAsRead}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Marcar todas como leídas"
                  aria-label="Marcar todas como leídas"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar panel de notificaciones"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={() => setFilter('todas')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filter === 'todas'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              Todas ({notificaciones.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('no-leidas')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filter === 'no-leidas'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              No Leídas ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('alertas')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filter === 'alertas'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              Alertas
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mb-3 text-blue-500" />
                <span className="text-xs">Cargando notificaciones...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center p-12 text-slate-400">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Bell className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Sin notificaciones
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {filter === 'no-leidas'
                    ? 'No tienes notificaciones pendientes por leer.'
                    : 'No hay notificaciones en esta categoría.'}
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const Icon = getNotificationIcon(item.tipo);
                const badgeStyle = getNotificationBadgeStyle(item.tipo);

                return (
                  <div
                    key={item.id}
                    className={`relative p-3.5 rounded-xl border transition-all ${
                      item.leida
                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-80'
                        : 'bg-blue-50/50 dark:bg-slate-800/80 border-blue-200 dark:border-blue-900/60 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`p-2 rounded-lg flex-shrink-0 ${badgeStyle}`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug">
                            {item.titulo}
                          </h4>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {formatRelativeDate(item.fecha)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                          {item.mensaje}
                        </p>

                        {/* Associated Expediente Folio */}
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          {item.expediente?.folio ? (
                            <a
                              href={`/expedientes?buscar=${encodeURIComponent(item.expediente.folio)}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <FileText className="w-3 h-3" />
                              {item.expediente.folio}
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ) : (
                            <span />
                          )}

                          {/* 1-Click Mark as Read */}
                          {!item.leida && (
                            <button
                              type="button"
                              onClick={() => handleMarkAsRead(item.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 cursor-pointer"
                              title="Marcar como leída"
                            >
                              <Check className="w-3 h-3" />
                              Marcar leída
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with Deep Link to Full Archive */}
          <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
            <a
              href="/notificaciones"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
            >
              Ver historial completo de notificaciones
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function getNotificationIcon(tipo: string) {
  switch ((tipo || '').toLowerCase()) {
    case 'audiencia':
      return Calendar;
    case 'expediente':
      return FileText;
    case 'alerta':
    case 'urgente':
      return AlertTriangle;
    case 'sistema':
    default:
      return Info;
  }
}

function getNotificationBadgeStyle(tipo: string) {
  switch ((tipo || '').toLowerCase()) {
    case 'audiencia':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300';
    case 'expediente':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
    case 'alerta':
    case 'urgente':
      return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300';
    default:
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
  }
}

function formatRelativeDate(isoDate: string): string {
  try {
    const timestamp = new Date(isoDate).getTime();
    if (isNaN(timestamp)) return '';
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return 'Hace un momento';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Hace ${diffDays} d`;
    return new Date(isoDate).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
