# Proposal: Presupuestos CRUD (Create, List, Update)

## Intent
The workshop can register work orders (`OrdenTrabajo`) but has no way to produce a **quote/budget** for a customer *before* committing to the job — a document that says "for this customer, this kind of service, here are the products/parts and their prices, this is the total." Today that pre-sale step happens off-system (paper, WhatsApp, a spreadsheet), so quotes aren't tracked, can't be revisited, and their prices drift as the product catalog changes.

This change delivers a new **"Presupuestos"** section: any authenticated user can create, list, and edit presupuestos. Each presupuesto is tied to a `Cliente` and a single `TipoServicio`, carries a free-text contact phone and description, an `activo` on/off flag, a create/update audit trail (which staff user created it, which last updated it, plus timestamps), and — the substantive part — a set of **product line items** loaded from the existing Productos catalog, each with a quantity and a **frozen unit price** captured at add-time so the quote total is stable even if catalog prices change later.

It is deliberately a *catalog-style* CRUD entity (like `Cliente`/`Producto`): soft-deactivate via `activo`, **no delete route**, and **no estado/lifecycle enum**. Who is *allowed* to access the section is intentionally left ungated here — same posture as every existing section, deferred to the future "Permisos" feature.

## Scope

### In Scope
- **Data model** — two new Prisma models + one additive migration:
  - **`Presupuesto`** (top-level entity, modeled on the `Cliente`/`Producto` catalog shape for CRUD + dual audit):
    - `id` (`Int @id @default(autoincrement())`)
    - `fecha` (`DateTime`) — the quote's own date, set by the user (distinct from `createdAt`)
    - `clienteId` (`Int`) + `cliente` — **required** FK to `Cliente` (`onDelete: Restrict`, so a customer with quotes can't be silently orphaned)
    - `tipoServicioId` (`Int`) + `tipoServicio` — **required single** FK to `TipoServicio` (`onDelete: Restrict`); explicitly the **single-FK** shape, NOT the M2M pattern `OrdenTrabajo` uses (Decision D2)
    - `telefono` (`String?`) — **independent free-text** contact for this quote; NOT denormalized/auto-filled from `Cliente.telefono` (Decision D4)
    - `descripcion` (`String?`)
    - `activo` (`Boolean @default(true)`) — catalog-style on/off toggle (Decision D3)
    - `creadoPorId`/`creadoPor` (relation `"PresupuestoCreadoPor"`, `Int?`, `onDelete: SetNull`) and `actualizadoPorId`/`actualizadoPor` (relation `"PresupuestoActualizadoPor"`, `Int?`, `onDelete: SetNull`) — the `Cliente` dual-audit pattern (`server/prisma/schema.prisma:59-62`)
    - `productos` (`PresupuestoProducto[]`) back-relation
    - `createdAt` (`@default(now())`), `updatedAt` (`@updatedAt`)
  - **`PresupuestoProducto`** (line items, mirroring `OrdenTrabajoTipoServicioProducto` at `server/prisma/schema.prisma:274-289` **exactly**):
    - `id`
    - `presupuestoId` (`Int`) + `presupuesto` — FK with `onDelete: Cascade` (deleting a line's parent removes the lines; the parent itself is never deleted, only deactivated)
    - `productoId` (`Int`) + `producto` — FK to `Producto` (no cascade)
    - `cantidad` (`Decimal @db.Decimal(10, 2)`)
    - `precioUnitario` (`Decimal @db.Decimal(10, 2)`) — **frozen** at add-time from `Producto.precioVenta` (`server/prisma/schema.prisma:176`), never re-read from the catalog afterward
    - `precioTotal` (`Decimal @db.Decimal(10, 2)`) — computed `precioUnitario * cantidad`, stored
    - `actualizadoPorId`/`actualizadoPor` (relation `"PresupuestoProductoActualizadoPor"`, `Int?`, `onDelete: SetNull`)
    - `createdAt`, `updatedAt`
    - `@@unique([presupuestoId, productoId])` — re-adding the same product **sums into the existing line** instead of duplicating (mirrors the OT trio behavior)
  - **Back-relations added to existing models**: `User` (`presupuestosCreados`, `presupuestosActualizados`, `presupuestoProductosActualizados`), `Cliente` (`presupuestos Presupuesto[]`), `TipoServicio` (`presupuestos Presupuesto[]`), `Producto` (`presupuestoProductos PresupuestoProducto[]`).
- **Backend** — new `server/src/presupuestos/` module (controller, service, module, `create-presupuesto.dto.ts`, `update-presupuesto.dto.ts`, `list-presupuestos-query.dto.ts`, `create-presupuesto-producto.dto.ts`), registered in `app.module.ts` as `PresupuestosModule`. Structure mirrors `server/src/productos/` (thin controller `@UseGuards(JwtAuthGuard)`, service owns all Prisma calls, `class-validator` DTOs, Nest built-in exceptions, Spanish user-facing messages, a `SELECT`/`include` whitelist for the response shape including nested `cliente`, `tipoServicio`, `productos`, and `creadoPor`/`actualizadoPor` `{ id, username }`). The line-item DTO mirrors `server/src/ordenes-trabajo/dto/create-orden-trabajo-producto.dto.ts` (`productoId: number`; `cantidad` with `@IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99)`). The add/update/remove line-item service trio mirrors `server/src/ordenes-trabajo/ordenes-trabajo.service.ts:702-785` (`addDetalleProducto`/`updateDetalleProducto`/`removeDetalleProducto`) — same freeze-price-on-add, sum-on-duplicate, recompute-`precioTotal` behavior.
- **Endpoints** — mirroring the `productos.controller.ts` route shape (`server/src/productos/productos.controller.ts`), all under `@Controller('presupuestos') @UseGuards(JwtAuthGuard)`:
  - `GET /presupuestos` — list (search + `activo` filter; pagination if the productos list already paginates — match its exact query DTO)
  - `GET /presupuestos/:id` — single, for the edit page (includes line items)
  - `POST /presupuestos` — create; stamps `creadoPorId` **and** `actualizadoPorId` from `req.user.userId`; accepts the header fields plus an optional initial `productos[]` array of line items (each frozen at add-time)
  - `PATCH /presupuestos/:id` — update header fields; stamps `actualizadoPorId` from `req.user.userId`. **Full body** (not partial-update RFC style) — matches `Cliente`/`Producto` convention (Decision D5)
  - Line-item sub-routes (mirroring the OT detalle endpoints), e.g. `POST /presupuestos/:id/productos`, `PATCH /presupuestos/:id/productos/:detalleId`, `DELETE /presupuestos/:id/productos/:detalleId` — the **only** delete-shaped routes, and they remove a *line item*, never the presupuesto. Exact sub-route naming is a `sdd-design` detail; the OT controller is the reference.
  - **No `DELETE /presupuestos/:id`**. Deactivation is `PATCH /presupuestos/:id { activo: false }` (Decision D3).
- **Caller identity**: `creadoPorId`/`actualizadoPorId` (and line-item `actualizadoPorId`) are always resolved server-side from the JWT (`req.user.userId`), never client-suppliable — same as `productos.service` (`server/src/productos/productos.controller.ts:34-52`).
- **Frontend** — new `client/app/(dashboard)/presupuestos/` route group mirroring `client/app/(dashboard)/productos/` (**page-based**, NOT modal): `page.tsx` (list: simple table + search + `activo` filter — the Producto/Cliente complexity level, **not** the ordenes-trabajo table/card toggle, Decision D6), `nuevo/page.tsx` (create), `editar/[id]/page.tsx` (edit). New `client/app/lib/presupuestos.ts` typed API client mirroring `client/app/lib/productos.ts`. The create/edit forms reuse:
  - **Cliente picker**: `clienteSelectConfig` from `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx:80-137` with `SearchableSelect` (`client/app/(dashboard)/vehiculos/SearchableSelect.tsx`), as-is.
  - **TipoServicio picker**: an equivalent single-select reference config (add one alongside the existing configs, or a local `SearchableSelect` config).
  - **Product picker + line-item list**: **duplicated** from the existing (non-exported) pattern in `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx:265-720` into a new presupuestos-local component, using the already-generic `searchProductos` from `client/app/lib/productos.ts:150-158` for the combobox. Deliberately duplicated, not extracted (see Non-Goals + Decision D7).
- **Navigation** — one flat "Presupuestos" entry added to `client/app/lib/navigation.tsx:82-99`, alongside Clientes/Vehículos/Productos.

### Explicitly Deferred (not this change)
- **Access control / permissions**: visibility and usage of the Presupuestos section is governed by the future **"Permisos"** feature, not defined yet. This change adds no role-based guard and does not restrict the nav item — same posture as Usuarios/Clientes/Productos/Tipos de Servicio. No `RolesGuard` exists in the codebase and none is introduced here.

### Out of Scope (Non-Goals)
- **No `DELETE` endpoint for presupuestos** — soft-deactivate only, via the `activo` toggle, matching `Cliente`/`Producto` (Decision D3). (Line-item delete sub-routes are in scope and are a different thing.)
- **No estado / lifecycle enum** — `activo` is a simple on/off catalog flag, not a `borrador → enviado → aprobado → rechazado` workflow. No status-driven business logic (Decision D3).
- **No M2M `TipoServicio`** — one presupuesto has exactly one tipo de servicio via a single FK. The `OrdenTrabajo` many-tipos pattern is explicitly not adopted here (Decision D2).
- **No shared product-picker extraction (yet)** — the picker/line-item UI is duplicated from `ordenes-trabajo`, not extracted into a shared component. This is only the **2nd** occurrence (Rule of Three: wait for a 3rd), and extracting now would carry regression risk on the working ordenes-trabajo page. **Flagged as a future-extraction candidate** (Decision D7).
- **No conversion flow** presupuesto → orden de trabajo. Turning an approved quote into a work order is a plausible future change, but not this one — nothing in this change reads or writes `OrdenTrabajo`.
- **No PDF / print / send-to-customer** export of a presupuesto. Excel/PDF output is not requested and `productos` (the closest analog module) ships no export; if a quote document is wanted later it is its own change.
- **No re-pricing / "refresh prices from catalog"** action. Frozen prices are frozen by design; a bulk re-read is intentionally absent.

## Capabilities
### New Capabilities
- `presupuestos-management`: backend CRUD (minus delete) for presupuestos, including product line items with frozen unit prices and computed totals, create/update audit stamping, available to any authenticated user in this change (permission-gating deferred to Permisos).
- `presupuestos-management-ui`: page-based list/create/edit frontend for presupuestos with cliente + tipo-servicio pickers and a product line-item editor.

### Modified Capabilities
- `app-navigation`: adds a flat "Presupuestos" entry. No role filtering — consistent with the existing "No Role Filtering in V1" requirement, which stays valid as-is.

## Approach
Backend mirrors two existing precedents rather than inventing a third: the **header** (`Presupuesto` model, module layout, controller routes, DTO style, `activo` soft-disable, dual audit) follows `productos/` + the `Cliente` audit pair, and the **line items** (`PresupuestoProducto`, freeze-price-on-add, sum-on-duplicate, recompute total, add/update/remove trio) follow `OrdenTrabajoTipoServicioProducto` and the OT service methods **verbatim**. A future reader should find parallel, boring modules — a catalog head with an OT-style detail body — not a divergent convention.

The one substantive product rule is **price freezing**: `precioUnitario` is captured from `Producto.precioVenta` at the moment a line is added and never re-read, so a quote's total is a stable historical record even after the catalog is re-priced. This is exactly the OT behavior and is why line items are their own rows rather than a live join.

Frontend reuses the `productos/` page-based CRUD shape (list page + `nuevo` + `editar/[id]`), the existing `clienteSelectConfig`/`SearchableSelect` for the cliente picker, and the already-generic `searchProductos` for the product combobox. The product line-item editor is duplicated (not extracted) from `ordenes-trabajo`, accepting a known, flagged bit of duplication over a risky premature abstraction.

## Decisions (documented for later review/override)
- **D1 — Naming**: Spanish scaffolding here (`server/src/presupuestos/`, `/presupuestos` route, Prisma models `Presupuesto`/`PresupuestoProducto`, `client/app/(dashboard)/presupuestos/`, `client/app/lib/presupuestos.ts`). *Rationale*: "presupuesto" has no clean domain-neutral English scaffolding name in this codebase and the domain term is Spanish; DTO fields/messages/UI copy stay Spanish as elsewhere. (`sdd-design` may revisit if an English scaffolding name is preferred, but the domain noun stays `Presupuesto`.)
- **D2 — Single-FK tipo de servicio**: one `tipoServicioId` FK, NOT the `OrdenTrabajo` M2M. *Rationale*: confirmed with user — one tipo de servicio per presupuesto.
- **D3 — `activo` is a catalog flag, no delete, no lifecycle**: on/off `Boolean @default(true)`; deactivation via `PATCH ... { activo: false }`; no `DELETE /presupuestos/:id`; no estado enum. *Rationale*: confirmed with user; matches `Cliente`/`Producto`.
- **D4 — `telefono` independent**: free-text field on the presupuesto, editable separately, NOT auto-filled/denormalized from `Cliente.telefono`. *Rationale*: confirmed with user — the contact for a given quote may differ from the customer's registered phone.
- **D5 — `PATCH` takes full body**: not partial-update/RFC-merge. *Rationale*: matches both `Cliente` and `Producto` existing convention (house default, stated explicitly for visibility).
- **D6 — List UI is a simple table**: search + `activo` filter, no table/card view toggle. *Rationale*: `Producto`/`Cliente` complexity level, not `OrdenTrabajo`'s heavier UI (house default, stated explicitly).
- **D7 — Duplicate the product picker, don't extract**: copy the `ordenes-trabajo` picker/line-item UI into a presupuestos-local component. *Rationale*: only the 2nd occurrence (Rule of Three), and extraction risks regressing the working OT page; **flagged as a future-extraction candidate** once a 3rd consumer appears.
- **D8 — Line items mirror `OrdenTrabajoTipoServicioProducto` exactly**: frozen `precioUnitario` from `Producto.precioVenta`, computed stored `precioTotal`, `@@unique([presupuestoId, productoId])` sum-on-duplicate, OT-style add/update/remove trio. *Rationale*: confirmed with user; freezing protects the quote from catalog price drift.

## Rollback Plan
This change is **additive-only** — two new Prisma models, a new backend module, a new frontend route group + local picker component, one new API client file, and one new nav entry. The only touches to existing files are back-relation arrays on `User`/`Cliente`/`TipoServicio`/`Producto`, a new module import in `app.module.ts`, and one nav entry. Rollback is mechanical:
1. Revert the timestamped migration (drop the `PresupuestoProducto` table first, then `Presupuesto`, plus their FKs) — safe because nothing else references either table.
2. Remove `server/src/presupuestos/` and its `app.module.ts` import; remove the added back-relations from `User`, `Cliente`, `TipoServicio`, and `Producto`.
3. Remove `client/app/(dashboard)/presupuestos/`, the presupuestos-local picker component, `client/app/lib/presupuestos.ts`, and the "Presupuestos" nav entry.
No data migration or backfill is involved (all referenced tables — `Cliente`, `TipoServicio`, `Producto`, `User` — pre-exist and are untouched except for additive back-relations), so no existing data is lost on rollback beyond the presupuesto rows themselves.

## Known Gaps / Accepted Tradeoffs
- **No access control on this feature yet**: any authenticated user (any `rol`) can list/create/update/deactivate presupuestos and edit their line items. Deliberate, user-directed deferral to the future Permisos feature — same posture as the other sections, flagged so it's visible, not silent.
- **`Producto.precioVenta` is nullable** (`server/prisma/schema.prisma:176`): a product added to a quote with no `precioVenta` set has no catalog price to freeze. The OT add-logic behavior for this case must be confirmed by `sdd-design`/`sdd-apply` and applied identically here (likely default to `0` or reject the add) — flag, not a blocker.
- **Duplicated picker UI** (D7): the product line-item editor exists in two places until a 3rd consumer justifies extraction; a bug fix in one must be mirrored in the other. Accepted, flagged.
- **No shared type package**: payload/response types are duplicated between `server/` DTOs and `client/app/lib/presupuestos.ts` — the codebase has no shared package, so this follows the existing "change one, change the other" convention.
- **DB target not verified in this environment**: because this change adds a migration, `sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` points at before running it.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Any authenticated user (not just intended staff) can manage all presupuestos | High (by design, deferred) | Explicitly called out as a known, accepted gap until Permisos lands |
| Line-item logic (freeze price, sum-on-duplicate, recompute total) mis-copied from the OT service, silently corrupting quote totals | Med | D8 mandates mirroring `ordenes-trabajo.service.ts:702-785` and `create-orden-trabajo-producto.dto.ts` exactly; `sdd-design` specs the freeze/sum/recompute contract and the `@@unique` behavior |
| `Producto.precioVenta` nullable → frozen `precioUnitario` becomes null/NaN | Med | Confirm OT behavior for null `precioVenta` in `sdd-design`; apply identically (default or reject) |
| Duplicated picker UI drifts from the ordenes-trabajo original over time | Med | Flagged as an explicit, tracked future-extraction candidate (D7); mirror fixes until a 3rd consumer triggers extraction |
| New migration runs against the wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating (see Known Gaps) |
| Deleting a `Cliente`/`TipoServicio` referenced by a presupuesto | Low | FKs use `onDelete: Restrict` on the required relations so a referenced parent can't be silently orphaned; `sdd-design` confirms the exact `onDelete` policy |

## Success Criteria
- [ ] `GET /presupuestos`, `GET /presupuestos/:id`, `POST /presupuestos`, `PATCH /presupuestos/:id`, and the line-item sub-routes all require a valid Bearer token (401 otherwise) — no role check in this change.
- [ ] There is **no** `DELETE /presupuestos/:id`; deactivation is `PATCH /presupuestos/:id { activo: false }`.
- [ ] `POST /presupuestos` stamps `creadoPorId` and `actualizadoPorId` from the JWT caller; `PATCH` and line-item writes stamp `actualizadoPorId` from the JWT caller — never from client input.
- [ ] A presupuesto has exactly one `cliente` (required FK) and exactly one `tipoServicio` (required single FK) — not M2M.
- [ ] `telefono` is an independent free-text field, not auto-filled from `Cliente.telefono`.
- [ ] Adding a product to a presupuesto freezes `precioUnitario` from `Producto.precioVenta` at add-time and stores `precioTotal = precioUnitario * cantidad`; later catalog re-pricing does not change existing line prices.
- [ ] Adding a product already on the presupuesto sums into the existing line (`@@unique([presupuestoId, productoId])`), it does not create a duplicate row.
- [ ] Frontend `/presupuestos` lists presupuestos (simple table, search + `activo` filter, no card toggle) and `nuevo`/`editar/[id]` pages create/edit a presupuesto with a cliente picker, a tipo-servicio picker, and a product line-item editor.
- [ ] A flat "Presupuestos" nav entry is visible to any authenticated user.
- [ ] The migration is additive-only and reversible per the Rollback Plan.
