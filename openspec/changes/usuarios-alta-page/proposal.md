# Proposal: Usuarios — Dedicated Create Page, DNI, Required Name, Password Confirmation

## Intent
`usuarios-crud` shipped user create/edit as a single inline `<form>` on the list page (`usuarios/page.tsx`). Product now wants user creation to be a first-class, dedicated flow — a separate page — and to capture stronger identity data. This change: (1) moves **create** to a new dedicated route `/usuarios/nuevo` while **edit stays inline** on the list page, (2) adds a required, unique **DNI** field, (3) makes **nombre/apellido required** going forward, and (4) adds a frontend-only **password confirmation** ("repetir contraseña") on the create page. It builds directly on top of the (verified, not-yet-archived) `usuarios-crud` change.

## Scope

### In Scope
- **New create page**: `client/app/(dashboard)/usuarios/nuevo/page.tsx` (URL `/usuarios/nuevo`, auto-inherits the `(dashboard)/layout.tsx` Sidebar+Header). Fields: `username`, `dni`, `nombre`, `apellido`, `rol`, `activo`, `password`, and a second **confirm-password** input. "Nuevo usuario" on the list navigates here (via `<Link>` or `router.push`); create form is REMOVED from `usuarios/page.tsx`.
- **DNI field (required, unique, free text)**: added to `User` schema, `CreateUserDto`, `UpdateUserDto`, service, `lib/users.ts` types. Validation `@IsString() @IsNotEmpty()` — same rigor as `username`, no numeric/length format. Uniqueness mirrors username's two-layer pattern EXACTLY: own `DUPLICATE_DNI_ERROR` constant, `findUnique({ where: { dni } })` pre-check → `ConflictException`, plus DB `@unique` + Prisma `P2002` catch as a TOCTOU backstop.
- **DNI on edit (nuance)**: DNI IS editable via the inline edit form + PATCH. On update, its uniqueness pre-check MUST exclude the record being edited (`NOT: { id }`) — a new consideration since `username` was never editable.
- **Nombre/Apellido required**: enforced in `CreateUserDto`, `UpdateUserDto`, the create page, and the inline edit form. `@IsString() @IsNotEmpty()` replacing the current optional `@IsOptional() @IsString()`.
- **Password confirmation (frontend-only)**: second input on the create page must match `password` before submit is enabled; NEVER sent to the backend, NO DTO change.
- **List table**: add a DNI column to the users table on `usuarios/page.tsx`.

### Explicitly Deferred
- **Access control / permissions**: unchanged — still deferred to the future "Permisos" feature. No role guard added; `app-navigation` "No Role Filtering in V1" stays intact.

### Out of Scope
- DNI format/checksum validation (Argentine DNI numeric rules) — free text only.
- Backfilling DNI for existing users (existing rows have no DNI; see Known Gaps).
- Delete/deactivate, self-service password change, email/invite flows, audit trail, list pagination.

## Capabilities

### New Capabilities
- None. No new capability — this extends existing behavior.

### Modified Capabilities
> The `usuarios-crud` specs are NOT yet promoted to `openspec/specs/` (that change is verified but not archived). They currently live in `openspec/changes/usuarios-crud/specs/`. This change's delta specs must be authored against those requirement sets.
- `users-management` (backend): add DNI (required, unique, two-layer check incl. exclude-self on edit); tighten `nombre`/`apellido` from optional to required in create AND update.
- `users-management-ui` (frontend): create moves OUT to dedicated `/usuarios/nuevo` page with confirm-password; inline edit gains editable DNI; list table gains DNI column; nombre/apellido required in both flows.

## Approach
Backend: additive DNI column + Prisma migration; mirror the exact username uniqueness pattern (constant + pre-check + `P2002` catch) for DNI, adding the edit-time `NOT: { id }` exclusion. Tighten DTO validators. Frontend: extract a create page under the existing route group (no new layout), keep edit inline, add a DNI column and a client-only confirm-password gate that mirrors `login/page.tsx`'s fetch/error convention.

## Known Gaps / Accepted Tradeoffs
- **Nombre/Apellido/DNI nullable→required transition (RESOLVED — app-layer only)**: DB columns stay nullable (`nombre String?`, `apellido String?`, new `dni String?` with a partial/nullable-safe unique index). Existing rows keep whatever legacy values they have (including `null` nombre/apellido and no DNI) — no backfill, no NOT-NULL migration. Required-ness and DNI uniqueness are enforced ONLY at the DTO/form layer for new creates and any future edits. This was an explicit product decision to avoid a risky backfill migration.
- **DNI uniqueness with a nullable column (RESOLVED in `sdd-design`)**: engine is MySQL (InnoDB), which permits unlimited `NULL`s under a `UNIQUE` index — legacy rows with no DNI coexist freely. A real DB `dni String? @unique` constraint is kept (not dropped to app-layer-only), preserving the same TOCTOU backstop `username` already relies on, plus the two-layer app check (`findUnique`/`findFirst` pre-check + `P2002` catch).
- **Confirm-password is frontend-only**: a scripted/API caller bypasses it entirely. Accepted — it is a UX guard against typos, not a security control.

## Spec Changes Required
- Delta spec for `users-management` (DNI create/edit + uniqueness incl. exclude-self; required nombre/apellido).
- Delta spec for `users-management-ui` (dedicated create page, confirm-password gate, DNI column, required-field UX).
- `openspec/specs/user-identity/spec.md`: the "User Profile Columns" requirement states `nombre`/`apellido` are nullable — this change alters that contract; reconcile per the design decision above (and add DNI to the profile-columns requirement).

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ~~Nullable DNI column + DB unique index null-handling~~ (resolved) | — | Confirmed MySQL InnoDB permits unlimited nulls under `UNIQUE`; real DB constraint kept, no risk to legacy rows |
| DNI edit-uniqueness check forgets `NOT: { id }` and blocks a user from saving their own record | Med | Spec + design call out the exclude-self clause explicitly; scenario covers "edit without changing DNI" |
| Confirm-password logic diverges from `login` conventions / new state pattern | Low | Reuse `useState` + inline validation, no new dependency |
| Create form removed from list page but a caller still expects it | Low | Single-repo internal tool; "Nuevo usuario" is rewired to navigate, not toggle a form |

## Success Criteria
- [ ] "Nuevo usuario" navigates to `/usuarios/nuevo`; the create form no longer renders inline on the list page.
- [ ] Creating a user requires `dni`, `nombre`, `apellido` (non-empty); missing any returns 400.
- [ ] Duplicate `dni` returns 409 via the two-layer check (pre-check + `P2002` backstop), mirroring `username`.
- [ ] DNI is editable via PATCH; editing a user without changing DNI does NOT 409 on itself (exclude-self works).
- [ ] Confirm-password mismatch blocks submit client-side and is never sent to the backend.
- [ ] The users list table shows a DNI column; the inline edit form includes DNI + required nombre/apellido.
- [ ] DB columns for `nombre`/`apellido`/`dni` remain nullable (no backfill migration); required-ness is enforced only at the DTO/form layer for new creates and edits, per the resolved app-layer-only decision.
