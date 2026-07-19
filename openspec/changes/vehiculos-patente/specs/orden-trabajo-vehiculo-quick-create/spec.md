# Delta for Orden Trabajo Vehiculo Quick Create

## MODIFIED Requirements

### Requirement: Alta Rápida de Vehículo Mini-Form Fields

Activating the affordance MUST open a dedicated "alta rápida de vehículo" mini-form rendered on `Modal.tsx`, containing Marca (`SearchableSelect` + `marcaSelectConfig`), Color (`SearchableSelect` + `colorSelectConfig`), Año (numeric), Kilometraje (numeric), and Patente (optional text, uppercase+trim on input) — with NO Cliente field.
(Previously: mini-form had no Patente field.)

#### Scenario: Mini-form renders the expected fields only

- GIVEN the operator activates "+ Crear vehículo" with a customer selected
- WHEN the mini-form opens
- THEN it shows Marca, Color, Año, Kilometraje, and Patente, and it does not show any Cliente field or selector

#### Scenario: Patente is optional in the mini-form

- GIVEN Marca, Color, Año, and Kilometraje are valid and Patente is left blank
- WHEN the operator submits
- THEN submission proceeds and `createVehicle` is called with no `patente` (or an empty value normalized server-side to `null`)

### Requirement: Mini-Form Validation Aligned With CreateVehicleDto

The mini-form MUST require Marca and Color, restrict Año to `1900..currentYear+1`, restrict Kilometraje to a non-negative integer, and — when Patente is filled — restrict it to the dual Argentine formats (`LLLNNN` or `LLNNNLL`), mirroring the backend `CreateVehicleDto` constraints.
(Previously: no Patente format constraint existed.)

#### Scenario: Out-of-range año blocks submission

- GIVEN Marca, Color, and Kilometraje are valid and Año is outside `1900..currentYear+1`
- WHEN the operator attempts to submit
- THEN submission is blocked with an error, and `createVehicle` is not called

#### Scenario: Valid values allow submission

- GIVEN Marca, Color, a valid Año, a non-negative integer Kilometraje, and either a blank Patente or a validly formatted one are filled
- WHEN the operator submits
- THEN the mini-form proceeds to call `createVehicle`

#### Scenario: Invalid patente format blocks submission

- GIVEN Marca, Color, Año, and Kilometraje are valid and Patente is filled with a value matching neither Argentine format
- WHEN the operator attempts to submit
- THEN submission is blocked with an error, and `createVehicle` is not called

### Requirement: Auto-Select and Close on Successful Creation

When `createVehicle` succeeds, the returned vehicle MUST be auto-selected into `form.vehiculoId` through the same setter the picker already uses, with the option's display label including the vehicle's `patente` when present (falling back to the marca/modelo-only label when absent), and both the mini-form and the Vehículo picker panel MUST close.
(Previously: label used only marca/modelo, with no patente-aware branch.)

#### Scenario: Successful creation selects the new vehicle and closes both layers

- GIVEN the mini-form submission succeeds
- WHEN the created vehicle is returned
- THEN `form.vehiculoId` is set to that vehicle's id via the existing setter, the mini-form closes, and the Vehículo picker panel closes

#### Scenario: Post-create label includes patente when present

- GIVEN the mini-form submission succeeds for a vehicle created with `patente: 'ABC123'`
- WHEN the created vehicle is auto-selected
- THEN the option's display label includes `ABC123` alongside marca and modelo

#### Scenario: Post-create label omits patente when absent

- GIVEN the mini-form submission succeeds for a vehicle created without a `patente`
- WHEN the created vehicle is auto-selected
- THEN the option's display label shows only marca and modelo, unchanged from before this capability
