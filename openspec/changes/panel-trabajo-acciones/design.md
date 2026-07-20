# Design: Card-level actions (Iniciar / Editar / Desactivar) on `/ordenes-trabajo/panel`

## Technical Approach

Make the panel's currently pure-presentational Kanban card interactive by adding one **icon-triggered
dropdown menu** per card, re-implemented **inside the panel's own files** — never imported from, and
requiring no change to, the list page (`ordenes-trabajo/page.tsx`). The menu offers three actions —
**Iniciar** (dual-behavior), **Editar** (plain link), **Desactivar** (confirm → full-object
`activo:false` PATCH) — whose semantics are copied verbatim from the list page's `IniciarTrabajoButton`
and `AccionesMenu.handleToggleActivo`, per the D3/D7 "re-declare per surface, don't extract a shared
module" convention already applied twice on this page.

State is reconciled after each successful mutation by re-invoking the page's existing `loadPanel()`
re-fetch, threaded down as an `onActionSuccess` callback through
`KanbanBoard → KanbanColumn → KanbanCard → KanbanCardActions` (D4). No optimistic/local splice.

**This change is 100% frontend (D5).** No backend route, DTO, guard, migration, dependency, or client
API function is added — `iniciarOrdenTrabajo(id)`, `updateOrdenTrabajo(id, data)`, and the
`showConfirm`/`showSuccess`/`showError` helpers are all pre-existing and only *called* by the new
handlers. The list page and every other panel section (stats row, filter bar, `MecanicosWorkload`)
are untouched.

**Where this deliberately diverges from the list page's `AccionesMenu`.** The list page's menu is a
dual-mode (table + tarjetas) control that renders an **Activar/Desactivar toggle** and shows Iniciar on
every estado. The panel board is narrower: it forces `activo: true` unconditionally, so a card here is
**always active** — the menu shows only **Desactivar** (no Activar branch, no `orden.activo`
conditional). And per D1 the panel **hides Iniciar on `cancelado` cards** — a guard the list page's menu
does not apply. Everything else (portal mechanics, positioning math, close handlers, the Iniciar
dual-behavior branch, the Desactivar full-object payload) is a faithful copy.

No schema/migration change, no new dependency, no shared component.

---

## 1. Component Architecture — file boundary

**Decision: one new sibling file `client/app/(dashboard)/ordenes-trabajo/panel/KanbanCardActions.tsx`**,
not inlined into `KanbanBoard.tsx` (see ADR-A). `KanbanBoard.tsx` today is a compact presentational
module (maps, helpers, three pure components — ~155 lines, zero hooks). The actions cluster adds ~150
lines of stateful, portal-rendered, router-aware logic (open/position state, three async handlers, two
re-declared icons, an outside-click/resize/scroll effect). Keeping it in its own file mirrors the
sibling `panel-trabajo-mecanicos` change's `MecanicosWorkload.tsx` new-file precedent and keeps
`KanbanBoard.tsx` a presentational shell that merely threads a callback and mounts the leaf.

| File | Change | Role |
|------|--------|------|
| `panel/KanbanCardActions.tsx` | **NEW** (`'use client'`) | The interactive leaf: icon trigger + portal dropdown + all three handlers |
| `panel/KanbanBoard.tsx` | **MODIFIED** | Threads `onActionSuccess` through `KanbanBoard → KanbanColumn → KanbanCard`; `KanbanCard` mounts `<KanbanCardActions>` in its header |
| `panel/page.tsx` | **MODIFIED** | Passes `onActionSuccess={loadPanel}` to `<KanbanBoard>` (one prop added to one JSX line) |

**Client-component boundary.** `KanbanCardActions.tsx` carries an explicit `'use client'` directive
(it uses `useState`/`useRef`/`useEffect`, `useRouter`, and `createPortal`). `KanbanBoard.tsx` needs **no
directive change**: it is already part of the client graph (imported directly by the `'use client'`
`page.tsx`), exactly as it is today. No `KanbanBoard`/`KanbanColumn` internals become stateful — they
only pass a prop down.

---

## 2. Prop threading — `onActionSuccess` callback chain

A single callback, named **`onActionSuccess`**, is threaded from the container to the leaf and bound to
the page's existing `loadPanel()`. It mirrors the list page's `onIniciado={loadOrdenes}` /
`onToggled={loadOrdenes}` convention, generalized to one name because all three actions share one
reconciliation path (D4).

```tsx
// panel/page.tsx — the ONLY change in this file (one prop on the existing JSX line):
) : (
  <KanbanBoard data={result.data} meta={result.meta} onActionSuccess={loadPanel} />
)}
```

```tsx
// panel/KanbanBoard.tsx — new prop on each level, passed straight through:

interface KanbanBoardProps {
  data: OrdenTrabajoListItem[];
  meta: { total: number; cap: number; capped: boolean };
  onActionSuccess: () => void;                                   // NEW
}

export default function KanbanBoard({ data, meta, onActionSuccess }: KanbanBoardProps) {
  // ...capped banner unchanged...
  <KanbanColumn
    key={estado}
    estado={estado}
    ordenes={data.filter((orden) => orden.estado === estado)}
    onActionSuccess={onActionSuccess}                            // NEW
  />
}

function KanbanColumn({
  estado,
  ordenes,
  onActionSuccess,                                               // NEW
}: {
  estado: Estado;
  ordenes: OrdenTrabajoListItem[];
  onActionSuccess: () => void;
}) {
  // ...
  ordenes.map((orden) => (
    <KanbanCard key={orden.id} orden={orden} onActionSuccess={onActionSuccess} /> // NEW prop
  ))
}

function KanbanCard({
  orden,
  onActionSuccess,                                               // NEW
}: {
  orden: OrdenTrabajoListItem;
  onActionSuccess: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-stone-800">{orden.numero ?? '—'}</span>
        {/* Right cluster: existing prioridad badge + the new actions trigger. */}
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORIDAD_BADGE_CLASSES[orden.prioridad]}`}>
            {PRIORIDAD_LABELS[orden.prioridad]}
          </span>
          <KanbanCardActions orden={orden} onActionSuccess={onActionSuccess} />  {/* NEW */}
        </div>
      </div>
      {/* ...cliente/vehículo/mecánico, tiposServicio chips, Ingreso line — all unchanged... */}
    </div>
  );
}
```

**Editar is intentionally NOT wired to `onActionSuccess` (see ADR-D).** Only Iniciar's `pendiente`
branch and Desactivar's confirmed branch call it; Editar is pure navigation with nothing to reconcile.

---

## 3. Iniciar handler — exact branch logic

Mirrors `IniciarTrabajoButton.handleClick` (`page.tsx:112-130`) precisely. The card **needs router
access** because the list page navigates via `useRouter().push(...)`, not a `<Link>` — so
`KanbanCardActions` imports `useRouter` from `next/navigation`. The API call fires **only** on a
`pendiente` order; every other *visible* estado (`en_proceso`, `terminado`) is pure navigation — a
second `iniciar` would 409. No confirmation dialog in either branch.

```tsx
// Inside KanbanCardActions. `closeMenu()` runs first (mirrors the list page's
// onNavigateStart?.() = closeMenu before the branch).
const handleIniciar = async () => {
  closeMenu();
  if (orden.estado === 'pendiente') {
    setIniciando(true);
    try {
      await iniciarOrdenTrabajo(orden.id);
      onActionSuccess();                       // re-fetch (D4) — fire before navigating, as the list page does
    } catch (err) {
      showError(
        'No se pudo iniciar la orden',
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
      );
      setIniciando(false);
      return;                                  // do NOT navigate on failure
    }
    setIniciando(false);
  }
  router.push(`/ordenes-trabajo/${orden.id}/trabajo`);
};
```

**Note on the re-fetch-then-navigate order.** On the `pendiente` branch `onActionSuccess()` (a re-fetch)
fires immediately before `router.push`, so the navigation typically unmounts the panel before the
re-fetch resolves — harmless and **byte-identical to the list page** (`onIniciado()` then
`router.push`). The spec's "Iniciar Dual Behavior" requirement mandates this exact ordering, so it is
preserved verbatim rather than "optimized" away.

---

## 4. Desactivar handler — payload assembled from props alone (no extra fetch)

Mirrors `AccionesMenu.handleToggleActivo` (`page.tsx:210-253`), **narrowed to the deactivate-only
direction** (the panel has no active/inactive toggle — every card is active). Full-object resend +
`activo: false` (D8), assembled entirely from the card's own `OrdenTrabajoListItem` — **no
`getOrdenTrabajo(id)` prefetch is required** (see ADR-C, resolving the proposal's flagged open
question).

**Field-availability audit (verified against the actual `OrdenTrabajoListItem` type,
`lib/ordenes-trabajo.ts:8-31`).** Every field the list page's PATCH sends is present on the card's prop:

| PATCH field | Source on `OrdenTrabajoListItem` | Direct field? |
|-------------|----------------------------------|---------------|
| `fechaIngreso` | `orden.fechaIngreso` | yes |
| `kilometros` | `orden.kilometros` | yes |
| `prioridad` | `orden.prioridad` | yes |
| `motivoIngreso` | `orden.motivoIngreso` | yes |
| `estado` | `orden.estado` | yes |
| `clienteId` | `orden.cliente.id` | nested |
| `vehiculoId` | `orden.vehiculo.id` | nested |
| `mecanicoId` | `orden.mecanico.id` | nested |
| `tipoServicioIds` | `orden.tiposServicio.map((t) => t.id)` | **derived** |
| `activo` | literal `false` | — |

`tipoServicioIds` is **not** a bare field on `OrdenTrabajoListItem` — but it is not one on the list page
either: the list page derives it the same way (`page.tsx:237`). So there is **no missing field and no
divergence**: the card can build the exact same payload the list page builds, from data already in
hand. An extra `getOrdenTrabajo(id)` round-trip would add latency and a new failure mode for zero
benefit.

```tsx
const handleDesactivar = async () => {
  closeMenu();
  const confirmed = await showConfirm({
    title: 'Desactivar orden',
    text: `¿Seguro que querés desactivar la orden ${orden.numero ?? ''}?`,
    confirmButtonText: 'Sí, desactivar',
    confirmButtonColor: '#e11d48',
  });
  if (!confirmed) return;                       // cancel → no API call, card unchanged

  setDesactivando(true);
  try {
    await updateOrdenTrabajo(orden.id, {
      fechaIngreso: orden.fechaIngreso,
      kilometros: orden.kilometros,
      prioridad: orden.prioridad,
      motivoIngreso: orden.motivoIngreso,
      estado: orden.estado,
      clienteId: orden.cliente.id,
      vehiculoId: orden.vehiculo.id,
      mecanicoId: orden.mecanico.id,
      tipoServicioIds: orden.tiposServicio.map((t) => t.id),
      activo: false,
    });
    showSuccess('Orden desactivada', `La orden ${orden.numero ?? ''} se desactivó correctamente.`);
    onActionSuccess();                          // re-fetch → deactivated card vanishes (D6)
  } catch (err) {
    showError(
      'No se pudo actualizar la orden',
      err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
    );
    // NO onActionSuccess() on failure (spec: failed PATCH must not trigger a re-fetch)
  } finally {
    setDesactivando(false);
  }
};
```

---

## 5. Dropdown UI & positioning — re-implemented from `AccionesMenu`

The positioning math, portal, and close handlers are copied verbatim from `AccionesMenu`
(`page.tsx:179-356`); only the menu **contents** and the deactivate-only narrowing differ. Full
component:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  iniciarOrdenTrabajo,
  updateOrdenTrabajo,
  type OrdenTrabajoListItem,
} from '../../../lib/ordenes-trabajo';
import { showConfirm, showError, showSuccess } from '../../../lib/alerts';

// Re-declared per D3/D7 — mirrors the list page's AccionesMenu icons rather than
// importing them (an import would couple the panel to page.tsx and risk touching
// the untouched list page). Same "duplicate small presentation helpers per
// surface" convention already used in KanbanBoard.tsx.
function EllipsisIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function NoSymbolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

// Same flip estimate as the list page's AccionesMenu — the panel menu also has a
// max of three items (Editar, Iniciar, Desactivar), so the estimate carries over
// unchanged. On a cancelado card the menu is shorter (two items); over-estimating
// only makes the upward-flip trigger slightly earlier, which is safe.
const ACCIONES_MENU_HEIGHT_ESTIMATE = 130;

interface MenuPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

export default function KanbanCardActions({
  orden,
  onActionSuccess,
}: {
  orden: OrdenTrabajoListItem;
  onActionSuccess: () => void;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);

  const closeMenu = () => {
    setOpen(false);
    setMenuPos(null);
  };

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpward = window.innerHeight - rect.bottom < ACCIONES_MENU_HEIGHT_ESTIMATE;
    setMenuPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.right,
      openUpward,
    });
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (open) { closeMenu(); return; }
    openMenu();
  };

  const handleIniciar = async () => { /* §3 */ };
  const handleDesactivar = async () => { /* §4 */ };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) closeMenu();
    };
    const handleReposition = () => closeMenu();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);   // capture: closes on ANY scroll, incl. the board's overflow-x-auto
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acciones"
        className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      >
        <EllipsisIcon />
      </button>

      {open &&
        menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: `translateX(-100%)${menuPos.openUpward ? ' translateY(-100%)' : ''}`,
            }}
            className="z-50 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
          >
            <Link
              href={`/ordenes-trabajo/editar/${orden.id}`}
              onClick={closeMenu}
              className="block px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Editar
            </Link>

            {orden.estado !== 'cancelado' && (
              <button
                type="button"
                onClick={handleIniciar}
                disabled={iniciando}
                className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {iniciando ? 'Iniciando...' : 'Iniciar trabajo'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDesactivar}
              disabled={desactivando}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <NoSymbolIcon />
              Desactivar
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
```

**Trigger affordance.** A compact ellipsis icon button (`EllipsisIcon`, the list page's table-row
`trigger='icon'` variant) sits in the card header's right cluster next to the prioridad badge. The
labeled `Opciones` variant is intentionally not used — the Kanban card's tight real estate is exactly
why D9 chose a dropdown over inline buttons, so the trigger stays a single icon.

**Positioning inside the horizontally-scrolling board — verified correct.** The board container is
`<div className="flex gap-4 overflow-x-auto pb-2">`. Two properties make the copied positioning work
unchanged there:
1. **`createPortal(..., document.body)`** renders the menu outside the `overflow-x-auto` container, so
   the menu is **not clipped** by the board's horizontal scroll region — the same reason `AccionesMenu`
   portals out of the table's `overflow-hidden` wrapper.
2. **`getBoundingClientRect()` is viewport-relative.** It already reflects the trigger's on-screen
   position after any horizontal scroll of the board, so `top: rect.bottom`, `left: rect.right` +
   `translateX(-100%)` right-aligns the menu to the trigger correctly regardless of scroll offset. No
   `scrollLeft` correction is needed.
3. The `scroll` listener is registered with **capture = true**, so scrolling the inner board region (or
   the page) fires `handleReposition → closeMenu`. The menu closes rather than trailing a stale
   position — the established, safe behavior. (No live repositioning on scroll is attempted, matching
   `AccionesMenu`.)

`z-50` on the portal keeps the menu above the board and the `MecanicosWorkload` section below it.

---

## 6. Menu item set per card (driven by `orden.estado`)

| Action | Visibility | Behavior |
|--------|-----------|----------|
| **Editar** | Always (all four estados) | `<Link href="/ordenes-trabajo/editar/:id">`, closes menu, navigates. No confirm, no callback. |
| **Iniciar trabajo** | `pendiente`, `en_proceso`, `terminado` — **absent on `cancelado`** (D1, guarded by `orden.estado !== 'cancelado'`) | On `pendiente`: `iniciarOrdenTrabajo` → `onActionSuccess()` → navigate. Else: navigate only, no API call. No confirm. |
| **Desactivar** | Always (all four estados) | `showConfirm` → full-object `updateOrdenTrabajo({..., activo:false})` → `showSuccess`/`showError` → `onActionSuccess()` on success. |

**No "Activar"/"Reactivar" branch (confirmed).** The panel's `buildPanelOrdenTrabajoWhere` forces
`activo: true`, so every card on the board is an active order. The menu therefore renders a **single
static "Desactivar"** item, with no `orden.activo` conditional and no `CheckCircleIcon`/Activar path —
a deliberate narrowing of the list page's dual-direction toggle (see ADR-E). Item order (Editar →
Iniciar → Desactivar) matches the list page's `AccionesMenu` for consistency.

---

## 7. Sequence diagrams

### 7.1 Iniciar on a `pendiente` card (API cascade → re-fetch → navigate)

```mermaid
sequenceDiagram
    actor U as Supervisor
    participant KA as KanbanCardActions
    participant API as iniciarOrdenTrabajo(id)
    participant BE as POST /ordenes-trabajo/:id/iniciar
    participant PG as page.tsx loadPanel()
    participant RT as router (next/navigation)

    U->>KA: click ellipsis → menu opens → click "Iniciar trabajo"
    KA->>KA: closeMenu(); estado === 'pendiente' → setIniciando(true)
    KA->>API: iniciarOrdenTrabajo(orden.id)
    API->>BE: POST .../:id/iniciar (JwtAuthGuard)
    BE-->>API: 200 (order + pendiente detalles cascaded to en_proceso)
    API-->>KA: resolved
    KA->>PG: onActionSuccess()  // loadPanel() re-fetch fires
    KA->>RT: router.push(`/ordenes-trabajo/:id/trabajo`)
    Note over KA,RT: navigation typically unmounts the panel before the<br/>re-fetch resolves — harmless, byte-identical to the list page
    alt iniciar fails
        BE-->>API: 4xx/5xx
        API-->>KA: throws
        KA->>U: showError(...) ; setIniciando(false) ; return (NO navigate, NO re-fetch)
    end
```

### 7.2 Desactivar (confirm → PATCH → toast → re-fetch → card vanishes)

```mermaid
sequenceDiagram
    actor U as Supervisor
    participant KA as KanbanCardActions
    participant SW as showConfirm (sweetalert)
    participant API as updateOrdenTrabajo(id, payload)
    participant BE as PATCH /ordenes-trabajo/:id
    participant PG as page.tsx loadPanel()
    participant BD as KanbanBoard (next render)

    U->>KA: click ellipsis → menu opens → click "Desactivar"
    KA->>KA: closeMenu()
    KA->>SW: showConfirm({ title:'Desactivar orden', confirmButtonColor:'#e11d48' })
    alt user cancels
        SW-->>KA: false → return (NO API call, card unchanged)
    else user confirms
        SW-->>KA: true
        KA->>KA: setDesactivando(true)
        KA->>API: updateOrdenTrabajo(id, { ...full fields, activo:false })  // built from props (§4)
        API->>BE: PATCH .../:id (JwtAuthGuard)
        BE-->>API: 200
        API-->>KA: resolved
        KA->>U: showSuccess('Orden desactivada', ...)
        KA->>PG: onActionSuccess()  // loadPanel() re-fetch
        PG->>BD: setResult(fresh panel) — filtered activo:true excludes the order
        BD-->>U: re-render; the deactivated card no longer appears in any column (D6)
    end
    alt PATCH fails
        BE-->>API: 4xx/5xx
        API-->>KA: throws
        KA->>U: showError(...)  // NO re-fetch, card stays
    end
```

---

## 8. Architecture Decision Records

### ADR-A — New sibling file `KanbanCardActions.tsx`, not inlined in `KanbanBoard.tsx`
**Decision:** implement the dropdown as a new `'use client'` component
`panel/KanbanCardActions.tsx`; `KanbanBoard.tsx` only threads `onActionSuccess` and mounts the leaf in
`KanbanCard`'s header. **Why:** `KanbanBoard.tsx` is a compact presentational module (maps + three pure
components, zero hooks); the actions cluster adds ~150 lines of stateful/portal/router logic that would
dilute that file's single responsibility. A sibling file mirrors the sibling `panel-trabajo-mecanicos`
change's `MecanicosWorkload.tsx` new-file precedent and keeps the diff to `KanbanBoard.tsx` mechanical
(prop pass-through + one JSX mount). **Rejected:** inline everything in `KanbanBoard.tsx` — bloats a
pure presentational file, mixes concerns, and makes the read-only→interactive rollback (proposal
Rollback Plan) messier than deleting one file. Both options honor D3/D7 (still inside `panel/`, list
page untouched); the file boundary is purely a cohesion call.

### ADR-B — Re-implement the dropdown positioning verbatim (copy, no structural simplification)
**Decision:** copy `AccionesMenu`'s exact portal + `getBoundingClientRect()` + upward-flip +
outside-click/resize/scroll-capture logic into `KanbanCardActions`, unchanged, rather than importing it
or "simplifying" it for the narrower use case. **Why:** D3/D7 forbid importing from / editing the list
page, and the positioning math is already the minimal correct implementation — it is viewport-relative,
so it works unmodified inside the board's `overflow-x-auto` container (the portal escapes the clip; the
capture-phase `scroll` listener closes the menu on board scroll; see §5). Re-deriving or trimming it
would risk the exact "menu clipped / mispositioned inside the scroll region" bug the copied logic
already avoids. The only deliberate deltas are **content** (three panel-specific items) and the
**deactivate-only narrowing** (ADR-E) — not the mechanics. **Rejected:** extract a shared
`AccionesMenu` module imported by both surfaces — breaks D7, forces edits to the untouched list page,
and enlarges the review surface for a panel-scoped change (proposal Approach, "Rejected: extract a
shared component").

### ADR-C — Desactivar payload assembled from the card's props alone; no `getOrdenTrabajo(id)` prefetch
**Decision:** build the full `updateOrdenTrabajo` payload directly from the card's
`OrdenTrabajoListItem`, deriving `tipoServicioIds` via `orden.tiposServicio.map((t) => t.id)`; issue
**no** extra `getOrdenTrabajo(id)` fetch. **Why:** this resolves the question the proposal flagged for
design. Auditing the actual `OrdenTrabajoListItem` type (`lib/ordenes-trabajo.ts:8-31`) against the
list page's PATCH (`page.tsx:228-239`) shows **every** field is available on the card's prop (see §4
table). `tipoServicioIds` is not a bare field on `OrdenTrabajoListItem`, but it is not one on the list
page either — the list page derives it from `tiposServicio` the exact same way. So there is **no
missing field**: props-alone is sufficient and this is **not a divergence** from the proposal's
assumption ("the Desactivar payload is assembled from data already in hand"). **Rejected:**
`getOrdenTrabajo(id)` before PATCH — adds a round-trip and a new failure/loading mode purely to
re-fetch data the card already holds; no field justifies it.

### ADR-D — Editar is a plain `<Link>` with no `onActionSuccess` wiring
**Decision:** Editar renders as `<Link href="/ordenes-trabajo/editar/:id">` that closes the menu and
navigates; it neither receives nor calls `onActionSuccess`. **Why:** Editar performs **no mutation** —
it navigates away to the edit route, unmounting the panel. A re-fetch would be pointless (nothing on
the board changed) and could even fire during component teardown. This mirrors the list page exactly,
whose Editar `<Link>` also has no `onToggled`/`onIniciado` callback. Only the two mutating branches
(Iniciar-`pendiente`, Desactivar) reconcile state. **Rejected:** wire a callback to Editar for
symmetry — reconciles nothing and adds a spurious re-fetch on navigation.

### ADR-E — Deactivate-only menu + `cancelado`-guarded Iniciar (narrowing vs. the list page's toggle)
**Decision:** the menu renders a single static "Desactivar" item (no `orden.activo` conditional, no
Activar/`CheckCircleIcon` branch), and guards Iniciar behind `orden.estado !== 'cancelado'`. **Why:**
the panel's `buildPanelOrdenTrabajoWhere` forces `activo: true`, so a card on this board is **always
active** — a dual Activar/Desactivar toggle would have a permanently-dead Activar branch, so it is
dropped. And D1 fixes that `cancelado` cards must not offer Iniciar (a cancelled order has nothing to
work on; for non-`pendiente` estados Iniciar is pure navigation, which is meaningless there). Both are
panel-specific invariants that let the menu be *simpler* than the list page's, not a behavioral
contradiction of it. **Rejected:** copy the list page's dual-direction toggle verbatim — carries a
dead Activar branch that can never render on this board and contradicts D1's `cancelado` rule.

---

## 9. Testing Strategy

Per `openspec/config.yaml` no test runner is configured (`strict_tdd: false`, `test_command: ""`). No
automated tests are added; `sdd-verify` performs manual checks via the dev server and `npm run build`,
mirroring the sibling design's §5 format.

| Check | Steps |
|-------|-------|
| Iniciar on `pendiente` | Open a `pendiente` card's menu, click Iniciar → `POST /ordenes-trabajo/:id/iniciar` fires (Network tab), the panel re-fetches (`GET /ordenes-trabajo/panel`), and the app navigates to `/ordenes-trabajo/:id/trabajo`; no confirm dialog shown |
| Iniciar on `en_proceso` / `terminado` | Open the menu on an `en_proceso` and a `terminado` card, click Iniciar → **no** `iniciar` request fires, no 409, no error toast; navigates straight to `/ordenes-trabajo/:id/trabajo` |
| Iniciar absent on `cancelado` | Open a `cancelado` card's menu → the "Iniciar trabajo" item is **not** rendered; only Editar and Desactivar are present |
| Iniciar failure path | Simulate a failing `iniciar` (e.g. offline) on a `pendiente` card → `showError` toast shown, **no** navigation, **no** panel re-fetch |
| Editar navigation | Click Editar on any card → navigates to `/ordenes-trabajo/editar/:id`; no confirm dialog; no PATCH/re-fetch side effect |
| Desactivar confirm path | Click Desactivar, confirm → `PATCH /ordenes-trabajo/:id` sent with the **full** field set + `activo:false` (inspect request body), success toast shown, panel re-fetches |
| Desactivar cancel path | Click Desactivar, cancel the dialog → **no** PATCH request, card unchanged on the board |
| Deactivated card vanishes (D6) | After a confirmed Desactivar + re-fetch, the order's card no longer appears in any column; the stats row updates from the same fresh response |
| Post-action re-fetch reconciles stats + board together | After Iniciar-`pendiente` (if not navigating away first in a test build) and after Desactivar, confirm both the board buckets and the stats row reflect one fresh `GET /ordenes-trabajo/panel` response (single request, not a local splice) |
| Dropdown positioning in the scrolling board | Horizontally scroll the board, open a card's menu near the right edge and near the viewport bottom → the menu is not clipped by `overflow-x-auto`, right-aligns to the trigger, and flips upward near the bottom; scrolling the board or page while open closes the menu; clicking outside closes it |
| List page byte-diff unchanged (D7) | `git diff` shows `client/app/(dashboard)/ordenes-trabajo/page.tsx` is unmodified; no shared component was extracted |
| No new surface | No new client API function, backend endpoint, DTO, guard, migration, or dependency added; `iniciarOrdenTrabajo`/`updateOrdenTrabajo` reused unmodified |
| Build | `npm run build` passes in both `client` and `server` packages |

---

## 10. Open Questions

- [x] **Desactivar payload source — resolved (ADR-C).** The card's `OrdenTrabajoListItem` carries every
      field the list page's PATCH sends (`tipoServicioIds` derived from `tiposServicio`, exactly as the
      list page does), so the payload is built from props alone with no `getOrdenTrabajo(id)` prefetch.
      No divergence from the proposal.
- [ ] **Future refactor to a shared `ordenesActions` module.** The Editar/Iniciar/Desactivar logic now
      exists in three places (table `AccionesMenu`, card-view button, and this Kanban cluster). Per D3
      this is accepted; promotion to a shared module remains a clean future refactor for when all three
      surfaces can be touched together (proposal Known Gaps).
