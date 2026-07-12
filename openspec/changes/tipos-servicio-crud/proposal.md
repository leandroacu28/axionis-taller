# Proposal: Tipos de Servicio CRUD (Create, List, Update)

## Intent
The workshop needs a catalog of the *kinds of service* it performs (e.g. "Cambio de aceite", "Alineación", "Diagnóstico"), but there is no way to manage that catalog today. This change delivers a new "Tipos de Servicio" section: any authenticated user can list, create, and edit service types (`descripcion`, `activo`), each stamped with a create/update audit trail (which staff user created it, which staff user last updated it, plus timestamps). It is a small reference/catalog entity — modeled after the existing `colores`/`marcas` catalogs for its CRUD mechanics and modal UI, but carrying the **dual audit relation** already established by `Cliente` (creator + last updater), because these rows are shared operational data where "who touched this" matters. Who is *allowed* to access the section is intentionally left ungated here, mirroring every existing section — that is deferred to the future "Permisos" feature.

## Scope

### In Scope
- **Backend**: new `server/src/service-types/` module (controller, service, module, `create-service-type.dto.ts`, `update-service-type.dto.ts`, `list-service-types-query.dto.ts`, `export-service-types-query.dto.ts`), registered in `app.module.ts` as `ServiceTypesModule`. Controller route base is `service-types`. Follows the `colors/` module shape for CRUD mechanics (paginated+filtered list, export, get-by-id, create, update): thin controller, service owns all Prisma calls, `class-validator` DTOs (whitelist-safe, `descripcion` `IsString`/`IsNotEmpty`, `activo` `IsOptional`/`IsBoolean`), Nest built-in exceptions, Spanish user-facing messages, and a `SELECT` whitelist constant for the response shape (including nested `creadoPor`/`actualizadoPor` `{ id, username }`).
- **Data model**: new `TipoServicio` Prisma model + one additive migration. Fields: `id`, `descripcion` (`String @unique`), `activo` (`Boolean @default(true)`), `createdAt`, `updatedAt`, plus **two** nullable FK relations to `User` — `creadoPorId`/`creadoPor` (relation `"TipoServicioCreadoPor"`) and `actualizadoPorId`/`actualizadoPor` (relation `"TipoServicioActualizadoPor"`), both `onDelete: SetNull`. Adds the two corresponding back-relation arrays on `User`: `tiposServicioCreados` and `tiposServicioActualizados`. This is the `Cliente` dual-audit pattern, **not** the single-creator pattern of `Color`/`Marca`.
- **Endpoints**: `GET /service-types` (paginated + filtered list), `GET /service-types/export` (Excel — declared *before* `:id` so the literal segment isn't captured by the id param, matching `colors.controller.ts`), `GET /service-types/:id` (single, for the edit modal), `POST /service-types` (create), `PATCH /service-types/:id` (update). No `DELETE`. All require a valid Bearer token (`JwtAuthGuard`, already exists) — no role/permission check in this change.
- **Caller identity (novel vs Color)**: `POST /service-types` sets `creadoPorId` and `actualizadoPorId` from `req.user.userId`; `PATCH /service-types/:id` sets `actualizadoPorId` from `req.user.userId`. Because Color's `update()` takes **no actor param**, the service `update()` here MUST take an actor-id parameter and thread it through — following `server/src/customers/customers.service.ts`, not `colors.service.ts`, for that one method. The caller id is resolved server-side from the JWT, never client-suppliable.
- **Uniqueness / duplicate handling**: `descripcion` is unique. Duplicate rejection follows Color's pattern exactly — a TOCTOU-safe pre-check plus a `P2002` catch-block backstop — returning a Spanish `409` on collision, on both create and update.
- **Frontend**: new `client/app/(dashboard)/tipos-servicio/` route group with a single `page.tsx` (list + table) plus a `ServiceTypeFormModal.tsx` reused for both create and edit (mode toggled by selected-item state; the `activo` checkbox is shown only in edit mode; a dirty-check via `client/app/lib/alerts.ts` `showConfirm` guards close-with-unsaved-changes). New `client/app/lib/service-types.ts` typed API client mirroring `client/app/lib/colors.ts` (typed interfaces, shared `handleJsonResponse<T>()`, `getAuthHeader()` on every call, `list`/`get`/`create`/`update`/`export` functions). A new flat top-level "Tipos de Servicio" entry is added to `client/app/lib/navigation.tsx`, reusing `/icons/usuarios.svg` as a placeholder icon (existing convention for entities without a dedicated icon).

### Explicitly Deferred (not this change)
- **Access control / permissions**: visibility and usage of sections (including Tipos de Servicio) will be governed by the future **"Permisos"** feature, not defined yet. This change adds no role-based guard and does not restrict the nav item — same posture as Usuarios/Clientes/Colores/Marcas. No `RolesGuard` exists in this codebase and none is introduced here.

### Out of Scope
- **Delete endpoint** — no `DELETE`. Deactivation is done via the edit modal's `activo` toggle (soft-disable), the same deletion mechanism used by Color/Marca/Cliente.
- **Consuming/linking service types** — this change delivers the catalog only. Wiring `TipoServicio` into any future work-order / service-record entity is a separate change (no other model references it yet).
- **Business-logic gating on `activo`** — `activo` is a status field/badge only; no cascading logic, since nothing references `TipoServicio` yet.
- **Audit history beyond last-writer** — only the *current* creator and *last* updater are stored, not a full change log (matches `Cliente`).

## Included by consistency — flagged for user review
- **Excel export (`GET /service-types/export`)**: every sibling catalog/list module (`customers`, `colors`) ships an `.xlsx` export (ExcelJS `Workbook` → `StreamableFile`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="tipos-servicio.xlsx"`), reusing the list's exact `where`-filter logic minus pagination. It is **included here to avoid an inconsistency** across catalog sections, not because it was explicitly requested. If the user does not want export in this section, it can be dropped without affecting the rest of the change.

## Capabilities
### New Capabilities
- `service-types-management`: backend CRUD (minus delete) for service types with create/update audit stamping (creator + last updater + timestamps) and Excel export, available to any authenticated user in this change (permission-gating deferred to Permisos).

### Modified Capabilities
- `app-navigation`: adds a flat "Tipos de Servicio" entry. No role filtering — consistent with the existing "No Role Filtering in V1" requirement, which stays valid as-is.

## Approach
Backend mirrors the `colors/` module structurally (list/export/get/create/update, DTO style, filter helper, P2002 handling) so a future reader finds parallel catalog modules rather than divergent conventions. The one deliberate divergence is the **audit relation**: like `Cliente`, `TipoServicio` declares two nullable many-to-one FKs to `User` (creator + updater, `onDelete: SetNull`), and the service `update()` accepts the actor id (as `customers.service.ts` does) so `actualizadoPorId` is persisted — Color's parameterless `update()` is explicitly *not* sufficient here. Removing a staff user never deletes or blocks a service type; the reference just goes null.

Frontend reuses the `colores/` modal pattern verbatim: one list page, one `FormModal` shared across create/edit driven by selected-item state, `activo` shown only in edit, dirty-check confirm on close via `alerts.ts`, and a `lib/service-types.ts` client mirroring `lib/colors.ts`. This is deliberate — colores/marcas already set the catalog-CRUD precedent, so tipos de servicio should look identical, not introduce a second style.

## Decisions (documented for later review/override)
- **D1 — Naming**: English scaffolding (`server/src/service-types/`, `/service-types` route, `client/app/lib/service-types.ts`) with the Prisma model kept as `TipoServicio`, Spanish DTO field names/messages/UI copy, and the `/tipos-servicio` frontend route (confirmed as `tipos-servicio`, not `tipos-de-servicio`). *Rationale*: mirrors the existing English-scaffolding + Spanish-domain convention.
- **D2 — Audit relation shape**: dual `TipoServicio → User` FKs (`creadoPorId`/`creadoPor` as `"TipoServicioCreadoPor"`, `actualizadoPorId`/`actualizadoPor` as `"TipoServicioActualizadoPor"`), both nullable, `onDelete: SetNull`, with matching back-relation arrays on `User`. *Rationale*: follows `Cliente`; catalog rows are shared operational data where creator/updater matters. Chosen over the single-creator `Color`/`Marca` shape intentionally.
- **D3 — `update()` takes actor id**: the service update method receives the JWT caller id and stamps `actualizadoPorId`. *Rationale*: `colors.service.update()` has no actor param and cannot persist the updater; `customers.service.update()` is the correct model for this one method.
- **D4 — `descripcion` uniqueness**: globally unique on the `descripcion` column, duplicates rejected `409` via Color's pre-check + `P2002` backstop. *Rationale*: confirmed by user; a catalog shouldn't hold two identically-named service types.
- **D5 — UI pattern**: modal-based (single page + shared `FormModal`), not separate create/edit pages. *Rationale*: confirmed by user; mirrors `colores/`.
- **D6 — Access control**: `JwtAuthGuard` only, no role restriction. *Rationale*: confirmed by user; consistent with all current sections; no `RolesGuard` exists.
- **D7 — Delete**: out of scope; deactivation via `activo` toggle. *Rationale*: matches Color/Marca/Cliente soft-disable precedent.
- **D8 — Export included by consistency**: `.xlsx` export shipped to match sibling modules, but flagged for user push-back (see "Included by consistency" above).

## Rollback Plan
This change is **additive-only** — a new Prisma model, a new backend module, a new frontend route + modal, one new API client file, and one new nav entry. The only touches to existing files are the two back-relation arrays on `User`, a new module import in `app.module.ts`, and one nav entry. Rollback is mechanical:
1. Revert the timestamped migration (drop the `TipoServicio` table and its two FKs) — safe because nothing else references it.
2. Remove `server/src/service-types/` and its `app.module.ts` import; remove the `tiposServicioCreados`/`tiposServicioActualizados` back-relations from `User`.
3. Remove `client/app/(dashboard)/tipos-servicio/`, `client/app/lib/service-types.ts`, and the "Tipos de Servicio" nav entry.
No data migration or backfill is involved, so no data is lost on rollback beyond the service-type rows themselves.

## Known Gaps / Accepted Tradeoffs
- **No access control on this feature yet**: any authenticated user (any `rol`) can list/create/update/export service types. Deliberate, user-directed deferral to the future Permisos feature — same posture as the other sections, flagged so it's visible, not silent.
- **`server/.env` DB target not verified in this environment**: because this change adds a migration, `sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` points at before running it.
- **No shared type package**: payload/response types are duplicated between `server/` DTOs and `client/app/lib/service-types.ts` — the codebase has no shared package, so this follows the existing "change one, change the other" convention.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Any authenticated user (not just intended staff) can manage all service types | High (by design, deferred) | Explicitly called out as a known, accepted gap until Permisos lands |
| Copying `colors.service.update()` (no actor param) would silently drop `actualizadoPorId` | Med | D3 mandates the `customers.service.update()` actor-id pattern for update; `sdd-design` specs the exact signature |
| Dual audit relation is a novel shape here — easy to mis-wire the two relation names / back-relations | Med | `sdd-design` specs exact relation + back-relation names; `onDelete: SetNull` matches the `Cliente` precedent |
| `GET /service-types/export` route captured by the `:id` param, corrupting the `.xlsx` | Med | Declare `export` before `:id` and set binary headers, exactly as `colors.controller.ts` documents |
| New migration runs against the wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating (see Known Gaps) |

## Success Criteria
- [ ] `GET /service-types`, `GET /service-types/export`, `GET /service-types/:id`, `POST /service-types`, `PATCH /service-types/:id` all require a valid Bearer token (401 otherwise) — no role check in this change.
- [ ] Creating or updating a service type with a duplicate `descripcion` returns 409 (TOCTOU-safe pre-check + `P2002` backstop).
- [ ] `POST /service-types` stamps `creadoPorId` and `actualizadoPorId` from the JWT caller; `PATCH /service-types/:id` updates `actualizadoPorId` from the JWT caller — never from client input.
- [ ] `TipoServicio` has two nullable `User` FKs (`creadoPor`/`actualizadoPor`, `onDelete: SetNull`) with matching back-relations on `User`; removing a user nulls the reference without deleting the row.
- [ ] Frontend `/tipos-servicio` page lists service types (paginated + filtered) and opens a shared modal for create and edit; `activo` appears only in edit mode; closing with unsaved changes prompts a confirm via `alerts.ts`.
- [ ] `GET /service-types/export` returns an `.xlsx` of all rows matching the current filters, served as a spreadsheet attachment named `tipos-servicio.xlsx`.
- [ ] A flat "Tipos de Servicio" nav entry is visible to any authenticated user, using the placeholder icon.
- [ ] The migration is additive-only and reversible per the Rollback Plan.
