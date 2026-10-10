import React, { useEffect, useState } from 'react';
import { Save, User, Mail, Lock, Shield, Building } from 'lucide-react';
import { apiFetch } from '../lib/api';
import toast from '../lib/toast';

export default function CreateUsuario() {
  const [catalogos, setCatalogos] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    nombre: '',
    correo: '',
    password: '',
    rolId: '',
    salaId: '',
  });

  useEffect(() => {
    apiFetch('/api/catalogos')
      .then(res => {
        if (!res.ok) throw new Error('Error al cargar catálogos');
        return res.json();
      })
      .then(data => {
        setCatalogos(data);
        const rolesMap = new Map();
        if (data && Array.isArray(data.usuarios)) {
          data.usuarios.forEach((u: any) => {
            if (u.rol && !rolesMap.has(u.rol.id)) rolesMap.set(u.rol.id, u.rol);
          });
        }
        setRoles(Array.from(rolesMap.values()));
      })
      .catch(err => console.error(err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        toast.success('Usuario registrado con éxito en el sistema', 'Usuario Creado');
        setTimeout(() => { window.location.href = '/usuarios'; }, 300);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Error al registrar el usuario', 'Error de Registro');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión al registrar usuario', 'Fallo de Red');
    }
  };

  if (!catalogos) return <p className="text-center p-12 text-slate-500 dark:text-slate-400">Cargando...</p>;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden max-w-2xl mx-auto">
      <div className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          Datos del Nuevo Empleado
        </h2>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Nombre Completo
            </label>
            <input required type="text" 
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Correo Institucional
            </label>
            <input required type="email" 
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              value={formData.correo} onChange={e => setFormData({...formData, correo: e.target.value})} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Contraseña
            </label>
            <input required type="password" 
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Nivel de Rol
            </label>
            <select required className="w-full border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              value={formData.rolId} onChange={e => setFormData({...formData, rolId: e.target.value})}>
              <option value="">Seleccione rol...</option>
              {roles.map((r:any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Sala Asignada (Opcional)
            </label>
            <select className="w-full border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              value={formData.salaId} onChange={e => setFormData({...formData, salaId: e.target.value})}>
              <option value="">Ninguna / Pleno</option>
              {catalogos.salas?.map((s:any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="pt-6 flex justify-end">
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm cursor-pointer">
            <Save className="w-5 h-5" />
            Crear Usuario
          </button>
        </div>
      </form>
    </div>
  );
}
