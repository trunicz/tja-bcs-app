/**
 * frontend/src/components/expedientes/ExpedientesTable.tsx
 * TJA BCS - Expedientes Table View Component
 *
 * Implements:
 * 1. Compliant DOM contract for tests/test-browser-e2e.mjs:
 *    - Has <table> element and [data-view="table"] container.
 *    - Has <tbody> with <tr> rows and [data-expediente-row] attributes.
 * 2. Employee identifying color integration via employeeColor.ts (WCAG AA contrast).
 * 3. Sorting by Folio, Fecha, Sala, Estatus.
 * 4. Urgency indicator chips.
 */
import React, { useState, useMemo } from 'react';
import {
  Eye,
  FileText,
  Clock,
  ArrowUpDown,
  Archive,
  FileEdit,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { ExpedienteItem, CatalogosData, AudienciaItem } from './ExpedientesViewContainer';
import { getAvatarStyle, getEmployeeInitials, getEmployeeColor } from '../../lib/employeeColor';
import Skeleton from '../common/Skeleton';

interface ExpedientesTableProps {
  expedientes?: ExpedienteItem[];
  catalogos: CatalogosData | null;
  audiencias: AudienciaItem[];
  loading?: boolean;
}

type SortField = 'folio' | 'fechaIngreso' | 'sala' | 'estatus';
type SortDirection = 'asc' | 'desc';

export default function ExpedientesTable({
  expedientes = [],
  catalogos,
  audiencias,
  loading = false,
}: ExpedientesTableProps) {
  const [sortField, setSortField] = useState<SortField>('fechaIngreso');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper for Status Badge Styling
  const getStatusBadge = (codigo: string = '') => {
    const code = codigo.toUpperCase();
    if (code.includes('TRÁMITE') || code.includes('TRAMITE')) {
      return {
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
        icon: <FileEdit className="w-3 h-3 mr-1" />,
      };
    }
    if (code.includes('PROYECTO')) {
      return {
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
        icon: <Clock className="w-3 h-3 mr-1" />,
      };
    }
    if (code.includes('CONCLUIDO') || code.includes('SENTENCIA')) {
      return {
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
        icon: <FileText className="w-3 h-3 mr-1" />,
      };
    }
    if (code.includes('ARCHIVO')) {
      return {
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        icon: <Archive className="w-3 h-3 mr-1" />,
      };
    }
    return {
      badgeClass: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      icon: null,
    };
  };

  // Urgency calculator
  const getUrgency = (exp: ExpedienteItem) => {
    const hasUpcomingHearing = audiencias.some(
      (a) => a.expedienteId === exp.id && a.estado === 'programada'
    );
    const daysSinceMove = Math.floor(
      (Date.now() - new Date(exp.fechaUltimoMovimiento).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (hasUpcomingHearing || daysSinceMove > 30) {
      return {
        level: 'urgent',
        label: 'Urgente',
        badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
      };
    }
    if (daysSinceMove > 15) {
      return {
        level: 'warning',
        label: 'Término',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
      };
    }
    return {
      level: 'normal',
      label: 'En Tiempo',
      badgeClass: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700',
    };
  };

  // Find responsible employee in catalog
  const getEmployeeForCase = (exp: ExpedienteItem) => {
    if (!catalogos?.usuarios) return null;
    if (exp.salaId) {
      const match = catalogos.usuarios.find((u) => u.salaId === exp.salaId);
      if (match) return match;
    }
    return catalogos.usuarios[0] || null;
  };

  // Sorted list
  const sorted = useMemo(() => {
    return [...expedientes].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'folio':
          comparison = (a.folio || '').localeCompare(b.folio || '');
          break;
        case 'fechaIngreso':
          comparison = new Date(a.fechaIngreso).getTime() - new Date(b.fechaIngreso).getTime();
          break;
        case 'sala':
          comparison = (a.sala?.nombre || '').localeCompare(b.sala?.nombre || '');
          break;
        case 'estatus':
          comparison = (a.estatus?.nombre || '').localeCompare(b.estatus?.nombre || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [expedientes, sortField, sortDirection]);

  // Paginated list
  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  return (
    <div
      data-view="table"
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden"
    >
      {loading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="p-4">Folio / ID</th>
                <th className="p-4">Sala</th>
                <th className="p-4">Fase Procesal / Sub-Estatus</th>
                <th className="p-4">Responsable</th>
                <th className="p-4">Fecha Ingreso</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <Skeleton variant="table-row" columns={6} count={5} />
            </tbody>
          </table>
        </div>
      ) : sorted.length === 0 ? (
        <div className="p-16 text-center text-slate-500 dark:text-slate-400">
          <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-base font-bold text-slate-700 dark:text-slate-300">
            No se encontraron expedientes
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Ajusta los filtros de búsqueda o sala para ver más resultados.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th
                  onClick={() => handleSort('folio')}
                  className="p-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Folio / ID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('sala')}
                  className="p-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Sala</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('estatus')}
                  className="p-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Fase Procesal / Sub-Estatus</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-4">Responsable</th>
                <th className="p-4">Asunto / Ley</th>
                <th
                  onClick={() => handleSort('fechaIngreso')}
                  className="p-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Fecha Ingreso</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-4 text-center">Término</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginated.map((exp) => {
                const statusBadge = getStatusBadge(exp.estatus?.codigo);
                const urgency = getUrgency(exp);
                const user = getEmployeeForCase(exp);
                const userColor = getEmployeeColor(user);
                const userInitials = getEmployeeInitials(user?.nombre || exp.subEstatus?.responsable || 'TJA');
                const avatarStyle = getAvatarStyle(userColor);

                return (
                  <tr
                    key={exp.id}
                    data-expediente-row
                    data-expediente-id={exp.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    {/* Folio */}
                    <td className="p-4">
                      <a
                        href={`/expedientes/${exp.id}`}
                        className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1"
                      >
                        <span>{exp.folio}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        ID #{exp.id} • Año {exp.anio}
                      </div>
                    </td>

                    {/* Sala */}
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {exp.sala?.nombre || 'Pleno'}
                      </span>
                    </td>

                    {/* Estatus & SubEstatus */}
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.badgeClass}`}
                      >
                        {statusBadge.icon}
                        <span>{exp.estatus?.nombre || 'Trámite'}</span>
                      </span>
                      <div
                        className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[220px] truncate"
                        title={exp.subEstatus?.nombre}
                      >
                        {exp.subEstatus?.nombre || 'En desahogo'}
                      </div>
                    </td>

                    {/* Responsable with Employee Color */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-xs flex-shrink-0"
                          style={avatarStyle}
                          title={user?.nombre || exp.subEstatus?.responsable || 'Servidor Judicial'}
                        >
                          {userInitials}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {user?.nombre || exp.subEstatus?.responsable || 'Asignado'}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {user?.rol?.nombre || 'Ponencia'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Asunto / Ley */}
                    <td className="p-4">
                      <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        {exp.tipoAsunto?.nombre || 'NULIDAD'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {exp.ley?.nombre || 'LPCA'}
                      </div>
                    </td>

                    {/* Fecha Ingreso */}
                    <td className="p-4">
                      <div className="text-xs text-slate-700 dark:text-slate-300">
                        {new Date(exp.fechaIngreso).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </td>

                    {/* Urgencia Flag */}
                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${urgency.badgeClass}`}
                      >
                        {urgency.level === 'urgent' && <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
                        {urgency.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <a
                        href={`/expedientes/${exp.id}`}
                        className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Ver detalle del expediente"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {!loading && sorted.length > 0 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Mostrando{' '}
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {paginated.length}
            </span>{' '}
            de{' '}
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {sorted.length}
            </span>{' '}
            expedientes (Página {currentPage} de {totalPages})
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
