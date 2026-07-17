# Tasks: Iniciar Orden de Trabajo + split próximo service into date/km

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | n/a (single PR, no chaining needed) |

Decision needed before apply: No — estimate is well under the 400-line budget; proceed as a single PR unless `sdd-apply` discovers the diff is materially larger than estimated.

This is a **small follow-on** touching 7 files, most already mid-flight from the uncommitted `orden-de-trabajo`/detalle work. Estimate breakdown, calibrated against the actual current file contents (`ordenes-trabajo.service.ts` lines 288/331/341, `ordenes-trabajo.controller.ts`, `update-orden-trabajo-detalle.dto.ts` line 23, `client/app/lib/ordenes-trabajo.ts` lines 121-138, schema.prisma line 245):
- `schema.prisma` (rename `proximoService` → `proximoServiceFecha`, add `proximoServiceKm Int?`): ~2-3 lines
- New migration folder + hand-edited `migration.sql` (rename column + add column): ~5-10 lines
- `ordenes-trabajo.service.ts`: add `iniciar()` method (~30 lines, per design.md § Service) + import `ConflictException` (~1 line) + swap `proximoService` for the two fields in `findDetalles`/`updateDetalle` selects and the `updateDetalle` data-mapping (~8 lines)
- `ordenes-trabajo.controller.ts`: add `POST :id/iniciar` route (~10 lines)
- `update-orden-trabajo-detalle.dto.ts`: rename field + add `proximoServiceKm` + `@Min` import (~5 lines)
- `client/app/lib/ordenes-trabajo.ts`: add `iniciarOrdenTrabajo` helper (~10 lines) + rename/add on `OrdenTrabajoDetalle` interface (~2 lines) + `UpdateOrdenTrabajoDetallePayload` (~2 lines)
- `client/app/(dashboard)/ordenes-trabajo/page.tsx`: gated "Iniciar orden" menu item + handler in `AccionesMenu` (~20-25 lines) + mirrored card-footer trigger (~10-15 lines)

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Schema + migration (Phase 1) | Foundational; must land before Phase 2/3 code references the renamed/new columns |
| 2 | Backend `iniciar` action (Phase 2) | Independently curl/Postman-verifiable once Unit 1 is applied |
| 3 | Backend próximo-service split — DTO + selects (Phase 3) | Can be done in parallel with Unit 2 (touches different service methods/routes); both depend on Unit 1's schema |
| 4 | Frontend — client lib + gated UI trigger (Phase 4) | Depends on Unit 2 (needs the live `iniciar` route) and Unit 3 (needs the live split fields for any detalle-editing surface) |

Given the small total size, all four units are expected to ship as **one PR** — the table above is for internal sequencing/parallelization within that PR, not a chaining recommendation.

## Phase 1: Schema & Migration

- [x] 1.1 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before generating/applying the migration (per proposal Known Gaps / design.md § Migration/Rollout)
- [x] 1.2 Modify `server/prisma/schema.prisma` (line ~245, `OrdenTrabajoTipoServicio` model): rename `proximoService DateTime?` → `proximoServiceFecha DateTime?`
- [x] 1.3 Modify `server/prisma/schema.prisma`: add `proximoServiceKm Int?` immediately after `proximoServiceFecha`
- [x] 1.4 Run `npx prisma migrate dev --create-only --name orden_trabajo_proximo_service_split` in `server/` — generates the migration file WITHOUT applying it (mandatory per design.md § Migration/Rollout; a plain `migrate dev` would auto-apply a destructive drop+recreate)
- [x] 1.5 Hand-edit the generated `migration.sql` so it reads exactly (per design.md § Interfaces/Contracts):
  ```sql
  ALTER TABLE `OrdenTrabajoTipoServicio` RENAME COLUMN `proximoService` TO `proximoServiceFecha`;
  ALTER TABLE `OrdenTrabajoTipoServicio` ADD COLUMN `proximoServiceKm` INT NULL;
  ```
  replacing whatever drop/recreate Prisma auto-generated
- [x] 1.6 Run `npx prisma migrate dev` in `server/` to apply the hand-edited migration and regenerate the Prisma Client

## Phase 2: Backend — `iniciar` Action

- [x] 2.1 Modify `server/src/ordenes-trabajo/ordenes-trabajo.service.ts`: add `ConflictException` to the `@nestjs/common` import alongside `BadRequestException`/`Injectable`/`NotFoundException`
- [x] 2.2 Add `async iniciar(id: number, actualizadoPorId: number)` to `OrdenesTrabajoService`, copied **verbatim** from design.md § Interfaces/Contracts → Service — `iniciar`: single `this.prisma.$transaction(async (tx) => …)` containing, in order: (a) `tx.ordenTrabajo.findUnique({ where: { id }, select: { estado: true } })` → `NotFoundException` if absent; (b) the **conditional** `tx.ordenTrabajo.updateMany({ where: { id, estado: 'pendiente' }, data: { estado: 'en_proceso', actualizadoPorId } })` + `count === 0` → `ConflictException('La orden ya fue iniciada o no está pendiente.')` — do NOT replace this with a plain read-then-branch or an unconditional `update({ where: { id } })`, the conditional `updateMany` is the race-free guard design.md's concurrency note requires; (c) `tx.ordenTrabajoTipoServicio.updateMany({ where: { ordenTrabajoId: id, estado: 'pendiente' }, data: { estado: 'en_proceso', actualizadoPorId } })` cascading only still-pending detalles (D6); (d) re-`findUnique` with `ORDEN_TRABAJO_SELECT` and `return mapOrdenTrabajo(orden)` (D9)
- [x] 2.3 Modify `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`: add `@Post(':id/iniciar')` route (below the existing `@Patch(':id')`), taking `@Param('id', ParseIntPipe) id: number` and `@Request() req: { user: { userId: number; username: string } }`, calling `this.ordenesTrabajoService.iniciar(id, req.user.userId)` — no `@Body()`, class-level `@UseGuards(JwtAuthGuard)` already covers it

## Phase 3: Backend — Próximo-Service Field Split

- [x] 3.1 Modify `server/src/ordenes-trabajo/dto/update-orden-trabajo-detalle.dto.ts`: rename `proximoService?: string | null` (`@IsOptional() @IsDateString()`) → `proximoServiceFecha?: string | null`
- [x] 3.2 Modify `server/src/ordenes-trabajo/dto/update-orden-trabajo-detalle.dto.ts`: add `proximoServiceKm?: number | null` with `@IsOptional() @IsInt() @Min(0)`; add `Min` to the `class-validator` import
- [x] 3.3 Modify `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` `findDetalles`'s `select` block (line ~288): replace `proximoService: true` with `proximoServiceFecha: true, proximoServiceKm: true`
- [x] 3.4 Modify `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` `updateDetalle`'s `data` block (line ~331): replace `proximoService: dto.proximoService ? new Date(dto.proximoService) : dto.proximoService` with `proximoServiceFecha: dto.proximoServiceFecha ? new Date(dto.proximoServiceFecha) : dto.proximoServiceFecha` and add `proximoServiceKm: dto.proximoServiceKm` passed straight through
- [x] 3.5 Modify `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` `updateDetalle`'s `select` block (line ~341): replace `proximoService: true` with `proximoServiceFecha: true, proximoServiceKm: true`
- [x] 3.6 Grep the `server/` tree for any remaining `proximoService` reference (excluding the already-superseded migration file under `migrations/20260716144357_.../migration.sql`, which is historical and not touched) and confirm none remain in `.ts` source

## Phase 4: Frontend — Client Lib & UI Trigger

- [x] 4.1 Modify `client/app/lib/ordenes-trabajo.ts`: add `export async function iniciarOrdenTrabajo(id: number): Promise<OrdenTrabajoListItem>` — `POST` to `${API_BASE_URL}/ordenes-trabajo/${id}/iniciar` with `{ ...getAuthHeader() }` headers and no body, routed through `handleJsonResponse(res, 'No se pudo iniciar la orden de trabajo')`, per design.md § Interfaces/Contracts → Client lib diff
- [x] 4.2 Modify `client/app/lib/ordenes-trabajo.ts` `OrdenTrabajoDetalle` interface (line ~127): replace `proximoService: string | null` with `proximoServiceFecha: string | null` and add `proximoServiceKm: number | null`
- [x] 4.3 Modify `client/app/lib/ordenes-trabajo.ts` `UpdateOrdenTrabajoDetallePayload` type (line ~136): replace `proximoService?: string | null` with `proximoServiceFecha?: string | null` and add `proximoServiceKm?: number | null`
- [x] 4.4 Grep the `client/` tree for any remaining `proximoService` reference and confirm none remain (interface, payload, and any detalle-editing surface that renders the field) — also updated `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx`'s `DetalleCard` (the only detalle-editing surface in the tree) to render both split fields (date + numeric km inputs), per the proposal's scope note on that route group
- [x] 4.5 Modify `client/app/(dashboard)/ordenes-trabajo/page.tsx`'s `AccionesMenu`: add an "Iniciar orden" menu item, rendered only when `orden.estado === 'pendiente'`, that calls `iniciarOrdenTrabajo(orden.id)` then `onToggled()`, reusing the exact async/loading/`showSuccess`/`showError` pattern of `handleToggleActivo` (design.md § Decision Q3) — do NOT reuse or overload the existing "Iniciar trabajo" `<Link>` to `/ordenes-trabajo/[id]/trabajo`, which is a distinct, deferred concern
- [x] 4.6 Modify `client/app/(dashboard)/ordenes-trabajo/page.tsx`'s card-view footer: mirror the same gated "Iniciar orden" trigger (same handler/condition as 4.5) next to the existing card actions, consistent with the card view's existing `AccionesMenu` (`trigger="label"`) usage — since the card footer already renders the same shared `AccionesMenu` component (`trigger="label"`, the "Opciones" button), the single 4.5 edit inside `AccionesMenu` is rendered in both the table row dropdown and the card's "Opciones" dropdown automatically; no separate card-only code path was needed

## Phase 5: Manual/E2E Verification

- [x] 5.1 Confirm `DATABASE_URL` targeted the correct instance before Phase 1's migration ran (retrospective sanity check alongside the Phase 1 precondition) — confirmed `localhost:3310` (local Docker MySQL, `db-mysql` container) both before and via `prisma migrate dev`/`migrate status` output
- [x] 5.2 Verify `POST /ordenes-trabajo/:id/iniciar` returns 401 without a Bearer token, and no row is modified — verified via curl (401, no `Authorization` header)
- [x] 5.3 Verify a non-`admin` authenticated user can call `iniciar` on a `pendiente` order they did not create, with identical success to an `admin` caller — verified with a temp-password `empleado` (non-admin) JWT against a fixture order created by a different user context
- [x] 5.4 Verify calling `iniciar` with an empty body on a `pendiente` order succeeds and both the order's and every touched detalle's `actualizadoPorId` reflect the JWT caller's id — verified: order + both detalles stamped `actualizadoPorId: 24` (the calling user)
- [x] 5.5 Verify starting a `pendiente` order whose detalles are all `pendiente` returns 200 with `estado: 'en_proceso'` and every detalle becomes `en_proceso` with `actualizadoPorId` stamped — verified via curl + direct DB read
- [x] 5.6 **Mixed-state cascade scenario**: create/seed a `pendiente` order with three detalles — one `en_proceso`, one `terminado`, one `pendiente` — call `iniciar`, and confirm only the `pendiente` detalle flips to `en_proceso` while the other two keep their original `estado` AND `actualizadoPorId` unchanged — verified: before/after DB read confirms only the pendiente line changed
- [x] 5.7 Verify calling `iniciar` on an order whose `estado` is `en_proceso`, `terminado`, or `cancelado` returns 409 with a Spanish message, and mutates neither the order nor any of its detalles — verified all three states return 409 and `updatedAt` is unchanged
- [x] 5.8 Verify calling `iniciar` on a nonexistent order id returns 404 and mutates nothing — verified via curl against id `999999`
- [x] 5.9 **Concurrency scenario**: fire two rapid/near-simultaneous `POST /ordenes-trabajo/:id/iniciar` calls against the same `pendiente` order (e.g. parallel curl) and confirm exactly one succeeds (200, `en_proceso`) and the other receives 409 — no double-cascade, no double `actualizadoPorId` stamp, no lost update — verified twice (backgrounded parallel curl) with the same result both times: exactly one 200, one 409
- [x] 5.10 Verify the `iniciar` response body matches the same field shape as `GET /ordenes-trabajo/:id` (no embedded detalles), per D9 — verified: identical JSON key shape between the `iniciar` response and a follow-up `GET`
- [x] 5.11 Verify `PATCH /ordenes-trabajo/:id/detalles/:detalleId` can set `proximoServiceKm` alone (e.g. `55000`) while `proximoServiceFecha` stays `null`, and vice versa — verified both directions via curl
- [x] 5.12 Verify both `proximoServiceFecha` and `proximoServiceKm` can be set together in the same `PATCH` call, and either can later be cleared (`null`) independently without affecting the other — verified: set both, then cleared `proximoServiceKm` alone and confirmed `proximoServiceFecha` was untouched
- [x] 5.13 Verify `proximoServiceKm` is stored exactly as supplied with no read from or calculation against `Vehiculo.kilometraje` — verified: vehiculo's `kilometraje` was `106000` while `proximoServiceKm` was independently set to `55000`/`60000`, no correlation
- [x] 5.14 Verify `GET /ordenes-trabajo/:id/detalles` and the `PATCH …/detalles/:detalleId` response both include `proximoServiceFecha` and `proximoServiceKm`, and neither includes a `proximoService` key — verified via curl on both endpoints
- [ ] 5.15 Verify the "Iniciar orden" trigger is visible only for `pendiente` orders (both table `AccionesMenu` and card footer) and disappears after a successful start, refreshing the row via `onToggled()` — **NOT verified**: this requires interactive browser rendering/click-through (no browser automation tool available in this session); code review confirms the gating condition (`orden.estado === 'pendiente'`) and the `onToggled()` refresh call are present, but the actual rendered behavior was not exercised in a browser
- [ ] 5.16 Walk the proposal's full Success Criteria checklist end-to-end and confirm each item; confirm the Rollback Plan steps are accurate and executable as written (including the documented benign "estado not reverted" caveat) — **partially verified**: every backend/API criterion (5.1-5.14 above) was walked and confirmed; the frontend-trigger criterion depends on the unverified 5.15; Rollback Plan steps were reviewed for accuracy against the actual applied migration/files and are executable as written
