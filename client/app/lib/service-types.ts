import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface ServiceTypeListItem {
  id: number;
  descripcion: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
  actualizadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
}

export interface CreateServiceTypePayload {
  descripcion: string;
  activo?: boolean;
}

export interface UpdateServiceTypePayload {
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

export interface ListServiceTypesParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedServiceTypes {
  data: ServiceTypeListItem[];
  total: number;
  activeCount: number;
}

export async function listServiceTypes(params: ListServiceTypesParams): Promise<PaginatedServiceTypes> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/service-types?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de tipos de servicio');
}

export async function getServiceType(id: number): Promise<ServiceTypeListItem> {
  const res = await fetch(`${API_BASE_URL}/service-types/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el tipo de servicio');
}

export async function createServiceType(data: CreateServiceTypePayload): Promise<ServiceTypeListItem> {
  const res = await fetch(`${API_BASE_URL}/service-types`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el tipo de servicio');
}

export async function updateServiceType(id: number, data: UpdateServiceTypePayload): Promise<ServiceTypeListItem> {
  const res = await fetch(`${API_BASE_URL}/service-types/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el tipo de servicio');
}

export interface ExportServiceTypesParams {
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export async function exportServiceTypes(params: ExportServiceTypesParams): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();

  const res = await fetch(`${API_BASE_URL}/service-types/export${qs ? `?${qs}` : ''}`, {
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
    throw new Error(message || 'No se pudo exportar los tipos de servicio');
  }

  return res.blob();
}
