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

- [ ] 5.1 Change the tile grid container to `grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5`
      (design §3.1's math: 5 is prime, so only 1-col or 5-col wraps with zero orphan; `sm:grid-cols-3`
      gives a 3-over-2 split, materially better than the current 2-2-1).
- [ ] 5.2 Update `ESTADO_BADGE_CLASSES` and the inline Total/Mecánicos badge classes with the §1.2 dark
      pairs exactly per design §3.2's code block.
- [ ] 5.3 Add an `icon: JSX.Element` field per `Figure` (design §3.3's table: `SquaresIcon` for Total
      de órdenes, `ClockIcon` for Pendientes, `WrenchIcon` for En proceso, `CheckCircleIcon` (reused) for
      Terminados, `UsersIcon` for Mecánicos trabajando) and an `iconClass` accent color per figure
      (`text-{c}-500 dark:text-{c}-400`, or `text-stone-400 dark:text-stone-500` for Total); declare the 4
      new icon components (`SquaresIcon`, `ClockIcon`, `WrenchIcon`, `UsersIcon`) and reuse
      `CheckCircleIcon`'s exact path from `clientes/page.tsx`, per design §8's path table, all
      `h-5 w-5 shrink-0`.
- [ ] 5.4 Restructure the tile top row to `flex items-center justify-between gap-2` (badge left, icon
      right) and apply the tile shell dark pair (`dark:border-stone-700 dark:bg-stone-900`), number dark
      pair (`dark:text-stone-50`), unit dark pair (`dark:text-stone-400`) exactly per design §3.4's code
      block.

## Phase 6: `PanelFilters.tsx` — Mobile Stacking + Dark

Satisfies spec requirements: "Filter Bar Stacks Vertically on Mobile", "Full Dark Mode Coverage, Scoped
to the Panel".

Independent of Phases 1-5 — can run in parallel with any of them.

- [ ] 6.1 Replace the single `flex flex-wrap items-end gap-4` row with `flex flex-col gap-4 sm:flex-row
      sm:flex-wrap sm:items-end` (design §4.1, mirroring `clientes/page.tsx:306`'s pattern — auto-flow
      instead of a fixed grid template, since the panel has up to 6 controls vs. Clientes' 3).
- [ ] 6.2 Each control wrapper drops its fixed mobile width and applies it only at `sm`: Mecánico →
      `w-full space-y-1 sm:w-48`; Estado / Prioridad / Fecha / Desde / Hasta → `w-full space-y-1 sm:w-40`
      (design §4.1).
- [ ] 6.3 Container dark pair: `dark:border-stone-700 dark:bg-stone-900` on the existing `rounded-xl
      border border-stone-200 bg-white p-4 shadow-sm` container (design §4.2).
- [ ] 6.4 Add `dark:text-stone-300` to all 5 filter labels' existing `text-sm font-medium text-stone-700`
      classes (design §4.2).
- [ ] 6.5 Update the shared `selectClassName` string to the full light+dark spec from design §4.2 (applied
      to all 4 `<select>` elements and both `<input type="date">`): background, border, text, and both
      light/dark focus-ring pairs (`focus:ring-rose-100` / `dark:focus:ring-rose-500/30`) — confirm the
      focus ring stays visible in dark mode.

## Phase 7: `MecanicosWorkload.tsx` — Grid Tuning + Dark (incl. Load Bar)

Satisfies spec requirements: "Even Grid Wrapping on Mobile", "Full Dark Mode Coverage, Scoped to the
Panel", "Restrained Icon Usage, No New Dependency".

Independent of Phases 1-6 — can run in parallel with any of them.

- [ ] 7.1 Confirm the grid ladder (`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`) is **kept
      unchanged** (design §7.1: a CSS grid does not stretch a lone trailing item, unlike a flex row, so no
      column-count change is needed here — only dark classes and the heading icon are added).
- [ ] 7.2 Add `ChartBarIcon` (new, path per design §8 table) to the "Carga por mecánico" heading, with
      `text-stone-400 dark:text-stone-500`, and add `dark:text-stone-200` to the heading text (design
      §7.2).
- [ ] 7.3 Add card shell dark pair (`dark:border-stone-700 dark:bg-stone-900`), mechanic name dark pair
      (`dark:text-stone-200`), count dark pair (`dark:text-stone-50`), unit-label dark pair
      (`dark:text-stone-400`) exactly per design §7.2's code block.
- [ ] 7.4 Load-bar track: add `dark:bg-stone-800` to the existing `bg-stone-100` track. **Per ADR-D, the
      gradient fill (`bg-gradient-to-r from-rose-500 to-red-400`) gets no dark override** — leave it
      unchanged; it is deliberately kept identical because it already reads clearly against both the dark
      track and the `gray-950` shell. The `style={{ width: ... }}` inline percentage and
      `m.percentage`/`m.count`/`mecanicoLabel` logic are untouched.
- [ ] 7.5 Add `dark:text-stone-400` to the percentage caption (design §7.2).

## Phase 8: Manual Verification

Maps 1:1 to design.md §10's four testing tables. Per `openspec/config.yaml` (`test_command: ""`),
verification is manual — via the dev server, a real 375px viewport, dark-mode toggle, Network tab
inspection, and a build check. Depends on Phases 1-7 being complete.

### 8.1 Dark-mode toggle — surface by surface (design §10.1)

- [ ] 8.1.1 Toggle dark mode via the Header `ThemeToggle` and inspect the page header (h1 + subtitle):
      `text-stone-50` / `text-stone-400`, legible on `gray-950`.
- [ ] 8.1.2 Inspect all 5 stat tiles: `bg-stone-900` card, `border-stone-700`, badge
      `bg-{c}-500/15 text-{c}-300`, number `text-stone-50`, unit `text-stone-400`, tile icon tinted per
      §3.3's table.
- [ ] 8.1.3 Inspect the filter container + labels + all 6 controls: `bg-stone-900` container, labels
      `text-stone-300`, inputs `bg-stone-900 border-stone-700 text-stone-200`, focus ring `rose-500/30`
      visible on focus.
- [ ] 8.1.4 Force the capped banner (narrow filters past the cap) and confirm `amber-500/10` bg,
      `amber-300` text.
- [ ] 8.1.5 Inspect Kanban columns (all 4 estados, both desktop and mobile trees): tinted
      `bg-{c}-500/10` container, `border-{c}-500/20`, title `text-{c}-300`, count
      `bg-{c}-500/15 text-{c}-300`.
- [ ] 8.1.6 Inspect Kanban cards: `bg-stone-900`, `border-stone-700`, strong text `stone-100`, body
      `stone-300`, service pills `bg-stone-800 text-stone-300`, Ingreso line `stone-500`.
- [ ] 8.1.7 Inspect card action buttons: Iniciar gradient unchanged and legible (ADR-D); Editar
      `border-stone-700 text-stone-300`; Desactivar `border-rose-500/30 text-rose-300`.
- [ ] 8.1.8 Inspect the mobile tab row: active tab `bg-stone-900 border-rose-500/40 text-stone-50`;
      inactive `bg-stone-800 text-stone-400`; count pills colored per estado.
- [ ] 8.1.9 Inspect the workload heading + cards: heading `text-stone-200` + icon; cards `bg-stone-900`;
      track `bg-stone-800`; **gradient fill legible on the dark track** (ADR-D); caption `text-stone-400`.
- [ ] 8.1.10 Trigger all three `PanelStateBox` variants (loading/error/empty — via offline network and
      an over-narrow filter combination) for both the panel and workload sections: dark card/border/text
      pairs render; spinner `border-t-rose-500` visible; error box `red-500/10`.

### 8.2 Layout / responsive (design §10.2)

- [ ] 8.2.1 At a real 375px viewport, confirm the mobile tab switcher: 2×2 tab grid + one visible column;
      default active tab is **Pendiente**; each tab shows the correct count; tapping a tab swaps to that
      estado's column; no horizontal-scroll sliver anywhere on the page.
- [ ] 8.2.2 Change a panel filter and confirm the board re-fetches, all four tabs' counts update from the
      new response, and the active tab **stays selected** (does not reset) — per spec "Mobile Tab State Is
      Ephemeral".
- [ ] 8.2.3 At ≥1024px (`lg`), confirm the 4-column grid renders with **no horizontal scroll** at any
      width from `lg` up through `xl` and beyond (ADR-E's math check).
- [ ] 8.2.4 At 375px confirm the 5 stat tiles stack 1-col with no 2-2-1 orphan; at `sm` confirm a 3-over-2
      split; at `lg` confirm a single row of 5.
- [ ] 8.2.5 With an odd mechanic count, confirm the workload grid wraps with no stretched trailing card at
      2-col mobile / 3-col `sm` / 4-col `lg`.
- [ ] 8.2.6 At 375px confirm all 6 filter controls stack full-width; at `sm+` confirm they lay out
      horizontally and wrap gracefully.
- [ ] 8.2.7 **Live 375px render check (per design §6.3's explicit callout — the button-wrap risk was
      assessed from class math, not a live render).** In the mobile single column, confirm Iniciar renders
      as a full-width top row and Editar+Desactivar share the bottom row with **no 2+1 awkward wrap**; on
      a `cancelado` card confirm only Editar+Desactivar render, filling one clean row.

### 8.3 Behavior regression (CRITICAL — JSX was rewritten across all six files; behavior must be
byte-identical per D1)

- [ ] 8.3.1 Iniciar on a `pendiente` card: `POST /ordenes-trabajo/:id/iniciar` fires, panel re-fetches
      (`GET /ordenes-trabajo/panel`), navigates to `/ordenes-trabajo/:id/trabajo`; no confirm dialog.
- [ ] 8.3.2 Iniciar on `en_proceso`/`terminado` cards: **no** iniciar request, no 409; navigates straight
      to `/…/trabajo`.
- [ ] 8.3.3 Iniciar absent on `cancelado` cards: the button is not rendered; only Editar + Desactivar.
- [ ] 8.3.4 Iniciar failure path: `showError` toast, **no** navigation, **no** re-fetch.
- [ ] 8.3.5 Editar: `<Link>` navigates to `/ordenes-trabajo/editar/:id`; no confirm dialog, no side
      effect.
- [ ] 8.3.6 Desactivar confirm: `PATCH /ordenes-trabajo/:id` with the **full** field set + `activo:false`
      (inspect the request body), success toast, panel re-fetches, card vanishes.
- [ ] 8.3.7 Desactivar cancel: **no** PATCH, card unchanged.
- [ ] 8.3.8 Filter reactivity: `loadPanel` still keyed on all 6 deps; stats react to filter changes.
- [ ] 8.3.9 Workload independence: `loadWorkload` still fires once on mount, unaffected by filter changes.
- [ ] 8.3.10 State-box refactor safety: both ternary chains' conditions and `loadPanel`/`loadWorkload` are
      unchanged; only the rendered JSX (now `<PanelStateBox>`) differs (spec: "Unified Loading/Error/Empty
      State Presentation").

### 8.4 Diff-empty / build guards (design §10.4)

- [ ] 8.4.1 `git diff client/package.json` is empty — no icon/animation library added.
- [ ] 8.4.2 `git diff client/tailwind.config.ts` is empty (D8 — no design-token layer).
- [ ] 8.4.3 `git diff server/` and `git diff client/app/lib/*.ts` are empty — endpoints and client-API
      contracts untouched.
- [ ] 8.4.4 `git diff client/app/(dashboard)/ordenes-trabajo/page.tsx` (the list page) is empty (D7 scope
      guard).
- [ ] 8.4.5 Confirm only files under `client/app/(dashboard)/ordenes-trabajo/panel/` changed — no dark
      mode changes leaked outside the panel.
- [ ] 8.4.6 `npm run build` passes in both `client` and `server` (per `openspec/config.yaml`'s
      `verify.build_command`), with no new type errors.

## Phase 9: Sign-off

- [ ] 9.1 Walk `proposal.md`'s Success Criteria checklist end-to-end and confirm each item: all six
      components are visually polished within the confirmed design language; every panel surface has a
      correct dark variant; the mobile tab switcher shows one column at a time defaulting to Pendiente;
      desktop keeps the multi-column layout at `lg`+; layout selection is CSS-only with the active-tab
      selection as the only new JS state; stats/workload grids wrap evenly and the filter bar stacks on
      mobile; the three card actions lay out cleanly at 375px (verified in a real browser); restrained
      inline SVG icons were added with no icon library; the state boxes are unified with fetch logic
      untouched; every action behaves byte-for-byte as before; no new data/endpoint/DTO/dependency was
      added and the listed files are diff-empty; no dark-mode change leaked outside the panel; the change
      is reversible per the Rollback Plan.
- [ ] 9.2 Walk the Rollback Plan in `proposal.md` and confirm it is accurate and executable as written:
      restoring the six panel components to their current JSX/classes (including reverting
      `KanbanBoard.tsx` to the single horizontal-scroll multi-column layout and removing the `hidden
      lg:flex`/`flex lg:hidden` fork and the active-tab state), deleting the three new sibling components
      (`KanbanMobileTabs.tsx`, `PanelStateBox.tsx`, `KanbanColumn.tsx`) and re-inlining the state boxes and
      card/column markup if the shared helpers are removed, and removing all added `dark:` classes and
      inline icon components from the six files — confirm this leaves the panel fully functional with its
      pre-change appearance and no leftover references to the deleted files.
