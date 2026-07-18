'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getOrdenTrabajo,
  listOrdenTrabajoDetalles,
  updateOrdenTrabajo,
  updateOrdenTrabajoDetalle,
  type Estado,
  type OrdenTrabajoDetalle,
  type OrdenTrabajoListItem,
  type UpdateOrdenTrabajoDetallePayload,
} from '../../../../lib/ordenes-trabajo';
import { listDiagnosticos, type DiagnosticoListItem } from '../../../../lib/diagnosticos';
import { showConfirm, showError, showSuccess } from '../../../../lib/alerts';
import DiagnosticoFormModal from '../../../diagnosticos/DiagnosticoFormModal';

const ESTADO_OPTIONS: { value: Estado; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'terminado', label: 'Terminado' },
  { value: 'cancelado', label: 'Cancelado' },
];

function formatFechaCorta(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4 shrink-0 text-stone-400"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// Height of a single option row (px-3 py-2, text-sm) — used to cap the
// results panel to exactly VISIBLE_ROWS before it scrolls.
const OPTION_ROW_HEIGHT_PX = 36;
const VISIBLE_ROWS = 5;

interface DiagnosticoDropdownProps {
  id: string;
  value: number | '';
  diagnosticos: DiagnosticoListItem[];
  onChange: (id: number | '') => void;
  onCreated: (created: DiagnosticoListItem) => void;
  disabled?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

// Native <select> can't host a search box or cap its visible rows, so the
// diagnóstico picker is a small custom combobox: trigger button + a portaled
// panel with a search input and a fixed-height, scrollable options list. When
// the search has no matches, the panel offers a "+ Crear" row instead of a
// dead end, so there's no separate "nuevo diagnóstico" button anywhere else.
function DiagnosticoDropdown({
  id,
  value,
  diagnosticos,
  onChange,
  onCreated,
  disabled,
}: DiagnosticoDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<DropdownPosition | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const selected = diagnosticos.find((d) => d.id === value) ?? null;
  const filtered = diagnosticos.filter((d) =>
    d.descripcion.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const closePanel = () => {
    setOpen(false);
    setPanelPos(null);
  };

  const openPanel = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeightEstimate = OPTION_ROW_HEIGHT_PX * (VISIBLE_ROWS + 1) + 56;
    const openUpward = window.innerHeight - rect.bottom < panelHeightEstimate;
    setPanelPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUpward,
    });
    setSearch('');
    setOpen(true);
  };

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) closePanel();
    };
    const handleReposition = () => closePanel();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    // Non-capture on purpose: the results list has its own overflow-y-auto,
    // and `scroll` does not bubble, so inner-list scrolling never reaches
    // `window` while page scroll still closes the panel. (Same fix as
    // SearchableSelect.tsx.)
    window.addEventListener('scroll', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition);
    };
  }, [open]);

  const selectOption = (optionId: number | '') => {
    onChange(optionId);
    closePanel();
    triggerRef.current?.focus();
  };

  const openCreate = () => {
    closePanel();
    setCreateOpen(true);
  };

  return (
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={selected ? '' : 'text-stone-400'}>
          {selected ? selected.descripcion : 'Sin diagnóstico'}
        </span>
        <ChevronIcon />
      </button>

      {open &&
        panelPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              transform: panelPos.openUpward ? 'translateY(-100%)' : undefined,
            }}
            className="z-50 flex flex-col rounded-lg border border-stone-200 bg-white shadow-lg"
          >
            <div className="border-b border-stone-200 p-2">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    closePanel();
                    triggerRef.current?.focus();
                  }
                }}
                placeholder="Buscar diagnóstico..."
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>
            <div
              className="overflow-y-auto"
              style={{ maxHeight: OPTION_ROW_HEIGHT_PX * VISIBLE_ROWS }}
            >
              <div
                onClick={() => selectOption('')}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  value === '' ? 'bg-rose-50 text-rose-700' : 'text-stone-700'
                }`}
              >
                Sin diagnóstico
              </div>
              {filtered.length === 0 ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  <span aria-hidden="true">+</span>
                  {search.trim() === ''
                    ? 'Crear diagnóstico'
                    : `Crear "${search.trim()}"`}
                </button>
              ) : (
                filtered.map((diag) => (
                  <div
                    key={diag.id}
                    onClick={() => selectOption(diag.id)}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      value === diag.id ? 'bg-rose-50 text-rose-700' : 'text-stone-700'
                    }`}
                  >
                    {diag.descripcion}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}

      <DiagnosticoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        diagnostico={null}
        prefillDescripcion={search}
        onSaved={(created) => {
          setCreateOpen(false);
          onChange(created.id);
          onCreated(created);
        }}
      />
    </div>
  );
}

interface DetalleCardProps {
  ordenId: number;
  detalle: OrdenTrabajoDetalle;
  diagnosticos: DiagnosticoListItem[];
  onSaved: (updated: OrdenTrabajoDetalle) => void;
  onReactivado: (updated: OrdenTrabajoDetalle) => void;
  onDiagnosticoCreado: (created: DiagnosticoListItem) => void;
}

// Own local state, own "Guardar" button, own submitting state — cards save
// independently, saving one never requires the others to be filled in.
function DetalleCard({
  ordenId,
  detalle,
  diagnosticos,
  onSaved,
  onReactivado,
  onDiagnosticoCreado,
}: DetalleCardProps) {
  const [estado, setEstado] = useState<Estado>(detalle.estado);
  const [diagnosticoId, setDiagnosticoId] = useState<number | ''>(detalle.diagnostico?.id ?? '');
  const [trabajoRealizado, setTrabajoRealizado] = useState(detalle.trabajoRealizado ?? '');
  const [proximoServiceFecha, setProximoServiceFecha] = useState(
    detalle.proximoServiceFecha?.slice(0, 10) ?? '',
  );
  const [proximoServiceKm, setProximoServiceKm] = useState(
    detalle.proximoServiceKm != null ? String(detalle.proximoServiceKm) : '',
  );
  const [fechaFinalizacion, setFechaFinalizacion] = useState(
    detalle.fechaFinalizacion?.slice(0, 10) ?? '',
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    // "Completar Servicio" always finalizes this service — the Estado
    // select above is informational/manual-override display, not the
    // source of truth for this action. The fecha de finalización is
    // auto-stamped to today when empty; if one was already loaded (e.g.
    // re-completing after editing other fields), ask instead of silently
    // overwriting a date someone may have set deliberately.
    let fechaAGuardar = fechaFinalizacion;
    if (!fechaAGuardar) {
      fechaAGuardar = new Date().toISOString().slice(0, 10);
    } else {
      const actualizar = await showConfirm({
        title: 'Este servicio ya tiene fecha de finalización',
        text: `Fecha actual: ${formatFechaCorta(fechaAGuardar)}. ¿Querés actualizarla a la fecha de hoy o conservar la existente?`,
        confirmButtonText: 'Actualizar a hoy',
        cancelButtonText: 'Conservar fecha actual',
      });
      if (actualizar) {
        fechaAGuardar = new Date().toISOString().slice(0, 10);
      }
    }

    setSubmitting(true);
    try {
      const payload: UpdateOrdenTrabajoDetallePayload = {
        estado: 'terminado',
        diagnosticoId: diagnosticoId === '' ? null : diagnosticoId,
        trabajoRealizado: trabajoRealizado.trim() === '' ? null : trabajoRealizado,
        proximoServiceFecha: proximoServiceFecha === '' ? null : proximoServiceFecha,
        proximoServiceKm: proximoServiceKm === '' ? null : Number(proximoServiceKm),
        fechaFinalizacion: fechaAGuardar,
      };
      const updated = await updateOrdenTrabajoDetalle(ordenId, detalle.id, payload);
      setEstado('terminado');
      setFechaFinalizacion(fechaAGuardar);
      showSuccess(`${detalle.tipoServicio.descripcion} completado`, 'El servicio se marcó como terminado.');
      onSaved(updated);
    } catch (err) {
      showError(
        'No se pudo guardar el detalle',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Reopens a completed card: persists estado back to 'en_proceso' (rest of
  // the fields go through untouched) so the fields re-enable and the mechanic
  // can keep editing. fechaFinalizacion is left as-is — it just stops being
  // shown while the card isn't terminado, per the existing display rule.
  const handleReactivar = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: UpdateOrdenTrabajoDetallePayload = {
        estado: 'en_proceso',
        diagnosticoId: diagnosticoId === '' ? null : diagnosticoId,
        trabajoRealizado: trabajoRealizado.trim() === '' ? null : trabajoRealizado,
        proximoServiceFecha: proximoServiceFecha === '' ? null : proximoServiceFecha,
        proximoServiceKm: proximoServiceKm === '' ? null : Number(proximoServiceKm),
        fechaFinalizacion: fechaFinalizacion === '' ? null : fechaFinalizacion,
      };
      const updated = await updateOrdenTrabajoDetalle(ordenId, detalle.id, payload);
      setEstado('en_proceso');
      showSuccess(`${detalle.tipoServicio.descripcion} reactivado`, 'El servicio volvió a estado En proceso.');
      onSaved(updated);
      onReactivado(updated);
    } catch (err) {
      showError(
        'No se pudo reactivar el servicio',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Once completed, the card is read-only — re-opening a terminado service
  // for edits isn't part of this flow (no dedicated "reabrir" action exists).
  const bloqueada = estado === 'terminado';

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2">
        {detalle.tipoServicio.descripcion}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`estado-${detalle.id}`} className="text-sm font-medium text-stone-700">
            Estado
          </label>
          <select
            id={`estado-${detalle.id}`}
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            disabled={bloqueada}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ESTADO_OPTIONS.filter((option) => option.value !== 'terminado' || estado === 'terminado').map(
              (option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={`diagnostico-${detalle.id}`} className="text-sm font-medium text-stone-700">
            Diagnóstico
          </label>
          <DiagnosticoDropdown
            id={`diagnostico-${detalle.id}`}
            value={diagnosticoId}
            diagnosticos={diagnosticos}
            onChange={setDiagnosticoId}
            onCreated={onDiagnosticoCreado}
            disabled={bloqueada}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={`trabajo-${detalle.id}`} className="text-sm font-medium text-stone-700">
          Trabajo realizado
        </label>
        <textarea
          id={`trabajo-${detalle.id}`}
          value={trabajoRealizado}
          onChange={(e) => setTrabajoRealizado(e.target.value)}
          disabled={bloqueada}
          rows={3}
          placeholder="Detalle del trabajo realizado"
          className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`proximo-fecha-${detalle.id}`} className="text-sm font-medium text-stone-700">
            Próximo service (fecha)
          </label>
          <input
            id={`proximo-fecha-${detalle.id}`}
            type="date"
            value={proximoServiceFecha}
            onChange={(e) => setProximoServiceFecha(e.target.value)}
            disabled={bloqueada}
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`proximo-km-${detalle.id}`} className="text-sm font-medium text-stone-700">
            Próximo service (km)
          </label>
          <input
            id={`proximo-km-${detalle.id}`}
            type="number"
            min={0}
            value={proximoServiceKm}
            onChange={(e) => setProximoServiceKm(e.target.value)}
            disabled={bloqueada}
            placeholder="Ej: 55000"
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        {estado === 'terminado' && (
          <div className="space-y-1">
            <label htmlFor={`finalizacion-${detalle.id}`} className="text-sm font-medium text-stone-700">
              Fecha de finalización
            </label>
            <input
              id={`finalizacion-${detalle.id}`}
              type="date"
              value={fechaFinalizacion}
              onChange={(e) => setFechaFinalizacion(e.target.value)}
              disabled={bloqueada}
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || bloqueada}
          className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : bloqueada ? 'Servicio completado' : 'Completar Servicio'}
        </button>
        {bloqueada && (
          <button
            type="button"
            onClick={handleReactivar}
            disabled={submitting}
            className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-600/30 transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Activando...' : 'Activar'}
          </button>
        )}
      </div>
    </form>
  );
}

export default function TrabajoOrdenTrabajoPage({ params }: { params: { id: string } }) {
  const ordenId = Number(params.id);
  const router = useRouter();

  const [orden, setOrden] = useState<OrdenTrabajoListItem | null>(null);
  const [detalles, setDetalles] = useState<OrdenTrabajoDetalle[]>([]);
  const [diagnosticos, setDiagnosticos] = useState<DiagnosticoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [finalizando, setFinalizando] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ordenData, detallesData, diagnosticosData] = await Promise.all([
        getOrdenTrabajo(ordenId),
        listOrdenTrabajoDetalles(ordenId),
        listDiagnosticos({ page: 1, pageSize: 100, status: 'activo' }),
      ]);
      setOrden(ordenData);
      setDetalles(detallesData);
      setDiagnosticos(diagnosticosData.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId]);

  const handleDetalleSaved = (updated: OrdenTrabajoDetalle) => {
    setDetalles((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  // A diagnóstico created from within a tarjeta must show up in every
  // tarjeta's dropdown, not just the one that opened the modal.
  const handleDiagnosticoCreado = (created: DiagnosticoListItem) => {
    setDiagnosticos((prev) => [...prev, created]);
  };

  // Reactivating a tipo de servicio implies the order itself is back "en
  // proceso" — covers the case where the order had already been marked
  // terminado/pendiente and a mechanic reopens one of its services.
  const handleDetalleReactivado = async () => {
    if (!orden || orden.estado === 'en_proceso') return;
    try {
      const updated = await updateOrdenTrabajo(orden.id, {
        fechaIngreso: orden.fechaIngreso,
        kilometros: orden.kilometros,
        prioridad: orden.prioridad,
        motivoIngreso: orden.motivoIngreso,
        estado: 'en_proceso',
        activo: orden.activo,
        clienteId: orden.cliente.id,
        vehiculoId: orden.vehiculo.id,
        mecanicoId: orden.mecanico.id,
        tipoServicioIds: orden.tiposServicio.map((t) => t.id),
      });
      setOrden(updated);
    } catch (err) {
      showError(
        'No se pudo actualizar el estado de la orden',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    }
  };

  // Every tipo de servicio must be Terminado or Cancelado before the order
  // itself can be closed out — prevents finalizing work that's still
  // pendiente/en_proceso. Kept as a list (not just a boolean) so the button
  // handler can name the specific offenders in the alert.
  const detallesPendientes = detalles.filter(
    (d) => d.estado !== 'terminado' && d.estado !== 'cancelado',
  );
  const allDetallesDone = detalles.length > 0 && detallesPendientes.length === 0;
  const yaFinalizada = orden?.estado === 'terminado';
  // Not gated on allDetallesDone anymore — the button stays clickable so
  // handleFinalizar can show an alert naming the pending services instead of
  // a silent disabled state the mechanic might not notice/hover.
  const finalizarDisabled = !orden || yaFinalizada || finalizando;
  const finalizarTitle = yaFinalizada ? 'La orden ya está finalizada.' : undefined;

  const handleFinalizar = async () => {
    if (!orden) return;

    if (!allDetallesDone) {
      showError(
        'Hay servicios sin completar',
        `Completá o cancelá estos servicios antes de finalizar la orden: ${detallesPendientes
          .map((d) => d.tipoServicio.descripcion)
          .join(', ')}.`,
      );
      return;
    }

    const confirmed = await showConfirm({
      title: 'Finalizar orden de trabajo',
      text: `¿Confirmás finalizar la orden ${orden.numero ?? ''}? Su estado pasará a Terminado.`,
      confirmButtonText: 'Sí, finalizar',
    });
    if (!confirmed) return;

    setFinalizando(true);
    try {
      const updated = await updateOrdenTrabajo(orden.id, {
        fechaIngreso: orden.fechaIngreso,
        kilometros: orden.kilometros,
        prioridad: orden.prioridad,
        motivoIngreso: orden.motivoIngreso,
        estado: 'terminado',
        // Stamped here, same as each detalle's fechaFinalizacion on
        // "Completar Servicio" — the order's own finalization date is set
        // by this action, not by the generic edit form.
        fechaFinalizacion: new Date().toISOString().slice(0, 10),
        activo: orden.activo,
        clienteId: orden.cliente.id,
        vehiculoId: orden.vehiculo.id,
        mecanicoId: orden.mecanico.id,
        tipoServicioIds: orden.tiposServicio.map((t) => t.id),
      });
      setOrden(updated);
      showSuccess('Orden finalizada', `${updated.numero ?? 'La orden'} fue marcada como Terminado.`);
      router.push('/ordenes-trabajo');
    } catch (err) {
      showError(
        'No se pudo finalizar la orden',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setFinalizando(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Orden de trabajo
          </p>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            {loading ? 'Cargando...' : orden ? (orden.numero ?? `OT #${orden.id}`) : 'No encontrada'}
          </h1>
          {!loading && orden && (
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              {orden.cliente.razonSocial} · {orden.vehiculo.marca.marca} {orden.vehiculo.marca.modelo} ·{' '}
              <span className="font-medium text-stone-600 dark:text-stone-300">
                {orden.vehiculo.kilometraje.toLocaleString('es-AR')} km actuales
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={handleFinalizar}
            disabled={finalizarDisabled}
            title={finalizarTitle}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finalizando ? 'Finalizando...' : 'Finalizar OT'}
          </button>
          <Link
            href="/ordenes-trabajo"
            className="rounded-lg border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-200"
          >
            ← Volver
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando orden...
        </div>
      ) : loadError || !orden ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError || 'No se pudo cargar la orden.'}</span>
            <button
              type="button"
              onClick={loadData}
              className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : detalles.length === 0 ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 shadow-sm">
          Esta orden no tiene tipos de servicio asociados.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {detalles.map((detalle) => (
            <DetalleCard
              key={detalle.id}
              ordenId={ordenId}
              detalle={detalle}
              diagnosticos={diagnosticos}
              onSaved={handleDetalleSaved}
              onReactivado={handleDetalleReactivado}
              onDiagnosticoCreado={handleDiagnosticoCreado}
            />
          ))}
        </div>
      )}
    </div>
  );
}
