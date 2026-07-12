# Design: Vehículos — Searchable Select + Inline Quick-Create

## Technical Approach

Build one from-scratch controlled combobox (`SearchableSelect`) and one schema-driven `QuickCreateModal`, both under `client/app/(dashboard)/vehiculos/`. The three entity wirings (search fn, create fn, label renderer, quick-create field schema) live in a shared `referenceSelectConfigs.tsx` so `nuevo` and `editar` consume identical config objects. This realizes the proposal's "single parameterized component" and "one consistent mini-modal mechanism" while keeping the two pages' `updateField` dirty-tracking contract untouched. No backend changes; search reuses `listBrands/listColors/listCustomers` (all accept `search`/`status`), quick-create reuses `createBrand/createColor/createCustomer`.

## File Architecture

| File | Action | Purpose |
|------|--------|---------|
| `vehiculos/SearchableSelect.tsx` | Create | Generic combobox: portal panel, debounced search, keyboard nav, hosts QuickCreateModal |
| `vehiculos/QuickCreateModal.tsx` | Create | Schema-driven form on `Modal.tsx`; collects field values → calls config `create` |
| `vehiculos/referenceSelectConfigs.tsx` | Create | Exports `marcaSelectConfig`, `colorSelectConfig`, `clienteSelectConfig` (static parts shared by both pages) |
| `vehiculos/nuevo/page.tsx` | Modify | Delete option-fetch apparatus; 3 `<select>` → 3 `<SearchableSelect>` |
| `vehiculos/editar/[id]/page.tsx` | Modify | Same swap; seed `initialLabel` from loaded vehicle |

**Rejected:** per-entity modal components (duplicated wiring; only field lists differ → one schema-driven modal). Shared `components/ui/` location deferred — proposal scopes reuse to vehiculos only; promotion is a later change.

## Component Contract

```ts
interface Option { id: number; label: string }
interface QuickCreateField {
  name: string; label: string; type: 'text' | 'select';
  options?: { value: string; label: string }[]; // select only
  required?: boolean; placeholder?: string; defaultValue?: string;
}
interface SearchableSelectProps {
  label: string; placeholder: string;
  value: number | '';                 // controlled id (parity with current <select>)
  initialLabel?: string;              // collapsed-state label for a pre-selected id (edit load)
  onChange: (id: number) => void;     // wired to parent updateField(fieldKey, id)
  search: (term: string) => Promise<Option[]>;
  create: (values: Record<string, string>) => Promise<Option>;
  quickCreate: { title: string; entityLabel: string; fields: QuickCreateField[]; prefillField?: string };
  disabled?: boolean;
}
```

Config `search` maps `list*({ search, status:'activo', page:1, pageSize:20 })` → `{ id, label }`; `create` assembles the entity payload from collected `values` and maps the created record → `Option`. Cliente config includes the `tipoIdentificacion` select seeded from `ID_TYPES`/`ID_TYPE_LABELS`.

## State Machine (SearchableSelect)

`closed` → click/focus control → `open` (compute rect, autofocus search input) → keystroke sets instant `searchInput`; 350ms debounce sets `search` → `loading` → resolve `results` (`empty` if `[]`, `error` on reject). `highlightedIndex` tracks nav within results. Enter/click on a row → `onChange(id)`, set internal `selectedLabel`, `closed`. `+ Crear` (persistent footer, prefilled from `searchInput` into `prefillField`) → `quickCreateOpen`. Modal submit → `submitting` → success: `onChange(newId)`, set label, close modal AND panel; error: message rendered inside modal, panel stays.

## Positioning / Portal

Extend the row-menu precedent (`vehiculos/page.tsx`): `getBoundingClientRect()` at open time → `position:'fixed'` coords; flip-up when `innerHeight - rect.bottom < PANEL_HEIGHT_ESTIMATE`; `createPortal(..., document.body)`; dismiss via `mousedown` outside (`triggerRef`/`panelRef`), `resize` closes.

**Scroll divergence (justified):** the row menu uses capture-phase `scroll` (`true`) to close on ANY scroll — wrong here because the results list has its own `overflow-y-auto`; a capture listener would fire on inner-list scroll and dismiss mid-browse. Use **non-capture** `window.addEventListener('scroll', close)`: `scroll` does not bubble, so inner-list scroll never reaches window while page scroll still closes the panel (acceptable — matches menu precedent, avoids stale coords). No reposition-on-scroll (jank; trigger can leave viewport).

## Keyboard Contract

`onKeyDown` lives on the **search input** (React synthetic), so handling is naturally scoped to input focus:
- `ArrowDown/Up`: move `highlightedIndex` (clamp; `preventDefault` to stop caret/page move).
- `Enter`: select `results[highlightedIndex]` (`preventDefault` to not submit the vehicle form).
- `Escape`: close panel, return focus to control — **unless `quickCreateOpen`** (see below).

`highlightedIndex` is the **single source of truth** shared by keyboard and mouse: row `onMouseEnter` sets it, arrows set it, style is `i === highlightedIndex`. No dual-state conflict. Scroll-into-view: `useEffect([highlightedIndex])` → `rowRefs[highlightedIndex]?.scrollIntoView({ block:'nearest' })` — a no-op when the row is already visible, so mouse-hover (always visible) causes no jank while keyboard nav past the fold scrolls it in.

## Escape / Nested-Escape Mechanism

**Chosen:** input-level `onKeyDown` + explicit `if (quickCreateOpen) return` guard on the combobox's Escape branch. **Why:** `Modal.tsx` registers `document.addEventListener('keydown', …)` in a `useEffect` and does **not** call `stopPropagation`, so relying on propagation order is fragile. When the modal is open its fields hold focus, so the combobox input's `onKeyDown` does not fire anyway; the guard makes this deterministic even if focus lands elsewhere. Result: modal Escape → Modal's `document` listener closes only the modal; a second Escape (panel-only) then closes the panel. No cascade, no shared timing assumption. Rejected: combobox `document` listener (would double-fire with Modal's).

## Quick-Create Field Schemas

| Entity | Fields | Create | Notes |
|--------|--------|--------|-------|
| Color | `descripcion` (text) | `createColor` | prefill `descripcion` from search term |
| Marca | `marca`, `modelo` (text) | `createBrand` | prefill `marca` |
| Cliente | `razonSocial` (text), `tipoIdentificacion` (select `ID_TYPES`), `identificacion` (text), `telefono` (text), `domicilio` (text) | `createCustomer` | prefill `razonSocial`; **409** surfaced |

Generic validation: `QuickCreateModal` checks every `required` field is non-empty (mirrors the pages' `showError('Campos incompletos', …)`); submit try/catch renders `err.message` in the reused red banner (`border-red-200 bg-red-50 … text-red-600`) inside the modal. Cliente's 409 `ConflictException('La identificación ya está registrada.')` and per-`tipoIdentificacion` format errors arrive as `Error.message` from `createCustomer` and render in that banner — no special-casing. Entity-specific copy comes from `quickCreate.title`/`entityLabel`.

## Integration Diffs (both pages)

Delete: `optionsLoading`, `brands`, `colors`, `customers` state; the `Promise.all` fetch `useEffect`; `listBrands/listColors/listCustomers` + `*ListItem` imports; `disabled={optionsLoading}` and `optionsLoading` from submit `disabled`. Add: `SearchableSelect` + the three configs imports; three `<SearchableSelect …>` in place of the `<select>` blocks, wired `value={form.marcaId}` / `onChange={(id) => updateField('marcaId', id)}`. This removes the `pageSize:100` mount fetch entirely in both files. `editar` keeps its vehicle-load effect and passes `initialLabel` (`vehicle.marca.marca + ' ' + modelo`, `descripcion`, `razonSocial`); dirty tracking, `beforeunload`, `handleCancel` unchanged because selection still flows through `updateField`.

## Testing Strategy

No test runner in `client/package.json` (only next/react/tailwind/sweetalert2) — **no automated tests added.** `sdd-verify` performs manual checks via the dev server (`run` skill / `next dev`):

| Check | Steps |
|-------|-------|
| Debounced search | Type in each select; one `list*` call ~350ms after last keystroke, `status=activo` |
| Keyboard nav | Arrows move highlight + scroll-into-view; Enter selects; mouse hover syncs highlight |
| Quick-create | Create Color/Marca/Cliente inline; new record auto-selected, both layers close |
| Cliente 409 | Duplicate `identificacion` → conflict message inside modal; panel stays open |
| Nested Escape | Escape in modal closes only modal; next Escape closes panel |
| Dirty tracking (editar) | Selecting/quick-creating marks form dirty → `beforeunload`/discard-confirm fire |

## Open Questions

- [ ] `pageSize` for the search query (default 20 — dropdown shows a bounded result set; not a proposal decision, safe default).
