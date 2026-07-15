'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import {
  createEtiqueta,
  updateEtiqueta,
  type EtiquetaListItem,
  type CreateEtiquetaPayload,
  type UpdateEtiquetaPayload,
} from '../../lib/etiquetas';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';

interface FormState {
  descripcion: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  descripcion: '',
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

interface EtiquetaFormModalProps {
  open: boolean;
  onClose: () => void;
  etiqueta: EtiquetaListItem | null;
  onSaved: () => void;
}

export default function EtiquetaFormModal({ open, onClose, etiqueta, onSaved }: EtiquetaFormModalProps) {
  const isEdit = etiqueta !== null;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const initialFormRef = useRef<FormState | null>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);

  const isDirty = isEdit && isFormDirty(form, initialFormRef.current);

  useEffect(() => {
    if (!open) return;
    const loaded: FormState = etiqueta
      ? { descripcion: etiqueta.descripcion, activo: etiqueta.activo }
      : EMPTY_FORM;
    setForm(loaded);
    initialFormRef.current = isEdit ? loaded : null;
    descripcionRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, etiqueta]);

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

    if (form.descripcion.trim() === '') {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && etiqueta) {
        const payload: UpdateEtiquetaPayload = {
          descripcion: form.descripcion,
          activo: form.activo,
        };
        await updateEtiqueta(etiqueta.id, payload);
        showSuccess('Etiqueta actualizada', 'Los cambios se guardaron correctamente.');
      } else {
        const payload: CreateEtiquetaPayload = {
          descripcion: form.descripcion,
        };
        await createEtiqueta(payload);
        showSuccess('Etiqueta creada', 'La etiqueta ha sido creada correctamente.');
      }
      onSaved();
    } catch (err) {
      showError(
        isEdit ? 'Error al actualizar etiqueta' : 'Error al crear etiqueta',
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
      title={isEdit ? 'Editar etiqueta' : 'Nueva etiqueta'}
      description={
        isEdit
          ? 'Modificá los datos de la etiqueta.'
          : 'Completá los datos para registrar una etiqueta.'
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <div className="space-y-1">
          <label htmlFor="descripcion" className="text-sm font-medium text-stone-700">
            Descripción <span className="text-rose-500">*</span>
          </label>
          <input
            id="descripcion"
            ref={descripcionRef}
            type="text"
            value={form.descripcion}
            onChange={(e) => updateField('descripcion', e.target.value)}
            required
            placeholder="Ej: Oferta"
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
                : 'Crear etiqueta'}
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
