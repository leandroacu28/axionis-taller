# Tasks: Presupuestos CRUD (Create, List, Update)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1750-1950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (data model + backend module) → PR 2 (frontend API client + shared pickers/editor) → PR 3 (list/create/edit pages + navigation) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

This is a **new module + new route + a duplicated large UI component (D7)**, so almost all of it is net-new code. Estimate breakdown, calibrated against `design.md`'s File Changes table and the closest precedents (`productos/` module, `ordenes-trabajo.service.ts:702-785`, and the OT trabajo page's duplicated picker at `ordenes-trabajo/[id]/trabajo/page.tsx:265-720`, ~455 source lines):

- `server/prisma/schema.prisma`: `Presupuesto` + `PresupuestoProducto` models + back-relations on `User`(×3)/`Cliente`/`TipoServicio`/`Producto` — ~40 lines
- Generated migration SQL (two tables + FKs): ~50-70 lines
- `presupuestos.module.ts`: ~10 lines
- `presupuestos.controller.ts` (4 header routes + 3 line-item sub-routes): ~85-95 lines
- `presupuestos.service.ts` (findAll/findOne/create/update/addProducto/updateProducto/removeProducto + 5 private guards + SELECT whitelists + filter helper): ~260-290 lines
- 4 DTO files (`create-presupuesto`, `update-presupuesto`, `list-presupuestos-query`, `create-presupuesto-producto`): ~110-130 lines combined
- `app.module.ts` edit: ~2 lines
- `client/app/lib/presupuestos.ts` (types + 7 functions): ~150-180 lines
- `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx` edit (`tipoServicioSelectConfig`): ~20-30 lines
- `client/app/(dashboard)/presupuestos/PresupuestoProductosEditor.tsx` (duplicated from OT lines 265-720, staged + live modes per Decision A1): ~380-450 lines
- `client/app/(dashboard)/presupuestos/page.tsx` (list: table, search, activo filter, D6 no card toggle): ~260-300 lines
- `client/app/(dashboard)/presupuestos/nuevo/page.tsx` (header form + staged editor): ~150-180 lines
- `client/app/(dashboard)/presupuestos/editar/[id]/page.tsx` (header form + live editor): ~180-220 lines
- `client/app/lib/navigation.tsx` edit: ~10 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + migration (`Presupuesto` + `PresupuestoProducto` models, back-relations, `add_presupuestos` migration) | PR 1 | ~90-110 lines; foundational, must land before the backend module compiles against the Prisma Client |
| 2 | Backend `presupuestos` module (DTOs, service, controller, module) + `app.module.ts` registration | PR 1 | ~460-510 lines; independently verifiable via curl/Postman once migrated; combined with Unit 1 this pushes PR 1 well over the 400-line budget on its own — flag for chaining or `size:exception` decision |
| 3 | `client/app/lib/presupuestos.ts` + `tipoServicioSelectConfig` + `PresupuestoProductosEditor.tsx` | PR 2 | ~550-660 lines; depends on PR 1's endpoints being live; the picker/editor is the single largest file in this change (D7 duplication) |
| 4 | `presupuestos/page.tsx` + `nuevo/page.tsx` + `editar/[id]/page.tsx` + `navigation.tsx` entry | PR 3 | ~600-710 lines; depends on Unit 3's API client and editor component |

## Phase 1: Data Model & Migration

- [x] 1.1 Modify `server/prisma/schema.prisma`: add the `Presupuesto` model exactly as specified in `design.md` (`id`, `fecha DateTime`, `clienteId`/`cliente` FK `onDelete: Restrict`, `tipoServicioId`/`tipoServicio` FK `onDelete: Restrict`, `telefono String?`, `descripcion String?`, `activo Boolean @default(true)`, `creadoPorId`/`creadoPor` relation `"PresupuestoCreadoPor"` `onDelete: SetNull`, `actualizadoPorId`/`actualizadoPor` relation `"PresupuestoActualizadoPor"` `onDelete: SetNull`, `productos PresupuestoProducto[]`, `createdAt`, `updatedAt`)
- [x] 1.2 Modify `server/prisma/schema.prisma`: add the `PresupuestoProducto` model exactly as specified in `design.md` (`id`, `presupuestoId`/`presupuesto` FK `onDelete: Cascade`, `productoId`/`producto` FK no cascade, `cantidad Decimal(10,2)`, `precioUnitario Decimal(10,2)`, `precioTotal Decimal(10,2)`, `actualizadoPorId`/`actualizadoPor` relation `"PresupuestoProductoActualizadoPor"` `onDelete: SetNull`, `createdAt`, `updatedAt`, `@@unique([presupuestoId, productoId])`)
- [x] 1.3 Modify `server/prisma/schema.prisma`: add back-relations to `User` (`presupuestosCreados Presupuesto[] @relation("PresupuestoCreadoPor")`, `presupuestosActualizados Presupuesto[] @relation("PresupuestoActualizadoPor")`, `presupuestoProductosActualizados PresupuestoProducto[] @relation("PresupuestoProductoActualizadoPor")`), `Cliente` (`presupuestos Presupuesto[]`), `TipoServicio` (`presupuestos Presupuesto[]`), and `Producto` (`presupuestoProductos PresupuestoProducto[]`)
- [x] 1.4 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before migrating (proposal Known-Gap, restated in `design.md` Migration/Rollout)
- [x] 1.5 Run `npx prisma migrate dev --name add_presupuestos` in `server/` to generate the additive migration and regenerate the Prisma Client (`Presupuesto`/`PresupuestoProducto` delegates + new back-relations on `User`/`Cliente`/`TipoServicio`/`Producto`)

## Phase 2: Backend Module — DTOs

_Depends on: Phase 1 (Prisma Client must exist for typed DTOs to compile against generated types where relevant)._

- [x] 2.1 Create `server/src/presupuestos/dto/create-presupuesto-producto.dto.ts`: `CreatePresupuestoProductoDto` (`productoId: number` `@IsInt`; `cantidad: number` `@IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99)`) — verbatim mirror of `create-orden-trabajo-producto.dto.ts` per `design.md`
- [x] 2.2 Create `server/src/presupuestos/dto/create-presupuesto.dto.ts`: `CreatePresupuestoDto` (`fecha: string` `@IsISO8601`; `clienteId: number` `@IsInt`; `tipoServicioId: number` `@IsInt`; `telefono?: string` `@IsOptional @IsString`; `descripcion?: string` `@IsOptional @IsString`; **no `activo` field**; `productos?: CreatePresupuestoProductoDto[]` `@IsOptional @IsArray @ValidateNested({ each: true }) @Type(() => CreatePresupuestoProductoDto)`)
- [x] 2.3 Create `server/src/presupuestos/dto/update-presupuesto.dto.ts`: `UpdatePresupuestoDto` — full body (D5), no `productos` field (`fecha` `@IsISO8601`, `clienteId`/`tipoServicioId` `@IsInt` required, `telefono`/`descripcion` `@IsOptional @IsString`, `activo?: boolean` `@IsOptional @IsBoolean`)
- [x] 2.4 Create `server/src/presupuestos/dto/list-presupuestos-query.dto.ts`: `PresupuestoStatusFilter` type (`'all' | 'activo' | 'inactivo'`) + `ListPresupuestosQueryDto` (`page`/`pageSize` via `@Type(() => Number) @IsInt @Min(1)` with `pageSize` also `@Max(100)`, `search` optional string, `status` `@IsIn(['all','activo','inactivo'])` default `'all'`) — mirrors `list-productos-query.dto.ts`

## Phase 3: Backend Module — Service

_Depends on: Phase 2 (DTOs), Phase 1 (Prisma Client)._

- [x] 3.1 Create `server/src/presupuestos/presupuestos.service.ts`: module-level `PRESUPUESTO_PRODUCTO_SELECT` and `PRESUPUESTO_SELECT` whitelists exactly as specified in `design.md` (slim `{ id, username }` shape for `creadoPor`/`actualizadoPor`, nested `cliente: { id, razonSocial }`, `tipoServicio: { id, descripcion }`, `productos` ordered by `id: 'asc'`)
- [x] 3.2 Add module-level `buildPresupuestoWhere(filter)` — mirrors `buildProductoWhere` shape; search `OR` across `descripcion`, `telefono`, `cliente.razonSocial`; combine with `status` (`'activo'`/`'inactivo'`/`'all'`); keep the MySQL "`mode: 'insensitive'` unsupported, collation handles case" comment
- [x] 3.3 Add private guard `assertClienteActivo(clienteId)`: `findUnique({ select: { activo: true } })`; `!cliente || !cliente.activo` → `BadRequestException('El cliente no existe o está inactivo.')`
- [x] 3.4 Add private guard `assertTipoServicioActivo(tipoServicioId)`: same shape → `BadRequestException('El tipo de servicio no existe o está inactivo.')`
- [x] 3.5 Add private guard `assertProductoActivo(client, productoId)` — **byte-for-byte copy of `ordenes-trabajo.service.ts:275-290`** (Decision A3/R1, non-negotiable): rejects inactive/missing producto AND rejects `precioVenta == null` with `BadRequestException('El producto no tiene un precio de venta definido.')`; returns `{ precioVenta }`; accepts a `tx` client
- [x] 3.6 Add private guard `assertPresupuestoExists(client, presupuestoId)`: `findUnique({ select: { id: true } })`; `null` → `NotFoundException('Presupuesto no encontrado.')` (no estado/lifecycle gate — D3)
- [x] 3.7 Add private guard `loadLinea(client, presupuestoId, detalleId)`: `findUnique({ select: { id, presupuestoId, cantidad, precioUnitario } })`; `!linea || linea.presupuestoId !== presupuestoId` → `NotFoundException('Línea de producto no encontrada.')`
- [x] 3.8 Add `findAll(query: ListPresupuestosQueryDto)`: `page ?? 1`, `pageSize ?? 10`, `buildPresupuestoWhere(query)`, `$transaction([findMany({ where, select: PRESUPUESTO_SELECT, orderBy: { id: 'asc' }, skip, take }), count({ where }), count({ where: { ...searchWhere, activo: true } })])` → `{ data, total, activeCount }`
- [x] 3.9 Add `findOne(id: number)`: `findUnique({ where: { id }, select: PRESUPUESTO_SELECT })`; `null` → `NotFoundException('Presupuesto no encontrado.')`
- [x] 3.10 Add `create(dto: CreatePresupuestoDto, creadoPorId: number)`: `assertClienteActivo` + `assertTipoServicioActivo`, then single `$transaction`: (1) create header (`fecha: new Date(dto.fecha)`, `clienteId`, `tipoServicioId`, `telefono`, `descripcion`, `creadoPorId`, `actualizadoPorId: creadoPorId` — **no `activo` in the data block**, schema `@default(true)` is authoritative); (2) for each item in `dto.productos ?? []` run the identical freeze/sum-on-duplicate logic as `addProducto` (assert active, compound `findUnique`, sum-or-create, stamp `actualizadoPorId: creadoPorId`); (3) return `tx.presupuesto.findUnique({ where: { id }, select: PRESUPUESTO_SELECT })`
- [x] 3.11 Add `update(id, dto: UpdatePresupuestoDto, actualizadoPorId: number)`: `assertPresupuestoExists`, `assertClienteActivo` + `assertTipoServicioActivo` (re-validated unconditionally), `update({ where: { id }, data: { fecha: new Date(dto.fecha), clienteId, tipoServicioId, telefono, descripcion, activo: dto.activo, actualizadoPorId }, select: PRESUPUESTO_SELECT })` — must NOT touch `productos`
- [x] 3.12 Add `addProducto(presupuestoId, dto: CreatePresupuestoProductoDto, actualizadoPorId)`: `$transaction` — `assertPresupuestoExists`; `{ precioVenta } = await assertProductoActivo(tx, dto.productoId)`; `cantidad = new Prisma.Decimal(dto.cantidad)`; compound `findUnique` on `presupuestoId_productoId`; **if existing** → sum `cantidad`, recompute `precioTotal` from the existing frozen `precioUnitario` (never re-read catalog), stamp `actualizadoPorId`; **else** → `create` with `precioUnitario: precioVenta`, `precioTotal: precioVenta.times(cantidad)`, stamp `actualizadoPorId` — mirrors `addDetalleProducto` (`ordenes-trabajo.service.ts:702-751`) exactly
- [x] 3.13 Add `updateProducto(presupuestoId, detalleId, dto: CreatePresupuestoProductoDto, actualizadoPorId)`: `$transaction` — `assertPresupuestoExists`; `linea = loadLinea(tx, presupuestoId, detalleId)`; `cantidad = new Prisma.Decimal(dto.cantidad)`; `update({ data: { cantidad, precioTotal: linea.precioUnitario.times(cantidad), actualizadoPorId } })` — recompute from frozen `precioUnitario`, catalog never re-read — mirrors `updateDetalleProducto` (`:753-776`)
- [x] 3.14 Add `removeProducto(presupuestoId, detalleId)`: `$transaction` — `assertPresupuestoExists`; `loadLinea`; `delete({ where: { id: detalleId } })` — no `actualizadoPorId` param — mirrors `removeDetalleProducto` (`:778-785`)

## Phase 4: Backend Module — Controller & Module Registration

_Depends on: Phase 3 (service)._

- [x] 4.1 Create `server/src/presupuestos/presupuestos.controller.ts`: `@Controller('presupuestos')`, class-level `@UseGuards(JwtAuthGuard)`
- [x] 4.2 Add `@Get()` → `findAll(@Query() query: ListPresupuestosQueryDto)`
- [x] 4.3 Add `@Get(':id')` → `findOne(@Param('id', ParseIntPipe) id)`
- [x] 4.4 Add `@Post()` → `create(@Body() dto: CreatePresupuestoDto, @Request() req)` calling `create(dto, req.user.userId)`
- [x] 4.5 Add `@Patch(':id')` → `update(@Param('id', ParseIntPipe) id, @Body() dto: UpdatePresupuestoDto, @Request() req)` calling `update(id, dto, req.user.userId)`
- [x] 4.6 Add line-item sub-routes exactly as specified in `design.md`: `@Post(':id/productos')` → `addProducto(id, dto, req.user.userId)`; `@Patch(':id/productos/:detalleId')` → `updateProducto(id, detalleId, dto, req.user.userId)`; `@Delete(':id/productos/:detalleId')` with `@HttpCode(204)` → `removeProducto(id, detalleId)` (no `actualizadoPorId` param)
- [x] 4.7 **Confirm no `DELETE /presupuestos/:id` route exists** (D3) — the only delete-shaped route in the controller is the line-item sub-route from 4.6
- [x] 4.8 Create `server/src/presupuestos/presupuestos.module.ts`: `controllers: [PresupuestosController]`, `providers: [PresupuestosService]`
- [x] 4.9 Modify `server/src/app.module.ts`: import and register `PresupuestosModule` in `imports`

## Phase 5: Backend Manual Verification

_No automated test runner is configured in this repo (`strict_tdd: false`); verify manually against a running server + reachable DB._

- [x] 5.1 Verify `GET /presupuestos`, `GET /presupuestos/:id`, `POST /presupuestos`, `PATCH /presupuestos/:id`, `POST /presupuestos/:id/productos`, `PATCH /presupuestos/:id/productos/:detalleId`, `DELETE /presupuestos/:id/productos/:detalleId` all return 401 without a Bearer token
- [x] 5.2 Verify no `DELETE /presupuestos` or `DELETE /presupuestos/:id` route exists (405/404)
- [x] 5.3 Verify `POST /presupuestos` with a nonexistent `clienteId` or `tipoServicioId` returns 400 and creates no row
- [x] 5.4 Verify `POST /presupuestos` stamps `creadoPorId` AND `actualizadoPorId` from the JWT caller, ignoring any client-supplied `creadoPorId`/`actualizadoPorId` in the body (global `whitelist: true` strips them)
- [x] 5.5 Verify `PATCH /presupuestos/:id` stamps only `actualizadoPorId` from the JWT caller and leaves `creadoPorId` unchanged (create as user A, patch as user B → `creadoPor` still A, `actualizadoPor` now B)
- [x] 5.6 Verify adding a product with an active `producto` and a set `precioVenta` creates a new line with `precioUnitario` frozen from the current catalog price and `precioTotal = precioUnitario * cantidad`
- [x] 5.7 Verify re-adding the same `productoId` sums into the existing line (`cantidad` and `precioTotal` update, no second row), and `precioUnitario` stays frozen even if `Producto.precioVenta` is changed in between
- [x] 5.8 Verify adding a product with `precioVenta: null` returns 400 with the exact message `'El producto no tiene un precio de venta definido.'` and creates no line
- [x] 5.9 Verify adding an inactive product returns 400 and creates no line
- [x] 5.10 Verify `PATCH /presupuestos/:id/productos/:detalleId` recomputes `precioTotal` from the line's frozen `precioUnitario` (not the current catalog price) and never changes `precioUnitario`
- [x] 5.11 Verify `DELETE /presupuestos/:id/productos/:detalleId` removes only that line, leaves the presupuesto and its other lines intact with `activo` unchanged; verify a `detalleId` belonging to a different presupuesto returns 404
- [x] 5.12 Verify `PATCH /presupuestos/:id { activo: false }` deactivates (does not delete) the row and it reads back with `activo: false`
- [x] 5.13 Verify attempting to delete a `Cliente` or `TipoServicio` referenced by a presupuesto is rejected by the FK `Restrict` constraint
- [x] 5.14 Verify deleting a `User` who is a presupuesto's or line's `creadoPor`/`actualizadoPor` succeeds and the referencing row's audit FK becomes `null`
- [x] 5.15 Verify any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'` on all 7 routes (no role guard)
- [x] 5.16 Verify `GET /presupuestos` list search matches `descripcion`, `telefono`, and `cliente.razonSocial`; `status` filter (`activo`/`inactivo`/`all`) narrows correctly; pagination (`page`/`pageSize`) behaves as expected

## Phase 6: Frontend API Client

_Depends on: Phase 5 (backend verified live)._

- [x] 6.1 Create `client/app/lib/presupuestos.ts`: `PresupuestoProductoLinea`, `PresupuestoListItem`, `CreatePresupuestoProductoPayload`, `CreatePresupuestoPayload`, `UpdatePresupuestoPayload` types exactly as specified in `design.md`; copy `handleJsonResponse<T>` verbatim from `lib/productos.ts`
- [x] 6.2 Add `ListPresupuestosParams` (`page`, `pageSize`, `search?`, `status?`) and `PaginatedPresupuestos` (`{ data: PresupuestoListItem[]; total: number; activeCount: number }`) — copied from `lib/productos.ts`
- [x] 6.3 Add `listPresupuestos(params)` (GET `/presupuestos?…`), `getPresupuesto(id)` (GET `/presupuestos/${id}`) — each spreading `getAuthHeader()`
- [x] 6.4 Add `createPresupuesto(data: CreatePresupuestoPayload)` (POST `/presupuestos`), `updatePresupuesto(id, data: UpdatePresupuestoPayload)` (PATCH `/presupuestos/${id}`) — each spreading `getAuthHeader()` + `Content-Type`
- [x] 6.5 Add `addPresupuestoProducto(id, data: CreatePresupuestoProductoPayload)` (POST `/presupuestos/${id}/productos`), `updatePresupuestoProducto(id, detalleId, data)` (PATCH `/presupuestos/${id}/productos/${detalleId}`), `removePresupuestoProducto(id, detalleId)` (DELETE `/presupuestos/${id}/productos/${detalleId}`)

## Phase 7: Frontend Shared Pickers & Product Editor

_Depends on: Phase 6 (API client)._

- [x] 7.1 Modify `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx`: add `tipoServicioSelectConfig` (search-only, no quickCreate), backed by `listServiceTypes` from `client/app/lib/service-types.ts` with `{ status: 'activo', page: 1, pageSize: 20 }` mapped to `{ id, label: descripcion }`, used with the existing `SearchableSelect`
- [x] 7.2 Create `client/app/(dashboard)/presupuestos/PresupuestoProductosEditor.tsx`: duplicate the `ProductoPicker` combobox (portaled panel, 350ms debounce, keyboard nav) from `ordenes-trabajo/[id]/trabajo/page.tsx:265-460`, wired to `searchProductos` (`client/app/lib/productos.ts:150-158`) — per Decision D7, do NOT import from `ordenes-trabajo`
- [x] 7.3 Duplicate the line-item list UI from `ordenes-trabajo/[id]/trabajo/page.tsx:642-720` (descripcion, editable `cantidad` input, `$ c/u`, `$ total`, Actualizar/Quitar buttons) into `PresupuestoProductosEditor.tsx`
- [x] 7.4 Implement the dual-mode contract from Decision A1: component accepts injected async handlers (`onAdd`, `onUpdate`, `onRemove`) and a `mode: 'staged' | 'live'` prop; **staged mode** (used by `nuevo`) mutates an in-memory array and previews `precioUnitario`/`precioTotal` by fetching `getProducto(productoId)` on add (display-only, server re-freezes on `POST`); **live mode** (used by `editar/[id]`) calls `addPresupuestoProducto`/`updatePresupuestoProducto`/`removePresupuestoProducto` directly and renders the server's returned line

## Phase 8: Frontend List Page

_Depends on: Phase 6 (API client)._

- [x] 8.1 Create `client/app/(dashboard)/presupuestos/page.tsx` (`'use client'`): mirror `productos/page.tsx`'s list shape (D6: simple table, search + `activo` filter, **no** table/card toggle), calling `listPresupuestos`; 350ms search debounce, status filter, pagination
- [x] 8.2 Implement table columns: `#`, `Fecha`, `Cliente`, `Tipo de servicio`, `Total` (client-side sum of `productos[].precioTotal`), `Estado`, `Acciones` (edit link to `editar/[id]` + activate/deactivate via `updatePresupuesto`)
- [x] 8.3 Implement loading indicator while the request is in flight, error message on request failure (no crash), and an empty-state message when the list resolves empty

## Phase 9: Frontend Create Page

_Depends on: Phase 6 (API client), Phase 7 (pickers + editor)._

- [x] 9.1 Create `client/app/(dashboard)/presupuestos/nuevo/page.tsx`: header form with `clienteSelectConfig` + `SearchableSelect` (cliente picker, unmodified), `tipoServicioSelectConfig` + `SearchableSelect` (tipo-servicio picker), `fecha`, `telefono`, `descripcion` fields
- [x] 9.2 Wire `<PresupuestoProductosEditor mode="staged" …>` for line items; on submit call `createPresupuesto({ ...header, productos: staged })`
- [~] 9.3 On success, navigate back to `/presupuestos` (implemented via `router.push('/presupuestos')`, confirmed by code review); submitting with zero line items sends `productos: undefined` (code path confirmed: `productos.length > 0 ? productos : undefined`) — **NOT live-tested**: no valid login credentials were available in this environment to actually submit the form through a running session, so the end-to-end "still creates successfully" assertion is unverified live. Left partially checked to flag this honestly.

## Phase 10: Frontend Edit Page

_Depends on: Phase 6 (API client), Phase 7 (pickers + editor)._

- [x] 10.1 Create `client/app/(dashboard)/presupuestos/editar/[id]/page.tsx`: load via `getPresupuesto(id)`, pre-fill the header form (cliente picker, tipo-servicio picker, `fecha`, `telefono`, `descripcion`, `activo`)
- [x] 10.2 Wire header submit via `updatePresupuesto(id, data)` sending the full required body
- [x] 10.3 Wire `<PresupuestoProductosEditor mode="live" presupuestoId={id} …>` to `addPresupuestoProducto`/`updatePresupuestoProducto`/`removePresupuestoProducto`; adding/removing a line updates the editor without a full page reload — verified structurally (handlers use `setLines`/React state only, no `router.push`/`window.location` navigation anywhere in the add/update/remove path), **not** live-clicked in a browser

## Phase 11: Navigation

_Depends on: Phase 8 (list page must exist at `/presupuestos`)._

- [x] 11.1 Modify `client/app/lib/navigation.tsx`: add a new **flat top-level** "Presupuestos" entry (`href: '/presupuestos'`, `id: 'presupuestos'`, reuse an existing icon asset per `design.md`, e.g. `/icons/usuarios.svg`) after "Productos" — sibling of "Inicio"/"Clientes"/"Productos", NOT nested under "Configuraciones"'s `children`

## Phase 12: Frontend Manual Verification

_Honesty note: this environment has no browser and no valid login credentials (the seeded users' passwords are hashed and unknown), so true click-through/DevTools-network verification of these UI interaction scenarios could not be performed. What WAS verified for each item is listed; items requiring an authenticated interactive session are left unchecked rather than falsely marked done._

- [ ] 12.1 **Partially verified.** Confirmed via `npm run build` (0 type errors) and dev-server logs (`GET /presupuestos 200`, no compile/runtime errors) that the page mounts cleanly, and via code review that the table has no card/table toggle control anywhere in `page.tsx`. The actual loading-indicator-then-table-render sequence was NOT observed live (no browser).
- [ ] 12.2 NOT verified live — requires interactive search/filter typing and an actually-failing request to observe the error branch, and a genuinely empty dataset to observe the empty state. Code review confirms all three branches (`loading`/`listError`/empty) exist in `page.tsx`.
- [ ] 12.3 NOT verified live — requires an authenticated session to click through "Nuevo", use the pickers, and submit. Code review confirms the wiring (`clienteSelectConfig`, `tipoServicioSelectConfig`, `PresupuestoProductosEditor mode="staged"`, `createPresupuesto({ ...header, productos })`).
- [ ] 12.4 NOT verified live — see 9.3.
- [ ] 12.5 NOT verified live — requires an authenticated session to load `editar/1`'s data and submit a change. Confirmed via direct Prisma query that presupuesto id 1 exists (`activo: false`, `productos: []`) so the target row is valid for this test when a session is available.
- [ ] 12.6 NOT verified live — requires an authenticated session to click Agregar/Quitar. Code review confirms `handleLiveAdd`/`handleLiveUpdate`/`handleLiveRemove` call the sub-route API functions directly and update local state without navigation.
- [x] 12.7 Verified — grepped `PresupuestoProductosEditor.tsx`'s `^import` lines; only `react`, `react-dom`, `../../lib/productos` (`searchProductos`), and `../../lib/alerts` are imported. No import from `ordenes-trabajo`.
- [x] 12.8 Verified structurally — `navigation.tsx`'s "Presupuestos" entry is a top-level array item (not inside `Configuraciones`'s `children`) with `href: '/presupuestos'`; grepped `Sidebar.tsx` and confirmed `filterNavigation` only filters by the search query string, with no `rol`-based branching anywhere in the component — matches the existing "No Role Filtering in V1" behavior, unchanged by this work.

## Phase 13: Documentation & Final Sign-off

- [x] 13.1 Walked `proposal.md`'s Success Criteria for the frontend-relevant items: `/presupuestos` list (simple table, search + `activo` filter, no toggle) exists; `nuevo`/`editar/[id]` pages exist with cliente picker, tipo-servicio picker, and product line-item editor; nav entry exists and is unguarded. Backend-side criteria (401s, audit stamping, price-freeze/sum/recompute, migration) were already verified and checked off in Phase 5 by the prior backend work — not re-verified here.
- [x] 13.2 Confirmed the Rollback Plan's frontend steps are accurate and executable as written: `client/app/(dashboard)/presupuestos/` (incl. `PresupuestoProductosEditor.tsx`), `client/app/lib/presupuestos.ts`, the `tipoServicioSelectConfig` addition to `referenceSelectConfigs.tsx`, and the "Presupuestos" nav entry in `navigation.tsx` are each cleanly removable/revertable independent of any other module.
- [x] 13.3 Confirmed the Known Gaps still hold as shipped on the frontend: no access-control/role gating added anywhere in the new pages or nav entry; the duplicated picker UI in `PresupuestoProductosEditor.tsx` is flagged in its header comment per D7; no shared type package — `client/app/lib/presupuestos.ts`'s types are hand-duplicated from the backend DTOs/SELECT shapes (cross-checked against the actual `presupuestos.service.ts`/`presupuestos.controller.ts` source, not just `design.md`).
