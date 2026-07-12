import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface ColorListItem {
  id: number;
  descripcion: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
}

export interface CreateColorPayload {
  descripcion: string;
  activo?: boolean;
}

export interface UpdateColorPayload {
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

export interface ListColorsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedColors {
  data: ColorListItem[];
  total: number;
  activeCount: number;
}

export async function listColors(params: ListColorsParams): Promise<PaginatedColors> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/colors?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de colores');
}

export async function getColor(id: number): Promise<ColorListItem> {
  const res = await fetch(`${API_BASE_URL}/colors/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el color');
}

export async function createColor(data: CreateColorPayload): Promise<ColorListItem> {
  const res = await fetch(`${API_BASE_URL}/colors`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el color');
}

export async function updateColor(id: number, data: UpdateColorPayload): Promise<ColorListItem> {
  const res = await fetch(`${API_BASE_URL}/colors/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el color');
}

export interface ExportColorsParams {
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export async function exportColors(params: ExportColorsParams): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();

  const res = await fetch(`${API_BASE_URL}/colors/export${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeader() },
  });

  if (!res.ok) {
    // Non-JSON success path — but Nest error bodies are still JSON, so read the
    // message defensively (mirrors handleJsonResponse's error branch) rather
    // than forcing the whole response through it.
    const message = await res
      .json()
      .then((body) => body?.message)
      .catch(() => undefined);
    throw new Error(message || 'No se pudo exportar los colores');
  }

  return res.blob();
}
