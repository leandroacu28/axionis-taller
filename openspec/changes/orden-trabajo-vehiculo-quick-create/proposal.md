# Proposal: Orden de Trabajo — Inline Quick-Create for the Vehículo Picker

## Intent
On `/(dashboard)/ordenes-trabajo/nuevo` (and its shared sibling `/(dashboard)/ordenes-trabajo/editar/[id]`), the "Vehículo" field is a `SearchableSelect` whose `search` (`vehiculoSearch`) already scopes results to the currently chosen customer (`listVehicles({ clienteId: form.clienteId, ... })`). Today that picker is intentionally wired WITHOUT the `create`/`quickCreate` props, per an original design note in `SearchableSelect.tsx` ("used by pickers where inline creation doesn't make sense (e.g. mecánico, vehículo)"). That past decision is now explicitly invalidated for the vehículo case by this request.

The operational pain: when the selected customer has no vehicle yet registered (a brand-new car, a first-time visit, a vehicle never captured before), the operator has to abandon the work-order form, walk over to `/vehiculos/nuevo`, create the vehicle, then come back and rebuild the order. The work-order capture is interrupted by a bookkeeping detour, and any in-progress order data is at risk.

Success looks like: from inside the work-order form, when the customer's vehicle does not exist yet, the operator can create it inline — without leaving the form — via a compact "alta rápida de vehículo" flow. The customer is already known (`form.clienteId`) and must NOT be asked again. On success, the freshly created vehicle is auto-selected into the order's `vehiculoId`, and the rest of the form is untouched.

## Scope

### In Scope
- **One picker, one component call site**: the "Vehículo" `SearchableSelect` inside `client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx` (lines ~147-156 for `vehiculoSearch`, ~269-279 for the render). This single component is shared by both `ordenes-trabajo/nuevo` and `ordenes-trabajo/editar/[id]`, so the capability lands on both pages at once through that one edit.
- **Revert the "no inline create for vehículo" decision** for this picker: wire the `create`/`quickCreate` mechanism onto the Vehículo `SearchableSelect` (it is already the mechanism used for Cliente/Marca/Color elsewhere).
- **A dedicated "alta rápida de vehículo" mini-form** (see Approach for why NOT the generic `QuickCreateModal`), mounted on the existing `client/app/components/ui/Modal.tsx`, containing:
  - **Marca** — a nested `SearchableSelect` driven by `marcaSelectConfig` (inherits Marca's own quick-create for free).
  - **Color** — a nested `SearchableSelect` driven by `colorSelectConfig` (inherits Color's own quick-create for free).
  - **Año** — numeric input (`anio`).
  - **Kilometraje** — numeric input (`kilometraje`).
  - **NO Cliente field** — the customer is fixed to the order's `form.clienteId` and injected at submit time; it is never shown or asked.
- **Submit path**: on submit, call the existing `createVehicle` (`client/app/lib/vehicles.ts`) with `CreateVehiclePayload { marcaId, colorId, anio, kilometraje, clienteId: form.clienteId }`. On success, auto-select the returned vehicle's `id` into the order form's `vehiculoId` and close the mini-form.
- **Customer-scoped consistency**: because `vehiculoSearch` already scopes by `clienteId`, the inline-created vehicle (created with that same `clienteId`) will correctly appear in subsequent searches for that customer.
- **Guarding the customer-not-selected state**: the quick-create affordance must only be usable when `form.clienteId` is set (a vehicle cannot be created without a customer). Behavior when no customer is chosen yet is resolved in Approach.

### Out of Scope / Non-Goals
- **Backend**: no changes. `POST /vehicles` already accepts the full payload; `CreateVehicleDto` (`marcaId`/`colorId` `@IsInt` FKs, `anio` `@IsInt @Min(1900) @Max(currentYear+1)`, `kilometraje` `@IsInt @Min(0)`, `clienteId` `@IsInt`, `activo?` optional) is reused as-is. Frontend-only change.
- **`vehiculos/nuevo` and `vehiculos/editar/[id]`** — already resolved by the prior `vehiculos-searchable-select` change; untouched.
- **The generic `QuickCreateModal` / `QuickCreateField`** — NOT modified (this is a consequence of choosing Approach option (a); see below). The three entities already in production that depend on it (`marcaSelectConfig`, `colorSelectConfig`, `clienteSelectConfig`) keep their exact current behavior.
- **The Cliente/Marca/Color pickers inside `OrdenTrabajoForm.tsx`** — unchanged. The Cliente picker already has its own quick-create via `clienteSelectConfig`; Marca/Color are reused as-is inside the new vehicle mini-form.
- **The mecánico picker** — the original "no inline create" note also covered mecánico; this change does NOT touch mecánico. Only the vehículo decision is being reverted.
- **Editing/deactivating an existing vehicle from inside the order form** — quick-create only; no inline edit.
- **A general-purpose "reference select inside a modal" abstraction** — deliberately not built here (that is Approach option (b), rejected below).

## Capabilities
### New Capabilities
- `orden-trabajo-vehiculo-quick-create`: inline vehicle creation from the work-order form's Vehículo picker, customer pre-scoped, reusing the existing `marcaSelectConfig`/`colorSelectConfig` and the existing `createVehicle` endpoint. Frontend-only.

### Modified Capabilities
- None at the contract level. No backend endpoint or DTO behavior changes. The `SearchableSelect` component gains a new instantiation (with `create`/`quickCreate`) at the vehículo call site, but its public API is already designed for this — no breaking change to other call sites.

## Approach

Two reasonable paths were compared; **option (a) is chosen**.

**(a) Dedicated "alta rápida de vehículo" mini-form (CHOSEN).** Build a small purpose-specific create form rendered inside `Modal.tsx`, NOT the generic `QuickCreateModal`. It renders two nested `SearchableSelect`s (Marca via `marcaSelectConfig`, Color via `colorSelectConfig`) plus two numeric inputs (año, kilometraje), with the customer fixed from `form.clienteId`. On submit it calls `createVehicle` with the injected `clienteId`. This mirrors the proven three-select composition already used in `vehiculos/nuevo/page.tsx` (lines ~90-113), minus the Cliente select. The Vehículo `SearchableSelect` in `OrdenTrabajoForm.tsx` is given a `create`/`quickCreate` config that opens this mini-form.

**(b) Extend the generic `QuickCreateModal`/`QuickCreateField` with a new `type: 'reference-select'`** that delegates to `SearchableSelect`. More broadly reusable in the future, but it inflates a generic component currently shared by three production entities (Cliente/Marca/Color) to serve a single new use case.

**Why (a) over (b):**
1. **Blast radius.** Option (a) does NOT touch `QuickCreateModal`/`QuickCreateField`, which is shared by `marcaSelectConfig`, `colorSelectConfig`, and `clienteSelectConfig` — all in production. Option (b) modifies that shared component and risks regressing three working flows for one new one.
2. **No precedent for dynamic-fetch selects in the generic modal.** Exploration confirmed the generic `QuickCreateField` only supports `type: 'text' | 'select'` with STATIC `options`; the only real `type: 'select'` in use (`tipoIdentificacion` in `clienteSelectConfig`) is a static enum. There is no existing pattern for a paginated/searchable FK select inside `QuickCreateModal`, and there is an explicit precedent for NOT solving this generically (`productos/UnidadMedidaSelect.tsx` lines ~64-72, "Defer inline Unidad-de-Medida quick-create", same FK-needs-its-own-picker reasoning). Option (a) sidesteps the whole generalization problem.
3. **Free reuse.** By composing `marcaSelectConfig`/`colorSelectConfig` directly, the mini-form inherits Marca's and Color's own inline quick-create with zero extra work — if the operator also lacks the brand or color, they can create those inline too, nested.
4. **Simplicity now, generalize later if it recurs.** A single-purpose mini-form is smaller and lower-risk. If a second multi-FK entity ever needs the same treatment, that is the moment to extract option (b) — not before.

**Interaction model, end to end:**
1. The Vehículo picker is unchanged in its search behavior: typing searches `listVehicles({ clienteId: form.clienteId, search, ... })`, scoped to the chosen customer.
2. A persistent `+ Crear vehículo` affordance is shown (via the `create`/`quickCreate` config now wired on this picker), consistent with how Cliente/Marca/Color pickers already expose theirs.
3. Activating it opens the "alta rápida de vehículo" mini-form on `Modal.tsx`, with Marca, Color, Año, Kilometraje. The customer is NOT shown.
4. Submit calls `createVehicle({ marcaId, colorId, anio, kilometraje, clienteId: form.clienteId })`, surfacing the same validation/error paths as `vehiculos/nuevo` (e.g. año range, non-negative kilometraje, required FKs).
5. On success, the returned vehicle is auto-selected into `form.vehiculoId` (through the same setter the picker already uses), and both the mini-form and the picker panel close.

**Customer-not-selected guard (resolved).** A vehicle cannot be created without `clienteId`. When `form.clienteId` is empty, the quick-create affordance must be disabled/hidden (exact affordance state — disabled with hint vs. hidden — deferred to design), so the operator cannot open an alta-rápida that would fail validation. The Vehículo picker is already effectively customer-scoped, so this aligns with existing behavior.

**Dirty-tracking / controlled input.** The picker remains controlled: it only calls the parent's field setter for `vehiculoId`, never mutating order `FormState` directly. A freshly quick-created vehicle selected into the form marks it dirty exactly as picking an existing vehicle would, so the editar page's dirty/discard apparatus keeps working unchanged.

## Known Gaps / Accepted Tradeoffs
- **Duplicated vehicle-create UI wiring.** The mini-form reproduces (a subset of) the field wiring already present in `vehiculos/nuevo`. Reusing `marcaSelectConfig`/`colorSelectConfig` and `createVehicle` keeps validation aligned, but the field layout is duplicated UI. Accepted as the cost of not making the operator leave the order form, and lower-risk than generalizing the shared modal.
- **Nested modals / nested quick-create depth.** Marca and Color inside the mini-form each carry their own quick-create modal. That means a modal (alta vehículo) can host a picker that opens another modal (alta marca/color). The Escape / focus / dismiss behavior of this nesting must be specified at design time (which layer owns Escape, focus return order). Called out as a visible risk rather than a surprise in apply.
- **No inline editing.** If the operator picks the wrong brand/color/year, they fix it in the mini-form before submit; there is no post-create inline edit of the vehicle from the order form. Accepted.
- **Reverting a documented decision.** The `SearchableSelect.tsx` comment stating inline creation "doesn't make sense" for vehículo becomes stale/incorrect after this change. The comment must be updated (or scoped to mecánico only) so the codebase does not carry a contradicted rationale.

## Spec Changes Required
- New capability spec `orden-trabajo-vehiculo-quick-create` describing: the Vehículo picker gaining inline quick-create, the dedicated alta-rápida mini-form field set (Marca, Color, Año, Kilometraje; customer injected, not shown), the customer-not-selected guard, the nested-modal Escape/focus contract, auto-selection of the created vehicle, and the frontend-only reuse of `createVehicle`.
- No existing spec's requirements are amended — backend contracts are unchanged. The prior `vehiculos-searchable-select` spec is not modified.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Nested modals (alta vehículo hosting alta marca/color) mishandle Escape/focus (wrong layer closes, focus not returned) | Med | `sdd-design` specs the exact per-layer Escape ownership and focus-return order before apply, consistent with `Modal.tsx`'s existing document-level Escape handling |
| Quick-create opened without a customer selected → `createVehicle` fails on missing `clienteId` | Med | Guard: affordance disabled/hidden while `form.clienteId` is empty; resolved in Approach, specced at design time |
| Reverting the "no inline create for vehículo" note leaves contradictory guidance in `SearchableSelect.tsx` | Low | Update/scope the comment to mecánico only as part of the change |
| Created vehicle not auto-selected / order form left inconsistent | Low | `createVehicle` returns the new record; component selects it via the same `vehiculoId` setter and closes both layers on success |
| Editar-page dirty tracking breaks because selection bypasses the setter | Low | Picker stays controlled; only calls parent `vehiculoId` setter; no direct `FormState` mutation |
| Duplicated field wiring drifts from `vehiculos/nuevo` validation | Low | Reuse `marcaSelectConfig`/`colorSelectConfig` and `createVehicle`; backend DTO is the single source of truth for validation |
| Scope creep into generalizing `QuickCreateModal` (option b) mid-apply | Low | Explicitly out of scope; option (a) chosen precisely to avoid touching the shared generic modal |

## Success Criteria
- [ ] The Vehículo picker in `OrdenTrabajoForm.tsx` exposes a persistent `+ Crear vehículo` affordance (on both `ordenes-trabajo/nuevo` and `ordenes-trabajo/editar/[id]` via the shared component).
- [ ] Activating it opens an "alta rápida de vehículo" mini-form on `Modal.tsx` with Marca (via `marcaSelectConfig`), Color (via `colorSelectConfig`), Año, and Kilometraje — and NO Cliente field.
- [ ] Submitting the mini-form calls the existing `createVehicle` with `clienteId` injected from `form.clienteId`; on success the returned vehicle is auto-selected into `form.vehiculoId` and both the mini-form and picker panel close.
- [ ] The auto-selected inline-created vehicle is consistent with `vehiculoSearch` (same `clienteId` scope), so it appears in subsequent searches for that customer.
- [ ] The quick-create affordance is unavailable while no customer is selected (`form.clienteId` empty), preventing a `clienteId`-less create.
- [ ] Marca and Color inside the mini-form retain their own inline quick-create; nested-modal Escape closes only the topmost layer and returns focus correctly per the design contract.
- [ ] On `editar/[id]`, selecting a freshly created vehicle marks the form dirty and triggers discard/`beforeunload` exactly as picking an existing vehicle does.
- [ ] No backend files (DTOs, validators, services, controllers) are modified; the generic `QuickCreateModal`/`QuickCreateField` is not modified.
- [ ] The stale `SearchableSelect.tsx` comment about vehículo not supporting inline creation is updated (or scoped to mecánico only).
