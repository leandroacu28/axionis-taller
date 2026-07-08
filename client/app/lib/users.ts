import { API_BASE_URL } from './api';
import { getAuthHeader, type UserData } from './auth';

export interface UserListItem extends UserData {
  id: number;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  nombre?: string;
  apellido?: string;
  rol: 'admin' | 'empleado';
}

export interface UpdateUserPayload {
  nombre?: string;
  apellido?: string;
  rol?: 'admin' | 'empleado';
  password?: string;
}

export async function listUsers(): Promise<UserListItem[]> {
  const res = await fetch(`${API_BASE_URL}/users`, {
    headers: { ...getAuthHeader() },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'No se pudo obtener la lista de usuarios');
  }

  return res.json();
}

export async function createUser(data: CreateUserPayload): Promise<UserListItem> {
  const res = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'No se pudo crear el usuario');
  }

  return res.json();
}

export async function updateUser(id: number, data: UpdateUserPayload): Promise<UserListItem> {
  const res = await fetch(`${API_BASE_URL}/users/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'No se pudo actualizar el usuario');
  }

  return res.json();
}
