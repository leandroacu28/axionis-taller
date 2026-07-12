'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import {
  createBrand,
  updateBrand,
  type BrandListItem,
  type CreateBrandPayload,
  type UpdateBrandPayload,
} from '../../lib/brands';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';

interface FormState {
  marca: string;
  modelo: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  marca: '',
  modelo: '',
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

interface BrandFormModalProps {
  open: boolean;
  onClose: () => void;
  brand: BrandListItem | null;
  onSaved: () => void;
}

export default function BrandFormModal({ open, onClose, brand, onSaved }: BrandFormModalProps) {
  const isEdit = brand !== null;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const initialFormRef = useRef<FormState | null>(null);
  const marcaRef = useRef<HTMLInputElement>(null);

  const isDirty = isEdit && isFormDirty(form, initialFormRef.current);

  useEffect(() => {
    if (!open) return;
    const loaded: FormState = brand
      ? { marca: brand.marca, modelo: brand.modelo, activo: brand.activo }
      : EMPTY_FORM;
    setForm(loaded);
    initialFormRef.current = isEdit ? loaded : null;
    marcaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brand]);

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

    if (form.marca.trim() === '' || form.modelo.trim() === '') {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && brand) {
        const payload: UpdateBrandPayload = {
          marca: form.marca,
          modelo: form.modelo,
          activo: form.activo,
        };
        await updateBrand(brand.id, payload);
        showSuccess('Marca actualizada', 'Los cambios se guardaron correctamente.');
      } else {
        const payload: CreateBrandPayload = {
          marca: form.marca,
          modelo: form.modelo,
        };
        await createBrand(payload);
        showSuccess('Marca creada', 'La marca ha sido creada correctamente.');
      }
      onSaved();
    } catch (err) {
      showError(
        isEdit ? 'Error al actualizar marca' : 'Error al crear marca',
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
      title={isEdit ? 'Editar marca' : 'Nueva marca'}
      description={
        isEdit
          ? 'Modificá los datos de la marca.'
          : 'Completá los datos para registrar una marca.'
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <div className="space-y-1">
          <label htmlFor="marca" className="text-sm font-medium text-stone-700">
            Marca <span className="text-rose-500">*</span>
          </label>
          <input
            id="marca"
            ref={marcaRef}
            type="text"
            value={form.marca}
            onChange={(e) => updateField('marca', e.target.value)}
            required
            placeholder="Ej: Toyota"
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="modelo" className="text-sm font-medium text-stone-700">
            Modelo <span className="text-rose-500">*</span>
          </label>
          <input
            id="modelo"
            type="text"
            value={form.modelo}
            onChange={(e) => updateField('modelo', e.target.value)}
            required
            placeholder="Ej: Corolla"
            className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
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
                : 'Crear marca'}
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
