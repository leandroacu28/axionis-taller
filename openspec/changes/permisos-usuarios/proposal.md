# Proposal: Permisos de Usuarios (Section Access Management — data + admin UI only)

## Intent
Every section in this app is currently ungated: any authenticated user reaches every route, and the JWT/`req.user` carries no role or permission data. This has been deliberately deferred across 6+ prior changes under the verbatim promise of a "future Permisos feature" (e.g. `openspec/specs/app-navigation/spec.md` "No Role Filtering in V1"; `openspec/changes/presupuestos-crud/proposal.md`). This change builds the **first slice** of that feature: a data model plus an admin page to assign, **per user and per section**, one of three access levels — `total` (acceso total), `lectura` (acceso solo lectura), `sin_acceso` (sin acceso). It is a two-tier model: a **per-role default grid** plus **per-user overrides** on top. Enforcement is explicitly NOT in this change — no route/page is gated, no guard is added, no `req.user`/JWT shape changes. This slice only lets an admin *record* the intended access; a distinct future change will *enforce* it.

## Scope

### In Scope
- **Data model** (adopt the two-tier schema already drifted into the local dev DB, empty, untracked):
  - `RoleSectionAccess { id, rol String, sectionId String, level enum(total|lectura|sin_acceso), createdAt, updatedAt, @@unique([rol, sectionId]) }` — the role-level default grid.
  - `UserSectionOverride { id, userId Int→User onDelete Cascade, sectionId String, level enum(total|lectura|sin_acceso), createdAt, updatedAt, @@unique([userId, sectionId]) }` — per-user override.
  - Adopted **as-is**: no `creadoPorId`/`actualizadoPorId` audit columns (decision D3), `level` is a Prisma enum, `sectionId` is free-form `String` (not a DB enum — revisable later without a schema break). Add the back-relation array on `User` for `UserSectionOverride`.
- **Backend** — new `server/src/permisos/` module (controller/service/module + DTOs), mirroring `server/src/users/` shape, guarded by the existing `JwtAuthGuard` only. Endpoints (route base `permisos`):
  - `GET /permisos/roles/:rol` — read that role's default grid (all sections; missing rows default to `sin_acceso`).
  - `PUT /permisos/roles/:rol` — upsert the role default grid.
  - `GET /permisos/users/:userId` — read the **effective grid**: for each section return `{ sectionId, roleLevel, overrideLevel|null, effectiveLevel }` where effective = override ?? role default ?? `sin_acceso`.
  - `PUT /permisos/users/:userId` — upsert/clear per-user overrides (setting a level upserts; clearing deletes the override row so the user falls back to the role default).
- **Frontend** — new page `client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` (matches the existing `usuarios/editar/[id]` + `usuarios/nuevo/` route convention). Renders a per-section table for the selected user: each row shows the section name, the inherited role default (read-only), and a 3-option control (`total`/`lectura`/`sin_acceso` + "usar valor del rol" to clear the override). New `client/app/lib/permisos.ts` typed client mirroring `client/app/lib/users.ts`.
- **Dropdown entry** — add a third "Permisos" item in the row-actions menu at `client/app/(dashboard)/usuarios/page.tsx` (~lines 448–481), inserted between "Editar" and "Activar/Desactivar", same `<Icon/>` + `Link` pattern, linking to `/usuarios/permisos/${user.id}`. NOT a sidebar nav item.
- **Canonical `sectionId` list** — adopt the existing `navigation.tsx` leaf `id` values (15): `home, usuarios, colores, marcas, tipos-servicio, unidades-medida, etiquetas, diagnosticos, empresa, clientes, vehiculos, productos, presupuestos, ordenes-trabajo, ordenes-trabajo-panel`.

### Out of Scope (Non-Goals — hard boundaries)
- **Any enforcement/gating anywhere** — no route, page, controller, or nav item is restricted based on these values in this change.
- **Any change to `req.user` / JWT payload** — stays `{ userId, username }` (`server/src/auth/strategies/jwt.strategy.ts`).
- **Any `@UseGuards` change on existing modules** — no `RolesGuard`/`PermisosGuard` is created; none exists today.
- **Sidebar nav filtering** — `app-navigation`'s "No Role Filtering in V1" stays intact.
- **Audit trail** on the two new tables (adopted schema has none — D3).
- **Seeding role defaults** for existing `rol` values — grids default to `sin_acceso` until an admin sets them (revisit under enforcement change).

## Capabilities
### New Capabilities
- `section-access-management`: backend data model + `permisos` module exposing role-default and per-user override CRUD and the merged effective-grid read. No enforcement.
- `section-access-ui`: the per-user Permisos admin page + the "Permisos" row-action entry + `lib/permisos.ts` client.

### Modified Capabilities
- None. `app-navigation` "No Role Filtering in V1" is unchanged (this adds no filtering); the dropdown entry lives on the Usuarios page, not the sidebar.

## Approach
Backend mirrors `server/src/users/` (thin controller, service owns Prisma, `class-validator` DTOs, Nest exceptions, Spanish messages). The effective grid is computed server-side by left-joining the 15-section canonical list against `RoleSectionAccess` (by the user's `rol`) and `UserSectionOverride` (by `userId`), collapsing to `override ?? roleDefault ?? sin_acceso`. Frontend reuses the full-page `editar/[id]` pattern (not a modal) and the `lib/users.ts` fetch/error convention. The `sectionId` catalog is defined once as a shared constant so backend validation and frontend labels stay in sync (duplicated per the repo's no-shared-package convention).

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` + migration | New | Two models + `User` back-relation; drift cleanup (see below) |
| `server/src/permisos/` | New | Module, controller, service, DTOs |
| `server/src/app.module.ts` | Modified | Register `PermisosModule` |
| `client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` | New | Per-user access grid page |
| `client/app/lib/permisos.ts` | New | Typed API client |
| `client/app/(dashboard)/usuarios/page.tsx` | Modified | Add "Permisos" row-action entry |

## Decisions (documented for review/override)
- **D1 — Route**: `usuarios/permisos/[id]` (verb-segment + `[id]`), consistent with `editar/[id]`.
- **D2 — sectionId source**: reuse `navigation.tsx` leaf `id`s as the canonical section slugs; free-form `String` column keeps it revisable without a schema break.
- **D3 — No audit columns**: adopt the recovered schema exactly (no `creadoPor`/`actualizadoPor`), diverging from house catalog convention. Rationale: matches what was already built, keeps this slice minimal; enforcement change can revisit. Tradeoff stated explicitly, not silent.
- **D4 — Two-tier model kept**: role default + per-user override, even though only the per-user page ships UI now; the role-grid endpoints exist so the model is complete for the future enforcement change.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Team assumes this slice already enforces access | Med | Non-Goals section states enforcement is a separate future change; UI copy should read as "configuración", not active gating |
| Orphaned `RoleSectionAccess`/`UserSectionOverride` tables (empty, untracked) collide with a fresh Prisma migration | High | `sdd-design`/`sdd-apply` concern: drop the two empty orphaned tables first, then let Prisma create them cleanly through proper migration history |
| No audit trail on who set a permission | Low (accepted) | D3 — deliberate; revisitable under enforcement change |
| `sectionId` list drifts from `navigation.tsx` over time | Med | Single shared constant as source of truth; document that new sections must be added to it |

## Rollback Plan
Additive except for the pre-existing drift cleanup.
1. Revert the migration (drops `RoleSectionAccess`, `UserSectionOverride`, and the `User` back-relation) — safe, both tables are empty.
2. **Drift note**: because these two tables already exist in the local dev DB *outside* migration history, `sdd-apply` must first drop the orphaned tables so the new migration recreates them under proper history. On rollback, the down-migration removes them again; no committed history ever referenced the orphaned versions, so there is nothing else to reconcile. No data loss (tables are empty).
3. Remove `server/src/permisos/` and its `app.module.ts` import.
4. Remove the frontend page, `lib/permisos.ts`, and the "Permisos" dropdown entry.
No backfill/data migration is involved.

## Success Criteria
- [ ] `RoleSectionAccess` + `UserSectionOverride` exist via a clean Prisma migration (orphaned drift tables dropped first), with `level` enum `total|lectura|sin_acceso` and the documented `@@unique` constraints.
- [ ] `GET /permisos/users/:userId` returns one row per canonical section with `roleLevel`, `overrideLevel`, and merged `effectiveLevel` (override ?? role ?? `sin_acceso`).
- [ ] `PUT /permisos/users/:userId` upserts an override when a level is set and deletes it when cleared (falls back to role default); `PUT /permisos/roles/:rol` upserts the role grid. All require a valid Bearer token; no role check.
- [ ] The Usuarios row-actions dropdown shows "Permisos" between "Editar" and "Activar/Desactivar", linking to `/usuarios/permisos/{id}`; it is NOT a sidebar nav item.
- [ ] No existing route/page/controller gains a guard; `req.user`/JWT shape is unchanged.
- [ ] Migration is reversible per the Rollback Plan.
