# Tasks: Orden de Trabajo — Inline Quick-Create for the Vehículo Picker

## Phase 1: `Modal.tsx` — LIFO Escape Stack (isolated, verifiable alone)

- [x] 1.1 Add a module-level LIFO stack (array of stable tokens) at the top of `client/app/components/ui/Modal.tsx`, outside the component, so it survives across every `Modal` instance mounted in the app
- [x] 1.2 Inside the `open`-gated `useEffect`, generate a stable token via `useId()` and push it onto the stack when the effect runs (i.e., when this modal becomes `open`)
- [x] 1.3 Modify the `keydown` handler: call `onClose()` only when this modal's token is currently the top (last) element of the stack; otherwise no-op, letting a modal stacked above it own the keypress
- [x] 1.4 On effect cleanup (close or unmount), remove this modal's token from the stack — remove by value (filter it out), not by assuming it's always the last element, so out-of-order closes (e.g. a lower layer closed first) still leave the stack consistent for the remaining open modal(s)
- [x] 1.5 Confirm the fix is additive/non-breaking for every existing single-modal usage (the 4 current `QuickCreateModal` call sites for Cliente/Marca/Color, plus any other `Modal` consumer app-wide): a lone open modal is always top-of-stack, so `onClose` still fires exactly as before
- [x] 1.6 Manually verify in isolation, BEFORE touching any other file in this change: open any existing single quick-create modal (e.g. "+ Crear marca" from `vehiculos/nuevo`), confirm Escape still closes it, and confirm the backdrop click still closes it — regression check on a component shared by the whole app

## Phase 2: `SearchableSelect.tsx` — `renderQuickCreate`/`createLabel` props

- [x] 2.1 Add `renderQuickCreate?: (args: { open: boolean; prefillValue: string; onClose: () => void; onCreated: (option: Option) => void }) => React.ReactNode;` and `createLabel?: string;` to `SearchableSelectProps` (`client/app/(dashboard)/vehiculos/SearchableSelect.tsx`), both optional and additive — existing call sites (Cliente/Marca/Color via `quickCreate`, Mecánico with neither prop) pass neither and stay unchanged
- [x] 2.2 Extract the "created successfully" logic currently inline in `handleQuickCreateSubmit` (`onChange(created.id)` + `setSelectedLabel(created.label)` + close `quickCreateOpen` + close panel) into a shared `onCreated(option: Option)` handler, reusable by both the existing generic `quickCreate` path and the new `renderQuickCreate` path
- [x] 2.3 Gate the footer button's render condition on `quickCreate || renderQuickCreate` (currently `quickCreate` only); footer label reads `quickCreate.entityLabel` when `quickCreate` is set, else `createLabel` when `renderQuickCreate` is set
- [x] 2.4 When `renderQuickCreate` is provided, render its returned node instead of the generic `<QuickCreateModal>`, passing `{ open: quickCreateOpen, prefillValue: searchInput, onClose: <same onClose used today — closes quickCreateOpen and refocuses the search input>, onCreated: <the shared handler from 2.2> }`
- [x] 2.5 Update the stale comment above the `create?`/`quickCreate?` props (currently: inline creation "doesn't make sense (e.g. mecánico, vehículo)") — rescope it to mecánico only, since vehículo now has its own quick-create path via `renderQuickCreate`
- [x] 2.6 Confirm no existing call site needs edits from this phase alone — `OrdenTrabajoForm.tsx`'s Vehículo picker is wired in Phase 4, not here

## Phase 3: `VehiculoQuickCreateModal.tsx` — new component

- [x] 3.1 Create `client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx` with props `{ open: boolean; clienteId: number | ''; onClose: () => void; onCreated: (option: Option) => void }`, mounted on `components/ui/Modal.tsx` (title "Nuevo vehículo"), importing `Option` from `../vehiculos/SearchableSelect`
- [x] 3.2 Internal form state — `marcaId`, `colorId`, `anio`, `kilometraje` — mirrors `vehiculos/nuevo/page.tsx`'s `FormState` minus `clienteId` (which comes from the prop instead)
- [x] 3.3 Render Marca (`SearchableSelect` + `marcaSelectConfig`) and Color (`SearchableSelect` + `colorSelectConfig`), imported from `../vehiculos/referenceSelectConfigs` — both nested pickers inherit their own quick-create with zero extra wiring
- [x] 3.4 Render Año and Kilometraje numeric inputs, matching `vehiculos/nuevo`'s copy/constraints (`MIN_ANIO = 1900`, `MAX_ANIO = new Date().getFullYear() + 1`, `min={0}` for kilometraje)
- [x] 3.5 Implement pre-submit validation aligned to `CreateVehicleDto`: `marcaId`/`colorId` required (`showError('Campos incompletos', …)` toast, mirrors `QuickCreateModal`'s pattern); `anio` integer in `[MIN_ANIO, MAX_ANIO]` and `kilometraje` a non-negative integer (inline red banner `border-red-200 bg-red-50 … text-red-600`, does NOT close the modal) — blocks the call to `createVehicle` on failure
- [x] 3.6 Implement submit handling: `try/catch` around `createVehicle({ marcaId, colorId, anio, kilometraje, clienteId })` from `client/app/lib/vehicles.ts`, with `clienteId` taken from the `clienteId` prop and never displayed or requested; on a thrown `Error` (backend 400 or other), render `err.message` in the same inline red banner and keep the modal open
- [x] 3.7 On success: build `Option { id, label: \`${vehicle.marca.marca} ${vehicle.marca.modelo}\` }` from the returned `VehicleListItem` (same label format `vehiculoSearch` already uses in `OrdenTrabajoForm.tsx`), call `onCreated(option)`, fire `showSuccess(...)`, and reset the internal form state so the next open starts empty
- [x] 3.8 Confirm the component never renders a Cliente field/selector anywhere (spec requirement — customer is injected, never shown or asked)

## Phase 4: `OrdenTrabajoForm.tsx` — wiring

- [x] 4.1 Import `VehiculoQuickCreateModal` from `./VehiculoQuickCreateModal`
- [x] 4.2 Add `createLabel="vehículo"` and `renderQuickCreate={({ open, onClose, onCreated }) => (<VehiculoQuickCreateModal open={open} clienteId={form.clienteId} onClose={onClose} onCreated={onCreated} />)}` to the Vehículo `SearchableSelect` instance (lines ~269-279), leaving `disabled={form.clienteId === ''}` and the existing placeholder (`'Elegí primero un cliente'` / `'Seleccioná un vehículo'`) untouched — the customer-not-selected guard is inherited from the existing `disabled` prop, no new guard code needed (design.md Decision 3)
- [x] 4.3 Confirm the Cliente, Mecánico pickers and every other field in this file are untouched by this change

## Phase 5: Manual Verification (end-to-end, dev server)

- [ ] 5.1 Guard: with no customer selected, confirm the Vehículo picker is disabled and its "+ Crear vehículo" footer is unreachable; select a customer and confirm the picker enables and the footer appears
- [ ] 5.2 Happy path: with a customer selected, open "+ Crear vehículo", fill Marca/Color/Año/Kilometraje, submit, and confirm the new vehicle auto-selects into the Vehículo field with the `marca modelo` label, both the mini-form and picker panel close, and no Cliente field was ever shown
- [ ] 5.3 Search consistency: reopen the Vehículo picker for the same customer and confirm the just-created vehicle appears in the search results
- [ ] 5.4 Nested create: from inside the vehicle mini-form, activate Marca's (or Color's) own "+ Crear marca/color", create one successfully, and confirm it auto-selects into the mini-form's Marca/Color field while the vehicle mini-form itself stays open
- [ ] 5.5 Stacked Escape: with the Vehículo panel, the vehicle mini-form, and Marca's/Color's own quick-create all open (three layers), press Escape once and confirm only the top layer (Marca/Color quick-create) closes, focus returns to the mini-form's Marca/Color control, and the vehicle mini-form + Vehículo panel remain open; press Escape again and confirm the vehicle mini-form closes, focus returns to the Vehículo panel's search input, and the panel itself remains open
- [ ] 5.6 Regression on unrelated modals: with the vehicle mini-form's Marca quick-create closed via Escape as in 5.5, independently reopen an existing single-layer modal elsewhere (e.g. Cliente's "+ Crear cliente") and confirm Escape and backdrop-click still close it normally — no leftover stack entry from the nested flow
- [ ] 5.7 Validation: submit the mini-form with Año outside `[1900, currentYear+1]` or a negative Kilometraje and confirm an inline error blocks submission without calling `createVehicle`; force a backend 400 (e.g. by momentarily entering another out-of-range value the backend also rejects) and confirm the message surfaces in the same inline banner
- [ ] 5.8 Dirty tracking on `editar/[id]`: load an existing order with no changes, create a vehicle inline via quick-create, confirm it auto-selects and `isFormDirty()` becomes true, and confirm the `beforeunload` guard and discard-confirm dialog fire on navigating away, exactly as selecting an existing vehicle would
- [ ] 5.9 No forbidden files touched: confirm the final diff contains no backend DTO/validator/service/controller changes, and `QuickCreateModal.tsx`/`QuickCreateField` are unmodified

**Note:** this environment cannot drive a real browser (click/keyboard/network-tab). Phase 5 items must be executed and confirmed by a human in an actual browser session against the dev server before merge; `sdd-verify` can at most statically re-read the applied code and mark these `[~]` (reasoned-about, not click-tested), matching the precedent set in `vehiculos-searchable-select/tasks.md`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~220-290 (Modal.tsx ~20-30, SearchableSelect.tsx ~50-70, VehiculoQuickCreateModal.tsx new ~140-170, OrdenTrabajoForm.tsx ~10-15) |
| 400-line budget risk | Low — comfortably under budget by line count alone |
| Chained PRs recommended | No, by line count. However, see the blast-radius note below before treating this as a simple "no" |
| Blast-radius risk (separate from line count) | Medium — Phase 1 modifies `client/app/components/ui/Modal.tsx`, a component shared by EVERY modal in the app (all current `QuickCreateModal` instances for Cliente/Marca/Color, plus any other `Modal` consumer), not just the new vehículo flow. A regression there is app-wide, not scoped to this change |
| Delivery strategy | ask-on-risk (cached for this change) |
| Decision needed before apply | Yes — not for line-count reasons, but because of Modal.tsx's blast radius |

**Recommendation:** given the low total line count, a single PR covering Phases 1-4 is reasonable. To de-risk the shared-component edit without splitting into multiple PRs, Phase 1 is deliberately sequenced first and includes its own standalone regression check (task 1.6) against an existing, unrelated modal — apply and verify Phase 1 alone before starting Phase 2, even within a single PR/commit sequence, so a Modal.tsx regression is caught immediately and can be isolated to one commit for easy revert. If the user prefers additional safety margin, the alternative is to land Phase 1 as its own preliminary PR (merged and verified in production use before Phases 2-4 begin) — this is the ask-on-risk decision point: proceed with one PR (recommended, with the Phase 1 isolation described above), or split Modal.tsx into its own PR first.
