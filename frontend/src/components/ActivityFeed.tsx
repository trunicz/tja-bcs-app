import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface Movimiento {
  id: number;
  fecha: string;
  notas: string;
  usuario: {
    nombre: string;
  };
  expediente: {
    folio: string;
  };
  estatusAnteriorId: number | null;
  estatusNuevoId: number;
}

interface Estatus {
  id: number;
  nombre: string;
}

export default function ActivityFeed() {
  const [actividades, setActividades] = useState<Movimiento[]>([]);
  const [estatusMap, setEstatusMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/actividad').then(res => res.json()),
      apiFetch('/api/catalogos').then(res => res.json())
    ])
      .then(([actividadData, catalogosData]) => {
        setActividades(actividadData || []);
        
        const map: Record<number, string> = {};
        if (catalogosData && Array.isArray(catalogosData.estatus)) {
          catalogosData.estatus.forEach((e: Estatus) => {
            map[e.id] = e.nombre;
          });
        }
        setEstatusMap(map);
      })
      .catch(err => console.error("Error cargando actividad:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Cargando actividad reciente...</p>;
  if (actividades.length === 0) return <p className="text-slate-500 dark:text-slate-400">No hay actividad reciente.</p>;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100 flex items-center">
        <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Actividad Reciente (Auditoría)
      </h2>
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {actividades.map((act) => {
          const isCreation = !act.estatusAnteriorId;
          const estatusAnt = act.estatusAnteriorId ? estatusMap[act.estatusAnteriorId] : null;
          const estatusNuevo = estatusMap[act.estatusNuevoId];

          return (
            <div key={act.id} className="flex gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold flex-shrink-0">
                {act.usuario?.nombre ? act.usuario.nombre.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <p className="text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-medium">{act.usuario?.nombre || 'Usuario Desconocido'}</span>
                  {isCreation ? (
                    <> creó el expediente <span className="font-medium text-blue-600 dark:text-blue-300">{act.expediente?.folio || 'Desconocido'}</span></>
                  ) : (
                    <> cambió el estatus del expediente <span className="font-medium text-blue-600 dark:text-blue-300">{act.expediente?.folio || 'Desconocido'}</span> de <span className="font-medium text-slate-600">{estatusAnt || 'Desconocido'}</span> a <span className="font-medium text-slate-900">{estatusNuevo || 'Desconocido'}</span></>
                  )}
                </p>
                {act.notas && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{act.notas}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(act.fecha).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
