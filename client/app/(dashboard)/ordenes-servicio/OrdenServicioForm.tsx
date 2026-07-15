'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import SearchableSelect from '../vehiculos/SearchableSelect';
import { clienteSelectConfig, mecanicoSelectConfig } from '../vehiculos/referenceSelectConfigs';
import TipoServicioMultiSelect from './TipoServicioMultiSelect';
import { listVehicles } from '../../lib/vehicles';
import { showConfirm, showError } from '../../lib/alerts';
import type { CreateOrdenServicioPayload, Estado, Prioridad } from '../../lib/ordenes-servicio';

export interface OrdenServicioFormValues {
  clienteId: number | '';
  clienteLabel?: string;
  vehiculoId: number | '';
  vehiculoLabel?: string;
  mecanicoId: number | '';
  mecanicoLabel?: string;
  tiposServicio: { id: number; label: string }[];
  prioridad: Prioridad;
  estado: Estado;
  fechaIngreso: string; // yyyy-mm-dd, matches <input type="date">
  kilometros: number | '';
  motivoIngreso: string;
}

interface OrdenServicioFormProps {
  mode: 'create' | 'edit';
  initialValues: OrdenServicioFormValues;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  cancelHref: string;
  onSubmit: (payload: CreateOrdenServicioPayload) => void | Promise<void>;
}

const PRIORIDAD_OPTIONS: { value: Prioridad; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const ESTADO_OPTIONS: { value: Estado; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'terminado', label: 'Terminado' },
];

// Serializes the fields that matter for dirty-tracking (edit mode only) —
// labels and other display-only data are excluded, `tiposServicio` is
// reduced to a sorted id list so re-adding-then-removing-in-a-different-
// order still compares equal. Mirrors productos/editar's `isFormDirty`.
function serializeForm(values: OrdenServicioFormValues): string {
  return JSON.stringify({
    clienteId: values.clienteId,
    vehiculoId: values.vehiculoId,
    mecanicoId: values.mecanicoId,
    prioridad: values.prioridad,
    estado: values.estado,
    fechaIngreso: values.fechaIngreso,
    kilometros: values.kilometros,
    motivoIngreso: values.motivoIngreso,
    tiposServicioIds: values.tiposServicio.map((t) => t.id).sort((a, b) => a - b),
  });
}

/**
 * Shared create/edit form for `OrdenServicio` (design.md § Frontend
 * Component Plan). Owns the cascading cliente→vehículo state — the
 * vehículo picker is disabled until a cliente is chosen and resets whenever
 * the cliente changes (design.md DD3: `SearchableSelect` already clears its
 * displayed label when the controlled `value` becomes `''`, so resetting
 * `vehiculoId` here is sufficient).
 *
 * Validation follows the toast + ref-focus pattern established in
 * `productos/nuevo` and `productos/editar/[id]` (not native `required`
 * blocking) — see those files' `noValidate` fix. `required` attributes are
 * still present for a11y hints only.
 */
export default function OrdenServicioForm({
  mode,
  initialValues,
  submitting,
  submitLabel,
  submittingLabel,
  cancelHref,
  onSubmit,
}: OrdenServicioFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<OrdenServicioFormValues>(initialValues);
  const initialSnapshotRef = useRef(serializeForm(initialValues));
  const prevClienteIdRef = useRef(initialValues.clienteId);

  const clienteWrapperRef = useRef<HTMLDivElement>(null);
  const vehiculoWrapperRef = useRef<HTMLDivElement>(null);
  const mecanicoWrapperRef = useRef<HTMLDivElement>(null);
  const tiposWrapperRef = useRef<HTMLDivElement>(null);
  const fechaIngresoRef = useRef<HTMLInputElement>(null);
  const kilometrosRef = useRef<HTMLInputElement>(null);
  const motivoIngresoRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = mode === 'edit' && serializeForm(form) !== initialSnapshotRef.current;

  const updateField = <K extends keyof OrdenServicioFormValues>(
    field: K,
    value: OrdenServicioFormValues[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Reset the vehículo selection whenever the cliente actually changes (not
  // on mount, where prevClienteIdRef already matches the initial value).
  useEffect(() => {
    if (prevClienteIdRef.current !== '' && prevClienteIdRef.current !== form.clienteId) {
      updateField('vehiculoId', '');
    }
    prevClienteIdRef.current = form.clienteId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clienteId]);

  // Native tab-close/refresh guard — complements handleCancel's confirm
  // below; SweetAlert2 cannot intercept this browser-level exit path.
  useEffect(() => {
    if (mode !== 'edit') return;
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, mode]);

  const vehiculoSearch = async (term: string) => {
    if (form.clienteId === '') return [];
    const result = await listVehicles({
      page: 1,
      pageSize: 20,
      clienteId: form.clienteId,
      search: term || undefined,
    });
    return result.data.map((v) => ({ id: v.id, label: `${v.marca.marca} ${v.marca.modelo}` }));
  };

  const handleCancel = async () => {
    if (mode === 'edit' && isDirty) {
      const confirmed = await showConfirm({
        title: 'Descartar cambios',
        text: 'Tenés cambios sin guardar. ¿Seguro que querés salir sin guardar?',
        confirmButtonText: 'Sí, descartar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }
    router.push(cancelHref);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    // First invalid required field, in form order — used to focus it after
    // the alert.
    const invalidField =
      form.clienteId === ''
        ? 'cliente'
        : form.vehiculoId === ''
          ? 'vehiculo'
          : form.mecanicoId === ''
            ? 'mecanico'
            : form.fechaIngreso === ''
              ? 'fechaIngreso'
              : form.kilometros === '' || form.kilometros < 0 || !Number.isInteger(form.kilometros)
                ? 'kilometros'
                : form.motivoIngreso.trim() === ''
                  ? 'motivoIngreso'
                  : form.tiposServicio.length === 0
                    ? 'tiposServicio'
                    : null;

    if (invalidField) {
      showError('Campos incompletos', 'Debe completar los campos obligatorios');
      setTimeout(() => {
        const focusWrapper = (ref: React.RefObject<HTMLDivElement>) => {
          const target = ref.current?.querySelector('button, input, textarea') as HTMLElement | null;
          target?.focus();
          ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        const focusInput = (ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement>) => {
          ref.current?.focus();
          ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        switch (invalidField) {
          case 'cliente':
            focusWrapper(clienteWrapperRef);
            break;
          case 'vehiculo':
            focusWrapper(vehiculoWrapperRef);
            break;
          case 'mecanico':
            focusWrapper(mecanicoWrapperRef);
            break;
          case 'fechaIngreso':
            focusInput(fechaIngresoRef);
            break;
          case 'kilometros':
            focusInput(kilometrosRef);
            break;
          case 'motivoIngreso':
            focusInput(motivoIngresoRef);
            break;
          case 'tiposServicio':
            focusWrapper(tiposWrapperRef);
            break;
        }
      }, 0);
      return;
    }

    const payload: CreateOrdenServicioPayload = {
      fechaIngreso: form.fechaIngreso || undefined,
      kilometros: Number(form.kilometros),
      prioridad: form.prioridad,
      motivoIngreso: form.motivoIngreso.trim(),
      estado: form.estado,
      clienteId: Number(form.clienteId),
      vehiculoId: Number(form.vehiculoId),
      mecanicoId: Number(form.mecanicoId),
      tipoServicioIds: form.tiposServicio.map((t) => t.id),
    };
    onSubmit(payload);
  };

  return (
    // noValidate: HTML's native required-field validation can silently block
    // submission instead of running handleSubmit's own toast+focus
    // validation — see the productos/nuevo & productos/editar fix.
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
        Cliente y vehículo
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div ref={clienteWrapperRef}>
          <SearchableSelect
            label="Cliente"
            placeholder="Seleccioná un cliente"
            value={form.clienteId}
            initialLabel={form.clienteLabel}
            onChange={(id) => updateField('clienteId', id)}
            autoFocus
            {...clienteSelectConfig}
          />
        </div>

        <div ref={vehiculoWrapperRef}>
          <SearchableSelect
            label="Vehículo"
            placeholder={form.clienteId === '' ? 'Elegí primero un cliente' : 'Seleccioná un vehículo'}
            value={form.vehiculoId}
            initialLabel={form.vehiculoLabel}
            onChange={(id) => updateField('vehiculoId', id)}
            search={vehiculoSearch}
            disabled={form.clienteId === ''}
          />
        </div>
      </div>

      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
        Datos de la orden
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div ref={mecanicoWrapperRef}>
          <SearchableSelect
            label="Mecánico"
            placeholder="Seleccioná un mecánico"
            value={form.mecanicoId}
            initialLabel={form.mecanicoLabel}
            onChange={(id) => updateField('mecanicoId', id)}
            {...mecanicoSelectConfig}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="prioridad" className="text-sm font-medium text-stone-700">
            Prioridad <span className="text-rose-500">*</span>
          </label>
          <select
            id="prioridad"
            value={form.prioridad}
            onChange={(e) => updateField('prioridad', e.target.value as Prioridad)}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          >
            {PRIORIDAD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="estado" className="text-sm font-medium text-stone-700">
            Estado <span className="text-rose-500">*</span>
          </label>
          <select
            id="estado"
            value={form.estado}
            onChange={(e) => updateField('estado', e.target.value as Estado)}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          >
            {ESTADO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="fechaIngreso" className="text-sm font-medium text-stone-700">
            Fecha de ingreso <span className="text-rose-500">*</span>
          </label>
          <input
            id="fechaIngreso"
            ref={fechaIngresoRef}
            type="date"
            value={form.fechaIngreso}
            onChange={(e) => updateField('fechaIngreso', e.target.value)}
            required
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="kilometros" className="text-sm font-medium text-stone-700">
            Kilómetros <span className="text-rose-500">*</span>
          </label>
          <input
            id="kilometros"
            ref={kilometrosRef}
            type="number"
            onWheel={(e) => e.currentTarget.blur()}
            min={0}
            value={form.kilometros}
            onChange={(e) => updateField('kilometros', e.target.value ? Number(e.target.value) : '')}
            required
            placeholder="Ej: 50000"
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
        </div>
      </div>

      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
        Motivo y tipos de servicio
      </h2>
      <div className="space-y-1">
        <label htmlFor="motivoIngreso" className="text-sm font-medium text-stone-700">
          Motivo de ingreso <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="motivoIngreso"
          ref={motivoIngresoRef}
          value={form.motivoIngreso}
          onChange={(e) => updateField('motivoIngreso', e.target.value)}
          required
          rows={3}
          placeholder="Ej: Ruido en el motor al acelerar"
          className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-stone-700">
          Tipos de servicio <span className="text-rose-500">*</span>
        </label>
        <div ref={tiposWrapperRef}>
          <TipoServicioMultiSelect
            value={form.tiposServicio.map((t) => t.id)}
            selected={form.tiposServicio}
            onChange={(selected) => updateField('tiposServicio', selected)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
