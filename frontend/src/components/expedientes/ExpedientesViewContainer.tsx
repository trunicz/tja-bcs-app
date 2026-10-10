/**
 * frontend/src/components/expedientes/ExpedientesViewContainer.tsx
 * TJA BCS - Master Multi-View Container for Expedientes (Table, Kanban, Calendar)
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Table as TableIcon,
  Kanban as KanbanIcon,
  Calendar as CalendarIcon,
  Search,
  Plus,
  RefreshCw,
  FolderOpen,
  X,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { hasPermission, subscribeAuthChange } from '../../lib/auth';
import ExpedientesTable from './ExpedientesTable';
import ExpedientesKanban from './ExpedientesKanban';
import ExpedientesCalendar from './ExpedientesCalendar';
import { Skeleton, SkeletonTableRow } from '../common/Skeleton';

export type ViewMode = 'table' | 'kanban' | 'calendar';

export interface ExpedienteItem {
  id: number;
  folio: string;
  consecutivo: number;
  anio: number;
  fechaIngreso: string;
  fechaUltimoMovimiento: string;
  notas: string | null;
  tipoAsuntoId: number;
  tipoAsunto?: { id: number; nombre: string };
  leyId: number;
  ley?: { id: number; nombre: string };
  salaId: number;
  sala?: { id: number; nombre: string };
  estatusId: number;
  estatus?: { id: number; codigo: string; nombre: string };
  subEstatusId: number;
  subEstatus?: { id: number; codigo: number; nombre: string; responsable?: string | null };
}

export interface AudienciaItem {
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
  sala?: { id: number; nombre: string };
  usuarioId?: number | null;
  usuario?: {
    id: number;
    nombre: string;
    correo: string;
    colorEmpleado?: string;
  };
}

export interface CatalogosData {
  salas: Array<{ id: number; nombre: string }>;
  estatus: Array<{ id: number; codigo: string; nombre: string; subEstatus: Array<{ id: number; codigo: number; nombre: string; responsable?: string }> }>;
  leyes: Array<{ id: number; nombre: string }>;
  tipos: Array<{ id: number; nombre: string }>;
  usuarios: Array<{ id: number; nombre: string; correo: string; colorEmpleado?: string; rol?: { nombre: string }; salaId?: number | null }>;
}

export default function ExpedientesViewContainer() {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<ViewMode>('table');

  const [expedientes, setExpedientes] = useState<ExpedienteItem[]>([]);
  const [audiencias, setAudiencias] = useState<AudienciaItem[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogosData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSala, setSelectedSala] = useState<string>('todas');
  const [selectedEstatus, setSelectedEstatus] = useState<string>('todos');

  // Guard permission evaluation until after mount to guarantee SSR HTML matches initial client hydration
  const canCreate = isMounted && hasPermission('expedientes:create');

  // Change view and persist preference
  const handleViewChange = (view: ViewMode) => {
    setActiveView(view);
    try {
      localStorage.setItem('tja_expedientes_active_view', view);
    } catch {
      // Ignore storage exception
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [expRes, audRes, catRes] = await Promise.all([
        apiFetch('/api/expedientes'),
        apiFetch('/api/audiencias'),
        apiFetch('/api/catalogos'),
      ]);

      if (!expRes.ok) throw new Error(`Error al consultar expedientes (HTTP ${expRes.status})`);
      if (!catRes.ok) throw new Error(`Error al consultar catálogos (HTTP ${catRes.status})`);

      const expData = await expRes.json();
      const audData = audRes.ok ? await audRes.json() : [];
      const catData = await catRes.json();

      setExpedientes(Array.isArray(expData) ? expData : []);
      setAudiencias(Array.isArray(audData) ? audData : []);
      setCatalogos(catData);
    } catch (err: any) {
      console.error('[ExpedientesViewContainer] Error cargando datos:', err);
      setError(err.message || 'Error de conexión con el servidor judicial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);

    // Restore view preference from localStorage post-mount
    try {
      const stored = localStorage.getItem('tja_expedientes_active_view') as ViewMode | null;
      if (stored === 'table' || stored === 'kanban' || stored === 'calendar') {
        setActiveView(stored);
      }
    } catch {
      // Ignore storage exception
    }

    const unsubAuth = subscribeAuthChange(() => {
      // Trigger re-render upon session update or impersonation switch
      setIsMounted((prev) => (!prev ? true : prev));
    });

    loadData();

    return () => {
      unsubAuth();
    };
  }, []);

  // Filtered dataset
  const filteredExpedientes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return expedientes.filter((exp) => {
      // Search term matching
      if (term) {
        const folioMatch = exp.folio?.toLowerCase().includes(term);
        const salaMatch = exp.sala?.nombre?.toLowerCase().includes(term);
        const tipoMatch = exp.tipoAsunto?.nombre?.toLowerCase().includes(term);
        const leyMatch = exp.ley?.nombre?.toLowerCase().includes(term);
        const notasMatch = exp.notas?.toLowerCase().includes(term);
        const subEstatusMatch = exp.subEstatus?.nombre?.toLowerCase().includes(term);
        const respMatch = exp.subEstatus?.responsable?.toLowerCase().includes(term);
        if (!folioMatch && !salaMatch && !tipoMatch && !leyMatch && !notasMatch && !subEstatusMatch && !respMatch) {
          return false;
        }
      }

      // Sala filter
      if (selectedSala !== 'todas' && String(exp.salaId) !== selectedSala) {
        return false;
      }

      // Estatus filter
      if (selectedEstatus !== 'todos' && String(exp.estatusId) !== selectedEstatus) {
        return false;
      }

      return true;
    });
  }, [expedientes, searchTerm, selectedSala, selectedEstatus]);

  return (
    <div className="space-y-6">
      {/* Page Header and View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Expedientes Judiciales
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Control procesal, seguimiento de términos y agenda de audiencias
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Segmented Control */}
        <div className="flex items-center gap-3">
          <div
            role="tablist"
            aria-label="Vistas de expedientes"
            className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner"
          >
            {/* Table Button */}
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'table'}
              data-view-target="table"
              data-view="table"
              onClick={() => handleViewChange('table')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'table'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              <span>Tabla</span>
            </button>

            {/* Kanban Button */}
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'kanban'}
              data-view-target="kanban"
              data-view="kanban"
              onClick={() => handleViewChange('kanban')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <KanbanIcon className="w-4 h-4" />
              <span>Kanban</span>
            </button>

            {/* Calendar Button */}
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'calendar'}
              data-view-target="calendar"
              data-view="calendar"
              onClick={() => handleViewChange('calendar')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'calendar'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              <span>Calendario</span>
            </button>
          </div>

          {/* New Case Button */}
          {canCreate && (
            <a
              href="/expedientes/nuevo"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow-md transition-all flex-shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Expediente</span>
            </a>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por folio, sala, tipo, ley o notas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Filters & Status Count */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Sala Selector */}
          <select
            value={selectedSala}
            onChange={(e) => setSelectedSala(e.target.value)}
            className="text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">Todas las Salas</option>
            {catalogos?.salas.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.nombre}
              </option>
            ))}
          </select>

          {/* Estatus Selector */}
          <select
            value={selectedEstatus}
            onChange={(e) => setSelectedEstatus(e.target.value)}
            className="text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos los Estatus</option>
            {catalogos?.estatus.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.nombre}
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors disabled:opacity-50 cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Match Counter Badge */}
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md">
            <span>{filteredExpedientes.length}</span> / <span>{expedientes.length}</span> expedientes
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center justify-between gap-3 text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="text-xs font-bold underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Active View Renderer */}
      {loading && expedientes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <Skeleton variant="text" className="w-48 h-6" />
            <Skeleton variant="rect" className="w-28 h-8 rounded-lg" />
          </div>
          <table className="w-full text-left">
            <tbody>
              <SkeletonTableRow columns={5} />
              <SkeletonTableRow columns={5} />
              <SkeletonTableRow columns={5} />
              <SkeletonTableRow columns={5} />
              <SkeletonTableRow columns={5} />
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {activeView === 'table' && (
            <ExpedientesTable
              expedientes={filteredExpedientes}
              catalogos={catalogos}
              audiencias={audiencias}
            />
          )}

          {activeView === 'kanban' && (
            <ExpedientesKanban
              expedientes={filteredExpedientes}
              catalogos={catalogos}
              audiencias={audiencias}
              onStatusChange={loadData}
            />
          )}

          {activeView === 'calendar' && (
            <ExpedientesCalendar
              expedientes={filteredExpedientes}
              audiencias={audiencias}
              catalogos={catalogos}
            />
          )}
        </>
      )}
    </div>
  );
}
