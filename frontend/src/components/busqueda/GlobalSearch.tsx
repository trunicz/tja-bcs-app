import React, { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../../lib/api';

interface ExpedienteResult {
  id: number;
  folio: string;
  consecutivo: number;
  anio: number;
  fechaIngreso: string;
  notas?: string | null;
  sala?: { id: number; nombre: string };
  estatus?: { id: number; nombre: string };
  tipoAsunto?: { id: number; nombre: string };
  ley?: { id: number; nombre: string };
}

export default function GlobalSearch() {
  const [query, setQuery] = useState<string>('');
  const [salaFilter, setSalaFilter] = useState<string>('todas');
  const [results, setResults] = useState<ExpedienteResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Read URL query param on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const q = urlParams.get('q');
      if (q) {
        setQuery(q);
        executeSearch(q, salaFilter);
      }
    }
  }, []);

  // Global keyboard shortcut listener (Ctrl+K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') {
        if (query) {
          setQuery('');
          setResults([]);
          setHasSearched(false);
        }
      }
      if (results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
          e.preventDefault();
          window.location.href = `/expedientes/${results[selectedIndex].id}`;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, query]);

  const executeSearch = async (searchTerm: string, sala: string) => {
    if (!searchTerm.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);
      const params = new URLSearchParams();
      params.append('search', searchTerm.trim());
      if (sala !== 'todas') {
        params.append('salaId', sala);
      }

      const res = await apiFetch(`/api/expedientes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setSelectedIndex(-1);
      }
    } catch (err) {
      console.error('Error al ejecutar búsqueda:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query, salaFilter);
  };

  const handleFilterChange = (newSala: string) => {
    setSalaFilter(newSala);
    if (query.trim()) {
      executeSearch(query, newSala);
    }
  };

  const highlightMatch = (text: string, term: string) => {
    if (!term.trim() || !text) return text;
    const parts = text.split(new RegExp(`(${term})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 text-amber-900 dark:text-amber-300 rounded px-0.5 font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Keyboard Shortcut Cheat-Sheet Banner */}
      <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm border border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <span className="font-semibold text-white">Navegación Rápida por Teclado:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-slate-300">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-slate-200">
              Ctrl + K
            </kbd>
            <span>Buscar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-slate-200">
              ↓ / ↑
            </kbd>
            <span>Navegar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-slate-200">
              Enter
            </kbd>
            <span>Abrir</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono text-slate-200">
              Esc
            </kbd>
            <span>Limpiar</span>
          </span>
        </div>
      </div>

      {/* Main Search Input Form */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por folio (ej: EXP-001/2026), ley, tipo de asunto o palabra clave..."
            className="w-full pl-12 pr-28 py-3.5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 shadow-sm text-sm transition-all"
            autoFocus
          />
          <div className="absolute right-3 flex items-center gap-2">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setHasSearched(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                title="Limpiar"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors"
            >
              Buscar
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Filtrar por Sala:</span>
            <button
              type="button"
              onClick={() => handleFilterChange('todas')}
              className={`px-3 py-1 rounded-full transition-colors ${
                salaFilter === 'todas'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('1')}
              className={`px-3 py-1 rounded-full transition-colors ${
                salaFilter === '1'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Sala I
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange('2')}
              className={`px-3 py-1 rounded-full transition-colors ${
                salaFilter === '2'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Sala II
            </button>
          </div>

          <div className="flex items-center space-x-2 text-slate-400">
            <span>Sugerencias:</span>
            <button
              type="button"
              onClick={() => {
                setQuery('2026');
                executeSearch('2026', salaFilter);
              }}
              className="text-blue-600 dark:text-blue-300 hover:underline"
            >
              2026
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setQuery('Administrativa');
                executeSearch('Administrativa', salaFilter);
              }}
              className="text-blue-600 dark:text-blue-300 hover:underline"
            >
              Administrativa
            </button>
          </div>
        </div>
      </form>

      {/* Results Container */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Buscando coincidencias en el archivo judicial...</p>
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No se encontraron resultados</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            No se encontró ningún expediente para "{query}". Verifique la ortografía o intente con términos más amplios.
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Resultados encontrados: {results.length}</span>
            <span>Presione Enter para ver el expediente seleccionado</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {results.map((exp, index) => {
              const isSelected = index === selectedIndex;
              return (
                <a
                  key={exp.id}
                  href={`/expedientes/${exp.id}`}
                  className={`p-4 block transition-colors ${
                    isSelected ? 'bg-blue-50/80 ring-2 ring-blue-500 ring-inset' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-blue-600 dark:text-blue-300 hover:text-blue-800">
                        {highlightMatch(exp.folio, query)}
                      </span>
                      {exp.estatus && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                          {exp.estatus.nombre}
                        </span>
                      )}
                      {exp.sala && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {exp.sala.nombre}
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-slate-400">
                      Ingreso: {new Date(exp.fechaIngreso).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    {exp.tipoAsunto && (
                      <p>
                        <strong className="text-slate-700 dark:text-slate-200">Materia:</strong> {highlightMatch(exp.tipoAsunto.nombre, query)}
                      </p>
                    )}
                    {exp.ley && (
                      <p>
                        <strong className="text-slate-700 dark:text-slate-200">Ley Aplicable:</strong> {highlightMatch(exp.ley.nombre, query)}
                      </p>
                    )}
                    {exp.notas && (
                      <p className="text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-100 dark:border-slate-800 mt-1">
                        "{highlightMatch(exp.notas, query)}"
                      </p>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        /* Default Search Guidance */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3">
              <span className="text-lg">📁</span>
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Búsqueda por Folio</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ingrese el número de expediente exacto o parcial (ej: "001", "2026", "TJA/01/2026").
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mb-3">
              <span className="text-lg">⚖</span>
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Búsqueda por Materia o Ley</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Consulte expedientes tramitados bajo la Ley de Responsabilidades o el Procedimiento Contencioso.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mb-3">
              <span className="text-lg">🏛</span>
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Filtro por Sala</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Acote su búsqueda únicamente a los expedientes turnados a Sala I o Sala II.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
