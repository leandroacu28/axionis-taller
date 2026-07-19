# Tasks: Per-mechanic workload cards on `/ordenes-trabajo/panel`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~190-230 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (backend endpoint + frontend section together) |
| Delivery strategy | ask-on-risk |
| Chain strategy | n/a (single PR) |

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low

This change is meaningfully smaller than the sibling `panel-trabajo` change: no query DTO, no
filter/date-range logic, no `RolesGuard`/nav changes, one backend service method, one small
presentational component, and incremental wiring in an already-existing page.

Estimate breakdown, calibrated against the sibling change's actuals and design.md's code blocks:
- `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts` (one new `@Get('panel/mecanicos')`
  route, no DTO/`@Query()`): ~5-8 lines
- `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` (incremental additions: `OPEN_ESTADOS`
  constant, `labelFor` helper, `panelMecanicos()` method): ~55-70 lines
- `client/app/lib/ordenes-trabajo.ts` (incremental additions: `MecanicoWorkload` /
  `PanelMecanicosResponse` types + `getPanelMecanicos()`): ~25-30 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/MecanicosWorkload.tsx` (new file, presentational,
  re-declared `mecanicoLabel()`): ~35-45 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` (incremental: 3 new state hooks, one
  `loadWorkload` function, one empty-deps `useEffect`, one render block, 2-3 new imports):
  ~65-80 lines

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Backend: `panelMecanicos()` service method + `@Get('panel/mecanicos')` route | ~65-80 lines; independently verifiable via curl/dev server; zero risk to `panel()`/`findAll`/`findOne` since nothing shared is modified beyond adding a route |
| 2 | Frontend: `lib/ordenes-trabajo.ts` additions + `MecanicosWorkload.tsx` + `page.tsx` wiring | ~125-155 lines; depends on Unit 1's endpoint being live |

Given the small total size, both units are delivered in a single PR unless `sdd-apply` finds the
combined diff exceeds ~400 lines in practice, in which case fall back to `ask-on-risk` and split
along the Unit 1 / Unit 2 boundary above.

## Phase 1: Backend — Service Method (`ordenes-trabajo.service.ts`)

- [x] 1.1 Add a module-level `OPEN_ESTADOS: Estado[] = ['pendiente', 'en_proceso']` constant (or
      inline equivalent) with a short comment noting this is the "open work" predicate shared by
      both the mechanic pool's order `groupBy` and the shop-wide total — per design.md §1.4
- [x] 1.2 Add the module-local `labelFor(m: { nombre: string | null; apellido: string | null;
      username: string }): string` helper: `` `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() ||
      m.username `` — used **only** for the service-layer sort tiebreak, mirroring (but not
      importing/sharing with) the client's `mecanicoLabel()` per D7 (design.md §1.4/§1.6)
- [x] 1.3 Add `async panelMecanicos()` on `OrdenesTrabajoService`. Requires spec: (a) run
      `this.prisma.$transaction([...])` with exactly two reads — `user.findMany({ where: { activo:
      true }, select: { id, nombre, apellido, username }, orderBy: { id: 'asc' } })` and
      `ordenTrabajo.groupBy({ by: ['mecanicoId'], where: { activo: true, estado: { in:
      OPEN_ESTADOS } }, _count: { _all: true } })` — no filter/where builder is reused or created,
      this endpoint has no filters (design.md §1.4, §1.5/ADR-2)
- [x] 1.4 In `panelMecanicos()`, build `countByMecanico = new Map(groups.map(g => [g.mecanicoId,
      g._count._all]))` and derive `totalOrdenes = groups.reduce((sum, g) => sum + g._count._all,
      0)` — **do not** issue a third `count()` query; the denominator is derived from the same
      `groupBy` sum per ADR-3
- [x] 1.5 In `panelMecanicos()`, left-join: map the active-mechanics pool to `{ mecanicoId, nombre,
      apellido, username, count: countByMecanico.get(m.id) ?? 0, percentage: totalOrdenes === 0 ?
      0 : Math.round((count / totalOrdenes) * 100) }` — the zero-fill (mechanics absent from
      `countByMecanico` default to `count: 0`) and the zero-denominator guard are both mandatory
      (D2, D4; design.md §1.4)
- [x] 1.6 Sort the mapped list by `count` descending, then `labelFor(a).localeCompare(labelFor(b),
      'es')` ascending as the tiebreak (D8; design.md §1.4/§1.6) — return `{ mecanicos:
      mecanicosOut, meta: { totalOrdenes } }` exactly matching the response shape in design.md
      §1.3 (raw `nombre`/`apellido`/`username` on the wire, no pre-joined display string)

## Phase 2: Backend — Controller Route

- [x] 2.1 In `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`, add `@Get('panel/mecanicos')`
      immediately **after** the existing `@Get('panel')` handler and **before** `@Get(':id')`
      (design.md §1.1) — placement is for readability/auditability only (the two-segment literal
      path cannot collide with the single-segment `:id` route regardless of order; design.md's
      route-collision analysis confirms this), but keep the two `panel*` literal routes physically
      adjacent per the controller's existing discipline
- [x] 2.2 Implement the handler with **no** `@Query()`, no DTO, no `@Param()`, no `@Body()`:
      `async panelMecanicos() { return this.ordenesTrabajoService.panelMecanicos(); }` — relies
      solely on the controller's existing class-level `@UseGuards(JwtAuthGuard)`, no per-route
      guard, no `RolesGuard` (D1, sibling D8)

## Phase 3: Backend Manual Verification

Maps to design.md §5's Testing Strategy table. Per `openspec/config.yaml` (`test_command: ""`),
verification is manual — via the dev server where available, plus static code review and a build
check.

- [x] 3.1 Route reachability + auth (spec: "Mecánicos Workload Endpoint Requires Authentication
      Only..."): `GET /ordenes-trabajo/panel/mecanicos` returns the workload payload — not the
      `panel` payload and not a `400` from `:id`'s `ParseIntPipe`; confirm 401 without a Bearer
      token; confirm any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'`
- [x] 3.2 Filter-shaped query params are accepted but ignored: appending
      `estado=pendiente&prioridad=urgente&mecanicoId=1&from=2026-01-01&to=2026-01-31` to the
      request produces an identical response to a request with no query params (handler takes no
      `@Query()`, so anything sent is a no-op by construction — confirm no DTO/pipe parses them)
- [x] 3.3 All active mechanics included, including zero-load (spec: "Every Active Mechanic Gets an
      Entry..."): every `User` with `activo: true` gets an entry, including a mechanic with no
      `pendiente`/`en_proceso` orders (`count: 0`, `percentage: 0`); a mechanic with only
      `terminado`/`cancelado` orders also reads `0`/`0%`; a `User` with `activo: false` gets no
      entry regardless of any orders assigned to them
- [x] 3.4 Count semantics (spec: "Per-Mechanic Count Is Scoped to Pendiente and En_proceso Orders
      Only"): a mechanic with 2 `pendiente` + 1 `en_proceso` + 1 `terminado` + 1 `cancelado` order
      (all `activo: true`) has `count: 3`; a `pendiente` order with `activo: false` does not
      contribute to the mechanic's count or to `meta.totalOrdenes`
- [x] 3.5 Zero-denominator shop-wide (spec: "Percentage Is Computed Against the Shop-Wide Total...",
      D4): with zero shop-wide `pendiente`/`en_proceso` orders, the response is `200`, every entry
      has `count: 0` and `percentage: 0` — never `NaN`, never omitted, section not hidden;
      `meta.totalOrdenes` is `0`
- [x] 3.6 Percentage math including the deactivated-mechanic case (spec: "Percentage reflects a
      mechanic's share..." and "Orders assigned to a deactivated mechanic still count..."): for
      counts `6`/`3`/`1` (total `10`), percentages are `60`/`30`/`10`; separately, with a mechanic
      deactivated (`User.activo: false`) after being assigned 2 still-open orders and 8 other open
      orders across active mechanics (`meta.totalOrdenes: 10`), confirm no entry is returned for
      the deactivated mechanic and the sum of returned entries' `count` is `8` — **less than**
      `meta.totalOrdenes` — expected per the corrected spec and design.md §1.4's "Design note"
      (confirms design's `totalOrdenes = Σ group._count._all` over the raw, unfiltered `groupBy`
      already matches the corrected spec denominator — no code change needed, verification only)
- [x] 3.7 Sort order + tiebreak (spec: "Entries Are Sorted By Count Descending..."): counts `5`,
      `2`, `8` order as `8, 5, 2`; two mechanics with equal `count` (e.g. "Bruno Diaz" and "Ana
      Perez", both `count: 4`) order "Ana Perez" before "Bruno Diaz" (name ascending tiebreak,
      locale `'es'`)
- [x] 3.8 Response shape (spec: "Response Includes Per-Mechanic Identity and Load Figures Plus a
      Shop-Wide Total"): confirm the exact envelope from design.md §1.3 — `mecanicos[]` with
      `mecanicoId`, raw `nombre`/`apellido`/`username`, `count`, `percentage`; `meta.totalOrdenes`
      present and equal to the sum of every returned entry's `count` in the no-deactivated-mechanic
      case
- [x] 3.9 No regression to existing backend behavior: `GET /ordenes-trabajo/panel` (all filter
      combinations), `GET /ordenes-trabajo` (list), and `GET /ordenes-trabajo/:id` all behave
      exactly as before this change — confirm nothing in `panel()`, `buildPanelOrdenTrabajoWhere`,
      or the existing routes was touched

## Phase 4: Frontend — API Client (`lib/ordenes-trabajo.ts`)

- [x] 4.1 Add `MecanicoWorkload` interface (`mecanicoId: number`, `nombre: string | null`,
      `apellido: string | null`, `username: string`, `count: number`, `percentage: number`) and
      `PanelMecanicosResponse` interface (`mecanicos: MecanicoWorkload[]`, `meta: { totalOrdenes:
      number }`) — duplicated from the server contract per the codebase's standing "no shared type
      package, change one, change the other" convention (design.md §2.1)
- [x] 4.2 Add `async getPanelMecanicos(): Promise<PanelMecanicosResponse>` — **no params** (unlike
      `getOrdenesTrabajoPanel(params: GetPanelParams)`), `fetch(`${API_BASE_URL}/ordenes-trabajo/panel/mecanicos`,
      { headers: { ...getAuthHeader() } })`, pass through `handleJsonResponse(res, 'No se pudo
      obtener la carga por mecánico')` — mirrors the existing `getOrdenesTrabajoPanel` fetch
      pattern exactly except for the absent query string

## Phase 5: Frontend — `MecanicosWorkload` Component

- [x] 5.1 Create `client/app/(dashboard)/ordenes-trabajo/panel/MecanicosWorkload.tsx`: purely
      presentational, `{ mecanicos: MecanicoWorkload[] }` prop, **no fetching** — same posture as
      `PanelStats.tsx` (design.md §2.2)
- [x] 5.2 Re-declare `mecanicoLabel()` locally in this file (D7 — do not extract a shared module,
      do not edit the list/board/`PanelStats` surfaces): `` `${m.nombre ?? ''} ${m.apellido ??
      ''}`.trim() || m.username `` — same formula as the server's `labelFor` and the existing list
      page's helper
- [x] 5.3 Render a `<section>` with a heading ("Carga por mecánico") and a responsive grid
      (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) of cards — one per entry, **in the order
      received** (the component does **not** re-sort; the list arrives pre-sorted from the
      service). Each card shows the resolved `mecanicoLabel(m)` name, `m.count`, and `${m.percentage}%
      de la carga`, reusing `PanelStats.tsx`'s exact card shell (`rounded-xl border
      border-stone-200 bg-white p-4 shadow-sm`) — no color-coding by load level, no percentage bar
      (ADR-6, design.md §2.2)

## Phase 6: Frontend — Container Page Wiring (`panel/page.tsx`)

- [x] 6.1 Add three independent state hooks alongside the existing panel state: `mecanicosWorkload:
      MecanicoWorkload[] | null` (default `null`), `workloadLoading: boolean` (default `true`),
      `workloadError: string` (default `''`) — these are **separate** from `result`/`loading`/
      `error` and must not be merged with them (design.md §2.3)
- [x] 6.2 Add a `loadWorkload` async function: sets `workloadLoading(true)`, clears
      `workloadError`, calls `getPanelMecanicos()`, sets `mecanicosWorkload` from `res.mecanicos`
      on success, sets `workloadError` from the caught error's message (or the generic
      "No se pudo conectar con el servidor." fallback) on failure, sets `workloadLoading(false)`
      in a `finally`
- [x] 6.3 Add a **separate** `useEffect(() => { loadWorkload(); }, [])` with an **explicitly
      empty** dependency array so it fetches exactly **once on mount** — this task is called out
      on its own because the deps array MUST NOT gain `estado`/`mecanicoId`/`prioridad`/
      `datePreset`/`customDesde`/`customHasta` (unlike the existing `loadPanel` effect, which IS
      correctly keyed on every filter). Add the design.md §2.3 comment verbatim (or equivalent)
      explaining why this effect must stay filter-independent, and add the matching
      `// eslint-disable-next-line react-hooks/exhaustive-deps` so the lint rule does not silently
      pressure a future edit into adding filter deps
- [x] 6.4 Import `getPanelMecanicos`, `type MecanicoWorkload` from `lib/ordenes-trabajo`, and the
      new `MecanicosWorkload` component
- [x] 6.5 Render the new section **below** `<KanbanBoard>`, with its own independent
      loading/error/empty handling reusing the page's existing spinner / red-banner-with-retry
      markup (design.md §2.3): loading spinner while `workloadLoading`; red banner + "Reintentar"
      button calling `loadWorkload` on `workloadError`; `<MecanicosWorkload mecanicos=
      {mecanicosWorkload} />` when `mecanicosWorkload` is non-empty; a distinct "No hay mecánicos
      activos para mostrar." empty state only when the pool itself is empty (an array of `0/0%`
      cards is **not** the empty state — it renders normally)

## Phase 7: Frontend & Full-Stack Manual Verification

Maps to design.md §5's Testing Strategy table (remaining rows not already covered in Phase 3).

- [x] 7.1 Run `npm run build` (per `openspec/config.yaml`'s `verify.build_command`) and confirm it
      succeeds with no type errors across both the new backend service/controller additions and
      the new frontend files
- [x] 7.2 Verify the new section renders below `<KanbanBoard>` on `/ordenes-trabajo/panel`, showing
      one card per active mechanic with name, count, and percentage (spec: "Panel Page Renders a
      Mecánicos Workload Section Below the Kanban Board, Fetched Once on Mount")
- [x] 7.3 Filter-independence (spec: "The Endpoint's Response Is Independent of the Panel's Filter
      State" / "Changing a panel filter does not change the mecánicos workload section"): with
      DevTools open on the workload section's DOM subtree and Network tab visible, change **every**
      panel filter in turn (estado, prioridad, mecánico, date preset, custom range) and confirm (a)
      the Kanban board and stats row re-fetch and update as before, (b) the workload section's
      rendered cards remain **byte-identical**, and (c) **no** new `GET
      .../panel/mecanicos` request fires
- [x] 7.4 Verify the empty-pool state ("No hay mecánicos activos para mostrar.") is distinct from
      the zero-load state (active mechanics all showing `0`/`0%` cards, which renders the normal
      grid, not the empty message)
- [x] 7.5 No regression (spec: "Existing Panel Board, Stats, Filter Bar, and Panel Endpoint Are
      Unchanged"): the Kanban board, stats row, filter bar, and `/ordenes-trabajo` list page behave
      exactly as before this change; the new section is additive only, not interleaved with or
      replacing any existing section

## Phase 8: Documentation & Final Sign-off

- [x] 8.1 Walk `proposal.md`'s Success Criteria checklist end-to-end and confirm each item: section
      renders below the board with one card per active mechanic; each card shows name/count/
      percentage per the fixed formulas; idle mechanics included via the `activo: true` pool with
      no `rol` filter; sort by count desc/name asc tiebreak; filter-independence confirmed live;
      zero-denominator yields `0`/`0%` on every card; the dedicated `GET
      /ordenes-trabajo/panel/mecanicos` endpoint (`JwtAuthGuard` only, no filter params) computes
      counts/percentages/total server-side in one `$transaction`; existing board/stats/filter
      bar/list page unchanged; no drill-down and no `rol` filter added; change is additive with no
      migration and reversible per the Rollback Plan
- [x] 8.2 Confirm the design's Open Questions resolution stands: the deactivated-mechanic-with-
      open-orders case (visible cards summing to less than `meta.totalOrdenes`) is correct-by-spec
      per the corrected `spec.md`, and design.md §1.4/ADR-3's implementation
      (`totalOrdenes = Σ group._count._all` over the raw, unfiltered `groupBy`) required no change
      to satisfy it — Phase 1's `panelMecanicos()` implementation and Phase 3.6's verification
      confirm this alignment
- [x] 8.3 Confirm the Rollback Plan in `proposal.md` is accurate and executable as written:
      removing the `GET /ordenes-trabajo/panel/mecanicos` route/service method, removing
      `MecanicosWorkload.tsx` and its section render/state/effect from `page.tsx`, and removing
      `getPanelMecanicos()` and its types from `lib/ordenes-trabajo.ts` all leave the existing
      panel page (board, stats, filter bar) and list page fully functional
