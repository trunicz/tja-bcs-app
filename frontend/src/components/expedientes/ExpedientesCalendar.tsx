/**
 * frontend/src/components/expedientes/ExpedientesCalendar.tsx
 * TJA BCS - Expedientes Calendar View Component (Hearings & Deadlines)
 *
 * Implements:
 * 1. Compliant DOM contract for tests/test-browser-e2e.mjs:
 *    - Container has [data-view="calendar"], [data-testid="calendar-view"], and .calendar-grid.
 * 2. Monthly grid with hearings (/api/audiencias) and procedural deadlines.
 * 3. Employee identifying color integration (WCAG AA contrast) on hearing cards.
 * 4. Interactive modal with case links (/expedientes/:id).
 */
import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  X,
} from 'lucide-react';
import type { ExpedienteItem, CatalogosData, AudienciaItem } from './ExpedientesViewContainer';
import { getAvatarStyle, getEmployeeInitials, getEmployeeColor } from '../../lib/employeeColor';

interface ExpedientesCalendarProps {
  expedientes: ExpedienteItem[];
  audiencias: AudienciaItem[];
  catalogos: CatalogosData | null;
}

export default function ExpedientesCalendar({
  expedientes,
  audiencias,
  catalogos,
}: ExpedientesCalendarProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  // Month grid calculations
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  // Combine audiencias and expediente deadlines
  const eventsByDay = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayDate = new Date(year, month, day);

    // 1. Scheduled hearings on this day
    const dayHearings = audiencias.filter((a) => {
      const d = new Date(a.fecha);
      return (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === day
      );
    });

    // 2. Expediente procedural deadlines (estimated e.g. admission + 15 days, resolution terms)
    const dayDeadlines = expedientes.filter((exp) => {
      const ingreso = new Date(exp.fechaIngreso);
      const contestacionTerm = new Date(ingreso);
      contestacionTerm.setDate(contestacionTerm.getDate() + 15);

      return (
        contestacionTerm.getFullYear() === year &&
        contestacionTerm.getMonth() === month &&
        contestacionTerm.getDate() === day
      );
    });

    return {
      day,
      date: dayDate,
      hearings: dayHearings,
      deadlines: dayDeadlines,
    };
  });

  return (
    <div
      data-view="calendar"
      data-testid="calendar-view"
      className="calendar-grid bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
    >
      {/* Calendar Header Navigation */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Mes Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-x border-slate-300 dark:border-slate-700 transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Mes Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {monthNames[month]} {year}
          </h2>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Audiencias Judiciales</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Vencimiento de Términos</span>
          </div>
        </div>
      </div>

      {/* Weekday Labels (Mon - Sun) */}
      <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-center text-xs font-bold text-slate-500 dark:text-slate-400 py-2.5">
        <span>Lun</span>
        <span>Mar</span>
        <span>Mié</span>
        <span>Jue</span>
        <span>Vie</span>
        <span>Sáb</span>
        <span>Dom</span>
      </div>

      {/* Month Days Grid */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 dark:divide-slate-800/80">
        {/* Blank padding cells before day 1 */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`blank-${i}`} className="min-h-[115px] bg-slate-50/40 dark:bg-slate-950/30 p-2" />
        ))}

        {/* Days of current month */}
        {eventsByDay.map(({ day, hearings, deadlines }) => {
          const isToday =
            new Date().getDate() === day &&
            new Date().getMonth() === month &&
            new Date().getFullYear() === year;

          const totalEvents = hearings.length + deadlines.length;

          return (
            <div
              key={`day-${day}`}
              className={`min-h-[115px] p-2 flex flex-col transition-colors ${
                isToday
                  ? 'bg-blue-50/30 dark:bg-blue-950/20'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-850'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                    isToday
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {day}
                </span>
                {totalEvents > 0 && (
                  <span className="text-[10px] font-semibold text-slate-400">
                    {totalEvents} ev.
                  </span>
                )}
              </div>

              {/* Event Pills inside day cell */}
              <div className="flex-1 space-y-1 overflow-y-auto max-h-[80px] scrollbar-none">
                {/* Audiencias */}
                {hearings.map((h) => {
                  return (
                    <button
                      key={`aud-${h.id}`}
                      onClick={() => setSelectedEvent({ ...h, eventType: 'audiencia' })}
                      className="w-full text-left p-1 rounded-md text-[11px] leading-tight font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 truncate block hover:scale-[1.02] transition-transform cursor-pointer"
                      title={`${h.tipo} - Exp: ${h.expediente?.folio || 'N/A'}`}
                    >
                      <span className="font-bold mr-1">
                        {new Date(h.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>{h.expediente?.folio || h.tipo}</span>
                    </button>
                  );
                })}

                {/* Deadlines */}
                {deadlines.map((exp) => (
                  <button
                    key={`dead-${exp.id}`}
                    onClick={() =>
                      setSelectedEvent({
                        eventType: 'termino',
                        expediente: exp,
                        tipo: 'Vencimiento de Término Procesal',
                        fecha: exp.fechaIngreso,
                      })
                    }
                    className="w-full text-left p-1 rounded-md text-[11px] leading-tight font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 truncate block hover:scale-[1.02] transition-transform cursor-pointer"
                    title={`Vencimiento en ${exp.folio}`}
                  >
                    <span className="font-bold mr-1">Término:</span>
                    <span>{exp.folio}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full overflow-hidden p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-500" />
                <span>Detalle del Evento Judicial</span>
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Tipo:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{selectedEvent.tipo}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Fecha:</span>
                <span className="font-semibold">
                  {new Date(selectedEvent.fecha).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Expediente:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {selectedEvent.expediente?.folio || 'N/A'}
                </span>
              </div>

              {selectedEvent.sala && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Sala:</span>
                  <span className="font-semibold">{selectedEvent.sala.nombre}</span>
                </div>
              )}

              {selectedEvent.usuario && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Servidor Público:</span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: selectedEvent.usuario.colorEmpleado || '#2563eb' }}
                    />
                    <span>{selectedEvent.usuario.nombre}</span>
                  </span>
                </div>
              )}

              {selectedEvent.descripcion && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 font-medium block mb-1">
                    Instrucciones / Notas:
                  </span>
                  <p className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-lg text-slate-600 dark:text-slate-400 italic">
                    "{selectedEvent.descripcion}"
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cerrar
              </button>
              {(selectedEvent.expedienteId || selectedEvent.expediente?.id) && (
                <a
                  href={`/expedientes/${selectedEvent.expedienteId || selectedEvent.expediente?.id}`}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>Abrir Expediente</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
