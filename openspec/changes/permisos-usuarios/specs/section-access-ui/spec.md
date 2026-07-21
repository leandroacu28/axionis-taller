# Section Access UI Specification

## Purpose

Admin-facing page for editing one user's per-section access, reachable from a new "Permisos" entry in the Usuarios row-actions dropdown, plus a typed API client (`lib/permisos.ts`) mirroring `lib/users.ts`. This capability adds a configuration surface only — it does not gate any route and does not add a sidebar navigation entry.

## Requirements

### Requirement: Permisos Page Route and Grid Rendering

`client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` MUST exist as a full page (not a modal), following the `usuarios/editar/[id]` route convention. On mount it MUST fetch the effective grid via `GET /permisos/users/:userId` and render one row per canonical section showing the section name, the inherited role default (read-only), and a 3-option control (`total` / `lectura` / `sin_acceso`) plus an option to clear the override back to the role default.

#### Scenario: Page loads and displays the effective grid

- GIVEN an authenticated user navigates to `/usuarios/permisos/{id}` for an existing user
- WHEN the page mounts
- THEN it calls `GET /permisos/users/:userId` and renders one row per canonical section with the role default and current effective level

#### Scenario: Unknown user id

- GIVEN `/usuarios/permisos/{id}` is visited with an `id` that does not match any user
- WHEN the page fetches the grid
- THEN it shows an error state without crashing, matching the 404 from `GET /permisos/users/:userId`

### Requirement: Set and Clear Overrides From the Page

Changing a section's control to `total`, `lectura`, or `sin_acceso` MUST call `PUT /permisos/users/:userId` with that section set to the chosen level. Selecting "usar valor del rol" MUST call `PUT /permisos/users/:userId` with that section's level cleared (`null`), and the row MUST then display the role default as the effective value.

#### Scenario: Selecting a level sets an override

- GIVEN the grid is rendered for a user
- WHEN the admin sets `productos` to `lectura`
- THEN `PUT /permisos/users/:userId` is called with `{ sectionId: 'productos', level: 'lectura' }` and the row reflects `lectura` as the effective level

#### Scenario: Clearing an override falls back to the role default

- GIVEN a section currently shows an override level different from its role default
- WHEN the admin selects "usar valor del rol" for that section
- THEN `PUT /permisos/users/:userId` is called with that section's level set to `null`, and the row's effective value updates to the role default

### Requirement: Permisos API Client

`client/app/lib/permisos.ts` MUST export typed functions for `GET /permisos/roles/:rol`, `PUT /permisos/roles/:rol`, `GET /permisos/users/:userId`, and `PUT /permisos/users/:userId`, mirroring the fetch/error-handling convention of `client/app/lib/users.ts`, and MUST attach the `Authorization` header via the existing `getAuthHeader()` from `client/app/lib/auth.ts`.

#### Scenario: Requests carry the Bearer token from getAuthHeader

- GIVEN a logged-in user with a valid token
- WHEN the page calls any `lib/permisos.ts` function
- THEN the request includes the `Authorization` header produced by `getAuthHeader()`

### Requirement: Permisos Dropdown Entry on Usuarios Page

The row-actions dropdown on `client/app/(dashboard)/usuarios/page.tsx` MUST include a "Permisos" entry positioned between "Editar" and "Activar/Desactivar", using the same `<Icon/>` + `Link` pattern as the other entries, linking to `/usuarios/permisos/${user.id}`.

#### Scenario: Dropdown shows Permisos between Editar and Activar/Desactivar

- GIVEN the Usuarios page row-actions dropdown for any user row
- WHEN the dropdown is opened
- THEN its items appear in order "Editar", "Permisos", "Activar/Desactivar"
- AND "Permisos" links to `/usuarios/permisos/${user.id}`

### Requirement: No Sidebar Navigation Entry

This capability MUST NOT add any item to the sidebar/navigation menu (`lib/navigation.tsx`). The Permisos page MUST be reachable only via the Usuarios row-actions dropdown (or a direct URL), never via a top-level or nested nav entry.

#### Scenario: Sidebar is unchanged

- GIVEN the navigation configuration used by `Sidebar`, before and after this change
- WHEN it is inspected
- THEN no entry links to `/usuarios/permisos` or any `permisos` route, and the entry count/structure otherwise matches the pre-change `app-navigation` spec

### Requirement: No New Route Protection

This capability MUST NOT add role-based or permission-based gating to `/usuarios/permisos/[id]` or any other route. The page remains reachable by any authenticated user, unchanged from the existing `session-routing` middleware protection.

#### Scenario: Any authenticated user can reach and use the page

- GIVEN a valid `token` cookie for a user with any `rol`
- WHEN that user navigates to `/usuarios/permisos/{id}`
- THEN the page loads and all set/clear actions are available, with no role check applied
