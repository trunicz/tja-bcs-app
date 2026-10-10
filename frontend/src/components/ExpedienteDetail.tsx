import React, { useEffect, useState } from 'react';
import { History, Edit3, ArrowRight, User, Clock, FileText, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { hasPermission } from '../lib/auth';
import toast from '../lib/toast';

interface ExpedienteDetailProps {
  expedienteId: string;
}

export default function ExpedienteDetail({ expedienteId }: ExpedienteDetailProps) {
  const [expediente, setExpediente] = useState<any>(null);
  const [catalogos, setCatalogos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [nuevoEstatus, setNuevoEstatus] = useState('');
  const [nuevoSubEstatus, setNuevoSubEstatus] = useState('');
  const [notas, setNotas] = useState('');

  const canChangeStatus = hasPermission('expedientes:status');

  const fetchData = () => {
    setLoading(true);
    setErrorMessage(null);
    Promise.all([
      apiFetch(`/api/expedientes/${expedienteId}`).then(r => {
        if (!r.ok) throw new Error('Expediente no encontrado o sin acceso');
        return r.json();
      }),
      apiFetch('/api/catalogos').then(r => {
        if (!r.ok) throw new Error('Error al cargar catálogos');
        return r.json();
      })
    ])
      .then(([expData, catData]) => {
        setExpediente(expData);
        setCatalogos(catData);
        setNuevoEstatus(expData.estatusId?.toString() || '');
        setNuevoSubEstatus(expData.subEstatusId?.toString() || '');
      })
      .catch(err => {
        console.error(err);
        setErrorMessage(err.message || 'Error al cargar expediente');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [expedienteId]);

  const handleChangeEstatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChangeStatus) {
      toast.warning('No cuentas con permisos para modificar el estatus de este expediente.', 'Permiso Denegado');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      // NOTE: usuarioId: 1 is completely removed!
      // The backend extracts actor identity from req.user!.id via the Bearer token.
      const res = await apiFetch(`/api/expedientes/${expedienteId}/estatus`, {
        method: 'PUT',
        body: JSON.stringify({
          nuevoEstatusId: parseInt(nuevoEstatus, 10),
          nuevoSubEstatusId: parseInt(nuevoSubEstatus, 10),
          notas: notas.trim() || undefined
        })
      });

      if (res.ok) {
        setNotas('');
        fetchData();
        toast.success('Estatus procesal actualizado exitosamente', 'Movimiento Registrado');
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.error || 'Error al cambiar estatus del expediente', 'Error de Actualización');
      }
    } catch (error) {
      console.error('Error al cambiar estatus:', error);
      toast.error('Error de conexión al intentar actualizar el estatus', 'Fallo de Red');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400">
        <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
        Cargando detalles del expediente...
      </div>
    );
  }

  if (errorMessage || !expediente) {
    return (
      <div className="p-12 text-center text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100">No se pudo cargar el expediente</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{errorMessage || 'Expediente no encontrado o no tiene permisos para consultarlo.'}</p>
        <a href="/expedientes" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          Volver a Expedientes
        </a>
      </div>
    );
  }

  const estatusSeleccionadoCat = catalogos?.estatus?.find((e: any) => e.id.toString() === nuevoEstatus);
  const subEstatusPosibles = estatusSeleccionadoCat ? estatusSeleccionadoCat.subEstatus : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        
        {/* HEADER INFO */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-950/40 rounded-full -mr-16 -mt-16 opacity-50"></div>
          
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 rounded-lg flex items-center justify-center shadow-inner">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">{expediente.folio}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Ingresado el {new Date(expediente.fechaIngreso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Sala</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{expediente.sala?.nombre}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Tipo</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{expediente.tipoAsunto?.nombre}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Ley</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{expediente.ley?.nombre}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Estatus Actual</p>
              <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
                {expediente.estatus?.nombre}
              </span>
            </div>
          </div>
        </div>

        {/* BITÁCORA TIMELINE */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" /> Historial de Movimientos
          </h2>
          
          {!expediente.bitacora || expediente.bitacora.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 italic text-center py-4">No hay historial registrado.</p>
          ) : (
            <div className="relative pl-3">
              {/* Vertical line */}
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700"></div>
              
              <div className="space-y-6">
                {expediente.bitacora.map((mov: any) => {
                  const estatusNuevo = catalogos?.estatus?.find((e: any) => e.id === mov.estatusNuevoId);
                  const subEstatusNuevo = estatusNuevo?.subEstatus?.find((se: any) => se.id === mov.subEstatusNuevoId);
                  
                  return (
                    <div key={mov.id} className="relative pl-8">
                      {/* Timeline dot */}
                      <div className="absolute left-[-5px] top-1 w-4 h-4 rounded-full border-2 border-white bg-blue-500 shadow"></div>
                      
                      <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100">
                              Cambio a: <span className="text-blue-600 dark:text-blue-300">{estatusNuevo?.nombre || `Estatus #${mov.estatusNuevoId}`}</span>
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              {subEstatusNuevo?.nombre || `Etapa #${mov.subEstatusNuevoId}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(mov.fecha).toLocaleDateString()} {new Date(mov.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-xs text-slate-400 flex items-center justify-end gap-1 mt-1">
                              <User className="w-3 h-3" />
                              {mov.usuario?.nombre || 'Sistema'}
                            </p>
                          </div>
                        </div>
                        {mov.notas && (
                          <div className="mt-3 text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 border-l-2 border-l-amber-400">
                            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-2">Nota:</span>
                            {mov.notas}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: ACTUALIZAR ESTATUS */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-6 h-fit sticky top-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Edit3 className="w-5 h-5 text-blue-500" />
          Avanzar Expediente
        </h2>
        
        {canChangeStatus ? (
          <form onSubmit={handleChangeEstatus} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Fase / Estatus General</label>
              <select
                required
                className="w-full border border-slate-300 dark:border-slate-600 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={nuevoEstatus}
                onChange={e => {
                  setNuevoEstatus(e.target.value);
                  setNuevoSubEstatus('');
                }}
              >
                {catalogos?.estatus?.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.codigo}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Sub-Estatus (Etapa)</label>
              <select
                required
                className="w-full border border-slate-300 dark:border-slate-600 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={nuevoSubEstatus}
                onChange={e => setNuevoSubEstatus(e.target.value)}
              >
                <option value="">Seleccione la etapa específica...</option>
                {subEstatusPosibles?.map((se: any) => (
                  <option key={se.id} value={se.id}>{se.nombre}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center justify-between">
                Notas / Acuerdo
                <span className="text-xs font-normal text-slate-400">Opcional</span>
              </label>
              <textarea
                className="w-full border border-slate-300 dark:border-slate-600 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                rows={4}
                placeholder="Ej: Se dictó sentencia definitiva a favor..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </div>
            
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              {submitting ? 'Registrando...' : 'Registrar Movimiento'}
            </button>
          </form>
        ) : (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Acción Restringida</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tu rol actual no cuenta con el permiso <code className="text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">expedientes:status</code> para avanzar este expediente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
