import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

interface Notificacion {
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

interface Actividad {
  id: number;
  fecha: string;
  notas: string | null;
  usuario?: {
    nombre: string;
  };
  expediente?: {
    folio: string;
  };
  estatusAnteriorId?: number | null;
  estatusNuevoId?: number;
}

export default function NotificationCenter() {
  const [tab, setTab] = useState<'notificaciones' | 'actividad'>('notificaciones');
  const [filter, setFilter] = useState<'todas' | 'no-leidas' | 'leidas'>('todas');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fetchNotificaciones = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/notificaciones');
      if (res.ok) {
        const data = await res.json();
        setNotificaciones(Array.isArray(data) ? data : []);
        const unread = (Array.isArray(data) ? data : []).filter((n: Notificacion) => !n.leida).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActividad = async () => {
    try {
      const res = await apiFetch('/api/actividad');
      if (res.ok) {
        const data = await res.json();
        setActividades(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error al cargar actividad:', err);
    }
  };

  useEffect(() => {
    fetchNotificaciones();
    fetchActividad();
  }, []);

  const handleMarcarLeida = async (id: number) => {
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/notificaciones/${id}/leida`, { method: 'PATCH' });
      if (res.ok) {
        setNotificaciones((prev) =>
          prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error al marcar leída:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarcarTodasLeidas = async () => {
    try {
      setActionLoading(true);
      const res = await apiFetch('/api/notificaciones/marcar-todas-leidas', { method: 'PATCH' });
      if (res.ok) {
        setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
        setUnreadCount(0);
        setFeedbackMessage('Todas las notificaciones han sido marcadas como leídas.');
        setTimeout(() => setFeedbackMessage(null), 4000);
      }
    } catch (err) {
      console.error('Error al marcar todas leídas:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered notifications
  const filteredNotificaciones = notificaciones.filter((n) => {
    if (filter === 'no-leidas' && n.leida) return false;
    if (filter === 'leidas' && !n.leida) return false;
    if (typeFilter !== 'todos' && n.tipo?.toLowerCase() !== typeFilter.toLowerCase()) return false;
    return true;
  });

  const getBadgeStyle = (tipo: string) => {
    switch (tipo?.toLowerCase()) {
      case 'audiencia':
        return 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'expediente':
        return 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'alerta':
      case 'urgente':
        return 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'sistema':
        return 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setTab('notificaciones')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center ${
              tab === 'notificaciones'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Notificaciones</span>
            {unreadCount > 0 && (
              <span className={`ml-2 px-2 py-0.5 text-xs font-bold rounded-full ${
                tab === 'notificaciones' ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300' : 'bg-blue-600 text-white'
              }`}>
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('actividad')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center ${
              tab === 'actividad'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Bitácora de Auditoría</span>
          </button>
        </div>

        {/* Action Buttons */}
        {tab === 'notificaciones' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarcarTodasLeidas}
              disabled={unreadCount === 0 || actionLoading}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1.5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Marcar todas como leídas
            </button>
            <button
              onClick={fetchNotificaciones}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Actualizar notificaciones"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {feedbackMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm rounded-lg flex items-center">
          <svg className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {feedbackMessage}
        </div>
      )}

      {/* Main Tab Content */}
      {tab === 'notificaciones' ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Sub-Filters */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50">
            {/* Status filters */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              <span className="text-slate-500 dark:text-slate-400 mr-1">Estado:</span>
              <button
                onClick={() => setFilter('todas')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'todas'
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Todas ({notificaciones.length})
              </button>
              <button
                onClick={() => setFilter('no-leidas')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'no-leidas'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                No leídas ({unreadCount})
              </button>
              <button
                onClick={() => setFilter('leidas')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === 'leidas'
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Leídas ({notificaciones.length - unreadCount})
              </button>
            </div>

            {/* Type filters */}
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              <span className="text-slate-500 dark:text-slate-400 mr-1">Tipo:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md px-2.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="todos">Todos los tipos</option>
                <option value="audiencia">Audiencias</option>
                <option value="expediente">Expedientes</option>
                <option value="sistema">Sistema</option>
                <option value="alerta">Alertas</option>
              </select>
            </div>
          </div>

          {/* Notifications List */}
          {loading ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              <div className="inline-block animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
              <p className="text-sm">Cargando notificaciones...</p>
            </div>
          ) : filteredNotificaciones.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">Sin notificaciones</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                No hay alertas que coincidan con los filtros seleccionados actualmente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredNotificaciones.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                    !n.leida ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Status Dot */}
                    <div className="pt-1.5 flex-shrink-0">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${
                          !n.leida ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${getBadgeStyle(
                            n.tipo
                          )}`}
                        >
                          {n.tipo || 'General'}
                        </span>
                        {n.expediente && (
                          <a
                            href={`/expedientes/${n.expediente.id}`}
                            className="inline-flex items-center text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 hover:underline"
                          >
                            Exp: {n.expediente.folio}
                          </a>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(n.fecha).toLocaleString()}
                        </span>
                      </div>

                      <h4 className={`text-sm font-semibold mt-1 ${!n.leida ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200'}`}>
                        {n.titulo}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                        {n.mensaje}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!n.leida && (
                      <button
                        onClick={() => handleMarcarLeida(n.id)}
                        disabled={actionLoading}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100/80 hover:bg-blue-200/80 rounded-md transition-colors"
                        title="Marcar como leída"
                      >
                        Marcar leída
                      </button>
                    )}
                    {n.expedienteId && (
                      <a
                        href={`/expedientes/${n.expedienteId}`}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors"
                      >
                        Ver expediente
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Audit Activity Feed Tab */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Bitácora Global de Movimientos</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoría en tiempo real de transiciones de estatus y apertura de expedientes.
              </p>
            </div>
            <span className="text-xs text-slate-400">Últimos {actividades.length} registros</span>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 divide-y divide-slate-100 dark:divide-slate-800">
            {actividades.map((act) => (
              <div key={act.id} className="pt-3 first:pt-0 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {act.usuario?.nombre ? act.usuario.nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-800 dark:text-slate-100">
                    <span className="font-semibold">{act.usuario?.nombre || 'Usuario'}</span>{' '}
                    {!act.estatusAnteriorId ? 'radicó el expediente' : 'actualizó el expediente'}{' '}
                    <span className="font-semibold text-blue-600 dark:text-blue-300">
                      {act.expediente?.folio || 'Expediente'}
                    </span>
                  </p>
                  {act.notas && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                      {act.notas}
                    </p>
                  )}
                  <span className="text-[11px] text-slate-400 mt-1 inline-block">
                    {new Date(act.fecha).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
