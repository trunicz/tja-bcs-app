import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

interface Audiencia {
  id: number;
  fecha: string;
  tipo: string;
  descripcion?: string | null;
  estado: string;
  expedienteId: number;
  expediente?: {
    id: number;
    folio: string;
    estatus?: { id: number; nombre: string };
    tipoAsunto?: { id: number; nombre: string };
  };
  salaId?: number | null;
  sala?: {
    id: number;
    nombre: string;
  };
  usuario?: {
    id: number;
    nombre: string;
    correo: string;
    colorEmpleado?: string;
  };
}

export default function JudicialAgenda() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendario' | 'lista'>('calendario');
  const [salaFilter, setSalaFilter] = useState<string>('todas');
  const [estadoFilter, setEstadoFilter] = useState<string>('todos');
  const [audiencias, setAudiencias] = useState<Audiencia[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedAudiencia, setSelectedAudiencia] = useState<Audiencia | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  const fetchAudiencias = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('ano', year.toString());
      params.append('mes', month.toString());

      if (salaFilter !== 'todas') {
        params.append('salaId', salaFilter);
      }
      if (estadoFilter !== 'todos') {
        params.append('estado', estadoFilter);
      }

      const res = await apiFetch(`/api/audiencias?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAudiencias(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error al consultar audiencias:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudiencias();
  }, [currentDate, salaFilter, estadoFilter]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  // Calendar calculations
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0

  // Filtered by state in memory if needed
  const filteredAudiencias = audiencias.filter((a) => {
    if (estadoFilter !== 'todos' && a.estado.toLowerCase() !== estadoFilter.toLowerCase()) return false;
    return true;
  });

  // Calculate KPIs
  const totalMes = filteredAudiencias.length;
  const programadas = filteredAudiencias.filter((a) => a.estado === 'programada').length;
  const celebradas = filteredAudiencias.filter((a) => a.estado === 'celebrada').length;
  const diferidas = filteredAudiencias.filter((a) => a.estado === 'diferida' || a.estado === 'cancelada').length;

  const getEstadoBadgeClass = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'programada':
        return 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'celebrada':
        return 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'diferida':
        return 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'cancelada':
        return 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total en el Mes</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{totalMes}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-300 uppercase tracking-wider">Programadas</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{programadas}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-300 uppercase tracking-wider">Celebradas</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{celebradas}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-300 uppercase tracking-wider">Diferidas / Canceladas</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{diferidas}</p>
        </div>
      </div>

      {/* Control Navigation & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Month Navigation */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Mes Anterior"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-x border-slate-300 dark:border-slate-600 transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Mes Siguiente"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {monthNames[month - 1]} {year}
          </h2>
        </div>

        {/* Filters and View Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Sala Filter */}
          <select
            value={salaFilter}
            onChange={(e) => setSalaFilter(e.target.value)}
            className="text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          >
            <option value="todas">Todas las Salas</option>
            <option value="1">Sala I</option>
            <option value="2">Sala II</option>
          </select>

          {/* Estado Filter */}
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          >
            <option value="todos">Todos los Estados</option>
            <option value="programada">Programada</option>
            <option value="celebrada">Celebrada</option>
            <option value="diferida">Diferida</option>
            <option value="cancelada">Cancelada</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('calendario')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'calendario'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Mes
            </button>
            <button
              onClick={() => setViewMode('lista')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'lista'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando agenda de audiencias...</p>
        </div>
      ) : viewMode === 'calendario' ? (
        /* Month Calendar Grid */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Days of week header */}
          <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 py-2.5">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sáb</span>
            <span>Dom</span>
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {/* Blank cells before day 1 */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="min-h-[110px] bg-slate-50/50 dark:bg-slate-800/50 p-1.5" />
            ))}

            {/* Day Cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === currentDate.getMonth() &&
                new Date().getFullYear() === currentDate.getFullYear();

              // Find hearings matching this day
              const dayHearings = filteredAudiencias.filter((a) => {
                const aDate = new Date(a.fecha);
                return (
                  aDate.getUTCDate() === day ||
                  aDate.getDate() === day
                );
              });

              return (
                <div
                  key={`day-${day}`}
                  className={`min-h-[110px] p-1.5 flex flex-col transition-colors ${
                    isToday ? 'bg-blue-50/30 dark:bg-blue-950/30' : 'bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {day}
                    </span>
                    {dayHearings.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {dayHearings.length} aud.
                      </span>
                    )}
                  </div>

                  {/* Hearing Badges in Cell */}
                  <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px]">
                    {dayHearings.map((h) => {
                      const timeStr = new Date(h.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <button
                          key={h.id}
                          onClick={() => setSelectedAudiencia(h)}
                          className={`w-full text-left p-1 rounded text-[11px] leading-tight font-medium border truncate block transition-transform hover:scale-[1.02] ${getEstadoBadgeClass(
                            h.estado
                          )}`}
                          title={`${h.tipo} - Exp: ${h.expediente?.folio || 'N/A'}`}
                        >
                          <span className="font-bold mr-1">{timeStr}</span>
                          <span>{h.expediente?.folio || h.tipo}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Chronological List View */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {filteredAudiencias.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400">
              <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No hay audiencias programadas</h3>
              <p className="text-xs text-slate-400 mt-1">No se encontraron eventos para el mes y filtros especificados.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAudiencias.map((aud) => {
                const audDate = new Date(aud.fecha);
                return (
                  <div key={aud.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {/* Date Badge */}
                      <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center flex-shrink-0 text-slate-800 dark:text-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                          {audDate.toLocaleString('es-MX', { month: 'short' })}
                        </span>
                        <span className="text-lg font-black leading-none">
                          {audDate.getDate()}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getEstadoBadgeClass(aud.estado)}`}>
                            {aud.estado}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {audDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hrs
                          </span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {aud.sala?.nombre || 'Sala del Tribunal'}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                          {aud.tipo}
                        </h4>

                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {aud.expediente && (
                            <span>
                              Expediente: <strong className="text-blue-600 dark:text-blue-300 font-semibold">{aud.expediente.folio}</strong>
                            </span>
                          )}
                          {aud.usuario && (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: aud.usuario.colorEmpleado || '#3b82f6' }}
                              />
                              <span>{aud.usuario.nombre}</span>
                            </span>
                          )}
                        </div>

                        {aud.descripcion && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-1 italic">
                            "{aud.descripcion}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => setSelectedAudiencia(aud)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                      >
                        Ver Detalles
                      </button>
                      {aud.expedienteId && (
                        <a
                          href={`/expedientes/${aud.expedienteId}`}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Ir al Expediente
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hearing Detail Modal */}
      {selectedAudiencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full overflow-hidden p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Detalles de la Audiencia Judicial</h3>
              <button
                onClick={() => setSelectedAudiencia(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Estado:</span>
                <span className={`px-2.5 py-1 rounded text-xs font-bold border ${getEstadoBadgeClass(selectedAudiencia.estado)}`}>
                  {selectedAudiencia.estado}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Fecha y Hora:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {new Date(selectedAudiencia.fecha).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Tipo de Audiencia:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedAudiencia.tipo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Sala:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedAudiencia.sala?.nombre || 'Sala del Tribunal'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Expediente Asociado:</span>
                <span className="font-bold text-blue-600 dark:text-blue-300">
                  {selectedAudiencia.expediente?.folio || 'N/A'}
                </span>
              </div>
              {selectedAudiencia.usuario && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Responsable:</span>
                  <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: selectedAudiencia.usuario.colorEmpleado || '#3b82f6' }}
                    />
                    {selectedAudiencia.usuario.nombre}
                  </span>
                </div>
              )}
              {selectedAudiencia.descripcion && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 font-medium block mb-1">Notas / Instrucciones:</span>
                  <p className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-slate-700 dark:text-slate-200 leading-relaxed italic">
                    {selectedAudiencia.descripcion}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setSelectedAudiencia(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              {selectedAudiencia.expedienteId && (
                <a
                  href={`/expedientes/${selectedAudiencia.expedienteId}`}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  Abrir Expediente
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
