# Presupuestos Management UI Specification

## Purpose

Page-based list/create/edit frontend for presupuestos, mirroring `client/app/(dashboard)/productos/`'s CRUD shape (list page + `nuevo` + `editar/[id]`, not a modal). Reuses the existing `clienteSelectConfig`/`SearchableSelect` for the cliente picker and `searchProductos` for the product combobox; the product line-item editor is duplicated (not extracted) from `ordenes-trabajo`.

## Requirements

### Requirement: Presupuestos List Page

`client/app/(dashboard)/presupuestos/page.tsx` MUST fetch and display presupuestos in a simple table (no card-view toggle) with a search input and an `activo` filter, calling `GET /presupuestos`.

#### Scenario: Page loads and displays the presupuesto list

- GIVEN an authenticated user navigates to `/presupuestos`
- WHEN the page mounts
- THEN it fetches `GET /presupuestos` and renders a table row per presupuesto including cliente and tipo de servicio

#### Scenario: Search and activo filter narrow the displayed list

- GIVEN presupuestos with varying `activo` states are loaded
- WHEN the user enters a search term or selects an `activo` filter value
- THEN the displayed rows are narrowed accordingly, matching the `productos` page's filter pattern

#### Scenario: No table/card view toggle is present

- GIVEN the list page has rendered
- WHEN the page's UI is inspected
- THEN no control exists to switch between a table view and a card view

### Requirement: Create Presupuesto Page

`client/app/(dashboard)/presupuestos/nuevo/page.tsx` MUST render a form with a cliente picker, a tipo-servicio picker, `fecha`, `telefono`, `descripcion`, and a product line-item editor, submitting via `POST /presupuestos` on success and navigating back to the list.

#### Scenario: Creating a presupuesto with line items

- GIVEN the create form is filled with a cliente, a tipo de servicio, a fecha, and at least one product line item
- WHEN the form is submitted
- THEN `POST /presupuestos` is called with the header fields and the `productos[]` array, and on success the user is returned to the list

#### Scenario: Creating a presupuesto without line items

- GIVEN the create form is filled with only the required header fields and no line items
- WHEN the form is submitted
- THEN `POST /presupuestos` is called with an empty or omitted `productos[]` and the presupuesto is created

### Requirement: Edit Presupuesto Page

`client/app/(dashboard)/presupuestos/editar/[id]/page.tsx` MUST fetch the presupuesto via `GET /presupuestos/:id`, pre-fill the header form and the line-item editor, submit header changes via `PATCH /presupuestos/:id`, and submit line-item add/update/remove through the dedicated line-item sub-routes.

#### Scenario: Editing header fields

- GIVEN the edit page has loaded an existing presupuesto
- WHEN the user changes `descripcion` and saves
- THEN `PATCH /presupuestos/:id` is called with the full required body reflecting the change

#### Scenario: Adding a line item from the edit page

- GIVEN the edit page has loaded an existing presupuesto
- WHEN the user adds a product through the line-item editor
- THEN `POST /presupuestos/:id/productos` is called and the new/updated line appears in the editor without a full page reload

#### Scenario: Removing a line item from the edit page

- GIVEN the edit page shows an existing line item
- WHEN the user removes it
- THEN `DELETE /presupuestos/:id/productos/:detalleId` is called and the line item no longer appears in the editor

### Requirement: Cliente and Tipo de Servicio Pickers Reuse Existing Components

The create/edit forms MUST use `clienteSelectConfig`/`SearchableSelect` (`client/app/(dashboard)/vehiculos/`) for the cliente picker, unmodified, and MUST provide an equivalent single-select reference config for the tipo de servicio picker.

#### Scenario: Cliente picker behaves identically to its existing usage

- GIVEN the create or edit form's cliente picker
- WHEN the user searches and selects a cliente
- THEN the picker's search/select behavior matches its existing usage in the vehículos module, unmodified

### Requirement: Product Line-Item Editor Is Presupuestos-Local

The product line-item editor used on the create and edit pages MUST be a component local to the presupuestos route group (duplicated from the `ordenes-trabajo` pattern), using `searchProductos` from `client/app/lib/productos.ts` for the combobox, and MUST NOT be imported from or shared with the `ordenes-trabajo` module in this change.

#### Scenario: Editor is not imported from ordenes-trabajo

- GIVEN the presupuestos line-item editor component
- WHEN its imports are inspected
- THEN it does not import the `ordenes-trabajo` line-item component; it is a separate, local implementation

### Requirement: Loading, Error, and Empty States

The list page MUST show a loading indicator while the list request is in flight, MUST show an error message without crashing if the request fails, and MUST render without crashing when the list is empty.

#### Scenario: Loading state while fetching

- GIVEN the list page has just mounted
- WHEN the `GET /presupuestos` request has not yet resolved
- THEN a loading indicator is shown and no table rows are rendered

#### Scenario: Error state on request failure

- GIVEN `GET /presupuestos` fails (network error or non-2xx response)
- WHEN the page handles the failure
- THEN an error message is displayed and the page does not crash

#### Scenario: Empty state with zero presupuestos

- GIVEN `GET /presupuestos` resolves with an empty array
- WHEN the page renders
- THEN it shows an empty-state message and does not throw

### Requirement: Uses Established Auth Header Contract

All requests to the presupuestos and line-item endpoints MUST attach the `Authorization` header using the existing `getAuthHeader()` function from `client/app/lib/auth.ts`, via a new `client/app/lib/presupuestos.ts` API client. This capability MUST NOT re-derive or duplicate that header logic.

#### Scenario: Requests carry the Bearer token from getAuthHeader

- GIVEN a logged-in user with a valid token
- WHEN any presupuestos page calls the API client
- THEN the request includes the `Authorization` header produced by `getAuthHeader()`

### Requirement: No New Route Protection

This capability MUST NOT add any role-based or permission-based gating to the `/presupuestos` routes or their actions. The pages remain reachable by any authenticated user, unchanged from the existing `session-routing` middleware protection and the `app-navigation` "No Role Filtering in V1" requirement.

#### Scenario: Any authenticated user can reach and use the pages

- GIVEN a valid `token` cookie for a user with any `rol`
- WHEN that user navigates to `/presupuestos`, `/presupuestos/nuevo`, or `/presupuestos/editar/[id]`
- THEN each page loads and all create/edit actions are available, with no role check applied
