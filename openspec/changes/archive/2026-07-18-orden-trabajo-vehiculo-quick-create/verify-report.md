# Verify Report: Orden de Trabajo - Vehiculo Quick Create

Date: 2026-07-18
Verifier: sdd-verify (independent code read + independent npm run build)
Environment constraint: no test runner in client/package.json, no
browser-automation tool (Playwright/Puppeteer/computer-use) available in this
environment. All results below come from static source inspection plus one
independent `npm run build`. Scenarios that require actually driving a
browser (click/keyboard/network) are explicitly NOT marked PASS - see
"Requires Manual Human Verification" below, per this task's instruction.

## Summary

11/11 spec.md requirements were traced against the real implementation code
(Modal.tsx, SearchableSelect.tsx, VehiculoQuickCreateModal.tsx,
OrdenTrabajoForm.tsx, CreateVehicleDto). 6 requirements are PASS on static
evidence alone (deterministic, code-level guarantees: disabled/guard logic,
absence of a Cliente field, validation bounds, clienteId injection, blast
radius). 5 requirements involve live DOM/browser behavior explicitly called
out by this task as "no PASS without real evidence" and are marked
NO-VERIFICABLE-ESTATICAMENTE, even though the code trace for each is
documented in detail below and found structurally consistent with the spec.
0 requirements FAIL. Independent `npm run build` passed with 0 type errors,
0 lint errors attributable to this change. Blast radius confirmed via
`git diff --stat`: only 3 files modified (OrdenTrabajoForm.tsx,
SearchableSelect.tsx, Modal.tsx) + 1 new file (VehiculoQuickCreateModal.tsx);
no backend file touched; `QuickCreateModal.tsx` unmodified.

## Requirement-by-Requirement Results

| # | Requirement | Result |
|---|-------------|--------|
| 1 | Quick-Create Affordance on the Vehiculo Picker | NO-VERIFICABLE-ESTATICAMENTE |
| 2 | Affordance Disabled Without a Selected Customer | PASS |
| 3 | Alta Rapida de Vehiculo Mini-Form Fields | PASS |
| 4 | Mini-Form Validation Aligned With CreateVehicleDto | PASS |
| 5 | Customer Injected From the Order Form, Never Requested | PASS |
| 6 | Auto-Select and Close on Successful Creation | NO-VERIFICABLE-ESTATICAMENTE |
| 7 | Customer-Scoped Search Consistency | PASS |
| 8 | Nested Quick-Create for Marca and Color Preserved | NO-VERIFICABLE-ESTATICAMENTE |
| 9 | Three-Layer Nested Escape and Focus Contract | NO-VERIFICABLE-ESTATICAMENTE |
| 10 | Dirty-Tracking on the Edit Page for Quick-Created Vehicles | NO-VERIFICABLE-ESTATICAMENTE |
| 11 | No Backend or Generic Quick-Create Component Changes | PASS |

**Compliance summary (static evidence only)**: 6/11 PASS, 0/11 FAIL, 5/11
NO-VERIFICABLE-ESTATICAMENTE (require a human in a real browser). All 5
NO-VERIFICABLE items have a full code trace below showing the mechanism is
structurally wired correctly; the label reflects the absence of runtime
evidence, not a suspected defect.

## CRITICAL

None found.

## WARNING

None found.

## SUGGESTION

1. Modal.tsx LIFO ordering depends on onClose reference stability inside
   the effect dependency array. useEffect(..., [open, onClose, token])
   re-runs (pop-then-push this modal's token to the top of the stack)
   whenever the onClose prop identity changes, not just when open
   changes. Both QuickCreateModal's and VehiculoQuickCreateModal's
   onClose are passed as fresh inline closures from SearchableSelect on
   every render of the outer picker. Traced every current code path
   (search debounce, resize/scroll dismiss guarded by quickCreateOpen,
   nested picker's own internal state) and found no trigger today that
   re-renders the outer Vehiculo SearchableSelect while its
   VehiculoQuickCreateModal (L1) and a nested Marca/Color
   QuickCreateModal (L3) are both open - so the two-modal stack order is
   safe in the current implementation. This is a latent fragility, not a
   live bug: if a future change causes the outer picker to re-render while
   two modals are stacked (e.g. a global state subscription unrelated to
   quickCreateOpen), the token reordering could make the wrong modal
   answer Escape. Recommend useCallback-memoizing the onClose closures
   in a future hardening pass, or dropping onClose from the effect's
   dependency array (keeping only [open, token]) since onClose is read
   fresh inside the handler via closure regardless.
2. Backend CreateVehicleDto's MAX_ANIO = new Date().getFullYear() + 1 is
   computed once at server module-load time (not per-request), so it only
   updates after a server restart following a year boundary. The frontend's
   MAX_ANIO (both in vehiculos/nuevo and the new
   VehiculoQuickCreateModal.tsx) is computed at module/browser load time
   too, so both sides can drift by up to a year around Jan 1 if the backend
   process isn't restarted. Pre-existing pattern, not introduced by this
   change (mirrors vehiculos/nuevo) - flagged for awareness only, not a
   regression to fix in this change.

## Detailed Verification Notes

### Requirement 2 - Affordance Disabled Without a Selected Customer (PASS)
OrdenTrabajoForm.tsx:278 still passes disabled={form.clienteId === ''}
unchanged to the Vehiculo SearchableSelect instance (confirmed via git diff
- this line is untouched by the diff). Inside SearchableSelect.tsx, the
trigger is a native <button ... disabled={disabled}> - native HTML disabled
semantics unconditionally block click and keyboard activation, no JS
required to enforce this. Additionally openPanel() has its own defensive
guard (if (disabled) return;, line 129) so even a programmatic call cannot
open the panel. Since the panel never opens, the in-panel
"+ Crear vehiculo" footer is structurally unreachable - this is a
deterministic, browser-independent guarantee (native disabled-button
semantics), not something that needs a live click to trust. Verdict: PASS.
(The visual confirmation that the footer appears the instant a customer is
selected is folded into Requirement 1's manual-test list below, since it's
about live rendering, not the guard logic itself.)

### Requirement 3 - Mini-Form Fields (PASS)
Read the full VehiculoQuickCreateModal.tsx end to end: fields rendered are
exactly Marca (SearchableSelect + marcaSelectConfig), Color
(SearchableSelect + colorSelectConfig), Anio (input type=number with
MIN_ANIO/MAX_ANIO), Kilometraje (input type=number min=0). Grepped the
file for any "cliente"/"Cliente" string - the only occurrence is the
clienteId prop name and its programmatic use in the createVehicle(...)
call; no label, input, or selector for a customer exists anywhere in the
component's JSX. Verdict: PASS.

### Requirement 4 - Validation Aligned With CreateVehicleDto (PASS)
Compared VehiculoQuickCreateModal.tsx's handleSubmit against
server/src/vehicles/dto/create-vehicle.dto.ts:

| Field | Frontend check | Backend DTO |
|-------|-----------------|-------------|
| marcaId/colorId | required (=== '' blocks, toast) | IsInt |
| anio | Number.isInteger + MIN_ANIO(1900) <= x <= MAX_ANIO | IsInt Min(1900) Max(MAX_ANIO) |
| kilometraje | Number.isInteger + >= 0 | IsInt Min(0) |
| clienteId | injected from prop, own guard if '' | IsInt |

Both MIN_ANIO/MAX_ANIO constants match the backend's bounds exactly
(1900 and currentYear + 1). Out-of-range triggers an inline red banner
(matches design.md) and returns before calling createVehicle - traced the
early return statements in handleSubmit, confirmed createVehicle is only
reached after all four checks pass. Backend 400 is still the authoritative
backstop: the catch block sets error from err.message, sourced from
createVehicle's thrown Error (which itself proxies the backend's JSON
message field, per lib/vehicles.ts's handleJsonResponse). Verdict: PASS.

### Requirement 5 - Customer Injected, Never Requested (PASS)
VehiculoQuickCreateModalProps.clienteId: number | '' is the only source of
the customer id in the component; createVehicle({ ..., clienteId }) uses it
directly (line 108). No useState for a customer field exists in FormState
(explicitly excludes clienteId, per the file's own comment). A guard
(if (clienteId === '') { setError(...); return; }) exists as a defensive
backstop in case the modal were ever reachable with no customer, but this
duplicates - does not replace - the picker-level disabled guard (Req 2).
Verdict: PASS.

### Requirement 7 - Customer-Scoped Search Consistency (PASS)
vehiculoSearch in OrdenTrabajoForm.tsx (lines 148-156) is unmodified by
this change (confirmed via diff - no lines touched in this function) and
already calls listVehicles({ ..., clienteId: form.clienteId, search: term }).
createVehicle performs a normal POST that (per CreateVehicleDto) does not
set activo: false unless explicitly passed (the mini-form never sends
activo), so a newly created vehicle is persisted the same way any other
active vehicle is. No caching layer or stale-list mechanism exists in
listVehicles/vehiculoSearch - each panel open triggers a fresh network
call (see SearchableSelect's useEffect on [searchTerm, open]), so a
vehicle created via this flow is guaranteed to appear on the very next search
without needing browser confirmation. Verdict: PASS (architecturally
guaranteed; the live "does it visually appear" check is still listed in the
manual section for end-to-end confidence, but the mechanism itself has no
plausible failure path in the current code).

### Requirement 11 - No Backend or Generic Quick-Create Component Changes (PASS)
Ran git status --porcelain and git diff --stat HEAD: only
client/app/(dashboard)/ordenes-trabajo/OrdenTrabajoForm.tsx,
client/app/(dashboard)/vehiculos/SearchableSelect.tsx,
client/app/components/ui/Modal.tsx are modified, plus
client/app/(dashboard)/ordenes-trabajo/VehiculoQuickCreateModal.tsx is new
and client/tsconfig.tsbuildinfo (build cache artifact, not source). Zero
files under server/ appear in the diff. client/app/(dashboard)/vehiculos/QuickCreateModal.tsx
does not appear in the diff at all - confirmed unmodified. Verdict: PASS.

### Requirement 1 - Persistent Affordance (NO-VERIFICABLE-ESTATICAMENTE)
Code trace (for context, not a substitute for the live check): the footer
button ((quickCreate || renderQuickCreate) && (button ...)) is
rendered as a sibling AFTER the loading/error/results.length === 0/
results.map(...) conditional block (SearchableSelect.tsx lines 334-373),
not nested inside any of those branches - so structurally it renders
regardless of whether the search returns zero, one, or many results. This
is consistent with the spec, but confirming it live (actual network
responses, actual DOM) requires a browser session against the dev server -
listed under "Requires Manual Human Verification" below, per this task's
explicit instruction not to mark affordance-visibility scenarios PASS
without real evidence.

### Requirement 6 - Auto-Select and Close (NO-VERIFICABLE-ESTATICAMENTE)
Code trace: on createVehicle success, VehiculoQuickCreateModal builds an
Option (id: vehicle.id, label built as "marca modelo" from vehicle.marca.marca
and vehicle.marca.modelo, matching the exact label format vehiculoSearch
already produces) and calls onCreated(option). That onCreated is
SearchableSelect's shared handleCreated (extracted in Phase 2, task 2.2):
onChange(option.id) (= updateField('vehiculoId', id)),
setSelectedLabel(option.label), setQuickCreateOpen(false), closePanel().
setQuickCreateOpen(false) flows back into renderQuickCreate({ open:
quickCreateOpen, ... }), so VehiculoQuickCreateModal's open prop (and
therefore Modal's open) becomes false on the same state update that closes
the picker panel via closePanel() - both L0 (picker panel) and L1 (mini-form
modal) close from one state flip, matching the spec's "both layers close"
requirement. This is a solid code trace but is exactly the kind of
live-interaction scenario ("auto-seleccion post-create") this task
explicitly excluded from a PASS verdict without a real browser run. Listed
under manual verification below.

### Requirement 8 - Nested Quick-Create for Marca/Color Preserved (NO-VERIFICABLE-ESTATICAMENTE)
Code trace: the Marca/Color SearchableSelect instances inside
VehiculoQuickCreateModal are spread from marcaSelectConfig / colorSelectConfig
(referenceSelectConfigs.tsx), unmodified by this change and confirmed to
still include create/quickCreate. Since these are independent
SearchableSelect instances with their own internal quickCreateOpen state,
creating a brand only mutates that nested instance's own state (onChange
routes to the mini-form's own updateField('marcaId', id)) - nothing in that
path touches VehiculoQuickCreateModal's own open prop or Modal's state, so
L1 structurally cannot close as a side effect of a nested Marca/Color
creation. This is the "alta anidada de marca/color" scenario this task
explicitly excluded from a code-only PASS - listed under manual
verification below.

### Requirement 9 - Three-Layer Nested Escape and Focus Contract (NO-VERIFICABLE-ESTATICAMENTE)
This is the specific mechanism this task asked to be checked most carefully.
Full trace of Modal.tsx's module-level LIFO stack:

Single-modal regression (task 1.5/1.6): a lone open Modal always pushes
exactly one token and is trivially top-of-stack
(openModalStack[openModalStack.length - 1] === token) regardless of how
many times its effect re-runs (each re-run's cleanup removes-by-filter then
the fresh run re-pushes - net stack length stays 1 for a single modal).
Escape and backdrop-click (onClick={onClose} on the overlay div, unchanged
by this diff) both still fire onClose exactly as before. No regression for
any of the 8 existing single-Modal consumers app-wide (grepped:
DiagnosticoFormModal.tsx, EtiquetaFormModal.tsx, UnidadMedidaFormModal.tsx,
ServiceTypeFormModal.tsx, BrandFormModal.tsx, ColorFormModal.tsx,
vehiculos/QuickCreateModal.tsx, plus the new VehiculoQuickCreateModal.tsx).

Two-modal stacking (L1 vehiculo modal + L3 marca/color quick-create): L1
opens first -> openModalStack = [tokenL1]. L3 opens on top ->
openModalStack = [tokenL1, tokenL3]. A single Escape keypress fires BOTH
modals' document keydown listeners (registration order: L1's listener
first, then L3's, since neither calls stopPropagation) within the same
event dispatch, before any state-driven cleanup runs: L1's handler computes
isTopMost = (last === tokenL1) -> false -> no-op; L3's handler computes
isTopMost = (last === tokenL3) -> true -> calls onClose(). Only L3 closes.
L3's unmount/close then runs its effect cleanup, filtering tokenL3 out,
leaving openModalStack = [tokenL1]. A second Escape now only has L1's
listener registered (L3's was removed by removeEventListener in the same
cleanup) - isTopMost is trivially true -> L1 closes, focus returns via L1's
own onClose (wired to refocus the picker's search input, in
SearchableSelect.tsx: setQuickCreateOpen(false) then
searchInputRef.current?.focus()). This exactly matches both scenarios in
the spec (topmost-only close, then a second Escape closes the next layer
down).

Fragility found (documented as SUGGESTION #1 above, not a live bug): the
effect's dependency array [open, onClose, token] includes onClose, which is
a fresh inline closure on every render of the owning SearchableSelect. If
the outer Vehiculo picker were to re-render while both L1 and L3 are open,
the churn (cleanup-then-repush) would move L1's token to the end of the
stack, incorrectly making L1 "top" ahead of a still-open L3. Traced every
state-changing path in the current code (search debounce, resize/scroll
handlers - both correctly guarded by if (quickCreateOpen) return; before
calling any setState) and found none that would trigger this re-render
while two modals are stacked, so this does not manifest as a live defect
today - but it is a latent risk worth fixing opportunistically (see
SUGGESTION #1).

Despite this thorough trace, the actual 3-layer, 2-keypress interactive
scenario ("Escape en cascada de 3 capas") is explicitly on this task's list
of scenarios that must not be marked PASS without a live browser run.
Verdict: NO-VERIFICABLE-ESTATICAMENTE, with the mechanism analysis above
provided as supporting (not substitute) evidence.

### Requirement 10 - Dirty-Tracking on Edit Page (NO-VERIFICABLE-ESTATICAMENTE)
Code trace: OrdenTrabajoForm.tsx's Vehiculo SearchableSelect instance's
onChange prop is (id) => updateField('vehiculoId', id) - the exact same
setter used for selecting an existing vehicle from search results
(selectOption also calls the passed-in onChange). The quick-create path
(handleCreated in SearchableSelect.tsx) calls this identical onChange
prop - there is no separate/divergent code path for a quick-created
selection vs. an existing-option selection. updateField triggers setForm,
which changes serializeForm(form) (vehiculoId is included in the serialized
object, OrdenTrabajoForm.tsx line 68), which flips isDirty (mode === 'edit'
&& serializeForm(form) !== initialSnapshotRef.current) to true. The
beforeunload listener and handleCancel's discard-confirm dialog both key
off this same isDirty value, with no special-casing anywhere in that logic
for how vehiculoId was set. This is a strong structural trace, but
"dirty-tracking en editar" is explicitly on this task's
do-not-PASS-without-evidence list (live beforeunload/discard-dialog firing
needs a real browser). Verdict: NO-VERIFICABLE-ESTATICAMENTE.

## Independent Build Verification

Ran npm run build (next build) independently in client/:

- Result: success. 0 type errors, 0 lint errors attributable to this change.
- /ordenes-trabajo/nuevo (912 B) and /ordenes-trabajo/editar/[id]
  (1.39 kB) both compiled and appear in the route manifest.
- All printed ESLint warnings are pre-existing and unrelated to this change
  (react-hooks/exhaustive-deps on unrelated list pages' page dependency,
  no-img-element in lib/navigation.tsx). None attributed to Modal.tsx,
  SearchableSelect.tsx, VehiculoQuickCreateModal.tsx, or
  OrdenTrabajoForm.tsx.

## Tasks.md Cross-Check

23/32 tasks marked [x] - Phases 1-4 (Modal.tsx LIFO stack, SearchableSelect
props, VehiculoQuickCreateModal component, OrdenTrabajoForm wiring) all
verified present and matching their task descriptions by direct code read.
Phase 5 (9 tasks, 5.1-5.9) remains unchecked [ ] - these are the
browser-only manual scenarios; tasks.md's own note already states this
correctly (this environment cannot drive a real browser, Phase 5 items must
be executed and confirmed by a human). No task is marked complete without
matching code.

## state.yaml Drift (WARNING-adjacent, non-blocking)

openspec/changes/orden-trabajo-vehiculo-quick-create/state.yaml still shows
spec: not-started, design: not-started, tasks: not-started, apply:
not-started even though spec.md, design.md, tasks.md all exist and 23/32
tasks are checked off. This is a stale bookkeeping artifact, not a
functional defect - the actual spec.md/design.md/tasks.md files and the
implementation code are all present and consistent with each other.
Flagging so sdd-archive (or a manual pass) updates state.yaml to reflect
reality before closing the change.

## Requires Manual Human Verification (NOT marked PASS - accepted, known gap)

No test runner exists in client/package.json, and no browser-automation
tool is available in this environment. The following spec scenarios were
traced in code above and found structurally correct, but per this task's
explicit instruction are NOT marked PASS without live evidence:

1. Affordance visible/hidden (Req 1 & 2): confirm "+ Crear vehiculo" footer
   is visible with zero/one/many search results once a customer is
   selected, and confirm it is genuinely unreachable (disabled trigger,
   panel never opens) with no customer selected; select a customer
   afterward and confirm the picker enables and the footer appears.
2. Nested alta of Marca/Color (Req 8): from inside the vehicle mini-form,
   activate Marca's (or Color's) own "+ Crear marca/color", create one
   successfully, and confirm it auto-selects into the mini-form's
   Marca/Color field while the vehicle mini-form itself stays open.
3. Three-layer Escape cascade (Req 9): with the Vehiculo panel, the vehicle
   mini-form, and Marca's/Color's own quick-create all open, press Escape
   once and confirm ONLY the top layer closes, focus returns to the
   mini-form's Marca/Color control, and the other two layers remain open;
   press Escape again and confirm the mini-form closes, focus returns to
   the picker's search input, and the panel remains open. Also confirm an
   unrelated single-layer modal elsewhere (e.g. Cliente's "+ Crear
   cliente") still closes normally via Escape/backdrop-click afterward (no
   leftover stack entry).
4. Auto-selection post-create (Req 6): with a customer selected, open
   "+ Crear vehiculo", fill valid Marca/Color/Anio/Kilometraje, submit, and
   confirm the new vehicle auto-selects into the Vehiculo field with the
   "marca modelo" label, both the mini-form and picker panel close, and no
   Cliente field was ever shown. Then reopen the picker and confirm the
   just-created vehicle appears in the search results for that customer.
5. Dirty-tracking on editar/[id] (Req 10): load an existing order with no
   changes, create a vehicle inline via quick-create, confirm it
   auto-selects and isFormDirty() becomes true, and confirm the
   beforeunload guard and discard-confirm dialog fire on navigating away,
   exactly as selecting an existing vehicle would.
6. Validation error surfacing (Req 4, live confirmation): submit the
   mini-form with Anio outside [1900, currentYear+1] or a negative
   Kilometraje and confirm the inline banner blocks submission without
   calling createVehicle; force a backend 400 and confirm the message
   surfaces in the same banner.

These correspond directly to tasks.md's unchecked Phase 5 items (5.1-5.9)
and must be executed and confirmed by a human against the dev server before
merge.

## Verdict

PASS WITH WARNINGS (no CRITICAL, no WARNING findings - 2 SUGGESTIONs only)
for everything statically verifiable: task completion (23/23 applicable
Phase 1-4 tasks), spec-vs-code correctness for the 6 deterministic
requirements, design coherence (LIFO stack, render-prop contract, file
architecture all match design.md), zero backend/generic component changes,
and a clean independent build. Phase 5's 9 tasks and the 5 requirements tied
to live browser interaction remain explicitly unverified pending a human
session against the dev server - this is a known, accepted gap (no test
runner or browser automation in this environment), consistent with the
precedent set in vehiculos-searchable-select/verify-report.md, not a defect
in the implementation.
