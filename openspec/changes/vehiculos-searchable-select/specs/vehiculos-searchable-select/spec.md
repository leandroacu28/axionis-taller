# Delta for Vehiculos Searchable Select

## ADDED Requirements

### Requirement: SearchableSelect Replaces Native Selects

The vehicle create and edit forms (`client/app/(dashboard)/vehiculos/nuevo/page.tsx` and `client/app/(dashboard)/vehiculos/editar/[id]/page.tsx`) MUST render the Marca, Color, and Cliente fields using the new searchable combobox component instead of native `<select>` elements.

#### Scenario: Vehicle form fields render as searchable comboboxes

- GIVEN an authenticated user navigates to `/vehiculos/nuevo` or `/vehiculos/editar/[id]`
- WHEN the page renders
- THEN the Marca, Color, and Cliente fields are rendered as the searchable combobox component, not as native `<select>` elements

### Requirement: Server-Side Debounced Search

The combobox's search input MUST query the entity's existing `list*` endpoint (`listBrands`, `listColors`, or `listCustomers`) with `search` and `status: 'activo'` parameters, debounced 350ms after the last keystroke, using the same instant-`searchInput`/debounced-`search` two-state pattern already established in `vehiculos/page.tsx`.

#### Scenario: Typing triggers a debounced search request

- GIVEN a combobox panel is open with its search input focused
- WHEN the user types a search term
- THEN the input value updates instantly, and 350ms after the last keystroke the entity's `list*` function is called with `search` set to that term and `status: 'activo'`

#### Scenario: Rapid typing does not fire a request per keystroke

- GIVEN a combobox panel is open with its search input focused
- WHEN the user types several characters within less than 350ms of each other
- THEN only one `list*` request fires, using the value after the last keystroke, once 350ms of inactivity has elapsed

### Requirement: Keyboard and Mouse Result Selection

The combobox results panel MUST support selecting a result via Arrow Up/Down keyboard navigation plus Enter, and via mouse click.

#### Scenario: Arrow keys move the highlight and Enter selects it

- GIVEN a combobox panel is open with search results rendered
- WHEN the user presses Arrow Down or Arrow Up
- THEN the highlighted result moves to the next or previous result in the list
- WHEN the user then presses Enter
- THEN the currently highlighted result is selected into the field and the panel closes

#### Scenario: Mouse click selects a result

- GIVEN a combobox panel is open with search results rendered
- WHEN the user clicks a result with the mouse
- THEN that result is selected into the field and the panel closes

### Requirement: Escape Closes the Panel Without Clearing Selection

When the combobox panel is open and no quick-create modal is open, pressing Escape MUST close the panel, return focus to the control, and MUST NOT clear the field's current selection.

#### Scenario: Escape closes an open panel and preserves the current value

- GIVEN a combobox panel is open and the field currently has a selected value (or no value)
- WHEN the user presses Escape
- THEN the panel closes, focus returns to the control, and the field's selected value is unchanged

### Requirement: Nested Escape Behavior With Quick-Create Modal

When the quick-create modal is open on top of an open combobox panel, pressing Escape MUST close only the modal, leaving the panel open with focus returned to its search input; the panel MUST NOT also close in that same keypress. A subsequent Escape press, with only the panel now open, MUST then close the panel per the standalone Escape behavior.

#### Scenario: Escape with the quick-create modal open closes only the modal

- GIVEN a combobox panel is open and its quick-create modal is open on top of it
- WHEN the user presses Escape once
- THEN the quick-create modal closes, the combobox panel remains open, and focus returns to the panel's search input

#### Scenario: A second Escape then closes the panel

- GIVEN the quick-create modal has just been closed by Escape and only the combobox panel remains open
- WHEN the user presses Escape again
- THEN the combobox panel closes and focus returns to the control

### Requirement: Persistent Quick-Create Affordance

The combobox results panel MUST always display a `+ Crear <entity>` action, regardless of whether the current search returns zero, one, or many results.

#### Scenario: Quick-create action is visible with results present

- GIVEN a combobox panel is open and the current search returns one or more matching results
- WHEN the results render
- THEN the `+ Crear <entity>` action is also visible in the panel

#### Scenario: Quick-create action is visible with zero results

- GIVEN a combobox panel is open and the current search returns zero matching results
- WHEN the empty results state renders
- THEN the `+ Crear <entity>` action is still visible in the panel

### Requirement: Color Quick-Create Modal

Triggering the quick-create action on the Color combobox MUST open a mini-modal, built on the existing `Modal.tsx`, with a single `descripcion` field, and MUST submit via the existing `createColor` client function using its existing validation.

#### Scenario: A new color is created from the vehicle form

- GIVEN the Color combobox's quick-create modal is open with a valid `descripcion` entered
- WHEN the modal is submitted
- THEN `createColor` is called with that `descripcion` and, on success, the modal closes

### Requirement: Marca Quick-Create Modal

Triggering the quick-create action on the Marca combobox MUST open a mini-modal, built on the existing `Modal.tsx`, with `marca` and `modelo` fields, and MUST submit via the existing `createBrand` client function using its existing validation.

#### Scenario: A new brand is created from the vehicle form

- GIVEN the Marca combobox's quick-create modal is open with valid `marca` and `modelo` values entered
- WHEN the modal is submitted
- THEN `createBrand` is called with those values and, on success, the modal closes

### Requirement: Cliente Quick-Create Modal

Triggering the quick-create action on the Cliente combobox MUST open a mini-modal, built on the existing `Modal.tsx`, with `razonSocial`, `tipoIdentificacion` (enum `dni`/`cuit`/`cuil`), `identificacion`, `telefono`, and `domicilio` fields, applying the same validation as `/clientes/nuevo`, and MUST submit via the existing `createCustomer` client function. On a 409 `ConflictException` for a duplicate `identificacion`, the modal MUST surface the same error message shown by `/clientes/nuevo`.

#### Scenario: A new customer is created from the vehicle form

- GIVEN the Cliente combobox's quick-create modal is open with valid `razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, and `domicilio` values entered
- WHEN the modal is submitted
- THEN `createCustomer` is called with those values and, on success, the modal closes

#### Scenario: Duplicate identificacion is rejected with the same message as the dedicated page

- GIVEN the Cliente combobox's quick-create modal is open with an `identificacion` value that already belongs to another customer
- WHEN the modal is submitted
- THEN `createCustomer` responds with a 409 `ConflictException`, and the modal displays the same duplicate-`identificacion` error message shown by `/clientes/nuevo`, without closing

### Requirement: Auto-Select on Successful Quick-Create

When a quick-create submission succeeds, the newly created record MUST become the selected value of the combobox field in the parent form, and both the quick-create modal and the combobox panel MUST close.

#### Scenario: Newly created record is selected and both layers close

- GIVEN a quick-create modal submission for Color, Marca, or Cliente succeeds
- WHEN the created record is returned
- THEN that record becomes the selected value for the corresponding field in the vehicle form, the quick-create modal closes, and the combobox panel closes

### Requirement: Dirty-Tracking Preserved on Edit Page

On `vehiculos/editar/[id]/page.tsx`, selecting a combobox value — whether an existing record or one just created via quick-create — MUST go through the same `updateField` setter previously used by the native `<select onChange>` handlers, so that the page's `isFormDirty` check, `beforeunload` listener, and discard-confirm dialog keep functioning without any change to that mechanism.

#### Scenario: Selecting a value marks the edit form dirty

- GIVEN the edit page is loaded with its initial values and no changes have been made
- WHEN the user selects a different value in the Marca, Color, or Cliente combobox
- THEN `updateField` is called with the field key and the selected id, `isFormDirty()` becomes true, and the `beforeunload` guard and discard-confirm dialog behave exactly as they did for the native `<select>`

#### Scenario: Selecting a freshly quick-created record marks the edit form dirty

- GIVEN the edit page is loaded with its initial values and no changes have been made
- WHEN the user creates a new record via a combobox's quick-create modal and it is auto-selected
- THEN `updateField` is called with the field key and the new record's id, and `isFormDirty()` becomes true exactly as it would for selecting any other existing option

### Requirement: No Backend Changes

This capability MUST NOT modify any backend DTO, validator, service, or controller. It MUST consume the existing `listBrands`, `listColors`, `listCustomers`, `createColor`, `createBrand`, and `createCustomer` client functions and their existing server contracts as-is.

#### Scenario: Backend files are unmodified by this capability

- GIVEN this capability is implemented
- WHEN the resulting changeset is reviewed
- THEN no backend DTO, validator, service, or controller file has been modified, and all data access goes through the existing `list*`/`create*` client functions

### Requirement: Scope Boundary on Other Pages and Components

This capability MUST NOT alter the colores, marcas, or clientes list pages, their own `ColorFormModal.tsx` or `BrandFormModal.tsx` modals, or any select in any other form outside the vehicle create/edit pages' Marca, Color, and Cliente fields.

#### Scenario: Unrelated list pages and modals are unchanged

- GIVEN this capability is implemented
- WHEN the resulting changeset is reviewed
- THEN `colores/page.tsx`, `marcas/page.tsx`, `clientes/page.tsx`, `ColorFormModal.tsx`, and `BrandFormModal.tsx` are unmodified, and no select outside the vehicle create/edit pages' Marca, Color, and Cliente fields has been changed
