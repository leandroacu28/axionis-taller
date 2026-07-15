import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';
import { listUnidadesMedida } from './unidades-medida';
import { listEtiquetas } from './etiquetas';

export interface ProductoListItem {
  id: number;
  descripcion: string;
  codigo: string | null;
  activo: boolean;
  cantidadInicial: string;
  alertaStock: boolean;
  cantidadMinima: string;
  precioCompra: string | null;
  porcentajeGanancia: string | null;
  precioVenta: string | null;
  precioMayorista: string | null;
  alicuotaIva: 21 | 10.5 | 0;
  unidadMedidaId: number;
  unidadMedida: { id: number; descripcion: string };
  etiquetas: { id: number; descripcion: string }[];
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string } | null;
  actualizadoPor: { id: number; username: string } | null;
}

export interface CreateProductoPayload {
  descripcion: string;
  codigo: string | null;
  unidadMedidaId: number;
  cantidadInicial: number;
  alertaStock: boolean;
  cantidadMinima: number;
  precioCompra?: number | null;
  porcentajeGanancia?: number | null;
  precioVenta: number;
  precioMayorista?: number | null;
  alicuotaIva: 21 | 10.5 | 0;
  etiquetaIds?: number[];
}

export interface UpdateProductoPayload extends CreateProductoPayload {
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

export interface ListProductosParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export interface PaginatedProductos {
  data: ProductoListItem[];
  total: number;
  activeCount: number;
}

export async function listProductos(params: ListProductosParams): Promise<PaginatedProductos> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${API_BASE_URL}/productos?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la lista de productos');
}

export async function getProducto(id: number): Promise<ProductoListItem> {
  const res = await fetch(`${API_BASE_URL}/productos/${id}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el producto');
}

export async function createProducto(data: CreateProductoPayload): Promise<ProductoListItem> {
  const res = await fetch(`${API_BASE_URL}/productos`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo crear el producto');
}

export async function updateProducto(id: number, data: UpdateProductoPayload): Promise<ProductoListItem> {
  const res = await fetch(`${API_BASE_URL}/productos/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleJsonResponse(res, 'No se pudo actualizar el producto');
}

/**
 * Search helper for `UnidadMedidaSelect`'s `search` prop. Reuses
 * `listUnidadesMedida` (from `lib/unidades-medida.ts`) rather than
 * duplicating the fetch, and restricts results to active units — a
 * `Producto` must not reference an inactive `UnidadMedida` (see
 * `productos.service.ts`'s `assertUnidadMedidaActiva`).
 */
export async function searchUnidadesMedida(term: string): Promise<{ id: number; label: string }[]> {
  const result = await listUnidadesMedida({
    search: term || undefined,
    status: 'activo',
    page: 1,
    pageSize: 20,
  });
  return result.data.map((unidad) => ({ id: unidad.id, label: unidad.descripcion }));
}

/**
 * Search helper for `EtiquetasMultiSelect`'s `search` prop. Reuses
 * `listEtiquetas` (from `lib/etiquetas.ts`) rather than duplicating the
 * fetch, and restricts results to active tags — a `Producto` must not
 * reference an inactive `Etiqueta` (see `productos.service.ts`'s
 * `assertEtiquetasActivas`).
 */
export async function searchEtiquetas(term: string): Promise<{ id: number; label: string }[]> {
  const result = await listEtiquetas({
    search: term || undefined,
    status: 'activo',
    page: 1,
    pageSize: 20,
  });
  return result.data.map((etiqueta) => ({ id: etiqueta.id, label: etiqueta.descripcion }));
}
