# Tasks: Orden de Servicio (Work Order intake)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400-1700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema + backend module) → PR 2 (shared endpoint extensions) → PR 3 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Resolved — chained PRs, stacked-to-main
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

This is a **new module + new top-level route**, so most of it is net-new code. Estimate breakdown, calibrated against `etiquetas/` (closest structural precedent) and the extra transaction/guard complexity design.md adds:
- `schema.prisma` (2 enums + `OrdenServicio` model + 6 back-relations across 4 models): ~50-60 lines
- Migration SQL: ~60-90 lines
- `ordenes-servicio.service.ts` (`findAll`/`findOne`/`create`/`update`, 3 guards, `$transaction`, `SELECT`/`formatNumero` constants): ~230-260 lines
- `ordenes-servicio.controller.ts` (4 routes, `@Request()` on POST/PATCH): ~55-65 lines
- 3 DTOs: ~90-100 lines combined
- `ordenes-servicio.module.ts` + `app.module.ts` edit: ~15 lines
- `vehicles` extension (DTO + service `where` + client lib): ~20-25 lines
- `users` extension (new DTO + controller + service + client lib): ~70-90 lines
- `client/app/lib/ordenes-servicio.ts`: ~140-160 lines
- `client/app/(dashboard)/ordenes-servicio/page.tsx`: ~260-300 lines
- `OrdenServicioForm.tsx` (cascading select + multi-select + two enums): ~220-260 lines
- `nuevo/page.tsx` + `editar/[id]/page.tsx`: ~80-100 lines combined
- `TipoServicioMultiSelect.tsx` (copy of `EtiquetasMultiSelect.tsx`): ~90-110 lines
- `SearchableSelect.tsx` (optional `quickCreate`) + `referenceSelectConfigs.tsx` (`mecanicoSelectConfig`): ~20-30 lines
- `navigation.tsx` edit: ~10 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + migration + full `ordenes-servicio` backend module (DTOs, service, controller, module, `app.module.ts` registration) | PR 1 | ~500-570 lines; foundational, independently curl/Postman-verifiable once migrated; already over the 400-line budget alone — flag for chaining/`size:exception` decision |
| 2 | `GET /vehicles?clienteId` + `GET /users?search&status` extensions (DTOs, service, controller, client libs) | PR 2 | ~90-115 lines; depends on PR 1 only for shared conventions, not code — could ship independently or bundled with PR 1 if the team prefers fewer PRs |
| 3 | Frontend: `lib/ordenes-servicio.ts`, `SearchableSelect`/`referenceSelectConfigs` extension, `TipoServicioMultiSelect`, `OrdenServicioForm`, list/nuevo/editar pages, nav entry | PR 3 | ~820-940 lines; depends on PR 1 + PR 2 endpoints being live; itself worth splitting further (form+pickers vs. pages) if the reviewer wants smaller diffs |

## Phase 1: Schema & Migration

- [x] 1.1 Modify `server/prisma/schema.prisma`: add `Prioridad` (`normal | alta | urgente`) and `Estado` (`pendiente | en_proceso | terminado`) enums — no `@map`, no codec (design.md § Data Model / Enums)
- [x] 1.2 Modify `server/prisma/schema.prisma`: add the `OrdenServicio` model exactly as specified in design.md § `OrdenServicio` model (id, `numero String? @unique`, `fechaIngreso`, `kilometros`, `prioridad`, `motivoIngreso @db.Text`, `estado`, required `clienteId`/`vehiculoId`/`mecanicoId` FKs, `tiposServicio TipoServicio[]`, nullable `creadoPorId`/`actualizadoPorId` `SetNull` audit FKs, `createdAt`/`updatedAt`)
- [x] 1.3 Modify `server/prisma/schema.prisma`: add the three `User` back-relations (`ordenesServicioAsignadas`, `ordenesServicioCreadas`, `ordenesServicioActualizadas`) and the single back-relations on `Cliente`, `Vehiculo`, `TipoServicio` per design.md § Data Model / Back-relations
- [x] 1.4 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before migrating (per proposal Known Gaps / design.md Open Questions)
- [x] 1.5 Run `npx prisma migrate dev --name add_orden_servicio` in `server/` to generate the additive migration (new table, both enums, `_OrdenServicioToTipoServicio` join table) and regenerate the Prisma Client

## Phase 2: Backend — `ordenes-servicio` Module

- [x] 2.1 Create `server/src/ordenes-servicio/dto/create-orden-servicio.dto.ts`: `CreateOrdenServicioDto` with the exact field/validator set in design.md § DTO fields (`fechaIngreso?`, `kilometros`, `prioridad?`, `motivoIngreso`, `estado?`, `clienteId`, `vehiculoId`, `mecanicoId`, `tipoServicioIds: number[]` with `@ArrayMinSize(1)`)
- [x] 2.2 Create `server/src/ordenes-servicio/dto/update-orden-servicio.dto.ts`: `UpdateOrdenServicioDto` — identical field set to create (house pattern, no `PartialType`); neither DTO carries `numero`/`creadoPorId`/`actualizadoPorId`
- [x] 2.3 Create `server/src/ordenes-servicio/dto/list-ordenes-servicio-query.dto.ts`: `EstadoFilter` type + `ListOrdenesServicioQueryDto` (`page`/`pageSize`, `search?` matching `numero`/`cliente.razonSocial`/`marca.marca`/`marca.modelo`, `estado?: 'all' | 'pendiente' | 'en_proceso' | 'terminado'`) per design.md § `list-ordenes-servicio-query.dto.ts`
- [x] 2.4 Create `server/src/ordenes-servicio/ordenes-servicio.service.ts`: add `ORDEN_SERVICIO_SELECT` and `formatNumero(id)` module-level constants verbatim from design.md § Service
- [x] 2.5 Add the three private guards to the service — `assertVehiculoPerteneceACliente`, `assertTiposServicioActivos` (min-1 + activo check), `assertMecanicoActivo` — verbatim from design.md § Guards
- [x] 2.6 Add `findAll(query)` — paginated/filtered list using `ORDEN_SERVICIO_SELECT`, per-`estado` counts (mirrors `etiquetas.findAll`'s `$transaction([findMany, count, ...])` shape, reframed per D2/design.md § `list-ordenes-servicio-query.dto.ts`)
- [x] 2.7 Add `findOne(id)` — `findUnique` with `ORDEN_SERVICIO_SELECT`; `NotFoundException('Orden de servicio no encontrada.')` if missing
- [x] 2.8 Add `create(dto, creadoPorId)` — run the three guards, then the single interactive `$transaction` (create → `numero` back-fill → `vehiculo.kilometraje` update) exactly as coded in design.md § `create` (the odometer + numero transaction shape)
- [x] 2.9 Add `update(id, dto, actualizadoPorId)` — same three guards, existence pre-check (`NotFoundException`), single `$transaction` updating the order (`tiposServicio: { set: … }`, stamps `actualizadoPorId` only, never touches `numero`) then re-syncs `vehiculo.kilometraje`, per design.md § `update`
- [x] 2.10 Create `server/src/ordenes-servicio/ordenes-servicio.controller.ts`: `@Controller('ordenes-servicio')`, class-level `@UseGuards(JwtAuthGuard)`, routes `GET /`, `GET /:id`, `POST /`, `PATCH /:id` (no `export`, no `DELETE`); `POST`/`PATCH` inject `@Request()` and pass `req.user.userId` per design.md § Backend Module Structure
- [x] 2.11 Create `server/src/ordenes-servicio/ordenes-servicio.module.ts`: `controllers: [OrdenesServicioController]`, `providers: [OrdenesServicioService]`
- [x] 2.12 Modify `server/src/app.module.ts`: import and register `OrdenesServicioModule`

## Phase 3: Backend — Shared Endpoint Extensions

- [x] 3.1 Modify `server/src/vehicles/dto/list-vehicles-query.dto.ts`: add optional `clienteId` (`@IsOptional() @Type(() => Number) @IsInt()`) per design.md § `GET /vehicles?clienteId=`
- [x] 3.2 Modify `server/src/vehicles/vehicles.service.ts`: add `clienteId?: number` to `VehicleFilter`, fold it into `buildVehicleWhere`'s `searchWhere` so it scopes both the list `where` and `activeCount`, per design.md § `GET /vehicles?clienteId=`
- [x] 3.3 Modify `client/app/lib/vehicles.ts`: add `clienteId?` to `ListVehiclesParams`, thread it into `listVehicles`'s query string
- [x] 3.4 Create `server/src/users/dto/list-users-query.dto.ts`: `search?` + `status?: 'all' | 'activo' | 'inactivo'`, mirroring `ListEtiquetasQueryDto` minus pagination, per design.md § `GET /users?search=&status=`
- [x] 3.5 Modify `server/src/users/users.controller.ts`: `findAll` gains `@Query() query: ListUsersQueryDto`
- [x] 3.6 Modify `server/src/users/users.service.ts`: `findAll(query?)` builds `where` from `search` (`OR`/`contains` on `username`/`nombre`/`apellido`) + `status`; still returns a plain array via `findMany({ where, select: USER_SELECT })`
- [x] 3.7 Modify `client/app/lib/users.ts`: add `searchUsers(term)` helper returning `Option[]` (`label` = `nombre apellido` → `username` fallback)

## Phase 4: Frontend — API Client, Shared Form & Pickers

- [x] 4.1 Create `client/app/lib/ordenes-servicio.ts`: typed interfaces, `list`/`get`/`create`/`update` + `searchTiposServicio` helper, `getAuthHeader()` on every call, per design.md § Frontend Component Plan row for this file
- [x] 4.2 Modify `client/app/(dashboard)/vehiculos/SearchableSelect.tsx`: make the `quickCreate` prop optional — render the "+ Crear" footer/`QuickCreateModal` only when provided; verify existing callers (marca/color/cliente) are unaffected, per design.md § DD3
- [x] 4.3 Modify `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx`: reuse `clienteSelectConfig` verbatim, add `mecanicoSelectConfig` (search only, no `quickCreate`), backed by `searchUsers`
- [x] 4.4 Create `client/app/(dashboard)/ordenes-servicio/TipoServicioMultiSelect.tsx`: copy of `EtiquetasMultiSelect.tsx` with `searchEtiquetas` → `searchTiposServicio`, per design.md § Frontend Component Plan
- [x] 4.5 Create `client/app/(dashboard)/ordenes-servicio/OrdenServicioForm.tsx`: shared create/edit form — cliente picker (`clienteSelectConfig`), dependent vehículo picker (`disabled={clienteId === ''}`, `search` closure `(term) => listVehicles({ clienteId, search: term })`, resets `vehiculoId=''` on cliente change), mecánico picker (`mecanicoSelectConfig`), `TipoServicioMultiSelect`, `prioridad`/`estado` enum controls, `fechaIngreso`/`kilometros`/`motivoIngreso` fields, per design.md § DD3 and § Data Flow

## Phase 5: Frontend — Pages & Navigation

- [x] 5.1 Create `client/app/(dashboard)/ordenes-servicio/page.tsx`: list + table (`numero`, cliente, vehículo, estado, prioridad, mecánico, fecha) with per-`estado` count pills, adapting `productos/page.tsx`'s structure per design.md § Frontend Component Plan
- [x] 5.2 Create `client/app/(dashboard)/ordenes-servicio/nuevo/page.tsx`: wraps `OrdenServicioForm` in create mode
- [x] 5.3 Create `client/app/(dashboard)/ordenes-servicio/editar/[id]/page.tsx`: loads via `getOrdenServicio`, wraps `OrdenServicioForm` in edit mode
- [x] 5.4 Modify `client/app/lib/navigation.tsx`: add flat top-level "Orden de Servicio" entry (`href: '/ordenes-servicio'`), sibling of Clientes/Vehículos/Productos, **not** nested under Configuraciones's `children`, per D13/design.md § Frontend Component Plan; use `/icons/ordenes-servicio.svg` if added, else the existing placeholder convention

## Phase 6: Manual/E2E Verification

- [ ] 6.1 Start both dev servers (`server/`, `client/`); confirm `DATABASE_URL` targeted the correct instance before Phase 1 migration ran
- [ ] 6.2 Verify `GET /ordenes-servicio`, `GET /ordenes-servicio/:id`, `POST /ordenes-servicio`, `PATCH /ordenes-servicio/:id` all return 401 without a Bearer token
- [ ] 6.3 Create an order through the UI end-to-end: pick cliente → vehículo picker enables and scopes to that cliente → fill kilómetros/prioridad/motivo/tipos/mecánico/estado → submit; confirm `numero` is generated as `OS-####` and all fields persist
- [ ] 6.4 Fire two rapid/concurrent `POST /ordenes-servicio` requests (e.g. via curl in parallel) and confirm both succeed with **distinct** `numero` values — no collision, no skip
- [ ] 6.5 Verify `fechaIngreso` defaults to now when omitted and is honored when explicitly supplied (late-logged order)
- [ ] 6.6 Verify `POST` stamps both `creadoPorId`/`actualizadoPorId` from the JWT caller; verify `PATCH` by a different user updates only `actualizadoPorId`, leaving `creadoPorId` unchanged
- [ ] 6.7 Verify saving an order overwrites the vehículo's `kilometraje` with the order's `kilometros`, in the same transaction (create and update)
- [ ] 6.8 Verify `estado` transitions freely in any direction (e.g. `terminado` → `pendiente`) via `PATCH`
- [ ] 6.9 Verify the mecánico picker accepts a user whose `rol` is not `'mecanico'`
- [ ] 6.10 Verify submitting a `vehiculoId` that does not belong to the selected `clienteId` (bypassing the cascade, e.g. via direct API call) is rejected with 400
- [ ] 6.11 Verify empty and inactive `tipoServicioIds` are rejected with 400 on both create and update
- [ ] 6.12 Verify `GET /vehicles?clienteId=<id>` scopes correctly and the existing no-param `GET /vehicles` call is unchanged
- [ ] 6.13 Verify `GET /users?search=<term>` filters correctly and the existing no-param `GET /users` call still returns the full array (no pagination envelope introduced)
- [ ] 6.14 Verify no `DELETE /ordenes-servicio` route exists and any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'` on all 4 routes
- [ ] 6.15 Verify the "Orden de Servicio" nav entry renders as a top-level item (not nested under Configuraciones) and links to `/ordenes-servicio`
- [ ] 6.16 Walk the proposal's full Success Criteria checklist end-to-end and confirm each item; confirm the Rollback Plan steps are accurate and executable as written (including the documented odometer-overwrite caveat)
