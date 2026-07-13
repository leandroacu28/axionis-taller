# App Navigation Specification

## Requirements

### Requirement: Typed Navigation Item Model
`lib/navigation.tsx` MUST export a typed `NavigationItem` shape (name, href, icon, and optional fields such as `children`/permission markers) usable by both `Header` and `Sidebar`.

#### Scenario: Nav items consumed by Sidebar
- GIVEN the navigation module exports a `NavigationItem[]` list
- WHEN `Sidebar` renders
- THEN it iterates the typed list to render links without type errors

### Requirement: Top-Level Navigation Sections
The top-level navigation list MUST contain a new flat entry, `Productos` (leaf, `href: '/productos'`), as a top-level sibling of `Inicio`, `Configuraciones`, `Clientes`, and `Unidades de Medida`. `Productos` MUST NOT be nested under `Configuraciones`'s `children`. The complete list MUST include: `Inicio` (leaf, `href: '/home'`), `Configuraciones` (group, no `href`, `children: [Usuarios (href: '/usuarios')]`), `Clientes` (leaf, `href: '/clientes'`), `Unidades de Medida` (leaf, `href: '/unidades-medida'`), and `Productos` (leaf, `href: '/productos'`). All MUST be top-level siblings — none nested under `Configuraciones`'s `children` except `Usuarios`.

#### Scenario: Sidebar renders the top-level sections
- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN the top-level entries appear: "Inicio" (linking to `/home`), "Configuraciones" (a collapsible group containing "Usuarios" linking to `/usuarios`), "Clientes" (linking to `/clientes`), "Unidades de Medida" (linking to `/unidades-medida`), and "Productos" (linking to `/productos`)

#### Scenario: Leaf entries are not nested under Configuraciones
- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Clientes`, `Unidades de Medida`, and `Productos` entries are top-level array items with their own `href` values (`'/clientes'`, `'/unidades-medida'`, and `'/productos'` respectively)
- AND none of them appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1
Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user.

#### Scenario: All items visible regardless of rol
- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Inicio", "Configuraciones" (with its "Usuarios" child), "Clientes", "Unidades de Medida", and "Productos" are all visible; no item is hidden based on `rol`

### Requirement: Extensible Item Shape for Future Filtering
The `NavigationItem` type MUST remain structurally extensible so that future role-based filtering or additional nested `children` groups can be added without breaking existing consumers. `children` is already in use (the `Configuraciones` group nests `Usuarios`) and MUST remain optional so leaf items are unaffected.

#### Scenario: Adding an optional field does not break existing renders
- GIVEN a future `NavigationItem` gains an optional permission field
- WHEN the current navigation list (with no such field set) renders
- THEN rendering succeeds unchanged, since the new field is optional
