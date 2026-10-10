import React, { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Keyboard,
  HelpCircle,
  Headphones,
  CheckCircle2,
  Clock,
  Shield,
  Layers,
  Download,
  Sparkles,
} from 'lucide-react';
import toast from '../../lib/toast';

interface FaqItem {
  id: string;
  category: 'expedientes' | 'audiencias' | 'seguridad' | 'personalizacion' | 'procesal';
  pregunta: string;
  respuesta: string;
}

interface WorkflowStage {
  id: number;
  nombre: string;
  responsable: string;
  plazo: string;
  descripcion: string;
  acciones: string[];
}

interface ShortcutItem {
  keys: string[];
  desc: string;
  cat: 'Navegación' | 'Expedientes' | 'Sistema';
}

export default function HelpCenter() {
  const [search, setSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'todos' | 'flujos' | 'atajos' | 'faqs'>('todos');
  const [selectedStage, setSelectedStage] = useState<number>(1);
  const [expandedFaq, setExpandedFaq] = useState<string | null>('faq-1');

  // 1. Tribunal Procedural Workflow Stages (7 Stages)
  const workflowStages: WorkflowStage[] = [
    {
      id: 1,
      nombre: '1. Oficialía de Partes',
      responsable: 'Secretaría General / Oficialía',
      plazo: '24 horas hábiles',
      descripcion:
        'Recepción de la demanda física o digital, sellado con fecha/hora de ingreso, verificación de anexos, asignación computarizada del número consecutivo y folio oficial, y turno correspondiente a Sala Unitaria.',
      acciones: [
        'Registro inicial de demandante y autoridad demandada',
        'Generación de folio único oficial (ej. 001/2026-LPCA-I)',
        'Turno aleatorio o compensado a Sala Unitaria',
      ],
    },
    {
      id: 2,
      nombre: '2. Admisión y Notificación',
      responsable: 'Magistrado Instructor / Actuario',
      plazo: '5 días hábiles',
      descripcion:
        'Examen de procedencia de la demanda. Emisión del auto de radicación: admisión formal, prevención para subsanar omisiones (plazo de 5 días) o desechamiento por notoria improcedencia. Emplazamiento legal a las autoridades.',
      acciones: [
        'Dictado del auto de admisión o prevención',
        'Emplazamiento personal o electrónico a demandados',
        'Apertura del expediente judicial físico y electrónico',
      ],
    },
    {
      id: 3,
      nombre: '3. Instrucción y Contestación',
      responsable: 'Secretario de Acuerdos',
      plazo: '30 días (LPCA) / 15 días (LRA)',
      descripcion:
        'Recepción del escrito de contestación de demanda de la autoridad, vistas a la parte actora, desahogo de recursos incidentales (suspensión del acto reclamado), y admisión de medios de convicción (periciales y testimoniales).',
      acciones: [
        'Acuerdo de recepción de contestación de demanda',
        'Tramitación de incidentes de suspensión del acto',
        'Recepción y certificación de pruebas documentales',
      ],
    },
    {
      id: 4,
      nombre: '4. Audiencia de Ley',
      responsable: 'Magistrado y Secretario de Acuerdos',
      plazo: 'Fecha fijada en autos',
      descripcion:
        'Celebración solemne de la audiencia de desahogo de pruebas y formulación de alegatos de las partes. Al concluir, el Magistrado declara cerrada formalmente la instrucción del juicio contencioso.',
      acciones: [
        'Desahogo formal de testimoniales, periciales y ratificaciones',
        'Presentación oral o escrita de alegatos de bien probado',
        'Declaración formal de cierre de instrucción en autos',
      ],
    },
    {
      id: 5,
      nombre: '5. Proyecto de Sentencia',
      responsable: 'Secretario Proyectista / Ponencia',
      plazo: '15 días hábiles',
      descripcion:
        'Turno del expediente al proyectista de estudio y cuenta para formulación del proyecto de sentencia definitiva, analizando agravios, causales de sobreseimiento y legalidad del acto impugnado.',
      acciones: [
        'Elaboración del proyecto de resolución definitiva',
        'Revisión y visto bueno por el Magistrado Instructor',
        'Distribución de copias para sesión de resolución',
      ],
    },
    {
      id: 6,
      nombre: '6. Sentencia y Notificación',
      responsable: 'Sala Unitaria o Pleno Jurisdiccional',
      plazo: 'Inmediato a sesión',
      descripcion:
        'Votación formal y dictado de la sentencia (validez, nulidad lisa y llana, nulidad para efectos o sobreseimiento). Firma de los integrantes de Sala, engrose y notificación electrónica/personal a las partes.',
      acciones: [
        'Firma de sentencia por Magistrado y Secretario',
        'Engrose de resolución definitiva en autos',
        'Cédula de notificación procesal a las partes en juicio',
      ],
    },
    {
      id: 7,
      nombre: '7. Ejecución y Archivo',
      responsable: 'Actuaria / Archivo Judicial',
      plazo: 'Concluido el plazo de impugnación',
      descripcion:
        'Verificación del cumplimiento de la sentencia por la autoridad obligada. Una vez cumplida en su totalidad y fenecido el plazo para juicios de amparo o recursos, se decreta el archivo definitivo del expediente.',
      acciones: [
        'Monitoreo de cumplimiento de condena administrativa',
        'Auto de conclusión y archivo definitivo',
        'Remisión al Archivo Digital del Tribunal',
      ],
    },
  ];

  // 2. Comprehensive Keyboard Shortcuts Catalog (24 commands)
  const shortcuts: ShortcutItem[] = [
    // Navegación (9 comandos)
    { keys: ['Ctrl', 'K'], desc: 'Abrir barra de comandos omnibar (búsqueda global)', cat: 'Navegación' },
    { keys: ['Ctrl', 'B'], desc: 'Alternar / colapsar barra lateral (sidebar)', cat: 'Navegación' },
    { keys: ['G', 'H'], desc: 'Ir al Dashboard / Panel Principal', cat: 'Navegación' },
    { keys: ['G', 'E'], desc: 'Ir al Listado de Expedientes', cat: 'Navegación' },
    { keys: ['G', 'A'], desc: 'Ir a la Agenda de Audiencias', cat: 'Navegación' },
    { keys: ['G', 'R'], desc: 'Ir a Reportes y Estadísticas', cat: 'Navegación' },
    { keys: ['G', 'N'], desc: 'Ir al Centro de Notificaciones', cat: 'Navegación' },
    { keys: ['G', 'U'], desc: 'Ir al Directorio de Usuarios (Admins)', cat: 'Navegación' },
    { keys: ['G', 'C'], desc: 'Ir a Configuración de Roles y Permisos', cat: 'Navegación' },
    // Expedientes (9 comandos)
    { keys: ['N'], desc: 'Registrar nuevo expediente judicial', cat: 'Expedientes' },
    { keys: ['F'], desc: 'Enfocar filtro de búsqueda de expedientes', cat: 'Expedientes' },
    { keys: ['1'], desc: 'Cambiar a vista rápida de Tabla', cat: 'Expedientes' },
    { keys: ['2'], desc: 'Cambiar a vista rápida de Tablero Kanban', cat: 'Expedientes' },
    { keys: ['3'], desc: 'Cambiar a vista rápida de Calendario', cat: 'Expedientes' },
    { keys: ['V', 'T'], desc: 'Atajo secuencial a vista de Tabla', cat: 'Expedientes' },
    { keys: ['V', 'K'], desc: 'Atajo secuencial a vista de Tablero Kanban', cat: 'Expedientes' },
    { keys: ['V', 'C'], desc: 'Atajo secuencial a vista de Calendario', cat: 'Expedientes' },
    { keys: ['Enter'], desc: 'Abrir detalle del expediente seleccionado', cat: 'Expedientes' },
    // Sistema (6 comandos)
    { keys: ['Esc'], desc: 'Cerrar ventanas modales, menús o drawers abiertos', cat: 'Sistema' },
    { keys: ['?'], desc: 'Abrir centro de ayuda y documentación', cat: 'Sistema' },
    { keys: ['P'], desc: 'Abrir panel de personalización de apariencia', cat: 'Sistema' },
    { keys: ['Ctrl', 'P'], desc: 'Imprimir reporte o carátula de expediente', cat: 'Sistema' },
    { keys: ['R'], desc: 'Recargar métricas y datos de la vista activa', cat: 'Sistema' },
    { keys: ['J', 'K'], desc: 'Navegar fila siguiente / anterior en tablas', cat: 'Sistema' },
  ];

  // 3. Extended Judicial FAQs (8 items)
  const faqs: FaqItem[] = [
    {
      id: 'faq-1',
      category: 'expedientes',
      pregunta: '¿Cómo radicar un nuevo expediente en el sistema?',
      respuesta:
        'Para dar de alta un nuevo asunto, acceda a "Expedientes" y presione "+ Nuevo Expediente" (o utilice el atajo "N"). Complete el formulario obligatorio indicando el folio asignado por Oficialía de Partes, sala jurisdiccional, tipo de asunto y ley aplicable. Al guardar, el sistema generará el registro inicial en la bitácora de movimientos vinculando automáticamente su usuario actuante.',
    },
    {
      id: 'faq-2',
      category: 'expedientes',
      pregunta: '¿Quién puede modificar el estatus procesal de un expediente?',
      respuesta:
        'La actualización procesal requiere el permiso granular "expedientes:status". Los roles de Administrador, Magistrado/Sala y Secretario de Acuerdos cuentan con esta facultad de manera predeterminada. Cada cambio exige un registro en bitácora para garantizar la cadena de custodia y trazabilidad.',
    },
    {
      id: 'faq-3',
      category: 'audiencias',
      pregunta: '¿Cómo se programa una audiencia en la agenda judicial?',
      respuesta:
        'En la sección "Agenda", seleccione la fecha en el calendario o presione "+ Nueva Audiencia". Seleccione el expediente al que corresponda la diligencia, el tipo de audiencia (desahogo de pruebas, alegatos, inspección ocular), la sala correspondiente y el horario fijado. Al confirmarse, el sistema emitirá notificaciones a los secretarios y proyectistas asignados.',
    },
    {
      id: 'faq-4',
      category: 'seguridad',
      pregunta: '¿Cómo funciona la opción "Ver Como" (Suplantación de Identidad)?',
      respuesta:
        'La función de suplantación ("Impersonation") es una herramienta exclusiva para Administradores Globales (permiso "impersonate:use") dentro del Directorio de Usuarios (/usuarios). Permite verificar cómo visualiza la plataforma un usuario con privilegios restringidos. Durante la sesión se despliega un banner amarillo permanente con un botón para revertir inmediatamente a la cuenta administrativa.',
    },
    {
      id: 'faq-5',
      category: 'personalizacion',
      pregunta: '¿Cómo se personaliza la apariencia visual del sistema?',
      respuesta:
        'Abra el panel de personalización con el atajo "P" o el ícono de paleta en la cabecera. Es posible alternar entre modo Claro, Oscuro o Automático, elegir entre 7 paletas de color de acento, definir la densidad visual (Cómoda vs Compacta) y reordenar módulos del panel. Los ajustes se guardan en la base de datos y se restauran en cualquier dispositivo.',
    },
    {
      id: 'faq-6',
      category: 'procesal',
      pregunta: '¿Qué leyes rigen los procedimientos del tribunal?',
      respuesta:
        'El TJA BCS sustenta sus resoluciones principalmente en la Ley del Procedimiento Contencioso Administrativo para el Estado de Baja California Sur (LPCA) para juicios ordinarios de nulidad, y en la Ley de Responsabilidades Administrativas del Estado (LRA) para faltas graves de servidores públicos.',
    },
    {
      id: 'faq-7',
      category: 'seguridad',
      pregunta: '¿Cómo se gestionan los roles y permisos de los operadores?',
      respuesta:
        'Los administradores pueden acceder a "Configuración > Roles y Permisos" (/configuracion/roles) para activar o desactivar dinámicamente cualquiera de los 13 permisos oficiales del tribunal, con efecto inmediato en todas las sesiones activas.',
    },
    {
      id: 'faq-8',
      category: 'procesal',
      pregunta: '¿Cómo se asegura la cadena de custodia en el archivo digital?',
      respuesta:
        'Cada movimiento procesal, cambio de estatus o subida de documento queda registrado de manera inmutable en la tabla de bitácora con marca de tiempo UTC, ID de usuario actuante y rol operativo, impidiendo alteraciones retroactivas.',
    },
  ];

  // 4. Unified Multi-Category Search Filtering
  const searchTerm = search.trim().toLowerCase();

  const filteredStages = useMemo(() => {
    if (!searchTerm) return workflowStages;
    return workflowStages.filter(
      (s) =>
        s.nombre.toLowerCase().includes(searchTerm) ||
        s.responsable.toLowerCase().includes(searchTerm) ||
        s.descripcion.toLowerCase().includes(searchTerm) ||
        s.acciones.some((a) => a.toLowerCase().includes(searchTerm))
    );
  }, [searchTerm]);

  const filteredShortcuts = useMemo(() => {
    if (!searchTerm) return shortcuts;
    return shortcuts.filter(
      (sc) =>
        sc.desc.toLowerCase().includes(searchTerm) ||
        sc.keys.some((k) => k.toLowerCase().includes(searchTerm)) ||
        sc.cat.toLowerCase().includes(searchTerm)
    );
  }, [searchTerm]);

  const filteredFaqs = useMemo(() => {
    if (!searchTerm) return faqs;
    return faqs.filter(
      (faq) =>
        faq.pregunta.toLowerCase().includes(searchTerm) ||
        faq.respuesta.toLowerCase().includes(searchTerm) ||
        faq.category.toLowerCase().includes(searchTerm)
    );
  }, [searchTerm]);

  const activeStageData = workflowStages.find((s) => s.id === selectedStage) || workflowStages[0];

  return (
    <div className="space-y-8">
      {/* Search Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 dark:from-blue-900 dark:to-indigo-950 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden border border-blue-600/30 dark:border-blue-800/40">
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10 pointer-events-none">
          <BookOpen className="w-96 h-96" />
        </div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-600/60 dark:bg-blue-800/60 border border-blue-400/30 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-blue-200" />
            <span>Centro de Conocimiento y Guías Oficiales</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">¿En qué podemos orientarle hoy?</h2>
          <p className="mt-2 text-blue-100 text-sm">
            Búsqueda unificada en flujos de juicio contencioso, catálogo de atajos y base de conocimiento del TJA BCS.
          </p>

          <div className="mt-6 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por trámite (ej. Oficialía, Admisión), atajo (ej. Ctrl+K) o pregunta..."
              className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 rounded-2xl shadow-md text-sm focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-500/50 border border-slate-200 dark:border-slate-700"
            />
            <div className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-400">
              <Search className="w-5 h-5" />
            </div>
          </div>

          {searchTerm && (
            <div className="mt-3 flex items-center gap-2 text-xs text-blue-100">
              <span>Resultados encontrados:</span>
              <span className="font-semibold bg-blue-600/50 dark:bg-blue-800/60 px-2 py-0.5 rounded-md">
                {filteredStages.length} Flujos
              </span>
              <span className="font-semibold bg-blue-600/50 dark:bg-blue-800/60 px-2 py-0.5 rounded-md">
                {filteredShortcuts.length} Atajos
              </span>
              <span className="font-semibold bg-blue-600/50 dark:bg-blue-800/60 px-2 py-0.5 rounded-md">
                {filteredFaqs.length} FAQs
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('todos')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'todos'
              ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          Todo el Contenido
        </button>
        <button
          onClick={() => setActiveTab('flujos')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'flujos'
              ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Flujo Procesal Jurisdiccional ({filteredStages.length})
        </button>
        <button
          onClick={() => setActiveTab('atajos')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'atajos'
              ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          Atajos de Teclado ({filteredShortcuts.length})
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'faqs'
              ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Preguntas Frecuentes ({filteredFaqs.length})
        </button>
      </div>

      {/* SECTION 1: Tribunal Procedural Workflow Guide */}
      {(activeTab === 'todos' || activeTab === 'flujos') && (
        <div id="flujo-procesal" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-slate-100 dark:border-slate-800 gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Guía Procesal Jurisdiccional (Ciclo de Vida del Expediente)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ruta procesal reglamentaria desde la presentación en Oficialía hasta la conclusión y archivo definitivo.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800/40 w-fit">
              LPCA / LRA Oficial
            </span>
          </div>

          {/* Interactive Stage Pipeline Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
            {workflowStages.map((stage) => {
              const isSelected = selectedStage === stage.id;
              return (
                <button
                  key={stage.id}
                  onClick={() => setSelectedStage(stage.id)}
                  className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 dark:bg-blue-600 text-white border-blue-600 dark:border-blue-500 shadow-md scale-[1.02]'
                      : 'bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`text-[10px] font-bold block ${isSelected ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'}`}>
                    Fase {stage.id}
                  </span>
                  <span className="text-xs font-bold leading-tight block mt-1 truncate">
                    {stage.nombre.replace(/^\d+\.\s*/, '')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Stage Detail Card */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-slate-800 gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Detalle de la Fase
                </span>
                <h4 className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeStageData.nombre}
                </h4>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  {activeStageData.responsable}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Plazo: {activeStageData.plazo}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
              {activeStageData.descripcion}
            </p>

            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                Actuaciones y requisitos procesales:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {activeStageData.acciones.map((acc, aIdx) => (
                  <li key={aIdx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>{acc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Keyboard Shortcuts Catalog */}
      {(activeTab === 'todos' || activeTab === 'atajos') && (
        <div id="atajos" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Catálogo Completo de Atajos de Teclado</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Comandos directos para agilizar la operación diaria en todo el sistema.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
              {filteredShortcuts.length} comandos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredShortcuts.map((sc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="pr-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    {sc.desc}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    {sc.cat}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {sc.keys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-xs text-xs font-mono font-bold text-slate-800 dark:text-slate-200"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: Frequently Asked Questions (FAQs) */}
      {(activeTab === 'todos' || activeTab === 'faqs') && (
        <div id="faqs" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span>Preguntas Frecuentes y Criterios Operativos</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Respuestas inmediatas a dudas procedimentales y normativas.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
              {filteredFaqs.length} respuestas
            </span>
          </div>

          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isExpanded = expandedFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setExpandedFaq(isExpanded ? null : faq.id)}
                    className="w-full p-4 text-left flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 pr-2">
                      {faq.pregunta}
                    </span>
                    <span className={`text-slate-400 font-bold transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="p-4 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                      {faq.respuesta}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 4: Support & Contact Hub */}
      <div id="soporte" className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Headphones className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Mesa de Ayuda de Tecnologías de la Información</span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Si experimenta interrupciones técnicas o requiere asistencia especializada, contacte al área de soporte:
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              📧 Correo:{' '}
              <a href="mailto:soporte@tjabcs.gob.mx" className="text-blue-600 dark:text-blue-400 hover:underline">
                soporte@tjabcs.gob.mx
              </a>
            </span>
            <span className="flex items-center gap-1.5">
              📞 Teléfono: (612) 123-4567 Ext. 104
            </span>
            <span className="flex items-center gap-1.5">
              🕒 Horario: Lunes a Viernes de 8:00 a 15:00 hrs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              toast.info(
                'Descargando Manual Oficial de Procedimientos SICE-TJA BCS v2.4 (PDF)...',
                'Descarga Iniciada'
              );
            }}
            className="px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar Manual
          </button>
          <button
            onClick={() => {
              const ticketId = `TK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
              toast.success(
                `Solicitud de asistencia enviada al área de soporte técnico del TJA BCS. Ticket #${ticketId}`,
                'Ticket Registrado'
              );
            }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors whitespace-nowrap cursor-pointer"
          >
            Levantar Ticket de Soporte
          </button>
        </div>
      </div>
    </div>
  );
}
