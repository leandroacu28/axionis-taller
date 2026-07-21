'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listUsers, toUserRol, updateUser, ROLE_LABELS, type UserListItem } from '../../lib/users';
import { getUser as getSessionUser } from '../../lib/auth';
import { showConfirm, showError, showSuccess } from '../../lib/alerts';

// Duplicated from server/src/auth/auth.service.ts (no shared package between
// server/client) — if you change one, change the other.
const MASTER_USERNAME = 'lmoreno';

// Keep in sync with the menu's `w-40` class below.
const MENU_WIDTH = 160;
// Rough height of the 3-item menu — used only to decide whether it should
// flip upward, not to size it (the flip itself uses a CSS transform).
const MENU_HEIGHT_ESTIMATE = 130;

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function NoSymbolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

type StatusFilter = 'all' | 'activo' | 'inactivo';

const DEFAULT_STATUS_FILTER: StatusFilter = 'activo';
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const ROLE_BADGE_CLASSES: Record<string, string> = {
  maestro: 'bg-violet-100 text-violet-700',
  administrador: 'bg-green-100 text-green-700',
};

function getRoleBadgeClass(rol: string): string {
  return ROLE_BADGE_CLASSES[rol] ?? 'bg-stone-100 text-stone-700';
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUpward: boolean } | null>(
    null,
  );
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters = search.trim() !== '' || statusFilter !== DEFAULT_STATUS_FILTER;
  const clearFilters = () => {
    setSearch('');
    setStatusFilter(DEFAULT_STATUS_FILTER);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (statusFilter === 'activo' && !user.activo) return false;
    if (statusFilter === 'inactivo' && user.activo) return false;
    if (!normalizedSearch) return true;
    const haystack = [user.nombre, user.apellido, user.username, user.dni]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });
  const visibleActiveCount = filteredUsers.filter((user) => user.activo).length;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPos(null);
  };

  const openMenuFor = (userId: number, event: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenuId === userId) {
      closeMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const openUpward = window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE;
    setMenuPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.right - MENU_WIDTH,
      openUpward,
    });
    setOpenMenuId(userId);
  };

  useEffect(() => {
    setSessionUsername(getSessionUser()?.username ?? null);
  }, []);

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

  const handleToggleActivo = async (user: UserListItem) => {
    closeMenu();
    const activating = !user.activo;

    if (!activating) {
      const confirmed = await showConfirm({
        title: 'Desactivar usuario',
        text: `¿Seguro que querés desactivar a ${user.username}?`,
        confirmButtonText: 'Sí, desactivar',
        confirmButtonColor: '#e11d48',
      });
      if (!confirmed) return;
    }

    setTogglingId(user.id);
    try {
      await updateUser(user.id, {
        username: user.username,
        dni: user.dni ?? '',
        ...(user.email ? { email: user.email } : {}),
        nombre: user.nombre ?? '',
        apellido: user.apellido ?? '',
        rol: toUserRol(user.rol),
        activo: activating,
      });
      showSuccess(
        activating ? 'Usuario activado' : 'Usuario desactivado',
        `${user.username} fue ${activating ? 'activado' : 'desactivado'} correctamente.`,
      );
      await loadUsers();
    } catch (err) {
      showError(
        activating ? 'No se pudo activar el usuario' : 'No se pudo desactivar el usuario',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (openMenuId === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // The menu is positioned in fixed coordinates computed at open time —
    // if the page scrolls or resizes those coordinates go stale, so just
    // close it rather than let it drift away from its trigger button.
    const handleReposition = () => closeMenu();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [openMenuId]);

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
        <Link
          href="/usuarios/nuevo"
          className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-600 hover:to-red-600"
        >
          Nuevo usuario
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
            {visibleActiveCount} usuario{visibleActiveCount === 1 ? '' : 's'} activo
            {visibleActiveCount === 1 ? '' : 's'} visible{visibleActiveCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1">
              <label htmlFor="search" className="text-sm font-medium text-stone-700">
                Buscar
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                  <SearchIcon />
                </span>
                <input
                  id="search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre, usuario o DNI..."
                  className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="statusFilter" className="text-sm font-medium text-stone-700">
                Estado
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value="all">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="pageSize" className="text-sm font-medium text-stone-700">
                Usuarios por página
              </label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500"
              aria-hidden="true"
            />
            Cargando usuarios...
          </div>
        ) : listError ? (
          <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span>{listError}</span>
            <button
              type="button"
              onClick={loadUsers}
              className="shrink-0 font-medium text-red-700 underline hover:text-red-800"
            >
              Reintentar
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500">
            No hay usuarios registrados todavía.
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-stone-500">
            <span>No se encontraron usuarios con esos filtros.</span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-rose-600 hover:text-rose-700"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  #
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Rol
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Apellido
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Nombre
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Usuario
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  DNI
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Estado
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {paginatedUsers.map((user, index) => {
                const isMaster = user.username === MASTER_USERNAME;
                const isSelf = user.username === sessionUsername;
                const deactivateBlockedReason = isMaster
                  ? 'No se puede desactivar al usuario maestro.'
                  : isSelf
                    ? 'No podés desactivar tu propia cuenta.'
                    : null;

                return (
                <tr key={user.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 text-center text-sm text-stone-500">
                    {(page - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeClass(user.rol)}`}
                    >
                      {ROLE_LABELS[toUserRol(user.rol)] ?? user.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">{user.apellido || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">{user.nombre || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-stone-800">
                    {user.username}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">{user.dni || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-stone-600">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.activo
                          ? 'bg-green-100 text-green-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {user.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <div
                      className="relative inline-block text-left"
                      ref={openMenuId === user.id ? triggerRef : null}
                    >
                      <button
                        type="button"
                        onClick={(event) => openMenuFor(user.id, event)}
                        aria-label="Abrir acciones"
                        className="rounded-lg px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                      >
                        ⋯
                      </button>
                      {openMenuId === user.id &&
                        menuPos &&
                        typeof document !== 'undefined' &&
                        createPortal(
                          <div
                            ref={menuRef}
                            style={{
                              position: 'fixed',
                              top: menuPos.top,
                              left: menuPos.left,
                              width: MENU_WIDTH,
                              transform: menuPos.openUpward ? 'translateY(-100%)' : undefined,
                            }}
                            className="z-50 rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
                          >
                            <Link
                              href={`/usuarios/editar/${user.id}`}
                              onClick={closeMenu}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                            >
                              <PencilIcon />
                              Editar
                            </Link>
                            <Link
                              href={`/usuarios/permisos/${user.id}`}
                              onClick={closeMenu}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                            >
                              <KeyIcon />
                              Permisos
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleToggleActivo(user)}
                              disabled={
                                togglingId === user.id ||
                                (user.activo && deactivateBlockedReason !== null)
                              }
                              title={user.activo ? (deactivateBlockedReason ?? undefined) : undefined}
                              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                                user.activo
                                  ? 'text-rose-600 hover:bg-rose-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {user.activo ? (
                                <>
                                  <NoSymbolIcon />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <CheckCircleIcon />
                                  Activar
                                </>
                              )}
                            </button>
                          </div>,
                          document.body,
                        )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !listError && filteredUsers.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 text-sm text-stone-500 sm:flex-row">
            <span>
              Mostrando {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredUsers.length)} de {filteredUsers.length}{' '}
              usuarios
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-stone-600">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-stone-200 px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
