'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  getVehicle,
  updateVehicle,
  type UpdateVehiclePayload,
  type VehicleListItem,
} from '../../../../lib/vehicles';
import { showConfirm, showError, showSuccess } from '../../../../lib/alerts';
import SearchableSelect from '../../SearchableSelect';
import { marcaSelectConfig, colorSelectConfig, clienteSelectConfig } from '../../referenceSelectConfigs';

const MIN_ANIO = 1900;
const MAX_ANIO = new Date().getFullYear() + 1;

interface FormState {
  marcaId: number | '';
  colorId: number | '';
  anio: number | '';
  kilometraje: number | '';
  patente: string;
  clienteId: number | '';
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  marcaId: '',
  colorId: '',
  anio: '',
  kilometraje: '',
  patente: '',
  clienteId: '',
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

export default function EditarVehiculoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const vehicleId = Number(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleListItem | null>(null);
  const initialFormRef = useRef<FormState | null>(null);

  const isDirty = isFormDirty(form, initialFormRef.current);

  useEffect(() => {
    let cancelled = false;

    const loadVehicle = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const loadedVehicle = await getVehicle(vehicleId);
        if (cancelled) return;
        const loaded: FormState = {
          marcaId: loadedVehicle.marca.id,
          colorId: loadedVehicle.color.id,
          anio: loadedVehicle.anio,
          kilometraje: loadedVehicle.kilometraje,
          patente: loadedVehicle.patente ?? '',
          clienteId: loadedVehicle.cliente.id,
          activo: loadedVehicle.activo,
        };
        setForm(loaded);
        initialFormRef.current = loaded;
        setVehicle(loadedVehicle);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadVehicle();

    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

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
    router.push('/vehiculos');
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
      const payload: UpdateVehiclePayload = {
        marcaId: Number(form.marcaId),
        colorId: Number(form.colorId),
        anio: Number(form.anio),
        kilometraje: Number(form.kilometraje),
        patente: form.patente || undefined,
        clienteId: Number(form.clienteId),
        activo: form.activo,
      };
      await updateVehicle(vehicleId, payload);
      // Reset the dirty baseline before navigating away so the post-save
      // redirect never trips the beforeunload/handleCancel guards.
      initialFormRef.current = form;
      showSuccess('Vehículo actualizado', 'Los cambios se guardaron correctamente.');
      router.push('/vehiculos');
    } catch (err) {
      showError(
        'Error al actualizar vehículo',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Editar vehículo</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {loading ? 'Cargando datos del vehículo...' : 'Modificá los datos del vehículo.'}
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando vehículo...
        </div>
      ) : loadError ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError}</span>
          </div>
          <Link
            href="/vehiculos"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SearchableSelect
                label="Cliente"
                placeholder="Seleccioná un cliente"
                value={form.clienteId}
                initialLabel={vehicle ? vehicle.cliente.razonSocial : undefined}
                onChange={(id) => updateField('clienteId', id)}
                autoFocus
                {...clienteSelectConfig}
              />

              <div className="space-y-1">
                <label htmlFor="patente" className="text-sm font-medium text-stone-700">
                  Patente
                </label>
                <input
                  id="patente"
                  type="text"
                  value={form.patente}
                  onChange={(e) => updateField('patente', e.target.value.toUpperCase())}
                  placeholder="Ej: ABC123 o AB123CD"
                  maxLength={7}
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 uppercase focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <SearchableSelect
                label="Marca"
                placeholder="Seleccioná una marca"
                value={form.marcaId}
                initialLabel={vehicle ? `${vehicle.marca.marca} ${vehicle.marca.modelo}` : undefined}
                onChange={(id) => updateField('marcaId', id)}
                {...marcaSelectConfig}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SearchableSelect
                label="Color"
                placeholder="Seleccioná un color"
                value={form.colorId}
                initialLabel={vehicle ? vehicle.color.descripcion : undefined}
                onChange={(id) => updateField('colorId', id)}
                {...colorSelectConfig}
              />

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
