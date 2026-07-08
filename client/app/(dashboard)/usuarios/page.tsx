'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  createUser,
  listUsers,
  updateUser,
  type CreateUserPayload,
  type UpdateUserPayload,
  type UserListItem,
} from '../../lib/users';

interface FormState {
  username: string;
  password: string;
  nombre: string;
  apellido: string;
  rol: 'admin' | 'empleado';
}

const EMPTY_FORM: FormState = {
  username: '',
  password: '',
  nombre: '',
  apellido: '',
  rol: 'empleado',
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setListError('');
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateForm = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (user: UserListItem) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: '',
      nombre: user.nombre ?? '',
      apellido: user.apellido ?? '',
      rol: (user.rol as 'admin' | 'empleado') ?? 'empleado',
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingUser) {
        const payload: UpdateUserPayload = {
          nombre: form.nombre,
          apellido: form.apellido,
          rol: form.rol,
        };
        if (form.password) {
          payload.password = form.password;
        }
        const updated = await updateUser(editingUser.id, payload);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } else {
        const payload: CreateUserPayload = {
          username: form.username,
          password: form.password,
          nombre: form.nombre,
          apellido: form.apellido,
          rol: form.rol,
        };
        const created = await createUser(payload);
        setUsers((prev) => [...prev, created]);
      }
      closeForm();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
            Usuarios
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            Gestioná los usuarios del sistema.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600"
          >
            Nuevo usuario
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {editingUser ? `Editar usuario: ${editingUser.username}` : 'Nuevo usuario'}
          </h2>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="username" className="text-sm font-medium text-stone-700">
                Usuario
              </label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={!!editingUser}
                required
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-stone-700">
                Contraseña {editingUser && '(dejar vacío para no cambiar)'}
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingUser}
                autoComplete="new-password"
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="nombre" className="text-sm font-medium text-stone-700">
                Nombre
              </label>
              <input
                id="nombre"
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="apellido" className="text-sm font-medium text-stone-700">
                Apellido
              </label>
              <input
                id="apellido"
                type="text"
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="rol" className="text-sm font-medium text-stone-700">
                Rol
              </label>
              <select
                id="rol"
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value as 'admin' | 'empleado' })}
                className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="admin">admin</option>
                <option value="empleado">empleado</option>
              </select>
            </div>

            {formError && (
              <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                <span>{formError}</span>
              </div>
            )}

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 transition-all hover:bg-stone-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
              aria-hidden="true"
            />
            Cargando usuarios...
          </div>
        ) : listError ? (
          <div className="m-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{listError}</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500">
            No hay usuarios registrados todavía.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Apellido
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Rol
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 text-sm font-medium text-stone-800">
                    {user.username}
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-600">{user.nombre || '—'}</td>
                  <td className="px-4 py-3 text-sm text-stone-600">{user.apellido || '—'}</td>
                  <td className="px-4 py-3 text-sm text-stone-600">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                      {user.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => openEditForm(user)}
                      className="font-medium text-rose-600 hover:text-rose-700"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
