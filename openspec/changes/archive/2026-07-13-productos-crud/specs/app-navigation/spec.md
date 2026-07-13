# Delta for App Navigation

## MODIFIED Requirements

### Requirement: Top-Level Navigation Sections

The top-level navigation list MUST contain a new flat entry, `Productos` (leaf, `href: '/productos'`), as a top-level sibling of `Inicio`, `Configuraciones`, `Clientes`, and `Unidades de Medida`. `Productos` MUST NOT be nested under `Configuraciones`'s `children`.
(Previously: five entries were not yet defined — the list contained `Inicio`, `Configuraciones` (with `Usuarios` child), `Clientes`, and `Unidades de Medida`, with no `Productos` entry.)

#### Scenario: Sidebar renders the new Productos entry

- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN a top-level "Productos" entry appears, linking to `/productos`

#### Scenario: Productos is not nested under Configuraciones

- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Productos` entry is a top-level array item with its own `href: '/productos'`
- AND it does not appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1

Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user, including the new `Productos` entry.
(Previously: all items render for any authenticated user, covering `Inicio`, `Configuraciones`, `Clientes`, and `Unidades de Medida` — unchanged in substance; restated to explicitly cover the new top-level `Productos` entry.)

#### Scenario: All items visible regardless of rol

- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Inicio", "Configuraciones" (with its "Usuarios" child), "Clientes", "Unidades de Medida", and "Productos" are all visible; no item is hidden based on `rol`
