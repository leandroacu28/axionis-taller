# Delta for Órdenes de Trabajo Panel

## ADDED Requirements

### Requirement: Mecánicos Workload Endpoint Requires Authentication Only and Accepts No Filter Params

`GET /ordenes-trabajo/panel/mecanicos` MUST require a valid Bearer token via `JwtAuthGuard` only. No `RolesGuard` or role/permission restriction MUST be applied — any authenticated user MAY access it, consistent with `GET /ordenes-trabajo/panel`. The endpoint MUST NOT accept any `estado`, `prioridad`, `mecanicoId`, or date-range/preset query parameter. If any such parameter is sent, it MUST be ignored and MUST NOT change the response — this endpoint always returns the current global, unfiltered snapshot.

#### Scenario: Any authenticated rol can view the mecánicos workload snapshot

- GIVEN a valid Bearer token for a user with `rol` `'empleado'`
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN the request succeeds identically to a request from an `'admin'` user

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /ordenes-trabajo/panel/mecanicos` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no workload data is returned

#### Scenario: Filter-shaped query params are accepted but ignored

- GIVEN two otherwise-identical requests to `GET /ordenes-trabajo/panel/mecanicos`, one with no query params and one with `estado=pendiente&prioridad=urgente&mecanicoId=1&from=2026-01-01&to=2026-01-31` appended
- WHEN both requests are handled against the same underlying order/mechanic state
- THEN both responses are identical — the query params have no effect on the result

### Requirement: Every Active Mechanic Gets an Entry, Including Zero-Load Mechanics

The response MUST include exactly one entry per `User` where `activo: true`, regardless of whether that mechanic has any `pendiente` or `en_proceso` order assigned. A mechanic with zero such orders MUST still appear in the response, with `count: 0` and `percentage: 0`. The aggregation MUST start from the active-mechanics pool and left-join the order counts onto it, not start from a `groupBy` over orders (which would silently omit mechanics with no open orders).

#### Scenario: Active mechanic with zero assigned open orders still appears

- GIVEN an active mechanic (`User.activo: true`) who has no `OrdenTrabajo` in `estado` `pendiente` or `en_proceso`
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN the response includes an entry for that mechanic with `count: 0` and `percentage: 0`

#### Scenario: Inactive mechanic is excluded entirely

- GIVEN a `User` with `activo: false`, regardless of any orders assigned to them
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN no entry for that user appears in the response

### Requirement: Per-Mechanic Count Is Scoped to Pendiente and En_proceso Orders Only

Each mechanic's `count` MUST equal the number of `OrdenTrabajo` rows where `mecanicoId` matches that mechanic, `activo: true` (the order's soft-delete flag), and `estado` is `pendiente` OR `en_proceso`. Orders in `estado` `terminado` or `cancelado`, and soft-deactivated orders (`activo: false`), MUST be excluded from every mechanic's count and from the shop-wide total.

#### Scenario: Only pendiente and en_proceso orders count toward a mechanic's load

- GIVEN a mechanic with two `pendiente` orders, one `en_proceso` order, one `terminado` order, and one `cancelado` order, all `activo: true`
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN that mechanic's `count` is `3`

#### Scenario: Soft-deactivated orders are excluded from the count

- GIVEN a mechanic with one `pendiente` order that has `activo: false`
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN that order does not contribute to the mechanic's `count` or to the shop-wide total

### Requirement: Percentage Is Computed Against the Shop-Wide Total With a Zero-Denominator Guard

Each mechanic's `percentage` MUST be computed as `(mechanic's count / shop-wide total) * 100`, where the shop-wide total is the sum of **every** `pendiente + en_proceso` order across the whole shop, regardless of whether the order's assigned mechanic is currently active. (An order assigned to a mechanic who is later deactivated still counts toward the total, even though that mechanic no longer receives a card — in that case the visible cards' counts sum to less than the total, which is expected and auditable via `meta.totalOrdenes`.) When the shop-wide total is `0`, every mechanic's `percentage` MUST be `0` — never `NaN`, never `null`/omitted, and the endpoint MUST NOT return an error response in that case.

#### Scenario: Percentage reflects a mechanic's share of the shop-wide total

- GIVEN three active mechanics with open (`pendiente` + `en_proceso`) counts of `6`, `3`, and `1` respectively (shop-wide total `10`)
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN the mechanic with count `6` has `percentage` `60`, the mechanic with count `3` has `percentage` `30`, and the mechanic with count `1` has `percentage` `10`

#### Scenario: Zero shop-wide open orders yields zero percentage for every mechanic, not an error

- GIVEN one or more active mechanics and zero `OrdenTrabajo` rows in `estado` `pendiente` or `en_proceso` across the whole shop
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN it returns 200, every mechanic entry has `count: 0` and `percentage: 0`, and no entry has a `NaN` or missing `percentage`

#### Scenario: Orders assigned to a deactivated mechanic still count toward the shop-wide total

- GIVEN a mechanic was deactivated (`User.activo: false`) after being assigned two orders still in `estado` `pendiente`, and the rest of the shop has eight other open orders across active mechanics (shop-wide total `10`)
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN `meta.totalOrdenes` is `10`, no entry is returned for the deactivated mechanic, and the sum of the returned entries' `count` values is `8` — less than `meta.totalOrdenes`, which is expected

### Requirement: Entries Are Sorted By Count Descending, Name Ascending As Tiebreak

The response's mechanic entries MUST be sorted by `count` descending. When two or more mechanics have equal `count`, those mechanics MUST be ordered among themselves by their display name ascending (the same `${nombre} ${apellido}`.trim()-falling-back-to-`username` label used elsewhere in this capability), as the deterministic tiebreak.

#### Scenario: Higher count sorts first

- GIVEN active mechanics with counts `5`, `2`, and `8`
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN the entries are ordered `8`, `5`, `2`

#### Scenario: Equal counts are tiebroken by name ascending

- GIVEN two active mechanics, "Bruno Diaz" and "Ana Perez", both with `count: 4`
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN "Ana Perez"'s entry appears before "Bruno Diaz"'s entry in the response

### Requirement: The Endpoint's Response Is Independent of the Panel's Filter State

`GET /ordenes-trabajo/panel/mecanicos`'s response MUST depend only on the live `User` and `OrdenTrabajo` state at request time, and MUST NOT depend on, or be derived from, any filter selection (estado, prioridad, mecánico, date preset/range) applied on `GET /ordenes-trabajo/panel` or on the panel page's filter bar. Calling this endpoint under different panel filter states, with the underlying order/mechanic data otherwise unchanged, MUST yield identical results.

#### Scenario: Different panel filter states yield identical mecánicos data

- GIVEN the underlying `User` and `OrdenTrabajo` state is unchanged
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called once while the panel's filter bar (as reflected in a concurrent or prior `GET /ordenes-trabajo/panel?estado=pendiente` call) is set to `estado=pendiente`, and again while it is set to `estado=en_proceso&prioridad=urgente`
- THEN both `GET /ordenes-trabajo/panel/mecanicos` responses are identical

### Requirement: Response Includes Per-Mechanic Identity and Load Figures Plus a Shop-Wide Total

The response MUST include, for each active mechanic, at minimum: an identifier for the mechanic (`mecanicoId`), a display name suitable for rendering (the `${nombre} ${apellido}`.trim()-falling-back-to-`username` label), the mechanic's `count`, and the mechanic's `percentage`. The response MUST also include a shop-wide total figure representing the denominator used for every `percentage` (e.g. under a `meta` object), so a consumer can independently audit that the percentages were derived from that total. Exact field/key naming and the surrounding response envelope are left to `sdd-design`.

#### Scenario: Each entry carries identity and load figures

- GIVEN at least one active mechanic exists
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN each entry in the response identifies which mechanic it belongs to, includes a renderable display name, and includes both `count` and `percentage`

#### Scenario: Response includes the shop-wide total used as the percentage denominator

- GIVEN active mechanics with open counts summing to `12` across the shop
- WHEN `GET /ordenes-trabajo/panel/mecanicos` is called
- THEN the response includes a total figure equal to `12`, matching the sum of every entry's `count`

### Requirement: Panel Page Renders a Mecánicos Workload Section Below the Kanban Board, Fetched Once on Mount

`/ordenes-trabajo/panel` MUST render a new section below the existing Kanban board, showing one card per mechanic entry returned by `GET /ordenes-trabajo/panel/mecanicos`. This section MUST fetch its data once when the panel page mounts and MUST NOT re-fetch or otherwise change its rendered content in response to any change in the panel's filter bar controls (mecánico, estado, prioridad, date preset/range) — only a fresh page load/mount triggers a new fetch of this section's data.

#### Scenario: Mecánicos workload section renders below the board

- GIVEN an authenticated user navigates to `/ordenes-trabajo/panel` and the mecánicos workload data has loaded
- WHEN the page renders
- THEN a section showing one card per active mechanic (name, count, percentage) is visible below the Kanban board

#### Scenario: Changing a panel filter does not change the mecánicos workload section

- GIVEN the panel page has loaded and the mecánicos workload section is rendered with a given set of cards
- WHEN the user changes a filter bar control (e.g. selects a different estado or mecánico)
- THEN the Kanban board and stats row re-fetch and update, but the mecánicos workload section's rendered cards remain exactly as they were and no new request to `GET /ordenes-trabajo/panel/mecanicos` is made

### Requirement: Existing Panel Board, Stats, Filter Bar, and Panel Endpoint Are Unchanged

The Kanban board, the stats row, the filter bar, and the `GET /ordenes-trabajo/panel` endpoint's contract, as specified by the sibling `panel-trabajo` change, MUST remain unmodified by this change. This change only adds the mecánicos workload section and its dedicated endpoint; it MUST NOT alter the behavior, response shape, or rendering of any existing panel section or endpoint.

#### Scenario: GET /ordenes-trabajo/panel behavior is unaffected

- GIVEN this change is implemented
- WHEN `GET /ordenes-trabajo/panel` is called with any combination of filters
- THEN its response shape and computed values behave exactly as specified by the `panel-trabajo` change, unaffected by the addition of `GET /ordenes-trabajo/panel/mecanicos`

#### Scenario: Board, stats row, and filter bar are visually and behaviorally unchanged

- GIVEN this change is implemented
- WHEN `/ordenes-trabajo/panel` renders
- THEN the stats row, filter bar, and Kanban board appear and behave exactly as before, with the new mecánicos workload section added below the board and not interleaved with or replacing any existing section
