# Tasks: Productos consumidos por detalle de orden de trabajo

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450-550 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: backend (schema/migration + DTOs + service + controller, Phases 1-4); PR 2: frontend (client lib + UI, Phases 5-6), stacked on PR 1 |
| Delivery strategy | ask-on-risk (confirm with user before `sdd-apply`) |
| Chain strategy | to be confirmed with user if chaining is chosen (`stacked-to-main` vs `feature-branch-chain`) |

Decision needed before apply: **Yes** — this change exceeds the 400-line budget on a single-PR estimate. Breakdown against design.md's File Changes table (8 files, 1 new model):
- `server/prisma/schema.prisma`: new model (~16 lines) + 3 back-relations (~3 lines) ≈ 19 lines
- `server/prisma/migrations/<ts>_.../migration.sql` (generated): `CREATE TABLE` + 3 `ALTER TABLE` FKs + unique index ≈ 25 lines
- `server/src/ordenes-trabajo/dto/create-orden-trabajo-producto.dto.ts` (new): ≈ 15 lines
- `server/src/ordenes-trabajo/dto/update-orden-trabajo-producto.dto.ts` (new): ≈ 10 lines
- `server/src/ordenes-trabajo/ordenes-trabajo.service.ts`: `ORDEN_TRABAJO_PRODUCTO_SELECT` (~8) + 3 private helpers (~55) + `addDetalleProducto`/`updateDetalleProducto`/`removeDetalleProducto` (~80) + 2 select embeds (~2) ≈ 145 lines
- `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`: `Delete` import + 2 DTO imports (~3) + 3 routes (~35) ≈ 38 lines
- `client/app/lib/productos.ts`: `searchProductos` ≈ 15 lines
- `client/app/lib/ordenes-trabajo.ts`: `OrdenTrabajoProductoLinea` type + `OrdenTrabajoDetalle` extension + 2 payload types (~25) + 3 client functions (~55) ≈ 80 lines
- `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx`: new `ProductosConsumidos` component (picker + row list + add/update/remove wiring + bloqueada gating) ≈ 120-140 lines + `DetalleCard` wiring ≈ 10 lines

This is a cohesive single feature, but it naturally splits along the same seam design.md already draws: the backend contract (schema → DTO → service → controller) is fully self-contained and independently curl-verifiable before any frontend code exists, and the frontend (client lib + UI) is a pure consumer of that contract with no backend changes of its own. That is a clean stacked-PR boundary, not an arbitrary line-count cut. Recommend splitting into 2 PRs along Phases 1-4 (backend) / 5-6 (frontend), with Phase 7 verification items split across both (backend-only checks land with PR 1; UI + full end-to-end checks land with PR 2). Confirm with the user whether to chain (and which chain strategy) before `sdd-apply` starts, per the Review Workload Guard.

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Schema + migration (Phase 1) | Foundational; must land before any Phase 2/3 code references the new model |
| 2 | Backend DTOs (Phase 2) | Small, independent of Phase 1 completion order but logically precedes Phase 3's imports |
| 3 | Backend service (Phase 3) | Depends on Units 1-2 |
| 4 | Backend controller (Phase 4) | Depends on Unit 3; completes the backend contract — natural PR-1 boundary |
| 5 | Frontend client lib (Phase 5) | Depends on Unit 4 being live (or at least frozen in design.md) — pure consumer of the backend contract |
| 6 | Frontend UI (Phase 6) | Depends on Unit 5 |
| 7 | Verification (Phase 7) | Backend-only items depend on Unit 4; UI/end-to-end items depend on Unit 6 |

## Phase 1: Schema & Migration

- [x] 1.1 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable, correct MySQL instance before generating/applying the migration (per proposal Known Gaps / design.md § Migration/Rollout)
- [x] 1.2 Modify `server/prisma/schema.prisma`: add the new `model OrdenTrabajoTipoServicioProducto { ... }` verbatim per design.md § Interfaces/Contracts → Prisma schema diff (own `id` PK; `ordenTrabajoTipoServicioId`/`ordenTrabajoTipoServicio` FK with `onDelete: Cascade`; `productoId`/`producto` FK, implicit `Restrict`; `cantidad`, `precioUnitario`, `precioTotal` all `Decimal @db.Decimal(10, 2)`; `actualizadoPorId`/`actualizadoPor` nullable audit FK with relation name `"OrdenTrabajoTipoServicioProductoActualizadoPor"`, `onDelete: SetNull`; `createdAt`/`updatedAt`; `@@unique([ordenTrabajoTipoServicioId, productoId])`)
- [x] 1.3 Modify `server/prisma/schema.prisma`'s `OrdenTrabajoTipoServicio` model: add the back-relation `productos OrdenTrabajoTipoServicioProducto[]`
- [x] 1.4 Modify `server/prisma/schema.prisma`'s `Producto` model: add the back-relation `ordenTrabajoTipoServicioProductos OrdenTrabajoTipoServicioProducto[]`
- [x] 1.5 Modify `server/prisma/schema.prisma`'s `User` model: add the back-relation `ordenTrabajoTipoServicioProductosActualizados OrdenTrabajoTipoServicioProducto[] @relation("OrdenTrabajoTipoServicioProductoActualizadoPor")`
- [x] 1.6 Run `npx prisma migrate dev --name orden_trabajo_tipo_servicio_producto` in `server/` — **plain, no `--create-only`** (per design.md § Migration/Rollout, this migration is purely additive so the default command generates and applies the correct `CREATE TABLE` + 3 FKs + `@@unique` directly; do not hand-edit the generated SQL, including any Prisma-truncated identifier names)
- [x] 1.7 Confirm the generated `migration.sql` matches the additive shape design.md documents (§ Interfaces/Contracts → Migration SQL) and that Prisma Client regenerated successfully

## Phase 2: Backend DTOs

- [x] 2.1 Create `server/src/ordenes-trabajo/dto/create-orden-trabajo-producto.dto.ts` — `CreateOrdenTrabajoProductoDto` verbatim per design.md § Interfaces/Contracts → DTOs (`productoId: number` with `@IsInt()`; `cantidad: number` with `@IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99)`)
- [x] 2.2 Create `server/src/ordenes-trabajo/dto/update-orden-trabajo-producto.dto.ts` — `UpdateOrdenTrabajoProductoDto` verbatim per design.md § Interfaces/Contracts → DTOs (`cantidad: number` only, same validators)

## Phase 3: Backend Service (`server/src/ordenes-trabajo/ordenes-trabajo.service.ts`)

- [x] 3.1 Add the module-level `ORDEN_TRABAJO_PRODUCTO_SELECT` constant per design.md's `addDetalleProducto`/read-shape section (`id`, `cantidad`, `precioUnitario`, `precioTotal`, `producto: { select: { id, descripcion } }`, `updatedAt`)
- [x] 3.2 Add private helper `loadDetalleParaProducto(client, ordenTrabajoId, detalleId)` per design.md verbatim — the **novel** server-side `terminado` guard (409 `ConflictException`) + belongs-to check (404 `NotFoundException`) enforced inside the transaction
- [x] 3.3 Add private helper `loadLinea(client, detalleId, lineaId)` per design.md verbatim — belongs-to check that the línea belongs to the given detalle (404 otherwise), returning `cantidad`/`precioUnitario` for the update-path recompute
- [x] 3.4 Add private helper `assertProductoActivo(client, productoId)` per design.md verbatim — active-producto guard (400 if inactive/missing) + null-`precioVenta` guard (400), returning `{ precioVenta }` for the create-path freeze
- [x] 3.5 Add `async addDetalleProducto(ordenTrabajoId, detalleId, dto, actualizadoPorId)` per design.md verbatim — `$transaction` running `loadDetalleParaProducto` + `assertProductoActivo`, then a `findUnique` on the `ordenTrabajoTipoServicioId_productoId` compound key: if a line exists, **sum** `cantidad` and recompute `precioTotal` from the **existing frozen `precioUnitario`** (never re-reads `precioVenta`); if not, **create** a new line freezing `precioUnitario` from the current `precioVenta`. All `Decimal` math via `Prisma.Decimal` (`.plus`/`.times`), never JS floats
- [x] 3.6 Add `async updateDetalleProducto(ordenTrabajoId, detalleId, lineaId, dto, actualizadoPorId)` per design.md verbatim — `$transaction` running `loadDetalleParaProducto` + `loadLinea`, setting `cantidad` to the absolute new value and recomputing `precioTotal` from the **frozen** `precioUnitario` (catalog never re-read)
- [x] 3.7 Add `async removeDetalleProducto(ordenTrabajoId, detalleId, lineaId)` per design.md verbatim — `$transaction` running `loadDetalleParaProducto` + `loadLinea` guards, then `delete`; no `actualizadoPorId` param (row is deleted)
- [x] 3.8 Modify `findDetalles`'s `select` block: add `productos: { select: ORDEN_TRABAJO_PRODUCTO_SELECT, orderBy: { id: 'asc' } }` per design.md § Read-shape diff
- [x] 3.9 Modify `updateDetalle`'s `select` block: add the same `productos: { select: ORDEN_TRABAJO_PRODUCTO_SELECT, orderBy: { id: 'asc' } }` — required so `updateDetalle`'s response does not drop `productos` and wipe them from client local state on merge (design.md § Decision Q2 rationale)

## Phase 4: Backend Controller (`server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`)

- [x] 4.1 Add `Delete` to the existing `@nestjs/common` import; import `CreateOrdenTrabajoProductoDto` and `UpdateOrdenTrabajoProductoDto`
- [x] 4.2 Add `@Post(':id/detalles/:detalleId/productos') async addDetalleProducto(...)` per design.md verbatim — `id`/`detalleId` via `ParseIntPipe`, `@Body() dto: CreateOrdenTrabajoProductoDto`, `@Request() req`, calling `this.ordenesTrabajoService.addDetalleProducto(id, detalleId, dto, req.user.userId)`
- [x] 4.3 Add `@Patch(':id/detalles/:detalleId/productos/:lineaId') async updateDetalleProducto(...)` per design.md verbatim — additional `lineaId` via `ParseIntPipe`, `@Body() dto: UpdateOrdenTrabajoProductoDto`, calling `updateDetalleProducto(id, detalleId, lineaId, dto, req.user.userId)`
- [x] 4.4 Add `@Delete(':id/detalles/:detalleId/productos/:lineaId') @HttpCode(204) async removeDetalleProducto(...)` per design.md verbatim — calling `removeDetalleProducto(id, detalleId, lineaId)`, no body param

## Phase 5: Frontend Client Lib

- [ ] 5.1 Modify `client/app/lib/productos.ts`: add `export async function searchProductos(term: string): Promise<{ id: number; label: string }[]>` per design.md verbatim — calls `listProductos({ search: term || undefined, status: 'activo', page: 1, pageSize: 20 })`, maps to `{ id, label: descripcion }`
- [ ] 5.2 Modify `client/app/lib/ordenes-trabajo.ts`: add `export interface OrdenTrabajoProductoLinea { id, producto: { id, descripcion }, cantidad: string, precioUnitario: string, precioTotal: string, updatedAt: string }` per design.md verbatim (note: `cantidad`/`precioUnitario`/`precioTotal` are `Decimal`-as-string, per the Known Gaps convention)
- [ ] 5.3 Modify `client/app/lib/ordenes-trabajo.ts`'s `OrdenTrabajoDetalle` interface: add `productos: OrdenTrabajoProductoLinea[]`
- [ ] 5.4 Modify `client/app/lib/ordenes-trabajo.ts`: add `AddOrdenTrabajoProductoPayload { productoId: number; cantidad: number }` and `UpdateOrdenTrabajoProductoPayload { cantidad: number }` types
- [ ] 5.5 Modify `client/app/lib/ordenes-trabajo.ts`: add `addOrdenTrabajoDetalleProducto(ordenId, detalleId, data)` per design.md verbatim — `POST .../productos`, routed through `handleJsonResponse`
- [ ] 5.6 Modify `client/app/lib/ordenes-trabajo.ts`: add `updateOrdenTrabajoDetalleProducto(ordenId, detalleId, lineaId, data)` per design.md verbatim — `PATCH .../productos/:lineaId`, routed through `handleJsonResponse`
- [ ] 5.7 Modify `client/app/lib/ordenes-trabajo.ts`: add `removeOrdenTrabajoDetalleProducto(ordenId, detalleId, lineaId)` per design.md verbatim — `DELETE .../productos/:lineaId`; **must not** call `handleJsonResponse` (204 has no body) — checks `res.ok` and throws with the parsed error message on failure

## Phase 6: Frontend UI (`client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx`)

- [ ] 6.1 Build the `ProductosConsumidos` sub-component per design.md § Frontend sub-component — `ProductosConsumidosProps { ordenId, detalleId, productosIniciales, bloqueada }`; internal state `lineas`, `productoSel`, `cantidad`, `agregando`, `busyLineaId` per design.md's state table
- [ ] 6.2 Implement the producto picker as an async single-select combobox backed by `searchProductos` (debounced), following the existing `SearchableSelect`/`TipoServicioMultiSelect` UX conventions (portaled panel, keyboard nav) as a UX reference only — **not** a reuse of the multi-select chip model (D11)
- [ ] 6.3 Render each row: producto descripcion, a `cantidad` numeric input, `precioUnitario`/`precioTotal` displayed via the inline `` `$${Number(linea.precioTotal).toFixed(2)}` `` pattern (design.md § Decision Q4 — no new shared formatter), and a "Quitar" button
- [ ] 6.4 Wire the "Agregar" action: call `addOrdenTrabajoDetalleProducto(ordenId, detalleId, { productoId, cantidad: Number(cantidad) })` immediately on click; on success, upsert the returned line into `lineas` (replace if the returned `id` already exists locally — the sum case — else append); clear `productoSel`/`cantidad`
- [ ] 6.5 Wire the row-level "Actualizar" action: call `updateOrdenTrabajoDetalleProducto(ordenId, detalleId, lineaId, { cantidad: Number(next) })` immediately; on success, replace that line in `lineas`
- [ ] 6.6 Wire the row-level "Quitar" action (after `showConfirm`): call `removeOrdenTrabajoDetalleProducto(ordenId, detalleId, lineaId)` immediately; on success, filter that line out of `lineas`
- [ ] 6.7 Ensure **every** button/input inside `ProductosConsumidos` is `type="button"` (never `type="submit"`) so no action fires the enclosing `DetalleCard` `<form>`'s `handleSubmit` ("Completar Servicio")
- [ ] 6.8 Gate the entire sub-section as read-only (inputs/buttons disabled, no calls fire) when `bloqueada` is true, mirroring the card's other locked fields
- [ ] 6.9 Wire errors through `showError` and successes through a light `showSuccess` (or silent), matching the diagnóstico inline-create immediacy pattern
- [ ] 6.10 Wire `ProductosConsumidos` into `DetalleCard`: render it with `productosIniciales={detalle.productos}` and `bloqueada={bloqueada}` (the card's existing `estado === 'terminado'` derivation)

## Phase 7: Manual/E2E Verification

Mirrors design.md § Testing Strategy row-for-row.

- [x] 7.1 Retrospectively confirm `DATABASE_URL` targeted the correct instance for the Phase 1 migration
- [x] 7.2 Verify all 3 routes (`POST`/`PATCH`/`DELETE` under `.../productos[/:lineaId]`) return 401 without a Bearer token, and mutate nothing
- [x] 7.3 Verify `POST .../productos` persists a new line with server-computed `precioTotal = cantidad × Producto.precioVenta` and a frozen `precioUnitario`, and that any client-supplied price-like field is ignored
- [x] 7.4 Verify adding the **same** `productoId` to the same detalle twice sums into **one** row (`cantidad` grows, `precioTotal` follows) instead of creating a second row
- [x] 7.5 **Price snapshot survives a catalog price change**: add a line, change the producto's `precioVenta` via `PATCH /productos/:id`, then `PATCH` the line's `cantidad` — assert `precioTotal` uses the OLD frozen `precioUnitario`, not the new catalog price
- [x] 7.6 Verify `PATCH .../productos/:lineaId` sets `cantidad` as an absolute value and recomputes `precioTotal = precioUnitario × cantidad` from the frozen unit price
- [x] 7.7 **Remove one line among several**: add 3 lines to a detalle, `DELETE` the middle one, assert the other 2 remain unchanged
- [x] 7.8 Verify `POST`/`PATCH`/`DELETE` on a `terminado` detalle's producto lines all return 409 with a Spanish message and mutate nothing
- [x] 7.9 Verify `POST .../productos` with an inactive (`activo: false`) `productoId` returns 400 with a Spanish message and creates/sums nothing
- [x] 7.10 Verify `POST .../productos` with a producto lacking `precioVenta` (`null`) returns 400
- [x] 7.11 Verify `actualizadoPorId` on add/update is stamped from the JWT caller (`req.user.userId`), never from client input
- [x] 7.12 Verify `GET /ordenes-trabajo/:id/detalles` (and `updateDetalle`'s response) exposes each consumed line's `id`, producto `id`/`descripcion`, `cantidad`, `precioUnitario`, `precioTotal`; a detalle with no lines returns an empty array, not `null`/omitted
- [x] 7.13 **Cascade-delete via the existing `update()` reconciliation** (D5's core risk): add lines to a detalle, then `PATCH /ordenes-trabajo/:id` dropping that detalle's `tipoServicioId` — assert 200, no FK violation, and the lines are gone
- [x] 7.14 Verify belongs-to checks: a línea/detalle from order A cannot be mutated via order B's `id` in the URL — expect 404
- [ ] 7.15 Verify the `ProductosConsumidos` UI sub-section adds/edits/removes immediately (no page-level submit), displays `precioTotal` correctly, and renders read-only once the detalle's `estado === 'terminado'`
- [ ] 7.16 Walk the proposal's full Success Criteria checklist end-to-end and confirm each item; confirm the Rollback Plan steps are accurate and executable as written (backend-side criteria confirmed this run; full end-to-end including UI deferred to PR 2)
