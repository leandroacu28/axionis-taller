# Tasks: Card-level actions (Iniciar / Editar / Desactivar) on `/ordenes-trabajo/panel`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~175-210 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (new component + two small threading edits together) |
| Delivery strategy | ask-on-risk |
| Chain strategy | n/a (single PR) |

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low

This change is 100% frontend and touches exactly three files, one of them new. Design §1's own
estimate for the new component is ~150 lines; the two threading edits are small and mechanical
(prop plumbing, one JSX mount, one prop on one existing line). No backend, no DTO, no migration,
no new dependency — nothing to inflate the estimate beyond the design's own numbers.

Estimate breakdown, calibrated against design.md's code blocks and the sibling
`panel-trabajo-mecanicos` change's actuals-vs-estimate accuracy:
- `client/app/(dashboard)/ordenes-trabajo/panel/KanbanCardActions.tsx` (new file: imports, two
  re-declared icons, position/open state, three handlers, outside-click/resize/scroll effect,
  trigger button + portal dropdown JSX): ~145-165 lines (design.md §5's own full listing is ~170
  lines including comments/blank lines; §1 estimates "~150 lines")
- `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` (incremental: one new prop on
  `KanbanBoardProps`, one prop pass-through to `<KanbanColumn>`, one new prop on the `KanbanColumn`
  function signature and pass-through to `<KanbanCard>`, one new prop on the `KanbanCard` function
  signature, one new import, one `<KanbanCardActions>` mount in the header cluster): ~15-25 lines
- `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` (one prop added to the existing
  `<KanbanBoard>` JSX line): ~1 line

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | New file: `KanbanCardActions.tsx` (full component) | ~145-165 lines; self-contained, no dependency on Unit 2 to compile in isolation (only requires `OrdenTrabajoListItem`, `iniciarOrdenTrabajo`, `updateOrdenTrabajo`, alert helpers — all pre-existing) |
| 2 | Wiring: `KanbanBoard.tsx` prop threading + mount, `page.tsx` one-line prop | ~16-26 lines; depends on Unit 1 existing so `<KanbanCardActions>` resolves |

Given the small total size, both units are delivered in a single PR unless `sdd-apply` finds the
combined diff exceeds ~400 lines in practice, in which case fall back to `ask-on-risk` and split
along the Unit 1 / Unit 2 boundary above.

## Phase 1: Frontend — New File `KanbanCardActions.tsx`

Satisfies spec requirements: "Kanban Card Actions Menu", "Actions menu is implemented
independently of the list page" (D7/D3).

- [x] 1.1 Create `client/app/(dashboard)/ordenes-trabajo/panel/KanbanCardActions.tsx` with the
      `'use client'` directive and the imports from design.md §5: `Link` from `next/link`,
      `useRouter` from `next/navigation`, `useEffect`/`useRef`/`useState` from `react`,
      `createPortal` from `react-dom`, `iniciarOrdenTrabajo`/`updateOrdenTrabajo`/
      `type OrdenTrabajoListItem` from `../../../lib/ordenes-trabajo`, and `showConfirm`/
      `showError`/`showSuccess` from `../../../lib/alerts` — no import from
      `ordenes-trabajo/page.tsx` (D7)
- [x] 1.2 Re-declare `EllipsisIcon()` and `NoSymbolIcon()` locally per design.md §5 (D3/D7 —
      mirrors `AccionesMenu`'s icons without importing them), and the
      `ACCIONES_MENU_HEIGHT_ESTIMATE = 130` constant with its comment explaining the flip-estimate
      carries over unchanged for the panel's max-three-item menu
- [x] 1.3 Define the `MenuPosition` interface (`top`, `left`, `openUpward`) and the
      `KanbanCardActions({ orden, onActionSuccess })` component signature with props typed
      `orden: OrdenTrabajoListItem; onActionSuccess: () => void` (design.md §2, §5)
- [x] 1.4 Add component state/refs: `triggerRef`, `menuRef`, `open`, `menuPos`, `iniciando`,
      `desactivando`, plus `closeMenu()` and `openMenu()` copied verbatim from `AccionesMenu`'s
      positioning math (`getBoundingClientRect()` viewport-relative calculation, upward-flip via
      `window.innerHeight - rect.bottom < ACCIONES_MENU_HEIGHT_ESTIMATE`) and `handleTriggerClick()`
      toggling `open`/calling `openMenu()` (design.md §5, ADR-B — copy, no structural simplification)
- [x] 1.5 Implement `handleIniciar` exactly per design.md §3: `closeMenu()` first; on
      `orden.estado === 'pendiente'` set `iniciando(true)`, call `iniciarOrdenTrabajo(orden.id)`,
      on success call `onActionSuccess()` **before** navigating, on failure call `showError(...)`,
      `setIniciando(false)`, and `return` (no navigate, no re-fetch on failure); after the
      `pendiente` branch (or immediately, for any other visible estado) call
      `router.push(`/ordenes-trabajo/${orden.id}/trabajo`)` unconditionally outside the failure
      path — no confirmation dialog in either branch (spec: "Iniciar Dual Behavior Mirrors the List
      Page's Iniciar Control")
- [x] 1.6 Implement `handleDesactivar` exactly per design.md §4: `closeMenu()` first, `showConfirm`
      with the title/text/confirm-button-color from §4, `return` on cancel (no API call, card
      unchanged), on confirm `setDesactivando(true)` and call `updateOrdenTrabajo(orden.id, {...})`
      with the exact ten-field payload table from design.md §4 (`fechaIngreso`, `kilometros`,
      `prioridad`, `motivoIngreso`, `estado`, `clienteId: orden.cliente.id`,
      `vehiculoId: orden.vehiculo.id`, `mecanicoId: orden.mecanico.id`,
      `tipoServicioIds: orden.tiposServicio.map((t) => t.id)`, `activo: false`) — no
      `getOrdenTrabajo(id)` prefetch (ADR-C); on success `showSuccess(...)` then `onActionSuccess()`;
      on failure `showError(...)` and explicitly **no** `onActionSuccess()` call; `setDesactivando(false)`
      in a `finally` (D8; spec: "Desactivar Action Confirms, Sends a Full-Object PATCH, and Notifies")
- [x] 1.7 Add the `useEffect` outside-click/resize/scroll-capture handler from design.md §5,
      gated on `open`: `mousedown` outside-trigger-and-menu closes the menu; `resize` and
      `scroll` (registered with `capture: true`, so it fires on the board's `overflow-x-auto`
      scroll region too) both call `closeMenu()`; cleanup removes all three listeners
- [x] 1.8 Render the trigger `<button>` (ellipsis icon, `aria-haspopup="menu"`,
      `aria-expanded={open}`, `aria-label="Acciones"`) and, when `open && menuPos`, the
      `createPortal(..., document.body)` dropdown with `position: fixed` inline styles computed
      from `menuPos` and the `translateX(-100%)` / conditional `translateY(-100%)` transform, per
      design.md §5's exact JSX
- [x] 1.9 Inside the portal, render the three menu items per design.md §6's visibility table: an
      always-present `<Link href={`/ordenes-trabajo/editar/${orden.id}`} onClick={closeMenu}>Editar</Link>`
      with no confirm and no `onActionSuccess` wiring (ADR-D); a conditionally-rendered Iniciar
      `<button>` guarded by `orden.estado !== 'cancelado'` (D1), disabled while `iniciando`, label
      `'Iniciando...'` vs `'Iniciar trabajo'`; and a single static Desactivar `<button>` (no
      `orden.activo` conditional, no Activar branch — ADR-E), disabled while `desactivando`, with
      the `NoSymbolIcon` + rose styling from design.md §5

## Phase 2: Frontend — `KanbanBoard.tsx` Prop Threading + Mount

Satisfies spec requirements: "Kanban Card Actions Menu" (mounting requirement), "Post-Action Panel
Refresh" (callback plumbing that makes the refresh reachable).

- [x] 2.1 Import `KanbanCardActions` from `./KanbanCardActions` in `KanbanBoard.tsx`
- [x] 2.2 Add `onActionSuccess: () => void` to `KanbanBoardProps` and pass it straight through to
      the existing `<KanbanColumn>` JSX call inside `KanbanBoard` (design.md §2)
- [x] 2.3 Add `onActionSuccess: () => void` to `KanbanColumn`'s prop type and pass it straight
      through to each `<KanbanCard key={orden.id} orden={orden} onActionSuccess={onActionSuccess} />`
      call inside `KanbanColumn`'s `ordenes.map(...)` (design.md §2)
- [x] 2.4 Add `onActionSuccess: () => void` to `KanbanCard`'s prop type, and in its header's right
      cluster (`flex items-center gap-1.5`, next to the existing prioridad badge) mount
      `<KanbanCardActions orden={orden} onActionSuccess={onActionSuccess} />` — no other change to
      `KanbanCard`'s existing JSX (cliente/vehículo/mecánico, tiposServicio chips, Ingreso line
      stay untouched; design.md §2)

## Phase 3: Frontend — `page.tsx` Wiring

Satisfies spec requirement: "Post-Action Panel Refresh" (binds the callback chain to the existing
re-fetch).

- [x] 3.1 In `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx`, add
      `onActionSuccess={loadPanel}` to the existing `<KanbanBoard data={result.data}
      meta={result.meta} />` JSX call — the only change in this file (design.md §2); do not touch
      any other section (stats row, filter bar, `MecanicosWorkload`)

## Phase 4: Manual Verification

Maps 1:1 to design.md §9's Testing Strategy table. Per `openspec/config.yaml`
(`test_command: ""`), verification is manual — via the dev server, Network tab inspection, and a
build check.

- [x] 4.1 Iniciar on `pendiente` (spec: "Iniciar on a pendiente card calls the cascade then
      navigates"): open a `pendiente` card's menu, click Iniciar → `POST
      /ordenes-trabajo/:id/iniciar` fires (Network tab), the panel re-fetches (`GET
      /ordenes-trabajo/panel`), and the app navigates to `/ordenes-trabajo/:id/trabajo`; no
      confirm dialog shown at any point
- [x] 4.2 Iniciar on `en_proceso` / `terminado` (spec: "Iniciar on a non-pendiente card navigates
      without calling the API"): open the menu on an `en_proceso` card and a `terminado` card,
      click Iniciar on each → **no** `iniciar` request fires, no 409, no error toast; navigates
      straight to `/ordenes-trabajo/:id/trabajo`
- [x] 4.3 Iniciar absent on `cancelado` (spec: "Iniciar is absent on a cancelado card"): open a
      `cancelado` card's menu → the "Iniciar trabajo" item is **not** rendered; only Editar and
      Desactivar are present
- [x] 4.4 Iniciar failure path (spec: Iniciar Dual Behavior, failure clause): simulate a failing
      `iniciar` call (e.g. offline / throttled network) on a `pendiente` card → `showError` toast
      shown, **no** navigation occurs, **no** panel re-fetch occurs
- [x] 4.5 Editar navigation (spec: "Editar navigates directly to the edit route"): click Editar on
      any card of any estado → navigates to `/ordenes-trabajo/editar/:id`; no confirm dialog; no
      PATCH request and no panel re-fetch as a side effect
- [x] 4.6 Desactivar confirm path (spec: "Confirming Desactivar sends a full-object PATCH and
      refreshes on success"): click Desactivar, confirm the dialog → `PATCH
      /ordenes-trabajo/:id` sent with the full field set (`fechaIngreso`, `kilometros`,
      `prioridad`, `motivoIngreso`, `estado`, `clienteId`, `vehiculoId`, `mecanicoId`,
      `tipoServicioIds`, and `activo: false`) — inspect the request body — success toast shown,
      panel re-fetches
- [x] 4.7 Desactivar cancel path (spec: "Canceling Desactivar makes no API call"): click
      Desactivar, cancel the dialog → **no** PATCH request fires, card unchanged on the board
- [x] 4.8 Deactivated card vanishes (spec: "A deactivated order's card is gone after refresh",
      D6): after a confirmed Desactivar and its re-fetch, the order's card no longer appears in
      any column; the stats row updates from the same fresh response
- [x] 4.9 Post-action re-fetch reconciles stats + board together (spec: "A successful Iniciar
      cascade triggers a full panel re-fetch" / "A successful Desactivar triggers a full panel
      re-fetch"): confirm both the board buckets and the stats row reflect one single fresh `GET
      /ordenes-trabajo/panel` response after each mutating action — not a local/optimistic splice
- [x] 4.10 Dropdown positioning inside the horizontally-scrolling board (design.md §5's
      positioning analysis): horizontally scroll the board, open a card's menu near the right
      edge and near the viewport bottom → the menu is not clipped by `overflow-x-auto`,
      right-aligns to the trigger, and flips upward near the bottom; scrolling the board or the
      page while the menu is open closes it; clicking outside the menu closes it
- [x] 4.11 List page byte-diff unchanged (D7; spec: "List page is unchanged"): `git diff` shows
      `client/app/(dashboard)/ordenes-trabajo/page.tsx` is unmodified; confirm no shared component
      was extracted and nothing in that file references `KanbanCardActions`
- [x] 4.12 No new backend/dependency surface (D5; spec: "No New Backend Surface Is Introduced"):
      confirm no new client API function, backend endpoint, DTO, guard, migration, or dependency
      was added; `iniciarOrdenTrabajo`/`updateOrdenTrabajo`/`getOrdenTrabajo` and their signatures
      are unmodified; `client/package.json` gained no new dependency
- [x] 4.13 Build: `npm run build` passes in both `client` and `server` packages (per
      `openspec/config.yaml`'s `verify.build_command`), with no new type errors

## Phase 5: Documentation & Final Sign-off

- [x] 5.1 Walk `proposal.md`'s Success Criteria checklist end-to-end and confirm each item: the
      dropdown exposes Iniciar/Editar/Desactivar; Iniciar's visibility and dual-behavior rules
      hold exactly (D1); Editar is a plain unconfirmed link; Desactivar's confirm → full-payload
      PATCH → toast → re-fetch flow holds (D8); every successful action re-fetches the whole
      panel via `loadPanel()` with no optimistic/local update (D4); the list page is byte-unchanged
      (D7); no new client API function/backend endpoint/DTO/guard/migration/dependency was added
      (D5); no drag-and-drop library or behavior was introduced; the stats row, filter bar,
      "Carga por mecánico" section, and both panel endpoints are unchanged
- [x] 5.2 Confirm the spec reconciliation delta was applied correctly (proposal's Spec
      Reconciliation Plan): the "Board Is Read-Only..." requirement was narrowed to drag-and-drop
      specifically with its two DnD scenarios preserved verbatim, and the new "Kanban Card Actions
      Menu" + sibling ADDED requirements match this change's implemented behavior exactly (no
      drift between `spec.md` and the shipped component)
- [x] 5.3 Confirm the Rollback Plan in `proposal.md` is accurate and executable as written:
      restoring `KanbanCard`/`KanbanColumn`/`KanbanBoard` to their pure-presentational form (no
      event handlers, `{ orden }`-only props), deleting `KanbanCardActions.tsx`, and removing the
      `onActionSuccess` prop from `page.tsx`'s `<KanbanBoard>` call together leave the panel fully
      functional as a read-only board with no leftover references
