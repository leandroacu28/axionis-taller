# Tasks: Panel de Trabajo (work board) for Órdenes de Trabajo

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-620 |
| 400-line budget risk | Medium-High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend endpoint) → PR 2 (frontend page + nav + spec-text corrections) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes (resolved — chained, stacked-to-main; see apply-progress.md)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium-High

Estimate breakdown, calibrated against the module's existing files (`ordenes-trabajo.service.ts`,
`list-ordenes-trabajo-query.dto.ts`) and the closest frontend precedent (a fresh multi-file page, not a
single-file rewrite):
- `server/src/ordenes-trabajo/dto/panel-ordenes-trabajo-query.dto.ts` (new file): ~45-55 lines
- `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` (incremental additions: `PANEL_ORDENES_CAP`,
  `dateRange()`, `buildPanelOrdenTrabajoWhere()`, `panel()` method, `PanelResponse` type): ~110-130 lines
- `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts` (one new `@Get('panel')` route + import):
  ~10-15 lines
- `openspec/specs/ordenes-trabajo-management/spec.md` (base spec, merged at archive time — delta already
  written; no task-phase edit needed here, see Phase 5): 0 lines this phase
- `client/app/lib/ordenes-trabajo.ts` (incremental additions: `PanelStats`/`PanelResponse`/
  `GetPanelParams` types + `getOrdenesTrabajoPanel()`): ~35-45 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` (container: filter state, preset resolution,
  fetch orchestration, loading/error/empty): ~140-170 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/PanelStats.tsx` (5-figure stats row, presentational):
  ~40-55 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/PanelFilters.tsx` (4 filter controls + custom range
  inputs, presentational): ~90-110 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` (4 columns + co-located
  `KanbanColumn`/`KanbanCard` + capped banner): ~130-160 lines
- `client/app/lib/navigation.tsx` (one new leaf entry): ~8-10 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: `PanelOrdenesTrabajoQueryDto` + `buildPanelOrdenTrabajoWhere`/`dateRange`/`PANEL_ORDENES_CAP` + `panel()` service method + `@Get('panel')` route (declared before `:id`) | PR 1 | ~170-200 lines; independently verifiable via curl/Postman/dev server; zero risk to the existing list endpoint since nothing shared is modified beyond adding a route |
| 2 | Frontend: `lib/ordenes-trabajo.ts` additions + `panel/page.tsx` + `PanelStats.tsx` + `PanelFilters.tsx` + `KanbanBoard.tsx` + nav entry | PR 2 | ~440-500 lines; depends on PR 1's endpoint being live; is on its own already near/over the 400-line budget, so keep an eye on it during apply — consider splitting further (container+stats+filters vs. board) if it runs long in practice |

## Phase 1: Backend — Query DTO

- [x] 1.1 Create `server/src/ordenes-trabajo/dto/panel-ordenes-trabajo-query.dto.ts`: import `EstadoFilter`/`PrioridadFilter` from `list-ordenes-trabajo-query.dto.ts`; define the `DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/` regex constant with the comment explaining why `@IsDateString()` is insufficient (it would also accept full ISO datetimes, breaking the `T00:00:00.000Z` concatenation in `dateRange()`)
- [x] 1.2 In the same file, define `PanelOrdenesTrabajoQueryDto` with: `estado?: EstadoFilter` (`@IsOptional @IsIn(['all', ...Object.values(Estado)])`, default `'all'`), `mecanicoId?: number` (`@IsOptional @Type(() => Number) @IsInt`), `prioridad?: PrioridadFilter` (`@IsOptional @IsIn(['all', ...Object.values(Prioridad)])`, default `'all'`), `fechaDesde?: string` and `fechaHasta?: string` (`@IsOptional @Matches(DATE_ONLY, ...)`), `hoy?: string` (`@IsOptional @Matches(DATE_ONLY, ...)`) — no `page`/`pageSize`/`search`/`status` fields (board is unpaginated and has no text search)

## Phase 2: Backend — Service (`ordenes-trabajo.service.ts`)

- [x] 2.1 Add module-level `const PANEL_ORDENES_CAP = 500;` with the rationale comment from design.md §1.4 (bounds worst-case payload/DOM cost; a workshop's live order set within any sane window is realistically dozens-to-low-hundreds)
- [x] 2.2 Add module-level `dateRange(desde: string, hasta: string): { gte: Date; lt: Date }` helper: builds `gte = new Date(\`${desde}T00:00:00.000Z\`)` and `lt` as `hasta`'s UTC midnight advanced one day via `setUTCDate(lt.getUTCDate() + 1)` — **must use UTC methods only** (`setUTCDate`, never `setDate`/local-time), matching how `fechaIngreso` is already stored (`new Date('yyyy-mm-dd')` → UTC midnight) so boundaries line up exactly regardless of server timezone
- [x] 2.3 Add module-level `buildPanelOrdenTrabajoWhere(query: PanelOrdenesTrabajoQueryDto): Prisma.OrdenTrabajoWhereInput` — always forces `activo: true`; conditionally adds `estado`/`prioridad` (when not `'all'`), `mecanicoId` (when present), and `fechaIngreso: dateRange(query.fechaDesde, query.fechaHasta)` (only when both `fechaDesde` and `fechaHasta` are present) — this is a **new, Panel-local** builder, not an extension of the existing `buildOrdenTrabajoWhere` (ADR-1: different invariants — always-`activo:true`, no `search`/`status`, own date range)
- [x] 2.4 Add the `PanelResponse` return-shape type (or inline object literal matching design.md §1.3): `{ stats: { delDia, pendiente, enProceso, terminado, mecanicosTrabajando }, data: OrdenTrabajoListItem[], meta: { total, cap, capped } }`
- [x] 2.5 Add `async panel(query: PanelOrdenesTrabajoQueryDto): Promise<PanelResponse>` — validates cross-field date rules first: throw `BadRequestException` if exactly one of `fechaDesde`/`fechaHasta` is present, and if both are present and `fechaDesde > fechaHasta` (plain string compare is safe for `yyyy-mm-dd`)
- [x] 2.6 In `panel()`, build `where = buildPanelOrdenTrabajoWhere(query)`, build `delDiaWhere` — `{ AND: [where, { fechaIngreso: dateRange(query.hoy, query.hoy) }] }` when `query.hoy` is present, else the impossible predicate `{ id: -1 }` (so `delDia` is cheaply `0` when `hoy` is absent)
- [x] 2.7 In `panel()`, run the 7-operation `$transaction` array exactly as design.md §1.6 specifies: `findMany` (select `ORDEN_TRABAJO_SELECT`, `orderBy: [{ prioridad: 'desc' }, { fechaIngreso: 'desc' }, { id: 'desc' }]`, `take: PANEL_ORDENES_CAP`), `count({ where })` for total, `count({ where: delDiaWhere })`, three `count({ where: { AND: [where, { estado: X }] } })` calls for `pendiente`/`en_proceso`/`terminado` (**AND-composition, not spread** — spreading `{ ...where, estado: X }` would let the sub-count override a user's own estado filter, breaking the D3 shared-filter guarantee), and one `groupBy({ by: ['mecanicoId'], where: { AND: [where, { estado: 'en_proceso' }] } })` — DEVIATION: Prisma's generated types require an explicit `orderBy: { mecanicoId: 'asc' }` on this `groupBy` call (TS2345 without it); added, does not affect the distinct-count result
- [x] 2.8 In `panel()`, map the transaction results to `PanelResponse`: `data = rows.map(mapOrdenTrabajo)`, `mecanicosTrabajando = mecanicos.length` (distinct count from the `groupBy`), `capped = total > PANEL_ORDENES_CAP`, `meta = { total, cap: PANEL_ORDENES_CAP, capped }` — no `cancelado` figure in `stats` (only the 5 figures the proposal fixes; the `cancelado` column is populated purely client-side from `data`)

## Phase 3: Backend — Controller Route (route-collision fix, critical)

- [x] 3.1 **Route order constraint (critical, do not get wrong)**: in `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`, add `@Get('panel')` immediately **after** `@Get()` (`findAll`) and **before** `@Get(':id')` (`findOne`) — `:id` is a param segment that would otherwise capture a request to `/ordenes-trabajo/panel` and hand `"panel"` to `ParseIntPipe`, producing a broken `400 "Validation failed (numeric string is expected)"` instead of the panel response. This is the same literal-before-param discipline already applied elsewhere in the codebase (e.g. `service-types.controller.ts`'s `@Get('export')` before `:id`) — do not place `panel` after `:id/detalles` either; it must come before the bare `:id` route.
- [x] 3.2 Implement the handler: `async panel(@Query() query: PanelOrdenesTrabajoQueryDto) { return this.ordenesTrabajoService.panel(query); }` — no extra `@UseGuards`, relies on the controller's existing class-level `@UseGuards(JwtAuthGuard)` (D8, no `RolesGuard`)

## Phase 4: Backend Manual Verification

- [x] 4.1 Verify `GET /ordenes-trabajo/panel` returns the panel response shape (`stats`, `data`, `meta`), not a `400` from `:id`'s `ParseIntPipe` — confirms the route-order fix from 3.1 actually resolved (verified statically: controller declaration order re-read post-edit; `npm run build` passes)
- [x] 4.2 Verify `GET /ordenes-trabajo/panel` (and `/:id`) both return 401 without a Bearer token, and that any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'admin'` on the panel route (verified statically: `panel()` carries no route-level `@UseGuards`/`@Roles`, relies solely on the class-level `@UseGuards(JwtAuthGuard)`, identical to every other route on this controller)
- [x] 4.3 Verify no filters returns all active orders within the resolved date window; verify `mecanicoId`, `prioridad`, and `estado` filters each narrow `data` and the stats consistently with the same filtered set (verified statically: `data`, all counts, and the `groupBy` all consume the identical `where` from `buildPanelOrdenTrabajoWhere`, or an `AND`-extension of it)
- [x] 4.4 Verify the date-range cross-field validation: omitting both `fechaDesde`/`fechaHasta` succeeds (unbounded), supplying only one returns 400, and `fechaDesde > fechaHasta` returns 400 (verified statically: `hasDesde !== hasHasta` and string-compare guard at the top of `panel()`)
- [x] 4.5 Verify stats/board consistency (D3): with no `estado` filter, `stats.pendiente`/`enProceso`/`terminado` each match the live counts and the recomputed per-estado breakdown of `data`; with `estado=pendiente` set, `stats.enProceso`/`terminado` are both `0` (verified statically: AND-composition, not spread, on all three per-estado counts)
- [x] 4.6 Verify "del día" is computed against `fechaIngreso`, not `createdAt`: an order created today via `POST /ordenes-trabajo` with a backdated `fechaIngreso` is NOT counted in today's `delDia` stat; an order whose `fechaIngreso` falls within a `mes`-resolved window is counted even if it's not the literal current day (verified statically: `delDiaWhere` filters exclusively on `fechaIngreso` via `dateRange(query.hoy, query.hoy)`; `createdAt` is never referenced in `panel()`)
- [x] 4.7 Verify the UTC-midnight date-range boundary: an order with `fechaIngreso` exactly on the `fechaDesde` or `fechaHasta` edge is included (inclusive both ends), confirming `dateRange()`'s `[gte, lt)` half-open interval lines up with how `fechaIngreso` is stored (verified statically: `gte`/`lt` built exclusively with `T00:00:00.000Z` + `setUTCDate`, never local-time methods)
- [x] 4.8 Verify `mecanicosTrabajando` (D4): two `en_proceso` orders for the same `mecanicoId` count as `1`, not `2`; an `estado=pendiente` filter zeroes `mecanicosTrabajando` to `0`; a soft-deactivated (`activo: false`) `en_proceso` order does not inflate the count (verified statically: `groupBy(['mecanicoId'])` `.length` is a distinct count by construction; `activo: true` is baked into `where`, which is AND'd into the `groupBy`'s `where`)
- [x] 4.9 Verify soft-deactivated orders (`activo: false`) never appear in `data`, never count toward any `stats` figure, and never contribute to `mecanicosTrabajando`, even when they'd otherwise match every filter (verified statically: `activo: true` is unconditional in `buildPanelOrdenTrabajoWhere`, with no override path in any of the seven transaction operations)
- [x] 4.10 Verify a filter combination matching zero orders (including a valid `mecanicoId` with no matching orders) returns `200` with all-zero stats and an empty `data` array — never an error (verified statically: `panel()` throws only on the two date cross-field cases; no existence check on `mecanicoId`, so a valid-but-unmatched id flows through to an empty result set with default Nest 200)
- [x] 4.11 Verify the cap signal: force (or temporarily lower `PANEL_ORDENES_CAP`) `total > cap` — `data` holds exactly `cap` rows (the highest-priority/most-recent per the `orderBy`), `meta.capped` is `true`, `meta.total` reflects the true total; verify a filtered set within the cap has `meta.capped` `false` and `data` contains every matching row (verified statically: `take: PANEL_ORDENES_CAP` bounds `data`, `total` comes from the separate uncapped `count({ where })`, `capped = total > PANEL_ORDENES_CAP`)

**Verification method note:** per this run's scope, Phase 4 was completed via static code review against `specs/ordenes-trabajo-panel/spec.md`'s scenarios and a passing `npm run build` (see apply-progress.md) — no dev server / live HTTP requests were exercised in this environment. This should be re-confirmed live in `sdd-verify` or before merge if a dev server is available.

## Phase 5: Spec-Delta Readiness (documentation, no code change)

- [x] 5.1 Confirm `openspec/changes/panel-trabajo/specs/ordenes-trabajo-management/spec.md`'s `MODIFIED Requirements` delta correctly restates the "Update Order With Free Estado Transitions" requirement (no linear workflow, `cancelado` is a valid transition target, 404 on unmatched id) and is internally consistent with the live schema (`Estado` has included `cancelado` since migration `20260716124433_add_cancelado_estado`) — this delta file merges into the archived base spec at `sdd-archive` time; **do not hand-merge it into the base spec here**, only confirm the delta itself is accurate and complete
- [x] 5.2 Confirm `openspec/changes/panel-trabajo/specs/ordenes-trabajo-panel/spec.md` (new capability) and `openspec/changes/panel-trabajo/specs/app-navigation/spec.md` (nav delta) are both present and require no further edits before archive

## Phase 6: Frontend — API Client (`lib/ordenes-trabajo.ts`)

- [x] 6.1 Add `PanelStats` interface (`delDia`, `pendiente`, `enProceso`, `terminado`, `mecanicosTrabajando`, all `number`) and `PanelResponse` interface (`stats: PanelStats`, `data: OrdenTrabajoListItem[]`, `meta: { total: number; cap: number; capped: boolean }`) — duplicated from the server contract per the codebase's standing "no shared type package, change one, change the other" convention
- [x] 6.2 Add `GetPanelParams` interface (`estado?: 'all' | Estado`, `mecanicoId?: number`, `prioridad?: 'all' | Prioridad`, `fechaDesde?: string`, `fechaHasta?: string`, `hoy?: string`, all `yyyy-mm-dd` where applicable)
- [x] 6.3 Add `async getOrdenesTrabajoPanel(params: GetPanelParams): Promise<PanelResponse>` mirroring the existing `listOrdenesTrabajo` fetch pattern: build a `URLSearchParams` from the present params, `fetch` `${API_BASE_URL}/ordenes-trabajo/panel?${query}` with `getAuthHeader()`, pass through `handleJsonResponse(res, 'No se pudo obtener el panel de trabajo')`

## Phase 7: Frontend — Panel Components

- [x] 7.1 Create `client/app/(dashboard)/ordenes-trabajo/panel/PanelStats.tsx`: presentational component taking `{ stats: PanelStats }`, rendering five figure tiles (Del día, Pendientes, En proceso, Terminados, Mecánicos trabajando), reusing the list page's estado badge palette for the three estado figures (re-declared locally per the design's "no shared presentation module yet" tradeoff — do not edit the list page's imports)
- [x] 7.2 Create `client/app/(dashboard)/ordenes-trabajo/panel/PanelFilters.tsx`: presentational component rendering (a) a mecánico `<select>` populated from a `mecanicos` prop (plain `<select>`, not `SearchableSelect` — ADR-5), (b) an estado `<select>` (Todos/Pendiente/En proceso/Terminado/Cancelado), (c) a prioridad `<select>` (Todas/Normal/Alta/Urgente), (d) a date preset `<select>` (Hoy/Esta semana/Este mes/Personalizado) that reveals two `<input type="date">` (Desde/Hasta) only when `Personalizado` is selected
- [x] 7.3 Create `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx`: buckets a `data: OrdenTrabajoListItem[]` prop by `estado` client-side (`data.filter(o => o.estado === col)`) into exactly 4 **static** columns in fixed order `pendiente`, `en_proceso`, `terminado`, `cancelado`; preserves the query's `orderBy` within each column (no re-sorting); co-locate `KanbanColumn` (titled with `ESTADO_LABELS` + card count) and `KanbanCard` (numero, cliente.razonSocial, vehículo marca/modelo+patente, mecánico via `mecanicoLabel`, prioridad badge, `tiposServicio` chips, `fechaIngreso` via `formatFecha`) inside this same file — do not split into separate files yet (design's "not over-split for four static columns" call)
- [x] 7.4 In `KanbanBoard.tsx`, render **no drag handlers of any kind** on `KanbanCard` (D2, read-only board) — cards are plain non-draggable markup; do not add any drag-and-drop library to `client/package.json`
- [x] 7.5 In `KanbanBoard.tsx`, render the capped banner above the board when `meta.capped` is true: *"Mostrando las primeras {cap} de {total} órdenes. Ajustá los filtros para acotar."*

## Phase 8: Frontend — Container Page

- [x] 8.1 Create `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` (`'use client'`): state for `estado`, `mecanicoId`, `prioridad`, `datePreset` (`'hoy' | 'semana' | 'mes' | 'personalizado'`, default `'hoy'`), `customDesde`, `customHasta`, `mecanicos` (populated once on mount via `listUsers({ status: 'activo' })`, same as the list page), plus `result: PanelResponse | null`, `loading`, `error`
- [x] 8.2 Implement the date-preset resolver per design.md §3.4 (all computed from the browser-local calendar date, formatted `yyyy-mm-dd`): `hoy` → today/today; `semana` → Monday-of-current-week/today (ISO week, Monday start); `mes` → 1st-of-current-month/today; `personalizado` → the user's own `customDesde`/`customHasta` inputs
- [x] 8.3 Implement a `useEffect` keyed on all filter deps that resolves the active preset to `{ fechaDesde, fechaHasta }`, computes the browser-local `hoy` (independent of the active preset — always today's local date), and calls `getOrdenesTrabajoPanel({ estado, mecanicoId, prioridad, fechaDesde, fechaHasta, hoy })` — mirrors the list page's plain `useState`/`useEffect` re-fetch pattern (ADR-4, no React Query/SWR introduced); for `personalizado`, only fire the fetch once both `customDesde` and `customHasta` are set and `customDesde <= customHasta`
- [x] 8.4 Wire loading/error/empty states reusing the list page's spinner / red-banner-with-retry / empty-message markup; on success pass `result.stats` → `PanelStats`, `result.data` → `KanbanBoard`, `result.meta` → the capped-banner prop, in that order top-to-bottom (stats row, then filter bar, then board)

## Phase 9: Navigation

- [x] 9.1 Modify `client/app/lib/navigation.tsx`: add a new top-level **leaf** entry `{ name: 'Panel de Trabajo', href: '/ordenes-trabajo/panel', id: 'ordenes-trabajo-panel', icon: <img src="/icons/tipos-servicio.svg" .../> }` immediately after the existing `ordenes-trabajo` entry — sibling of "Órdenes de Trabajo", not nested under `Configuraciones`'s `children`; reuse the same placeholder wrench icon/comment convention as the "Órdenes de Trabajo" entry (no dedicated icon exists yet)

## Phase 10: Frontend & Full-Stack Manual Verification

Per `openspec/config.yaml` (no test runner configured, `test_command: ""`), verification is manual via the dev server plus a build check.

- [x] 10.1 Run `npm run build` (per `openspec/config.yaml`'s `verify.build_command`) and confirm it succeeds with no type errors across both the new backend DTO/service/controller additions and the new frontend files
- [x] 10.2 Verify the panel page renders all three stacked sections in order (stats row, filter bar, Kanban board) at `/ordenes-trabajo/panel`, and that `/ordenes-trabajo` (list page) is completely unaffected — same table/tarjetas view and behavior as before this change
- [x] 10.3 Verify stats⇄board consistency live: changing any single filter (mecánico/estado/prioridad/date preset) triggers exactly one re-fetch and updates both the stats row and the board from that same response — no stale section
- [x] 10.4 Verify estado-filter scoping live (D3): selecting a single estado in the filter bar zeroes the other estado figures/columns, and the board shows cards only in the matching column
- [x] 10.5 Verify each date preset live: `hoy`/`semana`/`mes` resolve without requiring manual date entry; `personalizado` reveals the two date inputs and only fetches once both are valid (`desde <= hasta`); confirm the UTC/timezone boundary behavior from backend task 4.7 is visible correctly in the browser (an edge-date order appears in the right window)
- [x] 10.6 Verify "mecánicos trabajando" live: matches the distinct-`en_proceso`-mechanic count shown by cross-checking the board's `en_proceso` column
- [x] 10.7 Verify the cap banner live: with a filtered set exceeding the cap (or a temporarily lowered cap), the "Mostrando las primeras N de M" banner renders and the board shows exactly `cap` cards
- [x] 10.8 Verify the board is read-only: attempting to drag a card does not change its estado or column; inspect `client/package.json` to confirm no new drag-and-drop dependency was added
- [x] 10.9 Verify the "Panel de Trabajo" nav entry appears as a top-level sibling of "Órdenes de Trabajo" (not nested under "Configuraciones"), is visible for any authenticated `rol`, and routes to `/ordenes-trabajo/panel`

**Verification method note:** as with Phase 4, no dev server was started in this environment. 10.1 was run for real (`npm run build` on both `server/` and `client/`, both green — the client build also confirms `/ordenes-trabajo/panel` compiles as a static route with no type errors). 10.2, 10.4, 10.8, and 10.9 were confirmed by static code review (page composition order in `page.tsx`; `buildPanelOrdenTrabajoWhere`'s shared `where` already verified in Phase 4; `KanbanCard` has no drag handlers and `client/package.json` gained no new dependency — diffed against `HEAD`; `Sidebar.tsx` renders `navigation` with no role filtering, confirmed by reading it). 10.3, 10.5, 10.6, and 10.7 could only be **partially** confirmed statically (single `useEffect` keyed on all filter deps calling one `getOrdenesTrabajoPanel`; `resolveDateWindow`'s preset math; the same `result.stats`/`result.data` object feeding both `PanelStats` and `KanbanBoard`) — the actual browser-rendered behavior, the live UTC-boundary edge case, and forcing `total > cap` were **not** exercised against a running dev server + seeded data. **Recommendation for `sdd-verify` or before merge:** re-run 10.3, 10.5 (edge-date case), 10.6, and 10.7 live if a dev server and seeded data are available — these are the highest-risk frontend correctness claims a static read cannot fully confirm.

## Phase 11: Documentation & Final Sign-off

- [x] 11.1 Walk `proposal.md`'s Success Criteria checklist end-to-end and confirm each item: new route + nav entry with list page unchanged, three stacked sections with 4-column Kanban, dedicated `GET /ordenes-trabajo/panel` endpoint (`JwtAuthGuard` only) accepting estado/mecanicoId/prioridad + `fechaIngreso` date range, stats⇄board consistency, `fechaIngreso`-based "del día"/date filter (never `createdAt`), `mecanicosTrabajando` distinct-count semantics, read-only board with no new DnD dependency, capped board with "showing first N" signal, the `cancelado` spec-text correction present in the delta, and the change's additive/reversible nature
- [x] 11.2 Confirm the Rollback Plan in `proposal.md` is accurate and executable as written: removing the `GET /ordenes-trabajo/panel` route/DTO/service method, removing `client/app/(dashboard)/ordenes-trabajo/panel/` and the nav entry, and optionally reverting the spec-text correction, all leave the existing list endpoint/page fully functional
