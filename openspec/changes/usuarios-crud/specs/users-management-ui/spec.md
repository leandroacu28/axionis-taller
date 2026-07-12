# Delta for Users Management UI

## ADDED Requirements

### Requirement: Usuarios Page Replaces Placeholder

`client/app/(dashboard)/usuarios/page.tsx` MUST be a client-rendered page that fetches the user list on mount and displays it in a table with `username`, `nombre`, `apellido`, and `rol` columns, replacing the static placeholder.

#### Scenario: Page loads and displays the user list

- GIVEN an authenticated user navigates to `/usuarios`
- WHEN the page mounts
- THEN it fetches `GET /users` and renders a table row per user with `username`, `nombre`, `apellido`, `rol`

### Requirement: Create User Action

The page MUST provide a create action that submits a new user via `POST /users` and MUST refresh or append to the displayed list on success.

#### Scenario: User is created from the page

- GIVEN the create form is filled with a unique `username`, `password`, and `rol`
- WHEN the form is submitted
- THEN `POST /users` is called and the new user appears in the list without a full page reload

### Requirement: Edit User Action

Each row MUST provide an edit action opening the same form pre-filled with that user's current data, with `username` read-only, submitting changes via `PATCH /users/:id`.

#### Scenario: User is edited from the page

- GIVEN a row's edit action is triggered and `nombre` is changed
- WHEN the form is submitted
- THEN `PATCH /users/:id` is called with the changed fields and the list reflects the update
- AND the `username` input is not editable in this form

### Requirement: Loading, Error, and Empty States

The page MUST show a loading indicator while the list request is in flight, MUST show an error message without crashing if the request fails (network or non-2xx response), and MUST render without crashing when the list is empty.

#### Scenario: Loading state while fetching

- GIVEN the page has just mounted
- WHEN the `GET /users` request has not yet resolved
- THEN a loading indicator is shown and no table rows are rendered

#### Scenario: Error state on request failure

- GIVEN `GET /users` fails (network error or non-2xx response)
- WHEN the page handles the failure
- THEN an error message is displayed and the page does not crash

#### Scenario: Empty state with zero users

- GIVEN `GET /users` resolves with an empty array
- WHEN the page renders
- THEN it shows an empty-state message and does not throw

### Requirement: Uses Established Auth Header Contract

All requests to the `users` endpoints (list, create, update) MUST attach the `Authorization` header using the existing `getAuthHeader()` function from `client/app/lib/auth.ts`, per the `session-routing` spec's Bearer-only backend boundary. This capability MUST NOT re-derive or duplicate that header logic.

#### Scenario: Requests carry the Bearer token from getAuthHeader

- GIVEN a logged-in user with a valid token
- WHEN the page calls `GET /users`, `POST /users`, or `PATCH /users/:id`
- THEN the request includes the `Authorization` header produced by `getAuthHeader()`

### Requirement: No New Route Protection

This capability MUST NOT add any role-based or permission-based gating to the `/usuarios` route or its actions. The page remains reachable by any authenticated user, unchanged from the existing `session-routing` middleware protection and the `app-navigation` "No Role Filtering in V1" requirement.

#### Scenario: Any authenticated user can reach and use the page

- GIVEN a valid `token` cookie for a user with any `rol`
- WHEN that user navigates to `/usuarios`
- THEN the page loads and all create/edit actions are available, with no role check applied
