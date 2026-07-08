/**
 * Valid `rol` values — keep create/update DTOs in sync via this. No shared
 * package exists between server/client, so this list is duplicated at
 * client/app/lib/users.ts — if you change one, change the other.
 */
export const USER_ROLES = ['maestro', 'administrador', 'empleado', 'mecanico'] as const;
export type UserRol = (typeof USER_ROLES)[number];

/** bcrypt cost factor — matches server/src/auth/auth.service.ts's existing value. */
export const SALT_ROUNDS = 10;
