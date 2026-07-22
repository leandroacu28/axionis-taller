'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  createPresupuesto,
  getPresupuesto,
  type CreatePresupuestoProductoPayload,
} from '../../../lib/presupuestos';
import { getProducto } from '../../../lib/productos';
import { showConfirm, showError, showSuccess } from '../../../lib/alerts';
import SearchableSelect from '../../vehiculos/SearchableSelect';
import { clienteSelectConfig, tipoServicioSelectConfig } from '../../vehiculos/referenceSelectConfigs';
import PresupuestoProductosEditor, { type PresupuestoLineaEditable } from '../PresupuestoProductosEditor';

interface FormState {
  fecha: string;
  clienteId: number | '';
  tipoServicioId: number | '';
  telefono: string;
  descripcion: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: FormState = {
  fecha: todayIso(),
  clienteId: '',
  tipoServicioId: '',
  telefono: '',
  descripcion: '',
};

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function TrashIcon() {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

export default function NuevoPresupuestoPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [staged, setStaged] = useState<PresupuestoLineaEditable[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [clienteInitialLabel, setClienteInitialLabel] = useState<string | undefined>(undefined);
  const [tipoServicioInitialLabel, setTipoServicioInitialLabel] = useState<string | undefined>(undefined);
  const fechaRef = useRef<HTMLInputElement>(null);
  // Synthetic ids for staged (not-yet-persisted) lines — the server assigns
  // real ids on POST. Decrementing avoids any collision with real ids
  // (always positive).
  const nextLocalId = useRef(-1);

  // "Copiar" from an existing presupuesto (editar/[id]'s Copiar button) lands
  // here as ?copyFrom=<id> — read via window.location instead of
  // useSearchParams to avoid a Suspense-boundary requirement for a one-off
  // read on mount.
  useEffect(() => {
    const copyFromId = Number(new URLSearchParams(window.location.search).get('copyFrom'));
    if (!copyFromId) return;

    getPresupuesto(copyFromId)
      .then((source) => {
        setForm({
          fecha: todayIso(),
          clienteId: source.cliente.id,
          tipoServicioId: source.tipoServicio.id,
          telefono: source.telefono ?? '',
          descripcion: source.descripcion ?? '',
        });
        setClienteInitialLabel(source.cliente.razonSocial);
        setTipoServicioInitialLabel(source.tipoServicio.descripcion);
        setStaged(
          source.productos.map((p) => ({
            id: nextLocalId.current--,
            cantidad: p.cantidad,
            precioUnitario: p.precioUnitario,
            precioTotal: p.precioTotal,
            producto: p.producto ? { id: p.producto.id, descripcion: p.producto.descripcion } : null,
            descripcionPersonalizada: p.descripcionPersonalizada,
          })),
        );
      })
      .catch((err) => {
        showError(
          'No se pudo copiar el presupuesto',
          err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
        );
      });
  }, []);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Staged onAdd: mirrors the server's freeze/sum-on-duplicate behavior
  // locally so the preview matches what POST /presupuestos will actually
  // freeze (design.md Decision A1) — the server is still the sole authority;
  // this is display-only.
  const handleStagedAdd = async (productoId: number, cantidad: number, precioUnitarioOverride?: number) => {
    const existing = staged.find((l) => l.producto?.id === productoId);
    if (existing) {
      const nuevaCantidad = Number(existing.cantidad) + cantidad;
      const precioTotal = Number(existing.precioUnitario) * nuevaCantidad;
      setStaged((prev) =>
        prev.map((l) =>
          l.id === existing.id
            ? { ...l, cantidad: String(nuevaCantidad), precioTotal: String(precioTotal) }
            : l,
        ),
      );
      return;
    }

    const producto = await getProducto(productoId);
    if (precioUnitarioOverride == null && producto.precioVenta == null) {
      throw new Error('El producto no tiene un precio de venta definido.');
    }
    const precioUnitario = precioUnitarioOverride ?? Number(producto.precioVenta);
    const precioTotal = precioUnitario * cantidad;
    const newLine: PresupuestoLineaEditable = {
      id: nextLocalId.current--,
      cantidad: String(cantidad),
      precioUnitario: String(precioUnitario),
      precioTotal: String(precioTotal),
      producto: { id: producto.id, descripcion: producto.descripcion },
      descripcionPersonalizada: null,
    };
    setStaged((prev) => [...prev, newLine]);
  };

  // Staged onAddCustom: no dedupe/merge — every custom item is always a new
  // staged line, mirrors the backend's addProductoLine custom branch.
  const handleStagedAddCustom = async (descripcion: string, cantidad: number, precioUnitario: number) => {
    const precioTotal = precioUnitario * cantidad;
    const newLine: PresupuestoLineaEditable = {
      id: nextLocalId.current--,
      cantidad: String(cantidad),
      precioUnitario: String(precioUnitario),
      precioTotal: String(precioTotal),
      producto: null,
      descripcionPersonalizada: descripcion,
    };
    setStaged((prev) => [...prev, newLine]);
  };

  const handleStagedUpdate = async (lineId: number, cantidad: number, precioUnitarioOverride?: number) => {
    setStaged((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const precioUnitario = precioUnitarioOverride ?? Number(l.precioUnitario);
        return {
          ...l,
          cantidad: String(cantidad),
          ...(precioUnitarioOverride != null ? { precioUnitario: String(precioUnitario) } : {}),
          precioTotal: String(precioUnitario * cantidad),
        };
      }),
    );
  };

  const handleStagedRemove = async (lineId: number) => {
    setStaged((prev) => prev.filter((l) => l.id !== lineId));
  };

  const handleVaciar = async () => {
    const confirmed = await showConfirm({
      title: 'Vaciar presupuesto',
      text: 'Se van a borrar todos los datos ingresados y los productos agregados. ¿Confirmás?',
      confirmButtonText: 'Sí, vaciar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmed) return;
    setForm(EMPTY_FORM);
    setStaged([]);
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
      // Always includes precioUnitario — omitting it previously discarded any
      // price override the user set while staging (Buscar producto's
      // editable precio, or Actualizar producto), silently re-deriving the
      // catalog price on submit instead.
      const productos: CreatePresupuestoProductoPayload[] = staged.map((l) =>
        l.producto
          ? { productoId: l.producto.id, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) }
          : {
              descripcionPersonalizada: l.descripcionPersonalizada ?? '',
              cantidad: Number(l.cantidad),
              precioUnitario: Number(l.precioUnitario),
            },
      );
      await createPresupuesto({
        fecha: form.fecha,
        clienteId: Number(form.clienteId),
        tipoServicioId: Number(form.tipoServicioId),
        telefono: form.telefono.trim() || undefined,
        descripcion: form.descripcion.trim() || undefined,
        productos: productos.length > 0 ? productos : undefined,
      });
      showSuccess('Presupuesto creado', 'El presupuesto ha sido creado correctamente.');
      router.push('/presupuestos');
    } catch (err) {
      showError(
        'Error al crear presupuesto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
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
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Nuevo presupuesto</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleVaciar}
            disabled={submitting}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <TrashIcon />
            Vaciar
          </button>
          <button
            type="submit"
            form="nuevo-presupuesto-form"
            disabled={submitting}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckIcon />
            {submitting ? 'Generando...' : 'Generar'}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <form id="nuevo-presupuesto-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
            Datos del presupuesto
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SearchableSelect
              label="Cliente"
              placeholder="Seleccionar cliente..."
              value={form.clienteId}
              initialLabel={clienteInitialLabel}
              onChange={(id) => updateField('clienteId', id)}
              search={clienteSelectConfig.search}
              create={clienteSelectConfig.create}
              quickCreate={clienteSelectConfig.quickCreate}
            />

            <SearchableSelect
              label="Tipo de servicio"
              placeholder="Seleccionar tipo de servicio..."
              value={form.tipoServicioId}
              initialLabel={tipoServicioInitialLabel}
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

          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
            Productos
          </h2>

          <PresupuestoProductosEditor
            mode="staged"
            lines={staged}
            onAdd={handleStagedAdd}
            onAddCustom={handleStagedAddCustom}
            onUpdate={handleStagedUpdate}
            onRemove={handleStagedRemove}
          />

        </form>
      </div>
    </div>
  );
}
