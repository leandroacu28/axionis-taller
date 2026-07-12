# Delta for App Navigation

## ADDED Requirements

### Requirement: Typed Navigation Item Model
`lib/navigation.tsx` MUST export a typed `NavigationItem` shape (name, href, icon, and optional fields such as `children`/permission markers) usable by both `Header` and `Sidebar`.

#### Scenario: Nav items consumed by Sidebar
- GIVEN the navigation module exports a `NavigationItem[]` list
- WHEN `Sidebar` renders
- THEN it iterates the typed list to render links without type errors

### Requirement: Exactly Three V1 Navigation Sections
The v1 navigation list MUST contain exactly three items, in this order: Inicio → `/home`, Usuarios → `/usuarios`, Configuraciones Generales → `/configuraciones-generales`.

#### Scenario: Sidebar renders the three v1 sections
- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN exactly three links appear, labeled "Inicio", "Usuarios", and "Configuraciones Generales", pointing to `/home`, `/usuarios`, and `/configuraciones-generales` respectively

### Requirement: No Role Filtering in V1
Navigation rendering MUST NOT filter items by user role or permission in v1 — all three items render for any authenticated user.

#### Scenario: All items visible regardless of rol
- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN all three v1 items are visible; no item is hidden based on `rol`

### Requirement: Extensible Item Shape for Future Filtering
The `NavigationItem` type MUST remain structurally extensible so that future role-based filtering or nested `children` can be added without breaking existing v1 consumers.

#### Scenario: Adding an optional field does not break existing renders
- GIVEN a future `NavigationItem` gains an optional `children` or permission field
- WHEN the v1 navigation list (with no such field set) renders
- THEN rendering succeeds unchanged, since the new field is optional
