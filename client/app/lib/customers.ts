import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

// Duplicated from server/src/customers/customer.constants.ts (no shared
// package between server/client) — if you change one, change the other.
export const ID_TYPES = ['dni', 'cuit', 'cuil'] as const;
export type IdType = (typeof ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<IdType, string> = {
  dni: 'DNI',
  cuit: 'CUIT',
  cuil: 'CUIL',
};

export function toIdType(value: string): IdType {
  return (ID_TYPES as readonly string[]).includes(value) ? (value as IdType) : 'dni';
}

export interface CustomerListItem {
  id: number;
  razonSocial: string;
  tipoIdentificacion: string;
  identificacion: string;
  telefono: string;
  domicilio: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string } | null;
  actualizadoPor: { id: number; username: string } | null;
}

export interface CreateCustomerPayload {
  razonSocial: string;
  tipoIdentificacion: IdType;
  identificacion: string;
  telefono: string;
  domicilio: string;
  activo?: boolean;
}

export interface UpdateCustomerPayload {
  razonSocial: string;
  tipoIdentificacion: IdType;
  identificacion: string;
  telefono: string;
  domicilio: string;
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

export async function listCustomers(): Promise<CustomerListItem[]> {
  const res = await fetch(`${API_BASE_URL}/customers`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de clientes');
}

export async function getCustomer(id: number): Promise<CustomerListItem> {
  const res = await fetch(`${API_BASE_URL}/customers/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el cliente');
}

export async function createCustomer(data: CreateCustomerPayload): Promise<CustomerListItem> {
  const res = await fetch(`${API_BASE_URL}/customers`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el cliente');
}

export async function updateCustomer(
  id: number,
  data: UpdateCustomerPayload,
): Promise<CustomerListItem> {
  const res = await fetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el cliente');
}
