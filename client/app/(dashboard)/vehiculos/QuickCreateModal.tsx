'use client';

import { FormEvent, useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { showError } from '../../lib/alerts';

export interface QuickCreateField {
  name: string;
  label: string;
  type: 'text' | 'select';
  options?: { value: string; label: string }[]; // select only
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

interface QuickCreateModalProps {
  open: boolean;
  title: string;
  entityLabel: string;
  fields: QuickCreateField[];
  prefillField?: string;
  prefillValue?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

function buildInitialValues(
  fields: QuickCreateField[],
  prefillField?: string,
  prefillValue?: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] = field.defaultValue ?? '';
  }
  if (prefillField && prefillValue) {
    values[prefillField] = prefillValue;
  }
  return values;
}

export default function QuickCreateModal({
  open,
  title,
  entityLabel,
  fields,
  prefillField,
  prefillValue,
  onSubmit,
  onClose,
}: QuickCreateModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Re-seed the form every time the modal opens (not on every prop change) —
  // the modal instance is kept mounted by the host SearchableSelect so it can
  // toggle `open` without losing the surrounding portal wiring.
  useEffect(() => {
    if (!open) return;
    setValues(buildInitialValues(fields, prefillField, prefillValue));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Modal.tsx renders this form through a portal to document.body — DOM-wise
    // it's a sibling of the vehicle form, but React still bubbles synthetic
    // events through the component tree for portaled content. Without this,
    // submitting the quick-create form also triggers the outer vehicle
    // form's onSubmit (and its own "Campos incompletos" validation).
    event.stopPropagation();
    if (submitting) return;

    const hasEmptyRequired = fields.some(
      (field) => field.required && (values[field.name] ?? '').trim() === '',
    );
    if (hasEmptyRequired) {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err) {
      // Kept inline (not a toast) so it stays visible while the user fixes
      // the offending field — e.g. the Cliente 409 duplicate-identificacion
      // conflict, which must not disappear after the toast timer.
      setError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {fields.map((field) => (
          <div key={field.name} className="space-y-1">
            <label
              htmlFor={`quick-create-${field.name}`}
              className="text-sm font-medium text-stone-700"
            >
              {field.label} {field.required && <span className="text-rose-500">*</span>}
            </label>
            {field.type === 'select' ? (
              <select
                id={`quick-create-${field.name}`}
                value={values[field.name] ?? ''}
                onChange={(e) => updateField(field.name, e.target.value)}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`quick-create-${field.name}`}
                type="text"
                value={values[field.name] ?? ''}
                onChange={(e) => updateField(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            )}
          </div>
        ))}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creando...' : `Crear ${entityLabel}`}
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
