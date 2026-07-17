'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  iniciarOrdenTrabajo,
  listOrdenesTrabajo,
  updateOrdenTrabajo,
  type Estado,
  type OrdenTrabajoListItem,
  type Prioridad,
} from '../../lib/ordenes-trabajo';
import { listUsers, type UserListItem } from '../../lib/users';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';

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

function EllipsisIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// Same Activar/Desactivar icon pair as etiquetas/page.tsx.
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

// Rough height of the three-item menu — used only to decide whether it
// should flip upward for rows near the bottom of the viewport, mirroring the
// same estimate/flip pattern used by the searchable-select components.
const ACCIONES_MENU_HEIGHT_ESTIMATE = 130;

interface AccionesMenuPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

// "Iniciar trabajo" is a single action with two behaviors depending on the
// order's current estado: on a `pendiente` order it first calls the atomic
// iniciar cascade (order + every pendiente detalle -> en_proceso) and only
// then navigates to the work page; on an order that's already past
// `pendiente` it's pure navigation (calling iniciar again would just 409,
// and the mechanic may be revisiting the page to keep editing detalles).
// Shared between the table's AccionesMenu item and the card view's
// standalone button so the behavior can't drift between the two surfaces.
function IniciarTrabajoButton({
  orden,
  onIniciado,
  onNavigateStart,
  variant,
}: {
  orden: OrdenTrabajoListItem;
  onIniciado: () => void;
  // Menu usage needs to close the dropdown before navigating; the
  // standalone card button has nothing to close.
  onNavigateStart?: () => void;
  variant: 'menu-item' | 'card';
}) {
  const router = useRouter();
  const [iniciando, setIniciando] = useState(false);

  const handleClick = async () => {
    onNavigateStart?.();
    if (orden.estado === 'pendiente') {
      setIniciando(true);
      try {
        await iniciarOrdenTrabajo(orden.id);
        onIniciado();
      } catch (err) {
        showError(
          'No se pudo iniciar la orden',
          err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
        );
        setIniciando(false);
        return;
      }
      setIniciando(false);
    }
    router.push(`/ordenes-trabajo/${orden.id}/trabajo`);
  };

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={iniciando}
        className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {iniciando ? 'Iniciando...' : 'Iniciar trabajo'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={iniciando}
      className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {iniciando ? 'Iniciando...' : 'Iniciar trabajo'}
    </button>
  );
}

// Per-row "..." actions menu for the table view — a portal-rendered dropdown
// (same dismiss-on-click-outside/resize/scroll pattern as UnidadMedidaSelect
// and EtiquetasMultiSelect) so it isn't clipped by the table wrapper's
// `overflow-hidden`. Activar/Desactivar resends the order's current data
// (already available on the list row) with only `activo` flipped — same
// partial-update contract the edit form's checkbox uses, just without a
// page visit.
function AccionesMenu({
  orden,
  onToggled,
  showIniciarTrabajo = true,
  trigger = 'icon',
}: {
  orden: OrdenTrabajoListItem;
  onToggled: () => void;
  // The card view already shows its own "Iniciar trabajo" button outside
  // the menu, so it opts out of the redundant disabled menu item.
  showIniciarTrabajo?: boolean;
  // Table rows use a compact "..." icon; the card view uses a labeled
  // "Opciones" button since it has more room and no adjoining row context.
  trigger?: 'icon' | 'label';
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<AccionesMenuPosition | null>(null);
  const [toggling, setToggling] = useState(false);

  const closeMenu = () => {
    setOpen(false);
    setMenuPos(null);
  };

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpward = window.innerHeight - rect.bottom < ACCIONES_MENU_HEIGHT_ESTIMATE;
    setMenuPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.right,
      openUpward,
    });
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  };

  const handleToggleActivo = async () => {
    closeMenu();
    const activating = !orden.activo;

    // Same confirm-before-deactivate pattern as etiquetas/page.tsx — no
    // confirmation needed to re-activate.
    if (!activating) {
      const confirmed = await showConfirm({
        title: 'Desactivar orden',
        text: `¿Seguro que querés desactivar la orden ${orden.numero ?? ''}?`,
        confirmButtonText: 'Sí, desactivar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }

    setToggling(true);
    try {
      await updateOrdenTrabajo(orden.id, {
        fechaIngreso: orden.fechaIngreso,
        kilometros: orden.kilometros,
        prioridad: orden.prioridad,
        motivoIngreso: orden.motivoIngreso,
        estado: orden.estado,
        clienteId: orden.cliente.id,
        vehiculoId: orden.vehiculo.id,
        mecanicoId: orden.mecanico.id,
        tipoServicioIds: orden.tiposServicio.map((t) => t.id),
        activo: activating,
      });
      showSuccess(
        activating ? 'Orden activada' : 'Orden desactivada',
        `La orden ${orden.numero ?? ''} se ${activating ? 'activó' : 'desactivó'} correctamente.`,
      );
      onToggled();
    } catch (err) {
      showError(
        'No se pudo actualizar la orden',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setToggling(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) closeMenu();
    };
    const handleReposition = () => closeMenu();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  return (
    <>
      {trigger === 'label' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
        >
          Opciones
          <ChevronDownIcon />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Acciones"
          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
        >
          <EllipsisIcon />
        </button>
      )}

      {open &&
        menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: `translateX(-100%)${menuPos.openUpward ? ' translateY(-100%)' : ''}`,
            }}
            className="z-50 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
          >
            <Link
              href={`/ordenes-trabajo/editar/${orden.id}`}
              onClick={closeMenu}
              className="block px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Editar
            </Link>
            {showIniciarTrabajo && (
              <IniciarTrabajoButton
                orden={orden}
                onIniciado={onToggled}
                onNavigateStart={closeMenu}
                variant="menu-item"
              />
            )}
            <button
              type="button"
              onClick={handleToggleActivo}
              disabled={toggling}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                orden.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-green-600 hover:bg-green-50'
              }`}
            >
              {orden.activo ? (
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
    </>
  );
}

type EstadoFilter = 'all' | Estado;
type ActivoFilter = 'all' | 'activo' | 'inactivo';
type MecanicoFilter = 'all' | number;
type PrioridadFilter = 'all' | Prioridad;

const DEFAULT_ESTADO_FILTER: EstadoFilter = 'all';
const DEFAULT_ACTIVO_FILTER: ActivoFilter = 'activo';
const DEFAULT_MECANICO_FILTER: MecanicoFilter = 'all';
const DEFAULT_PRIORIDAD_FILTER: PrioridadFilter = 'all';
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const ESTADO_LABELS: Record<Estado, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
  cancelado: 'Cancelado',
};

const ESTADO_BADGE_CLASSES: Record<Estado, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  en_proceso: 'bg-sky-100 text-sky-700',
  terminado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

// Table view uses its own palette (distinct from the tarjetas view above).
const ESTADO_BADGE_CLASSES_TABLA: Record<Estado, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-yellow-100 text-yellow-700',
  terminado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

const PRIORIDAD_LABELS: Record<OrdenTrabajoListItem['prioridad'], string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const PRIORIDAD_BADGE_CLASSES: Record<OrdenTrabajoListItem['prioridad'], string> = {
  normal: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
};

function formatFecha(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function mecanicoLabel(mecanico: OrdenTrabajoListItem['mecanico']): string {
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

export default function OrdenesTrabajoPage() {
  const [ordenes, setOrdenes] = useState<OrdenTrabajoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>(DEFAULT_ESTADO_FILTER);
  // Additive alongside estadoFilter — activo is an orthogonal
  // soft-deactivation flag, not a replacement for the estado lifecycle.
  const [activoFilter, setActivoFilter] = useState<ActivoFilter>(DEFAULT_ACTIVO_FILTER);
  // Additive alongside the other filters — mecánico and prioridad are
  // orthogonal to estado/activo, same as each other.
  const [mecanicoFilter, setMecanicoFilter] = useState<MecanicoFilter>(DEFAULT_MECANICO_FILTER);
  const [prioridadFilter, setPrioridadFilter] = useState<PrioridadFilter>(DEFAULT_PRIORIDAD_FILTER);
  const [mecanicos, setMecanicos] = useState<UserListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ pendiente: 0, en_proceso: 0, terminado: 0, cancelado: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('tabla');

  const hasActiveFilters =
    searchInput.trim() !== '' ||
    estadoFilter !== DEFAULT_ESTADO_FILTER ||
    activoFilter !== DEFAULT_ACTIVO_FILTER ||
    mecanicoFilter !== DEFAULT_MECANICO_FILTER ||
    prioridadFilter !== DEFAULT_PRIORIDAD_FILTER;
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setEstadoFilter(DEFAULT_ESTADO_FILTER);
    setActivoFilter(DEFAULT_ACTIVO_FILTER);
    setMecanicoFilter(DEFAULT_MECANICO_FILTER);
    setPrioridadFilter(DEFAULT_PRIORIDAD_FILTER);
    setPage(1);
  };

  // Mecánico options for the filter — a mecánico is just any active User
  // (D6), same pool the order form's mecánico picker searches. Fetched once
  // since the filter needs the full active list, not a debounced search.
  useEffect(() => {
    listUsers({ status: 'activo' })
      .then(setMecanicos)
      .catch(() => {
        // Filter degrades to just "Todos" if this fails — not worth
        // surfacing a separate error banner for a secondary control.
      });
  }, []);

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
      const result = await listOrdenesTrabajo({
        page,
        pageSize,
        search: search || undefined,
        estado: estadoFilter,
        status: activoFilter,
        mecanicoId: mecanicoFilter === 'all' ? undefined : mecanicoFilter,
        prioridad: prioridadFilter,
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
  }, [page, pageSize, search, estadoFilter, activoFilter, mecanicoFilter, prioridadFilter]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            Órdenes de Trabajo
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
            href="/ordenes-trabajo/nuevo"
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
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            {counts.cancelado} cancelada{counts.cancelado === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 space-y-1">
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

            <div className="w-40 space-y-1">
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
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div className="w-40 space-y-1">
              <label htmlFor="activoFilter" className="text-sm font-medium text-stone-700">
                Activo
              </label>
              <select
                id="activoFilter"
                value={activoFilter}
                onChange={(e) => {
                  setActivoFilter(e.target.value as ActivoFilter);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="all">Todas</option>
                <option value="activo">Activas</option>
                <option value="inactivo">Inactivas</option>
              </select>
            </div>

            <div className="w-48 space-y-1">
              <label htmlFor="mecanicoFilter" className="text-sm font-medium text-stone-700">
                Mecánico
              </label>
              <select
                id="mecanicoFilter"
                value={mecanicoFilter}
                onChange={(e) => {
                  setMecanicoFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setPage(1);
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="all">Todos</option>
                {mecanicos.map((mecanico) => (
                  <option key={mecanico.id} value={mecanico.id}>
                    {mecanicoLabel(mecanico)}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-40 space-y-1">
              <label htmlFor="prioridadFilter" className="text-sm font-medium text-stone-700">
                Prioridad
              </label>
              <select
                id="prioridadFilter"
                value={prioridadFilter}
                onChange={(e) => {
                  setPrioridadFilter(e.target.value as PrioridadFilter);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="all">Todas</option>
                <option value="normal">{PRIORIDAD_LABELS.normal}</option>
                <option value="alta">{PRIORIDAD_LABELS.alta}</option>
                <option value="urgente">{PRIORIDAD_LABELS.urgente}</option>
              </select>
            </div>

            <div className="w-36 space-y-1">
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
            Cargando órdenes de trabajo...
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
            No hay órdenes de trabajo registradas todavía.
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE_CLASSES[orden.estado]}`}
                    >
                      {ESTADO_LABELS[orden.estado]}
                    </span>
                    {!orden.activo && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        Inactiva
                      </span>
                    )}
                  </div>
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
                  <p className="flex items-center gap-1.5">
                    <span className="font-medium text-stone-800">Prioridad:</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORIDAD_BADGE_CLASSES[orden.prioridad]}`}
                    >
                      {PRIORIDAD_LABELS[orden.prioridad]}
                    </span>
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
                  <IniciarTrabajoButton orden={orden} onIniciado={loadOrdenes} variant="card" />
                  <AccionesMenu
                    orden={orden}
                    onToggled={loadOrdenes}
                    showIniciarTrabajo={false}
                    trigger="label"
                  />
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
                  Servicios
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Estado
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Prioridad
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Fecha de ingreso
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Fecha de finalización
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
                    {orden.vehiculo.marca.marca} {orden.vehiculo.marca.modelo} -{' '}
                    {orden.vehiculo.kilometraje.toLocaleString('es-AR')} km
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {orden.tiposServicio.map((tipo) => (
                        <span
                          key={tipo.id}
                          className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                        >
                          {tipo.descripcion}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE_CLASSES_TABLA[orden.estado]}`}
                      >
                        {ESTADO_LABELS[orden.estado]}
                      </span>
                      {!orden.activo && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                          Inactiva
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORIDAD_BADGE_CLASSES[orden.prioridad]}`}
                    >
                      {PRIORIDAD_LABELS[orden.prioridad]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {formatFecha(orden.fechaIngreso)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    {orden.fechaFinalizacion ? formatFecha(orden.fechaFinalizacion) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <AccionesMenu orden={orden} onToggled={loadOrdenes} />
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
