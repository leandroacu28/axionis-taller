import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';
import { listServiceTypes } from './service-types';

export type Prioridad = 'normal' | 'alta' | 'urgente';
export type Estado = 'pendiente' | 'en_proceso' | 'terminado' | 'cancelado';

export interface OrdenTrabajoListItem {
  id: number;
  numero: string | null;
  fechaIngreso: string;
  kilometros: number;
  prioridad: Prioridad;
  motivoIngreso: string;
  estado: Estado;
  fechaFinalizacion: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  cliente: { id: number; razonSocial: string };
  vehiculo: { id: number; kilometraje: number; marca: { marca: string; modelo: string } };
  mecanico: { id: number; username: string; nombre: string | null; apellido: string | null };
  tiposServicio: { id: number; descripcion: string }[];
  creadoPor: { id: number; username: string } | null;
  actualizadoPor: { id: number; username: string } | null;
}

export interface CreateOrdenTrabajoPayload {
  fechaIngreso?: string;
  kilometros: number;
  prioridad?: Prioridad;
  motivoIngreso: string;
  estado?: Estado;
  clienteId: number;
  vehiculoId: number;
  mecanicoId: number;
  tipoServicioIds: number[];
}

// Same field set as CreateOrdenTrabajoPayload — house pattern (mirrors the
// server's UpdateOrdenTrabajoDto) — plus optional `activo`, update-only
// (mirrors UpdateProductoPayload). Creation always starts active via the
// schema default, so `activo` never appears on the create payload.
export type UpdateOrdenTrabajoPayload = CreateOrdenTrabajoPayload & {
  activo?: boolean;
  fechaFinalizacion?: string;
};

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

export interface ListOrdenesTrabajoParams {
  page: number;
  pageSize: number;
  search?: string;
  estado?: 'all' | Estado;
  // Additive alongside `estado` — activo is an orthogonal soft-deactivation
  // flag, not a replacement for the estado lifecycle filter.
  status?: 'all' | 'activo' | 'inactivo';
  // Additive alongside `estado`/`status` — a mecánico is just any active User.
  mecanicoId?: number;
  prioridad?: 'all' | Prioridad;
}

// Reframed per D2: no `activeCount` — counts are grouped per `estado` value
// instead of an active/inactive split, matching the server's findAll shape.
export interface PaginatedOrdenesTrabajo {
  data: OrdenTrabajoListItem[];
  total: number;
  counts: { pendiente: number; en_proceso: number; terminado: number; cancelado: number };
}

export async function listOrdenesTrabajo(
  params: ListOrdenesTrabajoParams,
): Promise<PaginatedOrdenesTrabajo> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.estado) query.set('estado', params.estado);
  if (params.status) query.set('status', params.status);
  if (params.mecanicoId) query.set('mecanicoId', String(params.mecanicoId));
  if (params.prioridad) query.set('prioridad', params.prioridad);

  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de órdenes de trabajo');
}

export async function getOrdenTrabajo(id: number): Promise<OrdenTrabajoListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la orden de trabajo');
}

export async function createOrdenTrabajo(
  data: CreateOrdenTrabajoPayload,
): Promise<OrdenTrabajoListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear la orden de trabajo');
}

export async function updateOrdenTrabajo(
  id: number,
  data: UpdateOrdenTrabajoPayload,
): Promise<OrdenTrabajoListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar la orden de trabajo');
}

// Dedicated business action — no body, actualizadoPorId comes from the JWT
// caller server-side. Distinct from updateOrdenTrabajo's generic PATCH: this
// atomically cascades the order and its still-pendiente detalles to en_proceso.
export async function iniciarOrdenTrabajo(id: number): Promise<OrdenTrabajoListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/${id}/iniciar`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo iniciar la orden de trabajo');
}

export interface OrdenTrabajoDetalle {
  id: number;
  estado: Estado;
  tipoServicio: { id: number; descripcion: string };
  diagnostico: { id: number; descripcion: string } | null;
  trabajoRealizado: string | null;
  proximoServiceFecha: string | null;
  proximoServiceKm: number | null;
  fechaFinalizacion: string | null;
  updatedAt: string;
}

export interface UpdateOrdenTrabajoDetallePayload {
  estado?: Estado;
  diagnosticoId?: number | null;
  trabajoRealizado?: string | null;
  proximoServiceFecha?: string | null;
  proximoServiceKm?: number | null;
  fechaFinalizacion?: string | null;
}

export async function listOrdenTrabajoDetalles(ordenId: number): Promise<OrdenTrabajoDetalle[]> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/${ordenId}/detalles`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el detalle de la orden de trabajo');
}

export async function updateOrdenTrabajoDetalle(
  ordenId: number,
  detalleId: number,
  data: UpdateOrdenTrabajoDetallePayload,
): Promise<OrdenTrabajoDetalle> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/${ordenId}/detalles/${detalleId}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el detalle de la orden de trabajo');
}

/**
 * Search helper for `TipoServicioMultiSelect`'s `search` prop (mirrors
 * `searchEtiquetas` in `lib/productos.ts`). Reuses `listServiceTypes` (from
 * `lib/service-types.ts`) rather than duplicating the fetch, and restricts
 * results to active tipos de servicio — an `OrdenTrabajo` must not
 * reference an inactive one (see `ordenes-trabajo.service.ts`'s
 * `assertTiposServicioActivos`).
 */
export async function searchTiposServicio(term: string): Promise<{ id: number; label: string }[]> {
  const result = await listServiceTypes({
    search: term || undefined,
    status: 'activo',
    page: 1,
    pageSize: 20,
  });
  return result.data.map((tipo) => ({ id: tipo.id, label: tipo.descripcion }));
}
