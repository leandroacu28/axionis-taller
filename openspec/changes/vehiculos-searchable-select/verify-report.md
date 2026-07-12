# Verify Report: Vehiculos - Searchable Select + Inline Quick-Create

Date: 2026-07-09
Verifier: sdd-verify (independent code read + independent npm run build)

## Summary

All 13 spec.md requirements are satisfied by the actual implementation, verified by
reading the real code (not the apply agent's summaries) in SearchableSelect.tsx,
QuickCreateModal.tsx, referenceSelectConfigs.tsx, vehiculos/nuevo/page.tsx, and
vehiculos/editar/[id]/page.tsx. Independent npm run build passed with 0 type
errors, 0 lint errors, matching the apply agent's report. Phase 6 (browser-only manual
verification) remains an accepted, known gap - no test runner and no browser-automation
tool exists in this repo/environment; see the dedicated section below.

## Requirement-by-Requirement Results

| # | Requirement | Result |
|---|-------------|--------|
| 1 | SearchableSelect Replaces Native Selects | PASS |
| 2 | Server-Side Debounced Search | PASS |
| 3 | Keyboard and Mouse Result Selection | PASS |
| 4 | Escape Closes the Panel Without Clearing Selection | PASS |
| 5 | Nested Escape Behavior With Quick-Create Modal | PASS |
| 6 | Persistent Quick-Create Affordance | PASS |
| 7 | Color Quick-Create Modal | PASS |
| 8 | Marca Quick-Create Modal | PASS |
| 9 | Cliente Quick-Create Modal (incl. 409 surfacing) | PASS |
| 10 | Auto-Select on Successful Quick-Create | PASS |
| 11 | Dirty-Tracking Preserved on Edit Page | PASS |
| 12 | No Backend Changes | PASS |
| 13 | Scope Boundary on Other Pages and Components | PASS |

## CRITICAL

None found.

## WARNING

None found.

## SUGGESTION

1. Reconcile tasks.md 3.4 with the implemented clienteSelectConfig. tasks.md
   lists telefono/domicilio as plain (not required), but the shipped
   referenceSelectConfigs.tsx marks both required: true, correctly following
   spec.md's clause requiring the same validation as clientes/nuevo (confirmed:
   clientes/nuevo/page.tsx's requiredFields array includes both). The code is
   correct; tasks.md's wording is stale. Worth a one-line tasks.md correction in a
   later pass so the artifact doesn't mislead a future reader - not a functional
   defect.
2. SearchableSelect's required-asterisk is currently hardcoded, not driven by a
   required prop - fine today since every current usage is required, but if a
   future non-required combobox use appears elsewhere, this will need a proper
   required boolean prop. Already flagged by the apply agent as a deliberate
   YAGNI deferral; re-flagging here only so it isn't lost.

## Detailed Verification Notes

### Requirements 1-3, 6-10 (structural/behavioral, code-traced)
Traced end-to-end in SearchableSelect.tsx: openPanel/closePanel, the two-state
debounce (searchInput to 350ms to searchTerm, SEARCH_DEBOUNCE_MS = 350), the
useEffect on [searchTerm, open] search-fetch effect calling config.search(term) with
status: activo, highlightedIndex as shared keyboard/mouse state with
scrollIntoView, the persistent "+ Crear entityLabel" footer button rendered
unconditionally outside the loading/error/empty/results branches, and
handleQuickCreateSubmit (create(values), then onChange(created.id), then
setSelectedLabel, then close modal AND panel). nuevo/page.tsx and
editar/[id]/page.tsx both render exactly three SearchableSelect instances (Marca,
Color, Cliente) wired to marcaSelectConfig/colorSelectConfig/clienteSelectConfig
from referenceSelectConfigs.tsx, which map listBrands/listColors/listCustomers
results to id/label pairs and createBrand/createColor/createCustomer calls to
Option. No native select remains for these three fields in either page.

### Requirement 4 - Escape closes panel, preserves selection
handleKeyDown's Escape branch (when quickCreateOpen is false): preventDefault(),
closePanel(), triggerRef.current focus(). closePanel() only mutates
open/panelPos/quickCreateOpen - it never touches selectedLabel and never calls
onChange. Selection is provably preserved.

### Requirement 5 - Nested Escape
Traced the real DOM/focus mechanics, not just the design doc's stated intent:
Modal.tsx registers a document-level keydown listener (useEffect, no
stopPropagation) that unconditionally calls onClose() on Escape - confirmed by
reading client/app/components/ui/Modal.tsx directly. Modal.tsx has no focus trap
and no autofocus on its fields, so after a user clicks the panel's Crear button
(which itself receives focus on click in Chromium/Windows), the search input loses
focus and its onKeyDown (attached only to that input via JSX) does not fire on
Escape at all - the keydown event only bubbles from whatever element is actually
focused. document's listener still fires regardless of focus location, so
Modal.tsx's onClose - wired in SearchableSelect to close the quick create state and
refocus the search input - closes only the modal, leaves open (the panel's own
state) untouched, and returns focus to the search input. A second Escape then hits
the now-refocused search input's handleKeyDown, where quickCreateOpen is now false,
so the standard close-panel branch runs. The explicit quickCreateOpen guard in
handleKeyDown is correct defensive-programming belt-and-suspenders on top of this,
exactly as design.md describes, and independently correct even if the click-focus
assumption above didn't hold in some browser. Both scenarios in the requirement are
satisfied. Dismiss handlers for click-outside/resize/scroll are also correctly
guarded by quickCreateOpen (verified in the useEffect around lines 176-204 of
SearchableSelect.tsx) so a click inside the portaled modal is never misread as
click-outside-the-panel.

### Requirement 9 - Cliente 409 conflict surfacing
Traced the full chain: customers.service.ts throws a ConflictException with the
message text "La identificacion ya esta registrada." on duplicate identificacion
(confirmed via grep, DUPLICATE_ID_ERROR constant, 4 throw sites).
client/app/lib/customers.ts's handleJsonResponse reads the failed response's JSON
body, extracts body.message, and throws a new Error using that message or a
fallback - so err.message on the client really does carry the backend's NestJS
exception message text verbatim. QuickCreateModal.tsx's handleSubmit catches that
error and sets the error state from err.message, rendered in the persistent red
banner, without closing the modal (finally only resets submitting, onClose is
never called on the error path). This exactly matches clientes/nuevo's own
err.message-in-toast handling of the same thrown error - same message, no
special-casing needed. Confirmed correct.

### Requirement 11 - Dirty-tracking preserved on edit page
editar/[id]/page.tsx's isFormDirty(current, baseline) (shallow key comparison
against initialFormRef.current), the beforeunload listener keyed on isDirty, and
handleCancel's discard-confirm dialog are all present and structurally identical to
a standard updateField-driven form - no special-casing for the new component
anywhere in that logic. SearchableSelect's onChange prop is wired in both pages to
call updateField with the field key and selected id, i.e. the exact same
updateField setter isFormDirty diffs against. Quick-create's auto-select path
(handleQuickCreateSubmit calling onChange(created.id)) goes through this identical
onChange prop, so a freshly-created record also flows through updateField and
marks the form dirty the same way. No divergent code path exists for
selection-via-search vs. selection-via-quick-create.

### Requirements 12-13 - No Backend Changes / Scope Boundary
git status confirms the server modifications present in the working tree
(schema.prisma, app.module.ts, auth.service.ts, customers files, users files, plus
untracked brands/, colors/, vehicles/ modules) predate this SDD change entirely
- they were already dirty/untracked before this verify session started (matches the
pre-existing git status snapshot given at task start) and are unrelated feature work
from prior sessions, not touched by vehiculos-searchable-select's apply phase. Same
for the colores list page, marcas list page, clientes list page,
ColorFormModal.tsx, and BrandFormModal.tsx - all pre-existing untracked/modified
state unrelated to this change; none of them import or reference
SearchableSelect, QuickCreateModal, or referenceSelectConfigs (confirmed via grep -
only the two vehicle pages and the three new files themselves reference
SearchableSelect). git status on the vehiculos directory shows it as newly
added in full (the whole feature is pre-existing uncommitted work), consistent with
design.md's stated file architecture (only nuevo/page.tsx and
editar/[id]/page.tsx modified; three files created).

### Required-asterisk change (apply-progress.md flag)
Confirmed real: SearchableSelect.tsx's label markup renders the label text plus a
red asterisk span unconditionally (no required prop exists anywhere in
SearchableSelectProps - verified the full interface, only an optional disabled
flag exists). Since no conditional/required-driven branch was ever introduced in
PR1, there is no dead code orphaned by this change - the asterisk was simply
always-rendered from the start of this addition. Confirmed intentional per
apply-progress.md decision 9, confirmed harmless (visual-only, zero prop/behavior
change to the exported interface).

## Independent Build Verification

Ran npm run build (next build) independently in client/ (not trusting the apply
agent's report):

- Result: success. 0 type errors, 0 lint errors.
- Both /vehiculos/nuevo (1.49 kB route JS) and /vehiculos/editar/[id] (2.25 kB
  route JS) compiled and appear in the route manifest.
- All ESLint warnings printed are pre-existing and unrelated to this change
  (react-hooks/exhaustive-deps on unrelated list pages' page dependency,
  no-img-element in lib/navigation.tsx). None attributed to
  SearchableSelect.tsx, QuickCreateModal.tsx, or referenceSelectConfigs.tsx.

Gotcha reproduced and recovered: running this independent npm run build while
the dev server (already running per apply-progress.md's note) was up against the same
client/.next directory reproduced the exact documented cache-corruption gotcha -
the dev server started 500ing with a Cannot find module webpack chunk error.
Recovered by killing the dev-server process and restarting npm run dev; both
routes returned 200 afterward. This confirms apply-progress.md's documented gotcha
is accurate and its prescribed recovery (kill and restart) works. No code defect -
a dev-workflow hazard only, already documented for future batches.

## Dev Server Status (post-recovery)

GET /vehiculos/nuevo returns 200, HTML contains the three expected placeholder
strings for marca, color, and cliente selection.
GET /vehiculos/editar/1 returns 200.

## Known, Accepted Gap - Phase 6 Manual Browser Verification (NOT CRITICAL)

No test runner exists in client/package.json, and no browser-automation tool
(Playwright, Puppeteer, computer-use) is available in this environment. Phase 6's
six scenarios - debounced-search network timing, live keyboard-nav feel, actual
quick-create click-through per entity, a live 409 response reaching the modal, the
live nested-Escape two-keypress sequence, and a live dirty-tracking trigger - could
not be exercised by any agent in this pipeline (apply or verify) and remain marked
statically-verified-only in tasks.md. This is an accepted, known gap, not a code
defect: every one of these code paths was independently traced above and found
structurally correct.

Follow-up required from a human before merge: click through all six Phase 6
scenarios in a real browser at the nuevo and editar vehicle pages (dev server is
running and confirmed responsive, per the curl checks above):
1. Type in each of the three comboboxes; confirm exactly one network request fires
   about 350ms after the last keystroke, with status=activo.
2. Arrow Up/Down move the highlight and scroll it into view past the fold; Enter
   selects and closes the panel; mouse hover syncs the same highlight.
3. Trigger the create action on each of Color/Marca/Cliente, submit valid values,
   confirm the new record is auto-selected and both modal and panel close.
4. Submit the Cliente quick-create modal with a duplicate identificacion; confirm
   the exact clientes/nuevo duplicate message renders in the modal's banner and
   the modal and panel both stay open.
5. With the quick-create modal open on top of the panel, press Escape once -
   confirm only the modal closes, panel stays open, focus returns to the search
   input; press Escape again - confirm the panel now closes.
6. On the edit page, select an existing value and separately quick-create a new
   one; confirm isFormDirty becomes true, the beforeunload guard arms, and the
   discard-confirm dialog fires on navigation away.
