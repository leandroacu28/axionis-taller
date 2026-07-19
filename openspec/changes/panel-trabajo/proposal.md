# Proposal: Panel de Trabajo (work board) for Órdenes de Trabajo

## Intent
Today the only way to look at órdenes de trabajo is the paginated list page (`/ordenes-trabajo`) — a table/tarjetas view built for record-by-record browsing and editing. It answers "find me this order", not "what is the state of the shop right now?". A workshop operator or supervisor who wants a quick operational read — how many orders came in today, how many are still pending, how many are in progress, how many are done, how many mechanics are actively working — has to eyeball the summary pills and mentally reconstruct the picture, and there is no at-a-glance grouping of orders by their `estado`.

This change adds a dedicated **Panel de Trabajo** view: a single read-only board that stacks three sections over the same filtered dataset — a **stats/summary row** (orders del día, pendientes, en proceso, terminados, mecánicos trabajando), a **filter bar** (mecánico, estado, prioridad, and a date filter: hoy / semana / mes / personalizado), and a **Kanban board** with one column per `Estado` value where orders are grouped visually by their current estado.

Success looks like: from one screen, a supervisor picks a date range and optional mecánico/estado/prioridad filters, and immediately sees both the aggregate counts and the same orders laid out in estado columns — with the stats row and the board always reflecting the exact same filtered set, so the numbers and the cards never disagree. The existing list page stays exactly as-is; this is an additional lens on the same data, not a replacement.

## Scope

### In Scope
- **New frontend route** `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx`, a sibling of the existing list page (`/ordenes-trabajo`), reachable at `/ordenes-trabajo/panel`. The existing list page and its table/tarjetas view are untouched.
- **New nav entry** "Panel de Trabajo" in `client/app/lib/navigation.tsx`, added as a top-level leaf item sitting next to "Órdenes de Trabajo" (both are top-level leaves today; no group/children restructuring). Icon reuses an existing placeholder SVG per the established convention (e.g. the `tipos-servicio` wrench icon already reused by "Órdenes de Trabajo", final icon choice cosmetic and deferred to design).
- **Three stacked sections on the Panel page:**
  1. **Stats/summary row** — five figures: orders *del día*, count `pendiente`, count `en_proceso`, count `terminado`, and *mecánicos trabajando*. All five are reactive to the filter bar (see Decisions D3).
  2. **Filter bar** — mecánico (reusing the `listUsers({ status: 'activo' })`-populated selector pattern from the list page), estado, prioridad, and a **date filter** with presets hoy / semana / mes plus a personalizado (custom range) option. Date filtering is entirely new backend + frontend work; no date-range filter exists in this module today.
  3. **Kanban board** — four columns, one per `Estado` value (`pendiente`, `en_proceso`, `terminado`, `cancelado`), each rendering the filtered orders whose estado matches that column, using card markup close to the existing "tarjetas" view (cliente, vehículo, mecánico, prioridad badge, tipos de servicio chips).
- **New dedicated aggregated backend endpoint** (working name `GET /ordenes-trabajo/panel`) that accepts all Panel filters (estado, mecanicoId, prioridad, and the date range on `fechaIngreso`) and returns, in a single `$transaction`, the stats block, the mecánicos-trabajando figure, and the full filtered order set for the board — mirroring the existing server-side aggregation precedent (`findAll`'s per-estado `counts` computed in the same transaction). New query DTO, service method, controller route; guarded by `JwtAuthGuard` only, consistent with the rest of the module.
- **Date-range filtering on `fechaIngreso`** added to the backend where-builder so the presets and custom range resolve to a `fechaIngreso` window (see Decisions D1). Whether this reuses/extends `buildOrdenTrabajoWhere` or is Panel-local is a design detail.
- **Stale-spec correction (small, in-scope):** amend `openspec/specs/ordenes-trabajo-management/spec.md` where it still asserts "no `cancelado` state exists" (line ~166) and "Lifecycle is expressed only through `estado`" context (the `cancelado` enum value has existed since migration `20260716124433_add_cancelado_estado`). This change's own spec delta already touches the estado enum surface (the Kanban has a `cancelado` column), so correcting the stale line here avoids compounding spec/schema drift. See Decisions D6.

### Out of Scope / Non-Goals
- **Drag-to-change-estado / any board write interactivity.** The Kanban is **read-only** this version: cards are grouped visually by estado and dragging a card does NOT mutate the order's estado. No drag-and-drop library is introduced (none is installed today). Editing an order's estado stays on the existing flows (`PATCH /ordenes-trabajo/:id`, the "Iniciar trabajo" action). The `iniciar` vs generic-`PATCH` cascade asymmetry the exploration flagged is therefore not exercised by this change.
- **A distinct "Mecánico" entity.** `mecanico` remains a `User` via the existing relation; no new model, no `rol` enforcement.
- **Role-based / permission-gated access to the Panel.** Same posture as every existing section — `JwtAuthGuard` only, deferred to the future "Permisos" feature. No `RolesGuard` exists or is introduced.
- **Changes to the existing list page** (`/ordenes-trabajo`), its endpoint, its pagination contract, or its summary pills. The Panel gets its own endpoint rather than overloading `GET /ordenes-trabajo`.
- **Per-column pagination / infinite scroll on the board.** The board renders the full filtered set in one shot (bounded per D5); paginated/lazy columns are a possible later refinement, not this change.
- **Historical/analytics dashboards, charts, throughput/aging metrics** beyond the five stated figures.

## Capabilities
### New Capabilities
- `ordenes-trabajo-panel`: a read-only work-board view for órdenes de trabajo — a filter-reactive stats row, a filter bar with `fechaIngreso`-based date presets + custom range, and an estado-grouped Kanban board — backed by one dedicated aggregated endpoint that returns stats, mecánicos-trabajando, and the full filtered order set for the currently applied filters.

### Modified Capabilities
- `ordenes-trabajo-management`: no behavior change to the existing endpoints; a **documentation correction only** — the stale "no `cancelado` state exists" assertion is fixed to reflect the live schema (`Estado` includes `cancelado`).
- `app-navigation`: adds a top-level "Panel de Trabajo" leaf entry. No role filtering — consistent with the existing "No Role Filtering" posture.

## Approach
**Backend — dedicated aggregated Panel endpoint (Approach 1 from exploration).** A new `GET /ordenes-trabajo/panel` accepts the Panel filters and returns `{ stats, mecanicosTrabajando, data }` computed server-side in one `$transaction`. This was chosen over the two alternatives deliberately:

- **Rejected: reuse `GET /ordenes-trabajo` client-side (Approach 2).** It fights the existing pagination contract — the board needs the *full* matching set, not one page — and it would push aggregation logic (distinct mechanics, "del día" counting) into the frontend, duplicating business logic that today lives server-side (the per-estado `counts` in `findAll`). Correctness would degrade as volume grows past a page.
- **Rejected: hybrid (Approach 3).** Two round trips and it still has to resolve the full-dataset-vs-paginated question for the board half, without a clear win over doing it once server-side.
- **Chosen rationale:** a single round trip; aggregation stays in the service layer next to the existing `counts` precedent, so a future reader finds one convention, not two; and the Panel gets its own response contract instead of distorting the list endpoint's. Because the stats and the board are driven by the **same** filtered `where`, they are computed from the same query and cannot disagree (directly satisfies D3).

**Frontend — new page reusing established patterns.** The Panel page reuses the list page's proven building blocks: the debounced/`listUsers`-populated filter-bar controls, and card markup adapted from the "tarjetas" view for the Kanban cards. Columns are static estado buckets (no DnD). The date filter adds a preset control (hoy/semana/mes/personalizado) that resolves client-side to a `fechaIngreso` range sent to the new endpoint. The stats row binds to the endpoint's `stats`/`mecanicosTrabajando` response, so it re-fetches with the board whenever a filter changes.

**"Del día" and the date filter share one field.** Both the "orders del día" stat and the hoy/semana/mes/personalizado filter resolve against `fechaIngreso` (the client-editable intake date), not `createdAt`, so backdated intake entries land in the day/range their operator recorded (D1).

## Decisions (documented for later review/override)
- **D1 — Date reference field is `fechaIngreso`.** Both "órdenes del día" and the hoy/semana/mes/personalizado filter window are computed against `fechaIngreso`, not `createdAt`. *Rationale:* fixed product decision; `fechaIngreso` is the operator-meaningful intake date (client-editable, backdate-capable), so the day/range reflects when work was logged as arriving, not when the row was inserted.
- **D2 — Kanban is read-only.** Cards are grouped by estado for viewing; dragging does not mutate estado, and no drag-and-drop dependency is added. *Rationale:* fixed product decision; keeps the change additive and sidesteps the `iniciar`/`PATCH` cascade-asymmetry risk entirely for v1.
- **D3 — Stats row is reactive to the filter bar (single filtered dataset).** The same filter set (mecánico/estado/prioridad/date range) drives both the stats numbers and the Kanban board; there is no separate always-today snapshot. *Rationale:* fixed product decision; one filtered `where` powers both, so numbers and cards are guaranteed consistent. Note: because the estado filter is one of the shared filters, selecting a single estado will scope the whole board (and its per-estado figures) to that estado — expected behavior of a shared filtered set.
- **D4 — "Mecánicos trabajando" is a COUNT (flagged assumption).** It is the count of **distinct mechanics with at least one order in `en_proceso` within the currently filtered set**, following the existing `activo: true` convention that `findAll`'s per-estado counts already apply (i.e. soft-deactivated orders do not count). It is **not** a list of names. *Rationale:* fixed product decision, but explicitly flagged as an assumption easy to revisit — a later version may switch to a named list, and the `activo: true` interaction with `en_proceso` orders is the specific detail to re-confirm if the number ever looks off.
- **D5 — Board renders the full filtered set, with a sane hard cap (exact cap = open design question).** The endpoint returns the complete set matching the current filters (not one paginated page) so the board is whole. To bound worst-case payload/render cost, a hard cap SHOULD be applied with an explicit "showing first N" signal rather than truncating silently. *Rationale:* a Kanban needs all matching cards at once, but an unbounded query is an operational foot-gun as data grows; the precise cap value and the over-cap UX are deferred to `sdd-design` (see Open Questions).
- **D6 — Fix the stale `cancelado` spec line in this change.** The `ordenes-trabajo-management` spec's "no `cancelado` state exists" assertion is corrected here rather than deferred. *Rationale:* this change's spec delta already touches the estado enum (the board has a `cancelado` column), so it is the natural, low-cost moment to reconcile the doc with the schema and avoid compounding drift; the alternative (leaving it stale) would have the new Panel spec reference a `cancelado` column while a sibling spec denies the value exists.
- **D7 — New route + nav entry, not a replacement.** The Panel is a new `/ordenes-trabajo/panel` route and a new nav leaf, leaving `/ordenes-trabajo` and its view intact. *Rationale:* the list page's table/tarjetas remain the record-editing surface; the Panel is an additional operational lens on the same data, so the two coexist.
- **D8 — Access control deferred.** Panel endpoint and page require only `JwtAuthGuard`; any authenticated `rol` can view. *Rationale:* consistent with every existing section; deferred to the future Permisos feature.

## Rollback Plan
This change is **additive** — one new backend endpoint (route + DTO + service method), one new frontend page, one new nav entry, and one small spec-text correction. There is **no schema/migration change and no data backfill**, so rollback carries no data-loss risk. Rollback is mechanical:
1. Revert the PR (or, piecemeal): remove the `GET /ordenes-trabajo/panel` controller route, its query DTO, and the service method; nothing else calls them.
2. Remove `client/app/(dashboard)/ordenes-trabajo/panel/` and the "Panel de Trabajo" entry from `client/app/lib/navigation.tsx`.
3. Optionally revert the `ordenes-trabajo-management` spec-text correction (documentation-only; reverting it merely re-introduces the known-stale line — low stakes either way).
The existing list endpoint, list page, and any `buildOrdenTrabajoWhere` reuse must be left in a state where the list page keeps working; if date-range params were added to a shared where-builder, they are additive/optional and safe to leave or remove.

## Known Gaps / Accepted Tradeoffs
- **"Mecánicos trabajando" semantics are an assumption (D4).** Shipping a bare count (not a named list) and the `activo: true` + `en_proceso` interaction are deliberate but flagged for easy revisit.
- **Full-set board has an unbounded-growth tail (D5).** A hard cap mitigates worst case, but the exact cap and over-cap UX are unresolved until design; a very large filtered set is the perf edge to watch.
- **No shared type package.** The Panel response shape is duplicated between the server DTO/response and the client API types, following the codebase's existing "change one, change the other" convention.
- **Estado filter interacts with per-estado stats.** Because stats and board share one filtered set (D3), filtering to a single estado necessarily zeroes the other columns/figures — intended, but worth stating so it is not read as a bug.
- **Read-only board defers the "act on it" workflow.** A supervisor seeing a stuck order on the board still switches to the list/detail flow to change its estado; wiring board-side actions is a later change.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Full-filtered-set query grows unbounded and degrades payload/render as data accumulates | Med | D5 mandates a hard cap with an explicit "showing first N" signal; exact cap + over-cap UX specced in `sdd-design` before apply |
| "Mecánicos trabajando" count is computed on the wrong set (e.g. ignoring `activo: true`, or not distinct, or not `en_proceso`) | Med | D4 pins the exact definition (distinct mechanics, `en_proceso`, `activo: true`, within filtered set) following the `findAll` counts precedent; `sdd-design`/`sdd-spec` encode it as an explicit scenario |
| Stats and board drift apart (numbers disagree with visible cards) | Low | Single `$transaction`, single filtered `where` powers both (Approach 1 + D3) — they are computed from the same query |
| `fechaIngreso` vs `createdAt` confusion reintroduces the wrong date field somewhere (e.g. "del día" on `createdAt`) | Med | D1 fixes `fechaIngreso` for BOTH the daily stat and the range filter; specced as a single shared window so the two cannot diverge |
| New `panel` route segment collides with the existing `:id` param route on the controller | Med | Declare the literal `panel` route before/appropriately relative to `:id` (same discipline the module already applies to literal-vs-param routes); verified in `sdd-design`/apply |
| Correcting the stale `cancelado` spec line accidentally alters an unrelated behavioral requirement | Low | The correction is documentation-only, scoped to the "no `cancelado` state exists" assertion; no endpoint behavior changes |
| Reviewer/user expected a drag-to-move board | Low–Med | D2 explicitly scopes the board read-only for v1 and states DnD as a non-goal; called out up front, not discovered at review |

## Success Criteria
- [ ] A new `/ordenes-trabajo/panel` page exists, reachable from a new top-level "Panel de Trabajo" nav entry, with the existing `/ordenes-trabajo` list page unchanged.
- [ ] The page renders three stacked sections: a stats row (del día, pendientes, en proceso, terminados, mecánicos trabajando), a filter bar (mecánico, estado, prioridad, date filter with hoy/semana/mes/personalizado), and a Kanban board with four columns — `pendiente`, `en_proceso`, `terminado`, `cancelado`.
- [ ] A dedicated `GET /ordenes-trabajo/panel` endpoint (guarded by `JwtAuthGuard` only) accepts estado/mecanicoId/prioridad and a `fechaIngreso` date range, and returns the stats, the mecánicos-trabajando figure, and the full filtered order set in one response.
- [ ] The stats row and the Kanban board reflect the exact same filtered dataset — changing any filter updates both consistently (no separate always-today snapshot).
- [ ] "Órdenes del día" and the hoy/semana/mes/personalizado filter both resolve against `fechaIngreso`, not `createdAt`.
- [ ] "Mecánicos trabajando" is the count of distinct mechanics with ≥1 `en_proceso` order (`activo: true`) within the current filtered set.
- [ ] The board is read-only: no drag-to-change-estado, no new drag-and-drop dependency added to `client/package.json`.
- [ ] The board renders the full filtered set (bounded by the design-specified hard cap, with an explicit "showing first N" signal when exceeded).
- [ ] `openspec/specs/ordenes-trabajo-management/spec.md` no longer asserts "no `cancelado` state exists"; the text reflects that `Estado` includes `cancelado`.
- [ ] The change is additive with no migration/backfill and is reversible per the Rollback Plan.
