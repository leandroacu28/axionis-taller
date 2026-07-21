// Canonical section slugs = client/app/lib/navigation.tsx leaf `id` values.
// Duplicated (no shared package) at client/app/lib/permisos.ts SECTION_CATALOG —
// if you add/rename a section, change BOTH. Enforcement change will read this list too.
export const SECTION_IDS = [
  'home', 'usuarios', 'colores', 'marcas', 'tipos-servicio', 'unidades-medida',
  'etiquetas', 'diagnosticos', 'empresa', 'clientes', 'vehiculos', 'productos',
  'presupuestos', 'ordenes-trabajo', 'ordenes-trabajo-panel',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_ACCESS_LEVELS = ['total', 'lectura', 'sin_acceso'] as const;
export type SectionAccessLevelValue = (typeof SECTION_ACCESS_LEVELS)[number];
