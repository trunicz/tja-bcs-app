import React, { useEffect, useState } from 'react';
import { Activity, Calendar, FileText, ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function UsuarioDetail({ usuarioId }: { usuarioId: string }) {
  const [actividad, setActividad] = useState<any[]>([]);
  const [catalogos, setCatalogos] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/usuarios/${usuarioId}/actividad`).then(r => r.json()),
      apiFetch('/api/catalogos').then(r => r.json())
    ]).then(([actData, catData]) => {
      setActividad(actData || []);
      setCatalogos(catData);
    }).catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [usuarioId]);

  if (loading) return (
    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
      <div className="w-8 h-8 border-4 border-blue-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      Cargando actividad...
    </div>
  );

  // Extraer información del usuario desde el catálogo general usando su ID (actividad[0]?.usuario o del catálogo de usuarios)
  const usuarioInfo = catalogos?.usuarios?.find((u:any) => u.id.toString() === usuarioId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      
      {/* Panel Izquierdo: Perfil */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 text-center">
          <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 dark:border dark:border-blue-800/50 flex items-center justify-center font-bold text-3xl mx-auto mb-4">
            {usuarioInfo?.nombre?.charAt(0).toUpperCase() || 'U'}
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{usuarioInfo?.nombre || 'Usuario Desconocido'}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{usuarioInfo?.correo}</p>
          
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent dark:border-slate-700">
            {usuarioInfo?.rol?.nombre || 'Sin Rol'}
          </div>
        </div>
      </div>

      {/* Panel Derecho: Actividad (Audit Log) */}
      <div className="lg:col-span-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
            <Activity className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            Últimas acciones realizadas
          </h3>

          {actividad.length === 0 ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8">
              <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p>Este usuario no tiene actividad registrada aún.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {actividad.map((mov:any) => {
                const estatus = catalogos?.estatus?.find((e:any) => e.id === mov.estatusNuevoId);
                const subestatus = estatus?.subEstatus?.find((s:any) => s.id === mov.subEstatusNuevoId);

                return (
                  <div key={mov.id} className="flex gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:shadow-sm dark:hover:bg-slate-800/80 transition-all">
                    <div className="mt-1">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 dark:border dark:border-blue-800/50 flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          Movió el expediente <a href={`/expedientes/${mov.expedienteId}`} className="font-bold text-blue-600 dark:text-blue-400 hover:underline">{mov.expediente?.folio}</a>
                        </p>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap ml-4">
                          {new Date(mov.fecha).toLocaleString('es-MX')}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {estatus?.nombre}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {subestatus?.nombre}
                        </span>
                      </div>

                      {mov.notas && (
                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2 rounded border-l-2 border-slate-300 dark:border-slate-600">
                          "{mov.notas}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
