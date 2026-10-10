import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Scale,
  RotateCcw,
  Download,
  Printer,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface StatsResponse {
  totalExpedientes: number;
  porEstatus: Array<{ estatusId: number; estatus: string; codigo: string; count: number; cantidad: number }>;
  porSala: Array<{ salaId: number; sala: string; count: number; cantidad: number }>;
  porMes: Array<{ mes: string; count: number }>;
  porTipoAsunto: Array<{ tipoId: number; tipo: string; count: number }>;
  kpis: {
    totalAudiencias: number;
    audienciasProgramadas: number;
    audienciasCelebradas: number;
    totalRecursos: number;
    totalConcluidos: number;
    totalEnTramite: number;
    tasaConclusion: string;
  };
}

const STATUS_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#6b7280', '#8b5cf6'];

export default function JudicialReports() {
  const [periodo, setPeriodo] = useState<string>('2026');
  const [salaId, setSalaId] = useState<string>('todas');
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (periodo !== 'todos') {
        params.append('ano', periodo);
      }
      if (salaId !== 'todas') {
        params.append('salaId', salaId);
      }

      const res = await apiFetch(`/api/reportes/estadisticas?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [periodo, salaId]);

  const handleExportCSV = () => {
    if (!data) return;
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'REPORTE ESTADÍSTICO - TRIBUNAL DE JUSTICIA ADMINISTRATIVA BCS\n\n';
    csvContent += 'INDICADOR,VALOR\n';
    csvContent += `Total Expedientes,${data.totalExpedientes}\n`;
    csvContent += `Expedientes en Trámite,${data.kpis?.totalEnTramite || 0}\n`;
    csvContent += `Expedientes Concluidos,${data.kpis?.totalConcluidos || 0}\n`;
    csvContent += `Tasa de Conclusión,${data.kpis?.tasaConclusion || '0%'}\n`;
    csvContent += `Total Audiencias,${data.kpis?.totalAudiencias || 0}\n`;
    csvContent += `Total Recursos,${data.kpis?.totalRecursos || 0}\n\n`;

    csvContent += 'ESTATUS PROCESAL,CANTIDAD\n';
    data.porEstatus?.forEach((e) => {
      csvContent += `"${e.estatus}",${e.count}\n`;
    });

    csvContent += '\nSALA JURISDICCIONAL,CANTIDAD\n';
    data.porSala?.forEach((s) => {
      csvContent += `"${s.sala}",${s.count}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_judicial_${periodo}_sala_${salaId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Control Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
          <div className="flex items-center space-x-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Periodo:</label>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            >
              <option value="2026">Año 2026</option>
              <option value="2025">Año 2025</option>
              <option value="todos">Todos los Años</option>
            </select>
          </div>

          {/* Sala selector */}
          <div className="flex items-center space-x-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Sala:</label>
            <select
              value={salaId}
              onChange={(e) => setSalaId(e.target.value)}
              className="text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            >
              <option value="todas">Todas las Salas</option>
              <option value="1">Sala I</option>
              <option value="2">Sala II</option>
            </select>
          </div>
        </div>

        {/* Action Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            className="inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
            title="Recargar datos"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-500 dark:text-slate-400" />
            Actualizar
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500 dark:text-slate-400" />
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-500 dark:text-slate-400" />
            Imprimir
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-16 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-blue-600 dark:border-blue-500 border-t-transparent rounded-full mb-2"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Calculando estadísticas y métricas judiciales...</p>
        </div>
      ) : !data ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400">
          No se pudieron cargar los datos de reporte.
        </div>
      ) : (
        <>
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Total Expedientes
              </span>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-2">{data.totalExpedientes}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Radicados en el periodo</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                Tasa de Conclusión
              </span>
              <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400 mt-2">
                {data.kpis?.tasaConclusion || '0%'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {data.kpis?.totalConcluidos || 0} resueltos definitivamente
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                En Trámite / Instrucción
              </span>
              <p className="text-3xl font-black text-blue-700 dark:text-blue-400 mt-2">
                {data.kpis?.totalEnTramite || 0}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Carga activa en proceso</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                Audiencias Judiciales
              </span>
              <p className="text-3xl font-black text-purple-700 dark:text-purple-400 mt-2">
                {data.kpis?.totalAudiencias || 0}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {data.kpis?.audienciasCelebradas || 0} celebradas con éxito
              </p>
            </div>
          </div>

          {/* Interactive Graphical Breakdowns (Recharts) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Status Breakdown (Donut PieChart) */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Distribución por Estatus Procesal</span>
                </h3>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Gráfica Donut</span>
              </div>

              <div className="h-64 w-full">
                {data.porEstatus?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.porEstatus}
                        dataKey="count"
                        nameKey="estatus"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                      >
                        {data.porEstatus.map((entry, index) => (
                          <Cell
                            key={`cell-${entry.estatusId}`}
                            fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    Sin datos de estatus
                  </div>
                )}
              </div>
            </div>

            {/* 2. Sala Workload Breakdown (BarChart) */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Carga Procesal por Sala</span>
                </h3>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Distribución por Sala</span>
              </div>

              <div className="h-64 w-full">
                {data.porSala?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.porSala}>
                      <XAxis dataKey="sala" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" name="Expedientes" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    Sin datos de salas
                  </div>
                )}
              </div>
            </div>

            {/* 3. Monthly Inflow Trend (AreaChart) */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Radicación Mensual de Asuntos</span>
                </h3>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Tendencia Cronológica</span>
              </div>

              <div className="h-64 w-full">
                {data.porMes?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.porMes}>
                      <defs>
                        <linearGradient id="colorMesRadicacion" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="mes" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Radicados"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorMesRadicacion)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    Sin ingresos registrados en el periodo seleccionado
                  </div>
                )}
              </div>
            </div>

            {/* 4. Matter Type Breakdown (Horizontal BarChart) */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Expedientes por Tipo de Asunto</span>
                </h3>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Materia Jurisdiccional</span>
              </div>

              <div className="h-64 w-full">
                {data.porTipoAsunto?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={data.porTipoAsunto} margin={{ left: 20 }}>
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis dataKey="tipo" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" name="Expedientes" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    Sin tipos de asunto registrados
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
