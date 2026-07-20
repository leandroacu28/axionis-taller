## Exploration: Kanban card actions (Iniciar / Editar / Desactivar) on `/ordenes-trabajo/panel`

### Current State

**`iniciar` flow (backend — the most consequential piece):**
- Route: `POST /ordenes-trabajo/:id/iniciar`, `@HttpCode(200)`, guarded only by class-level `JwtAuthGuard` — `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts:125-132`.
- Service: `OrdenesTrabajoService.iniciar(id, actualizadoPorId)` — `server/src/ordenes-trabajo/ordenes-trabajo.service.ts:582-620`. Confirmed exactly:
  - 404 `NotFoundException` if the order doesn't exist.
  - Race-free guard via `updateMany({ where: { id, estado: 'pendiente' }, data: { estado: 'en_proceso', ... } })`; if `count === 0` (order exists but isn't `pendiente`), throws `409 ConflictException('La orden ya fue iniciada o no está pendiente.')`.
  - Cascades: `ordenTrabajoTipoServicio.updateMany({ where: { ordenTrabajoId: id, estado: 'pendiente' }, data: { estado: 'en_proceso', ... } })` — only still-`pendiente` detalles advance; detalles already `en_proceso`/`terminado`/`cancelado` are untouched. Confirmed also as the ratified spec at `openspec/specs/ordenes-trabajo-iniciar/spec.md` ("Iniciar Atomically Cascades Only Pending Detalles", "Iniciar Guards on Current Order State").
  - Returns the standard `mapOrdenTrabajo` shape, same as `GET /ordenes-trabajo/:id`.
- Client function: `iniciarOrdenTrabajo(id)` — `client/app/lib/ordenes-trabajo.ts:138-144` — `POST` with no body.
- Existing UI trigger: `IniciarTrabajoButton` — `client/app/(dashboard)/ordenes-trabajo/page.tsx:96-155`. Dual behavior by design (comment at lines 88-95): if `orden.estado === 'pendiente'`, calls `iniciarOrdenTrabajo` then navigates to `/ordenes-trabajo/${id}/trabajo`; for any other estado it's pure navigation (no API call — calling iniciar again would just 409). Two variants: `'card'` (standalone button, tarjetas view) and `'menu-item'` (inside the dropdown, table view). Shared component so behavior can't drift between table/tarjetas — a strong precedent for a third `'kanban-card'`-style reuse.

**`editar` flow:** Plain `<Link href={`/ordenes-trabajo/editar/${orden.id}`}>` inside `AccionesMenu` — `page.tsx:319-325`. Confirmed full-page navigation, not a modal: `client/app/(dashboard)/ordenes-trabajo/editar/[id]/page.tsx` is a standalone route that `getOrdenTrabajo(id)`-loads and renders `OrdenTrabajoForm`. No special "preserve filter state" handling exists anywhere else in the codebase for outbound edit links — this is a plain, unremarkable `<Link>`, directly reusable as-is.

**`desactivar` flow:** `AccionesMenu.handleToggleActivo` — `page.tsx:210-253`. Confirmed exact mechanics:
- Confirmation only on deactivate (not on reactivate) via `showConfirm({ title: 'Desactivar orden', text: ..., confirmButtonText: 'Sí, desactivar', confirmButtonColor: '#e11d48' })` from `client/app/lib/alerts.ts:36-62` (SweetAlert2-backed, `isConfirmed` boolean return).
- On confirm, calls `updateOrdenTrabajo(orden.id, { ...all required fields..., activo: false })` — a generic `PATCH /ordenes-trabajo/:id` that **resends the entire order payload** (fechaIngreso, kilometros, prioridad, motivoIngreso, estado, clienteId, vehiculoId, mecanicoId, tipoServicioIds) with only `activo` flipped. This mirrors the edit form's checkbox contract exactly, just without a page visit.
- **Server-side note:** `UpdateOrdenTrabajoDto` fields are `@IsOptional()` — a minimal `{ activo: false }` PATCH would technically validate. The existing frontend convention resends the full object defensively/consistently with the edit form, but a Kanban card (which already has the full `OrdenTrabajoListItem` in hand from the panel's `data`) could do either.
- `showSuccess`/`showError` toasts (bottom-end, 3s auto-dismiss) follow.

**Actions menu UI pattern (`AccionesMenu`, `page.tsx:164-359`):** A portal-rendered (`createPortal(..., document.body)`) dropdown, confirmed containing exactly three items today: **Editar** (Link), **Iniciar trabajo** (conditional on `showIniciarTrabajo` prop), and **Activar/Desactivar** toggle. Position computed from the trigger's `getBoundingClientRect()`, flips upward if `window.innerHeight - rect.bottom < 130`, closes on outside-click/resize/scroll. Two trigger variants: `'icon'` (ellipsis, table) and `'label'` ("Opciones" + chevron, tarjetas). This is the strongest reuse candidate — it is not a generic exported component, it's a private function inside `page.tsx`, so lifting it into the panel means either (a) exporting/importing it (contradicts D7's "re-declare per surface, don't extract a shared module" convention established by both sibling changes) or (b) re-declaring an equivalent component in the panel's own files.

**Current `KanbanCard`:** `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx:65-108`. Fully presentational — confirmed zero `onClick`/event handlers anywhere in the file. Props are just `{ orden: OrdenTrabajoListItem }`. Re-declares its own `ESTADO_LABELS`/`PRIORIDAD_LABELS`/`PRIORIDAD_BADGE_CLASSES`/`formatFecha`/`mecanicoLabel` per the established D7 duplication convention, rather than importing from the list page.

**Panel page state (`panel/page.tsx`):** `loadPanel()` (lines 98-122) is the single re-fetch function, called on mount and on every filter-dependency change. It is **not currently exposed as a card-action callback** — there's no analog to the list page's `onIniciado={loadOrdenes}` / `onToggled={loadOrdenes}` wiring, since the board is read-only today. The list page's own convention is unambiguous: **re-fetch the whole list after any mutation**, never local splice/optimistic update. `MecanicosWorkload`'s independent `loadWorkload()` is a second, unrelated fetch — not directly relevant to card actions but shows the codebase is comfortable with two independent fetch lifecycles on one page.

**`activo` filter reminder — confirmed:** `buildPanelOrdenTrabajoWhere` forces `activo: true` unconditionally (confirmed in the ratified spec's "Soft-Deactivated Orders Are Excluded Throughout the Panel" requirement: *"The panel MUST NOT expose its own activo/status toggle; ... there is no way to view deactivated orders through the panel."*). So a successful "Desactivar" from a Kanban card, followed by the standard re-fetch-the-whole-panel pattern, makes the card **disappear from the board entirely** — not an in-place badge change like the list page's tarjetas view (which shows an "Inactiva" pill while keeping the row visible, because the list page's own `activoFilter` defaults to `'activo'` but can be widened — the panel has no such toggle at all).

**Spec conflict — confirmed and precise:** `openspec/specs/ordenes-trabajo-panel/spec.md` (via `panel-trabajo`'s delta) contains: *"### Requirement: Board Is Read-Only With No New Drag-and-Drop Dependency — Kanban cards MUST NOT support drag-to-change-estado or any other write interaction..."* — "or any other write interaction" is the literal phrase that a card-level Iniciar/Editar/Desactivar action would violate under a strict reading. The requirement's own two scenarios are specifically about **dragging** and **no new DnD dependency** — this change needs a `sdd-spec` delta that narrows the requirement's title/text to something like "No Drag-and-Drop; Explicit Action Controls Are Permitted" so the DnD-specific scenarios remain true while the "or any other write interaction" phrase is explicitly superseded, not silently contradicted.

### Affected Areas
- `client/app/(dashboard)/ordenes-trabajo/panel/KanbanBoard.tsx` — `KanbanCard` needs an actions trigger + handlers; currently pure presentational, no event plumbing exists.
- `client/app/(dashboard)/ordenes-trabajo/panel/page.tsx` — needs an `onActionSuccess`-style callback wired to `loadPanel()` (or a lighter local-state variant), passed down through `KanbanBoard` → `KanbanCard`.
- `client/app/(dashboard)/ordenes-trabajo/page.tsx` — read-only reference for the exact `AccionesMenu`/`IniciarTrabajoButton` implementation to mirror; not modified by this change per every sibling change's D7 "list page untouched" convention.
- `client/app/lib/ordenes-trabajo.ts` — `iniciarOrdenTrabajo` and `updateOrdenTrabajo` already exist and are reusable as-is; no new API functions needed unless a partial-PATCH deactivate helper is introduced.
- `client/app/lib/alerts.ts` — `showConfirm`/`showSuccess`/`showError` reusable as-is.
- `openspec/specs/ordenes-trabajo-panel/spec.md` (via this change's delta) — the "Board Is Read-Only With No New Drag-and-Drop Dependency" requirement needs a superseding delta.
- No backend changes are anticipated — `iniciar`, `update` (PATCH), and their DTOs are already generic enough to serve a new caller surface without modification.

### Open Questions (for `sdd-propose`)
1. Does "Iniciar" render only on `pendiente`-column cards, or on every card with contextual disable/hide? This directly supersedes D2 from `panel-trabajo` — flag D2 as explicitly overridden by this change, not silently dropped.
2. Does triggering `iniciar` from the Kanban need different confirmation/copy than today's `IniciarTrabajoButton` (which shows no confirmation dialog at all, just a loading state), or should it be byte-identical UX?
3. Post-action refresh strategy: whole-panel re-fetch via `loadPanel()` (matches every existing convention) vs. optimistic local bucket update. **Recommend re-fetch** given precedent, but flag the tradeoff.
4. Does "Editar" need any confirm-before-navigate gate given panel filter state loss? Recommend a plain `<Link>`, no special handling — but note explicitly since the panel's filter state is comparatively richer (5 controls) than the list page's.
5. Spec reconciliation: `sdd-spec` needs an explicit delta against the "Board Is Read-Only With No New Drag-and-Drop Dependency" requirement — narrow it to drag-and-drop specifically and add new requirements/scenarios for the three new card actions.
6. Deactivate payload shape: reuse the existing full-object-resend `updateOrdenTrabajo` pattern (byte-identical to `AccionesMenu.handleToggleActivo`, zero new backend surface) vs. a new minimal `{ activo: false }` PATCH. Recommend matching the existing full-resend convention for consistency, but flag as an open choice.
7. Does the vanish-on-desactivar UX (card disappears from its column entirely) need any transition/toast beyond the existing `showSuccess` toast, given it's a more visually disruptive change than the list page's in-place "Inactiva" pill?

### Approaches

1. **Re-implement a lighter per-card menu/actions cluster inside `KanbanBoard.tsx`, following the D7 duplication convention.**
   - Description: Add a compact actions trigger directly in `KanbanCard`, re-declaring only what's needed — a simplified version of `AccionesMenu` (Editar link, conditional Iniciar button, Desactivar with confirm) scoped to the panel's own file.
   - Pros: Fully consistent with the established D7/§2.3 convention across both sibling changes; no risk of destabilizing the untouched list page; can be tailored to the Kanban card's tighter layout; smaller/cheaper `sdd-design`.
   - Cons: A third copy of "Editar link + conditional Iniciar + Desactivar-with-confirm" logic to maintain in parallel with `page.tsx`'s; the `iniciar()` dual-behavior nuance must be replicated correctly, which is easy to get subtly wrong if not copied carefully.
   - Effort: Low–Medium.

2. **Extract `AccionesMenu`/`IniciarTrabajoButton` into a shared component and import it into both the list page and the Kanban card, breaking D7 deliberately.**
   - Description: Move the two components (or a generalized version) out of `page.tsx` into a shared file, imported by both the list page and `KanbanBoard.tsx`.
   - Pros: Single source of truth for the `iniciar` dual-behavior logic and the deactivate-confirm flow — eliminates drift risk.
   - Cons: Requires editing `page.tsx` (the untouched list page) — directly contradicts every sibling change's explicit D7 decision; breaks precedent set twice already; larger diff and larger review surface.
   - Effort: Medium.

### Recommendation
Approach 1 (re-implement per D7) is more consistent with the codebase's established convention across both prior changes on this exact page, and keeps the change additive with zero risk to the untouched list page. Final call belongs to `sdd-propose`, but the precedent strongly favors duplication here.

### Risks
- Silently overturning D2 ("Kanban is read-only... no write interactions") without an explicit spec delta would leave the sibling spec's requirement internally contradicted by the new behavior — must be addressed as a spec delta in `sdd-spec`.
- Incorrectly replicating `iniciar()`'s dual-behavior/409-swallowing logic could produce a visible error toast on an order that's already `en_proceso`, when the existing UI treats that case as silent pure-navigation.
- The panel's unconditional `activo: true` filter means "Desactivar" causes a full card disappearance on next fetch — worth confirming product intent explicitly rather than assuming parity with the list page.
- Card-level actions on a Kanban column with many cards could crowd tight card real estate; needs a `sdd-design` UI decision (icon-only trigger vs. inline buttons vs. hover-reveal).

### Ready for Proposal
Yes — the reusable pieces (`iniciarOrdenTrabajo`, `updateOrdenTrabajo`, `showConfirm`/`showSuccess`/`showError`, the plain `<Link>` edit pattern, and the exact `iniciar()` guard/cascade semantics) are all confirmed and unambiguous. The one item `sdd-propose` must resolve explicitly is the D2-supersession + spec-delta framing, since it's a deliberate reversal of a documented prior decision, not a gap.
