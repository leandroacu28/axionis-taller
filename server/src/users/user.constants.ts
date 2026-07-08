/** Single source of truth for valid `rol` values — keep create/update DTOs in sync via this. */
export const USER_ROLES = ['maestro', 'administrador', 'empleado', 'mecanico'] as const;
export type UserRol = (typeof USER_ROLES)[number];

/** bcrypt cost factor — matches server/src/auth/auth.service.ts's existing value. */
export const SALT_ROUNDS = 10;
