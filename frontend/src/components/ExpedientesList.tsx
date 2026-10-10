import React, { useEffect, useState } from 'react';
import { Search, Filter, Eye, FileText, Clock, Archive, FileEdit, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { hasPermission } from '../lib/auth';

export default function ExpedientesList() {
  const [expedientes, setExpedientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const canCreate = hasPermission('expedientes:create');

  useEffect(() => {
    apiFetch('/api/expedientes')
      .then(res => {
        if (!res.ok) throw new Error('Error al consultar expedientes');
        return res.json();
      })
      .then(data => setExpedientes(data || []))
      .catch(err => console.error("Error:", err))
      .finally(() => setLoading(false));
  }, []);

  const getStatusColor = (codigo: string) => {
    if (codigo.includes('TRÁMITE')) return 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    if (codigo.includes('PROYECTO')) return 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    if (codigo.includes('CONCLUIDOS')) return 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    if (codigo.includes('ARCHIVO')) return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
  };

  const getStatusIcon = (codigo: string) => {
    if (codigo.includes('TRÁMITE')) return <FileEdit className="w-3 h-3 mr-1" />;
    if (codigo.includes('PROYECTO')) return <Clock className="w-3 h-3 mr-1" />;
    if (codigo.includes('CONCLUIDOS')) return <FileText className="w-3 h-3 mr-1" />;
    if (codigo.includes('ARCHIVO')) return <Archive className="w-3 h-3 mr-1" />;
    return null;
  };

  const filtered = expedientes.filter(exp => 
    exp.folio?.toLowerCase().includes(search.toLowerCase()) || 
    exp.sala?.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      
      {/* Top Toolbar */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="relative w-full sm:w-96">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por folio o sala..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <a
              href="/expedientes/nuevo"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Nuevo Expediente
            </a>
          )}
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors bg-white dark:bg-slate-900">
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          Cargando base de datos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400">
          <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-lg font-medium text-slate-700 dark:text-slate-200">No hay expedientes</p>
          <p className="text-sm">No se encontraron expedientes que coincidan con tu búsqueda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-sm tracking-wide text-slate-500 dark:text-slate-400 uppercase">
                <th className="p-4 font-semibold">Folio del Expediente</th>
                <th className="p-4 font-semibold">Sala Asignada</th>
                <th className="p-4 font-semibold">Estatus General</th>
                <th className="p-4 font-semibold">Tipo / Ley</th>
                <th className="p-4 font-semibold">Ingreso</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(exp => (
                <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="p-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                      {exp.folio}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">ID Interno: #{exp.id}</div>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      {exp.sala?.nombre || '-'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(exp.estatus?.codigo || '')}`}>
                      {getStatusIcon(exp.estatus?.codigo || '')}
                      {exp.estatus?.nombre || '-'}
                    </span>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[200px]" title={exp.subEstatus?.nombre}>
                      {exp.subEstatus?.nombre || ''}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-slate-700 dark:text-slate-200">{exp.tipoAsunto?.nombre}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{exp.ley?.nombre}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-slate-700 dark:text-slate-200">{new Date(exp.fechaIngreso).toLocaleDateString()}</div>
                  </td>
                  <td className="p-4 text-right">
                    <a 
                      href={`/expedientes/${exp.id}`} 
                      className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                      title="Ver Detalles"
                    >
                      <Eye className="w-5 h-5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <div>Mostrando <span className="font-semibold text-slate-900 dark:text-slate-100">{filtered.length}</span> registros</div>
        <div className="flex gap-1">
          <button className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50" disabled>Anterior</button>
          <button className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50" disabled>Siguiente</button>
        </div>
      </div>

    </div>
  );
}
