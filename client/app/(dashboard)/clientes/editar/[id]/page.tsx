'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  getCustomer,
  updateCustomer,
  ID_TYPE_LABELS,
  ID_TYPES,
  toIdType,
  type UpdateCustomerPayload,
  type IdType,
} from '../../../../lib/customers';
import { showConfirm, showError, showSuccess } from '../../../../lib/alerts';

interface FormState {
  razonSocial: string;
  tipoIdentificacion: IdType;
  identificacion: string;
  telefono: string;
  domicilio: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  razonSocial: '',
  tipoIdentificacion: 'dni',
  identificacion: '',
  telefono: '',
  domicilio: '',
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

export default function EditarClientePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const clienteId = Number(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const initialFormRef = useRef<FormState | null>(null);

  const isDirty = isFormDirty(form, initialFormRef.current);

  useEffect(() => {
    let cancelled = false;

    const loadCustomer = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const customer = await getCustomer(clienteId);
        if (cancelled) return;
        const loaded: FormState = {
          razonSocial: customer.razonSocial,
          tipoIdentificacion: toIdType(customer.tipoIdentificacion),
          identificacion: customer.identificacion,
          telefono: customer.telefono,
          domicilio: customer.domicilio,
          activo: customer.activo,
        };
        setForm(loaded);
        initialFormRef.current = loaded;
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCustomer();

    return () => {
      cancelled = true;
    };
  }, [clienteId]);

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
    router.push('/clientes');
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
      const payload: UpdateCustomerPayload = {
        razonSocial: form.razonSocial,
        tipoIdentificacion: form.tipoIdentificacion,
        identificacion: form.identificacion,
        telefono: form.telefono,
        domicilio: form.domicilio,
        activo: form.activo,
      };
      await updateCustomer(clienteId, payload);
      // Reset the dirty baseline before navigating away so the post-save
      // redirect never trips the beforeunload/handleCancel guards.
      initialFormRef.current = form;
      showSuccess('Cliente actualizado', 'Los cambios se guardaron correctamente.');
      router.push('/clientes');
    } catch (err) {
      showError(
        'Error al actualizar cliente',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Editar cliente</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {loading ? 'Cargando datos del cliente...' : `Editando a ${form.razonSocial}`}
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando cliente...
        </div>
      ) : loadError ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError}</span>
          </div>
          <Link
            href="/clientes"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
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
