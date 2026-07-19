import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface VehicleListItem {
  id: number;
  anio: number;
  kilometraje: number;
  patente: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  marca: { id: number; marca: string; modelo: string };
  color: { id: number; descripcion: string };
  cliente: { id: number; razonSocial: string };
  creadoPor: { id: number; username: string } | null;
  actualizadoPor: { id: number; username: string } | null;
}

export interface CreateVehiclePayload {
  marcaId: number;
  colorId: number;
  anio: number;
  kilometraje: number;
  patente?: string;
  clienteId: number;
  activo?: boolean;
}

export interface UpdateVehiclePayload {
  marcaId: number;
  colorId: number;
  anio: number;
  kilometraje: number;
  patente?: string;
  clienteId: number;
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

export interface ListVehiclesParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
  clienteId?: number;
}

export interface PaginatedVehicles {
  data: VehicleListItem[];
  total: number;
  activeCount: number;
}

export async function listVehicles(params: ListVehiclesParams): Promise<PaginatedVehicles> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.clienteId) query.set('clienteId', String(params.clienteId));

  const res = await fetch(`${API_BASE_URL}/vehicles?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de vehículos');
}

export async function getVehicle(id: number): Promise<VehicleListItem> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el vehículo');
}

export async function createVehicle(data: CreateVehiclePayload): Promise<VehicleListItem> {
  const res = await fetch(`${API_BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el vehículo');
}

export async function updateVehicle(
  id: number,
  data: UpdateVehiclePayload,
): Promise<VehicleListItem> {
  const res = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el vehículo');
}

export interface ExportVehiclesParams {
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export async function exportVehicles(params: ExportVehiclesParams): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();

  const res = await fetch(`${API_BASE_URL}/vehicles/export${qs ? `?${qs}` : ''}`, {
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
    throw new Error(message || 'No se pudo exportar los vehículos');
  }

  return res.blob();
}
