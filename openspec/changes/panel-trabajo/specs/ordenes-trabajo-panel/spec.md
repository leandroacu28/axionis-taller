# Delta for Órdenes de Trabajo Panel

## ADDED Requirements

### Requirement: Panel Endpoint Requires Authentication Only

`GET /ordenes-trabajo/panel` MUST require a valid Bearer token via `JwtAuthGuard`. No `RolesGuard` or role/permission restriction MUST be applied — any authenticated user MAY access the panel, consistent with the rest of the `ordenes-trabajo` module.

#### Scenario: Any authenticated rol can view the panel

- GIVEN a valid Bearer token for a user with `rol` `'empleado'`
- WHEN `GET /ordenes-trabajo/panel` is called
- THEN the request succeeds identically to a request from an `'admin'` user

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /ordenes-trabajo/panel` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no panel data is returned

### Requirement: Literal Panel Route Is Not Shadowed By the Param Route

The controller MUST declare the literal `GET /ordenes-trabajo/panel` route so that it is reachable and is never intercepted by the existing `GET /ordenes-trabajo/:id` parameterized route (i.e. a request to `/ordenes-trabajo/panel` MUST NOT resolve as `findOne` with `id` bound to the literal string `"panel"`).

#### Scenario: /ordenes-trabajo/panel resolves to the panel handler, not findOne

- GIVEN the controller registers both the literal `panel` route and the `:id` parameterized route
- WHEN a `GET` request is made to `/ordenes-trabajo/panel`
- THEN the panel handler processes the request and returns the panel response shape (`stats`, `mecanicosTrabajando`, `data`)
- AND the `:id` handler is not invoked with `id: 'panel'`

### Requirement: Panel Accepts Estado, Mecánico, and Prioridad Filters

`GET /ordenes-trabajo/panel` MUST accept optional `estado`, `mecanicoId`, and `prioridad` query filters, each defaulting to "no restriction" when omitted, mirroring the semantics already used by `GET /ordenes-trabajo` (`estado`/`prioridad` accept a single enum value or an unrestricted default; `mecanicoId` accepts a single user id).

#### Scenario: No filters returns the full active dataset

- GIVEN orders exist across multiple `estado`, `mecanicoId`, and `prioridad` values
- WHEN `GET /ordenes-trabajo/panel` is called with no `estado`, `mecanicoId`, or `prioridad` query params
- THEN the response's stats, `mecanicosTrabajando`, and `data` reflect all active orders within the resolved date window, unrestricted by estado/mecánico/prioridad

#### Scenario: mecanicoId filter narrows the panel to one mecánico

- GIVEN orders exist for multiple mechanics
- WHEN `GET /ordenes-trabajo/panel` is called with `mecanicoId` set to one mechanic's id
- THEN `data` contains only orders whose `mecanicoId` matches, and the stats/`mecanicosTrabajando` figures are computed from that same restricted set

#### Scenario: prioridad filter narrows the panel to one priority

- GIVEN orders exist across `normal`, `alta`, and `urgente` priorities
- WHEN `GET /ordenes-trabajo/panel` is called with `prioridad=urgente`
- THEN `data` contains only `urgente` orders, and the stats reflect only that subset

### Requirement: Date Range Filter Resolves Against fechaIngreso via Presets or Custom Range

`GET /ordenes-trabajo/panel` MUST accept a date-range filter over `fechaIngreso` (not `createdAt`), resolved from one of four modes: `hoy`, `semana`, `mes`, or `personalizado`. For the `hoy`/`semana`/`mes` presets, the server MUST resolve the concrete `fechaIngreso` window itself without requiring the client to compute or supply boundaries. For `personalizado`, the client MUST supply explicit `from` and `to` values, and the server MUST validate that `from` is not after `to`, rejecting the request otherwise.

#### Scenario: hoy preset resolves without explicit client-supplied dates

- GIVEN a request to `GET /ordenes-trabajo/panel` with the date mode set to `hoy` and no `from`/`to` supplied
- WHEN the backend handles the request
- THEN it resolves a concrete `fechaIngreso` window server-side and returns 200 with orders/stats scoped to that window

#### Scenario: personalizado requires explicit from and to

- GIVEN a request to `GET /ordenes-trabajo/panel` with the date mode set to `personalizado` and valid `from`/`to` values where `from` is not after `to`
- WHEN the backend handles the request
- THEN it returns 200 with orders/stats scoped to the `[from, to]` `fechaIngreso` window

#### Scenario: personalizado with from after to is rejected

- GIVEN a request to `GET /ordenes-trabajo/panel` with the date mode set to `personalizado` and a `from` value later than `to`
- WHEN the backend handles the request
- THEN it returns 400 and no panel data is returned

### Requirement: Stats and Board Derive From the Exact Same Filtered Where Clause

The stats block, `mecanicosTrabajando`, and the board `data` set in a single `GET /ordenes-trabajo/panel` response MUST all be computed from identical filter conditions (the same estado/mecanicoId/prioridad/date-range/`activo` constraints), evaluated together (e.g. in one `$transaction`) so no separate ad hoc query path can diverge across the three. The stats and the board MUST NOT be able to disagree for the same request.

#### Scenario: Changing a filter updates stats and board consistently

- GIVEN a `GET /ordenes-trabajo/panel` response for a given filter set
- WHEN the same filter set is used to independently recompute the board's order-by-estado breakdown from `data`
- THEN it matches `stats.pendiente`, `stats.en_proceso`, and `stats.terminado` exactly — the figures and the visible cards never disagree

### Requirement: Per-Estado Stats Honor the Current Filtered Set, Including a Selected Estado

`stats.pendiente`, `stats.en_proceso`, and `stats.terminado` MUST each be computed as the count of orders matching the full currently-applied filter set (mecánico, estado, prioridad, date range, `activo: true`) intersected with that specific `estado` value. Unlike `GET /ordenes-trabajo`'s per-estado summary counts (which ignore the current `estado` filter), the panel's per-estado stats MUST honor a selected `estado` filter: when `estado` is set to a single value, the count(s) for the other estado values MUST be zero and the board MUST show cards only in the matching column. This is intended behavior given the panel's single-shared-filter design, not a defect.

#### Scenario: No estado filter shows the live breakdown across all buckets

- GIVEN orders exist in `pendiente`, `en_proceso`, and `terminado` within the resolved date window
- WHEN `GET /ordenes-trabajo/panel` is called with no `estado` filter
- THEN `stats.pendiente`, `stats.en_proceso`, and `stats.terminado` each reflect their respective live counts, and the board shows cards in all three matching columns

#### Scenario: A single estado filter zeroes the other buckets

- GIVEN orders exist in `pendiente`, `en_proceso`, and `terminado` within the resolved date window
- WHEN `GET /ordenes-trabajo/panel` is called with `estado=pendiente`
- THEN `stats.pendiente` reflects the matching count, `stats.en_proceso` and `stats.terminado` are both `0`, and the board's `en_proceso`/`terminado` columns are empty

### Requirement: Órdenes Del Día Reflects the Resolved fechaIngreso Window

The "del día" stat MUST count orders in the exact same filtered set as the rest of the response, scoped to the currently resolved `fechaIngreso` window (whichever of `hoy`/`semana`/`mes`/`personalizado` is active) — not a separate, always-current-calendar-day snapshot independent of the applied date filter. It MUST be computed against `fechaIngreso`, never `createdAt`.

#### Scenario: Del día reflects the active window under a non-hoy preset

- GIVEN orders whose `fechaIngreso` falls within the current calendar month but not on the current calendar day
- WHEN `GET /ordenes-trabajo/panel` is called with the date mode set to `mes`
- THEN the "del día" stat counts those orders, reflecting the resolved month window rather than only the literal current day

#### Scenario: Backdated fechaIngreso is counted in its own window, not createdAt's

- GIVEN an order was created today via `POST /ordenes-trabajo` with an explicit past `fechaIngreso` from last week
- WHEN `GET /ordenes-trabajo/panel` is called with the date mode set to `hoy`
- THEN that order is NOT counted in today's "del día" stat, because its `fechaIngreso` falls outside today's window even though it was just inserted

### Requirement: Mecánicos Trabajando Is a Distinct-Mechanic Count Scoped to en_proceso

`mecanicosTrabajando` MUST be the count of distinct `mecanicoId` values among orders in the current filtered set whose `estado` is `en_proceso`. It MUST be a bare integer, not a list of mechanic names or records.

#### Scenario: Two en_proceso orders for the same mecánico count once

- GIVEN two orders in `estado = 'en_proceso'`, both assigned to the same `mecanicoId`, within the current filtered set
- WHEN `GET /ordenes-trabajo/panel` is called
- THEN `mecanicosTrabajando` is `1`, not `2`

#### Scenario: An incompatible estado filter zeroes mecanicosTrabajando

- GIVEN orders exist in `en_proceso` for one or more mechanics
- WHEN `GET /ordenes-trabajo/panel` is called with `estado=pendiente`
- THEN `mecanicosTrabajando` is `0`, since no order in the filtered set can simultaneously be `pendiente` and `en_proceso`

### Requirement: Soft-Deactivated Orders Are Excluded Throughout the Panel

The panel's filtered query MUST always force `activo: true` on `OrdenTrabajo`, excluding soft-deactivated orders from the stats block, `mecanicosTrabajando`, and the board `data` set entirely — matching the existing convention already applied to `GET /ordenes-trabajo`'s per-estado summary counts (`countsWhere`). The panel MUST NOT expose its own `activo`/status toggle; unlike the existing list page, there is no way to view deactivated orders through the panel.

#### Scenario: A deactivated order is invisible to the panel

- GIVEN an order with `activo: false` that otherwise matches the current filters
- WHEN `GET /ordenes-trabajo/panel` is called with those filters
- THEN that order does not appear in `data`, is not counted in any of `stats.pendiente`/`stats.en_proceso`/`stats.terminado`/the "del día" stat, and does not contribute to `mecanicosTrabajando` even if its `estado` is `en_proceso`

### Requirement: Board Data Is Capped With an Explicit Truncation Signal

The board `data` set MUST be bounded by a hard cap on the number of orders returned in a single response. The cap SHOULD default to 500 orders (the exact number MAY be finalized in `sdd-design`). When the number of orders matching the current filtered set exceeds the cap, the response MUST include an explicit signal indicating truncation (e.g. a boolean flag) plus the total number of matching orders, so the frontend can render a "showing first N of M" indicator rather than truncating silently.

#### Scenario: Filtered set within the cap is not marked truncated

- GIVEN the current filtered set matches fewer orders than the hard cap
- WHEN `GET /ordenes-trabajo/panel` is called
- THEN `data` contains every matching order and the response's truncation signal indicates no truncation occurred

#### Scenario: Filtered set exceeding the cap is marked truncated with a total count

- GIVEN the current filtered set matches more orders than the hard cap
- WHEN `GET /ordenes-trabajo/panel` is called
- THEN `data` contains at most the capped number of orders, the response's truncation signal indicates truncation occurred, and the response includes the total number of matching orders

### Requirement: Empty Filtered Set Returns Zeroed Stats and an Empty Board

When no order matches the current filtered set, the endpoint MUST return 200 with all stats at `0`, `mecanicosTrabajando` at `0`, and an empty `data` array — not an error.

#### Scenario: No matching orders yields an all-zero response

- GIVEN a filter combination that matches no existing order (e.g. a `mecanicoId`/date-range combination with no orders)
- WHEN `GET /ordenes-trabajo/panel` is called with those filters
- THEN it returns 200 with `stats.pendiente`, `stats.en_proceso`, `stats.terminado`, the "del día" stat, and `mecanicosTrabajando` all `0`, and `data` is an empty array

### Requirement: Mecánico Filter With Zero Matching Orders Is Not an Error

Filtering by a `mecanicoId` that corresponds to an existing, active mechanic but has zero matching orders within the current filters MUST return a valid 200 response with zeroed figures and an empty board, not a 404 or validation error.

#### Scenario: Active mechanic with no matching orders returns a valid empty panel

- GIVEN an active mechanic with no orders matching the other applied filters
- WHEN `GET /ordenes-trabajo/panel` is called with `mecanicoId` set to that mechanic's id
- THEN it returns 200 with all stats and `mecanicosTrabajando` at `0` and `data` empty

### Requirement: Frontend Panel Page Renders Three Stacked Sections

The new route `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx`, reachable at `/ordenes-trabajo/panel`, MUST render three stacked sections, top to bottom: a stats/summary row, a filter bar (mecánico, estado, prioridad, and a date filter with `hoy`/`semana`/`mes`/`personalizado`), and a Kanban board. The existing `/ordenes-trabajo` list page and its view MUST remain unchanged.

#### Scenario: Panel page renders all three sections

- GIVEN an authenticated user navigates to `/ordenes-trabajo/panel`
- WHEN the page renders
- THEN the stats/summary row, the filter bar, and the Kanban board are all visible, in that top-to-bottom order

#### Scenario: Existing list page is unaffected

- GIVEN this capability is implemented
- WHEN `/ordenes-trabajo` is visited
- THEN its existing table/tarjetas view and behavior are unchanged

### Requirement: Kanban Board Has Four Columns in a Fixed Order

The Kanban board MUST render exactly four columns, left to right, in this order: `pendiente`, `en_proceso`, `terminado`, `cancelado`. Each column MUST render only the filtered orders whose `estado` matches that column.

#### Scenario: Board renders four columns in the fixed order

- GIVEN the panel page has loaded a filtered set with orders in every estado
- WHEN the Kanban board renders
- THEN four columns appear left to right in the order `pendiente`, `en_proceso`, `terminado`, `cancelado`, each containing only the cards whose estado matches that column

### Requirement: Board Is Read-Only With No New Drag-and-Drop Dependency

Kanban cards MUST NOT support drag-to-change-estado or any other write interaction; dragging a card MUST NOT mutate the order's `estado`. This capability MUST NOT add any drag-and-drop library or other new runtime dependency to `client/package.json`.

#### Scenario: Dragging a card does not change its estado

- GIVEN a card is rendered in one of the board's columns
- WHEN a user attempts to drag that card
- THEN the order's `estado` is not modified and the card remains in its original column after the interaction

#### Scenario: No drag-and-drop dependency is introduced

- GIVEN this capability is implemented
- WHEN `client/package.json` is inspected
- THEN no new drag-and-drop library has been added as a dependency

### Requirement: Changing Any Filter Re-fetches Stats and Board Together

Changing any filter bar control (mecánico, estado, prioridad, or date preset/custom range) MUST trigger a single re-fetch of the panel endpoint and MUST update both the stats row and the Kanban board from that same response, so neither section is left stale relative to the other.

#### Scenario: Changing a filter updates both sections together

- GIVEN the panel page has loaded with an initial filter set
- WHEN the user changes any filter control (e.g. selects a different estado)
- THEN a new request to `GET /ordenes-trabajo/panel` is made with the updated filters, and both the stats row and the Kanban board re-render from that single response
