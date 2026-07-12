# Customers Management UI Specification

## Purpose

Frontend `/clientes` list, create, and edit pages, reusing the `usuarios` list/create/edit pattern and `alerts.ts` toast/confirm behavior verbatim.

## Requirements

### Requirement: Clientes List Page

`client/app/(dashboard)/clientes/page.tsx` MUST be a client-rendered page that fetches the cliente list via `GET /customers` on mount and displays it in a table. It MUST provide in-memory search filtering over `razonSocial`, `identificacion`, and `telefono`, a status filter that defaults to showing only `activo: true` clientes, pagination, and a status toggle action per row that calls `PATCH /customers/:id` with the flipped `activo` value.

#### Scenario: Page loads and displays clientes filtered to activo by default

- GIVEN an authenticated user navigates to `/clientes`
- WHEN the page mounts
- THEN it fetches `GET /customers` and renders only clientes with `activo: true` by default

#### Scenario: Search filters by razon social, identificacion, or telefono

- GIVEN the clientes list has loaded
- WHEN the user types a query matching a substring of any cliente's `razonSocial`, `identificacion`, or `telefono`
- THEN only matching rows remain visible, filtered in-memory without a new network request

#### Scenario: Status filter can show inactive clientes

- GIVEN the clientes list has loaded with the default activo filter applied
- WHEN the user switches the status filter to include inactive clientes
- THEN clientes with `activo: false` also become visible

#### Scenario: Status toggle updates activo via PATCH

- GIVEN a visible cliente row
- WHEN the user triggers the status toggle action on that row
- THEN `PATCH /customers/:id` is called with the flipped `activo` value
- AND the row reflects the new status without a full page reload

#### Scenario: Pagination limits visible rows

- GIVEN the filtered cliente list exceeds one page of results
- WHEN the page renders
- THEN only the current page's rows are shown, with controls to navigate to other pages

### Requirement: Create Customer Page

`client/app/(dashboard)/clientes/nuevo/page.tsx` MUST render a form requiring `razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, and `domicilio`, and MUST submit via `POST /customers`. It MUST validate all required fields are filled before submission and MUST show a success toast (via `alerts.ts`) and navigate back to the list on success.

#### Scenario: Successful creation shows success toast and returns to list

- GIVEN the create form is filled with all required fields and a valid `identificacion` for the selected `tipoIdentificacion`
- WHEN the form is submitted
- THEN `POST /customers` is called, a success toast is shown via `alerts.ts`, and the user is returned to `/clientes`

#### Scenario: Missing required field blocks submission

- GIVEN the create form is missing a required field
- WHEN the user attempts to submit
- THEN `POST /customers` is NOT called and a validation message is shown

#### Scenario: Duplicate identificacion shows an error toast

- GIVEN the create form is submitted with an `identificacion` that already exists
- WHEN `POST /customers` responds with 409
- THEN an error toast is shown via `alerts.ts` and the user remains on the create form with entered data intact

### Requirement: Edit Customer Page

`client/app/(dashboard)/clientes/editar/[id]/page.tsx` MUST load the existing cliente via `GET /customers/:id` on mount (guarded against unmount races), pre-fill the form, and submit changes via `PATCH /customers/:id`. It MUST show a success toast and navigate back to the list on success, and MUST warn (via `alerts.ts` confirm) before discarding unsaved edits on navigation away.

#### Scenario: Edit page loads and pre-fills existing data

- GIVEN a valid existing cliente id in the route
- WHEN the edit page mounts
- THEN it fetches `GET /customers/:id` and pre-fills the form with the returned values

#### Scenario: Successful edit shows success toast and returns to list

- GIVEN the edit form has a changed field
- WHEN the form is submitted
- THEN `PATCH /customers/:id` is called with the changed fields, a success toast is shown, and the user is returned to `/clientes`

#### Scenario: Unmount before load resolves does not update state

- GIVEN the edit page has requested `GET /customers/:id` but not yet received a response
- WHEN the user navigates away before the response resolves
- THEN the component does not attempt to set state after unmount

### Requirement: Loading, Error, and Empty States on List Page

The `/clientes` list page MUST show a loading indicator while `GET /customers` is in flight, MUST show an error message without crashing if the request fails, and MUST render a distinct empty-state message when the filtered result set is empty.

#### Scenario: Loading state while fetching

- GIVEN the page has just mounted
- WHEN the `GET /customers` request has not yet resolved
- THEN a loading indicator is shown and no table rows are rendered

#### Scenario: Error state on request failure

- GIVEN `GET /customers` fails (network error or non-2xx response)
- WHEN the page handles the failure
- THEN an error message is displayed and the page does not crash

#### Scenario: Empty state with zero matching clientes

- GIVEN the current search/status filter matches zero clientes
- WHEN the page renders
- THEN it shows an empty-state message and does not throw

### Requirement: Typed Customers API Client

`client/app/lib/customers.ts` MUST export a typed API client mirroring `lib/users.ts`: a list-item interface matching the `CUSTOMER_SELECT` response shape, `CreateCustomerPayload`/`UpdateCustomerPayload` types, and functions for list/get/create/update that each attach the `Authorization` header via `getAuthHeader()` and parse responses through a shared `handleJsonResponse<T>()`.

#### Scenario: All customer API calls attach the auth header

- GIVEN a logged-in user with a valid token
- WHEN the page calls any function from `client/app/lib/customers.ts`
- THEN the request includes the `Authorization` header produced by `getAuthHeader()`

### Requirement: No New Route Protection

This capability MUST NOT add any role-based or permission-based gating to `/clientes` or its actions. The pages remain reachable by any authenticated user, unchanged from the existing `session-routing` middleware protection.

#### Scenario: Any authenticated user can reach and use the clientes pages

- GIVEN a valid `token` cookie for a user with any `rol`
- WHEN that user navigates to `/clientes`, `/clientes/nuevo`, or `/clientes/editar/[id]`
- THEN the pages load and all create/edit/toggle actions are available, with no role check applied

### Requirement: Export Button on Clientes List

The `/clientes` list header MUST include an "Exportar" button placed next to the existing "Nuevo cliente" action, styled as a secondary/outline button (not the primary rose-gradient style reserved for "Nuevo cliente"). Clicking it MUST trigger a download of `GET /customers/export`'s response, using the list's current `search` and `statusFilter` values, saved as `clientes.xlsx`.

#### Scenario: Export button downloads Excel file with current filters

- GIVEN the clientes list has an active `search` term and a `statusFilter` value
- WHEN the user clicks "Exportar"
- THEN a request is made carrying those same `search` and `status` values to the export endpoint
- AND the response is saved as a file named `clientes.xlsx`

#### Scenario: Export button uses secondary styling

- GIVEN the `/clientes` list header renders both "Nuevo cliente" and "Exportar"
- WHEN the buttons are rendered
- THEN "Exportar" uses the secondary/outline style and "Nuevo cliente" retains the rose-gradient primary style

### Requirement: Typed Export API Client Function

`client/app/lib/customers.ts` MUST export an `exportCustomers({ search, status })` function that fetches `GET /customers/export` with those query params, attaches the `Authorization` header via `getAuthHeader()`, and resolves to a `Blob` on success following the module's existing `fetch` → check `res.ok` → throw-on-failure convention.

#### Scenario: exportCustomers attaches auth header and returns a Blob

- GIVEN a logged-in user with a valid token
- WHEN `exportCustomers({ search, status })` is called
- THEN the request includes the `Authorization` header produced by `getAuthHeader()`
- AND on a successful response it resolves to a `Blob`

#### Scenario: Failed export request throws

- GIVEN `GET /customers/export` responds with a non-2xx status
- WHEN `exportCustomers` handles that response
- THEN it throws, matching the error-handling convention used by other functions in `customers.ts`

### Requirement: Browser Download Trigger and Loading/Error Handling

Clicking "Exportar" MUST show a loading/disabled state on the button while the export request is in flight, MUST trigger a browser download via `URL.createObjectURL` on the resolved `Blob` and a synthetic `<a download="clientes.xlsx">` click, and MUST revoke the created object URL afterward. A failed export MUST surface an error state without crashing the page.

#### Scenario: Button shows loading/disabled state during export

- GIVEN the user clicks "Exportar"
- WHEN the export request is in flight
- THEN the button is disabled and shows a loading indicator until the request settles

#### Scenario: Successful export triggers a file download

- GIVEN `exportCustomers` resolves with an Excel `Blob`
- WHEN the download is triggered
- THEN an object URL is created from the `Blob`, a synthetic `<a download="clientes.xlsx">` element is clicked to start the download, and the object URL is revoked afterward

#### Scenario: Failed export shows an error without crashing

- GIVEN `exportCustomers` throws (network error or non-2xx response)
- WHEN the failure is handled
- THEN an error is surfaced to the user and the page does not crash
