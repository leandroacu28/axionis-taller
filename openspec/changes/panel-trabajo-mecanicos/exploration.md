# Exploration: Per-mechanic workload cards on `/ordenes-trabajo/panel`

## Current State

**Backend — reusable precedent (`server/src/ordenes-trabajo/ordenes-trabajo.service.ts`):**
- `panel(query: PanelOrdenesTrabajoQueryDto)` (lines 322–378) runs one `$transaction` with 7 operations: `findMany` (capped rows), `count(total)`, `count(delDia)`, three per-estado `count`s, and one `groupBy(['mecanicoId'], where: {AND:[where,{estado:'en_proceso'}]})` whose `.length` becomes `mecanicosTrabajando` (a bare distinct count, line 373). This `groupBy` is the exact building block needed for a per-mechanic breakdown — swap `.length` for iterating `mecanicos` (each row already carries `mecanicoId`) and add a `_count: { _all: true }` to get per-mechanic counts in one query.
- `buildPanelOrdenTrabajoWhere(query)` (lines 149–164) always forces `activo: true`, then ANDs in `estado`/`prioridad`/`mecanicoId`/`fechaIngreso` range from the shared filter bar. Sub-counts use `AND`-composition (not object spread) specifically so a user's own `estado` filter isn't overridden — same discipline would apply to a mechanic-load query if it reuses `where`.
- Response shape returned today: `{ stats: {delDia, pendiente, enProceso, terminado, mecanicosTrabajando}, data: OrdenTrabajoListItem[], meta: {total, cap, capped} }`.
- Controller (`ordenes-trabajo.controller.ts` lines 40–43): `@Get('panel')` is declared literal-before-`:id` (lines 45–48) specifically to avoid `ParseIntPipe` swallowing the literal string. Any new sub-route (e.g. `panel/mecanicos`) is a two-segment literal path — Nest/Express won't route it through the single-segment `:id` param regardless of declaration order, but placing it near `panel` keeps the file's literal-route discipline consistent and easy to audit.
- **Schema fact that resolves one open question:** `OrdenTrabajo.mecanicoId` is `Int` (schema.prisma line 228), **not nullable**. `mecanico` is a required relation, and `create()` always calls `assertMecanicoActivo(tx, dto.mecanicoId)` before creating. **Every `OrdenTrabajo` row always has a `mecanicoId`.** The "does the percentage denominator need to exclude null-mecanico orders" question is moot under the current schema — there is no unassigned-order case. This is a closed finding, not an open question.

**Frontend — reusable pieces (`client/app/(dashboard)/ordenes-trabajo/panel/`):**
- `page.tsx` (62–171) is the container: owns all filter state (`estado`, `mecanicoId`, `prioridad`, `datePreset`, `customDesde/Hasta`, `mecanicos`), fetches `mecanicos` once via `listUsers({ status: 'activo' })` (lines 76–83), and re-fetches the panel on any filter-state change via a `useEffect` keyed on all 6 filter deps. A new "workload by mechanic" section would plug into this same container — either as a fourth prop derived from the same `result` fetch, or a second independent fetch/effect if it needs to be filter-independent.
- `PanelStats.tsx` — pure presentational, five hardcoded figure tiles from `stats`. Pattern to imitate for a mechanic card: props-in, no own fetching.
- `KanbanBoard.tsx` — `COLUMN_CLASSES` added per-column colors (just implemented); no drag logic; buckets `data` client-side by `estado`. Not directly reusable for mechanic cards but the `mecanicoLabel()` helper (`${nombre} ${apellido}`.trim() falling back to `username`) is the exact naming convention to replicate — already re-declared per-file in `KanbanBoard.tsx` and `PanelFilters.tsx` per the codebase's accepted "no shared presentation module yet" tradeoff.
- `client/app/lib/ordenes-trabajo.ts`: `PanelStats`/`PanelResponse`/`GetPanelParams` interfaces and `getOrdenesTrabajoPanel` — duplicated from the server response shape by house convention (no shared type package). Extending `PanelResponse` with a `mecanicos: MecanicoWorkload[]` field, or adding a new `getPanelMecanicos()` function, both fit this file's existing pattern.
- `client/app/lib/users.ts`: `UserListItem` has `id`, `dni`, `email`, `activo`, `updatedAt`, `creadoPor`, plus `UserData` fields (`nombre`/`apellido`/`username`/`rol`). **No `rol` filter exists on `listUsers`/`GET /users`** — so "mechanic" here means "any active `User`", identical to the D6/D8 convention the whole `panel-trabajo` change already established. There is no way today to narrow the active-user pool to `rol: 'mecanico'` specifically at the API level, even though a `mecanico` rol value exists in `USER_ROLES`.

## Affected Areas
- `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` — either extend `panel()`'s `$transaction` with an 8th operation (a `groupBy` with `_count`), or add a new `mecanicosWorkload()` method with its own transaction.
- `server/src/ordenes-trabajo/dto/panel-ordenes-trabajo-query.dto.ts` — reused as-is if extending the existing endpoint; a new DTO (subset or identical) if a dedicated endpoint.
- `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts` — either no change (extend `panel`) or one new literal route (e.g. `@Get('panel/mecanicos')`, placed near the existing `panel` handler).
- `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` — new state/fetch wiring (or reuse of existing `result` if the response is extended) plus a new section rendered below `<KanbanBoard>`.
- New frontend component, e.g. `MecanicosWorkload.tsx` — new file, sibling of `PanelStats.tsx`/`KanbanBoard.tsx`, presentational, following the same `mecanicoLabel()`-redeclaration pattern.
- `client/app/lib/ordenes-trabajo.ts` — new types (`MecanicoWorkload[]`) and either an extended `PanelResponse` or a new `getPanelMecanicos()` function.
- `client/app/lib/users.ts` — likely reused unchanged (`listUsers({ status: 'activo' })`) if the "all active mechanics get a card" reading is chosen; no new function needed there.

## Approaches

1. **Extend the existing `GET /ordenes-trabajo/panel` response with a `mecanicos: MecanicoWorkload[]` array.**
   - Mechanics: add one more `$transaction` operation — `groupBy({ by: ['mecanicoId'], where: <pendiente+en_proceso where>, _count: { _all: true } })` — then map to `{ mecanicoId, count }[]`, join with the already-fetched `mecanicos` list on the frontend or backend, and compute percentages.
   - Pros: single round trip (matches the existing D3 "one filtered query, no drift" principle); reuses the same transaction, same `where`-building discipline; frontend already re-fetches on every filter change so the new section updates for free if it's meant to share the filter bar.
   - Cons: directly collides with the open filter-semantics question (Q2 below). If this section must be filter-independent (unfiltered snapshot) while the rest of the response is filter-scoped, computing two different `where`s inside the same transaction is doable but muddies what the endpoint "means" as a single filtered view, and enlarges an already 7-operation transaction to 8-9.
   - Effort: Low–Medium.

2. **New dedicated endpoint, e.g. `GET /ordenes-trabajo/panel/mecanicos`.**
   - Own DTO (probably no date/estado params at all if the answer to Q2 is "always unfiltered"), own service method, own small query, own controller route declared as a literal segment near `panel`.
   - Pros: cleanly decouples "workload by mechanic" semantics from the Kanban's filtered `where` — if the product answer to Q2 is "always show current total pendiente+en_proceso load, ignore estado/date filters", a separate endpoint makes that a natural, unambiguous contract. Matches this module's existing precedent (the `panel-trabajo` change itself was justified this way over reusing `GET /ordenes-trabajo`). Keeps `PanelResponse` from growing for callers who don't need it.
   - Cons: second round trip from the frontend (two fetches on mount / two loading states to coordinate); one more DTO/route/service-method/type set to maintain.
   - Effort: Medium.

Both approaches share the identical core aggregation query (`groupBy(['mecanicoId'], where, _count)`) and the identical frontend presentational component; the only real fork is transport, which is downstream of resolving Q2.

## Open Questions (for `sdd-propose`)

1. **Card granularity — one card per mechanic, or one card containing all mechanics?** The user's wording ("una tarjeta salgan los datos del mecanico... de cada mecánico") is ambiguous. Every existing precedent in this codebase for multi-item display (`PanelStats`'s five tiles, `KanbanBoard`'s per-estado columns) uses one repeated card per item — the more consistent reading is **one card per mechanic** (plural cards). Flag both readings before locking scope.

2. **Does this section respect the panel's filter bar, or is it an always-unfiltered snapshot?** Since the metric is inherently "pendiente+en_proceso count", an `estado=terminado` filter selection would zero the section if it inherited the shared `where` — likely undesirable. Two sub-questions:
   - Should it ignore `estado`/`fechaIngreso` (date range) filters, since the metric only makes sense unfiltered by those dimensions? (Strong argument for yes.)
   - Should it still respect the `mecanicoId` filter (narrowing to a single card) and/or `activo: true` on the User? Recommend: respect `activo: true` on the User but NOT the panel's `estado`/`prioridad`/date filters.

3. **Percentage denominator — resolved, not open.** Per the schema, `mecanicoId` is required/non-nullable on `OrdenTrabajo`. There is no unassigned-order case. The denominator is simply "count of all pendiente+en_proceso orders" with no null-exclusion logic needed.

4. **Zero-denominator edge case.** If there are zero pendiente+en_proceso orders total, every card's percentage is 0/0. Recommend defaulting to `0%`, consistent with how the panel's stats block already defaults to `0` on empty sets rather than omitting fields or erroring.

5. **Sort order of mechanic cards.** Load descending (surfaces the most-loaded mechanic first) vs. alphabetical by name (predictable, easy to scan) vs. arbitrary `User.id` order. No existing precedent to anchor on. Recommend load descending as default, alphabetical as tiebreak.

6. **Which mechanics get a card — all active users, or only those with ≥1 assigned order?** If "all active mechanics" (via `listUsers({ status: 'activo' })`, already fetched for the filter dropdown), mechanics with 0 assigned jobs show a `0`/`0%` card — useful for seeing who's idle/available. If "only mechanics with ≥1 order", the query is simpler but silently omits idle mechanics. Recommend "all active mechanics."

## Recommendation

Lean toward **Approach 2 (dedicated endpoint)** *if* Q2 resolves to "this section ignores the panel's estado/date filters" — a separate endpoint makes that decoupling explicit. If Q2 instead resolves to "this section fully shares the panel's filter bar including estado/dates", **Approach 1 (extend existing response)** becomes the stronger fit. This decision is downstream of Q2, which the proposal phase needs to close first.

## Risks
- Building either approach before Q1/Q2 are resolved with the user risks rework: Q2 changes both the query semantics and the transport decision.
- The `mecanicoLabel()` helper is already duplicated three times across the panel's files — a fourth copy in a new `MecanicosWorkload.tsx` component continues an accumulating duplication debt already flagged as an accepted tradeoff for this module.
- If Approach 1 is chosen and the mechanic breakdown needs a different `where` (unfiltered) than the rest of `panel()`'s response (filtered), the `$transaction` array mixes two different filter semantics in one method — a maintainability smell worth flagging in `sdd-design` regardless of which approach is chosen.
- No test runner exists in either package — this change will also rely on manual `sdd-verify` checks, not automated tests.

## Ready for Proposal

Yes, with conditions — the codebase investigation is complete and both approaches are technically well-understood, but the proposal phase MUST resolve Q1 (card granularity), Q2 (filter semantics — the most consequential open question), Q5 (sort order), and Q6 (which mechanics get a card) with the user before design starts, since Q2 specifically determines which of the two approaches to build. Q3 (denominator) is already closed by the schema finding above and should not be re-litigated as open in the proposal.
