# Tasks: Unidades de Medida CRUD (Create, List, Update)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (data model + backend module) → PR 2 (frontend API client + list page + modal + navigation) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

This is a net-new module + net-new route, same shape as `tipos-servicio-crud` minus export. Estimate is the `service-types` precedent (~800-1000 lines) with export-only pieces subtracted (export DTO, `exportToExcel`/Excel-builder helper, export route, export client function, export button/icon):
- `server/prisma/schema.prisma`: `UnidadMedida` model + 2 `User` back-relations — ~15-20 lines
- Generated migration SQL: ~20-30 lines
- `unidades-medida.service.ts` (findAll/findOne/create/update + `buildUnidadMedidaWhere` + `isDescripcionConflict`, no ExcelJS): ~150-170 lines
- `unidades-medida.controller.ts` (4 routes, no export, `@Request()` on POST/PATCH): ~50-55 lines
- 3 DTO files (`create`, `update`, `list-query`, no export DTO): ~55-60 lines combined
- `unidades-medida.module.ts`: ~10 lines
- `app.module.ts` edit: ~2 lines
- `client/app/lib/unidades-medida.ts` (no export function): ~90-100 lines
- `client/app/(dashboard)/unidades-medida/page.tsx` (no export button/`ExcelFileIcon`): ~210-250 lines
- `client/app/(dashboard)/unidades-medida/UnidadMedidaFormModal.tsx`: ~130-150 lines
- `client/app/lib/navigation.tsx` edit: ~10 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + migration (`UnidadMedida` model, `User` back-relations, `add_unidad_medida` migration) + backend `unidades-medida` module (DTOs, service, controller, module) + `app.module.ts` registration | PR 1 | ~330-370 lines; foundational, independently verifiable via curl/Postman once migrated |
| 2 | `client/app/lib/unidades-medida.ts` + `unidades-medida/page.tsx` + `UnidadMedidaFormModal.tsx` + `navigation.tsx` entry | PR 2 | ~440-500 lines; depends on PR 1's endpoints being live; still over budget alone — consider further stacking (lib+nav vs. page+modal) or `size:exception` if reviewer wants a stricter split |

## Phase 1: Data Model & Migration

- [x] 1.1 Modify `server/prisma/schema.prisma`: add the `UnidadMedida` model (`id`, `descripcion` `@unique`, `activo` `@default(true)`, `createdAt`, `updatedAt`, `creadoPorId`/`creadoPor` and `actualizadoPorId`/`actualizadoPor` nullable FKs with `onDelete: SetNull`, relation names `"UnidadMedidaCreadoPor"`/`"UnidadMedidaActualizadoPor"`)
- [x] 1.2 Modify `server/prisma/schema.prisma`: add `unidadesMedidaCreadas UnidadMedida[] @relation("UnidadMedidaCreadoPor")` and `unidadesMedidaActualizadas UnidadMedida[] @relation("UnidadMedidaActualizadoPor")` back-relations on `User`
- [x] 1.3 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before migrating
- [x] 1.4 Run `npx prisma migrate dev --name add_unidad_medida` in `server/` to generate the additive migration and regenerate the Prisma Client (`UnidadMedida` delegate + new `User` back-relations)

## Phase 2: Backend Module — DTOs

- [x] 2.1 Create `server/src/unidades-medida/dto/create-unidad-medida.dto.ts`: `CreateUnidadMedidaDto` (`descripcion` `@IsString @IsNotEmpty @MaxLength(191)`, `activo` `@IsOptional @IsBoolean`)
- [x] 2.2 Create `server/src/unidades-medida/dto/update-unidad-medida.dto.ts`: `UpdateUnidadMedidaDto` — same full field set as create (no `PartialType`)
- [x] 2.3 Create `server/src/unidades-medida/dto/list-unidades-medida-query.dto.ts`: `UnidadMedidaStatusFilter` type + `ListUnidadesMedidaQueryDto` (`page`/`pageSize` via `@Type(() => Number) @IsInt @Min(1)`, `pageSize` `@Max(100)`, `search` optional string, `status` `@IsIn(['all','activo','inactivo'])` default `'all'`)

## Phase 3: Backend Module — Service

- [x] 3.1 Create `server/src/unidades-medida/unidades-medida.service.ts`: `UNIDAD_MEDIDA_SELECT` whitelist (four-field `creadoPor`/`actualizadoPor` shape `{ id, username, nombre, apellido }`), `DUPLICATE_DESCRIPCION_ERROR = 'Ya existe una unidad de medida con esa descripción.'`, `UnidadMedidaFilter` type — **no ExcelJS, no export helpers**
- [x] 3.2 Add module-level `buildUnidadMedidaWhere(filter)` — mirror `buildServiceTypeWhere`, retyped to `Prisma.UnidadMedidaWhereInput`, keeping the MySQL collation comment
- [x] 3.3 Add module-level `isDescripcionConflict(error)` — copy verbatim from `service-types.service.ts` (guards `PrismaClientKnownRequestError` + `P2002` + `target` includes `descripcion`)
- [x] 3.4 Add `@Injectable() UnidadesMedidaService` with `findAll(query)`: `page ?? 1`, `pageSize ?? 10`, `buildUnidadMedidaWhere(query)`, `$transaction([findMany, count, activeCount])` returning `{ data, total, activeCount }`
- [x] 3.5 Add `findOne(id)`: `findUnique` with `UNIDAD_MEDIDA_SELECT`; `NotFoundException('Unidad de medida no encontrada.')` if missing
- [x] 3.6 Add `create(dto, creadoPorId)`: TOCTOU pre-check via `findUnique({ descripcion })` → `ConflictException`, then `prisma.unidadMedida.create` with **both** `creadoPorId` and `actualizadoPorId` set to the caller, `try/catch` `P2002` backstop
- [x] 3.7 Add `update(id, dto, actualizadoPorId)` — **critical divergence, must take actor id, do not write a parameterless `update`**: `findUnique` existence check → `NotFoundException`, `findFirst({ descripcion, NOT: { id } })` duplicate check → `ConflictException`, `prisma.unidadMedida.update` setting `descripcion`/`activo`/`actualizadoPorId` only (never touching `creadoPorId`), same `P2002` backstop

## Phase 4: Backend Module — Controller & Module Registration

- [x] 4.1 Create `server/src/unidades-medida/unidades-medida.controller.ts`: `@Controller('unidades-medida')`, class-level `@UseGuards(JwtAuthGuard)`
- [x] 4.2 Add `@Get()` → `findAll(query)` and `@Get(':id')` → `findOne(@Param('id', ParseIntPipe) id)` — **no `@Get('export')`**
- [x] 4.3 Add `@Post()` → `create(@Body() dto, @Request() req)` calling `create(dto, req.user.userId)`
- [x] 4.4 Add `@Patch(':id')` → `update(@Param('id', ParseIntPipe) id, @Body() dto, @Request() req)` calling `update(id, dto, req.user.userId)` — **no `@Delete()` route of any kind**
- [x] 4.5 Create `server/src/unidades-medida/unidades-medida.module.ts`: `controllers: [UnidadesMedidaController]`, `providers: [UnidadesMedidaService]`
- [x] 4.6 Modify `server/src/app.module.ts`: import and register `UnidadesMedidaModule`

## Phase 5: Backend Manual Verification

- [x] 5.1 Verify `GET /unidades-medida`, `GET /unidades-medida/:id`, `POST /unidades-medida`, `PATCH /unidades-medida/:id` all return 401 without a Bearer token; verify no `DELETE` route and no `GET /unidades-medida/export` route exist (404/405)
- [x] 5.2 Verify `POST /unidades-medida` with a duplicate `descripcion` returns 409, no row created (TOCTOU pre-check + `P2002` backstop)
- [x] 5.3 Verify `PATCH /unidades-medida/:id` with another unidad's `descripcion` returns 409 and does not modify the row; `PATCH` with the row's own unchanged `descripcion` returns 200
- [x] 5.4 Verify `POST /unidades-medida` stamps both `creadoPorId` and `actualizadoPorId` from the JWT caller; verify `creadoPorId` is immutable after creation (create as user X, `PATCH` as user Y → `creadoPor` still X, `actualizadoPor` now Y)
- [x] 5.5 Verify a `creadoPorId`/`actualizadoPorId` value supplied in the request body is stripped by the global `whitelist: true` `ValidationPipe` and never reaches the stored row
- [x] 5.6 Verify `PATCH /unidades-medida/:id` with an unknown id returns 404 and no row is modified
- [x] 5.7 Verify any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'` on all 4 routes
- [x] 5.8 Verify deleting a `User` who is a `UnidadMedida`'s `creadoPor`/`actualizadoPor` succeeds (not blocked) and the `UnidadMedida` row still exists afterward with the corresponding FK now `null`

## Phase 6: Frontend API Client

- [ ] 6.1 Create `client/app/lib/unidades-medida.ts`: `UnidadMedidaListItem` (incl. both `creadoPor`/`actualizadoPor` as `{ id, username, nombre, apellido } | null`), `CreateUnidadMedidaPayload`, `UpdateUnidadMedidaPayload`, copy `handleJsonResponse<T>` verbatim from `lib/service-types.ts` — **no export types, no export function**
- [ ] 6.2 Add `ListUnidadesMedidaParams`, `PaginatedUnidadesMedida` (`{ data, total, activeCount }`), and `listUnidadesMedida(params)` (GET `/unidades-medida?…`)
- [ ] 6.3 Add `getUnidadMedida(id)` (GET `/unidades-medida/:id`), `createUnidadMedida(data)` (POST), `updateUnidadMedida(id, data)` (PATCH `/unidades-medida/:id`) — each spreading `getAuthHeader()` (+ `Content-Type` on mutations), Spanish fallback error messages reworded to "unidad(es) de medida"

## Phase 7: Frontend List Page

- [ ] 7.1 Create `client/app/(dashboard)/unidades-medida/page.tsx` (`'use client'`): copy `tipos-servicio/page.tsx`'s full structure, renaming `ServiceType`→`UnidadMedida`/`serviceTypes`→`unidadesMedida`, calling `listUnidadesMedida`/`updateUnidadMedida`; preserve the 350ms debounce, `DEFAULT_STATUS_FILTER = 'activo'`, `PAGE_SIZE_OPTIONS = [10, 25, 50]` — **remove the export button, `ExcelFileIcon`, and `exportUnidadesMedida` wiring entirely**
- [ ] 7.2 Preserve verbatim the fixed-position `createPortal` actions menu (`MENU_WIDTH = 160`, upward-flip logic, click-outside/scroll/resize close) and the remaining local SVG icon components (`PencilIcon`, `CheckCircleIcon`, `NoSymbolIcon`, `SearchIcon`)
- [ ] 7.3 Rework copy: header title `Unidades de Medida`, subtitle, primary button `Nueva unidad de medida`, active-count pill and empty/filtered-empty/toggle-confirm copy reworded to "unidad(es) de medida"
- [ ] 7.4 Implement table columns: `#`, `Descripción`, `Creación` (renders `creadoPor` nombre/apellido→username + `createdAt` timestamp), `Estado` badge, `Acciones`; wire `<UnidadMedidaFormModal open={modalOpen} onClose={…} unidadMedida={selectedUnidadMedida} onSaved={…} />`

## Phase 8: Frontend Form Modal

- [ ] 8.1 Create `client/app/(dashboard)/unidades-medida/UnidadMedidaFormModal.tsx`: copy `ServiceTypeFormModal.tsx` verbatim, renaming the prop `serviceType`→`unidadMedida` (type `UnidadMedidaListItem | null`) and imports to `createUnidadMedida`/`updateUnidadMedida`/`CreateUnidadMedidaPayload`/`UpdateUnidadMedidaPayload`
- [ ] 8.2 Preserve `FormState = { descripcion, activo }`, `EMPTY_FORM = { descripcion: '', activo: true }`, `isFormDirty` shallow-compare, `initialFormRef` baseline, `descripcionRef` autofocus, `isEdit = unidadMedida !== null`, and the `showConfirm` dirty-check on close (via `lib/alerts.ts`)
- [ ] 8.3 Render the `activo` checkbox **only when `isEdit`**; wire submit branching `isEdit ? updateUnidadMedida(unidadMedida.id, payload) : createUnidadMedida(payload)`; update copy: modal titles `Editar unidad de medida`/`Nueva unidad de medida`, button `Crear unidad de medida`, placeholder `Ej: Litro`, success/error toasts reworded

## Phase 9: Navigation

- [ ] 9.1 Modify `client/app/lib/navigation.tsx`: add a new **flat top-level** "Unidades de Medida" entry (`href: '/unidades-medida'`, `id: 'unidades-medida'`, placeholder `/icons/configuraciones.svg` icon) after "Tipos de Servicio" — sibling of "Inicio"/"Clientes", NOT nested under "Configuraciones"'s `children`

## Phase 10: Frontend Manual Verification

- [ ] 10.1 Verify `/unidades-medida` lists units on load, filtered to `activo: true` by default; search filters by `descripcion`; status filter reveals inactive rows; pagination limits visible rows
- [ ] 10.2 Verify "Nueva unidad de medida" opens the modal without the `activo` checkbox, creates successfully, and the new row's "Creación" column renders the creating user
- [ ] 10.3 Verify editing a row opens the modal pre-filled with the `activo` checkbox visible, saves via `PATCH`, and toggling `activo` off flips the row's "Estado" badge to "Inactivo"
- [ ] 10.4 Verify closing the modal with unsaved changes triggers the `showConfirm` dirty-check prompt; discarding closes without saving, cancelling keeps the form open with edits intact
- [ ] 10.5 Verify no export button is present anywhere on `/unidades-medida`
- [ ] 10.6 Verify the "Unidades de Medida" nav entry is visible for any authenticated `rol`, renders as a top-level item (not nested under "Configuraciones"), and links to `/unidades-medida`

## Phase 11: Documentation & Final Sign-off

- [ ] 11.1 Walk `proposal.md`'s full Success Criteria checklist end-to-end and confirm each item (401 without token, no `DELETE`/no `/export`, 409 duplicate `descripcion` create+update, dual audit stamping correctness, FK-null-on-user-delete, frontend list/create/edit behavior, nav entry visibility, additive migration)
- [ ] 11.2 Confirm the Rollback Plan steps in `proposal.md` are accurate and executable as written (migration revert, module removal, back-relation removal, frontend route/nav removal)
- [ ] 11.3 Validate with `npm run build` in both `server/` and `client/`
