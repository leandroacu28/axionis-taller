# Apply Progress: Card-level actions (Iniciar / Editar / Desactivar) on `/ordenes-trabajo/panel`

Status: **Complete** — all 5 phases / 30 tasks implemented and checked off in `tasks.md`.

## What was implemented

### Phase 1 — New file `KanbanCardActions.tsx`
Created `client/app/(dashboard)/ordenes-trabajo/panel/KanbanCardActions.tsx` (`'use client'`),
following design.md §5's full listing verbatim:
- Imports: `Link`, `useRouter`, `useEffect`/`useRef`/`useState`, `createPortal`,
  `iniciarOrdenTrabajo`/`updateOrdenTrabajo`/`type OrdenTrabajoListItem` from
  `../../../lib/ordenes-trabajo`, `showConfirm`/`showError`/`showSuccess` from `../../../lib/alerts`.
  No import from `ordenes-trabajo/page.tsx`.
- Locally re-declared `EllipsisIcon()` and `NoSymbolIcon()`, and
  `ACCIONES_MENU_HEIGHT_ESTIMATE = 130`.
- `MenuPosition` interface and `KanbanCardActions({ orden, onActionSuccess })` signature.
- State/refs (`triggerRef`, `menuRef`, `open`, `menuPos`, `iniciando`, `desactivando`) and
  `closeMenu`/`openMenu`/`handleTriggerClick` copied verbatim from the list page's `AccionesMenu`
  positioning math.
- `handleIniciar` per design.md §3 exactly (see "Iniciar dual-behavior trace" below).
- `handleDesactivar` per design.md §4 exactly, with the ten-field payload
  (`fechaIngreso`, `kilometros`, `prioridad`, `motivoIngreso`, `estado`, `clienteId: orden.cliente.id`,
  `vehiculoId: orden.vehiculo.id`, `mecanicoId: orden.mecanico.id`,
  `tipoServicioIds: orden.tiposServicio.map((t) => t.id)`, `activo: false`).
- Outside-click/resize/scroll-capture `useEffect`, gated on `open`.
- Trigger `<button>` (ellipsis icon, `aria-haspopup`/`aria-expanded`/`aria-label="Acciones"`) +
  `createPortal(..., document.body)` dropdown with the three menu items: always-present Editar
  `<Link>`, Iniciar guarded by `orden.estado !== 'cancelado'`, and a single static Desactivar
  (no Activar branch, no `orden.activo` conditional).

### Phase 2 — `KanbanBoard.tsx` prop threading + mount
- Imported `KanbanCardActions` from `./KanbanCardActions`.
- Added `onActionSuccess: () => void` to `KanbanBoardProps`, passed through to `<KanbanColumn>`.
- Added `onActionSuccess` to `KanbanColumn`'s prop type, passed through to each `<KanbanCard>` in
  `ordenes.map(...)`.
- Added `onActionSuccess` to `KanbanCard`'s prop type; mounted
  `<KanbanCardActions orden={orden} onActionSuccess={onActionSuccess} />` in the header's right
  cluster (`flex items-center gap-1.5`) next to the existing prioridad badge. No other change to
  `KanbanCard`'s markup (cliente/vehículo/mecánico, tiposServicio chips, Ingreso line untouched);
  per-column colors (`COLUMN_CLASSES`) untouched.

### Phase 3 — `page.tsx` wiring
- One-line change: `<KanbanBoard data={result.data} meta={result.meta} onActionSuccess={loadPanel} />`.
  No other section of the file touched (stats row, filter bar, `MecanicosWorkload`, filter
  state/effects all untouched).

## Verification performed (Phase 4)

No test runner is configured in this project (`strict_tdd: false`, `test_command: ""`), so
verification was manual/static, as design.md §9 anticipated:

- **4.1/4.2/4.4 — Iniciar dual-behavior trace (highest-risk item, traced line-by-line against the
  shipped code, not just asserted against design):**
  ```ts
  const handleIniciar = async () => {
    closeMenu();
    if (orden.estado === 'pendiente') {
      setIniciando(true);
      try {
        await iniciarOrdenTrabajo(orden.id);
        onActionSuccess();
      } catch (err) {
        showError(...);
        setIniciando(false);
        return;                         // <-- early return, no navigate
      }
      setIniciando(false);
    }
    router.push(`/ordenes-trabajo/${orden.id}/trabajo`);
  };
  ```
  - `estado === 'pendiente'`, success path: enters the `if`, calls `iniciarOrdenTrabajo(orden.id)`
    (→ `POST /ordenes-trabajo/:id/iniciar`), then `onActionSuccess()` (re-fetch) fires *before*
    `setIniciando(false)` and before falling through to the unconditional `router.push(...)` at the
    bottom of the function — re-fetch then navigate, exactly per spec's "Iniciar on a pendiente card
    calls the cascade then navigates" scenario, and byte-identical in ordering to the list page's
    `IniciarTrabajoButton.handleClick`.
  - `estado === 'pendiente'`, failure path: `catch` block runs `showError(...)`,
    `setIniciando(false)`, then `return` — this `return` exits the function *before* reaching
    `router.push`, so no navigation occurs on failure. `onActionSuccess()` is never called on this
    path (it's only inside the `try`, before the point where an exception would be thrown by
    `await`). Matches spec's failure clause exactly: "the failure MUST surface via the existing
    error notification mechanism and MUST NOT navigate to the work page" — and no re-fetch either.
  - `estado === 'en_proceso'` or `'terminado'`: the `if (orden.estado === 'pendiente')` condition is
    `false`, so the entire block (including the `iniciarOrdenTrabajo` call) is skipped — execution
    falls straight through to the unconditional `router.push(...)` at the bottom. No API call, no
    409 possible, no error toast. Matches "Iniciar on a non-pendiente card navigates without calling
    the API" exactly.
  - No `showConfirm` call anywhere in `handleIniciar` — neither branch shows a confirmation dialog,
    matching the spec's "no confirmation dialog is shown at any point" clause for both scenarios.
  - `estado === 'cancelado'`: the Iniciar `<button>` is not rendered at all (JSX guard
    `orden.estado !== 'cancelado'`), so `handleIniciar` is unreachable for cancelado cards — this is
    how 4.3 (Iniciar absent on cancelado) is satisfied, verified by reading the JSX guard directly.
  - This was NOT verified by "matches design.md" alone — it was independently re-derived from the
    written `KanbanCardActions.tsx` source and checked branch-by-branch against every clause of the
    spec's "Iniciar Dual Behavior Mirrors the List Page's Iniciar Control" requirement and its four
    scenarios (pendiente-success, non-pendiente, cancelado-absent, pendiente-failure).

- **4.3** — confirmed via the JSX guard `{orden.estado !== 'cancelado' && (...)}` around the Iniciar
  `<button>`: absent on `cancelado`, present on the other three estados.

- **4.5** — `Editar` renders as `<Link href={`/ordenes-trabajo/editar/${orden.id}`} onClick={closeMenu}>`
  with no `showConfirm` call and no `onActionSuccess` reference anywhere near it (per ADR-D) — pure
  navigation, no PATCH, no re-fetch side effect.

- **4.6/4.7** — `handleDesactivar` traced: `showConfirm(...)` awaited first; `if (!confirmed) return;`
  exits before any API call on cancel (card/`desactivando` state untouched). On confirm, the full
  ten-field `updateOrdenTrabajo(orden.id, {...})` payload is sent (all fields hard-coded from props,
  no partial payload), `showSuccess` then `onActionSuccess()` on success; `showError` with **no**
  `onActionSuccess()` call in the `catch` block on failure; `setDesactivando(false)` unconditionally
  in `finally`.

- **4.8/4.9** — `onActionSuccess` is bound to `loadPanel` (`page.tsx`), which re-issues
  `getOrdenesTrabajoPanel(...)` and calls `setResult(panel)` wholesale — both `PanelStats` and
  `KanbanBoard` re-render from the same single fresh response object; no local/optimistic splice
  exists anywhere in the new code (neither `KanbanCardActions` nor `KanbanBoard`/`KanbanColumn`
  mutate `data`/`result` directly). The server-side `activo: true` filter (pre-existing, unmodified)
  is what causes a deactivated card to disappear on the next fetch.

- **4.10** — not verified live (no dev server session run in this environment); verified statically
  instead: `createPortal(..., document.body)` escapes the board's `overflow-x-auto` clip region, and
  `getBoundingClientRect()` is viewport-relative so the `top`/`left`/`transform` computation is
  scroll-offset-correct without adjustment — same reasoning design.md §5's "Positioning inside the
  horizontally-scrolling board" section lays out, code matches that analysis line-for-line. Flagged
  as a live-check bonus per the task instructions, not performed in this pass.

- **4.11** — `git status --porcelain` (working tree, this branch) confirms
  `client/app/(dashboard)/ordenes-trabajo/page.tsx` has zero changes; a full-file grep of the new
  component and `KanbanBoard.tsx`/`page.tsx` diffs shows no reference to `KanbanCardActions` from
  the list page, and vice versa (no import in either direction).

- **4.12** — `git status --porcelain server/ client/package.json` returned no output: no backend
  file touched, no new dependency added. `iniciarOrdenTrabajo`/`updateOrdenTrabajo` in
  `client/app/lib/ordenes-trabajo.ts` are called with their existing signatures, unmodified (verified
  by re-reading the file on this branch before writing the new component — see "Field-availability
  audit" below).

- **4.13** — `npm run build` executed and passed in both packages:
  - `client`: `✓ Compiled successfully`, type-checked with zero new errors (pre-existing
    `react-hooks/exhaustive-deps` and `no-img-element` warnings in unrelated files only), all 24
    routes generated including `/ordenes-trabajo/panel` (7.32 kB, up from its prior size — expected,
    the new component adds to that route's bundle).
  - `server`: `nest build` completed with no output (success), confirming the untouched backend
    still compiles — sanity check only, no backend files were touched by this change.

## Field-availability audit (hazard check, per task instructions)

Before finishing, re-read `client/app/lib/ordenes-trabajo.ts` on this branch (not trusting
design.md's table blindly) and confirmed every field `KanbanCardActions.tsx` references on
`OrdenTrabajoListItem` is actually present in the currently-committed type:
- `orden.cliente.id` — `cliente: { id: number; razonSocial: string }` ✓
- `orden.vehiculo.id` — `vehiculo: { id: number; ... }` ✓
- `orden.mecanico.id` — `mecanico: { id: number; ... }` ✓
- `orden.tiposServicio` (array of `{ id: number; descripcion: string }`, used via
  `.map((t) => t.id)`) ✓
- `orden.fechaIngreso`, `orden.kilometros`, `orden.prioridad`, `orden.motivoIngreso`, `orden.estado`,
  `orden.numero` — all direct fields on `OrdenTrabajoListItem` ✓
- `UpdateOrdenTrabajoPayload` (= `CreateOrdenTrabajoPayload & { activo?: boolean; ... }`) accepts all
  ten fields sent by `handleDesactivar`'s payload ✓

No divergence found; design.md's field-availability table (§4) was accurate. This also confirms the
prior hazard (a field referenced from an uncommitted, unrelated parallel change) does not recur here
— every field was checked against the actually-committed file on `feat/panel-trabajo-acciones`.

## Sign-off (Phase 5)

- **5.1 Success Criteria** — walked against `proposal.md`'s checklist: all items hold. Dropdown
  exposes Iniciar/Editar/Desactivar; Iniciar's visibility (`pendiente`/`en_proceso`/`terminado`,
  absent on `cancelado`) and dual-behavior rules match D1 exactly; Editar is a plain unconfirmed
  link; Desactivar's confirm → full-payload PATCH → toast → re-fetch flow matches D8; every
  successful action re-fetches via `loadPanel()` with no optimistic/local update (D4); list page is
  byte-unchanged (D7, confirmed via `git status`); no new client API function/backend
  endpoint/DTO/guard/migration/dependency added (D5, confirmed via `git status` on `server/` and
  `client/package.json`); no drag-and-drop library or behavior introduced (none touched); stats row,
  filter bar, "Carga por mecánico" section, and both panel endpoints unchanged (only the one prop
  line in `page.tsx` was touched).
- **5.2 Spec reconciliation delta** — confirmed the shipped `spec.md` already contains the MODIFIED
  "Board Has No Drag-and-Drop; Explicit Action Controls Are Permitted" requirement (its two DnD
  scenarios preserved verbatim) plus the ADDED "Kanban Card Actions Menu" requirement and its
  siblings (Iniciar Visibility Rule, Iniciar Dual Behavior, Editar Action, Desactivar Action,
  Post-Action Panel Refresh, Deactivated Card Disappears, List Page Unaffected, No New Backend
  Surface) — the implemented component matches every one of these requirements' scenarios exactly,
  with no drift.
- **5.3 Rollback Plan** — confirmed accurate and executable as written: restoring `KanbanCard`
  to its pure-presentational form means (a) removing the `<KanbanCardActions>` mount and the
  `onActionSuccess` prop from `KanbanCard`'s signature, (b) removing `onActionSuccess` from
  `KanbanColumn` and `KanbanBoardProps`, (c) deleting `KanbanCardActions.tsx`, and (d) removing
  `onActionSuccess={loadPanel}` from `page.tsx`'s `<KanbanBoard>` call — exactly the three files this
  change touched/added, nothing more, leaving the panel fully functional as a read-only board with
  no leftover references.

## Deviations from design/tasks

None. The implementation follows design.md §5's full component listing verbatim (including the exact
comment text), the prop-threading diffs in §2 exactly, and every task in `tasks.md` Phase 1-5 as
written. No structural simplification, no additional abstraction, no scope changes.

## Files changed

- **New:** `client/app/(dashboard)/ordenes-trabajo/panel/KanbanCardActions.tsx`
- **Modified:** `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx`
- **Modified:** `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx`
- **Modified:** `openspec/changes/panel-trabajo-acciones/tasks.md` (all 30 items marked `[x]`)
- **New:** `openspec/changes/panel-trabajo-acciones/apply-progress.md` (this file)

Not touched: `client/app/(dashboard)/ordenes-trabajo/page.tsx` (list page), any `server/` file,
`client/package.json`.
