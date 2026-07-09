/**
 * Valid tipoIdentificacion values — keep create/update DTOs in sync via this.
 * No shared package exists between server/client, so this list is duplicated
 * at client/app/lib/customers.ts — if you change one, change the other.
 */
export const ID_TYPES = ['dni', 'cuit', 'cuil'] as const;
export type IdType = (typeof ID_TYPES)[number];

/** Post-normalization (digits-only) length patterns per tipo. */
export const ID_TYPE_PATTERNS: Record<IdType, RegExp> = {
  dni: /^\d{7,8}$/,
  cuit: /^\d{11}$/,
  cuil: /^\d{11}$/,
};

export const ID_TYPE_LABELS: Record<IdType, string> = {
  dni: 'DNI',
  cuit: 'CUIT',
  cuil: 'CUIL',
};
