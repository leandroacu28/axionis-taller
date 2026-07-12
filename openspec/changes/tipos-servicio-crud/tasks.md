# Tasks: Tipos de Servicio CRUD (Create, List, Update)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~800-1000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (data model + backend module) → PR 2 (frontend API client + list page + modal + navigation) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

This is a **new module + new route**, so almost all of it is net-new code, not a diff against existing files. Estimate breakdown, calibrated against the closest structural precedent (`colors/`, whose actual `colors.service.ts` is 221 lines and `lib/colors.ts` is 114 lines) plus the dual-audit-relation divergence:
- `server/prisma/schema.prisma`: `TipoServicio` model + 2 `User` back-relations — ~15-20 lines
- Generated migration SQL: ~20-30 lines
- `service-types.service.ts` (findAll/exportToExcel/findOne/create/update + filter helper + P2002 helper + ExcelJS builder, plus the actor-id `update()` divergence): ~230-250 lines
- `service-types.controller.ts` (5 routes, `export` before `:id`, `@Request()` on `PATCH`): ~65-70 lines
- 4 DTO files (`create`, `update`, `list-query`, `export-query`): ~70-80 lines combined
- `service-types.module.ts`: ~10 lines
- `app.module.ts` edit: ~2 lines
- `client/app/lib/service-types.ts` (mirrors `lib/colors.ts` plus the extra `actualizadoPor` field on the type): ~120-130 lines
- `client/app/(dashboard)/tipos-servicio/page.tsx` (mirrors `colores/page.tsx`: table, filters, portal actions menu, pagination, export button, local icons): ~250-290 lines
- `client/app/(dashboard)/tipos-servicio/ServiceTypeFormModal.tsx` (mirrors `ColorFormModal.tsx`): ~130-150 lines
- `client/app/lib/navigation.tsx` edit: ~10 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + migration (`TipoServicio` model, `User` back-relations, `add_tipo_servicio` migration) | PR 1 | ~40-50 lines; foundational, must land before the backend module compiles against the Prisma Client |
| 2 | Backend `service-types` module (DTOs, service, controller, module) + `app.module.ts` registration | PR 1 | ~380-420 lines; independently verifiable via curl/Postman once migrated; combined with Unit 1 this pushes PR 1 over the 400-line budget on its own — flag for chaining or `size:exception` decision |
| 3 | `client/app/lib/service-types.ts` + `tipos-servicio/page.tsx` + `ServiceTypeFormModal.tsx` + `navigation.tsx` entry | PR 2 | ~510-580 lines; depends on PR 1's endpoints being live |

## Phase 1: Data Model & Migration

- [x] 1.1 Modify `server/prisma/schema.prisma`: add the `TipoServicio` model (`id`, `descripcion` `@unique`, `activo` `@default(true)`, `createdAt`, `updatedAt`, `creadoPorId`/`creadoPor` and `actualizadoPorId`/`actualizadoPor` nullable FKs with `onDelete: SetNull`, relation names `"TipoServicioCreadoPor"`/`"TipoServicioActualizadoPor"`)
- [x] 1.2 Modify `server/prisma/schema.prisma`: add `tiposServicioCreados TipoServicio[] @relation("TipoServicioCreadoPor")` and `tiposServicioActualizados TipoServicio[] @relation("TipoServicioActualizadoPor")` back-relations on `User`
- [x] 1.3 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before migrating (per the proposal's Known Gaps — unverified in prior phases)
- [x] 1.4 Run `npx prisma migrate dev --name add_tipo_servicio` in `server/` to generate the additive migration and regenerate the Prisma Client (`TipoServicio` delegate + new `User` back-relations)

## Phase 2: Backend Module — DTOs

- [x] 2.1 Create `server/src/service-types/dto/create-service-type.dto.ts`: `CreateServiceTypeDto` (`descripcion` `@IsString @IsNotEmpty`, `activo` `@IsOptional @IsBoolean`)
- [x] 2.2 Create `server/src/service-types/dto/update-service-type.dto.ts`: `UpdateServiceTypeDto` — same full field set as create (no `PartialType`), mirroring `update-color.dto.ts`'s convention
- [x] 2.3 Create `server/src/service-types/dto/list-service-types-query.dto.ts`: `ServiceTypeStatusFilter` type + `ListServiceTypesQueryDto` (`page`/`pageSize` via `@Type(() => Number) @IsInt @Min(1)`, `search` optional string, `status` `@IsIn(['all','activo','inactivo'])` default `'all'`)
- [x] 2.4 Create `server/src/service-types/dto/export-service-types-query.dto.ts`: `ExportServiceTypesQueryDto` (`search` optional, `status` reusing `ServiceTypeStatusFilter`)

## Phase 3: Backend Module — Service

- [x] 3.1 Create `server/src/service-types/service-types.service.ts`: `SERVICE_TYPE_SELECT` whitelist (four-field `creadoPor`/`actualizadoPor` shape `{ id, username, nombre, apellido }`), `DUPLICATE_DESCRIPCION_ERROR` constant, `ServiceTypeFilter` type
- [x] 3.2 Add module-level `buildServiceTypeWhere(filter)` — copy `buildColorWhere` verbatim, renamed and retyped to `Prisma.TipoServicioWhereInput`, keeping the MySQL collation comment
- [x] 3.3 Add module-level `isDescripcionConflict(error)` — copy verbatim from `colors.service.ts` (guards `PrismaClientKnownRequestError` + `P2002` + `target` includes `descripcion`, both `string`/`string[]` shapes)
- [x] 3.4 Add module-level `ServiceTypeRow` type, `creadoPorLabel()`, and `buildServiceTypesExcel(rows)` — mirror `buildColorsExcel`, sheet name `'Tipos de servicio'`, same 4 columns (`Descripción` 32, `Creado por` 24, `Fecha de creación` 22, `Estado` 12), same rose header fill `FFF43F5E` + white bold font
- [x] 3.5 Add `@Injectable() ServiceTypesService` with `findAll(query)`: `page ?? 1`, `pageSize ?? 10`, `buildServiceTypeWhere(query)`, `$transaction([findMany, count, activeCount])` returning `{ data, total, activeCount }` — verbatim from `colors.findAll`, `prisma.color` → `prisma.tipoServicio`
- [x] 3.6 Add `exportToExcel(filter)`: `buildServiceTypeWhere(filter)` → single unpaginated `findMany` → `buildServiceTypesExcel(rows)`
- [x] 3.7 Add `findOne(id)`: `findUnique` with `SERVICE_TYPE_SELECT`; `NotFoundException('Tipo de servicio no encontrado.')` if missing
- [x] 3.8 Add `create(dto, creadoPorId)`: TOCTOU pre-check via `findUnique({ descripcion })` → `ConflictException`, then `prisma.tipoServicio.create` with **both** `creadoPorId` and `actualizadoPorId` set to the caller, `try/catch` `P2002` backstop
- [x] 3.9 Add `update(id, dto, actualizadoPorId)` — **critical divergence, do not copy `colors.service.update()` (no actor param)**: `findUnique` existence check → `NotFoundException`, `findFirst({ descripcion, NOT: { id } })` duplicate check → `ConflictException`, `prisma.tipoServicio.update` setting `descripcion`/`activo`/`actualizadoPorId` only (never touching `creadoPorId`), same `P2002` backstop — follow `customers.service.update()`'s actor-id pattern

## Phase 4: Backend Module — Controller & Module Registration

- [x] 4.1 Create `server/src/service-types/service-types.controller.ts`: `@Controller('service-types')`, class-level `@UseGuards(JwtAuthGuard)`
- [x] 4.2 Add `@Get()` → `findAll(query)`
- [x] 4.3 **Route order constraint (critical, do not get wrong)**: add `@Get('export')` immediately after `@Get()` and **before** `@Get(':id')`, with `@Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')` and `@Header('Content-Disposition', 'attachment; filename="tipos-servicio.xlsx"')`, returning `new StreamableFile(buffer)` — declaring `:id` first would let `ParseIntPipe` capture and reject `GET /service-types/export`
- [x] 4.4 Add `@Get(':id')` → `findOne(@Param('id', ParseIntPipe) id)`
- [x] 4.5 Add `@Post()` → `create(@Body() dto, @Request() req)` calling `create(dto, req.user.userId)`
- [x] 4.6 Add `@Patch(':id')` → `update(@Param('id', ParseIntPipe) id, @Body() dto, @Request() req)` calling `update(id, dto, req.user.userId)` — **must inject `@Request()`, unlike `colors.controller.ts`'s `PATCH`, which has no updater to stamp**
- [x] 4.7 Create `server/src/service-types/service-types.module.ts`: `controllers: [ServiceTypesController]`, `providers: [ServiceTypesService]`
- [x] 4.8 Modify `server/src/app.module.ts`: import and register `ServiceTypesModule`

## Phase 5: Backend Manual Verification

- [x] 5.1 Verify `GET /service-types`, `GET /service-types/export`, `GET /service-types/:id`, `POST /service-types`, `PATCH /service-types/:id` all return 401 without a Bearer token
- [x] 5.2 Verify `POST /service-types` with a duplicate `descripcion` returns 409, no row created (TOCTOU pre-check + `P2002` backstop)
- [x] 5.3 Verify `PATCH /service-types/:id` with another tipo de servicio's `descripcion` returns 409 and does not modify the row; `PATCH` with the row's own unchanged `descripcion` returns 200
- [x] 5.4 Verify `POST /service-types` stamps both `creadoPorId` and `actualizadoPorId` from the JWT caller; verify `creadoPorId` is immutable after creation (create as user X, `PATCH` as user Y → `creadoPor` still X, `actualizadoPor` now Y)
- [x] 5.5 Verify a `creadoPorId`/`actualizadoPorId` value supplied in the request body is stripped by the global `whitelist: true` `ValidationPipe` and never reaches the stored row
- [x] 5.6 Verify `PATCH /service-types/:id` with an unknown id returns 404 and no row is modified
- [x] 5.7 Verify `GET /service-types/export` returns 200 with an `.xlsx` body (`Content-Type`/`Content-Disposition` headers match the design), containing every matching row across all pages, not just one page; confirm `GET /service-types/export` is not shadowed by `:id` (returns the file, not a 400 from `ParseIntPipe`)
- [x] 5.8 Verify no `DELETE /service-types` or `DELETE /service-types/:id` route exists; verify any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'` on all 5 routes
- [x] 5.9 Verify deleting a `User` who is a `TipoServicio`'s `creadoPor`/`actualizadoPor` succeeds (not blocked) and the `TipoServicio` row still exists afterward with the corresponding FK now `null`

## Phase 6: Frontend API Client

- [x] 6.1 Create `client/app/lib/service-types.ts`: `ServiceTypeListItem` (incl. both `creadoPor`/`actualizadoPor` as `{ id, username, nombre, apellido } | null`), `CreateServiceTypePayload`, `UpdateServiceTypePayload`, copy `handleJsonResponse<T>` verbatim from `lib/colors.ts`
- [x] 6.2 Add `ListServiceTypesParams`, `PaginatedServiceTypes` (`{ data, total, activeCount }`), and `listServiceTypes(params)` (GET `/service-types?…`)
- [x] 6.3 Add `getServiceType(id)` (GET `/service-types/:id`), `createServiceType(data)` (POST), `updateServiceType(id, data)` (PATCH `/service-types/:id`) — each spreading `getAuthHeader()` (+ `Content-Type` on mutations), Spanish fallback error messages per the design's table
- [x] 6.4 Add `ExportServiceTypesParams` and `exportServiceTypes(params)` — mirror `exportColors`'s defensive non-JSON error branch, `res.blob()` on success, `GET /service-types/export?…`

## Phase 7: Frontend List Page

- [x] 7.1 Create `client/app/(dashboard)/tipos-servicio/page.tsx` (`'use client'`): copy `ColoresPage`'s full structure, renaming `Color`→`ServiceType`/`colors`→`serviceTypes`, calling `listServiceTypes`/`updateServiceType`/`exportServiceTypes`; preserve the 350ms debounce (`searchInput`→`search`), `DEFAULT_STATUS_FILTER = 'activo'`, `PAGE_SIZE_OPTIONS = [10, 25, 50]`
- [x] 7.2 Preserve verbatim the fixed-position `createPortal` actions menu (`MENU_WIDTH = 160`, upward-flip logic, click-outside/scroll/resize close) and the local SVG icon components (`PencilIcon`, `CheckCircleIcon`, `NoSymbolIcon`, `SearchIcon`, `ExcelFileIcon`)
- [x] 7.3 Rework copy: header title `Tipos de Servicio`, subtitle, primary button `Nuevo tipo de servicio`, export filename `tipos-servicio.xlsx`, active-count pill and empty/filtered-empty/toggle-confirm copy reworded to "tipo(s) de servicio"
- [x] 7.4 Implement table columns identical to colors: `#`, `Descripción`, `Creación` (renders `creadoPor` nombre/apellido→username + `createdAt` timestamp), `Estado` badge, `Acciones`; wire `<ServiceTypeFormModal open={modalOpen} onClose={…} serviceType={selectedServiceType} onSaved={…} />`

## Phase 8: Frontend Form Modal

- [x] 8.1 Create `client/app/(dashboard)/tipos-servicio/ServiceTypeFormModal.tsx`: copy `ColorFormModal.tsx` verbatim, renaming the prop `color`→`serviceType` (type `ServiceTypeListItem | null`) and imports to `createServiceType`/`updateServiceType`/`CreateServiceTypePayload`/`UpdateServiceTypePayload`
- [x] 8.2 Preserve `FormState = { descripcion, activo }`, `EMPTY_FORM = { descripcion: '', activo: true }`, `isFormDirty` shallow-compare, `initialFormRef` baseline, `descripcionRef` autofocus, `isEdit = serviceType !== null`, and the `showConfirm` dirty-check on close (via `lib/alerts.ts`)
- [x] 8.3 Render the `activo` checkbox **only when `isEdit`**; wire submit branching `isEdit ? updateServiceType(serviceType.id, payload) : createServiceType(payload)`; update copy: modal titles `Editar tipo de servicio`/`Nuevo tipo de servicio`, button `Crear tipo de servicio`, placeholder `Ej: Cambio de aceite`, success/error toasts reworded

## Phase 9: Navigation

- [x] 9.1 Modify `client/app/lib/navigation.tsx`: add a new **flat top-level** "Tipos de Servicio" entry (`href: '/tipos-servicio'`, `id: 'tipos-servicio'`, placeholder `/icons/usuarios.svg` icon) after "Vehículos" — sibling of "Inicio"/"Clientes", NOT nested under "Configuraciones"'s `children`

## Phase 10: Frontend Manual Verification

- [x] 10.1 Verify `/tipos-servicio` lists service types on load, filtered to `activo: true` by default; search filters by `descripcion`; status filter reveals inactive rows; pagination limits visible rows — verified live in a real browser (Playwright-driven Chromium against the running dev servers): list, default "Activos" filter, and pagination all render correctly
- [x] 10.2 Verify "Nuevo tipo de servicio" opens the modal without the `activo` checkbox, creates successfully, and the new row's "Creación" column renders the creating user — verified live: modal has no `activo` checkbox on create, row appears immediately with `creadoPor` username and timestamp, success toast shown
- [x] 10.3 Verify editing a row opens the modal pre-filled with the `activo` checkbox visible, saves via `PATCH`, and toggling `activo` off flips the row's "Estado" badge to "Inactivo" — verified live. Correction to this task's original wording: the table's "Creación" column only ever displays `creadoPor` (matching `colores/page.tsx`'s single-audit-column design, per `design.md`); `actualizadoPor` is persisted server-side (confirmed in the backend PR's manual verification) but is **not surfaced anywhere in this UI**. Flagging this as a product-expectation gap for the user to confirm, not a code defect — the implementation matches its own design doc.
- [x] 10.4 Verify closing the modal with unsaved changes triggers the `showConfirm` dirty-check prompt; discarding closes without saving, cancelling keeps the form open with edits intact — verified live: SweetAlert2 "Descartar cambios" dialog appears with "Cancelar"/"Sí, descartar" as expected
- [x] 10.5 Verify the export button downloads `tipos-servicio.xlsx` reflecting the current `search`/`statusFilter`, and the file's `Content-Type` is the `.xlsx` MIME type (not JSON) — verified live: downloaded file is a valid `.xlsx` (zip magic bytes `504b0304`), non-empty
- [x] 10.6 Verify the "Tipos de Servicio" nav entry is visible for any authenticated `rol`, renders as a top-level item (not nested under "Configuraciones"), and links to `/tipos-servicio` — verified live: entry appears in the header/nav immediately after login, correct `href`

## Phase 11: Documentation & Final Sign-off

- [x] 11.1 Walk `proposal.md`'s full Success Criteria checklist end-to-end and confirm each item (401 without token, 409 duplicate `descripcion` create+update, dual audit stamping correctness, FK-null-on-user-delete, frontend list/create/edit/export behavior, nav entry visibility, additive migration) — backend criteria verified in Phase 5 (prior PR); frontend criteria verified by code review + `next build` typecheck AND a live Playwright-driven Chromium click-through against the running dev servers (login, list, create, edit + `activo` toggle, dirty-check confirm, export download, nav visibility) — see Phase 10 notes for detail
- [x] 11.2 Confirm the Rollback Plan steps in `proposal.md` are accurate and executable as written (migration revert, module removal, back-relation removal, frontend route/nav removal) — verified: `client/app/(dashboard)/tipos-servicio/`, `client/app/lib/service-types.ts`, and the nav entry in `client/app/lib/navigation.tsx` are the only frontend additions/touches, matching the rollback plan exactly
