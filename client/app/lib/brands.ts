import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface BrandListItem {
  id: number;
  marca: string;
  modelo: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string } | null;
}

export interface CreateBrandPayload {
  marca: string;
  modelo: string;
  activo?: boolean;
}

export interface UpdateBrandPayload {
  marca: string;
  modelo: string;
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

export interface ListBrandsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedBrands {
  data: BrandListItem[];
  total: number;
  activeCount: number;
}

export async function listBrands(params: ListBrandsParams): Promise<PaginatedBrands> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/brands?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de marcas');
}

export async function getBrand(id: number): Promise<BrandListItem> {
  const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la marca');
}

export async function createBrand(data: CreateBrandPayload): Promise<BrandListItem> {
  const res = await fetch(`${API_BASE_URL}/brands`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear la marca');
}

export async function updateBrand(id: number, data: UpdateBrandPayload): Promise<BrandListItem> {
  const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar la marca');
}

export interface ExportBrandsParams {
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export async function exportBrands(params: ExportBrandsParams): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();

  const res = await fetch(`${API_BASE_URL}/brands/export${qs ? `?${qs}` : ''}`, {
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
    throw new Error(message || 'No se pudo exportar las marcas');
  }

  return res.blob();
}
