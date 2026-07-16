import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';
import { listServiceTypes } from './service-types';

export type Prioridad = 'normal' | 'alta' | 'urgente';
export type Estado = 'pendiente' | 'en_proceso' | 'terminado';

export interface OrdenServicioListItem {
  id: number;
  numero: string | null;
  fechaIngreso: string;
  kilometros: number;
  prioridad: Prioridad;
  motivoIngreso: string;
  estado: Estado;
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

export interface CreateOrdenServicioPayload {
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

// Same field set as CreateOrdenServicioPayload — house pattern (mirrors the
// server's UpdateOrdenServicioDto) — plus optional `activo`, update-only
// (mirrors UpdateProductoPayload). Creation always starts active via the
// schema default, so `activo` never appears on the create payload.
export type UpdateOrdenServicioPayload = CreateOrdenServicioPayload & { activo?: boolean };

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

export interface ListOrdenesServicioParams {
  page: number;
  pageSize: number;
  search?: string;
  estado?: 'all' | Estado;
  // Additive alongside `estado` — activo is an orthogonal soft-deactivation
  // flag, not a replacement for the estado lifecycle filter.
  status?: 'all' | 'activo' | 'inactivo';
}

// Reframed per D2: no `activeCount` — counts are grouped per `estado` value
// instead of an active/inactive split, matching the server's findAll shape.
export interface PaginatedOrdenesServicio {
  data: OrdenServicioListItem[];
  total: number;
  counts: { pendiente: number; en_proceso: number; terminado: number };
}

export async function listOrdenesServicio(
  params: ListOrdenesServicioParams,
): Promise<PaginatedOrdenesServicio> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.estado) query.set('estado', params.estado);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/ordenes-servicio?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de órdenes de servicio');
}

export async function getOrdenServicio(id: number): Promise<OrdenServicioListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-servicio/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la orden de servicio');
}

export async function createOrdenServicio(
  data: CreateOrdenServicioPayload,
): Promise<OrdenServicioListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-servicio`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear la orden de servicio');
}

export async function updateOrdenServicio(
  id: number,
  data: UpdateOrdenServicioPayload,
): Promise<OrdenServicioListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-servicio/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar la orden de servicio');
}

/**
 * Search helper for `TipoServicioMultiSelect`'s `search` prop (mirrors
 * `searchEtiquetas` in `lib/productos.ts`). Reuses `listServiceTypes` (from
 * `lib/service-types.ts`) rather than duplicating the fetch, and restricts
 * results to active tipos de servicio — an `OrdenServicio` must not
 * reference an inactive one (see `ordenes-servicio.service.ts`'s
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
