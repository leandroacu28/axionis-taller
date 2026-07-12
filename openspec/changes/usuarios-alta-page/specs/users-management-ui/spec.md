# Delta for Users Management UI

## MODIFIED Requirements

### Requirement: Usuarios Page Replaces Placeholder

`client/app/(dashboard)/usuarios/page.tsx` MUST be a client-rendered page that fetches the user list on mount and displays it in a table with `username`, `dni`, `nombre`, `apellido`, and `rol` columns, replacing the static placeholder. This page MUST NOT render an inline create form; creation happens on a dedicated page (see "Dedicated User Creation Page").
(Previously: table columns were `username`, `nombre`, `apellido`, `rol`; the page also rendered an inline create form)

#### Scenario: Page loads and displays the user list

- GIVEN an authenticated user navigates to `/usuarios`
- WHEN the page mounts
- THEN it fetches `GET /users` and renders a table row per user with `username`, `dni`, `nombre`, `apellido`, `rol`

#### Scenario: Legacy user with null DNI displays a placeholder

- GIVEN a listed user has `dni: null`
- WHEN the table renders that row
- THEN the DNI cell shows a placeholder (e.g. `—`) instead of throwing or showing `null`

### Requirement: Edit User Action

Each row MUST provide an edit action opening the same form pre-filled with that user's current data, including `dni`, with `username` read-only, submitting changes via `PATCH /users/:id`. `dni`, `nombre`, and `apellido` MUST be presented as required fields in this form.
(Previously: the form did not include a `dni` field and did not mark `nombre`/`apellido` as required)

#### Scenario: User is edited from the page

- GIVEN a row's edit action is triggered and `nombre` is changed
- WHEN the form is submitted
- THEN `PATCH /users/:id` is called with the changed fields including the current `dni`, `nombre`, `apellido`, `rol`
- AND the `username` input is not editable in this form

#### Scenario: Editing a user without changing DNI succeeds

- GIVEN a row's edit form opens pre-filled with that user's existing `dni`
- WHEN the form is submitted without altering the `dni` value
- THEN `PATCH /users/:id` succeeds and no duplicate-DNI error is shown

#### Scenario: Legacy user with no DNI can still be edited

- GIVEN a row for a legacy user whose `dni` is `null`
- WHEN the edit form opens
- THEN the DNI field pre-fills empty rather than crashing, and the user can enter a value and save normally

## REMOVED Requirements

### Requirement: Create User Action

(Reason: user creation moves to a dedicated route `/usuarios/nuevo` to accommodate the additional required fields — `dni`, required `nombre`/`apellido`, and password confirmation — without crowding the list page.)
(Migration: see the ADDED "Dedicated User Creation Page" and "Password Confirmation Gate" requirements below.)

## ADDED Requirements

### Requirement: Dedicated User Creation Page

The system MUST provide a dedicated route `/usuarios/nuevo` (`client/app/(dashboard)/usuarios/nuevo/page.tsx`) rendering a create form with `username`, `dni`, `nombre`, `apellido`, `rol`, `activo`, `password`, and a confirm-password field, inheriting the shared dashboard layout. The "Nuevo usuario" action on the list page MUST navigate to this route instead of opening an inline form. Submitting valid data MUST call `POST /users` and, on success, MUST navigate back to `/usuarios`.

#### Scenario: Nuevo usuario navigates to the dedicated page

- GIVEN a user on `/usuarios` clicks "Nuevo usuario"
- WHEN the navigation completes
- THEN the browser is at `/usuarios/nuevo` and a create form renders with `username`, `dni`, `nombre`, `apellido`, `rol`, `activo`, `password`, and confirm-password fields

#### Scenario: Successful creation returns to the list

- GIVEN all required fields are filled and the password fields match
- WHEN the form is submitted and `POST /users` succeeds
- THEN the app navigates back to `/usuarios`

#### Scenario: List page no longer renders an inline create form

- GIVEN a user is on `/usuarios`
- WHEN the page renders
- THEN no create form is present inline; only the per-row edit action opens a form

### Requirement: Password Confirmation Gate

The dedicated create page MUST include a confirm-password field. Before calling `POST /users`, the page MUST verify `password` equals the confirm-password value; a mismatch MUST block submission client-side with an inline error and MUST NOT call the backend. The confirm-password value MUST NEVER be included in the request payload sent to the backend.

#### Scenario: Mismatched passwords block submit

- GIVEN `password` and the confirm-password field have different values
- WHEN the user submits the form
- THEN no request is sent to `POST /users` and an inline error message is shown

#### Scenario: Confirm-password is excluded from the payload

- GIVEN `password` and confirm-password match and all other required fields are valid
- WHEN the form submits
- THEN the `POST /users` request body does not include a confirm-password field
