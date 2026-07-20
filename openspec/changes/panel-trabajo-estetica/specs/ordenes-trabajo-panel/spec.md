# Delta for Órdenes de Trabajo Panel

## ADDED Requirements

### Requirement: Mobile Kanban Tab Switcher

Below the `lg` breakpoint (`< 1024px`), the Kanban board MUST render a tab/segmented-control switcher showing exactly one estado column's cards at a time, instead of the multi-column layout. All four tabs — Pendiente, En proceso, Terminado, Cancelado — MUST always be present regardless of which tab is active or how many cards each estado has. Each tab MUST display a count matching the number of cards currently in that estado's column. The active tab MUST default to `pendiente` on initial render of the mobile layout.

#### Scenario: Mobile board shows a tab switcher with all four estados

- GIVEN the viewport is below the `lg` breakpoint
- WHEN the Kanban board renders
- THEN a tab/segmented-control switcher is visible with four tabs labeled Pendiente, En proceso, Terminado, and Cancelado
- AND only one estado's cards are shown at a time

#### Scenario: Each tab carries a count matching its column

- GIVEN the viewport is below the `lg` breakpoint and the panel has loaded data with cards in multiple estados
- WHEN the tab switcher renders
- THEN each of the four tabs displays a count equal to the number of cards in that tab's estado, matching the desktop column's count for the same estado

#### Scenario: Active tab defaults to Pendiente on initial render

- GIVEN the viewport is below the `lg` breakpoint
- WHEN the Kanban board renders for the first time (initial mount)
- THEN the Pendiente tab is the active tab and its column's cards are the ones displayed

#### Scenario: Cancelado tab is present and selectable even with zero cards

- GIVEN the viewport is below the `lg` breakpoint and there are zero cards with `estado: 'cancelado'`
- WHEN the tab switcher renders
- THEN the Cancelado tab is still visible, shows a count of 0, and can be selected to show an empty column

### Requirement: Desktop Kanban Multi-Column Layout Preserved

At the `lg` breakpoint and up (`>= 1024px`), the Kanban board MUST render the existing multi-column side-by-side layout, with all four estado columns (Pendiente, En proceso, Terminado, Cancelado) visible simultaneously. No tab/segmented-control switcher MUST be shown at this breakpoint.

#### Scenario: Desktop board shows all four columns simultaneously

- GIVEN the viewport is at the `lg` breakpoint or wider
- WHEN the Kanban board renders
- THEN all four estado columns (Pendiente, En proceso, Terminado, Cancelado) are visible at the same time, side by side
- AND no tab/segmented-control switcher is shown

### Requirement: Layout Selection Is CSS-Only, No Hydration Risk

The choice between the mobile tab-switcher layout and the desktop multi-column layout MUST be driven purely by CSS breakpoint visibility utilities (e.g. `hidden lg:flex` / `flex lg:hidden`), not by a JavaScript `window`-width or media-query check (e.g. `window.matchMedia`, a `useMediaQuery` hook, or reading `window.innerWidth`). Both the mobile and desktop DOM trees MAY be rendered simultaneously with CSS hiding the inactive one. The only client-side UI state this capability introduces beyond the CSS toggle is which tab is active in the mobile tree; no new state MUST be introduced to decide which of the two layout trees is shown.

#### Scenario: No JS media-query hook is used to select the layout

- GIVEN this capability is implemented
- WHEN the panel's Kanban components are inspected
- THEN no `window.matchMedia`, `useMediaQuery`, `window.innerWidth`/`window.innerHeight` read, or resize-event listener is used to decide whether the mobile-tabs or desktop-columns tree renders
- AND the layout choice is expressed only through CSS breakpoint visibility classes

#### Scenario: Server-rendered and client-rendered markup match before hydration

- GIVEN this capability is implemented
- WHEN the page is server-rendered and then hydrated on the client without a viewport change in between
- THEN no hydration mismatch warning occurs that is attributable to the mobile-vs-desktop layout choice

### Requirement: Mobile Tab State Is Ephemeral

The active mobile tab selection MUST NOT persist across page navigation or across sessions: it MUST NOT be stored in the URL (query param or path segment) and MUST NOT be stored in `localStorage`, `sessionStorage`, or any other persistent storage. Changing a panel filter MUST update the counts shown on each tab to reflect the new filtered data, without resetting which tab is currently active, unless the component unmounts and remounts.

#### Scenario: Navigating away and back resets the active tab

- GIVEN the mobile tab switcher is showing a non-default active tab (e.g. En proceso)
- WHEN the user navigates away from the panel page and then navigates back to it
- THEN the active tab is reset to its default (Pendiente) rather than restoring the previously selected tab

#### Scenario: Changing a filter updates tab counts without changing the active tab

- GIVEN the mobile tab switcher has a non-default tab active (e.g. Terminado) and the panel has loaded data
- WHEN the user changes a panel filter and the panel re-fetches
- THEN the Terminado tab remains the active tab
- AND all four tabs' counts update to reflect the newly filtered data

#### Scenario: No URL or storage persistence of the active tab

- GIVEN this capability is implemented
- WHEN the active mobile tab is changed
- THEN the URL (query string and path) does not change as a result
- AND no entry related to the active tab is written to `localStorage` or `sessionStorage`

### Requirement: Full Dark Mode Coverage, Scoped to the Panel

Every visible surface across all six panel components — `page.tsx`'s container and state boxes, `PanelStats.tsx`'s stat tiles, `PanelFilters.tsx`'s filter bar controls, `KanbanBoard.tsx`'s columns/cards/tabs, `KanbanCardActions.tsx`'s three action buttons, and `MecanicosWorkload.tsx`'s workload cards and load bar — MUST render with a correct, readable dark-mode appearance (background, border, text, and any colored badge/pill/bar) when the application's dark mode is active. No unstyled light-mode-only surface (i.e. a surface that keeps its light-mode background/text/border with no `dark:` counterpart, resulting in unreadable or visually broken contrast against the dashboard's dark shell) MUST remain on the panel after this change. This requirement MUST NOT apply to, and MUST NOT require any change on, any page outside `client/app/(dashboard)/ordenes-trabajo/panel/`.

#### Scenario: All six panel components render correctly in dark mode

- GIVEN the application's dark mode is active
- WHEN the panel page is viewed, including its stats row, filter bar, Kanban board (columns, cards, and mobile tabs), card action buttons, and the mecánicos workload section
- THEN every one of these surfaces displays a dark-appropriate background, border, and text color with no unstyled light-mode surface visible

#### Scenario: The workload bar is readable in dark mode

- GIVEN the application's dark mode is active
- WHEN the "Carga por mecánico" section renders a mechanic's load bar
- THEN the bar's track and gradient fill are both rendered with dark-mode-appropriate colors that remain visually distinguishable from each other and from the surrounding card background

#### Scenario: Dark-mode changes do not extend beyond the panel

- GIVEN this capability is implemented
- WHEN any page outside `client/app/(dashboard)/ordenes-trabajo/panel/` is inspected in dark mode
- THEN its dark-mode appearance is unchanged from before this capability

### Requirement: Even Grid Wrapping on Mobile

On mobile viewport widths, the stats row (`PanelStats.tsx`, 5 tiles) and the mecánicos workload grid (`MecanicosWorkload.tsx`) MUST wrap so that no single tile/card is left alone as a visually orphaned, disproportionately stretched item at the end of the grid (i.e. no 2-2-1-style unbalanced split for the 5 stats tiles).

#### Scenario: Stats row does not produce an orphaned last tile on mobile

- GIVEN the viewport is a common mobile width (e.g. 375px)
- WHEN the stats row with its 5 tiles renders
- THEN the tiles wrap into a grid where no single tile is isolated as a full-width stretched row by itself in a way that breaks the visual rhythm of the grid (e.g. a 2-2-1 split)

#### Scenario: Workload grid wraps evenly regardless of mechanic count

- GIVEN the viewport is a common mobile width and the workload section has an odd number of mechanics
- WHEN the workload grid renders
- THEN the mechanic cards wrap in a balanced pattern without leaving a single orphaned stretched card

### Requirement: Filter Bar Stacks Vertically on Mobile

On mobile viewport widths, the filter bar's controls (`PanelFilters.tsx`) MUST lay out in a vertical stack, each control taking the full available width. At a wider breakpoint, the controls MUST switch to a horizontal row layout, mirroring the existing pattern used by the Clientes page's filter panel.

#### Scenario: Filter controls stack vertically on mobile

- GIVEN the viewport is a common mobile width (e.g. 375px)
- WHEN the filter bar renders
- THEN each filter control is displayed as a full-width block stacked vertically above the next, rather than wrapped side by side

#### Scenario: Filter controls lay out horizontally at a wider breakpoint

- GIVEN the viewport is at or above the breakpoint where the filter bar switches layout
- WHEN the filter bar renders
- THEN the filter controls are laid out in a horizontal row rather than stacked vertically

### Requirement: Card Actions Do Not Wrap Awkwardly on Mobile

The three Kanban card action controls (Iniciar trabajo, Editar, Desactivar, rendered by `KanbanCardActions.tsx`) MUST lay out inside a narrow mobile column without producing a broken or uneven wrap (such as two controls on one line and a third alone on the next line with mismatched width) at common mobile viewport widths (e.g. 375px).

#### Scenario: Card actions render cleanly at 375px

- GIVEN a Kanban card is rendered inside a column at a 375px viewport width
- WHEN the card's three action controls (Iniciar trabajo, Editar, Desactivar) render
- THEN the three controls lay out in a consistent, evenly-sized pattern with no control wrapping alone onto its own line at a mismatched width

#### Scenario: A card with only two visible actions still lays out cleanly

- GIVEN a `cancelado` card is rendered at a 375px viewport width (where the Iniciar action is not present per the existing "Iniciar Visibility Rule" requirement)
- WHEN the card's two remaining action controls (Editar, Desactivar) render
- THEN the two controls lay out cleanly without an awkward gap or misalignment

### Requirement: Restrained Icon Usage, No New Dependency

This capability MAY introduce inline SVG icons on section headers, badges, and/or action buttons, following the existing house convention of hand-declared, per-file inline SVG icon components (as used, for example, by `clientes/page.tsx`'s `PencilIcon`/`SearchIcon`). This capability MUST NOT introduce any new npm package (icon library, animation library, or CSS utility library) as a dependency of `client/package.json`.

#### Scenario: Any icons added are inline SVG components declared locally

- GIVEN this capability introduces one or more icons
- WHEN the icon's implementation is inspected
- THEN it is a hand-declared inline SVG component defined within the panel's own files, not imported from an icon library package

#### Scenario: No new package is added to client/package.json

- GIVEN this capability is implemented
- WHEN `client/package.json` is inspected
- THEN no new icon library, animation library, or CSS utility library dependency has been added

### Requirement: Unified Loading/Error/Empty State Presentation

The panel's and the mecánicos workload section's loading, error, and empty states MUST be rendered through one shared presentational component, rather than through two independently duplicated JSX implementations. This unification MUST be presentational only: the underlying conditions that trigger loading, error, or empty rendering for each of the two fetch lifecycles (`loadPanel` and `loadWorkload`) MUST remain exactly as they are today — no ternary branching condition or state variable driving these conditions changes as part of this requirement.

#### Scenario: Panel and workload sections share one state-rendering component

- GIVEN this capability is implemented
- WHEN `page.tsx` and the workload section's loading/error/empty rendering are inspected
- THEN both use the same shared presentational component to render their loading, error, and empty states, rather than two separately duplicated JSX blocks

#### Scenario: Loading/error/empty trigger conditions are unchanged

- GIVEN this capability is implemented
- WHEN the conditions that decide whether the panel section or the workload section is in a loading, error, or empty state are inspected
- THEN they are identical to the conditions used before this capability

### Requirement: No Action Behavior Change

The three Kanban card actions' underlying behavior MUST remain byte-for-byte identical to their pre-existing implementation after this change; only their visual presentation (markup, CSS classes, and/or icon usage) MUST differ. Specifically: the Iniciar action's dual-behavior branch (calling `POST /ordenes-trabajo/:id/iniciar` only when the card's `estado` is `pendiente`, navigating directly without an API call for other visible estados, and being absent entirely on `cancelado` cards) MUST be preserved; the Editar action's behavior as a plain navigation link with no confirmation dialog MUST be preserved; and the Desactivar action's confirm-dialog-then-full-object-PATCH-then-toast flow (including triggering the post-action panel re-fetch on success and making no API call on cancel) MUST be preserved.

#### Scenario: Iniciar's dual behavior is unchanged after the visual redesign

- GIVEN a card whose order has `estado: 'pendiente'`
- WHEN the user clicks Iniciar after this capability is implemented
- THEN `POST /ordenes-trabajo/:id/iniciar` is called exactly as it was before this capability, and on success the user is navigated to `/ordenes-trabajo/:id/trabajo` with the panel re-fetched, unchanged from the pre-existing behavior

#### Scenario: Editar remains a plain link with no confirmation

- GIVEN a card for a given order
- WHEN the user clicks Editar after this capability is implemented
- THEN the user is navigated to `/ordenes-trabajo/editar/:id` with no confirmation dialog shown, unchanged from the pre-existing behavior

#### Scenario: Desactivar's confirm-then-PATCH-then-toast flow is unchanged

- GIVEN a card for an active order
- WHEN the user clicks Desactivar and confirms after this capability is implemented
- THEN `PATCH /ordenes-trabajo/:id` is called with the order's full existing field set plus `activo: false`, a success notification is shown, and the panel re-fetches — identical to the pre-existing behavior

### Requirement: No Data or Fetch Behavior Change

This capability MUST NOT change `loadPanel`'s re-fetch-on-filter-change behavior, including its exact dependency set that triggers a re-fetch. This capability MUST NOT change `loadWorkload`'s fetch-once-on-mount behavior. This capability MUST NOT change the request or response contract of `GET /ordenes-trabajo/panel` or `GET /ordenes-trabajo/panel/mecanicos`. This capability MUST NOT change the post-action whole-panel re-fetch convention used after a successful Iniciar cascade or a successful Desactivar.

#### Scenario: loadPanel's dependency set and re-fetch trigger are unchanged

- GIVEN this capability is implemented
- WHEN the panel's filters are changed
- THEN `loadPanel` re-fetches exactly under the same conditions and with the same dependency set as before this capability

#### Scenario: loadWorkload still fetches only once on mount

- GIVEN this capability is implemented
- WHEN the panel page mounts and subsequently the user changes a panel filter
- THEN `loadWorkload` is called on mount and is not re-triggered by the filter change, unchanged from the pre-existing behavior

#### Scenario: Panel endpoints' contracts are unchanged

- GIVEN this capability is implemented
- WHEN `GET /ordenes-trabajo/panel` and `GET /ordenes-trabajo/panel/mecanicos` are inspected
- THEN their request parameters and response shapes are identical to their behavior before this capability

### Requirement: No New Dependency, No Backend Change

This capability MUST NOT add any new entry to `client/package.json`. This capability MUST NOT modify any file under `server/`. This capability MUST NOT modify the data-fetching functions or type contracts exported from any file under `client/app/lib/*.ts`.

#### Scenario: client/package.json has no new dependency

- GIVEN this capability is implemented
- WHEN `client/package.json` is inspected
- THEN it contains no new dependency entries compared to before this capability

#### Scenario: No server-side file is touched

- GIVEN this capability is implemented
- WHEN the diff introduced by this capability is inspected
- THEN no file under `server/` appears in it

#### Scenario: client/app/lib/*.ts contracts are unchanged

- GIVEN this capability is implemented
- WHEN the files under `client/app/lib/*.ts` are inspected
- THEN their exported function signatures and types used by the panel are identical to before this capability
