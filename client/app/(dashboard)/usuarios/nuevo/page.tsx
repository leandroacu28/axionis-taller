'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import {
  createUser,
  ROLE_LABELS,
  toUserRol,
  USER_ROLES,
  type CreateUserPayload,
  type UserRol,
} from '../../../lib/users';
import { showError, showSuccess } from '../../../lib/alerts';

interface FormState {
  username: string;
  dni: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRol;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: FormState = {
  username: '',
  dni: '',
  email: '',
  nombre: '',
  apellido: '',
  rol: 'empleado',
  password: '',
  confirmPassword: '',
};

export default function NuevoUsuarioPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const passwordsMismatch =
    form.password.length > 0 &&
    form.confirmPassword.length > 0 &&
    form.password !== form.confirmPassword;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const requiredFields: Array<[string, string]> = [
      ['Usuario', form.username],
      ['DNI', form.dni],
      ['Nombre', form.nombre],
      ['Apellido', form.apellido],
      ['Contraseña', form.password],
    ];
    const hasEmptyField = requiredFields.some(([, value]) => value.trim() === '');
    if (hasEmptyField) {
      showError('Campos incompletos', 'Completá todos los campos obligatorios.');
      return;
    }

    if (form.password.length < 4) {
      showError('Contraseña muy corta', 'La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      showError('Las contraseñas no coinciden', 'Verificá que ambas contraseñas sean iguales.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateUserPayload = {
        username: form.username,
        dni: form.dni,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        nombre: form.nombre,
        apellido: form.apellido,
        rol: form.rol,
        password: form.password,
      };
      await createUser(payload);
      showSuccess('Usuario creado', 'El usuario ha sido creado correctamente.');
      router.push('/usuarios');
    } catch (err) {
      showError(
        'Error al crear usuario',
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
          Nuevo usuario
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Completá los datos para crear un usuario del sistema.
        </p>
      </div>

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
              autoComplete="off"
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
              className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium text-stone-700">
                  Contraseña <span className="text-rose-500">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={4}
                  placeholder="Ingrese contraseña"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-stone-700">
                  Repetir contraseña <span className="text-rose-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Repetí la contraseña"
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={submitting || passwordsMismatch}
              className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear usuario'}
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
    </div>
  );
}
