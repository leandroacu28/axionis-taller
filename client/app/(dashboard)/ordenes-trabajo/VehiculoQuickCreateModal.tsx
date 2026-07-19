'use client';

import { FormEvent, useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { createVehicle } from '../../lib/vehicles';
import { showError, showSuccess } from '../../lib/alerts';
import SearchableSelect, { type Option } from '../vehiculos/SearchableSelect';
import { marcaSelectConfig, colorSelectConfig } from '../vehiculos/referenceSelectConfigs';

const MIN_ANIO = 1900;
const MAX_ANIO = new Date().getFullYear() + 1;

interface VehiculoQuickCreateModalProps {
  open: boolean;
  clienteId: number | '';
  onClose: () => void;
  onCreated: (option: Option) => void;
}

// Mirrors `vehiculos/nuevo/page.tsx`'s `FormState` minus `clienteId` — the
// customer is fixed from the `clienteId` prop and never shown or asked here
// (proposal.md, spec "Customer Injected From the Order Form, Never
// Requested").
interface FormState {
  marcaId: number | '';
  colorId: number | '';
  anio: number | '';
  kilometraje: number | '';
}

const EMPTY_FORM: FormState = {
  marcaId: '',
  colorId: '',
  anio: '',
  kilometraje: '',
};

/**
 * "Alta rápida de vehículo" mini-form (design.md § Vehicle Create Flow),
 * rendered via the Vehículo `SearchableSelect`'s `renderQuickCreate` prop.
 * Composes the proven Marca/Color `SearchableSelect` pair from
 * `vehiculos/nuevo` plus numeric Año/Kilometraje inputs, injecting
 * `clienteId` at submit time instead of asking for it.
 */
export default function VehiculoQuickCreateModal({
  open,
  clienteId,
  onClose,
  onCreated,
}: VehiculoQuickCreateModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Re-seed every time the modal opens — same convention as
  // `QuickCreateModal`, so a cancelled/half-filled attempt never leaks into
  // the next "+ Crear vehículo" activation.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError('');
  }, [open]);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // This form is portaled to `document.body` by `Modal`, but it is still a
    // React-tree descendant of the order form — without this, submitting
    // here also triggers `OrdenTrabajoForm`'s outer `onSubmit` (same fix as
    // `QuickCreateModal.tsx`).
    event.stopPropagation();
    if (submitting) return;

    if (form.marcaId === '' || form.colorId === '') {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setError('');

    const anioNum = Number(form.anio);
    if (form.anio === '' || !Number.isInteger(anioNum) || anioNum < MIN_ANIO || anioNum > MAX_ANIO) {
      setError(`El año debe ser un número entero entre ${MIN_ANIO} y ${MAX_ANIO}.`);
      return;
    }

    const kilometrajeNum = Number(form.kilometraje);
    if (form.kilometraje === '' || !Number.isInteger(kilometrajeNum) || kilometrajeNum < 0) {
      setError('El kilometraje debe ser un número entero mayor o igual a 0.');
      return;
    }

    if (clienteId === '') {
      setError('Seleccioná un cliente antes de crear el vehículo.');
      return;
    }

    setSubmitting(true);
    try {
      const vehicle = await createVehicle({
        marcaId: Number(form.marcaId),
        colorId: Number(form.colorId),
        anio: anioNum,
        kilometraje: kilometrajeNum,
        clienteId,
      });
      const option: Option = {
        id: vehicle.id,
        label: `${vehicle.marca.marca} ${vehicle.marca.modelo}`,
      };
      onCreated(option);
      showSuccess('Vehículo creado', 'El vehículo ha sido creado correctamente.');
      setForm(EMPTY_FORM);
    } catch (err) {
      // Kept inline (not a toast) so it stays visible while the user fixes
      // the offending field — mirrors `QuickCreateModal`'s error handling.
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo vehículo">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="vehiculo-quick-create-anio" className="text-sm font-medium text-stone-700">
              Año <span className="text-rose-500">*</span>
            </label>
            <input
              id="vehiculo-quick-create-anio"
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
            <label htmlFor="vehiculo-quick-create-kilometraje" className="text-sm font-medium text-stone-700">
              Kilometraje <span className="text-rose-500">*</span>
            </label>
            <input
              id="vehiculo-quick-create-kilometraje"
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
