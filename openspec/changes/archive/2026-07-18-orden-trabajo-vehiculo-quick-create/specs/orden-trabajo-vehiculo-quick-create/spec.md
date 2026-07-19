# Delta for Orden Trabajo Vehiculo Quick Create

## ADDED Requirements

### Requirement: Quick-Create Affordance on the Vehículo Picker

The Vehículo `SearchableSelect` in `OrdenTrabajoForm.tsx` MUST expose a persistent "+ Crear vehículo" action in its results panel, reusing the picker's `create`/`quickCreate` affordance mechanism already used by the Cliente, Marca, and Color pickers.

#### Scenario: Affordance is visible with a customer selected

- GIVEN a customer is selected in `form.clienteId`
- WHEN the Vehículo picker panel is open
- THEN the "+ Crear vehículo" action is visible regardless of whether the vehicle search returns zero, one, or many results

### Requirement: Affordance Disabled Without a Selected Customer

The quick-create affordance MUST be disabled or hidden while `form.clienteId` is `''`, since a vehicle cannot be created without a customer.

#### Scenario: No customer selected blocks quick-create

- GIVEN `form.clienteId` is `''`
- WHEN the operator opens the Vehículo picker
- THEN the "+ Crear vehículo" action is disabled or not shown, and it cannot be activated

#### Scenario: Selecting a customer enables quick-create

- GIVEN `form.clienteId` was empty and the operator then selects a customer
- WHEN the Vehículo picker is opened afterward
- THEN the "+ Crear vehículo" action is enabled and visible

### Requirement: Alta Rápida de Vehículo Mini-Form Fields

Activating the affordance MUST open a dedicated "alta rápida de vehículo" mini-form rendered on `Modal.tsx`, containing Marca (`SearchableSelect` + `marcaSelectConfig`), Color (`SearchableSelect` + `colorSelectConfig`), Año (numeric), and Kilometraje (numeric) — with NO Cliente field.

#### Scenario: Mini-form renders the expected fields only

- GIVEN the operator activates "+ Crear vehículo" with a customer selected
- WHEN the mini-form opens
- THEN it shows Marca, Color, Año, and Kilometraje, and it does not show any Cliente field or selector

### Requirement: Mini-Form Validation Aligned With CreateVehicleDto

The mini-form MUST require Marca and Color, restrict Año to `1900..currentYear+1`, and restrict Kilometraje to a non-negative integer, mirroring the backend `CreateVehicleDto` constraints.

#### Scenario: Out-of-range año blocks submission

- GIVEN Marca, Color, and Kilometraje are valid and Año is outside `1900..currentYear+1`
- WHEN the operator attempts to submit
- THEN submission is blocked with an error, and `createVehicle` is not called

#### Scenario: Valid values allow submission

- GIVEN Marca, Color, a valid Año, and a non-negative integer Kilometraje are filled
- WHEN the operator submits
- THEN the mini-form proceeds to call `createVehicle`

### Requirement: Customer Injected From the Order Form, Never Requested

On submit, the mini-form MUST call the existing `createVehicle` client function with `clienteId` taken from `form.clienteId`; it MUST NOT display or ask the operator to choose a customer.

#### Scenario: Submit uses the order's customer

- GIVEN the mini-form is open for an order whose `form.clienteId` is a given customer
- WHEN the operator submits valid Marca, Color, Año, and Kilometraje
- THEN `createVehicle` is called with that same `clienteId`, without any customer field ever having been shown

### Requirement: Auto-Select and Close on Successful Creation

When `createVehicle` succeeds, the returned vehicle MUST be auto-selected into `form.vehiculoId` through the same setter the picker already uses, and both the mini-form and the Vehículo picker panel MUST close.

#### Scenario: Successful creation selects the new vehicle and closes both layers

- GIVEN the mini-form submission succeeds
- WHEN the created vehicle is returned
- THEN `form.vehiculoId` is set to that vehicle's id via the existing setter, the mini-form closes, and the Vehículo picker panel closes

### Requirement: Customer-Scoped Search Consistency

Because `vehiculoSearch` already scopes results by `clienteId`, a vehicle created inline MUST appear in subsequent Vehículo searches for that same customer.

#### Scenario: Newly created vehicle appears in a later search

- GIVEN a vehicle was just created inline for the order's customer
- WHEN the operator reopens the Vehículo picker and searches for that customer
- THEN the newly created vehicle is included in the results

### Requirement: Nested Quick-Create for Marca and Color Preserved

Marca and Color inside the mini-form MUST retain their own inline quick-create, inherited unchanged from `marcaSelectConfig`/`colorSelectConfig`.

#### Scenario: Creating a brand from inside the vehicle mini-form

- GIVEN the vehicle mini-form is open and the operator activates Marca's own "+ Crear marca" action
- WHEN a new brand is created successfully
- THEN it is auto-selected into the mini-form's Marca field, and the vehicle mini-form itself remains open

### Requirement: Three-Layer Nested Escape and Focus Contract

When Marca's or Color's own quick-create (a third layer) is open on top of the vehicle mini-form, which is itself on top of the Vehículo picker panel, pressing Escape MUST close only the topmost active layer per keypress, without cascading, and MUST return focus to the layer immediately below it.

#### Scenario: Escape with the third layer open closes only that layer

- GIVEN the Vehículo panel, the vehicle mini-form, and Marca's (or Color's) own quick-create are all open, nested in that order
- WHEN the operator presses Escape once
- THEN only Marca's (or Color's) quick-create closes, the vehicle mini-form remains open, and focus returns to the mini-form's Marca (or Color) control

#### Scenario: A further Escape then closes the mini-form, not the panel

- GIVEN only the vehicle mini-form and the Vehículo panel remain open, in that order
- WHEN the operator presses Escape
- THEN the vehicle mini-form closes, the Vehículo panel remains open, and focus returns to the panel's search input

### Requirement: Dirty-Tracking on the Edit Page for Quick-Created Vehicles

On `ordenes-trabajo/editar/[id]`, selecting a vehicle created via this quick-create flow MUST go through the same `vehiculoId` setter used for existing vehicles, so `isFormDirty`, the `beforeunload` guard, and the discard-confirm dialog behave identically to selecting an existing vehicle.

#### Scenario: Selecting a freshly created vehicle marks the edit form dirty

- GIVEN the edit page is loaded with no changes made yet
- WHEN the operator creates a vehicle inline and it is auto-selected into `form.vehiculoId`
- THEN `isFormDirty()` becomes true, and the `beforeunload` guard and discard-confirm dialog behave exactly as they would for selecting an existing vehicle

### Requirement: No Backend or Generic Quick-Create Component Changes

This capability MUST NOT modify any backend DTO, validator, service, or controller, and MUST NOT modify the generic `QuickCreateModal`/`QuickCreateField` components.

#### Scenario: Backend and generic quick-create files are unmodified

- GIVEN this capability is implemented
- WHEN the resulting changeset is reviewed
- THEN no backend DTO, validator, service, or controller file has changed, and `QuickCreateModal.tsx`/`QuickCreateField` remain unmodified
