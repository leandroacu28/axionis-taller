'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '../../lib/api';
import { getEmpresa, updateEmpresa, type Empresa } from '../../lib/empresa';
import { showError, showSuccess } from '../../lib/alerts';

interface FormState {
  nombre: string;
  direccion: string;
  telefono: string;
}

const EMPTY_FORM: FormState = {
  nombre: '',
  direccion: '',
  telefono: '',
};

// Shallow-compares every FormState field against the load-time baseline.
// Same pattern as ColorFormModal.tsx's isFormDirty — used to derive
// `isDirty` alongside the logo-specific changes below.
function isFormDirty(current: FormState, baseline: FormState | null): boolean {
  if (!baseline) return false;
  return (Object.keys(current) as Array<keyof FormState>).some(
    (key) => current[key] !== baseline[key],
  );
}

export default function EmpresaPage() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const initialFormRef = useRef<FormState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = isFormDirty(form, initialFormRef.current) || selectedFile !== null || removeLogo;

  const loadEmpresa = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await getEmpresa();
      const loaded: FormState = {
        nombre: result.nombre ?? '',
        direccion: result.direccion ?? '',
        telefono: result.telefono ?? '',
      };
      setEmpresa(result);
      setForm(loaded);
      initialFormRef.current = loaded;
      setSelectedFile(null);
      setRemoveLogo(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmpresa();
  }, []);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) setRemoveLogo(false);
  };

  const handleRemoveLogo = () => {
    setSelectedFile(null);
    setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const logoSrc = previewUrl ?? (!removeLogo && empresa?.logoUrl ? `${API_BASE_URL}${empresa.logoUrl}` : null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const formData = new FormData();
    formData.append('nombre', form.nombre);
    formData.append('direccion', form.direccion);
    formData.append('telefono', form.telefono);
    if (selectedFile) {
      formData.append('logo', selectedFile);
    } else if (removeLogo) {
      formData.append('removeLogo', 'true');
    }

    setSubmitting(true);
    try {
      const result = await updateEmpresa(formData);
      const loaded: FormState = {
        nombre: result.nombre ?? '',
        direccion: result.direccion ?? '',
        telefono: result.telefono ?? '',
      };
      setEmpresa(result);
      setForm(loaded);
      initialFormRef.current = loaded;
      setSelectedFile(null);
      setRemoveLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showSuccess('Empresa actualizada', 'Los datos de la empresa se guardaron correctamente.');
      router.push('/home');
    } catch (err) {
      showError('Error al actualizar la empresa', err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Empresa</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Gestioná los datos generales de tu empresa.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
              aria-hidden="true"
            />
            Cargando datos de la empresa...
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadEmpresa}
              className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="nombre" className="text-sm font-medium text-stone-700">
                Nombre
              </label>
              <input
                id="nombre"
                type="text"
                value={form.nombre}
                onChange={(e) => updateField('nombre', e.target.value)}
                placeholder="Ej: Taller Axionis"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="direccion" className="text-sm font-medium text-stone-700">
                Dirección
              </label>
              <input
                id="direccion"
                type="text"
                value={form.direccion}
                onChange={(e) => updateField('direccion', e.target.value)}
                placeholder="Ej: Av. Siempre Viva 123"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="telefono" className="text-sm font-medium text-stone-700">
                Teléfono
              </label>
              <input
                id="telefono"
                type="text"
                value={form.telefono}
                onChange={(e) => updateField('telefono', e.target.value)}
                placeholder="Ej: 11 4567-8900"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1 sm:col-span-3">
              <label htmlFor="logo" className="text-sm font-medium text-stone-700">
                Logo
              </label>
              {logoSrc && (
                <div className="mb-2">
                  <img src={logoSrc} alt="Logo de la empresa" className="h-20 w-20 rounded-lg border border-stone-200 object-contain" />
                </div>
              )}
              <input
                id="logo"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-stone-700 hover:file:bg-stone-200"
              />
              {logoSrc && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="mt-1 text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  Quitar logo
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting || !isDirty}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
