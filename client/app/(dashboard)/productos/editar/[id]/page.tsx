'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  getProducto,
  updateProducto,
  type UpdateProductoPayload,
  type ProductoListItem,
} from '../../../../lib/productos';
import { showConfirm, showError, showSuccess } from '../../../../lib/alerts';
import UnidadMedidaSelect from '../../UnidadMedidaSelect';

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
// truth: `precioVenta` is never part of the submitted payload. Rounds
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

export default function EditarProductoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const productoId = Number(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [producto, setProducto] = useState<ProductoListItem | null>(null);
  const initialFormRef = useRef<FormState | null>(null);

  const isDirty = isFormDirty(form, initialFormRef.current);
  const precioVentaPreview = computePrecioVentaPreview(form.precioCompra, form.porcentajeGanancia);

  useEffect(() => {
    let cancelled = false;

    const loadProducto = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const loadedProducto = await getProducto(productoId);
        if (cancelled) return;
        const loaded: FormState = {
          descripcion: loadedProducto.descripcion,
          unidadMedidaId: loadedProducto.unidadMedidaId,
          cantidadInicial: Number(loadedProducto.cantidadInicial),
          alertaStock: loadedProducto.alertaStock,
          cantidadMinima: Number(loadedProducto.cantidadMinima),
          precioCompra: Number(loadedProducto.precioCompra),
          porcentajeGanancia: Number(loadedProducto.porcentajeGanancia),
          precioMayorista: Number(loadedProducto.precioMayorista),
          alicuotaIva: loadedProducto.alicuotaIva,
          activo: loadedProducto.activo,
        };
        setForm(loaded);
        initialFormRef.current = loaded;
        setProducto(loadedProducto);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProducto();

    return () => {
      cancelled = true;
    };
  }, [productoId]);

  // Native tab-close/refresh guard — complements the in-app `handleCancel`
  // confirm below; SweetAlert2 cannot intercept this browser-level exit path.
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

  const handleCancel = async () => {
    if (isDirty) {
      const confirmed = await showConfirm({
        title: 'Descartar cambios',
        text: 'Tenés cambios sin guardar. ¿Seguro que querés salir sin guardar?',
        confirmButtonText: 'Sí, descartar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }
    router.push('/productos');
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
      const payload: UpdateProductoPayload = {
        descripcion: form.descripcion.trim(),
        unidadMedidaId: Number(form.unidadMedidaId),
        cantidadInicial: Number(form.cantidadInicial),
        alertaStock: form.alertaStock,
        cantidadMinima: Number(form.cantidadMinima),
        precioCompra: Number(form.precioCompra),
        porcentajeGanancia: Number(form.porcentajeGanancia),
        precioMayorista: Number(form.precioMayorista),
        alicuotaIva: form.alicuotaIva,
        activo: form.activo,
      };
      await updateProducto(productoId, payload);
      // Reset the dirty baseline before navigating away so the post-save
      // redirect never trips the beforeunload/handleCancel guards.
      initialFormRef.current = form;
      showSuccess('Producto actualizado', 'Los cambios se guardaron correctamente.');
      router.push('/productos');
    } catch (err) {
      showError(
        'Error al actualizar producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Editar producto</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {loading ? 'Cargando datos del producto...' : 'Modificá los datos del producto.'}
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando producto...
        </div>
      ) : loadError ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError}</span>
          </div>
          <Link
            href="/productos"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label htmlFor="descripcion" className="text-sm font-medium text-stone-700">
                Descripción <span className="text-rose-500">*</span>
              </label>
              <input
                id="descripcion"
                type="text"
                autoFocus
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

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Guardando...' : 'Guardar cambios'}
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
        </div>
      )}
    </div>
  );
}
