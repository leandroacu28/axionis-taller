# Exploration: Clientes CRUD (create, list, edit — no delete)

## Current State

**Prisma schema** (`server/prisma/schema.prisma`) — only one model exists, `User`. It already has the "creator" self-relation pattern this feature needs to mirror:
```prisma
creadoPorId  Int?
creadoPor    User?    @relation("UserCreatedBy", fields: [creadoPorId], references: [id], onDelete: SetNull)
creados      User[]   @relation("UserCreatedBy")
createdAt    DateTime @default(now())
updatedAt    DateTime @updatedAt
```
There is **no existing pattern for "who last updated this row"** anywhere in the schema. `updatedAt` is a plain `@updatedAt` timestamp, not a user reference. Also note: this is a **self-relation** (`User → User`); a `Cliente → User` creator/updater FK is a *different* relation shape (cross-model many-to-one, needed twice — once for creator, once for updater) with no precedent in this codebase yet.

No Prisma `enum` is used anywhere — categorical fields (`rol`) are plain `String` columns validated at the DTO layer with `class-validator`'s `@IsIn([...])`. Established convention to reuse for `tipo de identificación`: `String` column + `@IsIn(['dni','cuil','cuit'])`, not a Prisma enum.

Migrations are timestamped, single-purpose folders (e.g. `20260708040000_add_user_dni`, `20260708191006_add_user_email`).

## Server reference pattern (`server/src/users/`)

- `users.module.ts` — minimal `@Module({ controllers, providers })`, registered in `server/src/app.module.ts` imports.
- `users.controller.ts` — `@Controller('users') @UseGuards(JwtAuthGuard)`. `create`/`update` pull the caller id from `@Request() req: { user: { userId: number; username: string } }` and pass it to the service. `userId` comes from `server/src/auth/strategies/jwt.strategy.ts` (`validate({ sub, username }) → { userId, username }`) — **not client-suppliable**. This is exactly the mechanism needed for both creator (on create) and updater (on update): call the service with `req.user.userId` on both `create()` and `update()`.
- `users.service.ts`:
  - `USER_SELECT` whitelist constant — response shape declared once, reused everywhere, includes nested `creadoPor: { select: { id: true, username: true } }`. Safer than blacklist-destructuring since a newly added sensitive column can't leak by accident.
  - Duplicate-field handling: `findUnique`/`findFirst` pre-check (with `NOT: { id }` on update to allow a row to keep its own value) **plus** a `uniqueTargetIncludes()` backstop reading the Prisma `P2002` error's `meta.target` to close the TOCTOU race between pre-check and write. Directly reusable if `identificación` needs uniqueness.
  - `activo` guard-rails in `update()`: self-lockout + master-account lockout. This is **login-account-specific** and does not transfer literally to `clientes` (clientes don't authenticate). Transferable lesson: *"activo is not just a data field — check whether toggling it has cascading effects before treating it as a plain boolean write."*
- DTOs (`dto/create-user.dto.ts`, `dto/update-user.dto.ts`) — `class-validator`, explicit decorators per field. Global `ValidationPipe({ whitelist: true, transform: true })` strips any undeclared field.
- `user.constants.ts` — exported `as const` arrays for enum-like sets (`USER_ROLES`) plus a derived type; explicitly duplicated on the client (`client/app/lib/users.ts`) since there's no shared package — comment states "if you change one, change the other."
- Error messages are Spanish, user-facing (`'El nombre de usuario ya existe.'`) — project convention for API error text, not just UI copy.

## Client reference pattern (`client/app/(dashboard)/usuarios/`, `client/app/lib/`)

- `client/app/lib/users.ts` — typed API client: list item interface, `Create*Payload`/`Update*Payload` interfaces, shared `handleJsonResponse<T>()` helper (check `res.ok`, extract `body.message` on failure, throw `Error`), `getAuthHeader()` attached on every fetch, one function per operation.
- `page.tsx` (list) — `'use client'`; **all filtering/search/pagination happens client-side in-memory** over the full `listUsers()` response (no server-side query params — `GET /users` has zero filter/pagination support today). Search matches multiple fields case-insensitively. Status filter (`all/activo/inactivo`, defaults to `activo`). Page-size selector (10/25/50). Per-row "..." dropdown menu via `createPortal` with Editar / Activar-Desactivar actions; deactivate goes through `showConfirm()` first; toasts via `showSuccess`/`showError`; self/master lockout enforced both client-side (UX only) and server-side (the real boundary).
- `nuevo/page.tsx` and `editar/[id]/page.tsx` — single `FormState` object + generic `updateField` setter; required-field validation before submit; `showError`/`showSuccess` toasts; `router.push` back to list on success; Cancel link. Edit page loads the record via `getUser(id)` in a `useEffect` with a `cancelled` guard against unmount races.
- `client/app/lib/alerts.ts` — `showSuccess/showError/showConfirm/showToast`, SweetAlert2-based, already generic — directly reusable as-is.

## Navigation and session-user identification

- `client/app/lib/navigation.tsx` — flat array of `NavigationItem`; "Usuarios" is nested under a "Configuraciones" group. A new "Clientes" entry needs a placement decision: top-level (like "Inicio") vs. nested under a group. No role-based filtering exists in nav — visible to any authenticated user, same as Usuarios today.
- `client/app/lib/auth.ts` — `getUser()` reads a **client-writable, display-only cookie**, explicitly documented as not for authorization. Confirms: creator/updater identity for `clientes` must be resolved server-side from the JWT (`req.user.userId`), mirroring `creadoPorId` in `users` — never trust a client-sent user id.

## Prior-change conventions consulted

- `openspec/changes/usuarios-crud/proposal.md` and `.../specs/users-management/spec.md` — established the CRUD-minus-delete shape, whitelist response pattern, RFC-2119 spec style with Given/When/Then scenarios.
- `openspec/changes/user-status-creator-roles/proposal.md` — established `activo` + `creadoPor` addition as a single Prisma migration (new nullable columns + FK, no cascading delete logic since there's no delete endpoint), and the controller→service caller-id-passing mechanism now in `users.controller.ts`.

## Open Questions for Proposal Phase

1. **`identificación` uniqueness**: globally unique, or unique per `tipo`? No existing composite-uniqueness precedent — `User.dni` is a simple single-column `@unique`.
2. **Format validation per `tipo`**: DNI (7-8 digits) vs. CUIT/CUIL (11 digits, standard AR format)? No existing conditional-per-field-value validator in this codebase.
3. **List UX parity**: reuse the exact same in-memory search/filter/pagination/status-toggle pattern as usuarios? (No backend pagination pattern exists in this codebase at all yet.)
4. **Searchable fields**: should "razón social" be part of the search box (parallel to nombre/apellido/username/dni for usuarios)?
5. **New relation shape needed**: `creadoPor`/`actualizadoPor` on `Cliente` would be two `Cliente → User` many-to-one FKs — structurally different from `User`'s existing self-relation. New pattern for this schema, not a copy-paste.
6. **Does `activo` have business consequences** for a cliente beyond a status badge? The self/master-lockout guard is login-specific and does not transfer directly.
7. **Delete out of scope** — matches Usuarios' "no delete" precedent; should be stated explicitly in the proposal.
8. **Module/route naming**: Spanish (`server/src/clientes/`, `/clientes`) or English (`server/src/customers/`, `/customers`)? The `users` module uses English identifiers/routes despite Spanish UI copy — needs an explicit decision.
9. **Future FK relationships** (e.g. a future `Vehiculo.clienteId`) are out of scope for this change but worth flagging: `Cliente` will be the first "customer" entity, structurally distinct from `User` (staff).

## Ready for Proposal
Yes.
