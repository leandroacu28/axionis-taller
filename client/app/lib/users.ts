import { API_BASE_URL } from './api';
import { getAuthHeader, type UserData } from './auth';

export const USER_ROLES = ['maestro', 'administrador', 'empleado', 'mecanico'] as const;
export type UserRol = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRol, string> = {
  maestro: 'Maestro',
  administrador: 'Administrador',
  empleado: 'Empleado',
  mecanico: 'Mecánico',
};

export function toUserRol(value: string): UserRol {
  return (USER_ROLES as readonly string[]).includes(value) ? (value as UserRol) : 'empleado';
}

export interface UserListItem extends UserData {
  id: number;
  activo: boolean;
  updatedAt: string;
  creadoPor: { id: number; username: string } | null;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  nombre?: string;
  apellido?: string;
  rol: UserRol;
  activo?: boolean;
}

export interface UpdateUserPayload {
  nombre?: string;
  apellido?: string;
  rol?: UserRol;
  password?: string;
  activo?: boolean;
}

async function handleJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    const message = await res
      .json()
      .then((body) => body?.message)
      .catch(() => undefined);
    throw new Error(message || fallbackMessage);
  }
  return res.json();
}

export async function listUsers(): Promise<UserListItem[]> {
  const res = await fetch(`${API_BASE_URL}/users`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de usuarios');
}

export async function createUser(data: CreateUserPayload): Promise<UserListItem> {
  const res = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el usuario');
}

export async function updateUser(id: number, data: UpdateUserPayload): Promise<UserListItem> {
  const res = await fetch(`${API_BASE_URL}/users/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el usuario');
}
