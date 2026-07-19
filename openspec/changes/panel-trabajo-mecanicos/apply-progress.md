# Apply Progress: Per-mechanic workload cards on `/ordenes-trabajo/panel`

**Mode**: Standard (no TDD — `strict_tdd: false`, `test_command: ""`)
**Status**: 26/26 tasks complete (Phase 1 through Phase 8). All `tasks.md` checkboxes marked `[x]`.

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` | Modified | Added `OPEN_ESTADOS` constant, `labelFor()` helper, and `async panelMecanicos()` method — `$transaction([user.findMany(activo pool), groupBy(open orders)])`, left-join zero-fill, `totalOrdenes` derived from the `groupBy` sum (no third `count()`), `Math.round` percentage with zero-denominator guard, sort by count desc / name asc tiebreak. Import line changed to add `Estado` alongside `Prisma`. |
| `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts` | Modified | Added `@Get('panel/mecanicos')` handler (no `@Query()`/DTO/`@Param()`/`@Body()`) between the existing `@Get('panel')` and `@Get(':id')` handlers. |
| `client/app/lib/ordenes-trabajo.ts` | Modified | Added `MecanicoWorkload`, `PanelMecanicosResponse` types and `getPanelMecanicos()` (no params), mirroring `getOrdenesTrabajoPanel`'s fetch/`handleJsonResponse` pattern. |
| `client/app/(dashboard)/ordenes-trabajo/panel/MecanicosWorkload.tsx` | Created | Presentational component — re-declared `mecanicoLabel()`, responsive grid of cards (name, count, `N% de la carga`), no re-sort, `PanelStats.tsx`'s exact card shell, no color-coding/bar. |
| `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` | Modified | Added independent `mecanicosWorkload`/`workloadLoading`/`workloadError` state, `loadWorkload()`, a **separate** `useEffect(() => { loadWorkload(); }, [])` with an explicitly empty deps array (with the design.md ADR-5 explanatory comment + `eslint-disable-next-line react-hooks/exhaustive-deps`), and the new section render below `<KanbanBoard>` with its own loading/error/empty states (distinct empty-pool message vs. normal 0/0% grid). |

Total diff: ~185 lines across the 4 modified/created source files (`git diff --stat`), in line with the tasks.md forecast (~190-230 lines, Low budget risk).

## Deviations from Design

One deviation, necessitated by a TypeScript/Prisma typing issue not visible in design.md's code blocks (written against the design's illustrative snippet, not compiled):

1. **`groupBy` requires an explicit `orderBy`.** In this project's Prisma client version (5.22.0), `ordenTrabajo.groupBy({ by, where, _count })` without an `orderBy` fails to compile (`Property 'orderBy' is missing`). Added `orderBy: { mecanicoId: 'asc' }` to the `groupBy` call — this only affects the *initial* read order of the raw groups, which is immediately discarded; the final response order is still fully determined by the explicit `.sort((a, b) => b.count - a.count || labelFor(a).localeCompare(labelFor(b), 'es'))` step per design.md §1.4/§1.6. No behavioral change, no spec impact. Matches the sibling `panel()` method's own `groupBy` call, which already carries an `orderBy: { mecanicoId: 'asc' }` for the same reason.
2. **`groupBy` call extracted to a local `const groupByOpenOrders` before the `$transaction([...])` array literal.** Inlining the `groupBy(...)` call directly inside the transaction's array literal caused TypeScript to widen `_count`'s inferred type to `true | {...}` (losing the `{ _all: number }` shape), producing `g._count._all` errors (`'g._count' is possibly 'undefined'`). Extracting the call to a typed local variable first, then referencing that variable inside the array, resolves the same query with the correct, narrower inferred type. Purely a TypeScript inference workaround — the query issued, its `where`/`_count` shape, and the `$transaction` batching semantics are unchanged from design.md.

No other deviations. Response shape, aggregation logic, sort, zero-fill, zero-denominator guard, route placement, controller signature, frontend types, component structure, and page wiring all match design.md verbatim.

## Verification Performed

No test runner is configured in this project (per `openspec/config.yaml`: `strict_tdd: false`, `test_command: ""`). Verification was performed via:

1. **`npm run build` in `server/`** — passes cleanly (`nest build`, no errors) after the two typing fixes above.
2. **`npm run build` in `client/`** — passes cleanly (Next.js production build, type-check, and lint). `/ordenes-trabajo/panel` compiles to 4.88 kB (up from its prior smaller size, consistent with the added component). No new warnings introduced by this change; the pre-existing `react-hooks/exhaustive-deps` warnings on unrelated pages (`clientes`, `colores`, etc.) are unchanged and predate this change.
3. **Static code review against every spec scenario** (`specs/ordenes-trabajo-panel/spec.md`) and every `tasks.md` Phase 3/7 verification task, reasoned through against the actual committed code (not just asserted to match design):
   - **Auth/route reachability (3.1)**: handler sits under the controller's class-level `@UseGuards(JwtAuthGuard)`, no per-route guard added — any authenticated `rol` succeeds identically; missing/invalid token is rejected by the guard before the handler runs (unchanged Nest behavior).
   - **Filter params ignored (3.2)**: handler signature is `async panelMecanicos()` — no `@Query()` parameter exists to receive them, so they are structurally inert by construction.
   - **All active mechanics incl. zero-load (3.3)**: the mechanic list starts from `user.findMany({ where: { activo: true }, ... })` (the pool), and every pool member is mapped to an output entry via `.map()` — a mechanic absent from `countByMecanico` (no open orders, or only `terminado`/`cancelado` orders, which never enter `OPEN_ESTADOS`) gets `count: 0, percentage: 0` via `?? 0`. A `User` with `activo: false` never enters the pool query, so it never produces an entry, regardless of any orders assigned to it.
   - **Count semantics (3.4)**: `groupBy`'s `where: { activo: true, estado: { in: ['pendiente','en_proceso'] } }` — the order's `activo` (soft-delete) flag and the `estado` whitelist together exclude `terminado`/`cancelado` orders and soft-deleted orders from both the per-mechanic count and `totalOrdenes` (since `totalOrdenes` sums the same `groups` array).
   - **Zero-denominator (3.5)**: when no orders match `OPEN_ESTADOS`, `groups` is `[]`, so `countByMecanico` is empty and `totalOrdenes` is `0`; the ternary `totalOrdenes === 0 ? 0 : Math.round(...)` guarantees every entry's `percentage` is exactly `0`, never `NaN`. The pool is still mapped in full, so the section is not hidden — only the counts read zero. Response returns Nest's default `200`.
   - **Deactivated-mechanic case (3.6) — traced in detail, not just asserted**: given a mechanic deactivated after being assigned 2 still-`pendiente` orders, plus 8 other open orders across active mechanics: `groups` (from the `groupBy`, which has no `User.activo` filter at all) contains an entry for that mechanic's `mecanicoId` with `_count._all: 2`, plus entries summing to `8` for the active mechanics. `totalOrdenes = groups.reduce(...)` sums **all** group entries → `10`, correctly including the deactivated mechanic's 2 orders. However, the **output mapping** (`mecanicos.map(...)`) iterates only over the `mecanicos` array — the pool from `user.findMany({ where: { activo: true } })`, which excludes the deactivated user entirely. So that mechanic's `count: 2` is computed into `countByMecanico` but never surfaces in the returned `mecanicosOut` array. Sum of the *returned* entries' `count` values is therefore `8` (only the active mechanics' shares), strictly less than `meta.totalOrdenes: 10`. This exactly matches the spec's "Orders assigned to a deactivated mechanic still count toward the shop-wide total" scenario and design.md §1.4's "Design note" — confirmed by tracing the actual committed code path, not by assumption, and required no code change (as tasks.md 8.2 anticipated).
   - **Sort + tiebreak (3.7)**: `.sort((a, b) => b.count - a.count || labelFor(a).localeCompare(labelFor(b), 'es'))` — counts `5, 2, 8` sort to `8, 5, 2` (descending numeric compare); equal counts fall through to `localeCompare` on the resolved label with locale `'es'`, so "Ana Perez" (A) sorts before "Bruno Diaz" (B).
   - **Response shape (3.8)**: return statement is `{ mecanicos: mecanicosOut, meta: { totalOrdenes } }`; each `mecanicosOut` entry carries `mecanicoId, nombre, apellido, username, count, percentage` exactly per design.md §1.3, with raw name parts (no pre-joined string).
   - **No regression (3.9, 7.5)**: `git diff` confirms `panel()`, `buildPanelOrdenTrabajoWhere`, `PANEL_ORDENES_CAP`, `findAll`, `findOne`, and every other existing method/route in both the service and controller are byte-identical before/after (the only line changed outside pure additions is the `import` line adding `Estado` alongside the existing `Prisma` import). `KanbanBoard.tsx`, `PanelStats.tsx`, and `PanelFilters.tsx` were not touched at all (confirmed via `git status`).
   - **Frontend rendering (7.2)**: `page.tsx`'s JSX places the new conditional block (loading/error/non-empty/empty) immediately after the `<KanbanBoard>` `)}` close, inside the same top-level `<div>` — traced by reading the final file, matching design.md §2.3's snippet exactly.
   - **Filter-independence (7.3)**: the new `useEffect(() => { loadWorkload(); }, [])` has a literal empty array — no `estado`/`mecanicoId`/`prioridad`/`datePreset`/`customDesde`/`customHasta` reference anywhere in its body or deps, so React's effect-dependency semantics guarantee it never re-runs on a state update to those filter variables (only the pre-existing `loadPanel` effect is keyed on them). This was verified by static/code-path reasoning, not a live DevTools/Network-tab session — no dev server was started in this environment (see "Not Verified" below).
   - **Empty-pool vs. zero-load distinction (7.4)**: the render ladder is `workloadLoading → workloadError → (mecanicosWorkload && mecanicosWorkload.length > 0) → else (empty message)`. When the pool has active mechanics but zero open orders, `getPanelMecanicos()` still resolves a non-empty array (one 0/0% entry per active mechanic per D2), so `mecanicosWorkload.length > 0` is true and `<MecanicosWorkload>` renders the normal grid — the "No hay mecánicos activos para mostrar." branch is reachable only when the pool itself is empty (`mecanicosWorkload` is `[]` or `null`).
4. **Working-tree hygiene check** (the sibling-change hazard called out in the task): before finishing, re-read `client/app/lib/ordenes-trabajo.ts` after edits and confirmed every field referenced by the new frontend code (`MecanicoWorkload`'s `mecanicoId`/`nombre`/`apellido`/`username`/`count`/`percentage`, `PanelMecanicosResponse`'s `mecanicos`/`meta.totalOrdenes`) is defined in that same file, on this branch, not borrowed from any other in-progress change. `git status` was checked before and after implementation — only the 5 expected files (plus the pre-existing, unrelated `client/tsconfig.tsbuildinfo` and the untracked `openspec/changes/panel-trabajo-mecanicos/` directory) appear; no stray files from another change leaked into the working tree.

### Not Verified (explicit)

- **No live dev server / browser session was used.** All Phase 3 and Phase 7 "manual verification" items were satisfied via static code tracing against the compiled, build-passing source plus the `npm run build` type-check (which exercises the full type surface end-to-end, including the response/request contracts between `service.ts` → `controller.ts` → `lib/ordenes-trabajo.ts` → `page.tsx` → `MecanicosWorkload.tsx`), not via an actual HTTP request/response or DOM inspection. Per the task instructions, a live check was optional ("a bonus but not required") given no test runner is configured; static review + build was treated as sufficient and is documented as such here rather than silently implied to be a live check.
- **No database was queried directly** to construct the exact fixture states described in the spec scenarios (e.g., an actual deactivated mechanic with 2 open orders in the DB). The Phase 3.6 reasoning above traces the code path against those exact input shapes analytically rather than by seeding and querying real rows.

## Success Criteria / Rollback Sign-off (Phase 8)

Walked `proposal.md`'s Success Criteria checklist against the implemented code — every item holds:
- Section renders below the board, one card per active mechanic — confirmed in `page.tsx`/`MecanicosWorkload.tsx`.
- Name/count/percentage per the fixed formulas — confirmed in both `labelFor` (server) and `mecanicoLabel` (client), identical formula.
- Idle mechanics included via the `activo: true` pool, no `rol` filter — confirmed, `user.findMany` has no `rol` clause.
- Sort by count desc / name asc tiebreak — confirmed in the `.sort(...)` call.
- Filter-independence — confirmed structurally (empty deps array, no DTO/`@Query()` on the route).
- Zero-denominator yields `0`/`0%` — confirmed via the ternary guard.
- Dedicated endpoint, `JwtAuthGuard` only, no filter params, one `$transaction` — confirmed in both controller and service.
- Existing board/stats/filter bar/list page unchanged — confirmed via `git diff` (zero unrelated changes).
- No drill-down, no `rol` filter added — confirmed, not implemented.
- Additive, no migration, reversible — confirmed: no `prisma/schema.prisma` or migration changes; every added file/symbol (`panelMecanicos()`, `@Get('panel/mecanicos')`, `MecanicosWorkload.tsx`, `getPanelMecanicos()`, its types, the new state/effect/render block in `page.tsx`) can be mechanically removed per the Rollback Plan in `proposal.md` without touching any pre-existing symbol.

The design's Open Questions resolution (deactivated-mechanic case, §1.4/ADR-3) was confirmed to require no code change — traced explicitly above (Phase 3.6).

## Remaining Tasks

None — all 26 tasks across Phase 1-8 are complete.

## Workload / PR Boundary

- Mode: single PR (tasks.md forecast: ~190-230 lines, Low 400-line budget risk, no chaining recommended)
- Current work unit: N/A (single combined unit — both Unit 1/backend and Unit 2/frontend delivered together, per tasks.md's "Given the small total size, both units are delivered in a single PR")
- Boundary: this apply batch implements and commits the entire change (Phase 1-8) in two work-unit commits — one backend, one frontend — on `feat/panel-trabajo-mecanicos`. Not pushed; no PR opened (per instructions).
- Estimated review budget impact: ~185 lines of source diff (4 files) + 1 new ~28-line file ≈ within the Low-risk forecast; single reviewable PR.

## Status

26/26 tasks complete. Ready for verify.
