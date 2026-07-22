'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listDiagnosticos, updateDiagnostico, type DiagnosticoListItem } from '../../lib/diagnosticos';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';
import DiagnosticoFormModal from './DiagnosticoFormModal';

// Keep in sync with the menu's `w-40` class below.
const MENU_WIDTH = 160;
// Rough height of the 2-item menu — used only to decide whether it should
// flip upward, not to size it (the flip itself uses a CSS transform).
const MENU_HEIGHT_ESTIMATE = 90;

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function NoSymbolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

type StatusFilter = 'all' | 'activo' | 'inactivo';

const DEFAULT_STATUS_FILTER: StatusFilter = 'activo';
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export default function DiagnosticosPage() {
  const [diagnosticos, setDiagnosticos] = useState<DiagnosticoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUpward: boolean } | null>(
    null,
  );
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDiagnostico, setSelectedDiagnostico] = useState<DiagnosticoListItem | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters = searchInput.trim() !== '' || statusFilter !== DEFAULT_STATUS_FILTER;
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Debounce: the input updates `searchInput` instantly for responsive
  // typing, but the value actually sent to the backend (`search`) only
  // updates 350ms after the user stops typing. Resetting `page` here too
  // (instead of a separate effect keyed on `search`) keeps both state
  // changes in one render, avoiding a wasted double-fetch.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Defensive: if the result set shrinks (e.g. deactivating the only item
  // on the last page) and the current page is now past the end, snap back
  // to the last valid page.
  useEffect(() => {
    if (page > 1 && page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPos(null);
  };

  const openMenuFor = (diagnosticoId: number, event: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenuId === diagnosticoId) {
      closeMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const openUpward = window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE;
    setMenuPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.right - MENU_WIDTH,
      openUpward,
    });
    setOpenMenuId(diagnosticoId);
  };

  const loadDiagnosticos = async () => {
    setLoading(true);
    setListError('');
    try {
      const result = await listDiagnosticos({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter,
      });
      setDiagnosticos(result.data);
      setTotal(result.total);
      setActiveCount(result.activeCount);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnosticos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter]);

  const handleToggleActivo = async (diagnostico: DiagnosticoListItem) => {
    closeMenu();
    const activating = !diagnostico.activo;

    if (!activating) {
      const confirmed = await showConfirm({
        title: 'Desactivar diagnóstico',
        text: `¿Seguro que querés desactivar ${diagnostico.descripcion}?`,
        confirmButtonText: 'Sí, desactivar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }

    setTogglingId(diagnostico.id);
    try {
      await updateDiagnostico(diagnostico.id, {
        descripcion: diagnostico.descripcion,
        activo: activating,
      });
      showSuccess(
        activating ? 'Diagnóstico activado' : 'Diagnóstico desactivado',
        `${diagnostico.descripcion} fue ${activating ? 'activado' : 'desactivado'} correctamente.`,
      );
      await loadDiagnosticos();
    } catch (err) {
      showError(
        activating ? 'No se pudo activar el diagnóstico' : 'No se pudo desactivar el diagnóstico',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (openMenuId === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // The menu is positioned in fixed coordinates computed at open time —
    // if the page scrolls or resizes those coordinates go stale, so just
    // close it rather than let it drift away from its trigger button.
    const handleReposition = () => closeMenu();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [openMenuId]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            Diagnósticos
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            Gestioná los diagnósticos del sistema.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedDiagnostico(null);
              setModalOpen(true);
            }}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600"
          >
            Nuevo diagnóstico
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
            {activeCount} diagnóstico{activeCount === 1 ? '' : 's'} activo
            {activeCount === 1 ? '' : 's'} visible{activeCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1">
              <label htmlFor="search" className="text-sm font-medium text-stone-700">
                Buscar
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                  <SearchIcon />
                </span>
                <input
                  id="search"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Descripción..."
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="statusFilter" className="text-sm font-medium text-stone-700">
                Estado
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="all">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pageSize" className="text-sm font-medium text-stone-700">
                Diagnósticos por página
              </label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
              aria-hidden="true"
            />
            Cargando diagnósticos...
          </div>
        ) : listError ? (
          <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{listError}</span>
            <button
              type="button"
              onClick={loadDiagnosticos}
              className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
            >
              Reintentar
            </button>
          </div>
        ) : diagnosticos.length === 0 && total === 0 && !hasActiveFilters ? (
          <div className="p-8 text-center text-sm text-stone-500">
            No hay diagnósticos registrados todavía.
          </div>
        ) : diagnosticos.length === 0 && total === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-stone-500">
            <span>No se encontraron diagnósticos con esos filtros.</span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-rose-600 hover:text-rose-700"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-gray-200">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  #
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Descripción
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Creación
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Estado
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {diagnosticos.map((diagnostico, index) => (
                <tr key={diagnostico.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 text-center text-sm text-stone-500">
                    {(page - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-stone-800">
                    {diagnostico.descripcion}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {diagnostico.creadoPor
                      ? [diagnostico.creadoPor.nombre, diagnostico.creadoPor.apellido]
                          .filter(Boolean)
                          .join(' ') || diagnostico.creadoPor.username
                      : '—'}
                    <span className="block text-xs text-stone-400">
                      {new Date(diagnostico.createdAt).toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        diagnostico.activo
                          ? 'bg-green-100 text-green-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {diagnostico.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <div
                      className="relative inline-block text-left"
                      ref={openMenuId === diagnostico.id ? triggerRef : null}
                    >
                      <button
                        type="button"
                        onClick={(event) => openMenuFor(diagnostico.id, event)}
                        aria-label="Abrir acciones"
                        className="rounded-lg px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                      >
                        ⋯
                      </button>
                      {openMenuId === diagnostico.id &&
                        menuPos &&
                        typeof document !== 'undefined' &&
                        createPortal(
                          <div
                            ref={menuRef}
                            style={{
                              position: 'fixed',
                              top: menuPos.top,
                              left: menuPos.left,
                              width: MENU_WIDTH,
                              transform: menuPos.openUpward ? 'translateY(-100%)' : undefined,
                            }}
                            className="z-50 rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                closeMenu();
                                setSelectedDiagnostico(diagnostico);
                                setModalOpen(true);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                            >
                              <PencilIcon />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActivo(diagnostico)}
                              disabled={togglingId === diagnostico.id}
                              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                                diagnostico.activo
                                  ? 'text-rose-600 hover:bg-rose-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {diagnostico.activo ? (
                                <>
                                  <NoSymbolIcon />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <CheckCircleIcon />
                                  Activar
                                </>
                              )}
                            </button>
                          </div>,
                          document.body,
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !listError && diagnosticos.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-sm text-stone-500 sm:flex-row">
            <span>
              Mostrando {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} de {total} diagnósticos
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-stone-600">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <DiagnosticoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        diagnostico={selectedDiagnostico}
        onSaved={() => {
          setModalOpen(false);
          void loadDiagnosticos();
        }}
      />
    </div>
  );
}
