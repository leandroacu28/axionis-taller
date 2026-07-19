# Apply Progress: Add `patente` (license plate) to Vehiculo

**Mode**: Standard (no strict TDD detected for this project; verification relies on
`nest build` + `tsc --noEmit` + manual/E2E scenarios per repo convention).

## Batch

First and only apply batch. No prior apply-progress existed.

## Completed Tasks (47/48 — Phases 1-8 fully done; Phase 9 partially covered)

### Phase 1: Schema & Migration
- [x] 1.1 Confirmed `DATABASE_URL` in `server/.env` points at a reachable local MySQL instance (`mysql://root:***@localhost:3310/axionis-taller`).
- [x] 1.2 Added `patente String? @unique` to `Vehiculo` in `server/prisma/schema.prisma`, right after `kilometraje`, before `clienteId`.
- [x] 1.3 Applied the migration (see Deviation below) and regenerated the Prisma Client.
- [x] 1.4 Confirmed `migration.sql` is purely additive (`ALTER TABLE ... ADD COLUMN` + `CREATE UNIQUE INDEX`), touches no other column/table.

### Phase 2: Validator
- [x] 2.1 Created `server/src/vehicles/dto/patente.validator.ts` verbatim per design.md § 2.

### Phase 3: DTOs
- [x] 3.1 `create-vehicle.dto.ts`: added `Transform`, `IsString` imports, `IsPatenteValida` import, and the `patente?: string` field with the exact decorator stack, placed after `clienteId` and before `activo`.
- [x] 3.2 `update-vehicle.dto.ts`: identical field-for-field block added.

### Phase 4: Backend Service (`vehicles.service.ts`)
- [x] 4.1 `patente: true` added to `VEHICLE_SELECT`.
- [x] 4.2 `{ patente: { contains: term } }` added to `buildVehicleWhere`'s search `OR`.
- [x] 4.3 `VehicleRow.patente`, `Patente` Excel column (after Marca, before Color), row-builder `patente: r.patente ?? ''`.
- [x] 4.4 `normalizeOptional` helper added (mirrors `customers.service.ts`).
- [x] 4.5 `uniqueTargetIncludes` helper added (mirrors `customers.service.ts`).
- [x] 4.6 `create()`: pre-check via `findUnique({ where: { patente } })` + `ConflictException`, then try/catch P2002 backstop via `uniqueTargetIncludes(error, 'patente')`.
- [x] 4.7 `update()`: pre-check via `findFirst({ where: { patente, NOT: { id } } })` (self-conflict safe) + same try/catch backstop.
- [x] 4.8 `ConflictException` imported from `@nestjs/common`.

### Phase 5: Ordenes-Trabajo Service Select
- [x] 5.1 Added `patente: true` to the nested `vehiculo.select` inside `ORDEN_TRABAJO_SELECT` in `ordenes-trabajo.service.ts` — the flagged highest-risk omission (design.md A3). Confirmed via direct read of the live file before editing.

### Phase 6: Client Types
- [x] 6.1 `client/app/lib/vehicles.ts`: `patente` added to `VehicleListItem` (`string | null`), `CreateVehiclePayload` (`?: string`), `UpdateVehiclePayload` (`?: string`).
- [x] 6.2 `client/app/lib/ordenes-trabajo.ts`: `patente: string | null` added to the inline `vehiculo` type on `OrdenTrabajoListItem`.

### Phase 7: Client Vehiculos UI
- [x] 7.1 `Patente` column added to `vehiculos/page.tsx` table (header + `{vehicle.patente ?? '—'}` cell).
- [x] 7.2 Search placeholder changed to `"Patente, marca, modelo o cliente..."`.
- [x] 7.3 **CRITICAL REGRESSION FIX** — `handleToggleActivo` now sends `patente: vehicle.patente ?? undefined` in the reconstructed `UpdateVehiclePayload`.
- [x] 7.4 `vehiculos/nuevo/page.tsx`: `FormState.patente`, uppercase input, `patente: form.patente || undefined` in create payload.
- [x] 7.5 `vehiculos/editar/[id]/page.tsx`: same `FormState` extension, seeded from `loadedVehicle.patente ?? ''`, same input, same payload pattern.

### Phase 8: Client Ordenes-Trabajo UI
- [x] 8.1 `OrdenTrabajoForm.tsx` picker label includes `(${patente})` when present.
- [x] 8.2 `VehiculoQuickCreateModal.tsx`: `FormState.patente`, uppercase input (`vehiculo-quick-create-patente`), optional (does not gate required-check), included in `createVehicle` call.
- [x] 8.3 Post-create option label includes plate when present.
- [x] 8.4 `ordenes-trabajo/page.tsx` card view: plate suffix on the "Vehículo:" line.
- [x] 8.5 `ordenes-trabajo/page.tsx` table view: plate suffix inserted before the km segment.
- [x] 8.6 `ordenes-trabajo/[id]/trabajo/page.tsx`: plate suffix on the header breadcrumb.
- [x] 8.7 `ordenes-trabajo/editar/[id]/page.tsx`: `vehiculoLabel` uses the identical `(${patente})` suffix.

### Phase 9: Manual/E2E Verification (partial)
- [x] Automated equivalent of the "no compile errors" gate: `npm run build` in `server/` (nest build, clean) and `npx tsc --noEmit` in `client/` (clean) — both pass with zero errors.
- [x] Smoke-tested the running dev server after the forced restart (see Deviation below): `GET /vehicles` returns `401` (auth required), confirming the process is alive and not crash-looping after the schema/service changes.
- [ ] 9.1–9.18: the full manual/E2E scenario list (valid/invalid plate formats, duplicate-plate 409s, self-conflict update, search, export cell contents, toggle-activo preservation, picker disambiguation, quick-create, and the 4 read-only display spots) requires authenticated interactive testing against the running app and was **not** executed in this batch. Recommended as the primary focus of `sdd-verify` / manual QA follow-up.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `server/prisma/schema.prisma` | Modified | Added `patente String? @unique` to `Vehiculo` |
| `server/prisma/migrations/20260719035350_vehiculo_add_patente/migration.sql` | Created | Additive `ALTER TABLE` + `CREATE UNIQUE INDEX` |
| `server/src/vehicles/dto/patente.validator.ts` | Created | Dual-format (`LLLNNN`/`LLNNNLL`) `ValidatorConstraint` + decorator |
| `server/src/vehicles/dto/create-vehicle.dto.ts` | Modified | `patente?: string` field + transform + validator |
| `server/src/vehicles/dto/update-vehicle.dto.ts` | Modified | Identical field block (repo's DTO-duplication convention) |
| `server/src/vehicles/vehicles.service.ts` | Modified | `VEHICLE_SELECT`, `buildVehicleWhere`, `VehicleRow`/`buildVehiclesExcel`, `normalizeOptional`, `uniqueTargetIncludes`, `create()`/`update()` pre-check + P2002 backstop |
| `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` | Modified | Added `patente: true` to `ORDEN_TRABAJO_SELECT`'s nested `vehiculo.select` (flagged regression risk #1) |
| `client/app/lib/vehicles.ts` | Modified | `patente` on 3 interfaces |
| `client/app/lib/ordenes-trabajo.ts` | Modified | `patente: string | null` on inline `vehiculo` type |
| `client/app/(dashboard)/vehiculos/page.tsx` | Modified | Column, placeholder, `handleToggleActivo` fix (flagged regression risk #2) |
| `client/app/(dashboard)/vehiculos/nuevo/page.tsx` | Modified | `FormState`, input, payload |
| `client/app/(dashboard)/vehiculos/editar/[id]/page.tsx` | Modified | `FormState`, seed, input, payload |
| `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx` | Modified | Picker label |
| `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx` | Modified | `FormState`, input, payload, post-create label |
| `client/app/(dashboard)/ordenes-trabajo/page.tsx` | Modified | Card view + table view plate suffix |
| `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx` | Modified | Header breadcrumb plate suffix |
| `client/app/(dashboard)/ordenes-trabajo/editar/[id]/page.tsx` | Modified | `vehiculoLabel` plate suffix |

## Deviations from Design

1. **Duplicate-detection pattern (expected, pre-flagged drift)**: `design.md` D4 suggested relying on
   Prisma `P2002` alone for duplicate-plate detection. `specs/vehicle-plate/spec.md`'s "Duplicate
   Patente Rejected on Create and Update" requirement mandates the pre-check-plus-P2002-backstop
   pattern used by `Cliente.identificacion` in `customers.service.ts`. The spec is normative — I
   implemented the pre-check + backstop pattern (mirroring `customers.service.ts` almost verbatim:
   `normalizeOptional`, `uniqueTargetIncludes`, `findUnique` pre-check in `create()`, `findFirst` with
   `NOT: { id }` pre-check in `update()`, try/catch backstop in both). This was called out explicitly
   in the tasks.md Phase 4 note and in this batch's brief — implemented as instructed, not a
   discovered deviation.

2. **`prisma migrate dev` non-interactive limitation**: `npx prisma migrate dev --name
   vehiculo_add_patente` failed with `Prisma Migrate has detected that the environment is
   non-interactive, which is not supported` (this shell has no TTY, and the command needs to prompt a
   confirmation for the new unique-index warning). Worked around by: (a) manually creating the
   migration folder/`migration.sql` at
   `server/prisma/migrations/20260719035350_vehiculo_add_patente/` with the exact additive SQL
   design.md documents (verified against the repo's own Prisma-generated SQL conventions by reading a
   sibling migration), (b) running `npx prisma migrate deploy` (non-interactive, safe — only applies
   pending migrations, no confirmation prompt) to apply it against the dev DB, (c) running `npx prisma
   generate` to regenerate the client. The resulting migration is identical in content/shape to what
   `prisma migrate dev` would have generated; only the generation mechanism differed.

3. **Prisma Client regeneration required stopping a locked process**: `npx prisma generate` initially
   failed with `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` because the
   running `nest start --watch` dev server process (PID 17904, `node --enable-source-maps
   .../server/dist/main`) held a lock on the query engine DLL. Stopped that one process (`Stop-Process
   -Id 17904 -Force`); NestJS's `--watch` supervisor (a separate, still-running process) restarted it
   automatically. Verified post-restart with `GET /vehicles` returning `401` (server alive, not
   crash-looping). No other processes were touched.

No other deviations — implementation otherwise matches design.md and tasks.md exactly.

## Issues Found

None beyond the two items above (both resolved, not blocking).

## Remaining Tasks

- [ ] 9.1–9.18: full manual/E2E verification pass (see Phase 9 section above). Recommended for
  `sdd-verify` or a manual QA pass against the running app with an authenticated session.

## Workload / PR Boundary

- Mode: single PR (per tasks.md's Review Workload Forecast: ~260-320 changed lines, `400-line budget
  risk: Low`, `Chained PRs recommended: No`).
- Current work unit: entire change, implemented as one continuous batch (backend Phases 1-5, then
  frontend Phases 6-8), per the `ask-on-risk` delivery strategy which required no split at this size.
- Boundary: starts at schema/migration, ends at the last read-only ordenes-trabajo label; verification
  (server build + client typecheck) run at the end of the batch.
- Estimated review budget impact: within the forecasted ~260-320 line range; no chaining needed.

## Status

47/48 tasks complete (all of Phases 1-8; Phase 9's automated-equivalent checks done, its 18
manual/E2E scenarios remain). Ready for `sdd-verify`.
