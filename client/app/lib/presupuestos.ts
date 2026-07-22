import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface PresupuestoProductoLinea {
  id: number;
  cantidad: string; // Decimal serialized as string by Prisma/JSON
  precioUnitario: string;
  precioTotal: string;
  producto: { id: number; descripcion: string } | null;
  descripcionPersonalizada: string | null;
  updatedAt: string;
}

export interface PresupuestoListItem {
  id: number;
  fecha: string;
  telefono: string | null;
  descripcion: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  cliente: { id: number; razonSocial: string };
  tipoServicio: { id: number; descripcion: string };
  creadoPor: { id: number; username: string } | null;
  actualizadoPor: { id: number; username: string } | null;
  productos: PresupuestoProductoLinea[];
}

export interface CreatePresupuestoProductoPayload {
  productoId?: number;
  cantidad: number;
  precioUnitario?: number;
  descripcionPersonalizada?: string;
}

export interface CreatePresupuestoPayload {
  fecha: string;
  clienteId: number;
  tipoServicioId: number;
  telefono?: string;
  descripcion?: string;
  productos?: CreatePresupuestoProductoPayload[];
}

export interface UpdatePresupuestoPayload {
  fecha: string;
  clienteId: number;
  tipoServicioId: number;
  telefono?: string;
  descripcion?: string;
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

export interface ListPresupuestosParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
  clienteId?: number;
  tipoServicioId?: number;
}

export interface PaginatedPresupuestos {
  data: PresupuestoListItem[];
  total: number;
  activeCount: number;
}

export async function listPresupuestos(params: ListPresupuestosParams): Promise<PaginatedPresupuestos> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.clienteId) query.set('clienteId', String(params.clienteId));
  if (params.tipoServicioId) query.set('tipoServicioId', String(params.tipoServicioId));

  const res = await fetch(`${API_BASE_URL}/presupuestos?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de presupuestos');
}

export async function getPresupuesto(id: number): Promise<PresupuestoListItem> {
  const res = await fetch(`${API_BASE_URL}/presupuestos/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el presupuesto');
}

export async function createPresupuesto(data: CreatePresupuestoPayload): Promise<PresupuestoListItem> {
  const res = await fetch(`${API_BASE_URL}/presupuestos`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el presupuesto');
}

export async function updatePresupuesto(
  id: number,
  data: UpdatePresupuestoPayload
): Promise<PresupuestoListItem> {
  const res = await fetch(`${API_BASE_URL}/presupuestos/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el presupuesto');
}

export async function addPresupuestoProducto(
  id: number,
  data: CreatePresupuestoProductoPayload
): Promise<PresupuestoProductoLinea> {
  const res = await fetch(`${API_BASE_URL}/presupuestos/${id}/productos`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo agregar el producto al presupuesto');
}

export async function updatePresupuestoProducto(
  id: number,
  detalleId: number,
  data: CreatePresupuestoProductoPayload
): Promise<PresupuestoProductoLinea> {
  const res = await fetch(`${API_BASE_URL}/presupuestos/${id}/productos/${detalleId}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el producto del presupuesto');
}

export async function removePresupuestoProducto(id: number, detalleId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/presupuestos/${id}/productos/${detalleId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body) => body?.message)
      .catch(() => undefined);
    throw new Error(message || 'No se pudo quitar el producto del presupuesto');
  }
}
