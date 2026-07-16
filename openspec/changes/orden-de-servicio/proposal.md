# Proposal: Orden de Servicio (Work Order intake)

## Intent
The workshop can already manage its catalogs — clientes, vehículos, tipos de servicio, productos — but it has **no way to record the actual work that comes through the door**. When a customer drops off a car, there is currently nowhere to capture "this vehicle, this owner, came in on this date, with this odometer, for this reason, assigned to this mechanic, needing these service types, at this priority, currently in this state." That operational record — the **Orden de Servicio** — is the missing spine that ties the existing catalogs together into an actual shop workflow.

This change delivers a new top-level **"Orden de Servicio"** section: any authenticated user can list, create, and edit work orders. Each order captures intake data (fecha de ingreso, cliente, vehículo, kilómetros, prioridad, motivo de ingreso, tipos de servicio, mecánico, estado) plus the usual create/update audit trail. It is **transactional/operational data**, not a catalog — so it deliberately diverges from the catalog conventions in several places (no unique `descripcion` natural key, no `activo` boolean, an `estado` lifecycle enum instead, a human-readable sequential order number, and a cascading cliente→vehículo picker). Who is *allowed* to access the section is intentionally left ungated here, mirroring every existing section — deferred to the future "Permisos" feature.

This v1 is scoped strictly to the **operational intake record**. Pricing, parts/products consumed, and invoicing are explicit non-goals (see Out of Scope).

## Scope

### In Scope
- **Backend — new module**: `server/src/ordenes-servicio/` (controller, service, module, `create-orden-servicio.dto.ts`, `update-orden-servicio.dto.ts`, `list-ordenes-servicio-query.dto.ts`, optionally `export-ordenes-servicio-query.dto.ts`), registered in `app.module.ts` as `OrdenesServicioModule`. Controller route base `ordenes-servicio`. Structure follows the cleanest recent CRUD example — `server/src/etiquetas/` — thin controller, service owns all Prisma calls, `class-validator` whitelist-safe DTOs, Nest built-in exceptions, Spanish user-facing messages, and a `SELECT` whitelist for the response shape (including nested `cliente`, `vehiculo`, `mecanico`, `tiposServicio`, `creadoPor`, `actualizadoPor` as `{ id, ... }`).
- **Data model — new `OrdenServicio` Prisma model** + one additive migration. Fields:
  - `id` (`Int @id @default(autoincrement())`) — internal numeric id.
  - `numero` — human-readable sequential code (e.g. `OS-0001`) visible to staff/customer. **Generation mechanism is a design decision** (see Decisions D3 and Risks) — this proposal states the requirement and the uniqueness/ordering constraint; `design.md` finalizes the mechanism.
  - `fechaIngreso` (`DateTime`) — defaults to now at creation, **editable** by the user (late-logged orders).
  - `kilometros` (`Int`) — odometer reading at intake.
  - `prioridad` — `Prioridad` enum (`normal | alta | urgente`).
  - `motivoIngreso` (`String` / `Text`) — free-text reason.
  - `estado` — `Estado` enum (`pendiente | en_proceso | terminado`), free transitions in any direction.
  - **FK `clienteId`/`cliente`** → `Cliente` (required).
  - **FK `vehiculoId`/`vehiculo`** → `Vehiculo` (required) — must belong to `clienteId` (validated server-side).
  - **FK `mecanicoId`/`mecanico`** → `User` (required) — the assigned mechanic; **any active User**, not restricted to `rol === 'mecanico'`.
  - **Many-to-many `tiposServicio TipoServicio[]`** — mirrors the just-shipped Producto↔Etiqueta relation exactly.
  - Two nullable audit FKs to `User` — `creadoPorId`/`creadoPor` and `actualizadoPorId`/`actualizadoPor`, both `onDelete: SetNull`, matching relation-name pattern of the audit precedent. **These are separate from `mecanicoId`** — "who created the record" is not "who is assigned to the work."
  - `createdAt`, `updatedAt`.
  - Corresponding back-relations added on `User` (`ordenesServicioCreadas`, `ordenesServicioActualizadas`, plus the assigned-mechanic back-relation e.g. `ordenesServicioAsignadas`), on `Cliente` (`ordenesServicio`), and on `Vehiculo` (`ordenesServicio`).
- **Data model — extend `TipoServicio`**: add back-relation `ordenesServicio OrdenServicio[]` (the other side of the many-to-many). Additive, no data change to existing rows.
- **Cliente→Vehículo filter (new, end-to-end)**: the cascading vehículo picker needs `GET /vehicles?clienteId=<id>`, which **does not exist today**. Add an optional `clienteId` query param across the stack:
  - `server/src/vehicles/dto/list-vehicles-query.dto.ts` — new optional `clienteId` (`@IsOptional`, numeric).
  - `server/src/vehicles/vehicles.service.ts` `buildVehicleWhere` — filter by `clienteId` when present.
  - `client/app/lib/vehicles.ts` — add `clienteId?` to `ListVehiclesParams` and thread it into `listVehicles`.
  - Backward-compatible: param is optional; existing callers (no `clienteId`) behave identically.
- **Mecánico / User picker (extend `GET /users`)**: `GET /users` currently has **no query params at all** (the only list endpoint without them). The mecánico picker must be a searchable select consistent with the rest of the app, so add minimal `search` + `status` query support to `GET /users`, mirroring `ListEtiquetasQueryDto`'s shape:
  - `server/src/users/` — new `list-users-query.dto.ts` (optional `search`, optional `status`/active filter), service `where` builder, controller wiring.
  - `client/app/lib/` — a `searchUsers`/`listUsers` helper (or extend the existing users client) supplying the picker.
  - Backward-compatible: params optional; the current no-param `GET /users` call still returns the full list.
- **Backend — many-to-many guard**: `assertTiposServicioActivos` guard (mirroring `assertEtiquetasActivas`) validating the incoming `tipoServicioIds` before `connect`/`set`, plus server-side validation that `vehiculoId` belongs to `clienteId`.
- **Side effect — sync odometer**: on create/update, the service **overwrites** the associated `Vehiculo.kilometraje` with the order's `kilometros` value (not just a snapshot on the order). Done in the same transaction as the order write.
- **Endpoints**: `GET /ordenes-servicio` (paginated + filtered list), `GET /ordenes-servicio/:id` (single, for edit), `POST /ordenes-servicio` (create), `PATCH /ordenes-servicio/:id` (update). No export, no `DELETE`. All require a valid Bearer token (`JwtAuthGuard`) — no role/permission check.
- **Caller identity**: `POST` sets `creadoPorId` + `actualizadoPorId` from `req.user.userId`; `PATCH` sets `actualizadoPorId` from `req.user.userId`. Resolved server-side from the JWT, never client-suppliable. `mecanicoId` is a distinct, client-supplied FK.
- **Frontend — new route group**: `client/app/(dashboard)/ordenes-servicio/` with a `page.tsx` (list + table showing `numero`, cliente, vehículo, estado, prioridad, mecánico, fecha) and create/edit UI. Because this is a multi-field transactional form (cascading select, multi-select, enums), the UI follows the **dedicated create/edit pages** pattern the productos section recently moved to (`productos/nuevo`, `productos/editar/[id]`) rather than a single modal. New `client/app/lib/ordenes-servicio.ts` typed API client (typed interfaces, shared response handler, `getAuthHeader()` on every call, `list`/`get`/`create`/`update` + `searchTiposServicio`-style helpers as needed).
- **Frontend — cascading + multi-select widgets**: cliente picker reuses the `clienteSelectConfig` searchable-select precedent (`client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx` + `SearchableSelect.tsx`, backed by `listCustomers`). Vehículo picker is a **dependent** searchable select that (a) is disabled/empty until a cliente is chosen and (b) queries `listVehicles({ clienteId })`; changing the cliente resets the vehículo selection. Tipos de servicio uses a `TipoServicioMultiSelect.tsx` mirroring `productos/EtiquetasMultiSelect.tsx` + a `searchTiposServicio` helper. Mecánico picker is a searchable select backed by the new `GET /users?search=` support.
- **Frontend — navigation**: a new **top-level** "Orden de Servicio" entry in `client/app/lib/navigation.tsx` (sibling of Clientes/Vehículos/Productos), **not** nested under "Configuraciones" — it is transactional, not a catalog. Icon: a dedicated `/icons/` asset if added, otherwise a placeholder per existing convention.

### Explicitly Deferred (not this change)
- **Access control / permissions**: visibility and usage of the section is governed by the future **"Permisos"** feature. No role-based guard is added; the nav item is not restricted — same posture as every current section. No `RolesGuard` exists and none is introduced.
- **Order-number generation mechanism finalization**: the *requirement* (a unique, human-readable, sequential `numero` like `OS-0001`) is in scope now; the concrete *mechanism* (DB-derived formatted field vs. app-level sequence/counter table vs. transaction-guarded max+1) is resolved in `design.md`.

### Out of Scope (v1 non-goals)
- **Pricing** — no cost/price/labor-rate fields on the order.
- **Parts / products consumed** — **no relation to `Producto`**. The order records *what service types* and *why*, not *which parts were used*.
- **Invoicing / facturación** — no billing document, total, or payment concept.
- **Delete endpoint** — no `DELETE`. Lifecycle is expressed through `estado`, not deletion or an `activo` toggle.
- **Enforced state machine** — `estado` transitions are free in any direction; no linear workflow enforcement and no `cancelado` state in v1.
- **Mechanic role restriction** — the mecánico picker intentionally lists any active User, not only `rol === 'mecanico'`.
- **Excel export** (`GET /ordenes-servicio/export`) — sibling list modules (`customers`, `etiquetas`, catalogs) ship an `.xlsx` export, but it is explicitly dropped from this change per user decision. Can be added later as a small follow-up change if needed.

## Capabilities
### New Capabilities
- `ordenes-servicio-management`: backend CRUD (minus delete) for work orders — intake fields, cliente/vehículo/mecánico FKs, `tiposServicio` many-to-many, `prioridad`/`estado` enums, human-readable `numero`, create/update audit stamping, and the odometer-sync side effect — available to any authenticated user (permission-gating deferred to Permisos).

### Modified Capabilities
- `vehicles-listing`: `GET /vehicles` gains an optional `clienteId` filter (backward-compatible) to support the cascading picker.
- `users-listing`: `GET /users` gains optional `search`/`status` query params (backward-compatible) to support the searchable mecánico picker.
- `app-navigation`: adds a flat top-level "Orden de Servicio" entry. No role filtering — consistent with the existing "No Role Filtering in V1" posture.

## Approach
Backend mirrors the `etiquetas/` module structurally for CRUD mechanics and the productos↔etiquetas relation for the many-to-many wiring, so a future reader finds parallel conventions rather than a divergent style. The deliberate divergences — all driven by this being an **operational** entity, not a catalog — are documented as Decisions below: no unique `descripcion` (the system-generated `numero` is the natural key, but since it's generated, not user-typed, there is no user-facing 409-conflict case to handle the catalog way); no `activo` boolean (the `estado` enum carries lifecycle); and the list's count-pill pattern is reframed around `estado` (counts per state) instead of an active/inactive split.

Two existing shared endpoints are extended additively. `GET /vehicles` gains `clienteId` so the vehículo picker can cascade off the chosen cliente; `GET /users` gains `search`/`status` so the mecánico picker is a real searchable select instead of an unbounded dropdown. Both changes are strictly optional-param additions — existing callers are unaffected, which is a hard requirement (see Risks).

The odometer-sync side effect (overwrite `Vehiculo.kilometraje` from the order's `kilometros`) runs in the same transaction as the order write, so an order and its vehicle's odometer never drift apart on a partial failure.

Frontend follows the **dedicated create/edit pages** pattern the productos section moved to (`productos/nuevo`, `productos/editar/[id]`), not the modal pattern of the small catalogs — a work order has too many fields, a cascading select, a multi-select, and two enums to fit a modal comfortably. The cliente/vehículo/mecánico pickers reuse the established `SearchableSelect` + reference-config precedent; the tipos-de-servicio multi-select mirrors `EtiquetasMultiSelect`.

## Decisions (documented for later review/override)
- **D1 — Naming**: English scaffolding (`server/src/ordenes-servicio/`, `/ordenes-servicio` route, `client/app/lib/ordenes-servicio.ts`, `client/app/(dashboard)/ordenes-servicio/`) with the Prisma model as `OrdenServicio`, Spanish DTO field names/messages/UI copy and Spanish enum values (`normal`/`alta`/`urgente`, `pendiente`/`en_proceso`/`terminado`). *Rationale*: mirrors the existing English-scaffolding + Spanish-domain convention.
- **D2 — Operational entity, not catalog**: no `descripcion @unique`, no `activo` boolean; lifecycle via the `estado` enum. List count-pills reframed around `estado` counts. *Rationale*: work orders are transactional records with a lifecycle, not reference rows.
- **D3 — Human-readable `numero`**: the order carries a unique, sequential, human-readable code (e.g. `OS-0001`) in addition to the numeric `id`. The **generation mechanism is deferred to `design.md`** (candidates: app-level counter/sequence table with a transaction guard, formatted-from-`id` derivation, or DB sequence). Constraint: unique and monotonic. *Rationale*: staff/customer need a stable reference; the safe generation strategy warrants design-level treatment (see race-condition risk).
- **D4 — Fecha de ingreso default + editable**: defaults to `now()` at creation but remains user-editable for late-logged orders. *Rationale*: user-stated; flagged as an assumption to confirm at spec time.
- **D5 — Kilómetros syncs the vehicle**: saving the order overwrites `Vehiculo.kilometraje` with the order's `kilometros`, in the same transaction. *Rationale*: user-confirmed — the order is the moment of the latest known odometer reading.
- **D6 — Mecánico = any active User**: the picker lists all active users, not only `rol === 'mecanico'`. *Rationale*: user-confirmed, despite the role existing.
- **D7 — Free `estado` transitions**: any state → any state, no enforced flow, no `cancelado` in v1. *Rationale*: user-confirmed.
- **D8 — `mecanicoId` distinct from audit FKs**: assigned mechanic is a separate required FK from `creadoPorId`/`actualizadoPorId`. *Rationale*: "assigned to the work" ≠ "created the record."
- **D9 — `tiposServicio` many-to-many**: modeled exactly like Producto↔Etiqueta (`tipoServicioIds?: number[]` DTO, `assertTiposServicioActivos` guard, `connect`/`set`, `TipoServicioMultiSelect`). *Rationale*: reuse the just-shipped precedent verbatim.
- **D10 — Cascading vehículo picker via `clienteId` filter**: add `clienteId` to `GET /vehicles` end-to-end; vehículo picker depends on the chosen cliente and resets on cliente change. *Rationale*: the filter is missing today and the cascade requires it.
- **D11 — Searchable mecánico picker via extended `GET /users`**: add optional `search`/`status` to `GET /users` mirroring `ListEtiquetasQueryDto`. *Rationale*: consistency with every other picker; avoid an unbounded dropdown.
- **D12 — Dedicated create/edit pages (not modal)**: frontend uses `ordenes-servicio/nuevo` + `ordenes-servicio/editar/[id]` like productos. *Rationale*: too many fields/controls for a modal.
- **D13 — Top-level nav placement**: sibling of Clientes/Vehículos/Productos, not under Configuraciones. *Rationale*: transactional/operational entity, user-confirmed.
- **D14 — Access control**: `JwtAuthGuard` only, no role restriction. *Rationale*: consistent with all sections; deferred to Permisos.

## Rollback Plan
This change is **almost entirely additive**, with two backward-compatible extensions to existing endpoints. Rollback is mechanical:
1. Revert the timestamped migration (drop the `OrdenServicio` table, its `Estado`/`Prioridad` enums, and its FKs / the `_OrdenServicioToTipoServicio` join table) — safe because nothing else references it. **Note**: the odometer-sync side effect has already **overwritten** `Vehiculo.kilometraje` values for affected vehicles; those values are **not** restored by dropping the table (no historical snapshot is kept elsewhere). This is the one non-additive data effect and must be called out at apply time.
2. Remove `server/src/ordenes-servicio/` and its `app.module.ts` import; remove the `OrdenServicio` back-relations from `User`, `Cliente`, `Vehiculo`, and the `ordenesServicio` back-relation from `TipoServicio`.
3. Revert the additive `clienteId` param on `GET /vehicles` (DTO + `buildVehicleWhere` + client lib) and the `search`/`status` params on `GET /users` (DTO + service + controller + client lib). Both are optional additions, so reverting them cannot break existing callers.
4. Remove `client/app/(dashboard)/ordenes-servicio/`, `client/app/lib/ordenes-servicio.ts`, the multi-select widget, and the "Orden de Servicio" nav entry.

## Known Gaps / Accepted Tradeoffs
- **No access control yet**: any authenticated user can list/create/update work orders. Deliberate, user-directed deferral to Permisos — same posture as other sections.
- **Odometer overwrite is lossy**: syncing `Vehiculo.kilometraje` overwrites the prior value with no history; a mistaken `kilometros` entry silently changes the vehicle's odometer. Accepted for v1 (user-confirmed behavior); flagged so it's visible, not silent.
- **Order-number mechanism undecided**: `design.md` must finalize it; until then the concurrency-safe generation strategy is an open design question (see Risks).
- **`server/.env` DB target not verified in this environment**: this change adds a migration; `sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` points at before running it.
- **No shared type package**: payload/response types are duplicated between `server/` DTOs and `client/app/lib/`; follows the existing "change one, change the other" convention.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Order-number generation mechanism is undecided; wrong choice causes gaps, duplicates, or hard-to-change format | Med | D3 defers to `design.md`; spec states uniqueness + monotonic constraint before apply |
| Concurrent order creation races the `numero` counter → duplicate/skipped codes | Med | `design.md` must specify a concurrency-safe strategy (transaction-guarded counter, DB sequence, or unique constraint + retry); a `@unique` on `numero` is the backstop |
| Extending shared `GET /vehicles` / `GET /users` breaks existing callers | Med | Both changes are optional-param additions; existing no-param calls MUST behave identically; `sdd-verify` checks current callers of both endpoints |
| Odometer overwrite silently corrupts `Vehiculo.kilometraje` on a mistaken entry | Med | User-confirmed v1 behavior; documented as an accepted lossy side effect; input validation on `kilometros` at spec time |
| `vehiculoId` saved that does not belong to `clienteId` (client bypasses the cascade) | Med | Server-side validation that `vehiculoId.clienteId === clienteId`, rejecting mismatches — not just a frontend guard |
| Many-to-many relation / back-relations mis-wired (novel on `OrdenServicio`) | Med | Mirror Producto↔Etiqueta exactly; `sdd-design` specs the join-table and back-relation names |
| Odometer sync + order write partially fail, leaving them inconsistent | Low | Both writes run in a single Prisma transaction |
| New migration runs against the wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating (see Known Gaps) |

## Success Criteria
- [ ] `GET /ordenes-servicio`, `GET /ordenes-servicio/:id`, `POST /ordenes-servicio`, `PATCH /ordenes-servicio/:id` all require a valid Bearer token (401 otherwise) — no role check.
- [ ] Creating an order persists cliente, vehículo, kilómetros, prioridad, motivo de ingreso, tipos de servicio (≥1, many-to-many), mecánico, estado, and fecha de ingreso; `numero` is generated unique and human-readable (e.g. `OS-0001`).
- [ ] `fechaIngreso` defaults to now at creation but is editable.
- [ ] `POST` stamps `creadoPorId` + `actualizadoPorId` and `PATCH` updates `actualizadoPorId` from the JWT caller — never from client input; `mecanicoId` is a distinct client-supplied FK.
- [ ] Saving an order overwrites the associated `Vehiculo.kilometraje` with the order's `kilometros`, in the same transaction.
- [ ] `estado` accepts any transition among `pendiente`/`en_proceso`/`terminado` in any direction.
- [ ] The mecánico picker can be filled by any active User (not restricted to `rol === 'mecanico'`).
- [ ] `GET /vehicles?clienteId=<id>` returns only that cliente's vehicles; the param is optional and existing no-param callers are unchanged.
- [ ] `GET /users?search=<q>` returns filtered users; the param is optional and the existing no-param call still returns the full list.
- [ ] Server rejects an order whose `vehiculoId` does not belong to its `clienteId`.
- [ ] Frontend `/ordenes-servicio` lists orders; `/ordenes-servicio/nuevo` and `/ordenes-servicio/editar/[id]` provide create/edit with a cascading cliente→vehículo picker (vehículo resets on cliente change), a tipos-de-servicio multi-select, and a searchable mecánico picker.
- [ ] A flat top-level "Orden de Servicio" nav entry (not under Configuraciones) is visible to any authenticated user.
- [ ] The migration is additive-only; rollback follows the Rollback Plan (with the documented odometer-overwrite caveat).
