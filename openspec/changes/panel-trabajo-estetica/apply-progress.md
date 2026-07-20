# Apply Progress: `panel-trabajo-estetica`

## Scope of this run (PR 1 of 3 — chained, stacked-to-main)

Implements **Phase 1** (new shared files) and **Phase 2** (`KanbanBoard.tsx` responsive fork) of
`tasks.md` ONLY. This is the structural core of the change — the Kanban responsive fork — per the
tasks.md Review Workload Forecast's "Suggested Work Units" table (PR 1: Phase 1 + Phase 2, ~385-410
lines).

**Deviation from tasks.md's Phase 1 grouping (deliberate, scoped by explicit run instructions):**
Task 1.3 (`PanelStateBox.tsx`) is **NOT** implemented in this run, even though tasks.md groups it under
Phase 1. `PanelStateBox.tsx` has no consumer until Phase 4 (`page.tsx` wiring), which is PR 2 scope
(alongside `KanbanCardActions.tsx`). Creating it now would ship dead code in PR 1 with no import site.
It remains `[ ]` unchecked in `tasks.md` and will be picked up in the PR 2 apply batch together with
Phase 4. This does not affect Phase 1/2's own requirements — `KanbanColumn.tsx` and
`KanbanMobileTabs.tsx` do not depend on `PanelStateBox.tsx`.

Phases 3-9 are untouched: no `KanbanCardActions.tsx` styling changes, no `page.tsx`, no
`PanelStats.tsx`/`PanelFilters.tsx`/`MecanicosWorkload.tsx`, no manual verification/sign-off (those
depend on all phases being complete).

## Completed Tasks

- [x] 1.1 Created `client/app/(dashboard)/ordenes-trabajo/panel/KanbanColumn.tsx` per design §5.2 — moved
      `ESTADO_LABELS`, `PRIORIDAD_LABELS`, `PRIORIDAD_BADGE_CLASSES`, `COLUMNS`, `COLUMN_CLASSES`,
      `formatFecha`, `mecanicoLabel`, `KanbanCard`, `KanbanColumn` out of `KanbanBoard.tsx`, all exported,
      with the §1 dark-mode class pairs baked in. Imports `KanbanCardActions` from `./KanbanCardActions`
      unchanged.
- [x] 1.2 Verification checkpoint — extraction integrity confirmed (see Verification section below).
- [x] 1.4 Created `client/app/(dashboard)/ordenes-trabajo/panel/KanbanMobileTabs.tsx` per design §5.3 —
      `'use client'`, `useState<Estado>('pendiente')`, 2×2 tabs grid, imports
      `KanbanColumn`/`ESTADO_LABELS`/`COLUMN_CLASSES` from `./KanbanColumn`.
- [x] 2.1 Rewrote `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` per design §5.4 — removed
      the extracted maps/helpers/`KanbanCard`/`KanbanColumn`; imports `KanbanColumn`, `COLUMNS` from
      `./KanbanColumn` and default-imports `KanbanMobileTabs` from `./KanbanMobileTabs`.
- [x] 2.2 `columns` computed once via `COLUMNS.map(...)`, fed identically to both the desktop tree and
      `<KanbanMobileTabs columns={columns} onActionSuccess={onActionSuccess} />`.
- [x] 2.3 Capped banner rendered with `dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300`;
      condition (`meta.capped &&`) and content unchanged.
- [x] 2.4 Verification checkpoint — `min-w-0` / `lg:grid-cols-4` pairing confirmed (see Verification
      section below).
- [x] 2.5 Mobile tree rendered as `<div className="lg:hidden"><KanbanMobileTabs .../></div>`; both trees
      always in the DOM; no `window.matchMedia`/`useMediaQuery`/`window.innerWidth` anywhere in these
      files (grepped, zero matches).

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `client/app/(dashboard)/ordenes-trabajo/panel/KanbanColumn.tsx` | Created | Extracted `KanbanCard`, `KanbanColumn`, and all estado maps/helpers from `KanbanBoard.tsx`, exported, with dark-mode classes from design §1/§5.2. Column container: `min-w-[260px] flex-1` → `min-w-0` (the one deliberate structural delta, ADR-E). |
| `client/app/(dashboard)/ordenes-trabajo/panel/KanbanMobileTabs.tsx` | Created | Mobile tab switcher (`'use client'`), 2×2 tabs grid, `useState<Estado>('pendiente')`, renders one active `<KanbanColumn>`. |
| `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` | Rewritten | Two-tree responsive fork: `hidden gap-4 lg:grid lg:grid-cols-4` desktop tree + `lg:hidden` mobile tree wrapping `<KanbanMobileTabs>`, both fed from the same `columns` array computed once. |

No other files under `panel/` were touched (confirmed via `git status --porcelain`).

## Verification Performed

1. **`npm run build` in `client/`** — passed. `✓ Compiled successfully`, no new TypeScript errors, no new
   ESLint warnings attributable to the changed files. `/ordenes-trabajo/panel` compiles as a static route
   (7.01 kB, up from the pre-change size — expected, given the new split files).
2. **Type-source verification (hazard check)** — re-read the currently-committed
   `client/app/lib/ordenes-trabajo.ts` on this branch directly (not from memory/assumption) and confirmed
   `Estado`, `Prioridad`, and `OrdenTrabajoListItem` are genuinely exported there. Also re-read
   `KanbanCardActions.tsx`'s current committed signature (`{ orden, onActionSuccess }`, default export) —
   matches design's assumption exactly; this file was NOT modified.
3. **Extraction integrity (task 1.2)** — diffed the pre-change `KanbanCard`/`KanbanColumn` JSX (read from
   the prior `KanbanBoard.tsx`) against the new `KanbanColumn.tsx` line by line: identical field order
   (número/badge, cliente/vehículo/mecánico, tiposServicio chips, Ingreso line, `KanbanCardActions`
   mount), identical `formatFecha`/`mecanicoLabel` logic, identical prop shapes. The only deltas are (a)
   the added `dark:` class pairs per design §1, and (b) `min-w-[260px] flex-1` → `min-w-0` on the column
   container — both are the two explicitly sanctioned deltas, nothing else changed.
4. **`min-w-0`/`lg:grid-cols-4` pairing (task 2.4, ADR-E)** — confirmed both halves of the interdependent
   change landed together in this same run: `KanbanColumn.tsx`'s container is `min-w-0` (not
   `min-w-[260px] flex-1`) AND `KanbanBoard.tsx`'s desktop tree is `hidden gap-4 lg:grid lg:grid-cols-4`
   (not the old `flex ... overflow-x-auto`). Verified via `git diff --stat` that both changes are present
   in the working tree simultaneously — no partial state where one lands without the other.
5. **CSS-only layout selection (spec requirement)** — grepped
   `client/app/(dashboard)/ordenes-trabajo/panel/` for `matchMedia|useMediaQuery|innerWidth|innerHeight`:
   zero matches. Layout selection is exclusively `hidden lg:grid` / `lg:hidden`.
6. **Scope containment** — `git status --porcelain` shows only `KanbanBoard.tsx` (modified, tracked) and
   the two new files under `panel/`; no other panel component (`KanbanCardActions.tsx`, `page.tsx`,
   `PanelStats.tsx`, `PanelFilters.tsx`, `MecanicosWorkload.tsx`) appears in the diff.
7. **Not verified in this run (out of scope / needs a dev server + real browser):** live 375px tab-
   switching interaction, dark-mode toggle visual inspection, and the full Phase 8 manual verification
   matrix — those depend on Phases 3-7 also landing (per tasks.md's Phase 8 "Hard convergence point" note)
   and are `sdd-verify`/later-PR responsibility. A dev server was not started in this run; static/code
   review plus `npm run build` were used instead, as instructed.

## Deviations from Design

None — implementation matches design.md §5.2/§5.3/§5.4 exactly, including the exact class strings,
component structure, and the `min-w-0`/`lg:grid-cols-4` pairing from ADR-E. The one scope deviation
(deferring `PanelStateBox.tsx`, task 1.3, to the PR 2 batch) is a **task-grouping** deviation from
`tasks.md`'s Phase 1 boundary, not a deviation from `design.md` — see "Scope of this run" above for
rationale.

## Issues Found

None.

## Remaining Tasks

- [ ] 1.3 Create `PanelStateBox.tsx` (deferred to PR 2, alongside Phase 4's `page.tsx` wiring which is its
      only consumer)
- [ ] Phase 3 — `KanbanCardActions.tsx` button-wrap fix + dark mode
- [ ] Phase 4 — `page.tsx` wiring (`PanelStateBox` adoption)
- [ ] Phase 5 — `PanelStats.tsx` grid ladder + dark + icons
- [ ] Phase 6 — `PanelFilters.tsx` mobile stacking + dark
- [ ] Phase 7 — `MecanicosWorkload.tsx` grid tuning + dark
- [ ] Phase 8 — Manual verification (blocked until Phases 1-7 complete)
- [ ] Phase 9 — Sign-off (blocked until Phase 8 complete)

## Workload / PR Boundary

- Mode: chained PR slice, `stacked-to-main` chain strategy
- Current work unit: PR 1 of 3 — Kanban responsive core (Phase 1 minus task 1.3, + Phase 2)
- Boundary: starts from the pre-change single-column-flex `KanbanBoard.tsx`; ends with the working
  desktop-grid/mobile-tabs fork, verified via `npm run build`. PR 2 will branch off this branch's tip and
  add `KanbanCardActions.tsx` styling + `page.tsx` wiring (including the deferred `PanelStateBox.tsx`).
  PR 3 will add stats/filters/workload polish.
- Rollback: revert this commit; `page.tsx` still imports `KanbanBoard` with the same public props
  (`data`, `meta`, `onActionSuccess`), so no caller-side changes are needed to roll back.
- Estimated review budget impact: within the ~385-410 line estimate from tasks.md's Suggested Work Units
  table for PR 1 (actual: 3 files, KanbanBoard.tsx net -138 lines with substantial rewrite, two new files
  ~145 combined lines — well under the 400-line single-PR budget on its own).

## Git

- Branch: `feat/panel-estetica-kanban-core` (not switched, not pushed, no PR opened)
- Commit: see final report for hash — one commit for this work unit (all three files land together per
  ADR-E's interdependency requirement; splitting them further would leave an intermediate broken state).

## Status

7/7 assigned tasks complete (task 1.3 intentionally deferred to PR 2, not part of this run's assignment).
Ready for the PR 2 apply batch (Phase 1's task 1.3 + Phase 3 + Phase 4), or for `sdd-verify` scoped to
just PR 1's structural/build correctness if the orchestrator wants an early gate check before continuing.
