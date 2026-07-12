# Delta for App Navigation

## MODIFIED Requirements

### Requirement: Top-Level Navigation Sections

The top-level navigation list MUST contain a new flat entry, `Tipos de Servicio` (leaf, `href: '/tipos-servicio'`), as a top-level sibling of `Inicio` and `Configuraciones`. `Tipos de Servicio` MUST NOT be nested under `Configuraciones`'s `children`.
(Previously: exactly three entries — `Inicio` (leaf, `href: '/home'`), `Configuraciones` (group, no `href`, `children: [Usuarios (href: '/usuarios')]`), and `Clientes` (leaf, `href: '/clientes'`). No flat top-level `Tipos de Servicio` entry existed.)

#### Scenario: Sidebar renders the new Tipos de Servicio entry

- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN a top-level "Tipos de Servicio" entry appears, linking to `/tipos-servicio`

#### Scenario: Tipos de Servicio is not nested under Configuraciones

- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Tipos de Servicio` entry is a top-level array item with its own `href: '/tipos-servicio'`
- AND it does not appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1

Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user, including the new `Tipos de Servicio` entry.
(Previously: all items render for any authenticated user — unchanged in substance; restated to explicitly cover the new top-level `Tipos de Servicio` entry.)

#### Scenario: All items visible regardless of rol

- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Inicio", "Configuraciones" (with its "Usuarios" child), "Clientes", and "Tipos de Servicio" are all visible; no item is hidden based on `rol`
