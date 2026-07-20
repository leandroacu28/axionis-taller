import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

export interface Empresa {
  id: number;
  nombre: string | null;
  direccion: string | null;
  telefono: string | null;
  logoUrl: string | null;
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

export async function getEmpresa(): Promise<Empresa> {
  const res = await fetch(`${API_BASE_URL}/empresa`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener los datos de la empresa');
}

export async function updateEmpresa(data: FormData): Promise<Empresa> {
  const res = await fetch(`${API_BASE_URL}/empresa`, {
    method: 'PATCH',
    headers: { ...getAuthHeader() },
    body: data,
  });
  return handleJsonResponse(res, 'No se pudo actualizar los datos de la empresa');
}
