# Delta for App Navigation

## MODIFIED Requirements

### Requirement: Top-Level Navigation Sections

The top-level navigation list MUST contain a new flat entry, `Orden de Servicio` (leaf, `href: '/ordenes-servicio'`), as a top-level sibling of `Inicio`, `Configuraciones`, `Clientes`, `Unidades de Medida`, and `Productos`. `Orden de Servicio` MUST NOT be nested under `Configuraciones`'s `children` — it is a transactional/operational entity, not a catalog. The complete top-level list MUST include: `Inicio` (leaf, `href: '/home'`), `Configuraciones` (group, no `href`, `children: [Usuarios (href: '/usuarios')]`), `Clientes` (leaf, `href: '/clientes'`), `Unidades de Medida` (leaf, `href: '/unidades-medida'`), `Productos` (leaf, `href: '/productos'`), and `Orden de Servicio` (leaf, `href: '/ordenes-servicio'`). All MUST be top-level siblings — none nested under `Configuraciones`'s `children` except `Usuarios`.
(Previously: five entries — `Inicio`, `Configuraciones` (with `Usuarios` child), `Clientes`, `Unidades de Medida`, and `Productos`. No flat top-level `Orden de Servicio` entry existed.)

#### Scenario: Sidebar renders the top-level sections

- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN the top-level entries appear: "Inicio" (linking to `/home`), "Configuraciones" (a collapsible group containing "Usuarios" linking to `/usuarios`), "Clientes" (linking to `/clientes`), "Unidades de Medida" (linking to `/unidades-medida`), "Productos" (linking to `/productos`), and "Orden de Servicio" (linking to `/ordenes-servicio`)

#### Scenario: Leaf entries are not nested under Configuraciones

- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Clientes`, `Unidades de Medida`, `Productos`, and `Orden de Servicio` entries are top-level array items with their own `href` values
- AND none of them appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1

Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user, including the new `Orden de Servicio` entry.
(Previously: all items render for any authenticated user — unchanged in substance; restated to explicitly cover the new top-level `Orden de Servicio` entry.)

#### Scenario: All items visible regardless of rol

- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Inicio", "Configuraciones" (with its "Usuarios" child), "Clientes", "Unidades de Medida", "Productos", and "Orden de Servicio" are all visible; no item is hidden based on `rol`
