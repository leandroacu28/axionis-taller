'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listPresupuestos, updatePresupuesto, type PresupuestoListItem } from '../../lib/presupuestos';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';
import SearchableSelect from '../vehiculos/SearchableSelect';
import { clienteSelectConfig, tipoServicioSelectConfig } from '../vehiculos/referenceSelectConfigs';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function formatFecha(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function totalDePresupuesto(presupuesto: PresupuestoListItem): number {
  return presupuesto.productos.reduce((sum, linea) => sum + Number(linea.precioTotal), 0);
}

export default function PresupuestosPage() {
  const [presupuestos, setPresupuestos] = useState<PresupuestoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [clienteFilter, setClienteFilter] = useState<number | ''>('');
  const [tipoServicioFilter, setTipoServicioFilter] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [total, setTotal] = useState(0);

  const hasActiveFilters = searchInput.trim() !== '' || clienteFilter !== '' || tipoServicioFilter !== '';
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setClienteFilter('');
    setTipoServicioFilter('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (page > 1 && page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const loadPresupuestos = async () => {
    setLoading(true);
    setListError('');
    try {
      const result = await listPresupuestos({
        page,
        pageSize,
        search: search || undefined,
        clienteId: clienteFilter || undefined,
        tipoServicioId: tipoServicioFilter || undefined,
      });
      setPresupuestos(result.data);
      setTotal(result.total);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresupuestos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, clienteFilter, tipoServicioFilter]);

  const handleToggleActivo = async (presupuesto: PresupuestoListItem) => {
    const activating = !presupuesto.activo;

    if (!activating) {
      const confirmed = await showConfirm({
        title: 'Desactivar presupuesto',
        text: `¿Seguro que querés desactivar el presupuesto #${presupuesto.id}?`,
        confirmButtonText: 'Sí, desactivar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }

    setTogglingId(presupuesto.id);
    try {
      await updatePresupuesto(presupuesto.id, {
        fecha: presupuesto.fecha,
        clienteId: presupuesto.cliente.id,
        tipoServicioId: presupuesto.tipoServicio.id,
        telefono: presupuesto.telefono ?? undefined,
        descripcion: presupuesto.descripcion ?? undefined,
        activo: activating,
      });
      showSuccess(
        activating ? 'Presupuesto activado' : 'Presupuesto desactivado',
        `El presupuesto #${presupuesto.id} fue ${activating ? 'activado' : 'desactivado'} correctamente.`,
      );
      await loadPresupuestos();
    } catch (err) {
      showError(
        activating ? 'No se pudo activar el presupuesto' : 'No se pudo desactivar el presupuesto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Presupuestos</h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            Gestioná los presupuestos del taller.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/presupuestos/nuevo"
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600"
          >
            Nuevo presupuesto
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
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
                  placeholder="Descripción, teléfono o cliente..."
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <SearchableSelect
              label="Cliente"
              placeholder="Todos los clientes"
              value={clienteFilter}
              onChange={(id) => {
                setClienteFilter(id);
                setPage(1);
              }}
              search={clienteSelectConfig.search}
            />

            <SearchableSelect
              label="Tipo de servicio"
              placeholder="Todos los tipos"
              value={tipoServicioFilter}
              onChange={(id) => {
                setTipoServicioFilter(id);
                setPage(1);
              }}
              search={tipoServicioSelectConfig.search}
            />

            <div className="space-y-1">
              <label htmlFor="pageSize" className="text-sm font-medium text-stone-700">
                Presupuestos por página
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
            Cargando presupuestos...
          </div>
        ) : listError ? (
          <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{listError}</span>
            <button
              type="button"
              onClick={loadPresupuestos}
              className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
            >
              Reintentar
            </button>
          </div>
        ) : presupuestos.length === 0 && total === 0 && !hasActiveFilters ? (
          <div className="p-8 text-center text-sm text-stone-500">
            No hay presupuestos registrados todavía.
          </div>
        ) : presupuestos.length === 0 && total === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-stone-500">
            <span>No se encontraron presupuestos con esos filtros.</span>
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
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  #
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Fecha
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Cliente
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Tipo de servicio
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Descripción
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {presupuestos.map((presupuesto, index) => (
                <tr key={presupuesto.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 text-center text-sm text-stone-500">
                    {(page - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {formatFecha(presupuesto.fecha)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-stone-800">
                    {presupuesto.cliente.razonSocial}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {presupuesto.tipoServicio.descripcion}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {`$${totalDePresupuesto(presupuesto).toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {presupuesto.descripcion || '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Link
                        href={`/presupuestos/editar/${presupuesto.id}`}
                        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                      >
                        Editar
                      </Link>
                      {!presupuesto.activo && (
                        <button
                          type="button"
                          onClick={() => handleToggleActivo(presupuesto)}
                          disabled={togglingId === presupuesto.id}
                          className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {togglingId === presupuesto.id ? '...' : 'Activar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !listError && presupuestos.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-sm text-stone-500 sm:flex-row">
            <span>
              Mostrando {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} de {total} presupuestos
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
