# Design: Orden de Trabajo — Inline Quick-Create for the Vehículo Picker

## Technical Approach

Keep the choreography that `SearchableSelect` already proves for Cliente/Marca/Color (owns `quickCreateOpen`, suppresses its own dismiss/Escape while a create modal is up, sets the collapsed label on success) and reuse it for the vehículo case by adding ONE optional render-prop, `renderQuickCreate`, that swaps the internal generic `QuickCreateModal` for a purpose-built `VehiculoQuickCreateModal`. The mini-form composes the proven three-select layout of `vehiculos/nuevo` minus the Cliente field, injecting `form.clienteId` at submit. The only cross-cutting fix is a modal Escape stack in `Modal.tsx`, needed because this flow can stack two `Modal` instances (Nuevo vehículo → Nueva marca/color), which the current single-listener design mishandles. Frontend-only; `createVehicle` and `CreateVehicleDto` are reused as-is.

## File Architecture

| File | Action | Purpose |
|------|--------|---------|
| `ordenes-trabajo/VehiculoQuickCreateModal.tsx` | Create | Mini-form on `Modal.tsx`: Marca+Color nested `SearchableSelect`, Año/Kilometraje inputs; injects `clienteId`; calls `createVehicle` |
| `vehiculos/SearchableSelect.tsx` | Modify | Add optional `renderQuickCreate` + `createLabel` props; footer gated on `quickCreate || renderQuickCreate`; scope the stale "no inline create" comment to mecánico only |
| `ordenes-trabajo/OrdenTrabajoForm.tsx` | Modify | Pass `renderQuickCreate`/`createLabel` to the Vehículo picker (lines ~269-279) |
| `components/ui/Modal.tsx` | Modify | Module-level modal stack so only the top-most open modal answers Escape (fixes stacked-modal double-close) |

**Decision 1 — component home:** `VehiculoQuickCreateModal.tsx` lives in `ordenes-trabajo/`, not `vehiculos/`. It is a single-consumer, orden-trabajo-specific composition (no Cliente field, `clienteId` injected) — not a general vehicle create. Mirrors how `TipoServicioMultiSelect` is colocated with its only caller. `vehiculos/` stays the home of the *generic* reference-select machinery. If a second consumer ever appears, promotion is a later change.

## Component Contract (additive to `SearchableSelect`)

```ts
// Both optional, non-breaking. Existing 4 call sites pass neither → unchanged.
renderQuickCreate?: (args: {
  open: boolean;
  prefillValue: string;                 // = current searchInput
  onClose: () => void;                  // clears quickCreateOpen + refocuses search input
  onCreated: (option: Option) => void;  // onChange(id) + setSelectedLabel + close panel
}) => React.ReactNode;
createLabel?: string;                   // footer text when quickCreate is absent
```

**Decision 4 — how the picker opens the mini-form.** Chosen: the `renderQuickCreate` render-prop over (a) reusing the existing `quickCreate` field schema and (b) a fully-external button in `OrdenTrabajoForm`.

| Option | Verdict | Why |
|--------|---------|-----|
| Reuse `quickCreate` schema | Reject | `QuickCreateModal` only renders static `text`/`select` (lines 120-142); it cannot host the nested Marca/Color FK pickers |
| External button + modal in form (no `SearchableSelect` change) | Reject | Loses `SearchableSelect`'s internal `setSelectedLabel`: if a vehicle was already picked, `selectedLabel` (internal) outranks `initialLabel`, so the new label would show STALE (SearchableSelect.tsx:94,99). Also must re-implement the customer guard on the button |
| `renderQuickCreate` render-prop | **Choose** | Routes success through the SAME internal path (`onChange`+`setSelectedLabel`+`closePanel`), so label is always correct; reuses the proven `quickCreateOpen` dismiss/Escape suppression (lines 194,201,242) for the deeper nesting; footer stays in-panel (consistent with other pickers); additive + non-breaking |

`OrdenTrabajoForm` wiring:

```tsx
<SearchableSelect
  label="Vehículo" value={form.vehiculoId} initialLabel={form.vehiculoLabel}
  onChange={(id) => updateField('vehiculoId', id)}
  search={vehiculoSearch} disabled={form.clienteId === ''}
  placeholder={form.clienteId === '' ? 'Elegí primero un cliente' : 'Seleccioná un vehículo'}
  createLabel="vehículo"
  renderQuickCreate={({ open, onClose, onCreated }) => (
    <VehiculoQuickCreateModal open={open} clienteId={form.clienteId} onClose={onClose} onCreated={onCreated} />
  )}
/>
```

## Nested-Modal / Escape Contract (Decision 2)

Depth map and Escape/focus ownership:

| Layer | Element | Owns Escape when top | Focus returns to |
|-------|---------|----------------------|------------------|
| L0 | Vehículo picker panel | never while modal up — `quickCreateOpen` guard suppresses its Escape/dismiss (SearchableSelect.tsx:194,201,242) | picker search input (via `onClose`) |
| L1 | `VehiculoQuickCreateModal` (`Modal.tsx`) | yes, when no L3 open | picker search input |
| L2 | nested Marca/Color `SearchableSelect` panel | never while L3 up — its own `quickCreateOpen` guard | its own search input |
| L3 | Marca/Color `QuickCreateModal` (`Modal.tsx`) | yes, always top-most | L2 search input (existing `onClose`, SearchableSelect.tsx:362-365) |

**New problem this change surfaces:** L1 and L3 are two live `Modal.tsx` instances at once. `Modal` registers a `document` keydown listener with no `stopPropagation` (Modal.tsx:18-21), so one Escape fires BOTH `onClose`s → the vehículo modal closes underneath the marca modal (data loss). The existing `quickCreateOpen` mechanism does not cover this — it was designed for panel→single-modal (depth 2), never modal-over-modal.

**Resolution:** add a module-level LIFO stack in `Modal.tsx`. On open, push a stable token (`useId`); the keydown handler calls `onClose` ONLY when this modal's token is on top; cleanup pops. Single-modal usage is unaffected (always top). Backdrop click needs no change — the top modal's overlay paints above and its `onClick` is naturally LIFO. Rejected: a combobox-level `document` listener (double-fires with Modal's); leaving it unfixed (double-close is real data loss, and the proposal names this the primary risk to resolve).

**Nested-picker-inside-modal interference (verified, no fix needed):** the L2 panel portals to `document.body` (React-tree child of the modal). Its click-outside (`mousedown`, SearchableSelect.tsx:193-198) closes only its own panel; row clicks bubble through the React tree to the modal content div, never to the backdrop (a sibling, not an ancestor), so selecting a Marca never closes the vehículo modal.

## Customer-Not-Selected Guard (Decision 3)

No new guard code. The Vehículo picker is already `disabled={form.clienteId === ''}` with placeholder `'Elegí primero un cliente'` (OrdenTrabajoForm.tsx:272,277). A disabled trigger cannot open its panel, so the in-panel `+ Crear vehículo` footer is unreachable without a customer — the guard is inherited, and stays consistent with the existing picker behavior. (This is a further point for the in-panel render-prop over an external button, which would have to re-implement `disabled`.)

## Vehicle Create Flow (Decisions 5 & 6)

`VehiculoQuickCreateModal` fields: Marca (`marcaSelectConfig`), Color (`colorSelectConfig`), Año, Kilometraje. On submit:

1. **Client-side validation (Decision 5)** before the call, aligned to `CreateVehicleDto`: `marcaId`/`colorId` present; `anio` integer in `[1900, currentYear+1]`; `kilometraje` integer `>= 0`. Same bounds as `vehiculos/nuevo` (`MIN_ANIO`/`MAX_ANIO`). Empty-required → `showError` toast (mirrors `QuickCreateModal`); range errors → inline red banner (`border-red-200 bg-red-50 … text-red-600`). The backend DTO (400) stays the authoritative backstop, surfaced in the same banner via `createVehicle`'s thrown `Error.message`.
2. `createVehicle({ marcaId, colorId, anio, kilometraje, clienteId })` — `clienteId` from the prop, never shown.
3. **Auto-selection (Decision 6):** build `Option { id, label: \`${v.marca.marca} ${v.marca.modelo}\` }` from the returned `VehicleListItem` (label format matches `vehiculoSearch`, OrdenTrabajoForm.tsx:155) → `onCreated(option)` → `SearchableSelect` runs `onChange(id)` (= `updateField('vehiculoId', id)`) + `setSelectedLabel` + closes panel & modal. `showSuccess` fires inside the mini-form. Selection flows only through `updateField`, so editar-page dirty-tracking/`beforeunload` keep working unchanged.

## Data Flow

    OrdenTrabajoForm ─renderQuickCreate─▶ SearchableSelect(footer "+ Crear vehículo")
         │                                        │ openQuickCreate → quickCreateOpen
         │                                        ▼
         │                        VehiculoQuickCreateModal (Modal L1)
         │                          ├─ Marca/Color SearchableSelect (L2) ─▶ QuickCreateModal (L3)
         │                          └─ createVehicle({...,clienteId}) ─▶ Option
         │                                        │ onCreated(option)
         └──── updateField('vehiculoId', id) ◀────┘ (+ setSelectedLabel, close L0+L1)

## Testing Strategy

No test runner in `client/package.json` — no automated tests. `sdd-verify` does manual dev-server checks:

| Check | Steps |
|-------|-------|
| Guard | No customer → picker disabled, footer unreachable; pick customer → `+ Crear vehículo` appears |
| Happy path | Create vehicle inline → auto-selected with `marca modelo` label; appears in later customer-scoped search |
| Nested create | Open Nueva marca/color from inside the vehículo modal; created value selects into the mini-form |
| Stacked Escape | With Nueva marca open, Escape closes ONLY the marca modal; vehículo modal stays; second Escape closes it; focus returns each level |
| Validation | Año out of `[1900,currentYear+1]` / negative km → inline error; backend 400 surfaces in banner |
| Dirty (editar) | Inline-created selection marks form dirty → `beforeunload`/discard fire |

## Open Questions

- [ ] `pageSize` for nested Marca/Color search inherits config default (20) — safe, not a proposal decision.
