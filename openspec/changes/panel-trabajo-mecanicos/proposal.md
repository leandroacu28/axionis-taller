# Proposal: Per-mechanic workload cards on `/ordenes-trabajo/panel`

## Intent
The Panel de Trabajo (`/ordenes-trabajo/panel`, shipped by the sibling `panel-trabajo` change) answers "what is the state of the shop right now?" through a filter-reactive stats row and an estado-grouped Kanban board. It does **not** answer a distinct operational question a supervisor asks constantly: **"who is carrying the load, and who is free to take the next job?"** Today that requires eyeballing the `mecánico` field on every card across the board and mentally tallying per person — error-prone and slow, and it silently ignores mechanics who currently have zero open work (the people you most want to see when assigning a new order).

This change adds a new section **below** the existing Kanban board: one card per active mechanic, each showing the mechanic's name, their **cantidad de trabajos asignados** (count of that mechanic's `pendiente + en_proceso` orders), and their **% de trabajos asignados** (that count as a share of the shop-wide `pendiente + en_proceso` total across all mechanics). Cards are sorted by load descending so the busiest mechanic reads first and idle mechanics (0 / 0%) surface at the bottom as available capacity.

Crucially, this section is a **global live snapshot of open workload**, independent of the panel's filter bar. Narrowing the board to one estado, one mechanic, or a date range does **not** reshape this section — it always reflects the current total `pendiente + en_proceso` distribution for the whole shop. Success looks like: a supervisor glances below the board and immediately sees the load balance across the whole team and who is available, without touching a filter or counting cards by hand.

## Scope

### In Scope
- **New dedicated aggregated backend endpoint** `GET /ordenes-trabajo/panel/mecanicos` (working name) that takes **no** filter params (no `estado`/`prioridad`/`mecanicoId`/date range/`hoy`) and returns, in a single `$transaction`, one entry per **active** mechanic with their `pendiente + en_proceso` count and computed percentage of the shop-wide total, plus the total in `meta`. Guarded by the class-level `JwtAuthGuard` only, consistent with the rest of the module and with the sibling change's D8.
- **Server-side aggregation** that starts from the **active-mechanics pool** (`User` where `activo: true` — the same pool the panel page already surfaces via `listUsers({ status: 'activo' })`) and **left-joins** a `groupBy(['mecanicoId'], where: { activo: true, estado: { in: ['pendiente','en_proceso'] } }, _count)` over órdenes de trabajo, so mechanics with zero open orders still appear as `0 / 0%`. Percentages, zero-fill, and sort (load desc, name asc tiebreak) are computed in the service layer.
- **New frontend presentational component** (working name `MecanicosWorkload.tsx`) rendered **below** `<KanbanBoard>` in `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx`. It renders a grid/row of per-mechanic cards from its own data, following the established `mecanicoLabel()`-redeclaration pattern (§2.3 of the sibling design).
- **New client API function + types** in `client/app/lib/ordenes-trabajo.ts` (working name `getPanelMecanicos()` returning a `MecanicoWorkload[]`-shaped response), mirroring the existing `getOrdenesTrabajoPanel` fetch/`handleJsonResponse` pattern.
- **Independent fetch lifecycle:** the section fetches **once on mount** and does **not** re-fetch when the panel's filter state changes — because it is filter-independent, re-fetching on filter changes would be pure waste. (A future explicit "refresh" affordance is out of scope; see Non-Goals.)

### Out of Scope / Non-Goals
- **No `rol: 'mecanico'` filter on the User model or API.** "Mechanic" here means "any active `User`", exactly the D6/D8 convention the sibling `panel-trabajo` change already established. There is no way today to narrow the pool to `rol: 'mecanico'` at the API level, and this change does **not** add one. (See Decisions D5.)
- **No drill-down / click-through** from a mechanic card to that mechanic's orders. The cards are read-only figures. A future change may make a card navigate to `/ordenes-trabajo?mecanicoId=…` or filter the board, but that is deferred. (See Decisions D6.)
- **No change to the Kanban board or the panel filter bar.** The board, the stats row, the filter bar, their endpoint (`GET /ordenes-trabajo/panel`), and their filter-reactive behavior are untouched. This section is additive and sits beneath them.
- **No shared presentation module.** The `mecanicoLabel()` helper is re-declared in the new component rather than extracted, continuing the accepted duplication tradeoff documented in the sibling design (§2.3). Extracting a shared `ordenesPresentation.ts` remains a future refactor to do when all panel surfaces can be touched together.
- **No schema/migration change and no new dependency.** Additive endpoint + component only.
- **No historical/analytics dimension** (throughput over time, per-mechanic aging, completed-work counts). The metric is strictly the current open (`pendiente + en_proceso`) distribution.
- **No inclusion of `terminado`/`cancelado` orders** in either the numerator or the denominator — the metric is "open assigned work" only.

## Capabilities
### New Capabilities
- `ordenes-trabajo-panel` (extended): a per-mechanic **open-workload** section on the panel page — one card per active mechanic showing count and percentage of the shop-wide `pendiente + en_proceso` total — backed by a dedicated, filter-independent aggregated endpoint that always returns the current global distribution.

### Modified Capabilities
- None. No behavior change to any existing endpoint, the board, the stats row, the filter bar, or navigation. The panel page (`page.tsx`) gains one additional section render below the board; the existing sections and their contract are unchanged.

## Approach

**Backend — dedicated endpoint (Approach 2 from exploration), chosen decisively because filter-independence is now fixed.** The exploration made the transport choice downstream of Q2 (filter semantics). Q2 is now resolved: this section is an **always-unfiltered global snapshot**, semantically different from the panel's filter-scoped `where`. Given that, `GET /ordenes-trabajo/panel/mecanicos` is the architecturally cleaner transport, and I (as architect at proposal time) commit to it over extending `panel()`'s response:

- **Rejected: extend `panel()`'s response with an always-unfiltered `mecanicos` field (Approach 1).** This would put two *different* filter semantics inside one `$transaction` — the existing 7 operations all keyed to the user's filtered `where`, plus one operation that deliberately **ignores** that `where` and reads the global set. The sibling design already flagged this exact mix as a "maintainability smell" (its Risk row and exploration Risk 3): a future reader would reasonably assume every operation in `panel()` shares the method's filtered `where` and could silently "fix" the odd one out. Worse, because the panel page re-fetches `panel()` on **every** filter change, an always-unfiltered `mecanicos` field would be **recomputed on every filter change** and return identical data each time — wasted work by construction. It also grows `PanelResponse` for a payload the board/stats callers do not need.
- **Chosen rationale:** a separate endpoint makes the "always-unfiltered global snapshot" contract explicit and unambiguous, decouples its fetch lifecycle (once on mount) from the panel's (re-fetch on every filter change), keeps `PanelResponse` from growing, and matches this module's own precedent — the sibling `panel-trabajo` change itself was justified as a dedicated endpoint over overloading `GET /ordenes-trabajo`. The cost (a second endpoint/DTO-less route/service method/type set and a second fetch on mount) is small and one-time; the two fetches do not need to coordinate loading states because they are logically independent sections.

**Backend — aggregation must start from the mechanic list, not the order counts.** A naive `groupBy(['mecanicoId'], _count)` alone would return **only** mechanics that currently have an open order, silently dropping idle mechanics — the exact opposite of the product decision that idle mechanics must appear as `0 / 0%`. The service therefore:
1. Fetches the active-mechanics pool: `User` where `activo: true` (the same pool `listUsers({ status: 'activo' })` exposes — no `rol` filter).
2. Runs `groupBy({ by: ['mecanicoId'], where: { activo: true, estado: { in: ['pendiente','en_proceso'] } }, _count: { _all: true } })` over órdenes de trabajo. Note `activo: true` here is the **order's** soft-delete flag (live orders only), matching the sibling change's `activo: true` convention — distinct from the User's `activo` in step 1.
3. **Left-joins** the counts onto the mechanic list (map keyed by `mecanicoId`), defaulting missing mechanics to `count = 0`.
4. Computes `total = Σ count` across all mechanics (equivalently a single `count()` of the same order-`where`), then `percentage = total === 0 ? 0 : (count / total) * 100` for each — the zero-denominator guard yields `0%` for every card when the shop has no open orders, never `NaN`.
5. Sorts entries by `count` descending, `mecanicoLabel` ascending as the documented tiebreak for equal loads.
6. Returns the render-ready list plus `meta.totalOrdenes = total`.

Keeping the join, percentage math, zero-fill, and sort in the **service layer** (not the frontend) mirrors the sibling change's chosen rationale — "aggregation stays in the service layer so a future reader finds one convention, not two" — and keeps the frontend component purely presentational.

**Frontend — new presentational section, self-contained from its own endpoint.** `page.tsx` adds one `useEffect` that fetches `getPanelMecanicos()` **once on mount** into its own state and renders `<MecanicosWorkload>` below `<KanbanBoard>`. The component receives the already-sorted, already-computed list and renders a card per mechanic (name via a re-declared `mecanicoLabel()`, the count, and the percentage). It does **not** read or depend on the panel's filter state, so no filter dependency array entangles it. Loading/error/empty states reuse the panel page's existing spinner / red-banner-with-retry markup.

## Decisions (documented for later review/override)
- **D1 — Dedicated endpoint `GET /ordenes-trabajo/panel/mecanicos`, filter-independent.** The section has its own endpoint that accepts **no** filter params and always returns the global `pendiente + en_proceso` distribution. *Rationale:* filter-independence is a fixed product constraint; a separate endpoint makes the "always-unfiltered snapshot" contract explicit, decouples its once-on-mount fetch from the panel's re-fetch-on-every-filter lifecycle, and avoids mixing two filter semantics in `panel()`'s single `$transaction` (the smell the sibling design flagged). Chosen over Approach 1 (extend `panel()` response).
- **D2 — Aggregation starts from the active-mechanics list, left-joins the counts.** The query begins with `User where activo: true` and left-joins the order `groupBy`, defaulting absent mechanics to `0`. *Rationale:* fixed product decision — **all** active mechanics get a card, including idle ones (`0 / 0%`) so a supervisor can see available capacity; a bare `groupBy` would omit them.
- **D3 — Metric is `pendiente + en_proceso` only; denominator is closed.** Numerator and denominator both count exactly the `pendiente + en_proceso` orders (`terminado`/`cancelado` excluded). `OrdenTrabajo.mecanicoId` is required/non-nullable (verified in exploration against `schema.prisma` and `assertMecanicoActivo`), so there is no unassigned-order case to exclude — the denominator is the closed sum of every mechanic's open count. *Rationale:* fixed product decision; the metric is "open assigned work", and the schema guarantees every open order belongs to exactly one mechanic.
- **D4 — Zero-denominator → `0%` on every card.** When the shop has zero `pendiente + en_proceso` orders, every card shows `0` and `0%`, not `NaN` and not a hidden section. *Rationale:* fixed product decision, consistent with how the sibling change's stats already default to `0` on empty sets rather than erroring or omitting.
- **D5 — "Mechanic" = any active `User`; no `rol` filter added.** The pool is `User where activo: true`, identical to the panel's mecánico dropdown; no `rol: 'mecanico'` narrowing is introduced at the model or API level. *Rationale:* fixed product decision continuing the sibling change's D6/D8 convention; adding a rol filter is a separate, larger change.
- **D6 — No drill-down from a card (non-goal for this change).** Cards are read-only figures with no click-through to the mechanic's orders. *Rationale:* the value proposition (load balance + availability at a glance) is fully delivered by the figures; wiring navigation/board-filtering from a card is a separable enhancement with its own UX decisions (does it filter the board? navigate to the list? open a modal?) and is deferred to keep this change tightly additive.
- **D7 — `mecanicoLabel()` re-declared, not extracted.** The new component re-declares the `${nombre} ${apellido}`.trim()-fallback-`username` helper rather than extracting a shared module. *Rationale:* extracting would require editing the untouched panel/list surfaces; continues the accepted duplication tradeoff from sibling design §2.3. Promotion to a shared `ordenesPresentation.ts` remains a clean future refactor.
- **D8 — Cards sorted by load descending, name ascending as tiebreak.** *Rationale:* fixed product decision; surfacing the busiest mechanic first and idle mechanics last matches the "who is loaded / who is free" question the section answers. Name ascending is the deterministic tiebreak for equal loads so the order is stable across calls.

## Rollback Plan
This change is **additive** — one new backend endpoint (controller route + service method; no DTO needed since it takes no params), one new frontend component, one added section render + fetch in `page.tsx`, and new client API types/function. There is **no schema/migration change and no data backfill**, so rollback carries no data-loss risk. Rollback is mechanical:
1. Revert the PR, or piecemeal: remove the `GET /ordenes-trabajo/panel/mecanicos` controller route and its service method — nothing else calls them.
2. Remove `MecanicosWorkload.tsx`, and remove the section render + its `useEffect`/state from `page.tsx` (leaving the board and stats untouched).
3. Remove the `getPanelMecanicos()` function and its types from `client/app/lib/ordenes-trabajo.ts`.

The existing panel endpoint, panel page, board, stats row, and filter bar are never modified, so reverting this change cannot affect them. Route-collision note: `panel/mecanicos` is a **two-segment literal path** — Nest/Express will not route it through the single-segment `:id` param regardless of declaration order — but it SHOULD be declared near the existing `@Get('panel')` handler to keep the controller's literal-route discipline auditable.

## Known Gaps / Accepted Tradeoffs
- **Two fetches on mount.** The panel page now issues two independent requests on load (`getOrdenesTrabajoPanel` + `getPanelMecanicos`). This is the deliberate cost of decoupling filter-independent from filter-scoped data (D1); the two sections have independent loading states and do not need to coordinate.
- **Percentage rounding / sum-to-100 is presentation-level.** Rounding each card's percentage independently means displayed percentages may not sum to exactly 100. The exact rounding rule (integer vs one decimal) is a presentation detail deferred to `sdd-design`; the raw `count` and `meta.totalOrdenes` are always exact, so the figures are auditable regardless of display rounding.
- **Snapshot is stale until reload.** Because the section fetches once on mount and deliberately ignores filter changes, it does not live-update as orders change estado elsewhere; the operator reloads the page to refresh. A manual refresh affordance or polling is a possible later enhancement, out of scope here.
- **`mecanicoLabel()` duplication grows by one copy** (D7) — the accepted tradeoff already flagged in the exploration Risks and sibling design §2.3.
- **No shared type package** — the endpoint's response shape is duplicated between the server return type and the client API types, following the codebase's "change one, change the other" convention.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `groupBy` alone omits idle mechanics, so idle mechanics never get a `0 / 0%` card | Med | D2 mandates the query **start from** the `activo: true` mechanic list and **left-join** the counts (zero-fill), not start from the order counts; encoded as an explicit scenario in `sdd-spec` |
| Zero-denominator produces `NaN`/division error when the shop has no open orders | Med | D4 pins the guard: `total === 0 → 0%` for every card; specced as an explicit empty-set scenario |
| Section accidentally inherits the panel's filter state and re-shapes when a filter changes | Med | D1's dedicated endpoint takes no filter params and the frontend fetches once on mount with no filter dependency array — filter-independence is structural, not conditional; `sdd-verify` checks that changing each filter leaves the section unchanged |
| Order `activo` (soft-delete) vs User `activo` confusion inflates or drops counts | Low–Med | Aggregation applies **both** `activo: true` guards for their distinct meanings (live orders in the `groupBy` where; active users in the pool); called out explicitly in the Approach so it is not conflated |
| Reader/reviewer expected the section to respect the filter bar | Low–Med | D1 states the always-unfiltered contract up front with rationale; surfaced at proposal time, not discovered at review |
| Mixing filtered + unfiltered semantics if Approach 1 had been chosen | N/A (avoided) | Approach 1 explicitly rejected in favor of the dedicated endpoint (D1), eliminating the `panel()` transaction smell the sibling design flagged |

## Success Criteria
- [ ] A new section renders **below** the Kanban board on `/ordenes-trabajo/panel`, showing one card per active mechanic.
- [ ] Each card shows the mechanic's name (`${nombre} ${apellido}`.trim() falling back to `username`), their **cantidad de trabajos asignados** (`pendiente + en_proceso` count), and their **% de trabajos asignados** of the shop-wide `pendiente + en_proceso` total.
- [ ] **All** active mechanics get a card, including those with zero open orders (shown as `0` / `0%`), via the `User where activo: true` pool — no `rol` filter.
- [ ] Cards are sorted by count descending, with name ascending as the tiebreak for equal loads.
- [ ] The section is **filter-independent**: changing any panel filter (estado, prioridad, mecánico, date preset/range) does **not** change the section's contents.
- [ ] When the shop has zero `pendiente + en_proceso` orders, every card shows `0` / `0%` (no `NaN`, section not hidden).
- [ ] A dedicated `GET /ordenes-trabajo/panel/mecanicos` endpoint (guarded by `JwtAuthGuard` only, taking no filter params) returns the per-mechanic counts, percentages, and the total, computed server-side in one `$transaction`.
- [ ] The Kanban board, stats row, filter bar, and `GET /ordenes-trabajo/panel` endpoint are unchanged; the existing list page (`/ordenes-trabajo`) is unchanged.
- [ ] No drill-down/click-through from a card; no `rol: 'mecanico'` filter added to the User model/API.
- [ ] The change is additive with no migration/backfill and is reversible per the Rollback Plan.
