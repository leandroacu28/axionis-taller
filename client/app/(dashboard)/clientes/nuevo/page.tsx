'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import {
  createCustomer,
  ID_TYPE_LABELS,
  ID_TYPES,
  toIdType,
  type CreateCustomerPayload,
  type IdType,
} from '../../../lib/customers';
import { showError, showSuccess } from '../../../lib/alerts';

interface FormState {
  razonSocial: string;
  tipoIdentificacion: IdType;
  identificacion: string;
  telefono: string;
  domicilio: string;
}

const EMPTY_FORM: FormState = {
  razonSocial: '',
  tipoIdentificacion: 'dni',
  identificacion: '',
  telefono: '',
  domicilio: '',
};

export default function NuevoClientePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const requiredFields: Array<[string, string]> = [
      ['Razón social', form.razonSocial],
      ['Identificación', form.identificacion],
      ['Teléfono', form.telefono],
      ['Domicilio', form.domicilio],
    ];
    const hasEmptyField = requiredFields.some(([, value]) => value.trim() === '');
    if (hasEmptyField) {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateCustomerPayload = {
        razonSocial: form.razonSocial,
        tipoIdentificacion: form.tipoIdentificacion,
        identificacion: form.identificacion,
        telefono: form.telefono,
        domicilio: form.domicilio,
      };
      await createCustomer(payload);
      showSuccess('Cliente creado', 'El cliente ha sido creado correctamente.');
      router.push('/clientes');
    } catch (err) {
      showError(
        'Error al crear cliente',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Nuevo cliente</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Completá los datos para registrar un cliente.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="razonSocial" className="text-sm font-medium text-stone-700">
              Razón social <span className="text-rose-500">*</span>
            </label>
            <input
              id="razonSocial"
              type="text"
              value={form.razonSocial}
              onChange={(e) => updateField('razonSocial', e.target.value)}
              required
              placeholder="Ej: Juan Pérez"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="tipoIdentificacion" className="text-sm font-medium text-stone-700">
              Tipo de identificación <span className="text-rose-500">*</span>
            </label>
            <select
              id="tipoIdentificacion"
              value={form.tipoIdentificacion}
              onChange={(e) => updateField('tipoIdentificacion', toIdType(e.target.value))}
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            >
              {ID_TYPES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ID_TYPE_LABELS[tipo]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="identificacion" className="text-sm font-medium text-stone-700">
              Identificación <span className="text-rose-500">*</span>
            </label>
            <input
              id="identificacion"
              type="text"
              value={form.identificacion}
              onChange={(e) => updateField('identificacion', e.target.value)}
              required
              placeholder="Ej: 20123456789"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="telefono" className="text-sm font-medium text-stone-700">
              Teléfono <span className="text-rose-500">*</span>
            </label>
            <input
              id="telefono"
              type="text"
              value={form.telefono}
              onChange={(e) => updateField('telefono', e.target.value)}
              required
              placeholder="Ej: 1145678900"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="domicilio" className="text-sm font-medium text-stone-700">
              Domicilio <span className="text-rose-500">*</span>
            </label>
            <input
              id="domicilio"
              type="text"
              value={form.domicilio}
              onChange={(e) => updateField('domicilio', e.target.value)}
              required
              placeholder="Ej: Av. Siempre Viva 742"
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear cliente'}
            </button>
            <Link
              href="/clientes"
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
