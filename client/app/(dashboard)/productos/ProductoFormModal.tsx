'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import {
  createProducto,
  updateProducto,
  type ProductoListItem,
  type CreateProductoPayload,
  type UpdateProductoPayload,
} from '../../lib/productos';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';
import UnidadMedidaSelect from './UnidadMedidaSelect';

interface FormState {
  descripcion: string;
  unidadMedidaId: number | '';
  cantidadInicial: number | '';
  alertaStock: boolean;
  cantidadMinima: number | '';
  precioCompra: number | '';
  porcentajeGanancia: number | '';
  precioMayorista: number | '';
  alicuotaIva: 21 | 10.5;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  descripcion: '',
  unidadMedidaId: '',
  cantidadInicial: '',
  alertaStock: false,
  cantidadMinima: '',
  precioCompra: '',
  porcentajeGanancia: '',
  precioMayorista: '',
  alicuotaIva: 21,
  activo: true,
};

// Shallow-compares every FormState field against the load-time baseline.
// Used to derive `isDirty` so the unsaved-edit warning never false-positives
// when a field is edited back to its original value.
function isFormDirty(current: FormState, baseline: FormState | null): boolean {
  if (!baseline) return false;
  return (Object.keys(current) as Array<keyof FormState>).some(
    (key) => current[key] !== baseline[key],
  );
}

// Client-side mirror of `ProductosService.computePrecioVenta` — display-only,
// for immediate feedback as the user types. The server remains the source of
// truth: `precioVenta` is never part of the submitted payload (D1). Rounds
// half-up to 2 decimals (matching the server's Prisma.Decimal ROUND_HALF_UP)
// to avoid the preview drifting a cent from the saved value at rounding
// boundaries — plain `* (1 + x/100)` float math alone can disagree with the
// server's Decimal arithmetic right at the halfway point.
function computePrecioVentaPreview(
  precioCompra: number | '',
  porcentajeGanancia: number | '',
): number | null {
  if (precioCompra === '' || porcentajeGanancia === '') return null;
  const raw = precioCompra * (1 + porcentajeGanancia / 100);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

interface ProductoFormModalProps {
  open: boolean;
  onClose: () => void;
  producto: ProductoListItem | null;
  onSaved: () => void;
}

export default function ProductoFormModal({ open, onClose, producto, onSaved }: ProductoFormModalProps) {
  const isEdit = producto !== null;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const initialFormRef = useRef<FormState | null>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);

  const isDirty = isEdit && isFormDirty(form, initialFormRef.current);
  const precioVentaPreview = computePrecioVentaPreview(form.precioCompra, form.porcentajeGanancia);

  useEffect(() => {
    if (!open) return;
    const loaded: FormState = producto
      ? {
          descripcion: producto.descripcion,
          unidadMedidaId: producto.unidadMedidaId,
          cantidadInicial: Number(producto.cantidadInicial),
          alertaStock: producto.alertaStock,
          cantidadMinima: Number(producto.cantidadMinima),
          precioCompra: Number(producto.precioCompra),
          porcentajeGanancia: Number(producto.porcentajeGanancia),
          precioMayorista: Number(producto.precioMayorista),
          alicuotaIva: producto.alicuotaIva,
          activo: producto.activo,
        }
      : EMPTY_FORM;
    setForm(loaded);
    initialFormRef.current = isEdit ? loaded : null;
    descripcionRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto]);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleClose = async () => {
    if (isDirty) {
      const confirmed = await showConfirm({
        title: 'Descartar cambios',
        text: 'Tenés cambios sin guardar. ¿Seguro que querés salir sin guardar?',
        confirmButtonText: 'Sí, descartar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (
      form.descripcion.trim() === '' ||
      form.unidadMedidaId === '' ||
      form.cantidadInicial === '' ||
      form.cantidadMinima === '' ||
      form.precioCompra === '' ||
      form.porcentajeGanancia === '' ||
      form.precioMayorista === ''
    ) {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setSubmitting(true);
    try {
      const basePayload: CreateProductoPayload = {
        descripcion: form.descripcion.trim(),
        unidadMedidaId: form.unidadMedidaId,
        cantidadInicial: form.cantidadInicial,
        alertaStock: form.alertaStock,
        cantidadMinima: form.cantidadMinima,
        precioCompra: form.precioCompra,
        porcentajeGanancia: form.porcentajeGanancia,
        precioMayorista: form.precioMayorista,
        alicuotaIva: form.alicuotaIva,
      };

      if (isEdit && producto) {
        const payload: UpdateProductoPayload = { ...basePayload, activo: form.activo };
        await updateProducto(producto.id, payload);
        showSuccess('Producto actualizado', 'Los cambios se guardaron correctamente.');
      } else {
        await createProducto(basePayload);
        showSuccess('Producto creado', 'El producto ha sido creado correctamente.');
      }
      onSaved();
    } catch (err) {
      showError(
        isEdit ? 'Error al actualizar producto' : 'Error al crear producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Editar producto' : 'Nuevo producto'}
      description={
        isEdit
          ? 'Modificá los datos del producto.'
          : 'Completá los datos para registrar un producto.'
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <div className="space-y-1">
          <label htmlFor="descripcion" className="text-sm font-medium text-stone-700">
            Descripción <span className="text-rose-500">*</span>
          </label>
          <input
            id="descripcion"
            ref={descripcionRef}
            type="text"
            value={form.descripcion}
            onChange={(e) => updateField('descripcion', e.target.value)}
            required
            placeholder="Ej: Aceite 10W40"
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
        </div>

        <UnidadMedidaSelect
          value={form.unidadMedidaId}
          initialLabel={producto?.unidadMedida.descripcion}
          onChange={(id) => updateField('unidadMedidaId', id)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="precioCompra" className="text-sm font-medium text-stone-700">
              Precio de Compra <span className="text-rose-500">*</span>
            </label>
            <input
              id="precioCompra"
              type="number"
              min={0}
              step="0.01"
              value={form.precioCompra}
              onChange={(e) => updateField('precioCompra', e.target.value ? Number(e.target.value) : '')}
              required
              placeholder="Ej: 100.00"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="porcentajeGanancia" className="text-sm font-medium text-stone-700">
              % Ganancia <span className="text-rose-500">*</span>
            </label>
            <input
              id="porcentajeGanancia"
              type="number"
              min={0}
              step="0.01"
              value={form.porcentajeGanancia}
              onChange={(e) =>
                updateField('porcentajeGanancia', e.target.value ? Number(e.target.value) : '')
              }
              required
              placeholder="Ej: 20"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium text-stone-700">Precio de Venta</span>
          <div className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-stone-500">
            {precioVentaPreview !== null
              ? `≈ $${precioVentaPreview.toFixed(2)}`
              : 'Se calcula al guardar'}
          </div>
          <p className="text-xs text-stone-400">
            Estimado a partir del precio de compra y el % de ganancia — el valor definitivo se
            calcula al guardar y puede diferir por centavos.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="precioMayorista" className="text-sm font-medium text-stone-700">
              Precio Mayorista <span className="text-rose-500">*</span>
            </label>
            <input
              id="precioMayorista"
              type="number"
              min={0}
              step="0.01"
              value={form.precioMayorista}
              onChange={(e) =>
                updateField('precioMayorista', e.target.value ? Number(e.target.value) : '')
              }
              required
              placeholder="Ej: 130.00"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="alicuotaIva" className="text-sm font-medium text-stone-700">
              Alícuota IVA <span className="text-rose-500">*</span>
            </label>
            <select
              id="alicuotaIva"
              value={form.alicuotaIva}
              onChange={(e) => updateField('alicuotaIva', Number(e.target.value) as 21 | 10.5)}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            >
              <option value={21}>21%</option>
              <option value={10.5}>10,5%</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="cantidadInicial" className="text-sm font-medium text-stone-700">
              Cantidad Actual <span className="text-rose-500">*</span>
            </label>
            <input
              id="cantidadInicial"
              type="number"
              min={0}
              step="0.01"
              value={form.cantidadInicial}
              onChange={(e) =>
                updateField('cantidadInicial', e.target.value ? Number(e.target.value) : '')
              }
              required
              placeholder="Ej: 10"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="cantidadMinima" className="text-sm font-medium text-stone-700">
              Cantidad Mínima <span className="text-rose-500">*</span>
            </label>
            <input
              id="cantidadMinima"
              type="number"
              min={0}
              step="0.01"
              value={form.cantidadMinima}
              onChange={(e) =>
                updateField('cantidadMinima', e.target.value ? Number(e.target.value) : '')
              }
              required
              placeholder="Ej: 2"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="alertaStock"
            type="checkbox"
            checked={form.alertaStock}
            onChange={(e) => updateField('alertaStock', e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-rose-500 focus:ring-rose-400"
          />
          <label htmlFor="alertaStock" className="text-sm font-medium text-stone-700">
            Avisar cuando el stock esté por debajo de la cantidad mínima
          </label>
        </div>

        {isEdit && (
          <div className="flex items-center gap-2">
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
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? isEdit
                ? 'Guardando...'
                : 'Creando...'
              : isEdit
                ? 'Guardar cambios'
                : 'Crear producto'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
