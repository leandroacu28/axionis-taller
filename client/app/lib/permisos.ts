import { API_BASE_URL } from './api';
import { getAuthHeader } from './auth';

// Section ids mirror server/src/permisos/section-catalog.ts SECTION_IDS (no shared
// package) — if you add/rename a section, change BOTH. Labels mirror navigation.tsx names.
export const SECTION_CATALOG: { id: string; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'colores', label: 'Colores' },
  { id: 'marcas', label: 'Marcas' },
  { id: 'tipos-servicio', label: 'Tipos de Servicio' },
  { id: 'unidades-medida', label: 'Unidades de Medida' },
  { id: 'etiquetas', label: 'Etiquetas' },
  { id: 'diagnosticos', label: 'Diagnósticos' },
  { id: 'empresa', label: 'Empresa' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'vehiculos', label: 'Vehículos' },
  { id: 'productos', label: 'Productos' },
  { id: 'presupuestos', label: 'Presupuestos' },
  { id: 'ordenes-trabajo', label: 'Órdenes de Trabajo' },
  { id: 'ordenes-trabajo-panel', label: 'Panel de Trabajo' },
];

export type SectionAccessLevel = 'total' | 'lectura' | 'sin_acceso';

export interface RoleGridRow {
  sectionId: string;
  level: SectionAccessLevel;
}

export interface RoleGrid {
  rol: string;
  sections: RoleGridRow[];
}

export interface EffectiveGridRow {
  sectionId: string;
  roleLevel: SectionAccessLevel;
  overrideLevel: SectionAccessLevel | null;
  effectiveLevel: SectionAccessLevel;
}

export interface EffectiveGrid {
  userId: number;
  rol: string;
  sections: EffectiveGridRow[];
}

export interface RoleGridEntryPayload {
  sectionId: string;
  level: SectionAccessLevel;
}

export interface UserOverrideEntryPayload {
  sectionId: string;
  level: SectionAccessLevel | null;
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

export async function getRolePermisos(rol: string): Promise<RoleGrid> {
  const res = await fetch(`${API_BASE_URL}/permisos/roles/${rol}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudieron obtener los permisos');
}

export async function putRolePermisos(
  rol: string,
  sections: RoleGridEntryPayload[],
): Promise<RoleGrid> {
  const res = await fetch(`${API_BASE_URL}/permisos/roles/${rol}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections }),
  });
  return handleJsonResponse(res, 'No se pudieron guardar los permisos');
}

export async function getUserPermisos(userId: number): Promise<EffectiveGrid> {
  const res = await fetch(`${API_BASE_URL}/permisos/users/${userId}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudieron obtener los permisos');
}

export async function putUserPermisos(
  userId: number,
  sections: UserOverrideEntryPayload[],
): Promise<EffectiveGrid> {
  const res = await fetch(`${API_BASE_URL}/permisos/users/${userId}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections }),
  });
  return handleJsonResponse(res, 'No se pudieron guardar los permisos');
}
