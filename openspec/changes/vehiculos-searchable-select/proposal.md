# Proposal: Vehículos — Searchable Select + Inline Quick-Create for Marca/Color/Cliente

## Intent
The vehicle create/edit forms (`vehiculos/nuevo/page.tsx`, `vehiculos/editar/[id]/page.tsx`) pick Marca, Color, and Cliente through plain native `<select>` elements populated by a one-shot `pageSize: 100` fetch-everything-on-mount. This does not scale and blocks a real workflow:

- **No search**: a native select forces linear scan/scroll through up to 100 options; past ~100 active records the list silently truncates (the `pageSize: 100` cap), so a valid Marca/Color/Cliente can be simply unreachable from the form.
- **No inline create**: when the record does not exist yet (a brand-new customer walking in, a color/brand never registered before), the only path today is to leave the vehicle form, go to the entity's own `/nuevo` page, create it, and come back — losing all in-progress vehicle-form data (and, on the edit page, tripping the `beforeunload` guard). This is the real operational pain: capturing a vehicle is interrupted by a bookkeeping detour.

Success looks like: from inside the vehicle form, the operator can type to search each of the three references (server-side, debounced), navigate results by keyboard or mouse, and — when the record does not exist — create it inline via a quick-create mini-modal that reuses the exact same validation/error paths as the dedicated create pages, with the new record auto-selected and the form's other fields untouched.

## Scope

### In Scope
- **Two pages only**: `client/app/(dashboard)/vehiculos/nuevo/page.tsx` and `client/app/(dashboard)/vehiculos/editar/[id]/page.tsx` — specifically their three reference selects (`marcaId`, `colorId`, `clienteId`).
- **One reusable component**: a single from-scratch `SearchableSelect` (name final at design time), parameterized per entity, used three times on each of the two pages (six instances total). Parameters: field label, current value + display label, a `search(term)` function, a `create` handler, an option renderer, and a quick-create field-set descriptor.
- **Server-side search-as-you-type**: each select's text input queries the entity's existing `list*` endpoint (`listBrands`/`listColors`/`listCustomers`, all confirmed to accept a `search` query param and forwarded to the server `list-*-query.dto.ts`), always scoped `status: 'activo'`, debounced with this codebase's established 350ms two-state pattern (`searchInput` instant / `search` debounced — the exact interval and shape from `vehiculos/page.tsx` lines 81–92). This replaces the one-shot `pageSize: 100` fetch-on-mount **for these three selects only**.
- **Inline quick-create for all three entities via one consistent mini-modal mechanism** built on the existing `client/app/components/ui/Modal.tsx`. Same UX family for all three; only the field set differs per entity:
  - **Color** — 1 field: `descripcion`. Via `createColor`.
  - **Marca** — 2 fields: `marca`, `modelo`. Via `createBrand`.
  - **Cliente** — 5 fields: `razonSocial`, `tipoIdentificacion` (enum select `dni|cuit|cuil`), `identificacion`, `telefono`, `domicilio`. Same validation as `/clientes/nuevo`, via `createCustomer`, including surfacing the duplicate-`identificacion` 409 `ConflictException` message to the user.
- **Keyboard navigation** (required in this scope, see Approach for exact behavior): Arrow Up/Down move the highlight through filtered options, Enter selects the highlighted option, Escape closes the dropdown. Nested-escape behavior with the quick-create modal is explicitly resolved below.
- **Dirty-tracking integration**: selecting an option (existing or freshly created) updates `FormState` through the same `updateField` setter the current `<select onChange>` uses, so the edit page's `isFormDirty`/`beforeunload`/discard-confirm keep working unmodified.

### Out of Scope / Non-Goals
- **The colores/marcas/clientes list pages** (`/(dashboard)/colores/page.tsx`, `/marcas/page.tsx`, `/clientes/page.tsx`) and their own filtering/CRUD modals (`ColorFormModal.tsx`, `BrandFormModal.tsx`) — untouched.
- **Any other form or select in the app** — grep confirmed the vehiculos create/edit forms are the only call sites consuming all three entities as cross-referenced selects. Not generalizing the new component elsewhere in this change even though it is structurally reusable (natural follow-up, not this change).
- **Backend**: no DTO, validator, service, or endpoint changes. The `search` param, `status` filter, and Cliente's `identificacion` uniqueness + per-`tipoIdentificacion` regex all already exist and are reused as-is. Frontend-only change.
- **The `activo` status filter behavior** — the quick-create and search stay scoped to `status: 'activo'` exactly as the current fetch does; not adding an inactive-inclusion toggle.
- **Server-side pagination beyond the debounced search call** — not adding infinite scroll, page controls, or a "load more" affordance inside the dropdown; the search box + `status: 'activo'` query is the entire data-fetch surface for these selects.
- **Cliente edit/full-CRUD from inside the vehicle form** — quick-create only; no inline edit/deactivate of an existing referenced record.

## Capabilities
### New Capabilities
- `vehiculos-searchable-select`: a searchable, keyboard-navigable reference picker with inline quick-create for the vehicle form's Marca/Color/Cliente fields, frontend-only, reusing existing list/create endpoints.

### Modified Capabilities
- None. No existing spec's behavior contract changes; the vehicle create/update endpoints and the three entities' create endpoints keep their current shape.

## Approach

**Single parameterized component.** One `SearchableSelect` is built once and instantiated per entity with a small config (label, value/displayLabel, `search`, `create`, option renderer, quick-create field set). Three different purpose-built components were rejected: the search + keyboard + portal-positioning + dismiss machinery is identical across all three and is the expensive part; only the option renderer and the quick-create field set legitimately differ, and those are cheap parameters. This keeps one consistent, testable interaction model instead of three drifting ones.

**Interaction model, end to end:**
1. **Open** — clicking/focusing the control opens a floating panel positioned by reusing the vehiculos row-menu precedent (`getBoundingClientRect()` at open time → fixed coordinates, flip-up when near the viewport bottom, rendered via `createPortal` to `document.body`, dismissed via a `mousedown`-outside listener and closed on `scroll`/`resize`). The panel contains a text input (autofocused) and a scrollable results list.
2. **Search** — typing updates an instant `searchInput` state; 350ms after the last keystroke a debounced `search` state fires the entity's `list*({ search, status: 'activo', page: 1, pageSize: ... })` call. Results render in the scrollable list with the entity's option renderer (`marca + ' ' + modelo`, `descripcion`, `razonSocial`).
3. **Select** — a result is chosen by mouse click or by keyboard (Arrow Up/Down move a highlight index, Enter selects the highlighted row). Selecting calls the parent's `updateField(fieldKey, id)` and closes the panel.
4. **Quick-create affordance** — a persistent `+ Crear <entity>` action is always shown at the bottom of the panel (not only on zero-results). Rationale: a persistent affordance is discoverable and removes a race between the debounced search settling and the user deciding to create; it also covers the common case where a similar-but-different record exists (search returns matches, but none is the one the operator needs). When the search term already looks like intended input, the quick-create modal can prefill the most natural field from it (e.g. Color `descripcion`, Cliente `razonSocial`) — detail deferred to design.
5. **Quick-create modal** — the action opens the entity's mini-modal (built on `Modal.tsx`) with the entity's field set. Submit calls the exact same `createColor`/`createBrand`/`createCustomer` used by the dedicated pages and surfaces the exact same error paths — notably Cliente's 409 `ConflictException('La identificación ya está registrada.')` and the per-`tipoIdentificacion` format validation. On success, the returned record is auto-selected in the parent form (`updateField` with the new `id`) and both the modal and the combobox panel close.

**Escape / nested-escape behavior (resolved, unambiguous):**
- Combobox panel open, no modal: **Escape closes the panel** and returns focus to the control. It does not clear the current selection.
- Quick-create modal open (on top of the panel): **Escape closes only the modal**, leaving the combobox panel open with focus returned to its search input. Escape does not cascade to also close the panel in the same keypress. This is enforced by the modal owning the topmost Escape handler while open (consistent with `Modal.tsx` already registering its own `document`-level `keydown` Escape listener) and the combobox suppressing its own Escape handling while a child modal is mounted.
- A second Escape (now that only the panel is open) then closes the panel per the first rule.

**Dirty-tracking.** The component is a controlled input: it never mutates `FormState` directly, it only calls the parent-supplied `updateField(fieldKey, value)`. On `nuevo` the flat `FormState` update is a no-op concern (no dirty tracking). On `editar`, because the value flows through the same setter the native `<select>` used, `initialFormRef`'s shallow comparison, `isFormDirty()`, the `beforeunload` listener, and the Cancel `showConfirm` all keep working with zero changes to that page's dirty apparatus. A freshly quick-created record selected into the form marks the form dirty exactly as picking any other option would.

## Known Gaps / Accepted Tradeoffs
- **From-scratch accessible combobox is the main cost.** This codebase has no combobox/autocomplete library (`package.json` confirms only `next`, `react`, `react-dom`, `sweetalert2`) and no existing dropdown anywhere supports keyboard navigation — the row-menu precedent has none. Building keyboard nav + focus management + portal positioning + outside-dismiss correctly is the highest-effort part of this change and the most likely place for subtle bugs (focus traps, highlight/scroll sync, nested-escape). Called out explicitly so it is a visible, budgeted risk rather than a surprise in apply.
- **Search hits the network per settled keystroke burst.** Replacing the fetch-once model with debounced server search trades one upfront request for N-on-typing requests. Accepted: 350ms debounce + `status: 'activo'` scoping keeps volume modest, and it removes the silent `pageSize: 100` truncation bug for these fields.
- **Cliente quick-create reproduces `/clientes/nuevo` validation in a second place.** The mini-modal must mirror the same field validation the dedicated page enforces. Reusing `createCustomer` and the shared `ID_TYPES`/`identificacion` client constants keeps them aligned, but the form-field wiring is duplicated UI. Accepted as the cost of not making the operator leave the form.

## Spec Changes Required
- New capability spec `vehiculos-searchable-select` (or folded into the existing vehiculos form spec at design time) describing the searchable-select + inline quick-create behavior, keyboard/escape contract, and the frontend-only reuse of existing endpoints. No existing spec's requirements are amended — the backend contracts are unchanged.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| From-scratch accessible combobox (keyboard nav, focus management, portal positioning, nested-escape) ships with subtle UX/focus bugs | Med–High | Highest-effort item; `sdd-design` specs the exact keyboard/escape/focus contract and dismiss rules before apply, and it is built once (one component) not three times |
| Nested Escape closes both modal and panel in one keypress (or wrong layer) | Med | Explicit resolution above: modal owns topmost Escape while mounted; combobox suppresses its Escape handler while a child modal is open — specced, not left to implementation |
| Debounced search regresses perceived responsiveness vs. instant local filter | Low | Reuse the proven 350ms two-state pattern already accepted elsewhere in vehiculos; instant `searchInput` echo keeps the field responsive while results settle |
| Quick-created record not auto-selected / form left inconsistent | Low | Create handler returns the new record; component selects it via the same `updateField` path and closes both layers on success |
| Edit-page dirty tracking breaks because selection bypasses `updateField` | Low | Component is controlled and only calls parent `updateField`; no direct `FormState` mutation, so `isFormDirty`/`beforeunload`/discard-confirm stay untouched |
| Cliente 409 duplicate-`identificacion` not surfaced inside the modal | Low | Modal reuses `createCustomer` and surfaces its thrown message exactly as `/clientes/nuevo` does |

## Success Criteria
- [ ] Each of the three vehicle-form selects (on both `nuevo` and `editar`) opens a floating panel with a search input; typing triggers a 350ms-debounced `list*` call scoped `status: 'activo'` and renders results.
- [ ] Arrow Up/Down move the highlighted option, Enter selects it, mouse click selects it; Escape closes the panel and returns focus to the control.
- [ ] A persistent `+ Crear <entity>` action opens the entity's quick-create mini-modal (Color 1 field, Marca 2 fields, Cliente 5 fields) built on `Modal.tsx`.
- [ ] Quick-create calls the existing `createColor`/`createBrand`/`createCustomer`; on success the new record is auto-selected in the form and both modal and panel close.
- [ ] Cliente quick-create surfaces the same validation and the 409 duplicate-`identificacion` message as `/clientes/nuevo`.
- [ ] Escape inside the quick-create modal closes only the modal (panel stays open, focus returns to search input); a subsequent Escape closes the panel.
- [ ] On `editar/[id]`, selecting an option (existing or freshly created) marks the form dirty and triggers `beforeunload`/discard-confirm exactly as the native `<select>` did — no change to that page's dirty apparatus.
- [ ] No backend files (DTOs, validators, services, controllers) are modified; the `pageSize: 100` fetch-on-mount is removed only for these three selects.
