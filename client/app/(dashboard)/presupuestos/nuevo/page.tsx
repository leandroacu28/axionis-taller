'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useRef, useState } from 'react';
import { createPresupuesto, type CreatePresupuestoProductoPayload } from '../../../lib/presupuestos';
import { getProducto } from '../../../lib/productos';
import { showError, showSuccess } from '../../../lib/alerts';
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

export default function NuevoPresupuestoPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [staged, setStaged] = useState<PresupuestoLineaEditable[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fechaRef = useRef<HTMLInputElement>(null);
  // Synthetic ids for staged (not-yet-persisted) lines — the server assigns
  // real ids on POST. Decrementing avoids any collision with real ids
  // (always positive).
  const nextLocalId = useRef(-1);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Staged onAdd: mirrors the server's freeze/sum-on-duplicate behavior
  // locally so the preview matches what POST /presupuestos will actually
  // freeze (design.md Decision A1) — the server is still the sole authority;
  // this is display-only.
  const handleStagedAdd = async (productoId: number, cantidad: number) => {
    const existing = staged.find((l) => l.producto.id === productoId);
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
    if (producto.precioVenta == null) {
      throw new Error('El producto no tiene un precio de venta definido.');
    }
    const precioUnitario = Number(producto.precioVenta);
    const precioTotal = precioUnitario * cantidad;
    const newLine: PresupuestoLineaEditable = {
      id: nextLocalId.current--,
      cantidad: String(cantidad),
      precioUnitario: String(precioUnitario),
      precioTotal: String(precioTotal),
      producto: { id: producto.id, descripcion: producto.descripcion },
    };
    setStaged((prev) => [...prev, newLine]);
  };

  const handleStagedUpdate = async (lineId: number, cantidad: number) => {
    setStaged((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cantidad: String(cantidad), precioTotal: String(Number(l.precioUnitario) * cantidad) }
          : l,
      ),
    );
  };

  const handleStagedRemove = async (lineId: number) => {
    setStaged((prev) => prev.filter((l) => l.id !== lineId));
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
      const productos: CreatePresupuestoProductoPayload[] = staged.map((l) => ({
        productoId: l.producto.id,
        cantidad: Number(l.cantidad),
      }));
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
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Nuevo presupuesto</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Completá los datos para registrar un presupuesto.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
            Datos del presupuesto
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SearchableSelect
              label="Cliente"
              placeholder="Seleccionar cliente..."
              value={form.clienteId}
              onChange={(id) => updateField('clienteId', id)}
              search={clienteSelectConfig.search}
              create={clienteSelectConfig.create}
              quickCreate={clienteSelectConfig.quickCreate}
            />

            <SearchableSelect
              label="Tipo de servicio"
              placeholder="Seleccionar tipo de servicio..."
              value={form.tipoServicioId}
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
            onUpdate={handleStagedUpdate}
            onRemove={handleStagedRemove}
          />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear presupuesto'}
            </button>
            <Link
              href="/presupuestos"
              className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
