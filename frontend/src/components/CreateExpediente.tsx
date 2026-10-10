import React, { useEffect, useState } from 'react';
import { Save, Building2, Book, Hash, Calendar, FileText } from 'lucide-react';
import { apiFetch } from '../lib/api';
import toast from '../lib/toast';

export default function CreateExpediente() {
  const [catalogos, setCatalogos] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    folio: '',
    consecutivo: '',
    anio: new Date().getFullYear().toString(),
    fechaIngreso: new Date().toISOString().split('T')[0],
    tipoAsuntoId: '',
    leyId: '',
    salaId: '',
  });

  useEffect(() => {
    apiFetch('/api/catalogos')
      .then(res => {
        if (!res.ok) throw new Error('Error al cargar catálogos');
        return res.json();
      })
      .then(data => setCatalogos(data))
      .catch(err => console.error(err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        estatusId: 1, 
        subEstatusId: 1, 
      };

      const res = await apiFetch('/api/expedientes', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success('Expediente judicial registrado correctamente', 'Expediente Creado');
        setTimeout(() => { window.location.href = '/expedientes'; }, 300);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Error al crear expediente', 'Error de Validación');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión al guardar expediente', 'Fallo de Red');
    }
  };

  if (!catalogos) return (
    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
      <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
      Cargando catálogos del servidor...
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden max-w-4xl mx-auto">
      <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 p-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-300" />
            Captura de Nuevo Expediente
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Ingresa los datos generales para dar de alta un caso en la base de datos.</p>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        
        {/* Sección: Identificación */}
        <div>
          <h3 className="text-sm font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Identificación del Expediente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
                <Hash className="w-4 h-4 text-slate-400" /> Folio Completo
              </label>
              <input required type="text" 
                className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600" 
                value={formData.folio} onChange={e => setFormData({...formData, folio: e.target.value})} 
                placeholder="Ej: 079/2021-LPCA-I" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Fecha de Ingreso
              </label>
              <input required type="date" 
                className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                value={formData.fechaIngreso} onChange={e => setFormData({...formData, fechaIngreso: e.target.value})} />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Número Consecutivo</label>
              <input required type="number" 
                className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                value={formData.consecutivo} onChange={e => setFormData({...formData, consecutivo: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Año</label>
              <input required type="number" 
                className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                value={formData.anio} onChange={e => setFormData({...formData, anio: e.target.value})} />
            </div>
          </div>
        </div>

        {/* Sección: Clasificación */}
        <div>
          <h3 className="text-sm font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Clasificación y Asignación</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" /> Sala Asignada
              </label>
              <select required className="w-full border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-slate-900"
                value={formData.salaId} onChange={e => setFormData({...formData, salaId: e.target.value})}>
                <option value="">Seleccione sala...</option>
                {catalogos.salas?.map((s:any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" /> Tipo de Asunto
              </label>
              <select required className="w-full border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-slate-900"
                value={formData.tipoAsuntoId} onChange={e => setFormData({...formData, tipoAsuntoId: e.target.value})}>
                <option value="">Seleccione tipo...</option>
                {catalogos.tipos?.map((s:any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
                <Book className="w-4 h-4 text-slate-400" /> Ley Aplicable
              </label>
              <select required className="w-full border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-slate-900"
                value={formData.leyId} onChange={e => setFormData({...formData, leyId: e.target.value})}>
                <option value="">Seleccione ley...</option>
                {catalogos.leyes?.map((s:any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-4">
          <a href="/expedientes" className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Cancelar
          </a>
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm cursor-pointer">
            <Save className="w-5 h-5" />
            Guardar Expediente
          </button>
        </div>
      </form>
    </div>
  );
}
