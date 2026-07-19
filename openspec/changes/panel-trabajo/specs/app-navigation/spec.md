# Delta for App Navigation

## MODIFIED Requirements

### Requirement: Top-Level Navigation Sections

The top-level navigation list MUST contain a new flat entry, `Panel de Trabajo` (leaf, `href: '/ordenes-trabajo/panel'`), as a top-level sibling of `Órdenes de Trabajo`. `Panel de Trabajo` MUST NOT be nested under `Configuraciones`'s `children`.
(Previously: no `Panel de Trabajo` entry existed; `Órdenes de Trabajo` had no additional top-level sibling contributed by this capability.)

#### Scenario: Sidebar renders the new Panel de Trabajo entry

- GIVEN the default navigation configuration
- WHEN `Sidebar` renders for any authenticated user
- THEN a top-level "Panel de Trabajo" entry appears, linking to `/ordenes-trabajo/panel`, alongside "Órdenes de Trabajo"

#### Scenario: Panel de Trabajo is not nested under Configuraciones

- GIVEN the default navigation configuration
- WHEN the `navigation` array is inspected
- THEN the `Panel de Trabajo` entry is a top-level array item with its own `href: '/ordenes-trabajo/panel'`
- AND it does not appear inside `Configuraciones`'s `children` array

### Requirement: No Role Filtering in V1

Navigation rendering MUST NOT filter items by user role or permission in v1 — all top-level items and nested `children` render for any authenticated user, including the new `Panel de Trabajo` entry.
(Previously: all items render for any authenticated user — unchanged in substance; restated to explicitly cover the new top-level `Panel de Trabajo` entry.)

#### Scenario: All items visible regardless of rol

- GIVEN an authenticated user with any `rol` value
- WHEN the navigation renders
- THEN "Órdenes de Trabajo" and "Panel de Trabajo" are both visible; no item is hidden based on `rol`
