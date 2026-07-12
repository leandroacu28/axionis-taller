'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createVehicle, type CreateVehiclePayload } from '../../../lib/vehicles';
import { showError, showSuccess } from '../../../lib/alerts';
import SearchableSelect from '../SearchableSelect';
import { marcaSelectConfig, colorSelectConfig, clienteSelectConfig } from '../referenceSelectConfigs';

const MIN_ANIO = 1900;
const MAX_ANIO = new Date().getFullYear() + 1;

interface FormState {
  marcaId: number | '';
  colorId: number | '';
  anio: number | '';
  kilometraje: number | '';
  clienteId: number | '';
}

const EMPTY_FORM: FormState = {
  marcaId: '',
  colorId: '',
  anio: '',
  kilometraje: '',
  clienteId: '',
};

export default function NuevoVehiculoPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (
      form.marcaId === '' ||
      form.colorId === '' ||
      form.anio === '' ||
      form.kilometraje === '' ||
      form.clienteId === ''
    ) {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateVehiclePayload = {
        marcaId: Number(form.marcaId),
        colorId: Number(form.colorId),
        anio: Number(form.anio),
        kilometraje: Number(form.kilometraje),
        clienteId: Number(form.clienteId),
      };
      await createVehicle(payload);
      showSuccess('Vehículo creado', 'El vehículo ha sido creado correctamente.');
      router.push('/vehiculos');
    } catch (err) {
      showError(
        'Error al crear vehículo',
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
          Nuevo vehículo
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Completá los datos para registrar un vehículo.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SearchableSelect
              label="Marca"
              placeholder="Seleccioná una marca"
              value={form.marcaId}
              onChange={(id) => updateField('marcaId', id)}
              autoFocus
              {...marcaSelectConfig}
            />

            <SearchableSelect
              label="Color"
              placeholder="Seleccioná un color"
              value={form.colorId}
              onChange={(id) => updateField('colorId', id)}
              {...colorSelectConfig}
            />

            <SearchableSelect
              label="Cliente"
              placeholder="Seleccioná un cliente"
              value={form.clienteId}
              onChange={(id) => updateField('clienteId', id)}
              {...clienteSelectConfig}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="anio" className="text-sm font-medium text-stone-700">
                Año <span className="text-rose-500">*</span>
              </label>
              <input
                id="anio"
                type="number"
                min={MIN_ANIO}
                max={MAX_ANIO}
                value={form.anio}
                onChange={(e) => updateField('anio', e.target.value ? Number(e.target.value) : '')}
                required
                placeholder="Ej: 2020"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="kilometraje" className="text-sm font-medium text-stone-700">
                Kilometraje <span className="text-rose-500">*</span>
              </label>
              <input
                id="kilometraje"
                type="number"
                min={0}
                value={form.kilometraje}
                onChange={(e) =>
                  updateField('kilometraje', e.target.value ? Number(e.target.value) : '')
                }
                required
                placeholder="Ej: 50000"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear vehículo'}
            </button>
            <Link
              href="/vehiculos"
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
