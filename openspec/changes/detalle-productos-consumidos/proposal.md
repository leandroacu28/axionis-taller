# Proposal: Productos consumidos por detalle de orden de trabajo

## Intent
Each work order already breaks down into one detalle per tipo de servicio (`OrdenTrabajoTipoServicio`), rendered as a card at `/ordenes-trabajo/[id]/trabajo`, tracking that line's `estado`, `diagnostico`, `trabajoRealizado`, and próximo service info. What is **missing is any record of the parts/products actually used on that line**. Today the detalle has **zero relation to `Producto`** — this was an explicit v1 non-goal of the original `orden-de-trabajo` proposal ("Parts / products consumed — no relation to `Producto`" and "Pricing — no cost/price/labor-rate fields on the order"). A mechanic can say *what* service was done and *why*, but not *which productos it consumed, how many, and at what price*.

This change lifts that non-goal for the parts dimension: each detalle gains **one or more producto line items**, each with a `cantidad` and a computed `precioTotal`. Per the user's request — "en la tarjeta de tipo de servicios debemos poder agregar los productos, cantidad y el precio total" — the detalle card at `/ordenes-trabajo/[id]/trabajo` gets a productos-consumidos sub-section where the mechanic picks a producto, sets a quantity, and sees the total. The price is a **snapshot**: `precioTotal = cantidad × Producto.precioVenta` frozen at add-time, the way a real invoice line freezes price at the moment of sale — not a live recalculation and not a client-typed override.

This is a **tightly-scoped, purely additive follow-on** to `orden-de-trabajo`, not a new module and not an inventory/invoicing feature. It records consumption; it does **not** decrement stock and does **not** produce a bill. Access control stays exactly as it is (JWT only), mirroring every existing section.

## Scope

### In Scope
- **Data model — new explicit join model `OrdenTrabajoTipoServicioProducto`** (naming per `design.md`) + one additive migration. This mirrors the way `OrdenTrabajoTipoServicio` itself was built — an explicit join carrying per-pair business data (`cantidad` + `precioTotal`), not a bare implicit many-to-many. Fields:
  - `id` (`Int @id @default(autoincrement())`) — own PK, like the sibling join model.
  - **FK `ordenTrabajoTipoServicioId`/`ordenTrabajoTipoServicio`** → `OrdenTrabajoTipoServicio` (required), **`onDelete: Cascade`** (see D5 — this is load-bearing, not cosmetic).
  - **FK `productoId`/`producto`** → `Producto` (required), **`onDelete: Restrict`** — a producto referenced by a consumed line cannot be hard-deleted out from under it (mirrors the `tipoServicioId` FK posture on the sibling model).
  - `cantidad` (`Decimal @db.Decimal(10, 2)`) — quantity consumed. **Reuses the established `Decimal(10, 2)` convention** used by every money/quantity field in the schema (`Producto.precioVenta`, `cantidadInicial`, …); it does not invent `Float` or cents-as-`Int`.
  - `precioTotal` (`Decimal @db.Decimal(10, 2)`) — the price snapshot `cantidad × Producto.precioVenta` computed server-side at add-time (see D1). Same `Decimal(10, 2)` convention.
  - `actualizadoPorId`/`actualizadoPor` — nullable audit FK to `User`, `onDelete: SetNull`, matching the sibling `OrdenTrabajoTipoServicio.actualizadoPor` posture. (Like the sibling model, **no `creadoPorId`** — the parent detalle never tracked row creator, only last updater; this follows suit unless `design.md` decides otherwise.)
  - `createdAt`, `updatedAt`.
  - **`@@unique([ordenTrabajoTipoServicioId, productoId])`** — one row per producto per detalle (see D4). Back-relations added on `OrdenTrabajoTipoServicio` (e.g. `productos`) and on `Producto` (e.g. `ordenTrabajoTipoServicioProductos`, name per `design.md`).
- **Backend — new sub-resource endpoints** under the **existing** `ordenes-trabajo` module, nested on the existing detalle route family (`GET :id/detalles`, `PATCH :id/detalles/:detalleId`). **No new top-level module** — a consumed producto is a sub-resource of a detalle. Proposed routes (final shapes confirmed in `design.md`):
  - `POST /ordenes-trabajo/:id/detalles/:detalleId/productos` — **add a producto line**, which is really an **upsert-by-`(detalleId, productoId)`**: if the producto is not yet on the detalle, create the line; if it already is, **sum** the incoming `cantidad` into the existing line and recompute `precioTotal` (see D4). Body: `{ productoId, cantidad }`.
  - `PATCH /ordenes-trabajo/:id/detalles/:detalleId/productos/:lineaId` — **set the quantity** of an existing line to an absolute value, recomputing `precioTotal` from the frozen snapshot unit price × new `cantidad`.
  - `DELETE /ordenes-trabajo/:id/detalles/:detalleId/productos/:lineaId` — **remove a mistaken line** (see D6 — recommended in scope for basic usability).
  - Whether consumed productos are returned inline by `GET :id/detalles` or via a dedicated read is a `design.md` detail; the read shape must expose each line's `id`, `productoId`, producto descripcion/label, `cantidad`, and `precioTotal`.
- **Backend — service methods** on `OrdenesTrabajoService` (add-line/upsert, set-quantity, remove-line), each running the write in a Prisma transaction consistent with the module's existing `updateDetalle` style, stamping `actualizadoPorId` from the JWT caller (`req.user.userId`), never client-supplied. The **snapshot unit price is read from `Producto.precioVenta` at add-time** and `precioTotal` is computed server-side — the client never supplies a price (see D1, D8).
- **Backend — DTO(s)**: a create/add DTO (`productoId` required numeric, `cantidad` required positive `Decimal`-compatible) and an update DTO (`cantidad` required positive) — whitelist-safe `class-validator`, Spanish messages, mirroring the module's existing detalle DTOs.
- **Backend — active-producto guard**: `assertProductoActivo` / `assertProductosActivos` (naming per `design.md`) validating the incoming `productoId` before the write, mirroring `assertUnidadMedidaActiva` / `assertEtiquetasActivas` in `productos.service.ts` (lines ~101, ~113) and `assertTiposServicioActivos` / `assertMecanicoActivo` in `ordenes-trabajo.service.ts`.
- **Frontend — client lib `client/app/lib/productos.ts`**: add a **`searchProductos`** helper (does not exist yet) mirroring `searchEtiquetas` / `searchUnidadesMedida` in the same file (or `searchTiposServicio` in `lib/ordenes-trabajo.ts`): `list*({ search, status: 'activo', page: 1, pageSize: 20 })` → map to `{ id, label }`. Note `ProductoListItem` carries `precio*`/`cantidadInicial` as **strings** (Prisma `Decimal` → JSON string); any arithmetic must `Number(...)` them, per the existing pattern in `productos/page.tsx`.
- **Frontend — client lib `client/app/lib/ordenes-trabajo.ts`**: new types (a consumed-producto line interface with `cantidad`/`precioTotal` as strings) and API client functions for the add/update/remove endpoints, matching the file's typed-client + `getAuthHeader()` conventions.
- **Frontend — detalle card sub-section**: `DetalleCard` in `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx` gets a new **productos-consumidos sub-section** — a **new component** that renders each consumed producto as its own row with a producto picker, a `cantidad` input, and a **computed/displayed `precioTotal`** (plus a remove affordance). It must respect the existing **`bloqueada = estado === 'terminado'`** lock the card already derives — read-only once the service is completed (see D3).

### Explicitly Deferred (not this change)
- **Shared currency formatter**: no shared money-formatting helper exists in `client/`; the only precedent is an inline `` `$${Number(x).toFixed(2)}` `` in `productos/page.tsx`. Whether to reuse that inline pattern or introduce the first shared formatter is a small `design.md`/implementation detail, not a blocking proposal decision.
- **Inline `GET :id/detalles` embedding vs. dedicated read for consumed productos**: the exact read wiring (embed in the detalle payload vs. a separate fetch) is deferred to `design.md`; this proposal only requires the fields be exposed.

### Out of Scope (non-goals)
- **Stock / inventory decrement** — adding a producto line does **not** decrement `Producto.cantidadInicial` (see D2). No precedent for stock consumption exists anywhere in this codebase; introducing an inventory transaction is large, unrequested scope. Noted as a clear future path if the business ever wants it.
- **Recomputing / fixing `Producto.precioVenta`** — this change **reads** `precioVenta` as the current source of truth for the snapshot, but does **not** recompute it server-side and does **not** fix the pre-existing spec/code discrepancy where `productos-management/spec.md` claims a server-side recompute that the actual code (`productos.service.ts` ~lines 175, 229) does not perform (the real computation is client-side in `productos/nuevo/page.tsx`). That is an unrelated pre-existing issue — see Known Gaps.
- **Manual price override** — `precioTotal` is always the computed snapshot; the mechanic cannot type a custom price (see D1).
- **Live price recalculation** — a later change to the catalog's `precioVenta` does **not** retro-update already-added lines (see D1). The snapshot is frozen.
- **Catalog changes** — no changes to the `Producto` or `TipoServicio` catalogs beyond adding the new relation/back-relation.
- **Invoicing / facturación / totals rollup** — no billing document, no detalle-level or order-level total aggregation is built by this change (unchanged from the original `orden-de-trabajo` non-goals). Only per-line `precioTotal` is stored.
- **Access control / roles** — unchanged; `JwtAuthGuard` only, deferred to the future Permisos feature.

## Capabilities
### New Capabilities
- `ordenes-trabajo-productos-consumidos`: each detalle (`OrdenTrabajoTipoServicio`) can record one or more consumed producto lines, each with a `cantidad` and a server-computed `precioTotal` snapshot (`cantidad × Producto.precioVenta` at add-time), managed through add/update/remove sub-resource endpoints under the existing `ordenes-trabajo` module and surfaced in the detalle card at `/ordenes-trabajo/[id]/trabajo`. Available to any authenticated user (permission-gating deferred to Permisos).

### Modified Capabilities
- `ordenes-trabajo-management`: the detalle sub-entity gains a productos-consumidos relation; the detalle read shape exposes consumed producto lines; the `/ordenes-trabajo/[id]/trabajo` detalle card gains a productos sub-section that respects the existing `estado === 'terminado'` lock.
- `products-listing` (client): `client/app/lib/productos.ts` gains a `searchProductos` helper (additive) to back the new producto picker.

## Approach
The core modeling decision reuses the exact template the parent already set: `OrdenTrabajoTipoServicio` replaced an implicit many-to-many precisely because it needed per-pair business data, and its migration (`server/prisma/migrations/20260716144357_orden_trabajo_tipo_servicio_detalle/migration.sql`) shows the shape to mirror — own `id` PK, a cascading FK to the parent, a restricting FK to the catalog side, extra business fields, an audit FK, and timestamps. A consumed producto line is the same situation one level deeper: it needs `cantidad` + `precioTotal`, not a bare reference, so it is an explicit join model, not an implicit relation. The one deliberate divergence from the sibling is the **`@@unique([ordenTrabajoTipoServicioId, productoId])`** — the "add again sums quantity" decision (D4) requires per-`(detalle, producto)` uniqueness so an upsert has a natural conflict target.

The **cascade FK is load-bearing, not stylistic**. `OrdenesTrabajoService.update()` (`server/src/ordenes-trabajo/ordenes-trabajo.service.ts` ~lines 226-289) reconciles `dto.tipoServicioIds` against existing detalles and calls `tx.ordenTrabajoTipoServicio.deleteMany(...)` (~lines 258-262) whenever a tipo de servicio is removed from the order's edit form — a detalle row **can** be hard-deleted through this side channel today. If the new line's FK to `OrdenTrabajoTipoServicio` were `Restrict`, that existing `deleteMany` would throw an FK violation the moment a mechanic removes a tipo de servicio that has consumed productos attached. `onDelete: Cascade` on that FK is therefore mandatory (D5).

The **price snapshot** is computed strictly server-side. The add/upsert method reads `Producto.precioVenta` at the moment of the write and stores `precioTotal = cantidad × precioVenta`; the client never sends a price, and neither the add nor the set-quantity path ever re-reads the catalog for already-stored lines. This mirrors invoice-line semantics and keeps the number un-spoofable, consistent with how `actualizadoPorId` is resolved from the JWT rather than trusted from the client. Because the actual running system stores a client-computed `precioVenta` directly (regardless of the stale spec doc), reading that stored value **is** reading the system's real "sale price" — the correct source for the snapshot.

Endpoints nest on the existing detalle route family rather than forming a new module, keeping the sub-resource relationship legible in the URL (`/ordenes-trabajo/:id/detalles/:detalleId/productos/...`) and reusing the module's transactional + audit-stamping style. The frontend adds a purpose-built row component (producto picker + `cantidad` + computed `precioTotal` + remove) rather than reusing `TipoServicioMultiSelect.tsx`, whose chip model has no room for per-selection sub-fields — that component is a structural/UX reference (debounce, portaled panel, keyboard nav) only, not a reuse.

## Decisions (documented for later review/override)
- **D1 — Price is an automatic add-time snapshot**: `precioTotal = cantidad × Producto.precioVenta`, computed **server-side at the moment the line is added**, **not** recalculated later if the catalog price changes, and **not** a client-typed manual override. *Rationale*: user-confirmed — a consumed line should freeze its price like a real invoice line at time of sale.
- **D2 — No stock decrement**: adding a producto line does **not** touch `Producto.cantidadInicial`. This is a record of what was used, not an inventory transaction. *Rationale*: user-confirmed; zero precedent for stock consumption exists in this codebase and adding it would be large, unrequested scope.
- **D3 — Locked after "Completar Servicio"**: producto lines follow the exact same `bloqueada = estado === 'terminado'` rule as every other field on the detalle card — once `terminado`, read-only. *Rationale*: user-confirmed; consistent with the current detalle-card UX.
- **D4 — One row per producto per detalle; re-adding sums quantity**: adding the same producto twice to the same detalle does **not** create a second row — the existing line's `cantidad` increases (and `precioTotal` follows, being `snapshot × cantidad`). This requires **`@@unique([ordenTrabajoTipoServicioId, productoId])`** so "add" is an upsert with a natural conflict target. *Rationale*: user-confirmed. (Note: unlike the sibling `OrdenTrabajoTipoServicio`, whose `@@unique` is `[ordenTrabajoId, tipoServicioId]`, this per-pair uniqueness is on `[detalleId, productoId]`.)
- **D5 — Cascade FK to the detalle is mandatory**: the line's FK to `OrdenTrabajoTipoServicio` must be `onDelete: Cascade`, because the existing `update()` reconciliation path (`deleteMany` at ~lines 258-262) hard-deletes detalles when a tipo de servicio is removed from an order; a `Restrict` FK would make that path throw. *Rationale*: prevents an FK-violation regression in an existing, shipped code path.
- **D6 — Remove-line affordance is in scope (proposal default)**: a `DELETE .../productos/:lineaId` endpoint and a UI remove control are included so a mechanic can undo a mistaken add before completing the service. This was **not** explicitly requested, so it is proposed as a default the user may override — but it is a near-certain basic-usability necessity, not scope creep. *Rationale*: without it, a wrong producto added by mistake can never be corrected pre-`terminado`.
- **D7 — `Decimal(10, 2)` for both `cantidad` and `precioTotal`**: reuse the established schema-wide numeric convention (`Producto.precioVenta`, `cantidadInicial`, …); do not introduce `Float` or cents-as-`Int`. *Rationale*: consistency with every existing money/quantity field.
- **D8 — Audit via `actualizadoPorId` only, no `creadoPorId`**: the new line stamps `actualizadoPorId` from the JWT caller and, like its parent `OrdenTrabajoTipoServicio`, does **not** track a row creator. *Rationale*: follows the sibling model's audit posture; `design.md` may revisit if a creator stamp is wanted.
- **D9 — Nested sub-resource routes, no new module**: endpoints live under the existing `ordenes-trabajo` module on the `:id/detalles/:detalleId/productos` route family, not a new top-level module. *Rationale*: a consumed producto is a sub-resource of a detalle; mirrors the existing detalle route family (`:id/detalles`, `:id/detalles/:detalleId`).
- **D10 — Active-producto guard**: incoming `productoId` is validated active before the write via `assertProductoActivo`/`assertProductosActivos`, mirroring the existing active-only guards. *Rationale*: consistent with `assertTiposServicioActivos` / `assertMecanicoActivo` / `assertEtiquetasActivas`.
- **D11 — New row component, not `TipoServicioMultiSelect` reuse**: the productos sub-section is a purpose-built component (row = picker + `cantidad` + computed `precioTotal` + remove), using `TipoServicioMultiSelect` only as a UX reference. *Rationale*: chip-based selection has no room for per-row `cantidad`/`precioTotal`.
- **D12 — Access control unchanged**: `JwtAuthGuard` only, no role check. *Rationale*: consistent with every section; deferred to Permisos.

## Rollback Plan
This change is **purely additive** — no existing data is migrated or renamed. Rollback is mechanical:
1. Revert the timestamped migration: drop the `OrdenTrabajoTipoServicioProducto` table (and its FKs / `@@unique`). Safe — nothing else references it, and the parent detalle rows are untouched.
2. Remove the new service methods, DTO(s), guard, and the `:id/detalles/:detalleId/productos` routes from the `ordenes-trabajo` controller/service; remove the `productos` back-relation from `OrdenTrabajoTipoServicio` and the back-relation from `Producto`.
3. Revert `client/app/lib/productos.ts` (drop `searchProductos`) and `client/app/lib/ordenes-trabajo.ts` (drop the consumed-line types + API client functions).
4. Remove the productos sub-section component from `DetalleCard` in `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx`.
- **Note**: because nothing decrements stock and nothing else reads `precioTotal`, dropping the table leaves no lingering data effect — the rollback is fully clean.

## Known Gaps / Accepted Tradeoffs
- **Price snapshot can drift from the catalog over time**: `precioTotal` is frozen at add-time (D1), so an old line reflects the price when it was added, not the current `precioVenta`. This is intended invoice-line behavior, flagged so it is visible, not silent.
- **Pre-existing `Producto.precioVenta` spec/code discrepancy is inherited, not fixed**: `products-management/spec.md` claims a server-side recompute of `precioVenta` that the actual code does not do (it stores client-computed input directly). This change **reads** the stored `precioVenta` as the real sale price; it does not fix the discrepancy. If that value is ever wrong, the snapshot inherits it. Flagged as a dependency risk, out of this change's scope.
- **No stock awareness**: a mechanic can record consuming more of a producto than exists in `cantidadInicial`; nothing validates or decrements stock (D2). Accepted for v1; noted as a future path.
- **No detalle/order total rollup**: only per-line `precioTotal` is stored; there is no aggregated total on the detalle or order. Out of scope (invoicing non-goal carried over).
- **Decimal-as-string on the client**: `cantidad`/`precioTotal` (like `Producto.precio*`) serialize as JSON strings; the UI must `Number(...)` before arithmetic. Follows the existing convention; a missed conversion is a foot-gun called out for spec/apply.
- **No shared type package**: line payload/response types are duplicated between `server/` DTOs and `client/app/lib/`; follows the existing "change one, change the other" convention.
- **`server/.env` DB target not verified in this environment**: this change adds a migration; `sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` points at before running it.

## Open Questions
- **Q1 (design)**: exact new model + back-relation names (`OrdenTrabajoTipoServicioProducto`, `productos`, `ordenTrabajoTipoServicioProductos`) and whether the audit FK stays `actualizadoPorId`-only or also gains `creadoPorId`. (See D8.)
- **Q2 (design)**: are consumed productos embedded inline in `GET :id/detalles` or read via a dedicated endpoint? (See In Scope / Explicitly Deferred.)
- **Q3 (design)**: exact route/DTO shapes for add (upsert), set-quantity, and remove; and the `cantidad` validation rule (positive, allowed decimals, min bound).
- **Q4 (design/impl)**: reuse the inline `` `$${Number(x).toFixed(2)}` `` currency pattern or introduce the first shared formatter? (See Explicitly Deferred.)

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Line FK to `OrdenTrabajoTipoServicio` set to `Restrict` breaks the existing `update()` `deleteMany` reconciliation (FK violation when a tipo de servicio with attached lines is removed) | Med | D5 mandates `onDelete: Cascade` on that FK; `sdd-verify` exercises removing a tipo de servicio that has consumed productos |
| Price computed/trusted from client input instead of the server-read `precioVenta` snapshot | Med | D1/D8: `precioTotal` computed server-side from `Producto.precioVenta` at add-time; DTO carries no price; `sdd-verify` checks the client cannot spoof it |
| "Add again" creates a duplicate row instead of summing quantity | Med | D4: `@@unique([detalleId, productoId])` + upsert-by-conflict-target; `sdd-verify` adds the same producto twice and asserts one summed row |
| `Decimal`-as-string mishandled on the client → string concatenation instead of numeric math | Med | Documented convention (`Number(...)` before arithmetic); spec calls out every arithmetic site; mirror `productos/page.tsx` |
| Producto lines remain editable after `estado === 'terminado'` | Low | D3: sub-section respects the existing `bloqueada` lock; `sdd-verify` checks read-only on a `terminado` detalle |
| Inactive producto added to a line | Low | D10: `assertProductoActivo`/`assertProductosActivos` guard before the write |
| New migration runs against the wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating (see Known Gaps) |

## Success Criteria
- [ ] All new endpoints under `/ordenes-trabajo/:id/detalles/:detalleId/productos` require a valid Bearer token (401 otherwise) — no role check.
- [ ] Adding a producto to a detalle persists a line with `cantidad` and a server-computed `precioTotal = cantidad × Producto.precioVenta` (snapshot at add-time); the client cannot supply the price.
- [ ] Adding the **same** producto to the same detalle again **sums** into the existing line's `cantidad` (and recomputes `precioTotal`) rather than creating a second row, enforced by `@@unique([detalleId, productoId])`.
- [ ] Updating a line's `cantidad` recomputes `precioTotal` from the frozen snapshot unit price × the new `cantidad`; a later change to the catalog's `precioVenta` does not retro-update existing lines.
- [ ] A mistaken line can be removed via `DELETE .../productos/:lineaId` before the service is `terminado`.
- [ ] `cantidad` and `precioTotal` are stored as `Decimal(10, 2)`; adding a producto does **not** change `Producto.cantidadInicial` (no stock decrement).
- [ ] Each line write stamps `actualizadoPorId` from the JWT caller, never from client input.
- [ ] Adding an inactive producto is rejected by the active-producto guard with a clear Spanish message.
- [ ] The detalle read shape exposes each consumed line's `id`, `productoId`, producto label, `cantidad`, and `precioTotal`.
- [ ] `client/app/lib/productos.ts` exposes `searchProductos`; `client/app/lib/ordenes-trabajo.ts` exposes the consumed-line types + add/update/remove client functions.
- [ ] The detalle card at `/ordenes-trabajo/[id]/trabajo` renders a productos-consumidos sub-section (producto picker + `cantidad` input + displayed `precioTotal` + remove), and it is read-only when the detalle `estado === 'terminado'`.
- [ ] Removing a tipo de servicio that has consumed productos from an order (via the existing `PATCH /ordenes-trabajo/:id` reconciliation) succeeds without an FK violation (cascade deletes the lines).
- [ ] The migration is additive-only; rollback follows the Rollback Plan with no lingering data effect.
