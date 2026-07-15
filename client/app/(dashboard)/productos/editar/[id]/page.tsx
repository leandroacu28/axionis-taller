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
import UnidadMedidaSelect, { type UnidadMedidaSelectHandle } from '../../UnidadMedidaSelect';
import EtiquetasMultiSelect from '../../EtiquetasMultiSelect';

interface FormState {
  descripcion: string;
  codigo: string;
  unidadMedidaId: number | '';
  cantidadInicial: number | '';
  alertaStock: boolean;
  cantidadMinima: number | '';
  precioCompra: number | '';
  porcentajeGanancia: number | '';
  precioVenta: number | '';
  precioMayorista: number | '';
  alicuotaIva: 21 | 10.5 | 0;
  activo: boolean;
  etiquetas: { id: number; label: string }[];
}

const EMPTY_FORM: FormState = {
  descripcion: '',
  codigo: '',
  unidadMedidaId: '',
  cantidadInicial: '',
  alertaStock: false,
  cantidadMinima: '',
  precioCompra: '',
  porcentajeGanancia: '',
  precioVenta: '',
  precioMayorista: '',
  alicuotaIva: 21,
  activo: true,
  etiquetas: [],
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

// precioVenta = precioCompra * (1 + porcentajeGanancia / 100), rounded
// half-up to 2 decimals (matching the server's Prisma.Decimal
// ROUND_HALF_UP). Requires precioCompra to auto-fill anything; if
// porcentajeGanancia is left empty, precioVenta just mirrors precioCompra
// (0% ganancia). The user can still override the result by typing directly
// into Precio de Venta afterward.
function computePrecioVenta(
  precioCompra: number | '',
  porcentajeGanancia: number | '',
): number | null {
  if (precioCompra === '') return null;
  if (porcentajeGanancia === '') return Math.round((precioCompra + Number.EPSILON) * 100) / 100;
  const raw = precioCompra * (1 + porcentajeGanancia / 100);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

type TabKey = 'datos' | 'etiquetas';

export default function EditarProductoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const productoId = Number(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [producto, setProducto] = useState<ProductoListItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('datos');
  const initialFormRef = useRef<FormState | null>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);
  const unidadMedidaRef = useRef<UnidadMedidaSelectHandle>(null);
  const cantidadMinimaRef = useRef<HTMLInputElement>(null);
  const precioVentaRef = useRef<HTMLInputElement>(null);

  const isDirty = isFormDirty(form, initialFormRef.current);

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
          codigo: loadedProducto.codigo ?? '',
          unidadMedidaId: loadedProducto.unidadMedidaId,
          cantidadInicial: Number(loadedProducto.cantidadInicial),
          alertaStock: loadedProducto.alertaStock,
          cantidadMinima: Number(loadedProducto.cantidadMinima),
          precioCompra: loadedProducto.precioCompra !== null ? Number(loadedProducto.precioCompra) : '',
          porcentajeGanancia:
            loadedProducto.porcentajeGanancia !== null ? Number(loadedProducto.porcentajeGanancia) : '',
          precioVenta: loadedProducto.precioVenta !== null ? Number(loadedProducto.precioVenta) : '',
          precioMayorista:
            loadedProducto.precioMayorista !== null ? Number(loadedProducto.precioMayorista) : '',
          alicuotaIva: loadedProducto.alicuotaIva,
          activo: loadedProducto.activo,
          etiquetas: loadedProducto.etiquetas.map((e) => ({ id: e.id, label: e.descripcion })),
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

  // Auto-fills Precio de Venta whenever BOTH precioCompra and
  // porcentajeGanancia end up with a value after this edit — precioCompra
  // alone does not trigger it. Wired into the two fields' onChange (rather
  // than a useEffect over form state) so it only fires on the user's own
  // edits, never as a side effect of the initial `getProducto` load.
  const updatePrecioCompraOrGanancia = (
    field: 'precioCompra' | 'porcentajeGanancia',
    value: number | '',
  ) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const computed = computePrecioVenta(next.precioCompra, next.porcentajeGanancia);
      return computed !== null ? { ...next, precioVenta: computed } : next;
    });
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

    // First invalid required field, in form order — used to focus it after
    // the alert (and to switch tabs first, since all four live in "datos").
    const invalidField =
      form.descripcion.trim() === ''
        ? 'descripcion'
        : form.unidadMedidaId === ''
          ? 'unidadMedida'
          : form.alertaStock && form.cantidadMinima === ''
            ? 'cantidadMinima'
            : form.precioVenta === ''
              ? 'precioVenta'
              : null;

    if (invalidField) {
      showError('Campos incompletos', 'Debe completar los campos obligatorios');
      if (activeTab !== 'datos') setActiveTab('datos');
      setTimeout(() => {
        if (invalidField === 'unidadMedida') {
          unidadMedidaRef.current?.focus();
          return;
        }
        const ref =
          invalidField === 'descripcion'
            ? descripcionRef
            : invalidField === 'cantidadMinima'
              ? cantidadMinimaRef
              : precioVentaRef;
        ref.current?.focus();
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }

    setSubmitting(true);
    try {
      const trimmedCodigo = form.codigo.trim();
      const payload: UpdateProductoPayload = {
        descripcion: form.descripcion.trim(),
        codigo: trimmedCodigo || null,
        unidadMedidaId: Number(form.unidadMedidaId),
        cantidadInicial: form.cantidadInicial === '' ? 0 : Number(form.cantidadInicial),
        alertaStock: form.alertaStock,
        cantidadMinima: form.cantidadMinima === '' ? 0 : Number(form.cantidadMinima),
        precioCompra: form.precioCompra === '' ? null : Number(form.precioCompra),
        porcentajeGanancia: form.porcentajeGanancia === '' ? null : Number(form.porcentajeGanancia),
        precioVenta: Number(form.precioVenta),
        precioMayorista: form.precioMayorista === '' ? null : Number(form.precioMayorista),
        alicuotaIva: form.alicuotaIva,
        activo: form.activo,
        etiquetaIds: form.etiquetas.map((e) => e.id),
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
          <div className="mb-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('datos')}
              className={`relative overflow-hidden rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'datos'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-stone-50 text-stone-500 hover:bg-stone-100'
              }`}
            >
              Datos de producto
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-center bg-rose-500 transition-transform duration-300 ease-out ${
                  activeTab === 'datos' ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('etiquetas')}
              className={`relative overflow-hidden rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'etiquetas'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-stone-50 text-stone-500 hover:bg-stone-100'
              }`}
            >
              Etiquetas
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-center bg-rose-500 transition-transform duration-300 ease-out ${
                  activeTab === 'etiquetas' ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>

            <div aria-hidden="true" className="rounded-t-lg bg-stone-50/60" />
          </div>

          {/* noValidate: HTML's native required-field validation runs before
              the submit event fires and can't focus a control hidden by the
              inactive tab's `hidden` class — it would silently block
              submission instead of running handleSubmit's own validation,
              which correctly switches tabs before focusing. */}
          <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4">
            <div className={activeTab === 'datos' ? 'grid grid-cols-1 gap-4' : 'hidden'}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
              Datos básicos
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="descripcion" className="text-sm font-medium text-stone-700">
                  Descripción <span className="text-rose-500">*</span>
                </label>
                <input
                  id="descripcion"
                  ref={descripcionRef}
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
                ref={unidadMedidaRef}
                value={form.unidadMedidaId}
                initialLabel={producto?.unidadMedida.descripcion}
                onChange={(id) => updateField('unidadMedidaId', id)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="codigo" className="text-sm font-medium text-stone-700">
                  Código
                </label>
                <input
                  id="codigo"
                  type="text"
                  value={form.codigo}
                  onChange={(e) => updateField('codigo', e.target.value)}
                  placeholder="Ej: A-1023"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div aria-hidden="true" />
            </div>

            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
              Cantidades y Stock
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="cantidadInicial" className="text-sm font-medium text-stone-700">
                  Cantidad Actual
                </label>
                <input
                  id="cantidadInicial"
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step="0.01"
                  value={form.cantidadInicial}
                  onChange={(e) =>
                    updateField('cantidadInicial', e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder="Ej: 10 (por defecto 0)"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="alertaStock" className="text-sm font-medium text-stone-700">
                  Alerta de Stock
                </label>
                <select
                  id="alertaStock"
                  value={form.alertaStock ? 'si' : 'no'}
                  onChange={(e) => updateField('alertaStock', e.target.value === 'si')}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="cantidadMinima" className="text-sm font-medium text-stone-700">
                  Cantidad Mínima {form.alertaStock && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="cantidadMinima"
                  ref={cantidadMinimaRef}
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step="0.01"
                  value={form.cantidadMinima}
                  onChange={(e) =>
                    updateField('cantidadMinima', e.target.value ? Number(e.target.value) : '')
                  }
                  required={form.alertaStock}
                  disabled={!form.alertaStock}
                  placeholder="Ej: 2"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                />
              </div>
            </div>

            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-3">
              Precio
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="precioCompra" className="text-sm font-medium text-stone-700">
                  Precio de Compra
                </label>
                <input
                  id="precioCompra"
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step="0.01"
                  value={form.precioCompra}
                  onChange={(e) =>
                    updatePrecioCompraOrGanancia('precioCompra', e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder="Ej: 100.00"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="porcentajeGanancia" className="text-sm font-medium text-stone-700">
                  % Ganancia
                </label>
                <input
                  id="porcentajeGanancia"
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step="0.01"
                  value={form.porcentajeGanancia}
                  onChange={(e) =>
                    updatePrecioCompraOrGanancia(
                      'porcentajeGanancia',
                      e.target.value ? Number(e.target.value) : '',
                    )
                  }
                  placeholder="Ej: 20"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="precioVenta" className="text-sm font-medium text-stone-700">
                  Precio de Venta <span className="text-rose-500">*</span>
                </label>
                <input
                  id="precioVenta"
                  ref={precioVentaRef}
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step="0.01"
                  value={form.precioVenta}
                  onChange={(e) => updateField('precioVenta', e.target.value ? Number(e.target.value) : '')}
                  required
                  placeholder="Ej: 120.00"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>
            <p className="text-xs text-stone-400">
              Se autocompleta con precio de compra + % de ganancia. Si solo completás el precio de
              compra, se autocompleta igual al precio de compra — también podés escribirlo
              manualmente.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="precioMayorista" className="text-sm font-medium text-stone-700">
                  Precio Mayorista
                </label>
                <input
                  id="precioMayorista"
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step="0.01"
                  value={form.precioMayorista}
                  onChange={(e) =>
                    updateField('precioMayorista', e.target.value ? Number(e.target.value) : '')
                  }
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
                  onChange={(e) => updateField('alicuotaIva', Number(e.target.value) as 21 | 10.5 | 0)}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                >
                  <option value={21}>21%</option>
                  <option value={10.5}>10,5%</option>
                  <option value={0}>Exento</option>
                </select>
              </div>
              <div aria-hidden="true" />
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
            </div>

            <div className={activeTab === 'etiquetas' ? 'space-y-2' : 'hidden'}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2">
                Etiquetas
              </h2>
              <EtiquetasMultiSelect
                value={form.etiquetas.map((e) => e.id)}
                selected={form.etiquetas}
                onChange={(selected) => updateField('etiquetas', selected)}
              />
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
