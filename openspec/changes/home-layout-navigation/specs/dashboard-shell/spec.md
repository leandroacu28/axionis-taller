# Delta for Dashboard Shell

## ADDED Requirements

### Requirement: Authenticated Layout Composition
The `(dashboard)` route group layout MUST mount `Header`, `Sidebar`, and a `<main>` content area wrapping `{children}` for every route inside the group.

#### Scenario: Protected page renders inside the shell
- GIVEN an authenticated user navigates to `/home`
- WHEN the `(dashboard)` layout renders
- THEN `Header`, `Sidebar`, and the page content render together in a single composed shell

### Requirement: Sidebar Open State Ownership
The `(dashboard)` layout MUST own `sidebarOpen` state and MUST pass it (plus its setter) down to `Header` and `Sidebar`.

#### Scenario: Toggling sidebar affects both Header and Sidebar
- GIVEN the dashboard shell is rendered with `sidebarOpen = false`
- WHEN the user triggers the sidebar toggle control in `Header`
- THEN `Sidebar`'s visibility/state reflects the updated `sidebarOpen` value

### Requirement: Client-Side User Hydration
The `(dashboard)` layout MUST hydrate the `user` object from the `user` cookie on the client after mount, without requiring a server round trip.

#### Scenario: User data available after mount
- GIVEN a valid `user` cookie exists
- WHEN the `(dashboard)` layout mounts
- THEN `user` state is populated from the cookie and passed to `Header`

#### Scenario: Missing or malformed user cookie
- GIVEN the `user` cookie is absent or cannot be parsed
- WHEN the `(dashboard)` layout mounts
- THEN the layout MUST NOT throw and MUST render with `user` as `null`/`undefined` rather than crashing

### Requirement: Logout Clears Session and Redirects
The `(dashboard)` layout MUST expose a logout action that clears the session cookie(s) (`token`, `user`) and redirects to `/login`.

#### Scenario: User logs out from the shell
- GIVEN an authenticated user viewing any protected page
- WHEN the user triggers logout
- THEN the `token` and `user` cookies are cleared
- AND the browser is redirected to `/login`

### Requirement: Post-Login Landing Route
`/home` MUST be the landing route for the authenticated dashboard shell.

#### Scenario: Dashboard root resolves to /home
- GIVEN an authenticated user with no other destination
- WHEN they reach the dashboard
- THEN the resolved route is `/home`, not `/`
