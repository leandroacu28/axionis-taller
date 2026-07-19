# Tasks: Add `patente` (license plate) to Vehiculo

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~260-320 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR; backend (Phases 1-3) then frontend (Phases 4-6) as sequential commits within it |
| Delivery strategy | ask-on-risk default applies, but no decision needed — under budget |
| Chain strategy | Not applicable (single PR) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

Breakdown against design.md's Affected Areas table (10 files, 1 new validator file, 1 migration):

- `server/prisma/schema.prisma`: 1 new field line ≈ 1 line
- `server/prisma/migrations/<ts>_vehiculo_add_patente/migration.sql` (generated): `ALTER TABLE` + `CREATE UNIQUE INDEX` ≈ 3 lines
- `server/src/vehicles/dto/patente.validator.ts` (new): ≈ 40 lines
- `server/src/vehicles/dto/create-vehicle.dto.ts`, `update-vehicle.dto.ts`: imports + field block, both files ≈ 24 lines
- `server/src/vehicles/vehicles.service.ts`: `VEHICLE_SELECT` (+1), `buildVehicleWhere` OR branch (+1), `VehicleRow`/`buildVehiclesExcel` column (+3), `normalizeOptional`/`uniqueTargetIncludes` helpers reused or added (~20 if not already present), `create()`/`update()` pre-check + P2002 backstop + data field (~40) ≈ 65 lines
- `server/src/ordenes-trabajo/ordenes-trabajo.service.ts`: `patente: true` in the nested `vehiculo.select` ≈ 1 line
- `client/app/lib/vehicles.ts`: 3 interface fields ≈ 3 lines
- `client/app/lib/ordenes-trabajo.ts`: inline `vehiculo` type field ≈ 1 line
- `client/app/(dashboard)/vehiculos/page.tsx`: column header + cell, search placeholder, `handleToggleActivo` field ≈ 10 lines
- `client/app/(dashboard)/vehiculos/nuevo/page.tsx`, `editar/[id]/page.tsx`: `FormState` field, seed, input, submit payload ≈ 40 lines (both files)
- `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx`: picker label ≈ 2 lines
- `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx`: `FormState` field, seed, input, submit payload, post-create label ≈ 25 lines
- `client/app/(dashboard)/ordenes-trabajo/page.tsx` (card + table views), `[id]/trabajo/page.tsx`, `editar/[id]/page.tsx` read-only labels: 4 spots ≈ 12 lines

Single additive field through an existing vertical slice; no seam justifies chaining. One PR,
sequential commits following the phase order below (backend curl-verifiable before frontend).

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Schema + migration (Phase 1) | Foundational; must land before any DTO/service code references `patente` |
| 2 | Validator (Phase 2) | Independent of Unit 1's migration having run, but logically precedes Phase 3's import |
| 3 | DTOs (Phase 3) | Depends on Unit 2 |
| 4 | Backend service (Phase 4) | Depends on Units 1-3 |
| 5 | Ordenes-trabajo service select (Phase 5) | Independent of Unit 4; both are backend, can land in either order, but grouped after Vehicles service for review coherence |
| 6 | Client types (Phase 6) | Depends on Units 4-5 being frozen (or at least stable in design.md) |
| 7 | Client vehiculos UI (Phase 7) | Depends on Unit 6 |
| 8 | Client ordenes-trabajo UI (Phase 8) | Depends on Unit 6; independent of Unit 7 (different files), can run in parallel with it |
| 9 | Verification (Phase 9) | Depends on all prior units |

## Phase 1: Schema & Migration

- [x] 1.1 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable, correct MySQL instance before generating/applying the migration
- [x] 1.2 Modify `server/prisma/schema.prisma`'s `Vehiculo` model: add `patente String? @unique` right after `kilometraje`, before the `clienteId` relation block (per design.md § 1)
- [x] 1.3 Run `npx prisma migrate dev --name vehiculo_add_patente` in `server/` — plain, no `--create-only` (purely additive: `ALTER TABLE Vehiculo ADD COLUMN patente VARCHAR(191) NULL` + `CREATE UNIQUE INDEX Vehiculo_patente_key`); confirm Prisma Client regenerated successfully
- [x] 1.4 Confirm the generated `migration.sql` matches the additive shape design.md documents and touches no other column/table

_Satisfies spec: `vehicle-plate` — "Vehiculo Patente Field Is Optional and Unique"._

## Phase 2: Validator

- [x] 2.1 Create `server/src/vehicles/dto/patente.validator.ts` per design.md § 2 verbatim: `PATENTE_VIEJA` (`/^[A-Z]{3}\d{3}$/`) and `PATENTE_MERCOSUR` (`/^[A-Z]{2}\d{3}[A-Z]{2}$/`) module constants; `PatenteValidaConstraint` (`@ValidatorConstraint({ name: 'patenteValida', async: false })`) whose `validate()` passes through `undefined`/`null`/`''` and otherwise tests both regexes; `IsPatenteValida()` decorator factory mirroring `identificacion.validator.ts`'s shape

_Satisfies spec: `vehicle-plate` — "Dual Argentine Plate Format Validation"._

## Phase 3: DTOs

- [x] 3.1 Modify `server/src/vehicles/dto/create-vehicle.dto.ts`: add `Transform` import from `class-transformer`, add `IsString` to the existing `class-validator` import, import `IsPatenteValida` from `./patente.validator`; add the `patente?: string` field with `@Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : value)` → `@IsOptional()` → `@IsString()` → `@IsPatenteValida()`, placed after `clienteId` and before `activo`
- [x] 3.2 Modify `server/src/vehicles/dto/update-vehicle.dto.ts`: add the field-for-field identical block (same imports, same decorator stack, same position) — the two DTOs MUST stay field-for-field identical per repo convention

_Satisfies spec: `vehicle-plate` — "Uppercase and Trim Transform", "Dual Argentine Plate Format Validation"._

## Phase 4: Backend Service (`server/src/vehicles/vehicles.service.ts`)

- [x] 4.1 Add `patente: true` to `VEHICLE_SELECT`, after `kilometraje: true`
- [x] 4.2 Add a `patente` branch to `buildVehicleWhere`'s search `OR` array: `{ patente: { contains: term } }` (direct scalar `contains`, not nested like marca/cliente)
- [x] 4.3 Add `patente: string | null;` to the `VehicleRow` type; add a `{ header: 'Patente', key: 'patente', width: 14 }` column to `buildVehiclesExcel`'s `sheet.columns`, placed after `Marca` and before `Color`; add `patente: r.patente ?? '',` to the row-builder (empty cell, never the literal string `"null"`)
- [x] 4.4 Add a module-level `normalizeOptional(value?: string): string | null` helper (or reuse if one already exists in this file) matching `customers.service.ts`'s: trims, returns `null` for blank/whitespace-only input — so an empty-string `patente` normalizes to `null` instead of colliding with the unique index
- [x] 4.5 Add a module-level `uniqueTargetIncludes(error: unknown, field: string): boolean` helper (or reuse if one already exists in this file) matching `customers.service.ts`'s target-aware `P2002` check
- [x] 4.6 In `create()`: normalize `dto.patente` via `normalizeOptional`; when non-null, pre-check via `this.prisma.vehiculo.findUnique({ where: { patente } })` and throw `ConflictException` on a hit (per spec's `Cliente.identificacion`-mirroring TOCTOU-safe pattern — see Risks note below); pass the normalized value in `data.patente`; wrap the `create` call in try/catch and throw `ConflictException` when `uniqueTargetIncludes(error, 'patente')` is true, else rethrow
- [x] 4.7 In `update()`: same normalization; pre-check via `this.prisma.vehiculo.findFirst({ where: { patente, NOT: { id } } })` so the vehicle being edited can keep its own unchanged plate; same `data.patente` assignment and same try/catch P2002 backstop as `create()`
- [x] 4.8 Import `ConflictException` from `@nestjs/common` in this file if not already imported

_Satisfies spec: `vehicle-plate` — "Empty String Normalizes to NULL", "Duplicate Patente Rejected on Create and Update", "Patente Exposed in Select, Search, and Export"._

**Note:** design.md D4 says rely on `P2002` alone; `specs/vehicle-plate/spec.md` mandates the
pre-check-plus-backstop pattern (like `Cliente.identificacion`). Spec is authoritative — tasks
follow it. Flag this design/spec drift during `sdd-verify`.

## Phase 5: Ordenes-Trabajo Service Select

- [x] 5.1 Modify `server/src/ordenes-trabajo/ordenes-trabajo.service.ts`'s `ORDEN_TRABAJO_SELECT` (lines ~34-35): add `patente: true` inside the nested `vehiculo: { select: { id: true, kilometraje: true, patente: true, marca: { select: { marca: true, modelo: true } } } }` — this is a separate `*_SELECT` constant from `VehiclesService.VEHICLE_SELECT` and is easy to miss; confirmed the current code at these lines has no `patente` field yet

_Satisfies spec: `ordenes-trabajo-management` — "Client Order Vehiculo Type Includes Patente" (server-side prerequisite: the nested select must actually return the field before any client type/label can render it)._

## Phase 6: Client Types

- [x] 6.1 Modify `client/app/lib/vehicles.ts`: add `patente: string | null;` to `VehicleListItem`, `patente?: string;` to `CreateVehiclePayload`, `patente?: string;` to `UpdateVehiclePayload` — each placed after `kilometraje`
- [x] 6.2 Modify `client/app/lib/ordenes-trabajo.ts`: add `patente: string | null;` to the inline `vehiculo` type on `OrdenTrabajoListItem` (and any other order read type sharing that inline shape), alongside `id`/`kilometraje`/`marca`

_Satisfies spec: `ordenes-trabajo-management` — "Client Order Vehiculo Type Includes Patente"._

## Phase 7: Client Vehiculos UI

- [x] 7.1 Modify `client/app/(dashboard)/vehiculos/page.tsx`: add a `Patente` `<th>` after the `Marca` header and a matching `<td>` rendering `{vehicle.patente ?? '—'}` after the marca cell
- [x] 7.2 Modify `client/app/(dashboard)/vehiculos/page.tsx`: change the search placeholder from `"Marca, modelo o cliente..."` to `"Patente, marca, modelo o cliente..."`
- [x] 7.3 **CRITICAL REGRESSION FIX** — Modify `client/app/(dashboard)/vehiculos/page.tsx`'s `handleToggleActivo` (~lines 166-189): the reconstructed `UpdateVehiclePayload` passed to `updateVehicle(vehicle.id, {...})` MUST include `patente: vehicle.patente ?? undefined` alongside `marcaId`/`colorId`/`anio`/`kilometraje`/`clienteId`/`activo`, so toggling `activo` never drops or nulls the existing plate
- [x] 7.4 Modify `client/app/(dashboard)/vehiculos/nuevo/page.tsx`: extend `FormState` with `patente: string;`, seed `''` in `EMPTY_FORM`; add an optional uppercase text input (`onChange={(e) => updateField('patente', e.target.value.toUpperCase())}`, `maxLength={7}`, placeholder `"Ej: ABC123 o AB123CD"`, no `required`); add `patente: form.patente || undefined` to the create payload
- [x] 7.5 Modify `client/app/(dashboard)/vehiculos/editar/[id]/page.tsx`: same `FormState` extension, seed `patente: vehicle.patente ?? ''` from the loaded vehicle, same input, add `patente: form.patente || undefined` to the update payload

_Satisfies spec: `vehicle-plate` — "Toggling Vehiculo Activo Preserves Patente", "Patente Exposed in Select, Search, and Export" (client-facing portion)._

## Phase 8: Client Ordenes-Trabajo UI

- [x] 8.1 Modify `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx`: update the Vehículo picker's label mapping to `` `${v.marca.marca} ${v.marca.modelo}${v.patente ? ` (${v.patente})` : ''}` ``
- [x] 8.2 Modify `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx`: extend `FormState` with `patente: string;`, seed `''` in `EMPTY_FORM`; add the same optional uppercase text input as Phase 7 (own `htmlFor`, e.g. `vehiculo-quick-create-patente`); it does NOT gate the existing `marcaId === '' || colorId === ''` required-check; add `patente: form.patente || undefined` to the `createVehicle({...})` call
- [x] 8.3 Modify `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx`: update the post-create auto-selected option's label to include the plate: `` `${vehicle.marca.marca} ${vehicle.marca.modelo}${vehicle.patente ? ` (${vehicle.patente})` : ''}` ``
- [x] 8.4 Modify `client/app/(dashboard)/ordenes-trabajo/page.tsx` card view: append `${orden.vehiculo.patente ? ` (${orden.vehiculo.patente})` : ''}` to the "Vehículo:" line
- [x] 8.5 Modify `client/app/(dashboard)/ordenes-trabajo/page.tsx` table view: insert the same plate suffix into the `marca modelo - NN km` cell, before the km segment
- [x] 8.6 Modify `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx`: append the same plate suffix to the header breadcrumb's `marca modelo` segment
- [x] 8.7 Modify `client/app/(dashboard)/ordenes-trabajo/editar/[id]/page.tsx`: update `vehiculoLabel` (seeds the edit form's picker display) to use the identical `(${patente})` suffix so the pre-selected value matches what the picker (8.1) renders

_Satisfies spec: `orden-trabajo-vehiculo-quick-create` — "Alta Rápida de Vehículo Mini-Form Fields", "Mini-Form Validation Aligned With CreateVehicleDto", "Auto-Select and Close on Successful Creation"; `ordenes-trabajo-management` — "Vehículo Picker Label Includes Patente", "Read-Only Order Views Display Patente"._

## Phase 9: Manual/E2E Verification

Mirrors the proposal's Success Criteria and the specs' scenarios.

- [x] 9.1 Create a vehicle with a valid `LLLNNN` plate (e.g. `ABC123`) — succeeds, stored uppercase
- [x] 9.2 Create a vehicle with a valid Mercosur `LLNNNLL` plate (e.g. `AB123CD`) — succeeds
- [x] 9.3 Create a vehicle with an invalid format (e.g. `AB1234`) — rejected with 400, no vehicle created
- [x] 9.4 Create a vehicle with lowercase/whitespace-padded input (e.g. `'  ab123cd  '`) — stored as `'AB123CD'`
- [x] 9.5 Create two vehicles both omitting `patente` — both succeed, both stored `patente: null`
- [x] 9.6 Create a vehicle with `patente: 'ABC123'` already used by another vehicle — 409, no new vehicle created
- [x] 9.7 Update a vehicle to a plate already used by a different vehicle — 409, target vehicle unmodified
- [x] 9.8 Update a vehicle with its own unchanged existing plate — 200, succeeds (self-conflict must NOT trigger)
- [x] 9.9 `GET /vehicles` and `GET /vehicles/:id` include `patente` in the response
- [x] 9.10 `GET /vehicles?search=ABC123` matches the vehicle with that plate
- [x] 9.11 `GET /vehicles/export` includes a `Patente` column with an empty cell (not the string `"null"`) for plate-less vehicles
- [x] 9.12 Toggle `activo` on a vehicle with an existing plate from `vehiculos/page.tsx` — plate is preserved after the toggle (network payload includes `patente`)
- [x] 9.13 Toggle `activo` on a plate-less vehicle — no validation error, plate remains `null`
- [x] 9.14 In `ordenes-trabajo`'s Vehículo picker, two same-make/model vehicles for one client are now disambiguated by plate in the dropdown
- [x] 9.15 Quick-create a vehicle inline from `ordenes-trabajo` with a plate — mini-form accepts it, post-create auto-selected label includes the plate; leaving it blank also succeeds
- [ ] 9.16 Quick-create mini-form rejects an invalid plate format without calling `createVehicle`
- [x] 9.17 Confirm all 4 read-only ordenes-trabajo display spots (list card, list table, trabajo header, editar seed label) show the plate when present and render no placeholder/broken artifact when absent
- [x] 9.18 Confirm `server/src/ordenes-trabajo/ordenes-trabajo.service.ts`'s `ORDEN_TRABAJO_SELECT` nested `vehiculo` select actually returns `patente` (the design's flagged highest-risk omission) by inspecting a live `GET /ordenes-trabajo` response

**sdd-verify note (2026-07-19)**: 9.1-9.11, 9.18 verified live against the running server (curl + JWT auth,
test data created and cleaned up afterward). 9.12-9.15, 9.17 verified via static inspection of the current file
contents (no browser available in this environment). 9.16 left UNCHECKED — confirmed by reading
`VehiculoQuickCreateModal.tsx` that no client-side patente format check exists before calling `createVehicle`;
see CRITICAL finding in verify-report.md.
