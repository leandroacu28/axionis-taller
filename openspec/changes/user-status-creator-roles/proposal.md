# Proposal: User Status, Creator Tracking, and Expanded Roles

## Intent
Extend the `User` model with an `activo` (active/inactive) flag that gates login, a `creadoPor` self-reference tracking which user created each account, and expand `rol` from the current 2-value set (`admin`/`empleado`) to 4 values (`maestro`/`administrador`/`empleado`/`mecanico`). `updatedAt` already exists in the schema and backend response but is missing from the frontend type/table — add it there too.

## Decisions Already Confirmed With User
1. The master user's `rol` changes from `admin` → `maestro` (matches "Usuario Maestro", the bootstrap/highest-privilege account).
2. `activo: false` blocks login outright (401), even with correct credentials.

## Scope

### In Scope
- **Schema**: `User` gains `activo Boolean @default(true)` and a nullable self-relation `creadoPorId Int?` / `creadoPor User?` (the creator; `null` for the master user and any pre-existing row). New migration backfills the master user's `rol` from `admin` to `maestro` (scoped by `username = 'lmoreno'`, not a broad `WHERE`, per the lesson from an earlier migration bug this session).
- **Role set**: `USER_ROLES` becomes `['maestro', 'administrador', 'empleado', 'mecanico']` in both `server/src/users/user.constants.ts` and `client/app/lib/users.ts` (kept in sync manually, as before — no shared package between server/client). `auth.service.ts`'s `MASTER_ROL` constant updates to `'maestro'`.
- **Login gate**: `AuthService.validateUser()` throws a distinct `UnauthorizedException('Usuario inactivo. Contactá a un administrador.')` when credentials are correct but `activo` is `false` — separate from the generic "Invalid credentials" message for wrong username/password, so a legitimate user gets an actionable message instead of thinking they mistyped their password.
- **Creator tracking**: `POST /users` now records who created the row. The controller reads the authenticated caller's id (`req.user.userId`, already populated by the existing `JwtAuthGuard`/`JwtStrategy` — no auth infra changes needed) and passes it to the service as `creadoPorId`. Not client-suppliable (not a DTO field).
- **`activo` in create/update**: `CreateUserDto` gains optional `activo?: boolean` (defaults to `true` via the schema if omitted). `UpdateUserDto` gains optional `activo?: boolean` — this is also how an admin "deactivates" a user, filling the gap left by there being no delete endpoint (deliberately out of scope, unchanged).
- **Frontend**: `UserListItem` gains `activo: boolean`, `updatedAt: string`, `creadoPor: { id: number; username: string } | null`. Table gains columns: Estado (badge), Creado por (username or "—" for the master user), Actualizado (formatted date). Form gains an "Activo" checkbox and the role `<select>` grows to 4 options with Spanish display labels (`Maestro`/`Administrador`/`Empleado`/`Mecánico`) mapped from the stored ASCII values.

### Explicitly Deferred (not this change)
- **Per-request `activo` re-check**: the login gate gives immediate effect for *new* logins, but an already-issued JWT for a user who gets deactivated mid-session keeps working until it expires or they log out — same accepted tradeoff already established for the deferred role/permission system (`Permisos`). Immediate session revocation would require the same "fresh DB lookup per request" guard infrastructure already deferred there; adding it just for `activo` would be inconsistent scope creep.
- **Any UI/behavior gating by `rol`** — still deferred to the future Permisos feature, unchanged from the prior decision.
- **Cascading behavior when a "creator" user is later deactivated or (hypothetically) deleted** — `creadoPorId` is a simple nullable reference; no cascade logic beyond the DB's own `ON DELETE SET NULL`, since there is no delete endpoint to trigger it anyway.

## Approach
Single Prisma migration adds both new columns plus the self-relation FK, and backfills `lmoreno`'s `rol`. Backend changes stay within the existing `users`/`auth` modules — no new modules, no new guards. Frontend changes stay within `lib/users.ts` and the `usuarios` page — same files touched by the prior CRUD change, no new pages.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Self-relation migration syntax error (FK to same table) | Low | Standard Prisma pattern (`@relation("Name", fields, references)` + inverse array field), well-documented, low complexity for a single nullable FK |
| Deactivating your own account locks you out with no recovery path (no delete/reactivate-via-DB-only fallback documented) | Med | Acceptable for an internal tool at this stage — `activo` can still be flipped back via direct DB access (same class of recovery already relied on for other admin tasks this session); not blocking |
| Existing non-`lmoreno` rows (if any survive to migration time) keep `rol='admin'`, an now-invalid value the DTO's `@IsIn` would reject on their next update | Low | Confirmed via `GET /users` that only `lmoreno` exists in the dev DB right now; the backfill is scoped to `username='lmoreno'` intentionally, matching the "don't blanket-update" lesson from before |

## Success Criteria
- [ ] Migration applies cleanly; `lmoreno` has `rol='maestro'`, `activo=true`, `creadoPorId=null` afterward.
- [ ] Login with correct credentials for an `activo=false` user returns 401 with the distinct "Usuario inactivo" message; wrong password still returns the generic message.
- [ ] `POST /users` records the authenticated caller's id as `creadoPorId` without it being client-suppliable.
- [ ] `PATCH /users/:id` can toggle `activo`.
- [ ] Frontend table shows Estado/Creado por/Actualizado columns; the role select offers exactly the 4 new values with Spanish labels; creating/editing a user works with the new fields.
