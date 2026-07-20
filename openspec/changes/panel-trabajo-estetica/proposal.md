# Proposal: Visual/aesthetic redesign of `/ordenes-trabajo/panel` (desktop + mobile, dark mode)

## Intent
The Panel de Trabajo (`/ordenes-trabajo/panel`) is now functionally complete — it shows a filter-reactive stats row, an estado-grouped Kanban board with per-card actions (Iniciar / Editar / Desactivar), a filter bar, and a per-mechanic "Carga por mecánico" workload section. But visually it is unfinished, and on mobile it is actively rough:

- The Kanban board uses `overflow-x-auto` with `min-w-[260px]` columns and no scroll affordance. On a 375px phone (~343px of content width after the dashboard shell's `p-4` padding) the second column peeks in as a ~67px sliver, reading as a rendering glitch, not an intentional "swipe for more" pattern.
- The stats row (`grid-cols-2`) breaks 5 tiles into an unbalanced 2-2-1 split on mobile; the lone last tile stretches full-width.
- The three inline card actions (`flex-1` inside `flex flex-wrap`) risk wrapping into a 2+1 layout inside a narrow column.
- The filter bar packs up to 6 fixed-width controls into one `flex flex-wrap` row instead of stacking cleanly like the Clientes page's filter panel does.
- **Dark mode is real but unwired here.** The app has a working `ThemeProvider`/toggle and `darkMode: 'class'`, but the panel's content components carry almost zero `dark:` classes — toggling dark mode leaves light cards floating on the dashboard's dark shell (`bg-gray-950`), a visibly broken experience.
- The loading/error/empty state boxes are duplicated near-verbatim twice in `page.tsx`.

This change is a **pure design/UX pass**: make the panel look professional and premium on both desktop and mobile, add full dark-mode coverage across every panel component, and restructure the Kanban's mobile layout — **without changing any data, endpoint, or action behavior**. Every existing action (Iniciar's dual-behavior branch, Desactivar's confirm + full-payload PATCH, Editar's plain link, the post-action whole-panel re-fetch, filter-reactive stats, the filter-independent workload section) MUST keep working byte-for-byte as it does today. Only presentation (JSX structure/classes) and one new piece of purely-visual UI state (the mobile Kanban active-tab selection) change.

Success looks like: on desktop the panel reads as a polished, cohesive premium surface; on a phone the Kanban shows one column at a time via a clear tab/segmented-control switcher (each tab carrying its count), the stats and workload grids wrap evenly, the filter bar stacks vertically, and the card actions no longer wrap awkwardly; and toggling dark mode renders every panel surface — backgrounds, borders, text, badges, buttons, and the workload bar — correctly against the dark shell. No action changes behavior, no new dependency is added, and dark-mode fixes stay scoped to the panel only.

## Scope

### In Scope (per component)

- **`page.tsx` (container).**
  - Section spacing/rhythm polish; consistent vertical gaps between header → stats → filters → board → workload.
  - **Unify the three duplicated loading/error/empty state boxes** (currently rendered twice — once for the panel, once for workload) into **one shared presentational helper component** (e.g. `PanelStateBox` / `StateMessage`) declared under `panel/`. This is a presentational refactor only: it MUST NOT touch the two fetch lifecycles (`loadPanel`, `loadWorkload`), the ternary chains' branching conditions, or any state variable — only the JSX each branch renders.
  - Full `dark:` coverage on the page header and any container-level surface.
- **`PanelStats.tsx`.**
  - Tile visual polish (spacing, badge/number hierarchy, shadow/border refinement) within the existing card shell language.
  - **Grid breakpoint fix** so 5 tiles wrap evenly on mobile instead of the 2-2-1 split (e.g. tune the base/`sm`/`lg` column counts so no tile is orphaned; the exact column ladder is a `sdd-design` detail).
  - Full `dark:` coverage on tile backgrounds, borders, badges, numbers, and unit labels.
- **`PanelFilters.tsx`.**
  - **Mobile stacking fix**: switch the single `flex flex-wrap` row to a `flex flex-col ... sm:flex-row sm:items-end` responsive pattern (mirroring `clientes/page.tsx`'s filter panel) so controls stack full-width on mobile and lay out horizontally on wider screens.
  - Control/spacing polish; full `dark:` coverage on the container, labels, and the shared `selectClassName` inputs (background, border, text, focus ring must all read in dark mode).
- **`KanbanBoard.tsx` (largest scope surface).**
  - **Responsive layout fork.** Desktop keeps and visually polishes the existing multi-column side-by-side board. Below the chosen breakpoint the board switches to a **tab/segmented-control pattern**: one column visible at a time, with a row of tabs/pills to switch between Pendiente / En proceso / Terminado / Cancelado, each tab carrying a **count pill** (mirroring the existing per-column count) so column sizes are visible without switching.
  - Column and card visual polish (headers, count pills, card shell, badges, service pills, footer) with full `dark:` coverage.
  - Optional desktop scroll affordance polish (the desktop board may still scroll horizontally if columns exceed width; a subtle edge/scroll treatment is allowed but not required).
- **`KanbanCardActions.tsx`.**
  - **Button-wrap fix** so the three actions lay out cleanly inside a narrow column (via tighter sizing, `min-w-0` handling, and/or icon-assisted labels — exact fix decided in `sdd-design`). The three actions, their handlers, guards, and `Link` navigation MUST stay byte-for-byte identical in behavior.
  - Button visual polish and full `dark:` coverage on all three buttons (the gradient Iniciar CTA, the outlined Editar link, the outlined Desactivar button) including hover/focus/disabled states.
- **`MecanicosWorkload.tsx`.**
  - Card and load-bar visual polish; **grid breakpoint tuning** so odd mechanic counts wrap acceptably.
  - Full `dark:` coverage on the section heading, cards, mechanic names, counts, the load-bar **track and gradient fill**, and the percentage caption.

### Icons decision (resolved in this proposal — see D6)
**Introduce a small, restrained set of inline SVG icons** following the established house convention (hand-declared local SVG components per file, Heroicons-style `strokeWidth={1.5}` / `viewBox="0 0 24 24"` paths, matching `clientes/page.tsx`'s `PencilIcon`/`SearchIcon`). Icons are used to elevate the premium feel of section headers, stat badges, and the card action buttons — **not** as a decorative flood. No icon library is added.

### Out of Scope / Non-Goals
- **No behavior change to any action.** Iniciar's dual-behavior branch (pendiente → cascade + navigate; other estados → navigate only), the `cancelado` exclusion, Desactivar's `showConfirm` → full-object `{ ...fields, activo: false }` PATCH → toast, Editar's plain `<Link>`, and the post-action whole-panel `loadPanel()` re-fetch MUST all be preserved byte-for-byte in behavior. Only their JSX/classes change.
- **No new data, endpoint, DTO, guard, or backend change of any kind.** `GET /ordenes-trabajo/panel`, `GET /ordenes-trabajo/panel/mecanicos`, and every server-side file stay untouched. This change is 100% frontend/presentation.
- **No change to the two fetch lifecycles or filter/stats/workload logic.** `loadPanel`'s 6-dep keying, `loadWorkload`'s fetch-once-on-mount, the filter-reactive stats, and the filter-independent workload section keep their exact data behavior.
- **No new dependency.** No animation, icon, or utility library (`framer-motion`, `lucide-react`, `heroicons`, `clsx`, `tailwind-merge`, `class-variance-authority`, etc.). Any transition/animation MUST use Tailwind's built-in transition utilities or simple CSS only.
- **No JS-based media-query hook** (`useMediaQuery`/`window.matchMedia`) for choosing which layout renders — the mobile-vs-desktop layout switch is CSS-only (see D2 / D3).
- **No dark-mode work outside the panel.** Sibling pages (Clientes, Vehículos, list page, etc.) keep their current partial dark-mode state; fixing them app-wide is explicitly out of scope.
- **No design-token layer.** `tailwind.config.ts` is not extended with new semantic tokens; the redesign uses stock Tailwind utilities and the two existing card conventions, consistent with every prior panel change (exploration Approach 3 is declined).
- **No change to the list page** (`ordenes-trabajo/page.tsx`) or any other route.
- **No new backend, migration, schema, or data change** — there is nothing to migrate; this is presentation only.

## Capabilities
### New Capabilities
- None. No new capability boundary; this is a presentational refresh of the existing `ordenes-trabajo-panel` capability.

### Modified Capabilities
- `ordenes-trabajo-panel`: the panel gains a polished, dark-mode-complete visual layer and a **responsive Kanban layout** — multi-column on desktop, a single-column tab/segmented-control switcher on mobile (each tab showing its estado count). All action semantics, fetch behavior, filter reactivity, and endpoints are unchanged. The spec delta is presentational: it adds requirements for full panel dark-mode coverage and the responsive mobile Kanban tab pattern, and it MUST state explicitly that no existing action behavior, fetch lifecycle, or endpoint changes.

## Approach
**Frontend-only visual/UX pass (exploration's Approach 1 as the floor + Approach 2 for the Kanban mobile fork; Approach 3 declined).** The redesign layers three coordinated efforts, all confined to the six `panel/` component files (plus one new small sibling component for the shared state box, and optionally one for the mobile tabs):

1. **Polish everywhere** — spacing, typography hierarchy, shadow/border/radius refinement within the confirmed `rounded-xl` + `border-stone-200` + `shadow-sm` card language and the rose/red accent, plus restrained inline icons (D6). Unify the duplicated state boxes into one shared presentational helper.
2. **Fix the concrete mobile pain points** — even stats/workload grid wrapping, filter-bar `flex-col → sm:flex-row` stacking, and the card-action button-wrap fix.
3. **Restructure the Kanban for mobile** — the responsive fork below.

### Mobile Kanban responsive fork (the core structural change)

- **Breakpoint: `lg`.** The tab-switcher renders below `lg` (`< 1024px`); the multi-column side-by-side board renders at `lg` and up. Rationale: the exploration shows even a single `min-w-[260px]` column plus gap does not comfortably fit multiple columns until well past tablet width — four 260px columns need ~1100px+ before they stop scrolling awkwardly. `md` (768px) is too narrow to show even two columns comfortably, so tablets are better served by the tab switcher. This is consistent with the app's breakpoint usage (`(dashboard)/layout.tsx`'s `md:p-6`, and the dashboard's own `md`/`lg` responsive shell). The exact breakpoint (`lg` vs `md`) is fixed here as **`lg`**; `sdd-design` may only adjust it with explicit justification if a real-device check contradicts the width math.
- **CSS-only layout selection, JS-only for the active-tab state (D2).** Which *layout* renders — mobile-tabs vs. desktop-columns — is chosen purely with Tailwind's `hidden lg:flex` / `flex lg:hidden` visibility toggling. Both DOM trees are rendered and CSS hides the inactive one at the breakpoint. This is the standard no-JS-media-query approach and **avoids the hydration-mismatch risk** a `window`-width check would introduce (SSR renders one width, client another). The **only** JS state added is the active-tab selection (`useState<Estado>`), which affects nothing but which single column is shown inside the already-CSS-hidden mobile tree.
- **New component (D4): `KanbanMobileTabs`** (or equivalent), a small sibling under `panel/` owning the tabs row + active-tab state and rendering the single visible column via the same card components. `KanbanBoard.tsx` branches its render into two JSX trees gated by `hidden`/`flex` at `lg`: the existing desktop multi-column tree, and the mobile tab tree. Column/card rendering logic is shared between the two trees so there is no second copy of card markup drift.
- **Tab defaulting & state persistence (D5).** The active tab **defaults to `pendiente`** (the leftmost/first-priority column and the supervisor's primary "what needs starting" focus); if desired, `sdd-design` may refine this to "first non-empty column" but `pendiente` is the fixed default. The active-tab selection is **ephemeral component state** — it does **not** persist across navigation, and it resets on remount. It also does **not** need to survive filter changes: because the board re-fetches on filter change but the tab set (the four estados) is fixed, the selected tab stays valid and its count simply updates from the new response. No URL param, no `localStorage`, no cross-session persistence — this is purely-visual local UI state, deliberately kept minimal.

### Dark mode
Every panel component gets a full `dark:` pass so every visible surface reads correctly against the dashboard's dark shell: card/tile/column backgrounds (`dark:bg-*`), borders (`dark:border-*`), all text tiers, colored status badges/pills (dark-appropriate tints, e.g. `dark:bg-amber-500/15 dark:text-amber-300`-style rather than the light `bg-amber-100 text-amber-700`), the three action buttons' fills/outlines/hover/focus, and the workload bar's track and gradient fill. Focus rings on filter inputs must remain visible in dark mode. Exact dark shades are a `sdd-design` detail; the requirement is full coverage with correct contrast, scoped to the panel only.

### No new dependency
All transitions/animations use Tailwind's built-in `transition`, `duration-*`, `ease-*`, and `hover:`/`focus:` utilities (and the two existing `slide-in-*` keyframes if useful) — no library. Icons are hand-declared inline SVG per the house convention.

## Decisions (documented for later review/override)
- **D1 — Pure design/UX pass; zero behavior change.** Every action's handler logic, guards, API calls, the post-action re-fetch, the two fetch lifecycles, filter reactivity, and both endpoints stay byte-for-byte identical in behavior; only JSX/classes and the new mobile active-tab UI state change. *Rationale:* fixed constraint from the user — "look different, behave identically."
- **D2 — Mobile Kanban becomes a tab/segmented-control switcher (one column at a time); desktop keeps the polished multi-column layout.** *Rationale:* fixed product decision. The horizontal-scroll sliver is the single biggest evidence-backed mobile pain point; a tab switcher is a materially better mobile interaction than scroll-affordance polish. Each tab carries its estado count so column sizes are visible without switching.
- **D3 — Layout selection is CSS-only (`hidden lg:flex` / `flex lg:hidden`); no JS media-query hook.** The active-tab selection is the *only* new JS state, and it only affects which column shows inside the already-hidden mobile tree. *Rationale:* fixed decision to avoid a hydration-mismatch risk and to honor the no-new-dependency / no-new-JS-primitive posture; a `window`-width check would render differently on server vs. client.
- **D4 — New sibling component(s) under `panel/` for the mobile tabs (`KanbanMobileTabs` or similar) and a shared state box (`PanelStateBox` or similar); no shared module extracted outside `panel/`.** Card/column rendering is shared between the desktop and mobile trees to avoid markup drift. *Rationale:* continues the panel's "declare per surface, keep the blast radius inside `panel/`" convention; keeps the change reviewable and self-contained.
- **D5 — Active tab defaults to `pendiente`; state is ephemeral (no persistence across navigation, filters, or sessions).** *Rationale:* fixed product decision; the tab set (four estados) is fixed and always valid after a filter re-fetch, so persistence adds complexity with no user benefit. `sdd-design` may only refine the default to "first non-empty column," not add persistence.
- **D6 — Introduce restrained inline SVG icons (house convention) on section headers, badges, and action buttons; no icon library.** *Rationale:* fixed product decision — icons materially lift the "premium" feel and the inline-SVG-per-file convention already exists app-wide; adding a package would violate the verified no-new-dependency pattern.
- **D7 — Full dark-mode coverage scoped to the panel only.** Sibling pages keep their current partial dark state. *Rationale:* fixed constraint; fixing dark mode app-wide is a separate, larger change this one deliberately does not take on. The intentional consequence (the panel is more dark-polished than its neighbors) is an accepted, named tradeoff.
- **D8 — No design-token layer; `tailwind.config.ts` unchanged.** *Rationale:* fixed decision (exploration Approach 3 declined); stock Tailwind utilities plus the two existing card conventions have worked across 5+ pages, and a token layer for a single-page change is speculative overhead.
- **D9 — Loading/error/empty state boxes unified into one shared presentational helper without touching fetch logic.** *Rationale:* removes near-verbatim duplication as part of the polish; strictly presentational, so the two fetch lifecycles and ternary conditions stay intact.

## Rollback Plan
This change is **frontend/presentation only** — no schema, migration, backend, endpoint, DTO, data, or client-API change — so rollback carries zero data-loss risk. However, it is more than a color swap: the Kanban mobile restructuring introduces a second layout tree and one new UI-state variable, and new sibling components are added. The rollback path is therefore explicit:

1. **Revert the PR** (cleanest path), or piecemeal:
2. Restore each of the six panel components (`page.tsx`, `PanelStats.tsx`, `PanelFilters.tsx`, `KanbanBoard.tsx`, `KanbanCardActions.tsx`, `MecanicosWorkload.tsx`) to their current JSX/classes — including reverting `KanbanBoard.tsx` to the **single horizontal-scroll multi-column layout** (removing the `hidden lg:flex` / `flex lg:hidden` fork and the active-tab state).
3. Delete the new sibling components added under `panel/` (`KanbanMobileTabs`/tab switcher, `PanelStateBox`/shared state box) and re-inline the two duplicated state boxes if the shared helper is removed.
4. Remove all added `dark:` classes and inline icon components from the six files.

Because no action handler, fetch lifecycle, client API function, backend endpoint, DTO, or the list page is modified, reverting cannot affect data, behavior, or any other route — the panel simply returns to its current appearance and mobile scroll behavior.

## Known Gaps / Accepted Tradeoffs
- **Panel is more dark-polished than its neighbors (D7).** Full panel dark mode against sibling pages' partial dark state is an intentional, scoped inconsistency, not an oversight — app-wide dark mode is a separate change.
- **Two rendered Kanban DOM trees on mobile+desktop (D3).** The CSS-hidden inactive tree costs a little extra DOM/markup versus a JS-swapped single tree, accepted to eliminate hydration-mismatch risk and stay JS-primitive-free.
- **No automated visual regression / E2E coverage.** Verification is manual/visual only, same as every prior panel change — including a real-device check of the mobile tabs and the card-action button-wrap fix.
- **The button-wrap risk was assessed from class math, not a live 375px render (exploration).** `sdd-apply`/`sdd-verify` MUST confirm the wrap actually occurs and the fix resolves it in a real browser before committing to the specific button layout.
- **A third small component family lives in `panel/` (D4).** Slightly more files, accepted to keep the blast radius inside `panel/` and avoid drift.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A behavior regression sneaks in while re-writing action button JSX (e.g. dropping the `cancelado` Iniciar guard, altering the Desactivar payload, or breaking the post-action re-fetch) | Med | D1 pins "byte-for-byte behavior"; `sdd-spec` encodes "no action behavior changes" as an explicit requirement; `sdd-verify` diffs handler logic and confirms Iniciar's branch, the `cancelado` exclusion, the Desactivar full-payload PATCH, and `loadPanel()` re-fetch are unchanged |
| Hydration mismatch if layout selection were done with a JS width check | Med | D3 mandates CSS-only `hidden`/`flex` layout toggling; only the active-tab selection is JS state, and it never affects SSR output |
| The state-box unification accidentally changes a ternary branch condition or fetch trigger | Low–Med | D9 scopes the refactor to JSX only; `sdd-verify` confirms `loadPanel`/`loadWorkload` and both ternary chains' conditions are untouched |
| Dark-mode tints have poor contrast against `bg-gray-950` (unreadable badges/text/bars) | Med | `sdd-design` specifies dark shades with contrast intent; manual visual check in dark mode across every surface, including the workload bar track/fill |
| Mobile tab-switcher chosen breakpoint (`lg`) is wrong on a real device | Low–Med | Breakpoint fixed at `lg` from width math; a real-device check in `sdd-apply`/`sdd-verify` can only move it with explicit justification |
| The card-action button-wrap "fix" doesn't actually resolve the wrap at 375px | Low–Med | Live 375px render check before finalizing the button layout; icon-assisted/tighter sizing tuned against a real viewport |
| Scope creep into other pages' dark mode or into a design-token layer | Low | D7 and D8 explicitly forbid both; out-of-scope list names them |
| A new dependency slips in for animation/icons | Low | D6/Non-Goals mandate Tailwind-built-in transitions and inline-SVG icons only; `sdd-verify` checks `client/package.json` is unchanged |

## Success Criteria
- [ ] All six panel components (`page.tsx`, `PanelStats.tsx`, `PanelFilters.tsx`, `KanbanBoard.tsx`, `KanbanCardActions.tsx`, `MecanicosWorkload.tsx`) are visually polished within the confirmed `rounded-xl` + `border-stone-200` + `shadow-sm` + rose/red accent design language.
- [ ] Every panel surface (backgrounds, borders, all text tiers, status badges/pills, the three action buttons, and the workload bar's track and gradient fill) has a correct, readable `dark:` variant against the dashboard's dark shell; toggling dark mode shows no light-mode-only surfaces on the panel.
- [ ] On mobile (below `lg`) the Kanban renders a tab/segmented-control switcher showing one estado column at a time; each tab carries its estado count; the active tab defaults to `pendiente`.
- [ ] On `lg` and up the Kanban keeps a polished multi-column side-by-side layout.
- [ ] The mobile-vs-desktop layout selection is CSS-only (`hidden lg:flex` / `flex lg:hidden`); no JS media-query hook or `window`-width check is introduced; the only new JS state is the active-tab selection.
- [ ] The stats grid and workload grid wrap evenly on mobile (no orphaned/stretched single tile), and the filter bar stacks vertically on mobile (`flex-col → sm:flex-row`).
- [ ] The three card actions lay out cleanly inside a narrow column at 375px with no awkward 2+1 wrap, verified in a real browser.
- [ ] Restrained inline SVG icons (house convention) are added to section headers/badges/buttons; no icon library is installed.
- [ ] The duplicated loading/error/empty state boxes are unified into one shared presentational helper under `panel/`, with the two fetch lifecycles and ternary conditions unchanged.
- [ ] Every action behaves byte-for-byte as today: Iniciar's dual-behavior branch + `cancelado` exclusion, Editar's plain `<Link>`, Desactivar's confirm + full-object `{ ...fields, activo: false }` PATCH + toast, and the post-action whole-panel `loadPanel()` re-fetch.
- [ ] No new data, endpoint, DTO, guard, backend file, migration, schema change, client API function, or dependency is added; `client/package.json`, `tailwind.config.ts`, all `client/app/lib/*.ts`, all server files, and the list page (`ordenes-trabajo/page.tsx`) are unchanged in the diff.
- [ ] No dark-mode changes are made to any page outside the panel.
- [ ] The change is frontend/presentation-only and reversible per the Rollback Plan (revert to the current appearance and single horizontal-scroll Kanban).
