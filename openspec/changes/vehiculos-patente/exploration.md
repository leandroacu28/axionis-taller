# Exploration: Add `patente` field to Vehiculo

## Current State

**Server** (`server/src/vehicles/` — note: the module folder is `vehicles`, not `vehiculos`; only client routes use the Spanish name):

- Prisma model `Vehiculo` (`server/prisma/schema.prisma:110-128`) currently has no plate/code field at all: `id, marcaId, marca, colorId, color, anio, kilometraje, clienteId, cliente, activo, creadoPorId/actualizadoPorId, ordenesTrabajo, createdAt, updatedAt`.
- `CreateVehicleDto` / `UpdateVehicleDto` (`server/src/vehicles/dto/{create,update}-vehicle.dto.ts`) mirror each other field-for-field (update DTO copies create DTO rather than using `PartialType`, matching `update-color.dto.ts`'s convention) — any new field must be added to **both** files identically.
- `VehiclesService` (`server/src/vehicles/vehicles.service.ts`) centralizes shape in one `VEHICLE_SELECT` const, one `buildVehicleWhere()` search-builder (OR-matches on `marca.marca`, `marca.modelo`, `cliente.razonSocial` today), one `buildVehiclesExcel()` column builder, plus `create()`/`update()` — a new field touches all four spots in this one file.
- `assertReferencesExist` validates FK existence/active status only; there's no per-field custom validator inside the service, that logic lives in DTOs.

**Uniqueness/formatting conventions elsewhere** (closest precedents for a user-entered, unique, formatted code):
- `Cliente.identificacion` — optional (`String? @unique`), has a custom transform (`value.replace(/\D/g, '')`) in both create/update DTOs, and a custom class-validator constraint (`server/src/customers/dto/identificacion.validator.ts`, a `ValidatorConstraint` + decorator factory) that reads a sibling field (`tipoIdentificacion`) to pick the right regex. This is the right template for "optional + unique + format-validated + auto-transformed."
- `Diagnostico.descripcion` — required unique string with a `@Transform` that capitalizes only the first letter — the "mayuscula inicial" pattern from the recent commit. It is **not** a full-uppercase transform; for `patente` a different transform is needed (`value.toUpperCase()` + strip whitespace).
- `Marca` uses a composite `@@unique([marca, modelo])`; `Color`/`TipoServicio`/`UnidadMedida`/`Etiqueta`/`Producto` all use single-column `@unique` on `descripcion`.
- `OrdenTrabajo.numero` is `String? @unique` but is **server-generated** — not a template for `patente`, since patente is user input.
- MySQL treats each `NULL` as distinct under a unique index, so `String? @unique` already coexists safely with optional-and-unique in this codebase (`Cliente.identificacion`) — relevant if `patente` should also be nullable during a migration period for legacy vehicles.

**Migrations**: committed via `prisma migrate dev` (`server/package.json` → `"prisma:migrate": "prisma migrate dev"`), one directory per migration under `server/prisma/migrations/{YYYYMMDDHHMMSS}_{snake_case_description}/migration.sql`, most recent being `20260718024732_orden_trabajo_tipo_servicio_producto`. Naming is descriptive present-tense (`add_user_dni`, `producto_alicuota_exento`, `marca_unique_marca_modelo`).

**Client**:
- `client/app/lib/vehicles.ts` — single source of truth for `VehicleListItem`, `CreateVehiclePayload`, `UpdateVehiclePayload` interfaces, all currently missing a plate field.
- `client/app/(dashboard)/vehiculos/page.tsx` — list table has fixed columns (`#, Marca, Color, Año, Kilometraje, Cliente, Estado, Acciones`); search input placeholder is `"Marca, modelo o cliente..."`; `handleToggleActivo` rebuilds the full `UpdateVehiclePayload` from the row data (needs `patente` added there too, or a toggle-activo action will silently null it out on save).
- `client/app/(dashboard)/vehiculos/nuevo/page.tsx` and `editar/[id]/page.tsx` — plain controlled `FormState` + a 2-column grid for `anio`/`kilometraje`; a new `patente` text input would slot in next to those.
- `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx` — holds `marcaSelectConfig`, `colorSelectConfig`, `clienteSelectConfig`. There is **no `vehiculoSelectConfig`** — the vehículo picker is built ad hoc inline in `OrdenTrabajoForm.tsx`.
- `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx:148-157` — `vehiculoSearch()` builds picker option labels as `` `${v.marca.marca} ${v.marca.modelo}` `` only. No patente shown — this is the first place a user actually needs to disambiguate between two vehicles of the same client with the same marca/modelo, which patente would solve.
- `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx` — the inline "alta rápida" vehiculo mini-form (marca/color/año/kilometraje only, clienteId injected). Line 112 builds the same `marca modelo`-only label after creating.
- Additional read-only display spots showing the same `marca.marca marca.modelo` pattern without patente: `ordenes-trabajo/page.tsx:795-796,886-887`, `ordenes-trabajo/[id]/trabajo/page.tsx:1159`, `ordenes-trabajo/editar/[id]/page.tsx:37`. The vehiculo shape used there is a separate inline type in `client/app/lib/ordenes-trabajo.ts:21` (`{ id, kilometraje, marca: { marca, modelo } }`), not `VehicleListItem` — would need `patente` added independently.

**Confirmed via grep**: no reference to "patente" exists anywhere in the repo (server or client) — this is a clean, unstarted feature.

## Affected Areas

- `server/prisma/schema.prisma` — add `patente` field to `Vehiculo` model.
- `server/prisma/migrations/` — new migration directory (via `prisma migrate dev`).
- `server/src/vehicles/dto/create-vehicle.dto.ts`, `update-vehicle.dto.ts` — add field + transform + validator.
- `server/src/vehicles/vehicles.service.ts` — `VEHICLE_SELECT`, `buildVehicleWhere` (search OR clause), `buildVehiclesExcel` (new column), `create()`/`update()` data blocks.
- `server/src/vehicles/dto/list-vehicles-query.dto.ts` — only if patente needs a dedicated filter beyond free-text `search`.
- `client/app/lib/vehicles.ts` — `VehicleListItem`, `CreateVehiclePayload`, `UpdateVehiclePayload`.
- `client/app/(dashboard)/vehiculos/page.tsx` — new table column, search placeholder text, `handleToggleActivo`'s reconstructed payload.
- `client/app/(dashboard)/vehiculos/nuevo/page.tsx`, `editar/[id]/page.tsx` — new form field (uppercase input).
- `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx` — vehiculo picker label (line 156) — optional scope.
- `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx` — new field in mini-form + label (line 112) — optional scope.
- `client/app/lib/ordenes-trabajo.ts:21` and the four display spots — optional scope, likely wanted for real disambiguation value.

## Approaches

1. **Required + unique + strict Argentine-format validated** — `patente String @unique`, uppercase+trim transform, custom validator (old `LLLNNN` / new Mercosur `LLNNNLL` regex).
   - Pros: strong data integrity from day one.
   - Cons: breaks on existing vehicle rows once migration adds a `NOT NULL UNIQUE` column with no default — needs a backfill strategy.
   - Effort: Medium.

2. **Optional + unique, format-validated when present** — `patente String? @unique` (mirrors `Cliente.identificacion`), same transform/validator, `@IsOptional()`.
   - Pros: non-breaking migration (existing rows get `NULL`, MySQL allows multiple `NULL`s under unique index); zero backfill required; can be tightened to required later.
   - Cons: allows vehicles to exist without a plate indefinitely unless UI nudges/enforces it.
   - Effort: Low-Medium.

3. **Required but format-loose (freeform unique string, no regex)** — just `@unique` + uppercase transform, no format validator.
   - Pros: least code.
   - Cons: garbage-in risk (typos, wrong lengths); no protection against invalid plate shapes.
   - Effort: Low.

## Recommendation

Approach 2 (optional-for-now, unique, format-validated, uppercase-transformed) — the only option that doesn't require a data-migration/backfill decision for existing `Vehiculo` rows, and it directly reuses the `Cliente.identificacion` pattern already proven in this codebase. Support both plate formats (old `LLLNNN`, new Mercosur `LLNNNLL`) in one regex/validator, exactly as `identificacion.validator.ts` branches on `tipoIdentificacion`. Whether to eventually flip to required is a product decision, not something to bake into the schema on day one.

## Open Scope Questions (for sdd-propose)

1. Required vs optional `patente` at launch (existing vehicles have no plate on file).
2. Whether this change's scope includes surfacing patente in the `ordenes-trabajo` display/picker surfaces (`OrdenTrabajoForm.tsx`, `VehiculoQuickCreateModal.tsx`, `lib/ordenes-trabajo.ts`, and the four read-only label spots), or is list+form only for this first slice.

## Risks

- Nullable-but-unique column: if the business wants patente mandatory, this approach under-delivers and will need a second migration later to tighten `NOT NULL`.
- `update-vehicle.dto.ts`'s "repeat full shape" convention means every call site that reconstructs an `UpdateVehiclePayload` from an existing row (e.g., `vehiculos/page.tsx`'s `handleToggleActivo`) must also carry `patente` through, or a toggle-activo action will silently null it out on save.
- Regex choice: Argentina has two valid plate formats in circulation (pre-2016 `LLLNNN` and Mercosur `LLNNNLL`); the validator must accept both.
- If `patente` search is added to `buildVehicleWhere`'s OR clause, confirm case-insensitive `contains` matching works the same as existing marca/modelo/cliente search (same mechanism, same DB collation — low risk).
