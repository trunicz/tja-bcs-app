import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { apiFetch } from '../lib/api';

interface Metricas {
  totalExpedientes: number;
  expedientesPorSala: { sala: string; cantidad: number }[];
  expedientesPorEstatus: { estatus: string; cantidad: number }[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function MetricsCharts() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/dashboard/metricas')
      .then(res => {
        if (!res.ok) throw new Error('Error al cargar métricas');
        return res.json();
      })
      .then(data => setMetricas(data))
      .catch(err => console.error("Error cargando metricas:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Cargando métricas...</p>;
  if (!metricas) return <p className="text-red-500">Error al cargar métricas.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
          <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">Total de Expedientes</h3>
          <p className="text-4xl font-bold text-blue-600 dark:text-blue-300 mt-2">{metricas.totalExpedientes}</p>
        </div>
        
        {/* Placeholder for other summary cards */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
          <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">Resueltos este mes</h3>
          <p className="text-4xl font-bold text-green-600 dark:text-green-300 mt-2">-</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
          <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">En Trámite</h3>
          <p className="text-4xl font-bold text-orange-500 mt-2">
            {metricas.expedientesPorEstatus.find(e => e.estatus.toLowerCase().includes('trámite'))?.cantidad || '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-4">Expedientes por Sala</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metricas.expedientesPorSala}>
                <XAxis dataKey="sala" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="cantidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-4">Distribución por Estatus</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metricas.expedientesPorEstatus}
                  dataKey="cantidad"
                  nameKey="estatus"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {metricas.expedientesPorEstatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
