# Tasks: Visual/aesthetic redesign of `/ordenes-trabajo/panel` (desktop + mobile, dark mode)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-700 (added + removed) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | 3 PRs along the phase boundaries below |
| Delivery strategy | ask-on-risk (orchestrator must stop and confirm chaining before apply) |
| Chain strategy | to be selected by the user if chaining is confirmed |

Decision needed before apply: **Yes**
Chained PRs recommended: **Yes**
400-line budget risk: **High**

This is the **largest panel change to date** — it is the first one that rewrites JSX across all six
existing panel components in the same pass, plus adds three new files. Estimate breakdown, calibrated
against design.md's own code blocks and file-inventory table (§"File inventory"):

**New files (all-added lines):**
- `panel/KanbanColumn.tsx` — design §5.2's full listing is ~108 lines (imports, 5 exported maps/consts,
  2 helper functions, `KanbanCard`, `KanbanColumn`) → **~110 lines**
- `panel/KanbanMobileTabs.tsx` — design §5.3's full listing is ~55 lines (`'use client'`, `useState`,
  tabs row, single `<KanbanColumn>` mount) → **~55 lines**
- `panel/PanelStateBox.tsx` — design §2.2's full listing is ~54 lines (3 variants + prop interface) →
  **~50 lines**
- New-file subtotal: **~215 lines**

**Modified files (added + removed, since this is a JSX rewrite, not an append):**
- `panel/KanbanBoard.tsx` — the **largest single delta**: ~110-140 lines (the extracted maps/helpers/
  `KanbanCard`/`KanbanColumn`) are *removed* from this file per ADR-A, and the remaining component is
  *rewritten* into the two-tree fork (§5.4, ~40 lines) that imports from the new files → **~170-195
  changed lines**
- `panel/page.tsx` — 6 ternary branches (3 panel + 3 workload) each collapse from a multi-line inline
  `<div>` box into one `<PanelStateBox>` call (§2.3), plus one new import → **~70-90 changed lines**
- `panel/KanbanCardActions.tsx` — container goes from `flex flex-wrap` + 3 `flex-1` buttons to a
  `grid grid-cols-2` 2-row layout (§6.3) with 3 new/reused inline icon components (`PlayIcon` new,
  `PencilIcon`/`NoSymbolIcon` reused verbatim from `clientes/page.tsx`) plus full dark pairs → **~55-70
  changed lines**
- `panel/PanelStats.tsx` — grid ladder change, per-tile `icon`/`iconClass` field addition, 5 icon
  components, dark pairs on badges/numbers/units (§3) → **~45-60 changed lines**
- `panel/PanelFilters.tsx` — container restructure (§4.1), 6 control-wrapper width classes, dark pairs
  on container/labels/`selectClassName` (§4.2) → **~35-50 changed lines**
- `panel/MecanicosWorkload.tsx` — heading icon, dark pairs on card/track/text (§7.2); grid column counts
  are *unchanged* (§7.1) so this is the smallest modified file → **~25-40 changed lines**
- Modified-file subtotal: **~400-505 changed lines**

**Grand total: ~615-720 changed lines** — well past the 400-line budget on any single PR. Per this
project's Review Workload Guard, `sdd-apply` MUST NOT proceed as one PR without an explicit chaining
decision or a recorded `size:exception`.

### Suggested Work Units (for chaining, if selected)

| Unit | Scope | Approx. lines | Notes |
|------|-------|----------------|-------|
| PR 1 | Phase 1 (3 new files) + Phase 2 (`KanbanBoard.tsx` rewrite) | ~385-410 | Tightly coupled: `KanbanBoard.tsx` cannot compile without `KanbanColumn.tsx`/`KanbanMobileTabs.tsx` existing first (§5.4 imports). This is the structural core of the change — the Kanban responsive fork. |
| PR 2 | Phase 3 (`KanbanCardActions.tsx`) + Phase 4 (`page.tsx` wiring) | ~125-160 | Independent of PR 1's Kanban fork (KanbanCardActions' public interface is unchanged, so KanbanColumn's `KanbanCard` import keeps working across either PR order); `page.tsx` only needs `PanelStateBox.tsx` from PR 1. |
| PR 3 | Phase 5 (`PanelStats.tsx`) + Phase 6 (`PanelFilters.tsx`) + Phase 7 (`MecanicosWorkload.tsx`) | ~105-150 | Fully independent polish passes — no shared imports with PR 1/PR 2's files. Could even be split further into 3 tiny PRs if desired, but grouping keeps review overhead reasonable. |

If `single-pr` or `exception-ok` is chosen instead, record `size:exception` before `sdd-apply` runs, per
the orchestrator's Review Workload Guard.

## Dependency / Parallelization Summary

- **Sequential, hard dependency:** Phase 1 → Phase 2. `KanbanBoard.tsx` (§5.4) imports `KanbanColumn`/
  `COLUMNS` from `KanbanColumn.tsx` and imports `KanbanMobileTabs` from `KanbanMobileTabs.tsx` — both
  must exist first, and `KanbanMobileTabs.tsx` itself imports from `KanbanColumn.tsx` (§5.3), so within
  Phase 1 the order is: 1.1 (`KanbanColumn.tsx`) → 1.4 (`KanbanMobileTabs.tsx`); 1.3 (`PanelStateBox.tsx`)
  has no dependency and can happen any time in Phase 1.
- **Sequential, soft dependency:** Phase 1 (`PanelStateBox.tsx`) → Phase 4 (`page.tsx`). `page.tsx`
  cannot import `PanelStateBox` before it exists.
- **Parallelizable:** Phase 3 (`KanbanCardActions.tsx`) can proceed in parallel with Phases 1-2. It is
  imported *by* `KanbanColumn.tsx`'s `KanbanCard` (§5.2), but only its existing exported signature
  (`{ orden, onActionSuccess }`) is required — Phase 3 does not change that signature, only its internal
  JSX/classes, so Phase 1's extraction is not blocked by Phase 3's completion. Work can happen in either
  order or concurrently.
- **Parallelizable:** Phases 5, 6, 7 (`PanelStats.tsx`, `PanelFilters.tsx`, `MecanicosWorkload.tsx`) are
  fully independent of each other and of Phases 1-3 — none of them import from or are imported by the
  Kanban files or `PanelStateBox`/`KanbanCardActions`. They can run in parallel with everything else.
- **Hard convergence point:** Phase 8 (Manual Verification) requires all of Phases 1-7 complete, because
  §10.1's dark-mode table and §10.2's layout table span every file. Phase 9 (Sign-off) requires Phase 8
  complete.

---

## Phase 1: New Shared Files (`KanbanColumn.tsx`, `PanelStateBox.tsx`, `KanbanMobileTabs.tsx`)

Satisfies spec requirements: "Unified Loading/Error/Empty State Presentation", "Mobile Kanban Tab
Switcher" (scaffolding), "Full Dark Mode Coverage, Scoped to the Panel" (baseline card/column styling).

- [x] 1.1 Create `client/app/(dashboard)/ordenes-trabajo/panel/KanbanColumn.tsx` (design §5.2, ADR-A) —
      no `'use client'` (presentational). Move `ESTADO_LABELS`, `PRIORIDAD_LABELS`,
      `PRIORIDAD_BADGE_CLASSES`, `COLUMNS`, `COLUMN_CLASSES`, `formatFecha`, `mecanicoLabel`, `KanbanCard`,
      and `KanbanColumn` out of `KanbanBoard.tsx` into this new file, **exported**, with the full §1
      dark-mode class pairs baked in exactly as shown in design §5.2's code block (`COLUMN_CLASSES`'
      tinted-container dark pairs per §1.3, `PRIORIDAD_BADGE_CLASSES` per §1.2, card/text dark pairs per
      §1.1). Import `KanbanCardActions` from `./KanbanCardActions` and mount it inside `KanbanCard`
      exactly where it is today.
- [x] 1.2 **Verification checkpoint — extraction integrity (CRITICAL, its own checkable item).** Confirm
      the moved `KanbanCard`/`KanbanColumn` render **identical DOM structure and content** to their
      pre-change versions, modulo *only* the design's two explicit deltas: (a) the new `dark:` classes
      from §1, and (b) the column container's `min-w-[260px] flex-1` → **`min-w-0`** change (design §5.2
      "Key delta vs. today"). No prop shape change, no reordering of card fields (número/badge, cliente/
      vehículo/mecánico, tiposServicio chips, Ingreso line, `KanbanCardActions` mount), no logic change to
      `formatFecha`/`mecanicoLabel`. This guards against an accidental behavior/structure change sneaking
      into what is meant to be a pure refactor-then-restyle.
- [x] 1.3 Create `client/app/(dashboard)/ordenes-trabajo/panel/PanelStateBox.tsx` (design §2.2, ADR-B) —
      no `'use client'`, no hooks. Implement the `PanelStateVariant` type (`'loading' | 'error' | 'empty'`)
      and the `PanelStateBoxProps` interface (`variant`, `message`, optional `onRetry` rendered only for
      `'error'`, `className` for caller-supplied top margin) exactly as in design §2.2's code block —
      all three variants must reproduce the current three inline box stylings **verbatim** (same padding/
      radius/border/shadow/spinner markup) plus the added §1 dark pairs, per the "pure de-duplication, not
      a restyle" note.
- [x] 1.4 Create `client/app/(dashboard)/ordenes-trabajo/panel/KanbanMobileTabs.tsx` (design §5.3) — this
      is the **one** file in this change requiring `'use client'`. Depends on 1.1 (`KanbanColumn.tsx`)
      existing first: import `KanbanColumn`, `ESTADO_LABELS`, `COLUMN_CLASSES` from `./KanbanColumn`.
      Implement `useState<Estado>('pendiente')` (D5's fixed default — do not implement the deferred
      "first non-empty column" refinement noted in design §11), the 2×2 tabs `grid grid-cols-2 gap-2`
      (chosen over a single-row segmented control specifically to avoid reintroducing the horizontal-
      scroll sliver at 375px — design §5.3 comment), each tab showing its estado's count pill in the
      estado's color via `COLUMN_CLASSES[estado].count`, active/inactive tab classes exactly as in design
      §5.3's code block, and the single active `<KanbanColumn>` mount below the tabs row.

## Phase 2: `KanbanBoard.tsx` Rewrite — the Responsive Fork

Satisfies spec requirements: "Mobile Kanban Tab Switcher", "Desktop Kanban Multi-Column Layout
Preserved", "Layout Selection Is CSS-Only, No Hydration Risk", "Mobile Tab State Is Ephemeral" (wiring),
"Full Dark Mode Coverage, Scoped to the Panel" (capped banner).

- [x] 2.1 Depends on Phase 1 (`KanbanColumn.tsx` and `KanbanMobileTabs.tsx` must exist first — this file
      imports both). Rewrite `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` per design
      §5.4: remove the extracted maps/helpers/`KanbanCard`/`KanbanColumn` (now living in
      `KanbanColumn.tsx`, moved in task 1.1); import `KanbanColumn`, `COLUMNS` from `./KanbanColumn` and
      `KanbanMobileTabs` (default export) from `./KanbanMobileTabs`.
- [x] 2.2 Compute `columns = COLUMNS.map((estado) => ({ estado, ordenes: data.filter(...) }))` **once** at
      the top of the component (design §5.4) and feed the identical `columns` array to both the desktop
      tree and `<KanbanMobileTabs columns={columns} onActionSuccess={onActionSuccess} />` — this is what
      guarantees the four estado columns (including empty ones) always render on both trees and tab
      counts always match desktop column counts.
- [x] 2.3 Render the capped banner (`meta.capped &&`) with its dark pair from §1.4
      (`dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300`) — content/condition unchanged.
- [x] 2.4 **Verification checkpoint — `min-w-0` / `lg:grid-cols-4` pairing (CRITICAL, its own checkable
      item, ADR-E).** Confirm the desktop tree is `hidden gap-4 lg:grid lg:grid-cols-4` (not the old
      `flex ... overflow-x-auto`) and that this container change lands in the **same commit/PR unit** as
      task 1.1's `KanbanColumn.tsx` `min-w-0` change (replacing the removed `min-w-[260px] flex-1`). These
      two changes are interdependent: `min-w-0` alone (without the 4-column grid track) collapses desktop
      columns to zero width, and `lg:grid-cols-4` alone (with the old `min-w-[260px]` still in place)
      forces columns wider than their grid track, breaking the layout. Verify per ADR-E's math: content
      width at `lg` is 976px vs. the old flex-minimum of 1088px (which would have scrolled), so the new
      grid must divide evenly instead (≈232px/column at `lg`).
- [x] 2.5 Render the mobile tree as `<div className="lg:hidden"><KanbanMobileTabs .../></div>` (design
      §5.4) — confirm both trees are always present in the DOM (no conditional mount/unmount) and the
      `hidden`/`lg:grid` vs. `lg:hidden` pairing is the **only** mechanism selecting which renders (no
      `window.matchMedia`, `useMediaQuery`, or `window.innerWidth` read anywhere in this file or its
      imports — spec: "Layout Selection Is CSS-Only, No Hydration Risk").

## Phase 3: `KanbanCardActions.tsx` — Button-Wrap Fix + Dark Mode

Satisfies spec requirements: "Card Actions Do Not Wrap Awkwardly on Mobile", "Restrained Icon Usage, No
New Dependency", "Full Dark Mode Coverage, Scoped to the Panel", "No Action Behavior Change".

Independent of Phases 1-2 (can run in parallel) — but note `KanbanColumn.tsx`'s `KanbanCard` (task 1.1)
imports this file, so this file's public props interface (`{ orden, onActionSuccess }`) must stay stable
regardless of which phase lands first.

- [x] 3.1 **Guard checkpoint — preserve handlers byte-for-byte (CRITICAL, its own checkable item, design
      §6.1).** Before touching any JSX, confirm `handleIniciar` (the `orden.estado === 'pendiente'` API
      branch, `router.push` call, and guard against `cancelado`) and `handleDesactivar` (the `showConfirm`
      → full-object `{ ...fields, activo: false }` PATCH → `showSuccess`/`showError` →
      `onActionSuccess()` flow) remain **byte-for-byte unchanged** — same conditions, same call order, same
      state transitions (`iniciando`/`desactivando`). Only the JSX **returned** by the component (the
      wrapping container and the three buttons/link) changes in this phase.
- [x] 3.2 Replace the `flex flex-wrap gap-1.5` container with `grid grid-cols-2 gap-1.5 border-t
      border-stone-100 pt-2 dark:border-stone-800` (design §6.2/§6.3, ADR-C).
- [x] 3.3 Iniciar button: `col-span-2` (full top row) when `orden.estado !== 'cancelado'`; add
      `inline-flex items-center justify-center gap-1.5`; drop `flex-1`; prepend the new `PlayIcon`
      (design §8/§9, path `M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010
      1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z`, `h-4 w-4 shrink-0`). Per ADR-D, the gradient
      (`bg-gradient-to-r from-rose-500 to-red-500 text-white`) gets **no** dark override — leave it as is.
- [x] 3.4 Editar link: `inline-flex items-center justify-center gap-1.5`; drop `flex-1`; prepend the
      reused `PencilIcon` (exact path from `clientes/page.tsx` lines 22-52, per design §8 table); add the
      dark pair `dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800` (§1.4).
- [x] 3.5 Desactivar button: `inline-flex items-center justify-center gap-1.5`; drop `flex-1`; prepend the
      reused `NoSymbolIcon` (exact path from `clientes/page.tsx`, per design §8 table); add the dark pair
      `dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10` (§1.4).
- [x] 3.6 Declare `PlayIcon` locally in this file per the house convention (`viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.5}`, `h-4 w-4 shrink-0`, `aria-hidden="true"`,
      design §8's example declaration); re-declare `PencilIcon`/`NoSymbolIcon` locally with their exact
      reused `d` paths (no import from `clientes/page.tsx` — per-file icon convention).
- [x] 3.7 Confirm the `cancelado` case (Iniciar absent) still renders exactly two grid cells (Editar +
      Desactivar) filling one row with no empty cell/orphan (design §6.2's explicit callout).

## Phase 4: `page.tsx` Wiring — `PanelStateBox` Adoption

Satisfies spec requirements: "Unified Loading/Error/Empty State Presentation", "No Data or Fetch Behavior
Change".

Depends on Phase 1 (`PanelStateBox.tsx` must exist first).

- [x] 4.1 Add `import PanelStateBox from './PanelStateBox';` to `page.tsx` (design §2.3).
- [x] 4.2 **Guard checkpoint.** Confirm `toYmd`, `mondayOfWeek`, `firstOfMonth`, `resolveDateWindow`,
      every `useState`/`useEffect` hook, `loadPanel`, `loadWorkload`, the mecánicos `listUsers` effect,
      and — critically — **both ternary chains' branch conditions** (`loading ? … : error ? … : !result ||
      result.data.length === 0 ? … : …` and the workload equivalent) are **untouched** (design §2.1). Only
      the JSX *inside* the non-`KanbanBoard`/non-`MecanicosWorkload` branches changes.
- [x] 4.3 Replace the panel section's three inline state boxes with `<PanelStateBox variant="loading"
      message="Cargando panel de trabajo..." className="mt-6" />`, `<PanelStateBox variant="error"
      message={error} onRetry={loadPanel} className="mt-6" />`, and `<PanelStateBox variant="empty"
      message="No se encontraron órdenes con los filtros seleccionados." className="mt-6" />` exactly per
      design §2.3.
- [x] 4.4 Replace the workload section's three inline state boxes with the `className="mt-8"` equivalents
      (`onRetry={loadWorkload}` for the error variant, message "Cargando carga por mecánico...",
      "No hay mecánicos activos para mostrar.") exactly per design §2.3 — leave `PanelStats`'s
      `{result && <PanelStats .../>}` line and the `KanbanBoard`/`MecanicosWorkload` mounts unchanged.
- [x] 4.5 Header block and container-level spacing polish (design's "Section spacing/rhythm polish";
      header's existing `dark:text-stone-50`/`dark:text-stone-400` classes already present per design's
      Environment facts — confirm no regression, no unnecessary rewrite).

## Phase 5: `PanelStats.tsx` — Grid Ladder + Dark + Per-Tile Icons

Satisfies spec requirements: "Even Grid Wrapping on Mobile", "Full Dark Mode Coverage, Scoped to the
Panel", "Restrained Icon Usage, No New Dependency".

Independent of Phases 1-4 — can run in parallel with any of them.

- [x] 5.1 Change the tile grid container to `grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5`
      (design §3.1's math: 5 is prime, so only 1-col or 5-col wraps with zero orphan; `sm:grid-cols-3`
      gives a 3-over-2 split, materially better than the current 2-2-1).
- [x] 5.2 Update `ESTADO_BADGE_CLASSES` and the inline Total/Mecánicos badge classes with the §1.2 dark
      pairs exactly per design §3.2's code block.
- [x] 5.3 Add an `icon: JSX.Element` field per `Figure` (design §3.3's table: `SquaresIcon` for Total
      de órdenes, `ClockIcon` for Pendientes, `WrenchIcon` for En proceso, `CheckCircleIcon` (reused) for
      Terminados, `UsersIcon` for Mecánicos trabajando) and an `iconClass` accent color per figure
      (`text-{c}-500 dark:text-{c}-400`, or `text-stone-400 dark:text-stone-500` for Total); declare the 4
      new icon components (`SquaresIcon`, `ClockIcon`, `WrenchIcon`, `UsersIcon`) and reuse
      `CheckCircleIcon`'s exact path from `clientes/page.tsx`, per design §8's path table, all
      `h-5 w-5 shrink-0`.
- [x] 5.4 Restructure the tile top row to `flex items-center justify-between gap-2` (badge left, icon
      right) and apply the tile shell dark pair (`dark:border-stone-700 dark:bg-stone-900`), number dark
      pair (`dark:text-stone-50`), unit dark pair (`dark:text-stone-400`) exactly per design §3.4's code
      block.

## Phase 6: `PanelFilters.tsx` — Mobile Stacking + Dark

Satisfies spec requirements: "Filter Bar Stacks Vertically on Mobile", "Full Dark Mode Coverage, Scoped
to the Panel".

Independent of Phases 1-5 — can run in parallel with any of them.

- [x] 6.1 Replace the single `flex flex-wrap items-end gap-4` row with `flex flex-col gap-4 sm:flex-row
      sm:flex-wrap sm:items-end` (design §4.1, mirroring `clientes/page.tsx:306`'s pattern — auto-flow
      instead of a fixed grid template, since the panel has up to 6 controls vs. Clientes' 3).
- [x] 6.2 Each control wrapper drops its fixed mobile width and applies it only at `sm`: Mecánico →
      `w-full space-y-1 sm:w-48`; Estado / Prioridad / Fecha / Desde / Hasta → `w-full space-y-1 sm:w-40`
      (design §4.1).
- [x] 6.3 Container dark pair: `dark:border-stone-700 dark:bg-stone-900` on the existing `rounded-xl
      border border-stone-200 bg-white p-4 shadow-sm` container (design §4.2).
- [x] 6.4 Add `dark:text-stone-300` to all 5 filter labels' existing `text-sm font-medium text-stone-700`
      classes (design §4.2).
- [x] 6.5 Update the shared `selectClassName` string to the full light+dark spec from design §4.2 (applied
      to all 4 `<select>` elements and both `<input type="date">`): background, border, text, and both
      light/dark focus-ring pairs (`focus:ring-rose-100` / `dark:focus:ring-rose-500/30`) — confirm the
      focus ring stays visible in dark mode.

## Phase 7: `MecanicosWorkload.tsx` — Grid Tuning + Dark (incl. Load Bar)

Satisfies spec requirements: "Even Grid Wrapping on Mobile", "Full Dark Mode Coverage, Scoped to the
Panel", "Restrained Icon Usage, No New Dependency".

Independent of Phases 1-6 — can run in parallel with any of them.

- [x] 7.1 Confirm the grid ladder (`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`) is **kept
      unchanged** (design §7.1: a CSS grid does not stretch a lone trailing item, unlike a flex row, so no
      column-count change is needed here — only dark classes and the heading icon are added).
- [x] 7.2 Add `ChartBarIcon` (new, path per design §8 table) to the "Carga por mecánico" heading, with
      `text-stone-400 dark:text-stone-500`, and add `dark:text-stone-200` to the heading text (design
      §7.2).
- [x] 7.3 Add card shell dark pair (`dark:border-stone-700 dark:bg-stone-900`), mechanic name dark pair
      (`dark:text-stone-200`), count dark pair (`dark:text-stone-50`), unit-label dark pair
      (`dark:text-stone-400`) exactly per design §7.2's code block.
- [x] 7.4 Load-bar track: add `dark:bg-stone-800` to the existing `bg-stone-100` track. **Per ADR-D, the
      gradient fill (`bg-gradient-to-r from-rose-500 to-red-400`) gets no dark override** — leave it
      unchanged; it is deliberately kept identical because it already reads clearly against both the dark
      track and the `gray-950` shell. The `style={{ width: ... }}` inline percentage and
      `m.percentage`/`m.count`/`mecanicoLabel` logic are untouched.
- [x] 7.5 Add `dark:text-stone-400` to the percentage caption (design §7.2).

## Phase 8: Manual Verification

Maps 1:1 to design.md §10's four testing tables. Per `openspec/config.yaml` (`test_command: ""`),
verification is manual — via the dev server, a real 375px viewport, dark-mode toggle, Network tab
inspection, and a build check. Depends on Phases 1-7 being complete.

### 8.1 Dark-mode toggle — surface by surface (design §10.1)

**Method note:** no browser-automation tool is available in this execution environment (no
Playwright/Puppeteer MCP tool), so 8.1.1-8.1.10 were verified via a rigorous static class-by-class read of
every panel file's shipped JSX against design §1's mapping table, cross-checked with `grep dark:` across
all 9 `panel/` files (all 9 have `dark:` coverage). This is the same methodology used in PR1/PR2.

- [x] 8.1.1 Page header (h1 + subtitle): `page.tsx` lines 157-160 confirmed `text-stone-50` /
      `text-stone-400` present, legible on `gray-950`.
- [x] 8.1.2 All 5 stat tiles: `PanelStats.tsx` confirmed `dark:bg-stone-900` card, `dark:border-stone-700`,
      badge `dark:bg-{c}-500/15 dark:text-{c}-300` (all 5 badge classes), number `dark:text-stone-50`,
      unit `dark:text-stone-400`, tile icon tinted per §3.3's table (all 5 `iconClass` values match).
- [x] 8.1.3 Filter container + labels + all 6 controls: `PanelFilters.tsx` confirmed `dark:bg-stone-900`
      container, all 5 labels `dark:text-stone-300`, `selectClassName` carries
      `dark:bg-stone-900 dark:border-stone-700 dark:text-stone-200 dark:focus:ring-rose-500/30` applied to
      all 4 selects + 2 date inputs.
- [x] 8.1.4 Capped banner: `KanbanBoard.tsx` (PR1, unchanged this run) confirmed
      `dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300` present.
- [x] 8.1.5 Kanban columns (all 4 estados, desktop + mobile): `KanbanColumn.tsx` (PR1, unchanged this run)
      confirmed tinted `dark:bg-{c}-500/10`, `dark:border-{c}-500/20`, title `dark:text-{c}-300`, count
      `dark:bg-{c}-500/15 dark:text-{c}-300` for all 4 estados.
- [x] 8.1.6 Kanban cards: `KanbanColumn.tsx` confirmed `dark:bg-stone-900`, `dark:border-stone-700`, strong
      text `dark:text-stone-100`, body `dark:text-stone-300`, service pills
      `dark:bg-stone-800 dark:text-stone-300`, Ingreso line `dark:text-stone-500`.
- [x] 8.1.7 Card action buttons: `KanbanCardActions.tsx` (PR2, re-read this run) confirmed Iniciar gradient
      has no dark override (ADR-D, correct); Editar `dark:border-stone-700 dark:text-stone-300
      dark:hover:bg-stone-800`; Desactivar `dark:border-rose-500/30 dark:text-rose-300
      dark:hover:bg-rose-500/10`.
- [x] 8.1.8 Mobile tab row: `KanbanMobileTabs.tsx` (PR1, unchanged this run) confirmed active tab
      `dark:border-rose-500/40 dark:bg-stone-900 dark:text-stone-50`; inactive
      `dark:bg-stone-800 dark:text-stone-400`; count pills colored per estado via `COLUMN_CLASSES[estado].count`.
- [x] 8.1.9 Workload heading + cards: `MecanicosWorkload.tsx` confirmed heading `dark:text-stone-200` +
      new `ChartBarIcon` (`text-stone-400 dark:text-stone-500`); cards `dark:bg-stone-900`; track
      `dark:bg-stone-800`; gradient fill left unchanged per ADR-D (confirmed legible: high-chroma
      rose-500→red-400 against `stone-800`/`gray-950`); caption `dark:text-stone-400`.
- [x] 8.1.10 `PanelStateBox.tsx` (PR2, re-read this run) confirmed all 3 variants carry dark pairs:
      loading/empty `dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400` + spinner
      `dark:border-stone-700 dark:border-t-rose-500`; error `dark:border-red-500/30 dark:bg-red-500/10
      dark:text-red-300` with retry link `dark:text-red-300 dark:hover:text-red-200`.

### 8.2 Layout / responsive (design §10.2)

**Method note:** checks requiring an actual rendered 375px browser viewport and click interaction
(8.2.1, 8.2.2, 8.2.7) cannot be performed in this environment — no browser-automation tool is available
and no dev server + real-viewport check was run (consistent with proposal.md's own accepted tradeoff:
"No automated visual regression / E2E coverage. Verification is manual/visual only... including a
real-device check of the mobile tabs and the card-action button-wrap fix"). These three remain **open**
pending a manual QA pass in a real browser before this change is considered fully verified end-to-end;
see risks in the final report. 8.2.3-8.2.6 are verified via class-math review (grid ladders + ADR-E's
width arithmetic), which is sufficient to confirm CSS correctness even without a live render.

- [ ] 8.2.1 **OPEN — requires a real 375px browser render, not available in this environment.** Mobile tab
      switcher interaction (tap-to-switch, count accuracy, no horizontal-scroll sliver) needs manual QA.
- [ ] 8.2.2 **OPEN — requires a real browser + filter interaction.** Tab-stays-selected-after-filter-change
      needs manual QA (code review confirms `KanbanMobileTabs`' `useState` is not reset by a `columns`
      prop change, only by remount, so this should hold, but is not independently observed live).
- [x] 8.2.3 At ≥1024px (`lg`): `KanbanBoard.tsx`'s desktop tree confirmed `hidden gap-4 lg:grid
      lg:grid-cols-4` with `KanbanColumn`'s `min-w-0` (PR1, re-confirmed unchanged) — ADR-E's math
      (232px/column at `lg`, 296px at `xl`) guarantees no horizontal scroll at any `lg`+ width.
- [x] 8.2.4 At 375px: `PanelStats.tsx` grid confirmed `grid-cols-1` (base) → `sm:grid-cols-3` →
      `lg:grid-cols-5`, matching design §3.1's orphan-free math exactly.
- [x] 8.2.5 Workload grid: `MecanicosWorkload.tsx` confirmed `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
      unchanged (design §7.1 — CSS grid does not stretch a lone trailing item, unlike flex).
- [x] 8.2.6 Filter bar: `PanelFilters.tsx` confirmed `flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end`
      with every control wrapper `w-full ... sm:w-48`/`sm:w-40` — full-width stacked below `sm`, sized row
      at `sm+`.
- [ ] 8.2.7 **OPEN — requires a real 375px browser render, not available in this environment.** The
      button-wrap fix (`KanbanCardActions.tsx`'s `grid-cols-2` + `col-span-2` Iniciar) was verified via
      class math only (per ADR-C's own stated determinism from ~180px up, comfortably covering the ~319px
      mobile single-column case) — not an actual rendered check. Recommend a manual QA pass before merge.

### 8.3 Behavior regression (CRITICAL — JSX was rewritten across all six files; behavior must be
byte-identical per D1)

- [x] 8.3.1 Iniciar on a `pendiente` card: `KanbanCardActions.tsx`'s `handleIniciar` re-read this run —
      `POST` via `iniciarOrdenTrabajo`, `onActionSuccess()` fired before navigation, `router.push` to
      `/ordenes-trabajo/:id/trabajo`; no confirm dialog. Unchanged from PR2.
- [x] 8.3.2 Iniciar on `en_proceso`/`terminado`: non-`pendiente` branch is pure `router.push`, no API call.
      Unchanged from PR2.
- [x] 8.3.3 Iniciar absent on `cancelado`: `{orden.estado !== 'cancelado' && (...)}` guard confirmed intact;
      only Editar + Desactivar render. Unchanged from PR2.
- [x] 8.3.4 Iniciar failure path: `catch` calls `showError`, `setIniciando(false)`, `return` (no
      navigation). Unchanged from PR2.
- [x] 8.3.5 Editar: plain `<Link href={...editar/:id}>`, no confirm, no side effect. Unchanged from PR2.
- [x] 8.3.6 Desactivar confirm: `handleDesactivar` re-read this run — `showConfirm` → full 9-field object +
      `activo: false` → `updateOrdenTrabajo` → `showSuccess` → `onActionSuccess()`. Unchanged from PR2.
- [x] 8.3.7 Desactivar cancel: `if (!confirmed) return;` before any API call. Unchanged from PR2.
- [x] 8.3.8 Filter reactivity: `page.tsx`'s `loadPanel` effect confirmed still keyed on
      `[estado, mecanicoId, prioridad, datePreset, customDesde, customHasta]` (6 deps, unchanged from PR2).
- [x] 8.3.9 Workload independence: `loadWorkload` effect confirmed still has an empty deps array `[]`.
- [x] 8.3.10 State-box refactor safety: both ternary chains' conditions in `page.tsx`
      (`loading ? … : error ? … : !result || result.data.length === 0 ? … : (<KanbanBoard .../>)` and the
      workload equivalent) confirmed unchanged from PR2; only `<PanelStateBox>` JSX inside each branch.

### 8.4 Diff-empty / build guards (design §10.4)

- [x] 8.4.1 `git diff main...feat/panel-estetica-polish -- client/package.json` — empty. No icon/animation
      library added.
- [x] 8.4.2 `git diff main...feat/panel-estetica-polish -- client/tailwind.config.ts` — empty (D8).
- [x] 8.4.3 `git diff main...feat/panel-estetica-polish -- server/` and `-- client/app/lib/` — both empty.
      Endpoints and client-API contracts untouched.
- [x] 8.4.4 `git diff main...feat/panel-estetica-polish -- "client/app/(dashboard)/ordenes-trabajo/page.tsx"`
      — empty (D7 scope guard).
- [x] 8.4.5 `git diff main...feat/panel-estetica-polish --stat` confirmed only 6 files changed across all 3
      PRs, all under `client/app/(dashboard)/ordenes-trabajo/panel/` (`KanbanBoard.tsx`,
      `KanbanCardActions.tsx`, `KanbanColumn.tsx` (new), `KanbanMobileTabs.tsx` (new), `PanelStateBox.tsx`
      (new), `page.tsx`), plus this run's 3 additional modified files (`PanelStats.tsx`,
      `PanelFilters.tsx`, `MecanicosWorkload.tsx`) — all 9 total files are under `panel/`. No dark-mode
      change leaked outside the panel.
- [x] 8.4.6 `npm run build` passed in both `client` (`✓ Generating static pages (24/24)`,
      `/ordenes-trabajo/panel` compiles at 8.44 kB, no new TS/ESLint errors attributable to panel files)
      and `server` (`nest build` completed with no errors).

## Phase 9: Sign-off

- [x] 9.1 Walked `proposal.md`'s Success Criteria checklist end-to-end (see final apply-progress/report for
      the full item-by-item walk). All items confirmed EXCEPT the two live-browser-only checks (8.2.1,
      8.2.2, 8.2.7's underlying criteria: mobile tab interaction and the 375px card-action wrap), which
      remain statically-verified-only and are flagged as an open manual-QA follow-up, consistent with
      proposal.md's own named "Known Gaps / Accepted Tradeoffs" (no automated visual regression / E2E
      coverage; manual/visual verification is the accepted standard for this change). All behavior,
      diff-empty, dark-mode-coverage, and build criteria are fully confirmed.
- [x] 9.2 Walked the Rollback Plan in `proposal.md` — confirmed accurate and executable as written: `git
      revert` (or piecemeal restoration) of the 3 commits (PR1 `KanbanBoard.tsx` rewrite + 2 new files;
      PR2 `PanelStateBox.tsx` + `KanbanCardActions.tsx` + `page.tsx` wiring; PR3 `PanelStats.tsx` +
      `PanelFilters.tsx` + `MecanicosWorkload.tsx` dark/grid/icon polish) fully restores the six panel
      components' pre-change JSX/classes and removes the three new sibling files with no leftover
      references — no other file in the repo imports from `panel/`'s internals outside `page.tsx`'s public
      component imports, which are unaffected by rollback.
