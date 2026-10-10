/**
 * frontend/src/components/expedientes/ExpedientesKanban.tsx
 * TJA BCS - Expedientes Kanban Board View Component
 *
 * Implements:
 * 1. Native HTML5 Drag-and-Drop (Milestone 3):
 *    - Direct manipulation between 4 judicial columns (Trámite, Proyecto, Concluidos, Archivo).
 *    - Card drag source: draggable={canUpdateStatus && !transitioningId}, onDragStart, onDragEnd,
 *      ghosting opacity-50, border-blue-400, grip handles, cursor-grab/cursor-grabbing.
 *    - Column drop target: onDragOver, onDragEnter, onDragLeave, onDrop, dashed border,
 *      ring-2 ring-blue-500 bg-blue-50/70 dark:bg-blue-950/40 drop feedback, drop placeholder.
 *    - Optimistic UI updates with instant card relocation.
 *    - Real-time API persistence to PUT /api/expedientes/:id/estatus with audit notes.
 *    - Automatic state rollback on API error with global toast notification (tja:toast).
 * 2. Multi-Modal Accessibility:
 *    - Retains linear "Avanzar" button with [title*="Avanzar"] for rapid single-step moves and test assertions.
 *    - Accessible Status Selection Modal for keyboard operators (Enter/Space on card or MoreVertical button).
 * 3. Compliant DOM contract for tests/test-browser-e2e.mjs & tests/test-m4-challenger-stress.mjs:
 *    - Root container: [data-view="kanban"], [data-testid="kanban-board"], .kanban-board.
 *    - 4 Status Columns: [data-column], [data-kanban-column], .kanban-column.
 *    - Cards: [data-column] [data-expediente-id].
 *    - Mathematical card conservation invariant preserved without data loss.
 */
import React, { useState, useEffect } from 'react';
import {
  FileEdit,
  Clock,
  FileText,
  Archive,
  AlertTriangle,
  Calendar,
  ArrowRight,
  MoreVertical,
  CheckCircle2,
  GripVertical,
  X,
} from 'lucide-react';
import type { ExpedienteItem, CatalogosData, AudienciaItem } from './ExpedientesViewContainer';
import { getAvatarStyle, getEmployeeInitials, getEmployeeColor } from '../../lib/employeeColor';
import { apiFetch } from '../../lib/api';
import { hasPermission } from '../../lib/auth';
import toast from '../../lib/toast';

interface ExpedientesKanbanProps {
  expedientes: ExpedienteItem[];
  catalogos: CatalogosData | null;
  audiencias: AudienciaItem[];
  onStatusChange?: () => void;
}

interface KanbanColumnConfig {
  id: string;
  codeMatch: string;
  title: string;
  description: string;
  badgeClass: string;
  headerBorder: string;
  icon: React.ComponentType<{ className?: string }>;
}

const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    id: 'tramite',
    codeMatch: 'TRÁMITE',
    title: 'Trámite / Radicación',
    description: 'Admisión de demanda y desahogo de pruebas',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    headerBorder: 'border-t-4 border-t-blue-500',
    icon: FileEdit,
  },
  {
    id: 'proyecto',
    codeMatch: 'PROYECTO',
    title: 'Instrucción / Proyecto',
    description: 'Cierre de instrucción y elaboración de proyecto',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    headerBorder: 'border-t-4 border-t-amber-500',
    icon: Clock,
  },
  {
    id: 'concluidos',
    codeMatch: 'CONCLUIDOS',
    title: 'Sentencia / Concluidos',
    description: 'Sentencia definitiva dictada o notificada',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    headerBorder: 'border-t-4 border-t-emerald-500',
    icon: FileText,
  },
  {
    id: 'archivo',
    codeMatch: 'ARCHIVO',
    title: 'Concluido / Archivo',
    description: 'Expediente resguardado y archivado',
    badgeClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    headerBorder: 'border-t-4 border-t-slate-500',
    icon: Archive,
  },
];

interface StatusTargetResolution {
  statusId: number;
  statusCode: string;
  statusName: string;
  subEstatusId: number;
  subEstatusNombre: string;
  subEstatusCodigo: number;
  subEstatusResponsable?: string | null;
}

const FALLBACK_STATUS_MAP: Record<string, StatusTargetResolution> = {
  tramite: {
    statusId: 1,
    statusCode: '1.- TRÁMITE',
    statusName: 'Trámite',
    subEstatusId: 1,
    subEstatusNombre: 'Admisión de demanda',
    subEstatusCodigo: 1,
    subEstatusResponsable: 'Isolda / Paul',
  },
  proyecto: {
    statusId: 2,
    statusCode: '2.- PROYECTO',
    statusName: 'Proyecto',
    subEstatusId: 3,
    subEstatusNombre: 'Elaboración de proyecto de resolución',
    subEstatusCodigo: 3,
    subEstatusResponsable: 'Paul',
  },
  concluidos: {
    statusId: 3,
    statusCode: '3.- CONCLUIDOS',
    statusName: 'Concluidos',
    subEstatusId: 4,
    subEstatusNombre: 'Sentencia dictada',
    subEstatusCodigo: 4,
    subEstatusResponsable: 'Estudio y Cuenta',
  },
  archivo: {
    statusId: 4,
    statusCode: '7.- ARCHIVO',
    statusName: 'Archivo',
    subEstatusId: 5,
    subEstatusNombre: 'Expediente cerrado administrativamente',
    subEstatusCodigo: 5,
    subEstatusResponsable: 'Paul',
  },
};

function resolveStatusForColumn(
  columnConfig: KanbanColumnConfig,
  catalogos: CatalogosData | null,
  overrideSubEstatusId?: number
): StatusTargetResolution {
  const fallback = FALLBACK_STATUS_MAP[columnConfig.id] || FALLBACK_STATUS_MAP.tramite;

  if (!catalogos?.estatus) {
    return fallback;
  }

  const catalogStatus = catalogos.estatus.find((s) =>
    s.codigo.toUpperCase().includes(columnConfig.codeMatch)
  );

  if (!catalogStatus) {
    return fallback;
  }

  let selectedSub = catalogStatus.subEstatus?.[0];
  if (overrideSubEstatusId && catalogStatus.subEstatus) {
    const found = catalogStatus.subEstatus.find((sub) => sub.id === overrideSubEstatusId);
    if (found) selectedSub = found;
  }

  return {
    statusId: catalogStatus.id,
    statusCode: catalogStatus.codigo,
    statusName: catalogStatus.nombre,
    subEstatusId: selectedSub?.id || fallback.subEstatusId,
    subEstatusNombre: selectedSub?.nombre || fallback.subEstatusNombre,
    subEstatusCodigo: selectedSub?.codigo || fallback.subEstatusCodigo,
    subEstatusResponsable: selectedSub?.responsable ?? fallback.subEstatusResponsable,
  };
}

export default function ExpedientesKanban({
  expedientes,
  catalogos,
  audiencias,
  onStatusChange,
}: ExpedientesKanbanProps) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [transitioningId, setTransitioningId] = useState<number | null>(null);

  // Optimistic local state for fluid direct manipulation
  const [optimisticExpedientes, setOptimisticExpedientes] = useState<ExpedienteItem[]>(expedientes);

  // Synchronize optimistic state whenever parent prop updates
  useEffect(() => {
    setOptimisticExpedientes(expedientes);
  }, [expedientes]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const canUpdateStatus = isMounted && hasPermission('expedientes:status');

  // Drag-and-drop state
  const [draggedExpedienteId, setDraggedExpedienteId] = useState<number | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Modal status selection state for keyboard accessibility
  const [modalExpediente, setModalExpediente] = useState<ExpedienteItem | null>(null);
  const [modalTargetColId, setModalTargetColId] = useState<string>('tramite');
  const [modalTargetSubEstatusId, setModalTargetSubEstatusId] = useState<number>(1);
  const [modalNotas, setModalNotas] = useState<string>('');

  // Partition expedientes into the 4 columns
  const columnData = KANBAN_COLUMNS.map((col) => {
    const items = optimisticExpedientes.filter((exp) => {
      const code = (exp.estatus?.codigo || '').toUpperCase();
      return code.includes(col.codeMatch);
    });
    return {
      ...col,
      items,
    };
  });

  // Urgency calculator
  const getUrgency = (exp: ExpedienteItem) => {
    const hasHearing = audiencias.find(
      (a) => a.expedienteId === exp.id && a.estado === 'programada'
    );
    const daysSinceMove = Math.floor(
      (Date.now() - new Date(exp.fechaUltimoMovimiento).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (hasHearing || daysSinceMove > 30) {
      return {
        level: 'urgent',
        label: 'Urgente',
        badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
        days: daysSinceMove,
      };
    }
    if (daysSinceMove > 15) {
      return {
        level: 'warning',
        label: 'Término',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
        days: daysSinceMove,
      };
    }
    return {
      level: 'normal',
      label: 'En Tiempo',
      badgeClass: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      days: daysSinceMove,
    };
  };

  // Core status transition executor with optimistic UI & rollback
  const executeStatusTransition = async (
    exp: ExpedienteItem,
    targetCol: KanbanColumnConfig,
    targetResolution: StatusTargetResolution,
    notasAudit: string
  ) => {
    if (!canUpdateStatus) return;

    // Guard: if already in target column, do nothing
    const currentCode = (exp.estatus?.codigo || '').toUpperCase();
    if (currentCode.includes(targetCol.codeMatch)) return;

    // Snapshot previous state for rollback
    const previousSnapshot = [...optimisticExpedientes];

    // 1. Optimistic local update: relocate card immediately in UI
    setOptimisticExpedientes((prev) =>
      prev.map((item) =>
        item.id === exp.id
          ? {
              ...item,
              estatusId: targetResolution.statusId,
              estatus: {
                id: targetResolution.statusId,
                codigo: targetResolution.statusCode,
                nombre: targetResolution.statusName,
              },
              subEstatusId: targetResolution.subEstatusId,
              subEstatus: {
                id: targetResolution.subEstatusId,
                codigo: targetResolution.subEstatusCodigo,
                nombre: targetResolution.subEstatusNombre,
                responsable: targetResolution.subEstatusResponsable || item.subEstatus?.responsable || null,
              },
              fechaUltimoMovimiento: new Date().toISOString(),
            }
          : item
      )
    );

    // 2. Real-time network persistence
    try {
      setTransitioningId(exp.id);
      const res = await apiFetch(`/api/expedientes/${exp.id}/estatus`, {
        method: 'PUT',
        body: JSON.stringify({
          nuevoEstatusId: targetResolution.statusId,
          nuevoSubEstatusId: targetResolution.subEstatusId,
          notas: notasAudit,
        }),
      });

      if (res.ok) {
        // Dispatch success toast
        toast.success(`Expediente ${exp.folio} trasladado a ${targetCol.title}`, {
          title: 'Fase Procesal Actualizada',
          duration: 3500,
        });
        if (onStatusChange) {
          onStatusChange();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al actualizar estatus en el servidor judicial');
      }
    } catch (err: any) {
      console.error('[Kanban] Error al mover expediente:', err);
      // Rollback optimistic state
      setOptimisticExpedientes(previousSnapshot);
      // Dispatch error toast
      toast.error(err.message || 'No se pudo mover el expediente en el servidor. Movimiento revertido.', {
        title: 'Error de Actualización',
        duration: 5000,
      });
    } finally {
      setTransitioningId(null);
    }
  };

  // Quick move to next status via Avanzar button
  const handleQuickAdvance = async (exp: ExpedienteItem) => {
    if (!canUpdateStatus) return;

    // Find next status in pipeline
    const currentIndex = KANBAN_COLUMNS.findIndex((c) =>
      (exp.estatus?.codigo || '').toUpperCase().includes(c.codeMatch)
    );
    if (currentIndex < 0 || currentIndex >= KANBAN_COLUMNS.length - 1) return;

    const nextCol = KANBAN_COLUMNS[currentIndex + 1];
    const targetResolution = resolveStatusForColumn(nextCol, catalogos);

    await executeStatusTransition(
      exp,
      nextCol,
      targetResolution,
      `Avance procesal a fase ${nextCol.title} desde vista Kanban`
    );
  };

  // Drag Source Handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, exp: ExpedienteItem) => {
    if (!canUpdateStatus || transitioningId === exp.id) {
      e.preventDefault();
      return;
    }
    setDraggedExpedienteId(exp.id);
    e.dataTransfer.setData('text/plain', String(exp.id));
    e.dataTransfer.setData('application/json', JSON.stringify({ id: exp.id, folio: exp.folio }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedExpedienteId(null);
    setDragOverColumnId(null);
  };

  // Drop Target Handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverColumnId === columnId) {
        setDragOverColumnId(null);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetCol: KanbanColumnConfig) => {
    e.preventDefault();
    setDragOverColumnId(null);

    const rawId = e.dataTransfer.getData('text/plain');
    const expId = rawId ? parseInt(rawId, 10) : draggedExpedienteId;
    setDraggedExpedienteId(null);

    if (!expId || isNaN(expId) || !canUpdateStatus) return;

    const targetExp = optimisticExpedientes.find((item) => item.id === expId);
    if (!targetExp) return;

    const targetResolution = resolveStatusForColumn(targetCol, catalogos);

    await executeStatusTransition(
      targetExp,
      targetCol,
      targetResolution,
      `Movimiento procesal a fase ${targetCol.title} mediante arrastre en Kanban`
    );
  };

  // Modal helpers for keyboard accessibility
  const openStatusModal = (exp: ExpedienteItem) => {
    setModalExpediente(exp);
    const currentCol = KANBAN_COLUMNS.find((c) =>
      (exp.estatus?.codigo || '').toUpperCase().includes(c.codeMatch)
    );
    setModalTargetColId(currentCol?.id || 'tramite');
    setModalTargetSubEstatusId(exp.subEstatusId || 1);
    setModalNotas('');
  };

  const closeStatusModal = () => {
    setModalExpediente(null);
    setModalNotas('');
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalExpediente) return;

    const targetCol = KANBAN_COLUMNS.find((c) => c.id === modalTargetColId);
    if (!targetCol) return;

    const targetResolution = resolveStatusForColumn(
      targetCol,
      catalogos,
      modalTargetSubEstatusId
    );

    const expToMove = modalExpediente;
    closeStatusModal();

    await executeStatusTransition(
      expToMove,
      targetCol,
      targetResolution,
      modalNotas.trim() || `Cambio de fase procesal a ${targetCol.title} desde modal de estatus`
    );
  };

  // Find dragged expediente object for drop target evaluation
  const draggedExpediente = draggedExpedienteId
    ? optimisticExpedientes.find((e) => e.id === draggedExpedienteId)
    : null;

  return (
    <div
      data-view="kanban"
      data-testid="kanban-board"
      className="kanban-board w-full overflow-x-auto pb-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 min-w-[900px]">
        {columnData.map((col) => {
          const Icon = col.icon;
          const isDropTarget = dragOverColumnId === col.id && draggedExpedienteId !== null;
          const isDraggedFromThisCol = draggedExpediente?.estatus?.codigo
            ? draggedExpediente.estatus.codigo.toUpperCase().includes(col.codeMatch)
            : false;
          const showActiveDropFeedback = isDropTarget && !isDraggedFromThisCol;

          return (
            <div
              key={col.id}
              data-column={col.id}
              data-kanban-column={col.id}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col)}
              className={`kanban-column bg-slate-50 dark:bg-slate-900/60 rounded-2xl border flex flex-col max-h-[800px] ${
                col.headerBorder
              } shadow-xs transition-all duration-150 ${
                showActiveDropFeedback
                  ? 'border-dashed border-2 border-blue-500 ring-2 ring-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/80 rounded-t-xl">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {col.title}
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black ${col.badgeClass}`}
                  >
                    {col.items.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1">
                  {col.description}
                </p>
              </div>

              {/* Column Cards Container */}
              <div className="p-3 space-y-3 flex-1 overflow-y-auto scrollbar-thin">
                {/* Active Drop Placeholder Indicator */}
                {showActiveDropFeedback && (
                  <div
                    data-drop-placeholder="true"
                    className="p-3.5 my-1 border-2 border-dashed border-blue-400 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/60 rounded-xl text-center text-xs font-semibold text-blue-700 dark:text-blue-300 animate-pulse flex items-center justify-center gap-2 shadow-inner"
                  >
                    <ArrowRight className="w-4 h-4 text-blue-500 animate-bounce" />
                    <span>Soltar expediente aquí para mover a {col.title}</span>
                  </div>
                )}

                {col.items.length === 0 && !showActiveDropFeedback ? (
                  <div className="p-8 text-center text-slate-400 dark:text-slate-600 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl my-4">
                    <p className="text-xs font-medium">Sin expedientes en esta fase</p>
                  </div>
                ) : (
                  col.items.map((exp) => {
                    const urgency = getUrgency(exp);
                    const hearing = audiencias.find(
                      (a) => a.expedienteId === exp.id && a.estado === 'programada'
                    );

                    // User identification
                    const user = catalogos?.usuarios.find((u) => u.salaId === exp.salaId) || null;
                    const userColor = getEmployeeColor(user);
                    const userInitials = getEmployeeInitials(user?.nombre || exp.subEstatus?.responsable || 'TJA');
                    const avatarStyle = getAvatarStyle(userColor);

                    const isBeingDragged = draggedExpedienteId === exp.id;

                    return (
                      <div
                        key={exp.id}
                        data-expediente-id={exp.id}
                        draggable={canUpdateStatus && transitioningId !== exp.id}
                        onDragStart={(e) => handleDragStart(e, exp)}
                        onDragEnd={handleDragEnd}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target === e.currentTarget && canUpdateStatus) {
                            e.preventDefault();
                            openStatusModal(exp);
                          }
                        }}
                        tabIndex={canUpdateStatus ? 0 : undefined}
                        role="region"
                        aria-label={`Expediente ${exp.folio}, ${col.title}`}
                        className={`p-4 rounded-xl border shadow-xs transition-all group ${
                          canUpdateStatus ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${
                          isBeingDragged
                            ? 'opacity-50 border-blue-400 ring-2 ring-blue-300 dark:ring-blue-700 scale-[0.98] shadow-md bg-white dark:bg-slate-900'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700'
                        }`}
                      >
                        {/* Top: Grip Handle, Folio and Urgency Badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {canUpdateStatus && (
                              <span
                                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
                                title="Arrastrar para mover entre columnas"
                                aria-label="Arrastrar para mover entre columnas"
                              >
                                <GripVertical className="w-3.5 h-3.5 flex-shrink-0" />
                              </span>
                            )}
                            <a
                              href={`/expedientes/${exp.id}`}
                              className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate"
                            >
                              {exp.folio}
                            </a>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${urgency.badgeClass}`}
                          >
                            {urgency.level === 'urgent' && <AlertTriangle className="w-2.5 h-2.5 mr-0.5 inline" />}
                            {urgency.label}
                          </span>
                        </div>

                        {/* Sala & Type Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold border border-slate-200 dark:border-slate-700">
                            {exp.sala?.nombre || 'Sala I'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                            {exp.tipoAsunto?.nombre || 'NULIDAD'}
                          </span>
                        </div>

                        {/* SubEstatus Description */}
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 bg-slate-50 dark:bg-slate-950/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                          {exp.subEstatus?.nombre || 'Trámite ordinario'}
                        </p>

                        {/* Scheduled Hearing Alert */}
                        {hearing && (
                          <div className="mb-3 p-2 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-lg flex items-center gap-2 text-blue-700 dark:text-blue-300">
                            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                            <div className="min-w-0 text-[10px]">
                              <p className="font-bold truncate">{hearing.tipo}</p>
                              <p className="text-blue-500 dark:text-blue-400">
                                {new Date(hearing.fecha).toLocaleDateString('es-MX', {
                                  month: 'short',
                                  day: 'numeric',
                                })}{' '}
                                • {new Date(hearing.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hrs
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Bottom: Responsible Avatar, Keyboard Action and Advance Button */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs gap-2">
                          {/* Responsible Avatar */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shadow-xs flex-shrink-0"
                              style={avatarStyle}
                              title={user?.nombre || exp.subEstatus?.responsable || 'Servidor Judicial'}
                            >
                              {userInitials}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[80px]">
                              {user?.nombre || exp.subEstatus?.responsable || 'Asignado'}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Modal Selection Trigger (Keyboard Accessibility) */}
                            {canUpdateStatus && (
                              <button
                                type="button"
                                onClick={() => openStatusModal(exp)}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                                title="Cambiar fase procesal"
                                aria-label={`Cambiar fase procesal de ${exp.folio}`}
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Linear Advance Button (preserved for keyboard and test assertions) */}
                            {canUpdateStatus && col.id !== 'archivo' && (
                              <button
                                type="button"
                                onClick={() => handleQuickAdvance(exp)}
                                disabled={transitioningId === exp.id}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                                title="Avanzar a siguiente fase procesal"
                              >
                                <span>Avanzar</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessible Status Selection Modal */}
      {modalExpediente && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-status-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeStatusModal();
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 text-slate-900 dark:text-slate-100 modal-entrance">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 id="modal-status-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Cambiar Fase Procesal
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Expediente {modalExpediente.folio}
                </p>
              </div>
              <button
                type="button"
                onClick={closeStatusModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="mt-4 space-y-4">
              {/* Target Phase Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Fase de Destino
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {KANBAN_COLUMNS.map((col) => {
                    const isSelected = modalTargetColId === col.id;
                    const Icon = col.icon;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          setModalTargetColId(col.id);
                          const res = resolveStatusForColumn(col, catalogos);
                          setModalTargetSubEstatusId(res.subEstatusId);
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{col.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SubEstatus Selector if available */}
              {(() => {
                const selectedCol = KANBAN_COLUMNS.find((c) => c.id === modalTargetColId);
                const catStatus = catalogos?.estatus.find((s) =>
                  selectedCol ? s.codigo.toUpperCase().includes(selectedCol.codeMatch) : false
                );
                if (catStatus && catStatus.subEstatus && catStatus.subEstatus.length > 1) {
                  return (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Sub-Estatus Procesal
                      </label>
                      <select
                        value={modalTargetSubEstatusId}
                        onChange={(e) => setModalTargetSubEstatusId(Number(e.target.value))}
                        className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {catStatus.subEstatus.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.nombre} ({sub.responsable || 'Sin asignar'})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo / Notas del Movimiento (opcional)
                </label>
                <textarea
                  rows={2}
                  value={modalNotas}
                  onChange={(e) => setModalNotas(e.target.value)}
                  placeholder="Observaciones o motivación del cambio de fase..."
                  className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeStatusModal}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={transitioningId === modalExpediente.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Guardar Cambio</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
