'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  addPresupuestoProducto,
  getPresupuesto,
  removePresupuestoProducto,
  updatePresupuesto,
  updatePresupuestoProducto,
  type PresupuestoListItem,
  type UpdatePresupuestoPayload,
} from '../../../../lib/presupuestos';
import { showError, showSuccess } from '../../../../lib/alerts';
import SearchableSelect from '../../../vehiculos/SearchableSelect';
import { clienteSelectConfig, tipoServicioSelectConfig } from '../../../vehiculos/referenceSelectConfigs';
import PresupuestoProductosEditor, { type PresupuestoLineaEditable } from '../../PresupuestoProductosEditor';

interface FormState {
  fecha: string;
  clienteId: number | '';
  tipoServicioId: number | '';
  telefono: string;
  descripcion: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  fecha: '',
  clienteId: '',
  tipoServicioId: '',
  telefono: '',
  descripcion: '',
  activo: true,
};

function isFormDirty(current: FormState, baseline: FormState | null): boolean {
  if (!baseline) return false;
  return (Object.keys(current) as Array<keyof FormState>).some((key) => current[key] !== baseline[key]);
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
      />
    </svg>
  );
}

export default function EditarPresupuestoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const presupuestoId = Number(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [presupuesto, setPresupuesto] = useState<PresupuestoListItem | null>(null);
  const [lines, setLines] = useState<PresupuestoLineaEditable[]>([]);
  const initialFormRef = useRef<FormState | null>(null);
  const fechaRef = useRef<HTMLInputElement>(null);

  const isDirty = isFormDirty(form, initialFormRef.current);

  useEffect(() => {
    let cancelled = false;

    const loadPresupuesto = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const loaded = await getPresupuesto(presupuestoId);
        if (cancelled) return;
        const loadedForm: FormState = {
          fecha: loaded.fecha.slice(0, 10),
          clienteId: loaded.cliente.id,
          tipoServicioId: loaded.tipoServicio.id,
          telefono: loaded.telefono ?? '',
          descripcion: loaded.descripcion ?? '',
          activo: loaded.activo,
        };
        setForm(loadedForm);
        initialFormRef.current = loadedForm;
        setPresupuesto(loaded);
        setLines(
          loaded.productos.map((p) => ({
            id: p.id,
            cantidad: p.cantidad,
            precioUnitario: p.precioUnitario,
            precioTotal: p.precioTotal,
            producto: p.producto,
            descripcionPersonalizada: p.descripcionPersonalizada,
          })),
        );
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPresupuesto();

    return () => {
      cancelled = true;
    };
  }, [presupuestoId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (form.fecha === '' || form.clienteId === '' || form.tipoServicioId === '') {
      showError('Campos incompletos', 'Debe completar los campos obligatorios');
      fechaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const payload: UpdatePresupuestoPayload = {
        fecha: form.fecha,
        clienteId: Number(form.clienteId),
        tipoServicioId: Number(form.tipoServicioId),
        telefono: form.telefono.trim() || undefined,
        descripcion: form.descripcion.trim() || undefined,
        activo: form.activo,
      };
      await updatePresupuesto(presupuestoId, payload);
      initialFormRef.current = form;
      showSuccess('Presupuesto actualizado', 'Los cambios se guardaron correctamente.');
      router.push('/presupuestos');
    } catch (err) {
      showError(
        'Error al actualizar presupuesto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Live handlers (Decision A1): each hits its sub-route immediately and
  // upserts/removes the returned line into local state — no full page
  // reload, mirrors ordenes-trabajo's ProductosConsumidos.
  const handleLiveAdd = async (productoId: number, cantidad: number, precioUnitario?: number) => {
    const linea = await addPresupuestoProducto(presupuestoId, { productoId, cantidad, precioUnitario });
    setLines((prev) => {
      const exists = prev.some((l) => l.id === linea.id);
      return exists ? prev.map((l) => (l.id === linea.id ? linea : l)) : [...prev, linea];
    });
  };

  const handleLiveAddCustom = async (descripcion: string, cantidad: number, precioUnitario: number) => {
    const linea = await addPresupuestoProducto(presupuestoId, {
      descripcionPersonalizada: descripcion,
      cantidad,
      precioUnitario,
    });
    setLines((prev) => {
      const exists = prev.some((l) => l.id === linea.id);
      return exists ? prev.map((l) => (l.id === linea.id ? linea : l)) : [...prev, linea];
    });
  };

  const handleLiveUpdate = async (lineId: number, cantidad: number, precioUnitario?: number) => {
    const current = lines.find((l) => l.id === lineId);
    // productoId is optional here: the update endpoint never reads dto.productoId
    // (see updateProducto in presupuestos.service.ts), and current?.producto
    // can now be null for a custom item.
    const linea = await updatePresupuestoProducto(presupuestoId, lineId, {
      productoId: current?.producto?.id,
      cantidad,
      precioUnitario,
    });
    setLines((prev) => prev.map((l) => (l.id === linea.id ? linea : l)));
  };

  const handleLiveRemove = async (lineId: number) => {
    await removePresupuestoProducto(presupuestoId, lineId);
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/presupuestos"
            className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Editar presupuesto</h1>
          <span className="rounded-lg bg-stone-100 px-3 py-1.5 text-base font-semibold text-stone-600">
            #{presupuestoId}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/presupuestos/nuevo?copyFrom=${presupuestoId}`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            <CopyIcon />
            Copiar
          </Link>
          <button
            type="submit"
            form="editar-presupuesto-form"
            disabled={loading || !!loadError || submitting}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando presupuesto...
        </div>
      ) : loadError || !presupuesto ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError || 'No se pudo cargar el presupuesto.'}</span>
          </div>
          <Link
            href="/presupuestos"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <form id="editar-presupuesto-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
              Datos del presupuesto
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SearchableSelect
                label="Cliente"
                placeholder="Seleccionar cliente..."
                value={form.clienteId}
                initialLabel={presupuesto.cliente.razonSocial}
                onChange={(id) => updateField('clienteId', id)}
                search={clienteSelectConfig.search}
                create={clienteSelectConfig.create}
                quickCreate={clienteSelectConfig.quickCreate}
              />

              <SearchableSelect
                label="Tipo de servicio"
                placeholder="Seleccionar tipo de servicio..."
                value={form.tipoServicioId}
                initialLabel={presupuesto.tipoServicio.descripcion}
                onChange={(id) => updateField('tipoServicioId', id)}
                search={tipoServicioSelectConfig.search}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="fecha" className="text-sm font-medium text-stone-700">
                  Fecha <span className="text-rose-500">*</span>
                </label>
                <input
                  id="fecha"
                  ref={fechaRef}
                  type="date"
                  value={form.fecha}
                  onChange={(e) => updateField('fecha', e.target.value)}
                  required
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="telefono" className="text-sm font-medium text-stone-700">
                  Teléfono
                </label>
                <input
                  id="telefono"
                  type="text"
                  value={form.telefono}
                  onChange={(e) => updateField('telefono', e.target.value)}
                  placeholder="Ej: 1145678900"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div aria-hidden="true" />
            </div>

            <div className="space-y-1">
              <label htmlFor="descripcion" className="text-sm font-medium text-stone-700">
                Descripción
              </label>
              <textarea
                id="descripcion"
                value={form.descripcion}
                onChange={(e) => updateField('descripcion', e.target.value)}
                rows={3}
                placeholder="Detalle del presupuesto"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="hidden items-center gap-2">
              <input
                id="activo"
                type="checkbox"
                checked={form.activo}
                onChange={(e) => updateField('activo', e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-rose-500 focus:ring-rose-400"
              />
              <label htmlFor="activo" className="text-sm font-medium text-stone-700">
                Activo
              </label>
            </div>

            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
              Productos
            </h2>

            <PresupuestoProductosEditor
              mode="live"
              lines={lines}
              onAdd={handleLiveAdd}
              onAddCustom={handleLiveAddCustom}
              onUpdate={handleLiveUpdate}
              onRemove={handleLiveRemove}
            />

          </form>
        </div>
      )}
    </div>
  );
}
