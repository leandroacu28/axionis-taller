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

---

## Scope of this run (PR 2 of 3 — chained, stacked-to-main)

Branch: `feat/panel-estetica-actions-wiring`, created off `feat/panel-estetica-kanban-core` (which already
contains commit `442b4ee` — PR 1, independently reviewed and PASSED). Implements the deferred task 1.3
(`PanelStateBox.tsx`), Phase 3 (`KanbanCardActions.tsx` button-wrap fix + dark mode), and Phase 4
(`page.tsx` wiring — `PanelStateBox` adoption), per tasks.md's Suggested Work Units table (PR 2:
Phase 3 + Phase 4, ~125-160 lines, plus the ~50-line `PanelStateBox.tsx` deferred from PR 1).

Out of scope for this run (untouched, per the run's explicit instructions): Phase 5 (`PanelStats.tsx`),
Phase 6 (`PanelFilters.tsx`), Phase 7 (`MecanicosWorkload.tsx`), Phase 8 (Manual Verification — blocked
until Phases 1-7 land), Phase 9 (Sign-off).

## Completed Tasks

- [x] 1.3 Created `client/app/(dashboard)/ordenes-trabajo/panel/PanelStateBox.tsx` per design §2.2 —
      `PanelStateVariant`/`PanelStateBoxProps` exactly as specified (`variant`, `message`, optional
      `onRetry` rendered only for `'error'`, `className` for caller top margin), all three variants
      reproducing the pre-change inline box stylings verbatim plus the §1 dark pairs. No `'use client'`,
      no hooks.
- [x] 3.1 Guard checkpoint — confirmed `handleIniciar`/`handleDesactivar` untouched (see "Handler-Logic
      Preservation Trace" below).
- [x] 3.2 Container: `flex flex-wrap gap-1.5 border-t border-stone-100 pt-2` → `grid grid-cols-2 gap-1.5
      border-t border-stone-100 pt-2 dark:border-stone-800`.
- [x] 3.3 Iniciar button: `col-span-2`, `inline-flex items-center justify-center gap-1.5`, `flex-1`
      dropped, `<PlayIcon />` prepended (new local icon, exact §8 path); gradient left without a dark
      override per ADR-D.
- [x] 3.4 Editar link: `inline-flex items-center justify-center gap-1.5`, `flex-1` dropped, `<PencilIcon
      />` prepended (exact reused path), `dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800`
      added.
- [x] 3.5 Desactivar button: `inline-flex items-center justify-center gap-1.5`, `flex-1` dropped,
      `<NoSymbolIcon />` prepended (exact reused path), `dark:border-rose-500/30 dark:text-rose-300
      dark:hover:bg-rose-500/10` added.
- [x] 3.6 `PlayIcon`, `PencilIcon`, `NoSymbolIcon` declared locally in `KanbanCardActions.tsx` per the
      house convention (`viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}`,
      `h-4 w-4 shrink-0`, `aria-hidden="true"`) — no import from `clientes/page.tsx`.
- [x] 3.7 Confirmed: on a `cancelado` card the grid holds exactly two children (Editar, Desactivar), which
      fill one row two-up with no empty third cell (Iniciar's `&&` guard simply omits that grid item).
- [x] 4.1 Added `import PanelStateBox from './PanelStateBox';` to `page.tsx`.
- [x] 4.2 Guard checkpoint — confirmed `toYmd`/`mondayOfWeek`/`firstOfMonth`/`resolveDateWindow`, every
      `useState`/`useEffect`, `loadPanel`, `loadWorkload`, the mecánicos `listUsers` effect, and both
      ternary chains' branch conditions are byte-for-byte unchanged (see diff in Verification below) —
      only the JSX rendered inside each non-`KanbanBoard`/non-`MecanicosWorkload` branch changed.
- [x] 4.3 Panel section's three inline boxes replaced with `<PanelStateBox variant="loading" .../>`,
      `<PanelStateBox variant="error" onRetry={loadPanel} .../>`, `<PanelStateBox variant="empty" .../>`,
      all `className="mt-6"`, exactly per design §2.3.
- [x] 4.4 Workload section's three inline boxes replaced with the `className="mt-8"` equivalents
      (`onRetry={loadWorkload}` on the error variant) — `PanelStats`'s `{result && <PanelStats .../>}`
      line and the `KanbanBoard`/`MecanicosWorkload` mounts left unchanged.
- [x] 4.5 Header block confirmed unchanged (already had `dark:text-stone-50`/`dark:text-stone-400`); no
      unnecessary rewrite performed.

## Files Changed (this run)

| File | Action | What Was Done |
|------|--------|----------------|
| `client/app/(dashboard)/ordenes-trabajo/panel/PanelStateBox.tsx` | Created | Shared loading/error/empty box, design §2.2 exact code. |
| `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` | Modified | Added `PanelStateBox` import; replaced 6 inline state-box `<div>` blocks (3 panel + 3 workload) with `<PanelStateBox .../>` calls. Ternary branch conditions, hooks, `loadPanel`/`loadWorkload`, and date-window helpers are byte-for-byte unchanged (verified via `git diff`). |
| `client/app/(dashboard)/ordenes-trabajo/panel/KanbanCardActions.tsx` | Modified | Added 3 local icon components (`PlayIcon`, `PencilIcon`, `NoSymbolIcon`). Rewrote only the `return (...)` JSX: `flex flex-wrap` container → `grid grid-cols-2`; Iniciar gets `col-span-2`; all three actions get icons, `inline-flex` centering, and dark-mode class pairs. `handleIniciar`/`handleDesactivar` and all state/imports above the `return` are untouched (verified via `git diff`, see trace below). |

## Handler-Logic Preservation Trace (design §6.1 guard — highest-stakes requirement in this run)

Diffed the working-tree `KanbanCardActions.tsx` against `main`'s committed version with `git diff`. The
diff shows exactly two categories of change:
1. Three new top-level function declarations (`PlayIcon`, `PencilIcon`, `NoSymbolIcon`) inserted after the
   imports, before `handleIniciar`'s declaration.
2. Changes strictly inside the component's `return (...)` block (container class string, per-button class
   strings, and the three `<Icon />` JSX insertions).

Zero diff lines fall inside `handleIniciar` or `handleDesactivar`'s bodies, or in the `useRouter`/
`useState` declarations above them. Traced both flows explicitly against the rewritten file:

- **`handleIniciar`**: `orden.estado === 'pendiente'` branch — `setIniciando(true)` → `try`
  `iniciarOrdenTrabajo(orden.id)` → `onActionSuccess()` fired **before** navigating → `catch` calls
  `showError(...)`, `setIniciando(false)`, `return` (no navigation on failure) → on success falls through
  to `setIniciando(false)` then `router.push(...)`. The non-`pendiente` else-path is pure
  `router.push(...)` with no API call. All identical to `main`, confirmed line-for-line.
- **`handleDesactivar`**: `showConfirm(...)` → if not confirmed, `return` (no API call, card unchanged) →
  else `setDesactivando(true)` → `try` `updateOrdenTrabajo(orden.id, { ...all 9 fields, activo: false })`
  → `showSuccess(...)` → `onActionSuccess()` → `catch` calls `showError(...)` with **no**
  `onActionSuccess()` (failed PATCH does not re-fetch) → `finally` `setDesactivando(false)`. All identical
  to `main`, confirmed line-for-line, including field order and the `activo: false` override.

Only the wrapping `<div>`/`<button>`/`<Link>` markup and Tailwind classes differ, exactly as scoped.

## Verification Performed (this run)

1. **`npm run build` in `client/`** — passed. `✓ Generating static pages (24/24)`, no new TypeScript
   errors, no new ESLint warnings attributable to the three changed/created files.
   `/ordenes-trabajo/panel` compiles at 7.57 kB (up from PR 1's 7.01 kB — expected, given the new
   `PanelStateBox.tsx` import and the icon components).
2. **`handleIniciar`/`handleDesactivar` byte-for-byte trace** — see dedicated section above; confirmed via
   `git diff` that zero lines inside either handler changed.
3. **`page.tsx` ternary-condition guard** — `git diff` on `page.tsx` confirms the only changed lines are
   the new import and the JSX **inside** each branch; the conditions themselves
   (`loading ? … : error ? … : !result || result.data.length === 0 ? … : (<KanbanBoard .../>)` and the
   workload equivalent) are untouched — same line count of condition tokens, same operators, same
   `KanbanBoard`/`MecanicosWorkload` mount lines.
4. **`PanelStateBox.tsx` style-fidelity check** — compared the three variants against `main`'s inline
   boxes: `loading` (`flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white
   p-8 text-sm text-stone-500 shadow-sm` + identical spinner markup), `error` (`flex items-center
   justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600` +
   identical retry-button markup), `empty` (`rounded-xl border border-stone-200 bg-white p-8 text-center
   text-sm text-stone-500 shadow-sm`) — all match verbatim, with only the §1 `dark:` pairs added on top.
5. **`cancelado` grid-cell check (task 3.7)** — confirmed by reading the JSX: the Iniciar button's
   `{orden.estado !== 'cancelado' && (...)}` guard is unchanged; when it evaluates false, the grid
   (`grid-cols-2`) simply has two children (Editar, Desactivar), which the grid places one-per-column,
   filling one row — no orphan cell.
6. **Scope containment (`git status --porcelain`)** — only the three files listed above appear as
   modified/new under `panel/`; pre-existing untracked openspec artifacts (`design.md`, `exploration.md`,
   `proposal.md`, `specs/`) from earlier SDD phases were left untouched and are **not** part of this run's
   commit, per the hazard-avoidance instruction to only stage files this run creates/modifies.
7. **Not verified in this run (needs a dev server + real browser, explicitly allowed to be deferred):**
   live 375px render of the button-wrap fix, dark-mode toggle visual inspection. A dev server was not
   started; static/code review plus `npm run build` were used instead, matching the run's verification
   instructions and PR 1's precedent.

## Deviations from Design

None. `PanelStateBox.tsx` matches design §2.2 exactly; `page.tsx`'s resulting JSX matches design §2.3
exactly (including the `onRetry`/`className` wiring and the unchanged `PanelStats`/`KanbanBoard`/
`MecanicosWorkload` lines); `KanbanCardActions.tsx`'s resulting JSX matches design §6.3 exactly (container
classes, `col-span-2` on Iniciar, icon placement, dark pairs, and the ADR-D no-dark-override on the
gradient CTA).

## Issues Found

None.

## Remaining Tasks

- [ ] Phase 5 — `PanelStats.tsx` grid ladder + dark + icons
- [ ] Phase 6 — `PanelFilters.tsx` mobile stacking + dark
- [ ] Phase 7 — `MecanicosWorkload.tsx` grid tuning + dark
- [ ] Phase 8 — Manual verification (blocked until Phases 1-7 complete)
- [ ] Phase 9 — Sign-off (blocked until Phase 8 complete)

## Workload / PR Boundary (this run)

- Mode: chained PR slice, `stacked-to-main` chain strategy
- Current work unit: PR 2 of 3 — card actions button-wrap fix + `PanelStateBox` + `page.tsx` wiring
- Boundary: starts from PR 1's tip (`442b4ee`, the Kanban responsive fork); ends with the working
  `PanelStateBox`-unified state presentation and the icon-assisted 2-row card-action grid, verified via
  `npm run build`. PR 3 will branch off this branch's tip and add stats/filters/workload polish
  (Phases 5-7), then the Phase 8/9 manual verification and sign-off once all phases have landed.
- Rollback: revert this commit; `page.tsx` and `KanbanColumn.tsx`'s `KanbanCard` still import
  `KanbanCardActions`/mount the panel with the same public props, so no caller-side changes are needed to
  roll back other than restoring the three touched files' prior contents.
- Estimated review budget impact: within the ~125-160 (Phase 3+4) + ~50 (task 1.3) line estimate from
  tasks.md's Suggested Work Units table for PR 2.

## Git (this run)

- Branch: `feat/panel-estetica-actions-wiring` (not switched from, not pushed, no PR opened, no `gh`
  command run)
- Commit: see final report for hash — one commit for this work unit (all three files land together; they
  are independently reviewable but small enough to land as a single PR-2 commit per the chain strategy).

## Status (this run)

15/15 assigned tasks complete (task 1.3 + Phase 3 (3.1-3.7) + Phase 4 (4.1-4.5)). Ready for the PR 3 apply
batch (Phases 5-7), or for `sdd-verify` scoped to PR 1+PR 2's combined structural/build/behavior
correctness if the orchestrator wants a gate check before continuing.

---

## Scope of this run (PR 3 of 3 — chained, stacked-to-main, FINAL)

Branch: `feat/panel-estetica-polish`, created off `feat/panel-estetica-actions-wiring` (which contains
commit `d577460` on top of `442b4ee` — PR1 Kanban core + PR2 card actions/state box/page wiring, both
independently reviewed and PASSED). Implements Phase 5 (`PanelStats.tsx`), Phase 6 (`PanelFilters.tsx`),
Phase 7 (`MecanicosWorkload.tsx`), Phase 8 (Manual Verification — full matrix, all phases now landed), and
Phase 9 (Sign-off).

## Completed Tasks

- [x] 5.1 `PanelStats.tsx` grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` → `grid-cols-1 sm:grid-cols-3
      lg:grid-cols-5` (design §3.1's orphan-free math).
- [x] 5.2 `ESTADO_BADGE_CLASSES` + inline Total/Mecánicos badges updated with §1.2 dark pairs.
- [x] 5.3 Added `icon`/`iconClass` per `Figure`; declared `SquaresIcon`, `ClockIcon`, `WrenchIcon`,
      `UsersIcon` locally; reused `CheckCircleIcon`'s exact path from `clientes/page.tsx`; all `h-5 w-5
      shrink-0`.
- [x] 5.4 Tile top row restructured to `flex items-center justify-between gap-2` (badge left, icon right);
      tile shell/number/unit dark pairs added exactly per design §3.4.
- [x] 6.1 `PanelFilters.tsx` container: `flex flex-wrap items-end gap-4` → `flex flex-col gap-4 sm:flex-row
      sm:flex-wrap sm:items-end` (mirrors `clientes/page.tsx:306`, verified by direct read of that file).
- [x] 6.2 All 6 control wrappers: fixed `w-48`/`w-40` → `w-full ... sm:w-48`/`w-full ... sm:w-40`.
- [x] 6.3 Container dark pair `dark:border-stone-700 dark:bg-stone-900` added.
- [x] 6.4 All 5 labels gained `dark:text-stone-300`.
- [x] 6.5 `selectClassName` updated to the full light+dark spec (background/border/text/both focus-ring
      pairs) from design §4.2, applied unchanged to all 4 `<select>` + 2 `<input type="date">`.
- [x] 7.1 `MecanicosWorkload.tsx` grid ladder (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) confirmed kept
      unchanged (design §7.1 — grid doesn't stretch orphans).
- [x] 7.2 Added `ChartBarIcon` (new) to the heading with `text-stone-400 dark:text-stone-500`; heading text
      already had `dark:text-stone-200` from a prior unrelated pass — confirmed present, no regression.
- [x] 7.3 Card shell/name/count/unit dark pairs added exactly per design §7.2.
- [x] 7.4 Load-bar track: added `dark:bg-stone-800`. Gradient fill (`from-rose-500 to-red-400`)
      deliberately left with **no** dark override per ADR-D.
- [x] 7.5 Percentage caption gained `dark:text-stone-400`.
- [x] 8.1-8.4 Manual verification matrix — see `tasks.md`'s Phase 8 for the full item-by-item results.
      Summary: all dark-mode (8.1.*), behavior-regression (8.3.*), and diff/build (8.4.*) checks PASS via
      static code review + `npm run build`. Two layout items (8.2.3-8.2.6, class-math based) PASS. **Three
      items (8.2.1, 8.2.2, 8.2.7) remain OPEN** — they require an actual rendered 375px browser viewport
      with click interaction, and no browser-automation tool (Playwright/Puppeteer/etc.) is available in
      this execution environment. This is consistent with proposal.md's own accepted tradeoff ("No
      automated visual regression / E2E coverage... including a real-device check of the mobile tabs and
      the card-action button-wrap fix") but is flagged here as a concrete open follow-up for a human or a
      browser-tool-equipped session before this change is considered fully closed.
- [x] 9.1-9.2 Sign-off — Success Criteria and Rollback Plan walked; see "Phase 9 Sign-off" section below.

## Files Changed (this run)

| File | Action | What Was Done |
|------|--------|----------------|
| `client/app/(dashboard)/ordenes-trabajo/panel/PanelStats.tsx` | Modified | Grid ladder fix (`grid-cols-1 sm:grid-cols-3 lg:grid-cols-5`); added 5 icons (4 new + 1 reused `CheckCircleIcon`) with per-tile accent tint; dark pairs on card shell, badges, number, unit. |
| `client/app/(dashboard)/ordenes-trabajo/panel/PanelFilters.tsx` | Modified | `flex-col → sm:flex-row` restructure mirroring `clientes/page.tsx`; per-control `w-full sm:w-*` widths; full light+dark `selectClassName`; dark pairs on container + 5 labels. |
| `client/app/(dashboard)/ordenes-trabajo/panel/MecanicosWorkload.tsx` | Modified | Added `ChartBarIcon` to heading; dark pairs on card shell, name, count, unit, load-bar track, percentage caption. Load-bar gradient fill deliberately unchanged (ADR-D). Grid ladder confirmed unchanged (design §7.1). |

No other files under `panel/` were touched this run (`git status --porcelain` confirmed only these three
modified before staging).

## Verification Performed (this run)

1. **`npm run build` in `client/`** — passed. `✓ Generating static pages (24/24)`, no new TypeScript
   errors, no new ESLint warnings attributable to the three changed files. `/ordenes-trabajo/panel`
   compiles at 8.44 kB (up from PR2's 7.57 kB — expected, given the 5 new icon components).
2. **`npm run build` in `server/`** — passed (`nest build` completed with no errors/output, i.e. clean).
3. **Diff-empty guards (design §10.4, re-run against `main` for the full 3-PR chain):**
   - `git diff main...feat/panel-estetica-polish -- client/package.json` → empty.
   - `git diff main...feat/panel-estetica-polish -- client/tailwind.config.ts` → empty.
   - `git diff main...feat/panel-estetica-polish -- server/` → empty.
   - `git diff main...feat/panel-estetica-polish -- client/app/lib/` → empty.
   - `git diff main...feat/panel-estetica-polish -- "client/app/(dashboard)/ordenes-trabajo/page.tsx"` →
     empty.
   All five PASS.
4. **Scope containment across the full chain** — `git diff main...feat/panel-estetica-polish --stat` for
   `client/app/` + `server/` shows exactly 6 committed files (from PR1+PR2), all under
   `.../ordenes-trabajo/panel/`; this run's 3 additional modified files are also under `panel/`. No file
   outside `panel/` appears anywhere in the 3-PR chain's diff.
5. **Dark-mode coverage grep** — `grep dark: client/app/(dashboard)/ordenes-trabajo/panel/*` confirms all
   9 files in `panel/` (6 original + 3 new from PR1/PR2) now carry `dark:` classes; zero unstyled
   light-mode-only surfaces found in a class-by-class read against design §1's mapping table.
6. **CSS-only layout selection re-confirmed** — `grep -r "matchMedia|useMediaQuery|innerWidth|innerHeight"`
   across `panel/` → zero matches (unchanged from PR1).
7. **Handler-logic re-confirmation (`KanbanCardActions.tsx`, read fresh this run)** — `handleIniciar` and
   `handleDesactivar` bodies read line-by-line; identical to PR2's committed version and to the pre-change
   `main` behavior (dual-behavior Iniciar branch, `cancelado` exclusion, full-object Desactivar PATCH,
   confirm-then-PATCH-then-toast flow). No lines inside either handler differ.
8. **`page.tsx` ternary-condition re-confirmation (read fresh this run)** — both ternary chains'
   conditions (`loading ? … : error ? … : !result || result.data.length === 0 ? … : (<KanbanBoard .../>)`
   and the workload equivalent) unchanged from PR2; `loadPanel`'s 6-dep array and `loadWorkload`'s empty
   dep array both confirmed unchanged.
9. **Not verified in this run (environment limitation, not a scope decision)** — 8.2.1, 8.2.2, and 8.2.7
   require an actual rendered 375px browser viewport with click/tap interaction. No browser-automation MCP
   tool (Playwright, Puppeteer, or equivalent) is available in this session, and no dev server + manual
   browser check was performed. All other checks in design §10's four tables were completed via static
   code review, `git diff`, and `npm run build`, per the same methodology as PR1 and PR2.

## Phase 9 Sign-off — Success Criteria Walk (proposal.md)

- [x] All six panel components visually polished within the `rounded-xl` + `border-stone-200` +
      `shadow-sm` + rose/red accent language — confirmed across all 3 PRs.
- [x] Every panel surface has a correct, readable `dark:` variant — confirmed via the dark-mode coverage
      grep + class-by-class review (§8.1 above); no light-mode-only surface found.
- [x] Mobile Kanban tab switcher shows one estado at a time, defaults to Pendiente, each tab carries a
      count — confirmed via `KanbanMobileTabs.tsx` code read (PR1); **live tap-interaction not verified in
      this environment** (see 8.2.1 above).
- [x] Desktop keeps multi-column layout at `lg`+ — confirmed via `KanbanBoard.tsx`'s `hidden lg:grid
      lg:grid-cols-4` + ADR-E's width math.
- [x] Layout selection is CSS-only; only new JS state is the active-tab selection — confirmed via the
      `matchMedia`/`useMediaQuery`/`innerWidth` grep (zero matches) across all 3 PRs.
- [x] Stats/workload grids wrap evenly; filter bar stacks on mobile — confirmed via this run's grid-ladder
      and `flex-col`/`sm:flex-row` class changes.
- [x] Three card actions lay out cleanly at 375px — confirmed via `KanbanCardActions.tsx`'s `grid-cols-2` +
      `col-span-2` class math (PR2); **live 375px render not verified in this environment** (see 8.2.7
      above) — this is proposal.md's own named accepted tradeoff for this line item.
- [x] Restrained inline SVG icons added, no icon library — confirmed: 5 new icons this run
      (`SquaresIcon`, `ClockIcon`, `WrenchIcon`, `UsersIcon`, `ChartBarIcon`) + reused `CheckCircleIcon`,
      all hand-declared local components; `client/package.json` diff-empty.
- [x] Loading/error/empty state boxes unified into one shared component, fetch logic untouched — confirmed
      via `PanelStateBox.tsx` (PR2) + `page.tsx`'s unchanged ternary conditions.
- [x] Every action behaves byte-for-byte as before — confirmed via the handler re-read above (item 7).
- [x] No new data/endpoint/DTO/dependency added; listed files diff-empty — confirmed via the 5 diff-empty
      guards above, all empty.
- [x] No dark-mode change leaked outside the panel — confirmed via the scope-containment `--stat` check
      (item 4 above): only `panel/` files appear in the entire 3-PR diff.
- [x] Change is frontend/presentation-only and reversible per the Rollback Plan — confirmed (see Rollback
      Plan walk below).

**Overall sign-off: PASS, with two named open items (8.2.1/8.2.2's live tab-interaction check, and
8.2.7's live 375px card-action render check) that require a real browser and are flagged for manual QA or
a browser-tool-equipped verification session before this change is considered fully closed end-to-end.**
This gap is consistent with proposal.md's own pre-declared "Known Gaps / Accepted Tradeoffs" section, which
explicitly names both a real-device tab check and the button-wrap fix as items requiring live verification
outside the SDD apply/design loop.

## Rollback Plan Walk (proposal.md)

Confirmed accurate and executable as written:
1. **Revert the PRs** (cleanest path) — 3 commits total across the chain (PR1: Kanban core; PR2: card
   actions + state box + page wiring; PR3: this run's stats/filters/workload polish). Reverting all three
   in reverse order fully restores the six panel components' pre-change JSX/classes.
2. Piecemeal: restoring each of the six components (including `KanbanBoard.tsx`'s single horizontal-scroll
   layout, removing the `hidden lg:grid`/`lg:hidden` fork and the active-tab state) is achievable file by
   file since no cross-file coupling was introduced beyond the sanctioned `KanbanColumn.tsx`/
   `KanbanMobileTabs.tsx` imports (both deletable together with their sole importer, `KanbanBoard.tsx`).
3. Deleting `KanbanMobileTabs.tsx`, `PanelStateBox.tsx`, `KanbanColumn.tsx` and re-inlining the state boxes
   and card/column markup — confirmed no other file in the repo imports from these three outside
   `KanbanBoard.tsx`/`page.tsx`, so no leftover references would remain.
4. Removing all added `dark:` classes and inline icon components from the six files — confirmed each
   `dark:` class and icon component addition this run (and in PR1/PR2) is additive-only (no light-mode
   class was removed or altered to add a dark pair), so reverting is a clean subtraction with no risk of
   losing an unrelated fix.

No schema, migration, backend, endpoint, DTO, or client-API change exists anywhere in the 3-PR chain
(confirmed via the diff-empty guards), so rollback carries zero data-loss risk, exactly as the Rollback
Plan states.

## Deviations from Design

None. `PanelStats.tsx` matches design §3.2/§3.3/§3.4 exactly (grid ladder, icon table, tile JSX structure).
`PanelFilters.tsx` matches design §4.1/§4.2 exactly (container restructure, per-control widths,
`selectClassName`). `MecanicosWorkload.tsx` matches design §7.1/§7.2 exactly (grid ladder unchanged, heading
icon, dark pairs, load-bar track/fill split per ADR-D).

The only notable deviation is **not a design deviation but an environment/tooling limitation**: three
Phase 8.2 verification items (8.2.1, 8.2.2, 8.2.7) that design.md explicitly calls for a "live render" /
real-browser check could not be performed because no browser-automation MCP tool is available in this
session and no dev-server-plus-manual-browser check was run. This mirrors proposal.md's own accepted
tradeoff language but is called out explicitly here rather than silently marked as passed.

## Issues Found

None (code-level). The one open item is the browser-verification gap noted above — not a defect, but an
unverified-in-this-session risk that should be closed by a human or browser-tool session before relying on
the mobile tab-switch interaction and the 375px card-action layout in production without a final visual
check.

## Remaining Tasks

None assigned to `sdd-apply`. All of tasks.md's Phases 1-9 are now `[x]`, except the three Phase 8.2 items
explicitly left `[ ]` and documented above as requiring a live-browser follow-up.

## Workload / PR Boundary (this run)

- Mode: chained PR slice, `stacked-to-main` chain strategy — **final PR (3 of 3)**.
- Current work unit: PR 3 of 3 — stats/filters/workload polish + full verification + sign-off.
- Boundary: starts from PR 2's tip (`d577460`); ends with the fully dark-mode-covered, evenly-wrapping
  panel across all six components, verified via `npm run build` in both `client` and `server`, plus the
  full static verification matrix.
- Rollback: revert this commit (and, if a full rollback of the change is desired, PR1/PR2's commits too);
  no caller-side changes needed since `PanelStats`, `PanelFilters`, `MecanicosWorkload` keep their exact
  public prop signatures.
- Estimated review budget impact: within the ~105-150 line estimate from tasks.md's Suggested Work Units
  table for PR 3.

## Git (this run)

- Branch: `feat/panel-estetica-polish` (not switched from, not pushed, no PR opened, no `gh` command run).
- Commits: see final report for hash(es) — code changes committed separately from the previously-untracked
  SDD planning artifacts (`proposal.md`, `design.md`, `exploration.md`, `specs/`), per the run's
  instructions to land the full planning trail in this final PR's history.

## Status (this run)

18/18 assigned checklist items complete for Phases 5-7 and both Phase 9 sign-off items complete, with 3 of
Phase 8's 26 verification items left explicitly open pending a live-browser check unavailable in this
environment (documented above, not silently skipped). This is the final PR of the 3-PR
`panel-trabajo-estetica` chain.
