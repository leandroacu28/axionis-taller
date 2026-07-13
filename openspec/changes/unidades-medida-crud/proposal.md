# Proposal: Unidades de Medida CRUD (Create, List, Update)

## Intent
The workshop needs a catalog of *units of measure* (e.g. "Litro", "Unidad", "Metro", "Kilogramo") to later qualify products/supplies, but no such concept exists in the schema today (zero references anywhere). This change delivers a net-new "Unidades de Medida" catalog section — any authenticated user can list, create, and edit units (`descripcion`, `activo`), each stamped with a create/update audit trail (creator, last updater, timestamps). It mirrors the just-shipped `TipoServicio` catalog structurally, so the codebase keeps one consistent catalog pattern rather than divergent conventions.

## Scope

### In Scope
- **Data model**: new `UnidadMedida` Prisma model + one additive migration. Fields identical in shape to `TipoServicio`: `id`, `descripcion String @unique`, `activo Boolean @default(true)`, dual nullable `User` FKs `creadoPorId`/`creadoPor` (relation `"UnidadMedidaCreadoPor"`) and `actualizadoPorId`/`actualizadoPor` (relation `"UnidadMedidaActualizadoPor"`), both `onDelete: SetNull`, plus `createdAt`/`updatedAt`. Adds back-relation arrays `unidadesMedidaCreadas` / `unidadesMedidaActualizadas` on `User`.
- **Backend**: new `server/src/unidades-medida/` module mirroring `server/src/service-types/` file-for-file — controller (`@UseGuards(JwtAuthGuard)` only), service owning all Prisma calls, `create`/`update`/`list` query DTOs. Registered in `app.module.ts`.
- **Endpoints** (route base `unidades-medida`): `GET /` (paginated + filtered list, same conventions as service-types), `GET /:id`, `POST /`, `PATCH /:id`. **No `DELETE`. No `/export`.** `POST` stamps `creadoPorId` + `actualizadoPorId` from `req.user.userId`; `PATCH` stamps `actualizadoPorId` (service `update()` takes the actor id, like `service-types.service`).
- **Uniqueness**: `descripcion` globally unique → duplicate rejected `409` via TOCTOU-safe pre-check + `P2002` backstop, on create and update.
- **Frontend**: new `client/app/(dashboard)/unidades-medida/page.tsx` (list + filters + pagination, **no export button**) + shared `UnidadMedidaFormModal.tsx` (create/edit driven by selected-item state; `activo` shown only in edit; dirty-check confirm on close via `lib/alerts.ts`) + typed `client/app/lib/unidades-medida.ts` client + one flat nav entry in `client/app/lib/navigation.tsx`.

### Out of Scope
- **Delete** — deactivation via `activo` toggle (soft-disable).
- **Excel export** — explicitly declined by user; deferrable future addition.
- **Access control / permissions** — `JwtAuthGuard` only, no role gate (no `RolesGuard` exists); deferred to future Permisos.
- **Consumers** — no `Producto`/`Insumo` model exists yet to link to; wiring is a separate change.

## Capabilities

### New Capabilities
- `units-of-measure-management`: backend CRUD (create/list/update, no delete, no export) for units of measure with create/update audit stamping, available to any authenticated user.

### Modified Capabilities
- `app-navigation`: adds one flat "Unidades de Medida" entry. No role filtering — consistent with existing sections.

## Approach
Copy the shipped `service-types` module and `tipos-servicio` frontend verbatim, minus the export route/handler/DTO/button, renaming `ServiceType`/`TipoServicio` → `UnidadMedida` and route base to `unidades-medida`. Prisma model reuses the exact `TipoServicio` dual-audit shape (`onDelete: SetNull`). Service `update()` threads the JWT actor id so `actualizadoPorId` persists.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modified | New `UnidadMedida` model + 2 back-relations on `User` |
| `server/prisma/migrations/` | New | One additive migration |
| `server/src/unidades-medida/` | New | Module, controller, service, 3 DTOs |
| `server/src/app.module.ts` | Modified | Register module |
| `client/app/(dashboard)/unidades-medida/` | New | `page.tsx` + `UnidadMedidaFormModal.tsx` |
| `client/app/lib/unidades-medida.ts` | New | Typed API client |
| `client/app/lib/navigation.tsx` | Modified | One nav entry |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Copying `service-types` but forgetting to strip export leaves a dead `/export` route | Med | Spec/tasks explicitly exclude export controller, service method, DTO, and UI button |
| `update()` copied without actor param would drop `actualizadoPorId` | Med | Mirror `service-types.service.update()` signature (actor id third arg) |
| Dual audit relation names mis-wired | Low | Reuse exact `TipoServicio` shape with `UnidadMedida`-prefixed relation names |
| Migration runs against wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating |
| Any authenticated user can manage units | Accepted | Deliberate deferral to Permisos, same as all sections |

## Rollback Plan
Additive-only. Rollback is mechanical: (1) revert the migration (drop `UnidadMedida` table + its 2 FKs — safe, nothing references it); (2) remove `server/src/unidades-medida/` and its `app.module.ts` import; remove the two `User` back-relations; (3) remove `client/app/(dashboard)/unidades-medida/`, `client/app/lib/unidades-medida.ts`, and the nav entry. No backfill/data migration involved, so no data loss beyond the unit rows.

## Open Items
- **Nav icon**: shipped catalogs use a dedicated `/icons/<name>.svg` (e.g. `tipos-servicio.svg`). Decide whether to request a dedicated `unidades-medida.svg` asset or reuse an existing placeholder icon. Non-blocking — a placeholder can ship first and be swapped later.

## Success Criteria
- [ ] `GET /unidades-medida`, `GET /:id`, `POST /`, `PATCH /:id` require a valid Bearer token (401 otherwise); no `DELETE`, no `/export`.
- [ ] Duplicate `descripcion` returns 409 on create and update (pre-check + `P2002` backstop).
- [ ] `POST` stamps `creadoPorId` + `actualizadoPorId`; `PATCH` updates `actualizadoPorId` from the JWT caller, never client input.
- [ ] `UnidadMedida` has two nullable `User` FKs (`onDelete: SetNull`) with matching back-relations; removing a user nulls the reference.
- [ ] `/unidades-medida` page lists (paginated + filtered) and opens a shared modal for create/edit; `activo` only in edit; unsaved-close prompts confirm; no export button.
- [ ] One flat "Unidades de Medida" nav entry visible to any authenticated user.
- [ ] Migration is additive-only and reversible per the Rollback Plan.
