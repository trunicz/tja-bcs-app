import React from 'react';
import {
  Scale,
  FileCheck2,
  ClockAlert,
  AlertOctagon,
  ArrowRight,
} from 'lucide-react';
import Skeleton from '../common/Skeleton';

export interface CargaSala {
  salaId: number;
  sala: string;
  activos: number;
  porcentaje: number;
}

export interface ResumenEjecutivoData {
  cargaPorSala: CargaSala[];
  resolucionesPendientes: number;
  audienciasProximas48h: number;
  terminosUrgentes: number;
}

interface ExecutiveSummaryCardsProps {
  resumenEjecutivo?: ResumenEjecutivoData | null;
  loading?: boolean;
}

export default function ExecutiveSummaryCards({
  resumenEjecutivo,
  loading = false,
}: ExecutiveSummaryCardsProps) {
  const cargaSalas = resumenEjecutivo?.cargaPorSala || [];
  const resoluciones = resumenEjecutivo?.resolucionesPendientes ?? 0;
  const audiencias48h = resumenEjecutivo?.audienciasProximas48h ?? 0;
  const terminos = resumenEjecutivo?.terminosUrgentes ?? 0;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      role="region"
      aria-label="Resumen Ejecutivo Jurisdiccional"
    >
      {/* 1. Carga por Sala */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-blue-300 dark:hover:border-blue-700/60 transition-all">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              Carga por Sala
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
              Activos
            </span>
          </div>

          {loading ? (
            <div className="space-y-2 mt-2">
              <Skeleton variant="text" width="100%" height="1.25rem" />
              <Skeleton variant="text" width="80%" height="1.25rem" />
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {cargaSalas.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Sin expedientes activos</p>
              ) : (
                cargaSalas.slice(0, 3).map((s) => (
                  <div key={s.salaId} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[110px]">
                      {s.sala}
                    </span>
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                      <span>{s.activos}</span>
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                        ({s.porcentaje}%)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">Distribución de carga</span>
          <a
            href="/expedientes"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
          >
            Ver salas <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 2. Resoluciones Pendientes (Proyectos) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5" />
              Resoluciones
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
              En Proyecto
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            {loading ? (
              <Skeleton variant="text" width="3.5rem" height="2.25rem" />
            ) : (
              <>
                <span className="text-3xl font-black text-slate-900 dark:text-slate-100">
                  {resoluciones}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  pendientes de dictamen
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            En ponencia para visto bueno y engrose
          </p>
        </div>

        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">Fase de sentencia</span>
          <a
            href="/expedientes"
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
          >
            Revisar <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 3. Audiencias Próximas 48h */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-amber-300 dark:hover:border-amber-700/60 transition-all">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <ClockAlert className="w-3.5 h-3.5" />
              Audiencias 48h
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                audiencias48h > 0
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {audiencias48h > 0 ? 'Próximas' : 'Sin pendientes'}
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            {loading ? (
              <Skeleton variant="text" width="3.5rem" height="2.25rem" />
            ) : (
              <>
                <span className="text-3xl font-black text-slate-900 dark:text-slate-100">
                  {audiencias48h}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  en las próximas 48 horas
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            Comparecencias y desahogos fijados
          </p>
        </div>

        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">Agenda judicial</span>
          <a
            href="/agenda"
            className="font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
          >
            Ver agenda <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 4. Términos Urgentes */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-rose-300 dark:hover:border-rose-700/60 transition-all">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5" />
              Términos Urgentes
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                terminos > 0
                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
              }`}
            >
              {terminos > 0 ? 'Atención Requerida' : 'Al corriente'}
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            {loading ? (
              <Skeleton variant="text" width="3.5rem" height="2.25rem" />
            ) : (
              <>
                <span className="text-3xl font-black text-slate-900 dark:text-slate-100">
                  {terminos}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  asuntos con alerta o plazo
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            Recursos o inactividad superior a 30 días
          </p>
        </div>

        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">Plazos procesales</span>
          <a
            href="/expedientes"
            className="font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-0.5"
          >
            Atender <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
