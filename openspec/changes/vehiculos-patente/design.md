# Design: Add `patente` (license plate) to Vehiculo

## Architecture Approach

This is an **additive, single-field extension** across the existing vehicle vertical slice
(Prisma model → DTO → service → client lib → client UI) plus the read/label surfaces of the
ordenes-trabajo module. No new layer, boundary, or pattern is introduced — every touch point
mirrors an already-proven sibling (`Cliente.identificacion` for the nullable-unique + custom
validator, `buildCustomerWhere` for search, the existing DTO-duplication convention). The design
is deliberately conservative: reuse the shapes already in the repo so the diff reads as
"one more field," not "a new mechanism."

Layering is unchanged:

```
Prisma schema  ──►  DTO (validation + transform)  ──►  VehiclesService (select/where/excel/create/update)
                                                             │
                                                             ▼
                                                 client/app/lib/vehicles.ts (types + fetch)
                                                             │
                        ┌────────────────────────────────────┼───────────────────────────────┐
                        ▼                                      ▼                               ▼
             vehiculos/* (list, forms)        ordenes-trabajo picker + quick-create    ordenes-trabajo read-only labels
```

---

## 1. Prisma Schema Change

**File:** `server/prisma/schema.prisma`, `Vehiculo` model (lines 110-128).

Add ONE field, placed right after `kilometraje` (keeps identity-ish attributes grouped, before
the `clienteId` relation block):

```prisma
model Vehiculo {
  id               Int            @id @default(autoincrement())
  marcaId          Int
  marca            Marca          @relation(fields: [marcaId], references: [id])
  colorId          Int
  color            Color          @relation(fields: [colorId], references: [id])
  anio             Int
  kilometraje      Int
  patente          String?        @unique   // ← NEW
  clienteId        Int
  cliente          Cliente        @relation(fields: [clienteId], references: [id])
  ...
}
```

**Why `String? @unique` (not required, not composite):**
- Mirrors `Cliente.identificacion String? @unique` (schema line 54) — the proven precedent in this
  same schema.
- MySQL treats each `NULL` in a `UNIQUE` index as **distinct**, so every existing plate-less row
  stays valid and unlimited plate-less vehicles can coexist. No backfill, no `NOT NULL`, no default.
- Uniqueness is enforced at the DB level; the service does NOT need a manual "plate already exists"
  pre-check. A duplicate insert/update surfaces as Prisma error code **`P2002`**. The existing
  global exception handling already turns Prisma known-request errors into a client-facing message
  (same as duplicate `razonSocial` / `identificacion` today) — no new catch block is added in this
  change unless verification shows the P2002 message is unfriendly, which is out of scope here.

**Migration:**

Run `npx prisma migrate dev --name vehiculo_add_patente` from `server/`. This produces a new
folder under `server/prisma/migrations/` following the repo's existing timestamped convention
(cf. `20260718024732_orden_trabajo_tipo_servicio_producto`), i.e.
`{YYYYMMDDHHMMSS}_vehiculo_add_patente/migration.sql`. The generated SQL is the additive, safe:

```sql
ALTER TABLE `Vehiculo` ADD COLUMN `patente` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Vehiculo_patente_key` ON `Vehiculo`(`patente`);
```

Additive + nullable ⇒ zero-downtime, no data rewrite. Rollback = drop the column + index (see
proposal Rollback Plan).

**ADR — nullable-unique vs required:**
- **Chosen:** nullable-unique now. **Rejected:** required-from-day-one, because existing rows have
  no plate and a required column would force a fabricated backfill (bad data) or block the migration.
  Tightening to required is explicitly deferred to a future change (proposal Out of Scope).

---

## 2. Validator Design

**New file:** `server/src/vehicles/dto/patente.validator.ts`.

Mirror the `ValidatorConstraint` + decorator-factory shape of
`server/src/customers/dto/identificacion.validator.ts`, but **simpler**: there is no sibling
field (`identificacion` branches on `tipoIdentificacion`); `patente` has a fixed dual-regex and no
cross-field dependency, so `validate` needs no `args.object` lookup.

```ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Old Argentine format: 3 letters + 3 digits (e.g. ABC123).
const PATENTE_VIEJA = /^[A-Z]{3}\d{3}$/;
// Mercosur format: 2 letters + 3 digits + 2 letters (e.g. AB123CD).
const PATENTE_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

@ValidatorConstraint({ name: 'patenteValida', async: false })
export class PatenteValidaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // patente is optional — an absent value is valid; only a provided value
    // must match one of the two accepted formats. The DTO's @Transform has
    // already uppercased + trimmed by the time this runs, so we match against
    // the canonical form only.
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    return PATENTE_VIEJA.test(value) || PATENTE_MERCOSUR.test(value);
  }

  defaultMessage(): string {
    return 'La patente debe tener formato ABC123 o AB123CD.';
  }
}

export function IsPatenteValida(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'patenteValida',
      target: object.constructor,
      propertyName,
      options,
      validator: PatenteValidaConstraint,
    });
  };
}
```

**Validation-order note (load-bearing):** class-transformer's `@Transform` runs BEFORE
class-validator constraints when `ValidationPipe({ transform: true })` is active (the app's global
pipe). So the validator can safely assume the value is already uppercased and trimmed and only
needs to match the uppercase regexes — no `.toUpperCase()` inside `validate`. This is the same
ordering `identificacion.validator.ts` relies on (its `@Transform` strips non-digits before the
pattern test).

**Regex placement ADR:** the two regexes live as module constants inside the validator file (not
in a shared `vehicle.constants.ts`), because — unlike `ID_TYPE_PATTERNS` which is a
`tipo → pattern` map consumed by both the constraint and the message — these two patterns have a
single consumer. If a future change needs them elsewhere (e.g. a dedicated `patente` query filter),
promote them to a constants module then. YAGNI now.

---

## 3. DTO Changes

**Files:** `server/src/vehicles/dto/create-vehicle.dto.ts` AND
`server/src/vehicles/dto/update-vehicle.dto.ts`.

Repo convention (documented in `update-vehicle.dto.ts` line 5-6): the update DTO **repeats the full
field set** rather than extending `PartialType`. The two classes MUST stay field-for-field
identical. Add the SAME block to both, right after `clienteId` and before `activo` (matches the
`CreateCustomerDto` ordering where `identificacion` sits among the data fields, `activo` last):

New imports at top of BOTH files:
```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsPatenteValida } from './patente.validator';
```
(`IsString` is added to the existing `class-validator` import; `Transform` and the validator are
new import lines.)

New field block in BOTH classes:
```ts
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : value,
  )
  @IsOptional()
  @IsString()
  @IsPatenteValida()
  patente?: string;
```

**Decorator-order rationale:** `@Transform` first (uppercase + strip ALL whitespace, including
internal — a plate has no spaces), then `@IsOptional()` so an absent value skips the remaining
constraints, then `@IsString()` + `@IsPatenteValida()` for provided values. This is the exact
decorator stack `CreateCustomerDto.identificacion` uses (`@Transform` → `@IsOptional` →
`@IsString` → `@IsIdentificacionValida`), differing only in the transform body and the validator.

**Whitespace choice:** `replace(/\s+/g, '')` (strip all) rather than `.trim()` — plates are
contiguous, and a user pasting `AB 123 CD` should normalize to `AB123CD`, not fail. `identificacion`
uses `replace(/\D/g, '')` (digits only) for the same "normalize then validate" intent.

---

## 4. Service Changes

**File:** `server/src/vehicles/vehicles.service.ts`. Five surgical edits:

**4a. `VEHICLE_SELECT` (lines 9-21)** — add `patente: true` after `kilometraje: true`:
```ts
const VEHICLE_SELECT = {
  id: true,
  anio: true,
  kilometraje: true,
  patente: true,        // ← NEW
  activo: true,
  ...
};
```
This one constant feeds `findAll`, `exportToExcel`, `findOne`, `create`, and `update` return
shapes, so adding it here propagates `patente` to every read path at once.

**4b. `buildVehicleWhere` search OR (lines 45-59)** — add a `patente` branch to the `OR` array so
free-text search matches on plate. Unlike marca/cliente (which reach into to-one relations),
`patente` is a scalar on `Vehiculo` itself, so it's a direct `contains`:
```ts
  const searchWhere: Prisma.VehiculoWhereInput = {
    ...(term
      ? {
          OR: [
            { marca: { marca: { contains: term } } },
            { marca: { modelo: { contains: term } } },
            { cliente: { razonSocial: { contains: term } } },
            { patente: { contains: term } },   // ← NEW: scalar, not nested
          ],
        }
      : {}),
    ...(filter.clienteId ? { clienteId: filter.clienteId } : {}),
  };
```
The existing collation note (MySQL `_ci` default) applies unchanged — `contains` is effectively
case-insensitive, so a lowercase search term still matches the uppercase-stored plate.

**4c. `VehicleRow` type (lines 73-80) + `buildVehiclesExcel` (lines 82-111)** — the export builds
from an explicit row type, so BOTH must change:
- Add `patente: string | null;` to `VehicleRow`.
- Add a column to `sheet.columns`. Place it after `Marca` (identity-first ordering), before
  `Color`:
  ```ts
  { header: 'Marca', key: 'marca', width: 28 },
  { header: 'Patente', key: 'patente', width: 14 },   // ← NEW
  { header: 'Color', key: 'color', width: 16 },
  ...
  ```
- In the `for (const r of rows)` row-builder, add `patente: r.patente ?? '',` (empty cell for
  plate-less vehicles — never the literal string "null").

**4d. `create()` data block (lines 183-194)** — add `patente: dto.patente,` (undefined for absent →
Prisma stores `NULL`):
```ts
    data: {
      marcaId: dto.marcaId,
      colorId: dto.colorId,
      anio: dto.anio,
      kilometraje: dto.kilometraje,
      patente: dto.patente,        // ← NEW
      clienteId: dto.clienteId,
      activo: dto.activo,
      creadoPorId,
    },
```

**4e. `update()` data block (lines 207-219)** — add `patente: dto.patente,` identically:
```ts
    data: {
      marcaId: dto.marcaId,
      colorId: dto.colorId,
      anio: dto.anio,
      kilometraje: dto.kilometraje,
      patente: dto.patente,        // ← NEW
      clienteId: dto.clienteId,
      activo: dto.activo,
      actualizadoPorId,
    },
```

**Update semantics note:** because the update DTO always carries the full field set (house
convention) and the client form always sends the current `patente` (see §6 toggle fix), an update
that omits `patente` from the JSON body sends `undefined` → Prisma treats `undefined` as "no
change." A body that sends `patente: null`/`""` would clear it. The client is responsible for always
round-tripping the existing value; the server does not defend against accidental omission (matches
how every other Vehiculo field already behaves).

---

## 5. Client Type / API Changes

**5a. `client/app/lib/vehicles.ts`** — add `patente` to THREE interfaces:
- `VehicleListItem` (lines 4-16): `patente: string | null;` (server returns `null` for plate-less).
- `CreateVehiclePayload` (lines 18-25): `patente?: string;`
- `UpdateVehiclePayload` (lines 27-34): `patente?: string;`

Place after `kilometraje` in each, matching the server field order. No change to the fetch
functions themselves — they serialize whatever the payload holds.

**5b. `client/app/lib/ordenes-trabajo.ts`** — the inline `vehiculo` type on `OrdenTrabajoListItem`
(line 21):
```ts
  vehiculo: { id: number; kilometraje: number; patente: string | null; marca: { marca: string; modelo: string } };
```
Add `patente: string | null;` so the read-only display spots (§6) can render it. The server already
returns it via `VEHICLE_SELECT` on the nested relation — this is purely the client type catching up.

---

## 6. Client UI Changes

**Shared label helper (recommended, not mandatory):** five UI spots need to render
"marca modelo optionally with plate." To avoid five slightly-different inline ternaries, the
cleanest option is a tiny formatter, but this repo currently inlines these labels everywhere and has
no `lib/vehicles` formatter. **Decision:** keep it inline per existing style (each spot already
hand-writes `${marca.marca} ${marca.modelo}`), using the uniform pattern:
```
`${marca} ${modelo}${patente ? ` (${patente})` : ''}`
```
Plate in parentheses, suffix, only when present. This keeps plate-less vehicles reading exactly as
today (no dangling separator) and is trivial to grep for consistency.

**6a. `vehiculos/page.tsx` (list) — THREE edits:**
- **New table column.** Add a `Patente` `<th>` (line ~421, after the `Marca` header) and the
  matching `<td>` (line ~449, after the marca cell). Render `{vehicle.patente ?? '—'}` so
  plate-less rows show an em-dash, consistent with other nullable displays in the app.
- **Search placeholder** (line 319): change `"Marca, modelo o cliente..."` →
  `"Patente, marca, modelo o cliente..."` (plate first — it's the primary disambiguator the whole
  change exists for).
- **`handleToggleActivo` payload (lines 182-189) — CRITICAL REGRESSION FIX.** This handler
  reconstructs a full `UpdateVehiclePayload` from the row. It MUST carry `patente` through, or every
  activate/deactivate would send `patente: undefined` and, if a body value were sent as null, wipe
  the plate. Add the field:
  ```ts
  await updateVehicle(vehicle.id, {
    marcaId: vehicle.marca.id,
    colorId: vehicle.color.id,
    anio: vehicle.anio,
    kilometraje: vehicle.kilometraje,
    patente: vehicle.patente ?? undefined,   // ← NEW: preserve existing plate on toggle
    clienteId: vehicle.cliente.id,
    activo: activating,
  });
  ```
  `?? undefined` maps a `null` list value to an omitted payload field (Prisma "no change"), which is
  the correct preserve-don't-touch semantics for a status toggle. This is the proposal's top-ranked
  High-likelihood risk and is called out as an explicit, non-optional task.

**6b. `vehiculos/nuevo/page.tsx` and `vehiculos/editar/[id]/page.tsx` (forms):**
Add a `patente` text input. Since `FormState` (nuevo lines 14-28) has no `patente`, extend it:
`patente: string;` with `''` in `EMPTY_FORM`. The editar page seeds `FormState` from the loaded
vehicle — seed `patente: vehicle.patente ?? ''`. The input goes alongside Año/Kilometraje (it's a
free-text identity field), as an optional field (no `required`, no red asterisk):
```tsx
<div className="space-y-1">
  <label htmlFor="patente" className="text-sm font-medium text-stone-700">
    Patente
  </label>
  <input
    id="patente"
    type="text"
    value={form.patente}
    onChange={(e) => updateField('patente', e.target.value.toUpperCase())}
    placeholder="Ej: ABC123 o AB123CD"
    maxLength={7}
    className="block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 uppercase focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
  />
</div>
```
In each page's submit builder, add `patente: form.patente || undefined` to the payload (empty string
→ omitted, so a blank input creates/keeps a plate-less vehicle rather than sending `""`).

**6c. `ordenes-trabajo/OrdenTrabajoForm.tsx` (picker label, line 156):**
```ts
return result.data.map((v) => ({
  id: v.id,
  label: `${v.marca.marca} ${v.marca.modelo}${v.patente ? ` (${v.patente})` : ''}`,
}));
```
This is the exact pain point that motivated the whole change — two same-make/model vehicles for one
client now disambiguate by plate in the dropdown.

**6d. `ordenes-trabajo/VehiculoQuickCreateModal.tsx` — TWO edits:**
- **Mini-form field.** Extend `FormState` (lines 24-29) with `patente: string;`, add `patente: ''`
  to `EMPTY_FORM`, and add the same uppercase text input as §6b (its own `htmlFor`, e.g.
  `vehiculo-quick-create-patente`). It's optional, so it does NOT gate the existing
  `if (form.marcaId === '' || form.colorId === '')` required-check. Add `patente: form.patente ||
  undefined` to the `createVehicle({...})` call (lines 103-109).
- **Post-create option label** (line 112): include the plate so the just-created option matches the
  picker format:
  ```ts
  label: `${vehicle.marca.marca} ${vehicle.marca.modelo}${vehicle.patente ? ` (${vehicle.patente})` : ''}`,
  ```

**6e. Read-only display spots — THREE files, four spots (per proposal):**
- `ordenes-trabajo/page.tsx` card view (lines 795-796): append plate to the "Vehículo:" line →
  `{orden.vehiculo.marca.marca} {orden.vehiculo.marca.modelo}{orden.vehiculo.patente ? ` (${orden.vehiculo.patente})` : ''}`.
- `ordenes-trabajo/page.tsx` table view (lines 886-887): the cell already renders
  `marca modelo - NN km`; insert the plate before the km segment, e.g.
  `{marca} {modelo}{patente ? ` (${patente})` : ''} - {km} km`.
- `ordenes-trabajo/[id]/trabajo/page.tsx` (line 1159): the header breadcrumb
  `... · {marca} {modelo} · ...` → add ` (${patente})` when present.
- `ordenes-trabajo/editar/[id]/page.tsx` (line 37): `vehiculoLabel` seeds the edit form's picker
  display — MUST use the same `(${patente})` suffix so the pre-selected value matches what the
  picker (§6c) would render, otherwise the edit form shows a label that differs from the dropdown.

All four use the identical `${patente ? \` (${patente})\` : ''}` guard so plate-less orders read
exactly as today.

---

## 7. Input UX for Uppercase (ADR — load-bearing decision)

**Decision: uppercase on the client at keystroke time (controlled `onChange` doing
`e.target.value.toUpperCase()`), AND keep the server-side `@Transform` as the canonical guard.**
Both layers, not one.

**Why both:**
- **Client keystroke uppercasing** gives immediate WYSIWYG feedback. A user typing `abc123` sees
  `ABC123` appear as they type. The field's whole purpose is to be a recognizable uppercase plate;
  showing it lowercase-until-save is a jarring, low-trust UX for exactly the identifier the operator
  scans by eye. The `uppercase` CSS class is added too as a belt-and-suspenders visual cue, but the
  real value normalization happens in `onChange` so the STATE (not just the pixels) is uppercase and
  the submitted payload is already canonical.
- **Server `@Transform`** remains the source of truth because the client is untrusted: direct API
  calls, the quick-create modal, future integrations, or a bug in the input must never be able to
  persist a lowercase or space-laden plate. The DB uniqueness index is case-sensitive at the value
  level (two rows `abc123`/`ABC123` would both be storable if the server didn't normalize), so
  server-side uppercasing is what actually guarantees the uniqueness constraint is meaningful.

**Rejected alternative — server `@Transform` only:** the field would display lowercase-as-typed
until a save + reload round-trip re-fetched the canonical value. Bad UX (proposal §7 explicitly
flags this) and, worse, the user could submit `abc123`, see it echoed back uppercased, and be
confused about whether their input "changed."

**Rejected alternative — client-only uppercasing:** would look right but leave the server accepting
lowercase from any non-form caller, breaking the case-consistency the unique index depends on.

**Consistency:** the keystroke uppercasing is applied in all THREE plate inputs
(`vehiculos/nuevo`, `vehiculos/editar`, `VehiculoQuickCreateModal`) so behavior is uniform wherever
a plate is entered. Whitespace stripping is left to the server `@Transform` (a mid-word space is
rare during typing and stripping it on keystroke would fight the cursor); the server canonicalizes
on save.

---

## Data Flow Summary

**Create/Update:** form input (client uppercases on keystroke) → payload `patente?: string` →
DTO `@Transform` (uppercase + strip whitespace) → `@IsPatenteValida` (dual-regex) → service `create`/`update`
`data.patente` → Prisma (`NULL` if undefined, else stored; `P2002` on duplicate).

**Read/List/Search:** `VEHICLE_SELECT.patente` → `VehicleListItem.patente` → list column, picker
label, ordenes-trabajo labels. Search term → `buildVehicleWhere` OR `{ patente: { contains } }`.

**Export:** `VEHICLE_SELECT` → `VehicleRow.patente` → `buildVehiclesExcel` "Patente" column
(`?? ''`).

---

## Decisions (ADR digest)

| # | Decision | Rationale | Rejected alternative |
|---|----------|-----------|----------------------|
| D1 | `String? @unique` nullable-unique | MySQL NULLs distinct → no backfill; mirrors `Cliente.identificacion` | Required column (needs fabricated backfill / blocks migration) |
| D2 | Dual fixed regex in the validator file | Single consumer; no `tipo` branching like identificacion | Shared `vehicle.constants.ts` map (YAGNI, one consumer) |
| D3 | `@Transform` uppercase + strip-all-whitespace | Canonical form for uniqueness + validation | `.trim()` only (leaves internal spaces, breaks pasted plates) |
| D4 | Rely on DB `P2002` for duplicates, no manual pre-check | Existing global handler covers it; matches `identificacion` | Manual "exists" query (race-prone, extra round-trip) |
| D5 | Client keystroke uppercasing + server transform (both) | Immediate WYSIWYG + untrusted-client guard | Either layer alone (bad UX / broken uniqueness) |
| D6 | Inline `(${patente})` label guard, no shared formatter | Matches existing inline-label style across the 5 spots | New `lib` formatter (over-abstraction vs current code) |
| D7 | `handleToggleActivo` carries `patente ?? undefined` | Prevents status-toggle from dropping the plate | Omit (proposal's top High-risk regression) |

## Architectural Risks / Assumptions Requiring Validation

- **A1 (validation order):** assumes the global `ValidationPipe` has `transform: true` so `@Transform`
  runs before `@IsPatenteValida`. If it does not, the validator would receive raw lowercase input and
  reject valid plates. Verify the pipe config in `main.ts` during apply; if `transform` is off, the
  validator must uppercase internally instead.
- **A2 (P2002 message):** assumes the existing Prisma-error handling produces an acceptable
  client-facing duplicate-plate message. If the current handler emits a raw/ugly message, a friendly
  mapping may be a follow-up (out of scope here, but flag in verify).
- **A3 (nested select on orden vehiculo):** the ordenes-trabajo endpoints must actually select
  `patente` on the nested `vehiculo`. Confirm the orden service's vehiculo select includes it (this
  design changed only `VehiclesService.VEHICLE_SELECT`; the ordenes-trabajo service has its own
  select and may need `patente: true` added there too — verify during apply and add if missing).
- **A4 (case-sensitive uniqueness):** two plates differing only by case would violate uniqueness only
  if both are stored uppercase; the design guarantees this via server transform. If any code path
  bypasses the DTO (raw Prisma calls in seeds/scripts), it could insert a lowercase plate — acceptable
  for now, no such path exists in scope.
