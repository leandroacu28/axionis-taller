'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useRef, useState } from 'react';
import { createProducto, type CreateProductoPayload } from '../../../lib/productos';
import { showError, showSuccess } from '../../../lib/alerts';
import UnidadMedidaSelect, { type UnidadMedidaSelectHandle } from '../UnidadMedidaSelect';
import EtiquetasMultiSelect from '../EtiquetasMultiSelect';

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
  alicuotaIva: 0,
  etiquetas: [],
};

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

export default function NuevoProductoPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('datos');
  const descripcionRef = useRef<HTMLInputElement>(null);
  const unidadMedidaRef = useRef<UnidadMedidaSelectHandle>(null);
  const cantidadMinimaRef = useRef<HTMLInputElement>(null);
  const precioVentaRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Auto-fills Precio de Venta whenever BOTH precioCompra and
  // porcentajeGanancia end up with a value after this edit — precioCompra
  // alone does not trigger it. Wired into the two fields' onChange (rather
  // than a useEffect over form state) so it only fires on the user's own
  // edits, never as a side effect of unrelated state updates.
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
      const payload: CreateProductoPayload = {
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
        etiquetaIds: form.etiquetas.map((e) => e.id),
      };
      await createProducto(payload);
      showSuccess('Producto creado', 'El producto ha sido creado correctamente.');
      router.push('/productos');
    } catch (err) {
      showError(
        'Error al crear producto',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
          Nuevo producto
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Completá los datos para registrar un producto.
        </p>
      </div>

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
              {submitting ? 'Creando...' : 'Crear producto'}
            </button>
            <Link
              href="/productos"
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
