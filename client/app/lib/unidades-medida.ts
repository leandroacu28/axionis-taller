import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface UnidadMedidaListItem {
  id: number;
  descripcion: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
  actualizadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
}

export interface CreateUnidadMedidaPayload {
  descripcion: string;
  activo?: boolean;
}

export interface UpdateUnidadMedidaPayload {
  descripcion: string;
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

export interface ListUnidadesMedidaParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedUnidadesMedida {
  data: UnidadMedidaListItem[];
  total: number;
  activeCount: number;
}

export async function listUnidadesMedida(params: ListUnidadesMedidaParams): Promise<PaginatedUnidadesMedida> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/unidades-medida?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de unidades de medida');
}

export async function getUnidadMedida(id: number): Promise<UnidadMedidaListItem> {
  const res = await fetch(`${API_BASE_URL}/unidades-medida/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la unidad de medida');
}

export async function createUnidadMedida(data: CreateUnidadMedidaPayload): Promise<UnidadMedidaListItem> {
  const res = await fetch(`${API_BASE_URL}/unidades-medida`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear la unidad de medida');
}

export async function updateUnidadMedida(id: number, data: UpdateUnidadMedidaPayload): Promise<UnidadMedidaListItem> {
  const res = await fetch(`${API_BASE_URL}/unidades-medida/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar la unidad de medida');
}
