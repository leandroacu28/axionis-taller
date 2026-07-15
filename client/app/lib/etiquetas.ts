import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface EtiquetaListItem {
  id: number;
  descripcion: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
  actualizadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
}

export interface CreateEtiquetaPayload {
  descripcion: string;
  activo?: boolean;
}

export interface UpdateEtiquetaPayload {
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

export interface ListEtiquetasParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedEtiquetas {
  data: EtiquetaListItem[];
  total: number;
  activeCount: number;
}

export async function listEtiquetas(params: ListEtiquetasParams): Promise<PaginatedEtiquetas> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/etiquetas?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de etiquetas');
}

export async function getEtiqueta(id: number): Promise<EtiquetaListItem> {
  const res = await fetch(`${API_BASE_URL}/etiquetas/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la etiqueta');
}

export async function createEtiqueta(data: CreateEtiquetaPayload): Promise<EtiquetaListItem> {
  const res = await fetch(`${API_BASE_URL}/etiquetas`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear la etiqueta');
}

export async function updateEtiqueta(id: number, data: UpdateEtiquetaPayload): Promise<EtiquetaListItem> {
  const res = await fetch(`${API_BASE_URL}/etiquetas/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar la etiqueta');
}
