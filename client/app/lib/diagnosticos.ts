import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface DiagnosticoListItem {
  id: number;
  descripcion: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
  actualizadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
}

export interface CreateDiagnosticoPayload {
  descripcion: string;
  activo?: boolean;
}

export interface UpdateDiagnosticoPayload {
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

export interface ListDiagnosticosParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedDiagnosticos {
  data: DiagnosticoListItem[];
  total: number;
  activeCount: number;
}

export async function listDiagnosticos(params: ListDiagnosticosParams): Promise<PaginatedDiagnosticos> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/diagnosticos?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de diagnósticos');
}

export async function getDiagnostico(id: number): Promise<DiagnosticoListItem> {
  const res = await fetch(`${API_BASE_URL}/diagnosticos/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el diagnóstico');
}

export async function createDiagnostico(data: CreateDiagnosticoPayload): Promise<DiagnosticoListItem> {
  const res = await fetch(`${API_BASE_URL}/diagnosticos`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el diagnóstico');
}

export async function updateDiagnostico(id: number, data: UpdateDiagnosticoPayload): Promise<DiagnosticoListItem> {
  const res = await fetch(`${API_BASE_URL}/diagnosticos/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el diagnóstico');
}
