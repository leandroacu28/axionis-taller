# Delta for App Navigation

## MODIFIED Requirements

### Requirement: Top-Level Navigation Sections

The top-level navigation list MUST contain a new flat entry, `Unidades de Medida` (leaf, `href: '/unidades-medida'`), as a top-level sibling of `Inicio` and `Configuraciones`. `Unidades de Medida` MUST NOT be nested under `Configuraciones`'s `children`.
(Previously: exactly three entries — `Inicio` (leaf, `href: '/home'`), `Configuraciones` (group, no `href`, `children: [Usuarios (href: '/usuarios')]`), and `Clientes` (leaf, `href: '/clientes'`). No flat top-level `Unidades de Medida` entry existed.)

#### Scenario: Sidebar renders the new Unidades de Medida entry

- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN a top-level "Unidades de Medida" entry appears, linking to `/unidades-medida`

#### Scenario: Unidades de Medida is not nested under Configuraciones

- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Unidades de Medida` entry is a top-level array item with its own `href: '/unidades-medida'`
- AND it does not appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1

Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user, including the new `Unidades de Medida` entry.
(Previously: all items render for any authenticated user — unchanged in substance; restated to explicitly cover the new top-level `Unidades de Medida` entry.)

#### Scenario: All items visible regardless of rol

- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Inicio", "Configuraciones" (with its "Usuarios" child), "Clientes", and "Unidades de Medida" are all visible; no item is hidden based on `rol`
