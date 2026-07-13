# Tasks: Productos CRUD (Create, List, Update)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1150 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema/migration + backend module) → PR 2 (frontend API client + UnidadMedidaSelect + list page + modal + nav) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

This is the `unidades-medida-crud` precedent (~650-800 lines) plus the richer field set (Decimal money/quantity fields, `precioVenta` compute, `alicuotaIva` codec, required-FK existence+active check, a copied searchable select):
- `server/prisma/schema.prisma`: `Producto` model + `AlicuotaIva` enum + 3 back-relations — ~30-35 lines
- Generated migration SQL: ~35-45 lines
- `productos.service.ts` (CRUD + `computePrecioVenta` + IVA codec + UM existence/active check + `isDescripcionConflict`): ~230-260 lines
- `productos.controller.ts`: ~55-60 lines
- 3 DTO files (create/update/list-query, `@IsIn([21,10.5])`, Decimal-as-number validation): ~90-100 lines
- `productos.module.ts` + `app.module.ts` edit: ~12 lines
- `client/app/lib/productos.ts` (typed client, Decimal fields as `string`): ~130-150 lines
- `client/app/(dashboard)/productos/UnidadMedidaSelect.tsx` (copied+slimmed, no quick-create): ~100-120 lines
- `client/app/(dashboard)/productos/page.tsx` (list + filters + pagination, no export, more columns): ~230-270 lines
- `client/app/(dashboard)/productos/ProductoFormModal.tsx` (more fields, read-only precioVenta, searchable select wiring): ~180-210 lines
- `client/app/lib/navigation.tsx` edit: ~10 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + migration (`Producto` model, `AlicuotaIva` enum, `UnidadMedida`/`User` back-relations, `add_producto` migration) + backend `productos` module (DTOs, service with compute/codec/FK-check, controller, module) + `app.module.ts` registration | PR 1 | ~440-490 lines; foundational, independently verifiable via curl/Postman once migrated |
| 2 | `client/app/lib/productos.ts` + `UnidadMedidaSelect.tsx` + `productos/page.tsx` + `ProductoFormModal.tsx` + `navigation.tsx` entry | PR 2 | ~650-750 lines; depends on PR 1's endpoints being live; itself over budget — consider a further split (lib+select vs. page+modal) or `size:exception` if the reviewer wants a stricter cut |

## Phase 1: Data Model & Migration

- [x] 1.1 Modify `server/prisma/schema.prisma`: add `enum AlicuotaIva { IVA_21 @map("21") IVA_10_5 @map("10.5") }`
- [x] 1.2 Modify `server/prisma/schema.prisma`: add the `Producto` model per design.md — `id`, `descripcion` `@unique`, `unidadMedidaId Int` + `unidadMedida UnidadMedida @relation(fields:[unidadMedidaId], references:[id])` (no `onDelete` override), `activo @default(true)`, `cantidadInicial`/`cantidadMinima`/`precioCompra`/`precioVenta`/`precioMayorista` as `Decimal @db.Decimal(10,2)`, `porcentajeGanancia Decimal @db.Decimal(5,2)`, `alertaStock Boolean @default(false)`, `alicuotaIva AlicuotaIva`, nullable `creadoPorId`/`creadoPor` and `actualizadoPorId`/`actualizadoPor` FKs (`onDelete: SetNull`, relation names `"ProductoCreadoPor"`/`"ProductoActualizadoPor"`), `createdAt`, `updatedAt`
- [x] 1.3 Modify `server/prisma/schema.prisma`: add `productos Producto[]` back-relation on `UnidadMedida`
- [x] 1.4 Modify `server/prisma/schema.prisma`: add `productosCreados Producto[] @relation("ProductoCreadoPor")` and `productosActualizados Producto[] @relation("ProductoActualizadoPor")` on `User`
- [x] 1.5 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before migrating
- [x] 1.6 Run `npx prisma migrate dev --name add_producto` in `server/` to generate the additive migration and regenerate the Prisma Client (`Producto` delegate, `AlicuotaIva` enum, new back-relations)

## Phase 2: Backend Module — DTOs

- [x] 2.1 Create `server/src/productos/dto/create-producto.dto.ts`: `CreateProductoDto` — `descripcion` (`@IsString @IsNotEmpty @MaxLength(191)`), `unidadMedidaId` (`@IsInt`), `cantidadInicial`/`cantidadMinima`/`precioCompra`/`porcentajeGanancia`/`precioMayorista` (`@IsNumber({maxDecimalPlaces:2})`), `alertaStock` (`@IsBoolean`), `alicuotaIva` (`@IsIn([21, 10.5])`) — no `precioVenta`, no `activo` field on the DTO
- [x] 2.2 Create `server/src/productos/dto/update-producto.dto.ts`: `UpdateProductoDto` — same field set as create plus `activo?: boolean` (`@IsOptional @IsBoolean`), mirrors sibling repeat-fields approach (no `PartialType`)
- [x] 2.3 Create `server/src/productos/dto/list-productos-query.dto.ts`: `ProductoStatusFilter` type + `ListProductosQueryDto` — identical shape to `ListUnidadesMedidaQueryDto` (`page`/`pageSize` via `@Type(() => Number) @IsInt @Min(1)`, `pageSize @Max(100)`, `search` optional string, `status @IsIn(['all','activo','inactivo'])` default `'all'`)

## Phase 3: Backend Module — Service

- [x] 3.1 Create `server/src/productos/productos.service.ts`: `PRODUCTO_SELECT` whitelist including all scalar fields, `unidadMedida: { select: { id, descripcion } }`, `creadoPor`/`actualizadoPor: { select: { id, username } }`; `DUPLICATE_DESCRIPCION_ERROR = 'Ya existe un producto con esa descripción.'`; `ProductoFilter` type
- [x] 3.2 Add module-level `buildProductoWhere(filter)` — mirror `buildUnidadMedidaWhere`, retyped to `Prisma.ProductoWhereInput`
- [x] 3.3 Add module-level `isDescripcionConflict(error)` — copy verbatim pattern from `unidades-medida.service.ts` (guards `PrismaClientKnownRequestError` + `P2002` + `target` includes `descripcion`)
- [x] 3.4 Add module-level `IVA_TO_ENUM = { 21: 'IVA_21', 10.5: 'IVA_10_5' } as const` and its inverse map; add `computePrecioVenta(precioCompra, porcentajeGanancia): Prisma.Decimal` per design.md (`Prisma.Decimal` arithmetic, `.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`)
- [x] 3.5 Add private `assertUnidadMedidaActiva(unidadMedidaId)`: `findUnique` on `UnidadMedida`; throw `BadRequestException('La unidad de medida no existe o está inactiva.')` if missing OR `activo === false`
- [x] 3.6 Add `@Injectable() ProductosService` `findAll(query)`: `page ?? 1`, `pageSize ?? 10`, `buildProductoWhere(query)`, `$transaction([findMany, count, activeCount])` returning `{ data, total, activeCount }`
- [x] 3.7 Add `findOne(id)`: `findUnique` with `PRODUCTO_SELECT`; `NotFoundException('Producto no encontrado.')` if missing
- [x] 3.8 Add `create(dto, creadoPorId)`: call `assertUnidadMedidaActiva(dto.unidadMedidaId)`; TOCTOU `descripcion` pre-check → `ConflictException`; `computePrecioVenta`; map `alicuotaIva` number→enum via `IVA_TO_ENUM`; `prisma.producto.create` with Decimal-wrapped fields, computed `precioVenta`, mapped enum, `creadoPorId` + `actualizadoPorId` both set to caller; `P2002` backstop via `isDescripcionConflict`; map result's `alicuotaIva` enum→number before returning
- [x] 3.9 Add `update(id, dto, actualizadoPorId)`: `findUnique` existence check → `NotFoundException`; call `assertUnidadMedidaActiva(dto.unidadMedidaId)` unconditionally (re-runs every update per design.md, even when unchanged); `findFirst({descripcion, NOT:{id}})` duplicate check → `ConflictException`; recompute `precioVenta`; map `alicuotaIva`; `prisma.producto.update` setting all editable fields + `activo` + `actualizadoPorId` only (never `creadoPorId`); same `P2002` backstop; map enum back to number on return

## Phase 4: Backend Module — Controller & Module Registration

- [x] 4.1 Create `server/src/productos/productos.controller.ts`: `@Controller('productos')`, class-level `@UseGuards(JwtAuthGuard)`
- [x] 4.2 Add `@Get()` → `findAll(query)` and `@Get(':id')` → `findOne(@Param('id', ParseIntPipe) id)` — no `@Get('export')`
- [x] 4.3 Add `@Post()` → `create(@Body() dto, @Request() req)` calling `create(dto, req.user.userId)`
- [x] 4.4 Add `@Patch(':id')` → `update(@Param('id', ParseIntPipe) id, @Body() dto, @Request() req)` calling `update(id, dto, req.user.userId)` — no `@Delete()` route of any kind
- [x] 4.5 Create `server/src/productos/productos.module.ts`: `controllers: [ProductosController]`, `providers: [ProductosService]`
- [x] 4.6 Modify `server/src/app.module.ts`: import and register `ProductosModule`

## Phase 5: Backend Manual Verification

- [x] 5.1 Verify all four routes return 401 without a Bearer token; verify no `DELETE` route and no `GET /productos/export` route exist
- [x] 5.2 Verify `POST /productos` computes `precioVenta = precioCompra * (1 + porcentajeGanancia/100)` (e.g. `100` + `20%` → `120`); verify a client-supplied `precioVenta` in the body is ignored and never persisted
- [x] 5.3 Verify `PATCH /productos/:id` recomputes `precioVenta` when `precioCompra`/`porcentajeGanancia` change
- [x] 5.4 Verify `alicuotaIva` accepts only `21`/`10.5`; any other value (e.g. `27`) returns a validation error on both create and update
- [x] 5.5 Verify `POST /productos` with a missing `unidadMedidaId` returns 400 and no row is created; verify with an `activo: false` `UnidadMedida` also returns 400
- [x] 5.6 Verify `PATCH /productos/:id` re-validates `unidadMedidaId` on every update, including when unchanged: deactivate a producto's current `UnidadMedida`, then confirm a subsequent `PATCH` with that same `unidadMedidaId` returns 400
- [x] 5.7 Verify duplicate `descripcion` returns 409 on both create and update (TOCTOU pre-check + `P2002` backstop); update with the row's own unchanged `descripcion` returns 200
- [x] 5.8 Verify `alertaStock`/`cantidadMinima` persist independently of each other; verify `cantidadInicial` is freely editable via `PATCH`
- [x] 5.9 Verify `POST` stamps `creadoPorId` + `actualizadoPorId` from the JWT caller; verify `PATCH` updates only `actualizadoPorId`, leaving `creadoPorId` unchanged (create as user X, patch as user Y)
- [x] 5.10 Verify `creadoPorId`/`actualizadoPorId`/`precioVenta` supplied in the request body are stripped by the global `whitelist: true` `ValidationPipe` / DTO omission and never reach the stored row
- [x] 5.11 Verify `PATCH /productos/:id` with an unknown id returns 404 and no row is modified
- [x] 5.12 Verify any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'` on all 4 routes
- [x] 5.13 Verify deleting a `User` who is a `Producto`'s `creadoPor`/`actualizadoPor` succeeds and the `Producto` row still exists with the corresponding FK now `null`
- [x] 5.14 Verify a `Producto` referencing a `UnidadMedida` blocks direct deletion of that `UnidadMedida` at the DB/FK level (e.g. via Prisma Studio or a scratch script) — confirms the restrict-like default from `units-of-measure-management`'s new requirement

## Phase 6: Frontend API Client

- [x] 6.1 Create `client/app/lib/productos.ts`: `ProductoListItem` type (all scalar fields; Decimal fields typed as `string`; `alicuotaIva: 21 | 10.5`; nested `unidadMedida: { id, descripcion }`; `creadoPor`/`actualizadoPor: { id, username } | null`), `CreateProductoPayload`, `UpdateProductoPayload` (mirroring the DTOs, no `precioVenta`), copy `handleJsonResponse<T>` verbatim from `lib/unidades-medida.ts`
- [x] 6.2 Add `ListProductosParams`, `PaginatedProductos` (`{ data, total, activeCount }`), and `listProductos(params)` (GET `/productos?…`)
- [x] 6.3 Add `getProducto(id)` (GET `/productos/:id`), `createProducto(data)` (POST), `updateProducto(id, data)` (PATCH `/productos/:id`) — each spreading `getAuthHeader()` (+ `Content-Type` on mutations), Spanish error messages reworded to "producto(s)"
- [x] 6.4 Add `searchUnidadesMedida(term)` helper (GET `/unidades-medida?search=…&status=activo&pageSize=…`, mapped to `{ id, label: descripcion }[]`) for `UnidadMedidaSelect`'s `search` prop — reuse `listUnidadesMedida` from `lib/unidades-medida.ts` rather than duplicating the fetch

## Phase 7: Frontend Unidad de Medida Searchable Select

- [x] 7.1 Create `client/app/(dashboard)/productos/UnidadMedidaSelect.tsx`: copy `vehiculos/SearchableSelect.tsx`, strip the `create`/`quickCreate` props, `QuickCreateModal` import/usage, `openQuickCreate`/`handleQuickCreateSubmit`, and the "+ Crear …" footer button entirely — keep the debounce, keyboard nav, `createPortal` panel positioning, and dismiss handling unchanged
- [x] 7.2 Wire its `search` prop to `searchUnidadesMedida` from `client/app/lib/productos.ts`; label `"Unidad de Medida"`, placeholder `"Seleccionar unidad de medida"`

## Phase 8: Frontend List Page

- [x] 8.1 Create `client/app/(dashboard)/productos/page.tsx` (`'use client'`): copy `unidades-medida/page.tsx`'s full structure, renaming `UnidadMedida`→`Producto`/`unidadesMedida`→`productos`, calling `listProductos`/`updateProducto`; preserve the 350ms debounce, `DEFAULT_STATUS_FILTER = 'activo'`, `PAGE_SIZE_OPTIONS = [10, 25, 50]` — no export button/wiring
- [x] 8.2 Preserve verbatim the fixed-position `createPortal` actions menu and the local SVG icon components
- [x] 8.3 Rework copy: header title `Productos`, subtitle, primary button `Nuevo producto`, active-count pill and empty/filtered-empty/toggle-confirm copy reworded to "producto(s)"
- [x] 8.4 Implement table columns: `#`, `Descripción`, `Unidad de Medida`, `Precio Venta`, `Alícuota IVA`, `Stock` (renders `cantidadInicial`, with a low-stock indicator when `alertaStock && cantidadInicial <= cantidadMinima`), `Estado` badge, `Acciones`; wire `<ProductoFormModal open={modalOpen} onClose={…} producto={selectedProducto} onSaved={…} />`

## Phase 9: Frontend Form Modal

- [x] 9.1 Create `client/app/(dashboard)/productos/ProductoFormModal.tsx`: copy `UnidadMedidaFormModal.tsx`'s structure (dirty-check via `lib/alerts.ts`, `initialFormRef` baseline, autofocus, `isEdit = producto !== null`), renaming imports to `createProducto`/`updateProducto`/`CreateProductoPayload`/`UpdateProductoPayload`
- [x] 9.2 Define `FormState` covering `descripcion`, `unidadMedidaId`, `cantidadInicial`, `alertaStock`, `cantidadMinima`, `precioCompra`, `porcentajeGanancia`, `precioMayorista`, `alicuotaIva`, plus `activo` (edit-only); `EMPTY_FORM` defaults (`alicuotaIva: 21`, `alertaStock: false`, `activo: true`)
- [x] 9.3 Render `<UnidadMedidaSelect>` bound to `unidadMedidaId`, passing `initialLabel={producto?.unidadMedida.descripcion}` on edit; render numeric inputs for money/quantity/percentage fields; render `alicuotaIva` as a `<select>`/radio pair (`21` / `10.5`)
- [x] 9.4 Render a read-only computed display for `precioVenta` — live-recompute client-side from current `precioCompra`/`porcentajeGanancia` form values for immediate feedback (`precioCompra * (1 + porcentajeGanancia/100)`, display-only, never submitted — server remains the source of truth per D1); render the `activo` checkbox only when `isEdit`
- [x] 9.5 Wire submit branching `isEdit ? updateProducto(producto.id, payload) : createProducto(payload)`; update copy: modal titles `Editar producto`/`Nuevo producto`, button `Crear producto`, placeholders, success/error toasts reworded — surface the backend's "unidad de medida no existe o está inactiva" 400 message directly

## Phase 10: Navigation

- [x] 10.1 Modify `client/app/lib/navigation.tsx`: add a new flat top-level `"Productos"` entry (`href: '/productos'`, `id: 'productos'`, placeholder icon reusing an existing `/icons/*.svg`) after `"Unidades de Medida"` — sibling of `"Inicio"`/`"Clientes"`, NOT nested under `"Configuraciones"`'s `children`

## Phase 11: Frontend Manual Verification

- [x] 11.1 Verify `/productos` lists productos on load filtered to `activo: true` by default; search filters by `descripcion`; status filter reveals inactive rows; pagination limits visible rows
- [x] 11.2 Verify `"Nuevo producto"` opens the modal without the `activo` checkbox; the Unidad de Medida select searches/selects correctly with no quick-create affordance visible; `precioVenta` updates live as `precioCompra`/`porcentajeGanancia` change and is not an editable input
- [x] 11.3 Verify creating a producto with an invalid `alicuotaIva` is prevented client-side (or surfaces the backend validation error cleanly) and a valid create succeeds, listing the new row with correct `precioVenta`
- [x] 11.4 Verify editing a row opens the modal pre-filled (including the selected Unidad de Medida's label), saves via `PATCH`, and toggling `activo` off flips the row's `Estado` badge to `Inactivo`
- [x] 11.5 Verify closing the modal with unsaved changes triggers the dirty-check confirm prompt
- [x] 11.6 Verify no export button is present anywhere on `/productos`
- [x] 11.7 Verify the `"Productos"` nav entry is visible for any authenticated `rol`, renders as a top-level item (not nested under `"Configuraciones"`), and links to `/productos`

Note: this headless environment cannot perform a real browser click-through (same limitation noted in PR 1 and PR 2). 11.1-11.7 were verified via code-path review of `page.tsx`/`ProductoFormModal.tsx`/`UnidadMedidaSelect.tsx` against the shipped `unidades-medida` reference implementation (structurally identical, field-for-field diffed), plus `curl` checks against the live dev server confirming `GET /productos` returns 401 unauthenticated, `DELETE /productos/1` returns 404 (no route registered), and `GET /productos/export` returns 401 (no export route — falls through to `GET /productos/:id` guard). Frontend payload shapes in `client/app/lib/productos.ts` were diffed field-for-field against `CreateProductoDto`/`UpdateProductoDto`.

## Phase 12: Documentation & Final Sign-off

- [x] 12.1 Walk `proposal.md`'s full Success Criteria checklist end-to-end and confirm each item
- [x] 12.2 Confirm the Rollback Plan steps in `proposal.md` are accurate and executable as written, respecting FK ordering (drop `Producto` + `AlicuotaIva` before touching `UnidadMedida`)
- [x] 12.3 Validate with `npm run build` in both `server/` and `client/`
