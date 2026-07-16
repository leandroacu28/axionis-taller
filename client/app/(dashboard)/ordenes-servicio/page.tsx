'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  listOrdenesServicio,
  type Estado,
  type OrdenServicioListItem,
} from '../../lib/ordenes-servicio';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h6v6h-6v-6zM14.25 4.5h6v6h-6v-6zM3.75 13.5h6v6h-6v-6zM14.25 13.5h6v6h-6v-6z" />
    </svg>
  );
}

type EstadoFilter = 'all' | Estado;

const DEFAULT_ESTADO_FILTER: EstadoFilter = 'all';
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const ESTADO_LABELS: Record<Estado, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
};

const ESTADO_BADGE_CLASSES: Record<Estado, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  en_proceso: 'bg-sky-100 text-sky-700',
  terminado: 'bg-green-100 text-green-700',
};

const PRIORIDAD_LABELS: Record<OrdenServicioListItem['prioridad'], string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const PRIORIDAD_BADGE_CLASSES: Record<OrdenServicioListItem['prioridad'], string> = {
  normal: 'bg-stone-100 text-stone-600',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-rose-100 text-rose-700',
};

function formatFecha(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function mecanicoLabel(mecanico: OrdenServicioListItem['mecanico']): string {
  const fullName = `${mecanico.nombre ?? ''} ${mecanico.apellido ?? ''}`.trim();
  return fullName || mecanico.username;
}

// fechaIngreso only ever carries a date (the form has no time input, so it's
// always midnight UTC) — the hour shown next to it is createdAt's, the only
// field that actually captures when the order was logged.
function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

type ViewMode = 'tabla' | 'tarjetas';

export default function OrdenesServicioPage() {
  const [ordenes, setOrdenes] = useState<OrdenServicioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>(DEFAULT_ESTADO_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ pendiente: 0, en_proceso: 0, terminado: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('tabla');

  const hasActiveFilters = searchInput.trim() !== '' || estadoFilter !== DEFAULT_ESTADO_FILTER;
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setEstadoFilter(DEFAULT_ESTADO_FILTER);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Debounce: the input updates `searchInput` instantly for responsive
  // typing, but the value actually sent to the backend (`search`) only
  // updates 350ms after the user stops typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Defensive: if the result set shrinks and the current page is now past
  // the end, snap back to the last valid page.
  useEffect(() => {
    if (page > 1 && page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const loadOrdenes = async () => {
    setLoading(true);
    setListError('');
    try {
      const result = await listOrdenesServicio({
        page,
        pageSize,
        search: search || undefined,
        estado: estadoFilter,
      });
      setOrdenes(result.data);
      setTotal(result.total);
      setCounts(result.counts);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, estadoFilter]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            Órdenes de Servicio
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            Gestioná el ingreso y seguimiento de vehículos en el taller.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('tabla')}
              aria-pressed={viewMode === 'tabla'}
              title="Ver como tabla"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'tabla' ? 'bg-rose-50 text-rose-600' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              <TableIcon />
              Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tarjetas')}
              aria-pressed={viewMode === 'tarjetas'}
              title="Ver como tarjetas"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'tarjetas' ? 'bg-rose-50 text-rose-600' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              <CardIcon />
              Tarjetas
            </button>
          </div>
          <Link
            href="/ordenes-servicio/nuevo"
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600"
          >
            Nueva orden
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
            {counts.pendiente} pendiente{counts.pendiente === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
            {counts.en_proceso} en proceso
          </span>
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
            {counts.terminado} terminada{counts.terminado === 1 ? '' : 's'}
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
                  placeholder="Número, cliente o vehículo..."
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="estadoFilter" className="text-sm font-medium text-stone-700">
                Estado
              </label>
              <select
                id="estadoFilter"
                value={estadoFilter}
                onChange={(e) => {
                  setEstadoFilter(e.target.value as EstadoFilter);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="all">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En proceso</option>
                <option value="terminado">Terminado</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pageSize" className="text-sm font-medium text-stone-700">
                Órdenes por página
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
            Cargando órdenes de servicio...
          </div>
        ) : listError ? (
          <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{listError}</span>
            <button
              type="button"
              onClick={loadOrdenes}
              className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
            >
              Reintentar
            </button>
          </div>
        ) : ordenes.length === 0 && total === 0 && !hasActiveFilters ? (
          <div className="p-8 text-center text-sm text-stone-500">
            No hay órdenes de servicio registradas todavía.
          </div>
        ) : ordenes.length === 0 && total === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-stone-500">
            <span>No se encontraron órdenes con esos filtros.</span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-rose-600 hover:text-rose-700"
            >
              Limpiar filtros
            </button>
          </div>
        ) : viewMode === 'tarjetas' ? (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {ordenes.map((orden) => (
              <div
                key={orden.id}
                className="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Orden de trabajo
                    </p>
                    <p className="text-sm font-bold text-stone-800">{orden.numero ?? '—'}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE_CLASSES[orden.estado]}`}
                  >
                    {ESTADO_LABELS[orden.estado]}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-stone-600">
                  <p>
                    <span className="font-medium text-stone-800">Cliente:</span> {orden.cliente.razonSocial}
                  </p>
                  <p>
                    <span className="font-medium text-stone-800">Vehículo:</span> {orden.vehiculo.marca.marca}{' '}
                    {orden.vehiculo.marca.modelo}
                  </p>
                  <p>
                    <span className="font-medium text-stone-800">Mecánico:</span> {mecanicoLabel(orden.mecanico)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {orden.tiposServicio.map((tipo) => (
                    <span
                      key={tipo.id}
                      className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600"
                    >
                      {tipo.descripcion}
                    </span>
                  ))}
                </div>

                <p className="text-xs text-stone-400">
                  Ingreso: {formatFecha(orden.fechaIngreso)} · {formatHora(orden.createdAt)}
                </p>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled
                    title="Próximamente"
                    className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Iniciar trabajo
                  </button>
                  <Link
                    href={`/ordenes-servicio/editar/${orden.id}`}
                    className="text-sm font-medium text-rose-600 hover:text-rose-700"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Número
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Cliente
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Vehículo
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Estado
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Prioridad
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Mecánico
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Fecha de ingreso
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {ordenes.map((orden) => (
                <tr key={orden.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 text-center text-sm font-medium text-stone-800">
                    {orden.numero ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {orden.cliente.razonSocial}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {orden.vehiculo.marca.marca} {orden.vehiculo.marca.modelo}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE_CLASSES[orden.estado]}`}
                    >
                      {ESTADO_LABELS[orden.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORIDAD_BADGE_CLASSES[orden.prioridad]}`}
                    >
                      {PRIORIDAD_LABELS[orden.prioridad]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {mecanicoLabel(orden.mecanico)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {formatFecha(orden.fechaIngreso)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <Link
                      href={`/ordenes-servicio/editar/${orden.id}`}
                      className="font-medium text-rose-600 hover:text-rose-700"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !listError && ordenes.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-sm text-stone-500 sm:flex-row">
            <span>
              Mostrando {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} de {total} órdenes
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
    </div>
  );
}
