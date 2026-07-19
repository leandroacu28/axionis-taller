# Proposal: Add `patente` (license plate) to Vehiculo

## Intent

The `Vehiculo` model has no plate field, so vehicles can only be identified by
`marca modelo` — which is ambiguous when one client owns two vehicles of the same
make/model. This first surfaces as pain in the ordenes-trabajo vehiculo picker,
where the operator cannot tell duplicate options apart. Adding `patente` gives
each vehicle a human-recognizable, unique identifier for search and disambiguation.

## Scope

### In Scope
- `patente` field on `Vehiculo`: optional, unique when present, dual-format validated, uppercase+trim transform.
- Server: schema + migration, both DTOs, `VEHICLE_SELECT`, `buildVehicleWhere` (add to search OR), `buildVehiclesExcel` column, `create()`/`update()`.
- Client vehiculos: `lib/vehicles.ts` types, list column + search placeholder, `handleToggleActivo` payload, `nuevo`/`editar` form input.
- Client ordenes-trabajo: `OrdenTrabajoForm.tsx` picker label, `VehiculoQuickCreateModal.tsx` mini-form + post-create label, `lib/ordenes-trabajo.ts` inline type + the 4 read-only display spots.

### Out of Scope
- Making `patente` required (deferred to a future change; may add backfill + `NOT NULL`).
- Dedicated `patente` query filter beyond free-text `search`.
- Any non-Argentine plate formats.

## Capabilities

### New Capabilities
- `vehicle-plate`: optional-but-unique, format-validated `patente` on vehicle create/update/list/search/export.

### Modified Capabilities
- `orden-trabajo-vehiculo-quick-create`: mini-form gains `patente` input and post-create label shows it.
- `ordenes-trabajo-management`: vehiculo picker and read-only display labels include `patente`.

## Approach

Mirror the proven `Cliente.identificacion` pattern: `patente String? @unique` in Prisma
(MySQL treats each NULL as distinct, so existing rows stay valid — no backfill). Add an
`@IsOptional()` field with a `@Transform` doing `value.toUpperCase()` + whitespace strip,
guarded by a custom `ValidatorConstraint` + decorator factory (like `identificacion.validator.ts`)
that accepts BOTH old `LLLNNN` (ABC123) and Mercosur `LLNNNLL` (AB123CD) formats via fixed
dual-regex — no sibling-field branching needed. Add `patente` to the two DTOs identically
(project convention: update DTO repeats full shape, not `PartialType`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modified | `patente String? @unique` on `Vehiculo` |
| `server/prisma/migrations/` | New | `prisma migrate dev` migration |
| `server/src/vehicles/dto/create-vehicle.dto.ts`, `update-vehicle.dto.ts` | Modified | field + transform + validator (both, identical) |
| `server/src/vehicles/dto/patente.validator.ts` | New | dual-format `ValidatorConstraint` + decorator |
| `server/src/vehicles/vehicles.service.ts` | Modified | `VEHICLE_SELECT`, `buildVehicleWhere`, `buildVehiclesExcel`, `create`/`update` |
| `client/app/lib/vehicles.ts` | Modified | list/create/update types |
| `client/app/(dashboard)/vehiculos/page.tsx` | Modified | column, placeholder, `handleToggleActivo` payload |
| `client/app/(dashboard)/vehiculos/nuevo/page.tsx`, `editar/[id]/page.tsx` | Modified | uppercase input |
| `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx` | Modified | picker label |
| `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx` | Modified | mini-form field + label |
| `client/app/lib/ordenes-trabajo.ts` + 4 display spots | Modified | inline type + labels |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `handleToggleActivo` rebuilds full `UpdateVehiclePayload`; omitting `patente` nulls it on toggle | High | Carry `patente` through the reconstructed payload (explicit task) |
| Nullable-unique under-delivers if plate must be mandatory | Med | Accepted for now; tighten to required in a future change |
| Validator rejects a valid plate variant | Low | Accept both `LLLNNN` and `LLNNNLL`; uppercase before matching |

## Rollback Plan

Revert the migration (`patente` is additive/nullable — drop column) and the code diff.
No data loss for existing rows (they were NULL). No dependent behavior relies on `patente`.

## Dependencies

- None. Additive to existing vehicles + ordenes-trabajo modules.

## Success Criteria

- [ ] Create/update a vehicle with a valid plate (both formats) succeeds; invalid format is rejected.
- [ ] Duplicate plate is rejected; multiple plate-less vehicles still coexist.
- [ ] Plate is searchable, shows in the list, export, picker, and all read-only ordenes-trabajo labels.
- [ ] Toggling `activo` preserves the existing plate.
