'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import {
  getUser,
  ROLE_LABELS,
  toUserRol,
  updateUser,
  USER_ROLES,
  type UpdateUserPayload,
  type UserRol,
} from '../../../../lib/users';
import { showError, showSuccess } from '../../../../lib/alerts';

interface FormState {
  username: string;
  dni: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRol;
  password: string;
}

const EMPTY_FORM: FormState = {
  username: '',
  dni: '',
  email: '',
  nombre: '',
  apellido: '',
  rol: 'empleado',
  password: '',
};

// The original bootstrap master account — its role must stay fixed. Other
// users that happen to also carry the "maestro" rol are not affected; their
// role stays fully editable.
const MASTER_USERNAME = 'lmoreno';

export default function EditarUsuarioPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const userId = Number(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isMasterAccount = form.username === MASTER_USERNAME;

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const user = await getUser(userId);
        if (cancelled) return;
        setForm({
          username: user.username,
          dni: user.dni ?? '',
          email: user.email ?? '',
          nombre: user.nombre ?? '',
          apellido: user.apellido ?? '',
          rol: toUserRol(user.rol),
          password: '',
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const requiredFields: Array<[string, string]> = [
      ['Usuario', form.username],
      ['Nombre', form.nombre],
      ['Apellido', form.apellido],
      ['DNI', form.dni],
    ];
    const hasEmptyField = requiredFields.some(([, value]) => value.trim() === '');
    if (hasEmptyField) {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    if (form.password && form.password.length < 4) {
      showError('Contraseña muy corta', 'La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: UpdateUserPayload = {
        username: form.username,
        dni: form.dni,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        nombre: form.nombre,
        apellido: form.apellido,
        rol: form.rol,
      };
      if (form.password) {
        payload.password = form.password;
      }
      await updateUser(userId, payload);
      showSuccess('Usuario actualizado', 'Los cambios se guardaron correctamente.');
      router.push('/usuarios');
    } catch (err) {
      showError(
        'Error al actualizar usuario',
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
          Editar usuario
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {loading ? 'Cargando datos del usuario...' : `Editando a ${form.username}`}
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
            aria-hidden="true"
          />
          Cargando usuario...
        </div>
      ) : loadError ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{loadError}</span>
          </div>
          <Link
            href="/usuarios"
            className="mt-4 inline-block rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
          >
            Volver
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="nombre" className="text-sm font-medium text-stone-700">
                Nombre <span className="text-rose-500">*</span>
              </label>
              <input
                id="nombre"
                type="text"
                autoFocus
                value={form.nombre}
                onChange={(e) => updateField('nombre', e.target.value)}
                required
                placeholder="Ej: Juan"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="apellido" className="text-sm font-medium text-stone-700">
                Apellido <span className="text-rose-500">*</span>
              </label>
              <input
                id="apellido"
                type="text"
                value={form.apellido}
                onChange={(e) => updateField('apellido', e.target.value)}
                required
                placeholder="Ej: Pérez"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="dni" className="text-sm font-medium text-stone-700">
                DNI <span className="text-rose-500">*</span>
              </label>
              <input
                id="dni"
                type="text"
                value={form.dni}
                onChange={(e) => updateField('dni', e.target.value)}
                required
                placeholder="Ej: 12345678"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-stone-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="Ej: jperez@empresa.com"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="username" className="text-sm font-medium text-stone-700">
                Usuario de sistema <span className="text-rose-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => updateField('username', e.target.value)}
                required
                placeholder="Ej: jperez"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="rol" className="text-sm font-medium text-stone-700">
                Rol <span className="text-rose-500">*</span>
              </label>
              <select
                id="rol"
                value={form.rol}
                onChange={(e) => updateField('rol', toUserRol(e.target.value))}
                disabled={isMasterAccount}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-lg border border-stone-200 p-4 sm:col-span-2">
              <h2 className="text-sm font-semibold text-stone-700">Contraseña</h2>
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium text-stone-700">
                  Contraseña (dejar vacío para no cambiar)
                </label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  autoComplete="new-password"
                  minLength={4}
                  placeholder="Ingrese contraseña"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <Link
                href="/usuarios"
                className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
