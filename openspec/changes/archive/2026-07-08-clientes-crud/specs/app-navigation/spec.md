# Delta for App Navigation

## MODIFIED Requirements

### Requirement: Top-Level Navigation Sections

The top-level navigation list MUST contain exactly three entries, in this order: `Inicio` (leaf, `href: '/home'`), `Configuraciones` (group, no `href`, `children: [Usuarios (href: '/usuarios')]`), and `Clientes` (leaf, `href: '/clientes'`). `Clientes` MUST be a new top-level sibling of `Inicio` and `Configuraciones` — it MUST NOT be nested under `Configuraciones`'s `children`.
(Previously: exactly two top-level entries — `Inicio` (leaf, `href: '/home'`) and `Configuraciones` (group, no `href`, `children: [Usuarios (href: '/usuarios')]`). No flat top-level `Usuarios` entry and no `/configuraciones-generales` route ever existed.)

#### Scenario: Sidebar renders the three top-level sections

- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN exactly three top-level entries appear: "Inicio" (linking to `/home`), "Configuraciones" (a collapsible group containing "Usuarios" linking to `/usuarios`), and "Clientes" (linking to `/clientes`)

#### Scenario: Clientes is not nested under Configuraciones

- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Clientes` entry is a top-level array item with its own `href: '/clientes'`
- AND it does not appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1

Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user.
(Previously: all items render for any authenticated user — unchanged in substance; restated to explicitly cover the new top-level `Clientes` entry.)

#### Scenario: All items visible regardless of rol

- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Inicio", "Configuraciones" (with its "Usuarios" child), and "Clientes" are all visible; no item is hidden based on `rol`
