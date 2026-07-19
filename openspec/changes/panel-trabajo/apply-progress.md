# Apply Progress: Panel de Trabajo (work board) for Órdenes de Trabajo

## Overall status

Both PRs in the stacked-to-main chain are now applied: PR 1 (backend endpoint, tasks.md Phase
1–4) and PR 2 (frontend + nav + sign-off, tasks.md Phase 5–11). All 33 task checkboxes in
`tasks.md` are `[x]`. See "PR 2" section below for this run; the original PR 1 section is kept
intact beneath it.

Mode: Standard (no test runner configured; `strict_tdd: false`, `test_command: ""` per
`openspec/config.yaml`). No automated tests were written or run in either PR; verification was
static code review plus `npm run build`.

---

## PR 2 of 2 — Frontend (this run)

### Scope of this run

This run implements **PR 2 of 2** (stacked-to-main chain) — tasks.md **Phase 5 (spec-delta
readiness), Phase 6 (frontend API client), Phase 7 (Panel components), Phase 8 (container page),
Phase 9 (navigation), Phase 10 (frontend & full-stack manual verification), and Phase 11
(documentation & final sign-off)**. Depended on PR 1's `GET /ordenes-trabajo/panel` endpoint,
already committed at `1d233b6` on this branch's history.

### Phase 5 — Spec-delta readiness (no code change)

Both delta files confirmed accurate, no edits needed:
- `specs/ordenes-trabajo-management/spec.md`: the "Update Order With Free Estado Transitions"
  delta correctly restates free estado transitions including `cancelado`, and 404 on unmatched
  id. Verified against the live schema — `enum Estado { pendiente en_proceso terminado
  cancelado }` in `server/prisma/schema.prisma` confirms `cancelado` exists, matching the delta's
  claim it has existed "since migration `20260716124433_add_cancelado_estado`".
- `specs/ordenes-trabajo-panel/spec.md` and `specs/app-navigation/spec.md`: both present, both
  internally consistent with the actually-implemented backend contract and the frontend built in
  this run — no edits required before archive.

### Files created

- `client/app/(dashboard)/ordenes-trabajo/panel/PanelStats.tsx` — presentational, five figure
  tiles (Del día, Pendientes, En proceso, Terminados, Mecánicos trabajando); re-declares a local
  `ESTADO_BADGE_CLASSES` map per design.md §2.3 (list page's imports intentionally untouched, D7).
- `client/app/(dashboard)/ordenes-trabajo/panel/PanelFilters.tsx` — presentational, mecánico
  (plain `<select>`, ADR-5)/estado/prioridad selects + a date-preset `<select>`
  (hoy/semana/mes/personalizado) that reveals two `<input type="date">` only when `personalizado`
  is selected. Re-declares a local `mecanicoLabel` helper (same D7 tradeoff).
- `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` — buckets `data` into 4 static
  columns (`pendiente`/`en_proceso`/`terminado`/`cancelado`) in fixed order; co-locates
  `KanbanColumn` and `KanbanCard` in the same file per design's "not over-split" call; renders the
  capped banner ("Mostrando las primeras {cap} de {total} órdenes...") when `meta.capped`; cards
  have **no drag handlers of any kind** (D2).
- `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` — `'use client'` container: filter
  state (`estado`, `mecanicoId`, `prioridad`, `datePreset`, `customDesde`, `customHasta`,
  `mecanicos`, `result`, `loading`, `error`); `resolveDateWindow()` implements design.md §3.4's
  period-to-date preset resolution (hoy → today/today; semana → Monday-of-week/today, Monday
  start; mes → 1st-of-month/today; personalizado → the user's own inputs, only resolved once
  `customDesde <= customHasta`); a single `useEffect` keyed on all filter deps calls
  `getOrdenesTrabajoPanel` once per change and feeds both `PanelStats` and `KanbanBoard` from the
  same response object; loading/error/empty states mirror the list page's spinner /
  red-banner-with-retry / empty-message markup.

### Files modified (additive only)

- `client/app/lib/ordenes-trabajo.ts`: added `PanelStats`, `PanelResponse`, `GetPanelParams`
  interfaces and `getOrdenesTrabajoPanel(params)`, appended at the end of the file, mirroring
  `listOrdenesTrabajo`'s `URLSearchParams` + `handleJsonResponse` fetch pattern exactly. Field
  names/shape were cross-checked directly against the **actual committed backend code** (not just
  design.md) — `ordenes-trabajo.service.ts`'s `panel()` return shape
  (`{ stats: { delDia, pendiente, enProceso, terminado, mecanicosTrabajando }, data, meta: {
  total, cap, capped } }`) and the controller's `@Get('panel')` handler's query param names
  (`estado`, `mecanicoId`, `prioridad`, `fechaDesde`, `fechaHasta`, `hoy`) — both matched
  design.md verbatim, no drift found from the backend PR.
- `client/app/lib/navigation.tsx`: added the "Panel de Trabajo" leaf entry immediately after
  "Órdenes de Trabajo" — top-level sibling, not nested under `Configuraciones`'s `children`, same
  placeholder-wrench-icon convention/comment as its neighbor.

**No other files were touched.** `client/app/(dashboard)/ordenes-trabajo/page.tsx` (the existing
list page) was read for pattern reference only, never edited — confirmed via `git diff` on the
commit: exactly 6 files changed, all additive, all within the frontend scope of this PR (see "Git
history for this work unit" below).

### Deviation from design.md / tasks.md

None functionally. One documentation-only note: `PanelFilters.tsx`'s "Fecha" `<select>` intentionally
prevents fetching while `personalizado` is selected but the range is incomplete/invalid — this is
literally what tasks.md 8.3 specifies ("only fire the fetch once both `customDesde` and
`customHasta` are set and `customDesde <= customHasta`"), implemented via `resolveDateWindow()`
returning `null` in that case and `loadPanel()` short-circuiting without touching
`loading`/`error`/`result` state, so the board simply keeps showing its last valid result while
the user finishes picking a custom range.

### Verification performed (Phase 10)

1. **`npm run build`** — run for real in both packages, both green:
   - `server/`: `nest build` succeeds (re-confirms PR 1's backend still compiles cleanly).
   - `client/`: `next build` succeeds — `/ordenes-trabajo/panel` compiles as a static route (`○
     /ordenes-trabajo/panel  4.5 kB  91.8 kB` in the build output) with zero type errors, zero new
     lint errors (only pre-existing warnings on unrelated files/the same `<img>` pattern already
     used elsewhere in `navigation.tsx`).
2. **Static code review** against every scenario in `specs/ordenes-trabajo-panel/spec.md` and
   `specs/app-navigation/spec.md`, and every Phase 10 checklist item — see the inline
   "Verification method note" now recorded in `tasks.md` under Phase 10 for the full per-item
   breakdown. Summary: 10.1 was run for real; 10.2/10.4/10.8/10.9 were fully confirmed by static
   review (page composition order, shared `where` from Phase 4, no drag handlers +
   `client/package.json` diffed clean against `HEAD`, `Sidebar.tsx` has no role filtering);
   10.3/10.5/10.6/10.7 were only **partially** confirmable statically (the single-`useEffect`
   re-fetch wiring and preset math were read and reasoned through, but the live UTC-boundary edge
   case and forcing `total > cap` were not exercised against a running dev server + seeded data).
3. **No dev server was started** in this environment (consistent with PR 1's approach; not
   required by this run's instructions, and infrastructure spin-up — DB connection, seed data —
   was out of scope for this apply pass). **Recommendation for `sdd-verify` or before merge:**
   re-run 10.3, 10.5 (the edge-date case), 10.6, and 10.7 live if a dev server and seeded data are
   available, since those are the highest-risk frontend correctness claims a static read cannot
   fully confirm.

### Phase 11 — Final sign-off walkthrough

Walked `proposal.md`'s Success Criteria end-to-end against what was actually built:
- ✅ New `/ordenes-trabajo/panel` route + new top-level "Panel de Trabajo" nav entry; existing
  `/ordenes-trabajo` list page's own commit history shows zero touches from this change.
- ✅ Three stacked sections in order (stats row → filter bar → Kanban board) — confirmed by
  `page.tsx`'s JSX order; 4-column board (`pendiente`/`en_proceso`/`terminado`/`cancelado`) in
  fixed order via `KanbanBoard.tsx`'s static `COLUMNS` array.
- ✅ Dedicated `GET /ordenes-trabajo/panel` endpoint, `JwtAuthGuard`-only, accepting
  estado/mecanicoId/prioridad + a `fechaIngreso` date range — verified against the actual
  committed backend code in this run (not just design.md), see "Files modified" above.
- ✅ Stats row and board share one response object (`result.stats` → `PanelStats`, `result.data` →
  `KanbanBoard`) from one `getOrdenesTrabajoPanel` call per filter change — cannot disagree by
  construction on the frontend, and the backend's shared `where` was already verified in Phase 4.
- ✅ "Del día" and the date filter both resolve against `fechaIngreso` — the frontend only ever
  sends `fechaDesde`/`fechaHasta`/`hoy` (all resolved from `fechaIngreso`-window semantics per
  design.md §3.4); `createdAt` is never referenced anywhere in the new frontend code.
- ✅ "Mecánicos trabajando" renders `stats.mecanicosTrabajando` verbatim as a bare number tile — no
  list-of-names rendering exists in `PanelStats.tsx`.
- ✅ Board is read-only: `KanbanCard` has no `draggable`, `onDragStart`, or any drag-related prop;
  `client/package.json`'s `dependencies` are unchanged from `HEAD` (still just
  `next`/`react`/`react-dom`/`sweetalert2`/`sweetalert2-react-content`) — no DnD library added.
- ✅ Board renders the full filtered set bounded by the backend's cap, with the "Mostrando las
  primeras {cap} de {total} órdenes..." banner rendered conditionally on `meta.capped`.
- ✅ `specs/ordenes-trabajo-management/spec.md`'s delta no longer asserts "no `cancelado` state
  exists" (confirmed accurate in Phase 5 above) — note this delta merges into the base spec at
  `sdd-archive` time, not in this apply run.
- ✅ Change is additive: no schema/migration touched by either PR; this run's commit is 6 files, 560
  insertions, 0 deletions, no file modified outside the Panel's own scope.

Rollback Plan (`proposal.md`) re-confirmed executable as written: reverting PR 2's commit removes
`client/app/(dashboard)/ordenes-trabajo/panel/` in full and cleanly un-adds the
`navigation.tsx`/`ordenes-trabajo.ts` hunks (both are pure additions, so a revert is a clean
subtraction); the existing list page and list endpoint are never referenced by anything this PR
added, so they keep working untouched either way.

### Git history for this work unit (PR 2)

Repo was on `feat/panel-trabajo-frontend` (already stacked on `feat/panel-trabajo-backend`'s
`1d233b6`), with the same pre-existing **unrelated uncommitted `vehiculos-patente` changes** still
in the working tree, this time also touching `client/app/lib/ordenes-trabajo.ts` (adding a
`patente: string | null` field to `OrdenTrabajoListItem['vehiculo']`). Same isolation approach as
PR 1:
1. `git stash push -- client/app/lib/ordenes-trabajo.ts` — reset that one file to clean `HEAD`
   before editing.
2. Made all Phase 6 edits (the Panel API client additions) on the clean base, plus created the
   four new `panel/` files and edited `navigation.tsx` (already clean, no stash needed there).
3. Staged and committed only the 6 intended files (`git add` by explicit path, not `-A`).
4. `git stash pop` — restored the unrelated `vehiculos-patente` `patente`-field diff on top;
   git auto-merged cleanly (my addition was appended at the end of the file, the patente diff
   touches only the `OrdenTrabajoListItem` interface near the top — no overlap).
5. Re-ran `npm run build --workspace=client` **after** the stash pop (the first attempt, before
   popping, correctly failed — other already-uncommitted `vehiculos-patente` files reference
   `orden.vehiculo.patente`, which only exists once the patente diff is back) — confirms the full
   working tree (this PR's commit + the still-uncommitted unrelated work) type-checks together.

Result: the new commit contains **only** the 6 panel-trabajo frontend files (`git diff --stat` on
the commit: `6 files changed, 560 insertions(+)`, no deletions). Every other file that was
modified/untracked before this run (`vehiculos-patente` changes including
`client/app/lib/ordenes-trabajo.ts`'s `patente` field, `tsconfig.tsbuildinfo`,
`client/app/components/ui/Modal.tsx`, etc.) remains exactly as it was, still uncommitted, untouched
by this apply run's commit.

**Not pushed, no PR opened** — per this run's explicit instructions, only a local commit was made
on `feat/panel-trabajo-frontend`. Push/PR is left to the orchestrator on the user's instruction.

### Next steps (not in this run)

- `sdd-verify`: re-confirm the flagged live-only checks (10.3, 10.5's edge-date case, 10.6, 10.7,
  and PR 1's own flagged 4.4/4.7/4.8/4.11) against a running dev server + seeded data if available.
- `sdd-archive`: merge the three spec deltas into their base specs; decide whether/how to land the
  two stacked PRs (`feat/panel-trabajo-backend` → `feat/panel-trabajo-frontend` → `main`) — push
  and PR creation were explicitly out of scope for both apply runs.

---

## PR 1 of 2 — Backend (original run, unchanged below)

### Scope of this run

This run implements **PR 1 of 2** (stacked-to-main chain) — the backend endpoint only:
tasks.md **Phase 1 (Query DTO), Phase 2 (Service), Phase 3 (Controller route), and Phase 4
(Backend Manual Verification)**. Phase 5 onward (spec-delta readiness confirmation, the entire
frontend — API client, components, container page, navigation — and full-stack manual
verification) is **NOT part of this run** and remains for the next work unit (PR 2), which
depends on this PR's endpoint being live.

Mode: Standard (no test runner configured; `strict_tdd: false`, `test_command: ""` per
`openspec/config.yaml`). No automated tests were written or run; verification was static code
review plus `npm run build`.

## Files created

- `server/src/ordenes-trabajo/dto/panel-ordenes-trabajo-query.dto.ts` — new `PanelOrdenesTrabajoQueryDto`
  (estado/mecanicoId/prioridad/fechaDesde/fechaHasta/hoy), mirrors `list-ordenes-trabajo-query.dto.ts`'s
  conventions exactly (same `EstadoFilter`/`PrioridadFilter` reuse, same decorator style).

## Files modified (additive only)

- `server/src/ordenes-trabajo/ordenes-trabajo.service.ts`:
  - Added import of `PanelOrdenesTrabajoQueryDto`.
  - Added module-level `PANEL_ORDENES_CAP = 500` constant with rationale comment.
  - Added module-level `dateRange(desde, hasta)` UTC half-open interval helper.
  - Added module-level `buildPanelOrdenTrabajoWhere(query)` — Panel-local where builder (ADR-1:
    NOT a reuse of `buildOrdenTrabajoWhere`).
  - Added module-level `PanelStats` type (five stats figures).
  - Added `async panel(query: PanelOrdenesTrabajoQueryDto)` method: cross-field date validation,
    the 7-operation `$transaction` (findMany capped + total count + delDia count + 3 per-estado
    AND-composed counts + mecánico `groupBy`), and the mapped `{ stats, data, meta }` response.
  - **No existing code was touched**: `buildOrdenTrabajoWhere`, `findAll`, `findOne`, `create`,
    `update`, `iniciar`, and every other existing method/behavior are byte-for-byte unchanged
    relative to `HEAD` (confirmed via `git diff` — every changed hunk is a pure addition).
- `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`:
  - Added import of `PanelOrdenesTrabajoQueryDto`.
  - Added `@Get('panel')` handler, declared immediately after `@Get()` (`findAll`) and immediately
    before `@Get(':id')` (`findOne`) — confirmed by re-reading the file post-edit. This ordering
    is safety-critical per design.md §1.1 / tasks.md 3.1 and is the exact placement specified.
  - No other route or behavior changed.

## Deviation from design.md / tasks.md

1. **`groupBy` requires an explicit `orderBy`.** design.md §1.6's example `groupBy({ by:
   ['mecanicoId'], where: {...} })` does not compile against this project's generated Prisma
   client (5.22.0) — TypeScript raises `TS2345: Property 'orderBy' is missing`. Added
   `orderBy: { mecanicoId: 'asc' }` to satisfy the type. This has **no effect on the
   distinct-count semantics** (`mecanicos.length` is still a plain distinct-mecánico count) — it
   only orders the intermediate `groupBy` rows, which are never surfaced to the client.
2. **No `PanelResponse` type alias with a `data: OrdenTrabajoListItem[]` field.** design.md §1.3 and
   tasks.md 2.4 specify a `PanelResponse` interface, offering "(or inline object literal matching
   design.md §1.3)" as an explicit alternative. The backend has no existing `OrdenTrabajoListItem`
   type (that name is a frontend-only type per design.md §2.1) — `findAll()` itself never declares
   an explicit return-type interface, letting `data.map(mapOrdenTrabajo)`'s shape infer
   structurally. `panel()` follows that same established codebase convention: no explicit
   `Promise<...>` return annotation, `data: rows.map(mapOrdenTrabajo)` inferred like `findAll`. A
   `PanelStats` type alias was kept for the `stats` sub-shape (matches design.md §1.3's stats
   block verbatim: `delDia`, `pendiente`, `enProceso`, `terminado`, `mecanicosTrabajando`). This is
   a stricter reading of the "or inline object literal" alternative already permitted by the task,
   not a scope deviation.

No other deviations. Route ordering, `dateRange()`'s UTC-only construction, the AND-composition
(not spread) on per-estado sub-counts, the `activo: true` invariant, the cap constant and signal,
and the cross-field date validation all match design.md exactly.

## Verification performed (Phase 4)

No dev server was started and no live HTTP requests were made in this environment (per this run's
instructions, static review is an acceptable substitute and infrastructure spin-up was not
required). Verification was:

1. **`npm run build`** (in `server/`) — passes cleanly with zero type errors after the fix noted
   in deviation #1 above. This exercises the full TS compilation of the new DTO, service
   additions, and controller route together with all existing code.
2. **Static code review** against every scenario in
   `openspec/changes/panel-trabajo/specs/ordenes-trabajo-panel/spec.md` and every checklist item
   in tasks.md Phase 4 (4.1–4.11) — see the per-item notes now recorded inline in `tasks.md`
   under Phase 4. Summary of what was confirmed by reading the code (not by executing it):
   - Route ordering: `panel` declared before `:id` in the controller (re-read post-edit).
   - Auth: no route-level guard override; relies solely on the controller's class-level
     `JwtAuthGuard`, identical to every other route.
   - Filter/stat consistency: `data`, `total`, `delDia`, the three per-estado counts, and the
     `groupBy` all consume the exact same `where` object (or an `AND`-extension of it) —
     confirmed by reading the `$transaction` array line by line.
   - Cross-field date validation: both-or-neither and `fechaDesde > fechaHasta` guards are the
     first statements in `panel()`, throwing `BadRequestException` before any query runs.
   - `fechaIngreso` vs `createdAt`: `createdAt` is never referenced anywhere in `panel()`,
     `dateRange()`, or `buildPanelOrdenTrabajoWhere()`.
   - UTC boundary construction: `dateRange()` uses only `T00:00:00.000Z` string construction and
     `setUTCDate` — no `setDate`/`getDate`/local-time APIs anywhere in the new code.
   - `mecanicosTrabajando`: `groupBy(['mecanicoId'])` `.length` is a distinct count by
     construction; `activo: true` and any user estado filter are baked into the same `where` AND'd
     into the `groupBy`'s `where`, so a pendiente filter or a deactivated order cannot inflate it.
   - Zero-match / zero-order-count paths: no existence check throws on an unmatched `mecanicoId`;
     empty `findMany`/`count`/`groupBy` results flow straight through to a `200` with zeroed
     figures — no code path returns an error for "no matches".
   - Cap signal: `take: PANEL_ORDENES_CAP` bounds `data`; `total` comes from a separate,
     uncapped `count({ where })`; `capped = total > PANEL_ORDENES_CAP` is computed independently
     of `data.length`.

This static-review-plus-build approach is a substitute for, not a replacement of, live
verification. **Recommendation for `sdd-verify` or before merge:** if a dev server and seeded
data are available, re-run at least 4.4 (400 on bad date range), 4.7 (UTC boundary edge case),
4.8 (distinct mecánico count), and 4.11 (cap signal) live, since those are the highest-risk
correctness claims that a compiler cannot confirm.

## Git history for this work unit

Repo was `main`, with pre-existing **unrelated uncommitted changes** already in the working tree
(a `vehiculos-patente` change touching, among other files,
`server/src/ordenes-trabajo/ordenes-trabajo.service.ts` itself — it added a `patente` field to the
vehículo select and reworded a couple of comments). To avoid mixing that unrelated work into this
PR's commit:

1. `git stash push -- server/src/ordenes-trabajo/ordenes-trabajo.service.ts` — set that one file
   back to its clean `HEAD` state before editing, isolating the panel-trabajo additions.
2. Made all edits described above on the clean base.
3. Committed only the panel-trabajo files (see below).
4. `git stash pop` — restored the unrelated `vehiculos-patente` working-tree changes on top of the
   new commit, unchanged and un-touched by this run.

Result: the new commit(s) contain **only** the three panel-trabajo backend files; every other
file that was modified/untracked before this run (`vehiculos-patente` changes, `tsconfig.tsbuildinfo`,
etc.) remains exactly as it was, still uncommitted, untouched by this apply run.

## Next steps (not in this run)

- tasks.md Phase 5: confirm spec-delta readiness (no code change).
- tasks.md Phase 6–9: frontend API client, `PanelStats`/`PanelFilters`/`KanbanBoard` components,
  container page, navigation entry — PR 2, depends on this PR's `GET /ordenes-trabajo/panel`
  endpoint being live.
- tasks.md Phase 10–11: full-stack manual verification and final sign-off, after PR 2 lands.
