'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createProducto, type CreateProductoPayload } from '../../../lib/productos';
import { showError, showSuccess } from '../../../lib/alerts';
import UnidadMedidaSelect from '../UnidadMedidaSelect';

interface FormState {
  descripcion: string;
  codigo: string;
  unidadMedidaId: number | '';
  cantidadInicial: number | '';
  alertaStock: boolean;
  cantidadMinima: number | '';
  precioCompra: number | '';
  porcentajeGanancia: number | '';
  precioMayorista: number | '';
  alicuotaIva: 21 | 10.5;
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
  precioMayorista: '',
  alicuotaIva: 21,
};

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

export default function NuevoProductoPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const precioVentaPreview = computePrecioVentaPreview(form.precioCompra, form.porcentajeGanancia);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      const trimmedCodigo = form.codigo.trim();
      const payload: CreateProductoPayload = {
        descripcion: form.descripcion.trim(),
        codigo: trimmedCodigo || null,
        unidadMedidaId: Number(form.unidadMedidaId),
        cantidadInicial: Number(form.cantidadInicial),
        alertaStock: form.alertaStock,
        cantidadMinima: Number(form.cantidadMinima),
        precioCompra: Number(form.precioCompra),
        porcentajeGanancia: Number(form.porcentajeGanancia),
        precioMayorista: Number(form.precioMayorista),
        alicuotaIva: form.alicuotaIva,
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200 pb-2">
            Datos básicos
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200 pb-2">
            Cantidades y Stock
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
