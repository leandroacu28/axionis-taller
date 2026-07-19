# Delta for Vehicle Plate

## ADDED Requirements

### Requirement: Vehiculo Patente Field Is Optional and Unique

The `Vehiculo` Prisma model MUST declare `patente String? @unique`. The migration MUST be additive-only (no existing table/column dropped or altered). Because MySQL treats each `NULL` as distinct under a unique index, existing rows (all `NULL`) MUST remain valid without backfill, and multiple vehicles MUST be able to coexist with no `patente`.

#### Scenario: Migration adds patente without touching existing rows

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN `Vehiculo` has a nullable, unique `patente` column
- AND no existing vehicle row's other columns changed and no existing table was altered

#### Scenario: Multiple plate-less vehicles coexist

- GIVEN two vehicles are created without supplying `patente`
- WHEN both creations are processed
- THEN both succeed and both stored rows have `patente: null`

### Requirement: Dual Argentine Plate Format Validation

`CreateVehicleDto` and `UpdateVehicleDto` MUST validate `patente`, when present, against exactly two formats: the legacy `LLLNNN` (3 letters + 3 digits, e.g. `ABC123`) and the Mercosur `LLNNNLL` (2 letters + 3 digits + 2 letters, e.g. `AB123CD`), applied via fixed dual-regex with no sibling-field branching. `patente` MUST remain optional — an absent value MUST pass validation regardless of format.

#### Scenario: Legacy format is accepted

- GIVEN a create or update body with `patente: 'ABC123'`
- WHEN the request is validated
- THEN validation passes

#### Scenario: Mercosur format is accepted

- GIVEN a create or update body with `patente: 'AB123CD'`
- WHEN the request is validated
- THEN validation passes

#### Scenario: An invalid format is rejected

- GIVEN a create or update body with `patente: 'AB1234'` (matching neither format)
- WHEN the request is validated
- THEN validation fails with 400 and no vehicle is created or modified

#### Scenario: Absent patente passes validation

- GIVEN a create or update body that omits `patente`
- WHEN the request is validated
- THEN validation passes independently of the format rules

### Requirement: Uppercase and Trim Transform

`patente` MUST be transformed to uppercase with surrounding whitespace stripped before format validation and before persistence, so format matching and uniqueness comparisons are case-insensitive from the caller's perspective.

#### Scenario: Lowercase input is normalized before validation and storage

- GIVEN a create body with `patente: 'abc123'`
- WHEN the vehicle is created
- THEN the stored `patente` is `'ABC123'`

#### Scenario: Surrounding whitespace is stripped

- GIVEN a create body with `patente: '  ab123cd  '`
- WHEN the vehicle is created
- THEN the stored `patente` is `'AB123CD'`

### Requirement: Empty String Normalizes to NULL

An empty or whitespace-only `patente` submitted on create or update MUST be normalized to `null`, not stored as an empty string, so it does not collide with the unique index and existing plate-less vehicles remain unaffected.

#### Scenario: Blank patente stores as null

- GIVEN a create or update body with `patente: ''` (or omitted entirely)
- WHEN the vehicle is saved
- THEN the stored `patente` is `null`, and a second vehicle saved the same way also stores `patente: null` without conflict

### Requirement: Duplicate Patente Rejected on Create and Update

Creating or updating a vehicle with a `patente` already used by a different vehicle MUST return 409, using a pre-check plus a Prisma `P2002` backstop (same TOCTOU-safe pattern as `Cliente.identificacion`). A vehicle updated with its own unchanged `patente` MUST NOT be rejected as a duplicate of itself.

#### Scenario: Duplicate patente rejected on create

- GIVEN an existing vehicle with `patente: 'ABC123'`
- WHEN `POST /vehicles` is called with `patente: 'ABC123'`
- THEN it returns 409 and no new vehicle is created

#### Scenario: Duplicate patente rejected on update

- GIVEN two existing vehicles A (`patente: 'ABC123'`) and B (`patente: 'XYZ789'`)
- WHEN `PATCH /vehicles/:id` is called on B with `patente: 'ABC123'`
- THEN it returns 409 and B is not modified

#### Scenario: Updating a vehicle with its own existing patente succeeds

- GIVEN an existing vehicle with `patente: 'ABC123'`
- WHEN `PATCH /vehicles/:id` is called on that same vehicle with `patente: 'ABC123'` unchanged
- THEN it returns 200 and the update succeeds

### Requirement: Patente Exposed in Select, Search, and Export

`VEHICLE_SELECT` MUST include `patente`. `buildVehicleWhere`'s free-text search MUST include `patente` in its `OR` clause alongside marca/modelo/cliente. `buildVehiclesExcel` MUST add a `Patente` column, rendering an empty cell (not the literal string `null`) when `patente` is `null`.

#### Scenario: List and detail responses include patente

- GIVEN an existing vehicle with `patente: 'ABC123'`
- WHEN `GET /vehicles` or `GET /vehicles/:id` is called
- THEN the response includes `patente: 'ABC123'` for that vehicle

#### Scenario: Free-text search matches by patente

- GIVEN a vehicle with `patente: 'ABC123'`
- WHEN `GET /vehicles?search=ABC123` is called
- THEN that vehicle is included in the results

#### Scenario: Export includes a Patente column

- GIVEN vehicles with and without a `patente` value
- WHEN `GET /vehicles/export` is called
- THEN the workbook includes a `Patente` column, with each vehicle's value or an empty cell when `patente` is `null`

### Requirement: Toggling Vehiculo Activo Preserves Patente

The client vehiculos list page's `handleToggleActivo` MUST include the vehicle's existing `patente` value in the reconstructed `UpdateVehiclePayload` sent to `PATCH /vehicles/:id`. Toggling `activo` MUST NOT null out or drop an existing `patente`.

#### Scenario: Toggling activo preserves an existing patente

- GIVEN a vehicle with `patente: 'ABC123'` and `activo: true`
- WHEN the operator toggles its `activo` status from the list page
- THEN the request payload includes `patente: 'ABC123'`
- AND the stored vehicle's `patente` remains `'ABC123'` after the toggle

#### Scenario: Toggling activo on a plate-less vehicle keeps patente null

- GIVEN a vehicle with `patente: null`
- WHEN the operator toggles its `activo` status
- THEN the request payload's `patente` remains `null` and no validation error occurs
