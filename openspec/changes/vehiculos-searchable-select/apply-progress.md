# Apply Progress: Vehículos — Searchable Select + Inline Quick-Create

## Batch 1 (this batch) — PR1: Shared components

**Status: Phase 1, 2, 3 done. Phase 4-6 deliberately deferred to a later apply batch (PR2).**

### Files created

- `client/app/(dashboard)/vehiculos/QuickCreateModal.tsx` — schema-driven mini-modal on top of `components/ui/Modal.tsx`.
- `client/app/(dashboard)/vehiculos/SearchableSelect.tsx` — the combobox: portal panel, debounced search, keyboard nav, quick-create hosting.
- `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx` — `marcaSelectConfig`, `colorSelectConfig`, `clienteSelectConfig`.

None of these files are imported anywhere yet — zero functional risk to the existing `vehiculos/nuevo` and `vehiculos/editar/[id]` pages, which are untouched in this batch.

### Deferred to next batch (PR2 — Phase 4, 5, 6)

- Integrate `SearchableSelect` + the three configs into `vehiculos/nuevo/page.tsx` (delete option-fetch apparatus, swap the three `<select>` elements).
- Same integration into `vehiculos/editar/[id]/page.tsx`, plus seeding `initialLabel` from the loaded vehicle.
- Phase 6 manual verification (debounced search, keyboard nav, quick-create per entity, Cliente 409 conflict, nested Escape, dirty tracking on editar) — all of it depends on the pages actually rendering the new components, so it can only run after PR2.

### Implementation decisions beyond what design.md pinned down

design.md's Component Contract gives an exact `SearchableSelectProps` interface but leaves several mechanics as open, reasonable engineering choices. Flagging these explicitly for `sdd-verify` and for whoever reviews PR1:

1. **`QuickCreateModal` props not in design.md's contract.** Design only lists `title`, `entityLabel`, `fields`, `prefillValue?`, `onSubmit`, `onClose` (from tasks.md 1.1). Since it wraps `Modal.tsx` (which requires an `open` boolean), I added `open: boolean` to the props. I also added `prefillField?: string` alongside `prefillValue?: string` — the modal needs to know *which* field to seed, not just the value to seed it with; `SearchableSelect` passes both from its `quickCreate.prefillField` config and the current `searchInput`.

2. **Validation UX split (toast vs inline banner).** design.md's wording ("Generic validation... mirrors the pages' `showError('Campos incompletos', …)` pattern; submit try/catch renders `err.message` in the reused red banner... inside the modal") reads as two distinct behaviors, not one. I implemented it that way: empty required-field validation triggers the existing `showError` sweetalert toast (matching every other form in the codebase), while `onSubmit` failures (e.g. the Cliente 409 conflict) render inside the modal's persistent red banner so the message doesn't disappear before the user can react — this matters specifically for the 409 scenario in spec.md, which requires the modal to stay open with the error visible.

3. **Cliente quick-create `telefono`/`domicilio` required — deviation from tasks.md wording.** tasks.md 3.4 lists `telefono` and `domicilio` as plain `(text)` fields without the `required` annotation given to `razonSocial`/`tipoIdentificacion`/`identificacion`. But spec.md's "Cliente Quick-Create Modal" requirement explicitly says the modal must apply "the same validation as `/clientes/nuevo`" — and `/clientes/nuevo`'s actual `requiredFields` array includes `telefono` and `domicilio` alongside `razonSocial` and `identificacion` (only `tipoIdentificacion` is excluded, since it always has a default). I followed spec.md (the higher-authority artifact) over tasks.md's field list and marked `telefono`/`domicilio` as `required: true` in `clienteSelectConfig`. **Flagging this tasks.md/spec.md inconsistency explicitly** — `sdd-verify` should confirm this reading is correct, and it may be worth a tasks.md correction in a later pass.

4. **Search-effect gating on `open`, not literally `useEffect([search])`.** tasks.md 2.5 and design.md's state machine describe the fetch effect as keyed only on the debounced `search` value. I implemented it as `useEffect(() => {...}, [searchTerm, open])` with an early return when `!open`. Rationale: (a) a literal `[search]`-only dependency would fire the search query once on mount for all three comboboxes on the page, even before the user ever opens any of them — wasted API calls; (b) gating on `open` also means opening the panel with an untouched (still-empty) debounced term reliably shows an initial default result set, since `open` flipping true is itself a dependency change that reruns the effect even when `searchTerm` didn't change. Behaviorally this satisfies every scenario in spec.md and task 6.1's manual-verification description ("type... confirm exactly one `list*` call fires ~350ms after the last keystroke"); the deviation is additive (an extra fetch trigger on open), not a removal of the specified debounce behavior.

5. **Dismiss handlers (`mousedown`/`resize`/`scroll`) also guarded by `quickCreateOpen`.** design.md's Nested-Escape Mechanism section only addresses the Escape key explicitly. I additionally guarded the click-outside, resize, and scroll dismiss handlers with the same `if (quickCreateOpen) return` pattern, because without it, clicking inside the quick-create modal (which portals to `document.body`, outside both `triggerRef` and `panelRef`) would be misread as a click-outside-the-panel and silently close the panel behind the still-open modal — breaking the "panel stays open behind the modal" contract from spec.md's Nested Escape requirement, just via a different trigger than Escape. `resize`/`scroll` guards are defensive parity with the same reasoning (page scroll is already blocked by `Modal.tsx`'s `body.style.overflow = 'hidden'` while open, so this mostly matters for `resize`).

6. **External value reset support.** Added a small `useEffect` that clears the internal `selectedLabel` back to `null` whenever the parent's controlled `value` prop becomes `''` externally (e.g. a future discard/reset flow), so the collapsed control falls back to `placeholder` instead of showing a stale label. Not explicitly required by any task, but keeps the "controlled id (parity with current `<select>`)" contract honest — a native `<select>` reset to `''` shows no selection either.

7. **Closed-control markup is a `<button>`, not a `<select>`.** Necessarily different from the native elements it replaces (needed for the custom panel/keyboard behavior), but I matched the existing Tailwind visual language (`rounded-lg border border-stone-200 bg-stone-50 ... focus:border-rose-400 ... focus:ring-2 focus:ring-rose-100`, `disabled:cursor-not-allowed disabled:opacity-50`) verbatim from the `<select>` styling in `vehiculos/nuevo/page.tsx`, plus a chevron icon following the existing icon-as-function convention (`PencilIcon`, `CheckCircleIcon`, etc. in `vehiculos/page.tsx`).

8. **`QuickCreateModal`'s `description` prop to `Modal.tsx` is omitted.** `Modal.tsx`'s `description` is optional. Composing a grammatically correct Spanish description generically across three entities with different genders (`un color` vs `una marca` vs `un cliente`) isn't supported by the current config shape (`entityLabel` is just a bare noun, reused verbatim in the "Crear {entityLabel}" button label — e.g. "Crear color", matching `ColorFormModal`'s "Crear color" pattern exactly). Left `description` unset rather than introduce awkward or grammatically wrong copy; the modal's `title` (e.g. "Nuevo color") already carries the same information ColorFormModal's title does.

### Build verification

Ran `npm run build` in `client/`. Result: **success**, 0 type errors, 0 lint errors. All ESLint warnings printed are pre-existing and unrelated to the new files (`react-hooks/exhaustive-deps` on `page` in `clientes/colores/marcas/vehiculos` list pages, `@next/next/no-img-element` in `lib/navigation.tsx`). No warnings or errors were attributed to `QuickCreateModal.tsx`, `SearchableSelect.tsx`, or `referenceSelectConfigs.tsx` — confirms Next's build-time type-check covers the new files via `tsconfig.json`'s `include: ["**/*.tsx"]` even though nothing imports them into the reachable module graph yet.

### Constraints honored

- `vehiculos/nuevo/page.tsx` and `vehiculos/editar/[id]/page.tsx` — untouched (verified via `git status` before/after; only the three new files appear as additions).
- No `server/` files touched.
- No test files added (no test runner exists in `client/package.json`).
- No git commit/push/PR performed — working tree left uncommitted for orchestrator review.

## Batch 2 (this batch) — PR2: Page integration

**Status: Phase 4, 5, 6 done — Phase 6 is statically verified only (see below); a human still needs to click through the six scenarios in a real browser before merge.**

### Files modified

- `client/app/(dashboard)/vehiculos/nuevo/page.tsx`
- `client/app/(dashboard)/vehiculos/editar/[id]/page.tsx`
- `client/app/(dashboard)/vehiculos/SearchableSelect.tsx` — one small compatible addition (see decision 9 below)

### `nuevo/page.tsx` diff summary

- Removed: `optionsLoading`/`brands`/`colors`/`customers` state, the `Promise.all([listBrands, listColors, listCustomers])` mount `useEffect`, and the `listBrands`/`listColors`/`listCustomers` + `*ListItem` type imports.
- Removed `useEffect` from the `react` import (no longer used in this file).
- Added imports: `SearchableSelect` (default) from `../SearchableSelect`, and `marcaSelectConfig`/`colorSelectConfig`/`clienteSelectConfig` from `../referenceSelectConfigs`.
- Replaced the three `<select>` blocks (each previously wrapped in its own `<div className="space-y-1"><label>...</label><select>...</select></div>`) with three `<SearchableSelect label="…" placeholder="…" value={form.xId} onChange={(id) => updateField('xId', id)} {...xSelectConfig} />` elements inside the same `grid grid-cols-1 gap-4 sm:grid-cols-3` wrapper — `SearchableSelect` renders its own label/control, so the old per-field `<div><label>` wrappers were removed along with the native elements.
- Submit button: `disabled={submitting || optionsLoading}` → `disabled={submitting}` (the `optionsLoading` gate no longer exists since there's no longer a blocking mount fetch).

### `editar/[id]/page.tsx` diff summary

- Same deletions as `nuevo` (option-fetch state/effect/imports), same `disabled` fix on the submit button.
- Added a `vehicle` state (`useState<VehicleListItem | null>(null)`, imported `type VehicleListItem` from `../../../../lib/vehicles`) set inside the existing `loadVehicle()` effect right after `setForm(loaded)` — this is the one net-new piece of state, needed because `FormState` only carries `marcaId`/`colorId`/`clienteId` numbers, but `SearchableSelect`'s `initialLabel` needs the loaded vehicle's nested `marca.marca`/`marca.modelo`/`color.descripcion`/`cliente.razonSocial` strings, which `FormState` doesn't carry. Renamed the effect's local `vehicle` const to `loadedVehicle` to avoid shadowing the new state variable.
- Same three-`<select>`-to-three-`<SearchableSelect>` replacement as `nuevo`, plus `initialLabel` on each: Marca → `` `${vehicle.marca.marca} ${vehicle.marca.modelo}` `` (guarded `vehicle ? … : undefined`), Color → `vehicle.color.descripcion`, Cliente → `vehicle.cliente.razonSocial`.
- Verified (read-only, no code change) that `isFormDirty`, the `beforeunload` listener, and `handleCancel`'s discard-confirm are untouched and still correct: they all read `form`/`initialFormRef.current`, and `SearchableSelect`'s `onChange={(id) => updateField('xId', id)}` calls the exact same `updateField` setter the native `<select onChange>` used — no divergence in how `form` state changes.

### Required-asterisk / label question — resolution

The two pages' old markup rendered the field's own `<label>` with a hardcoded `<span className="text-rose-500">*</span>` next to the field name (e.g. `Marca <span className="text-rose-500">*</span>`). `SearchableSelect` renders its own internal `<label htmlFor={id}>{label}</label>` and does not expose a `required` prop in PR1's shipped contract.

**Decision:** rather than passing an ugly `label="Marca *"` string (wrong markup/color) or expanding `SearchableSelectProps` with a new `required?: boolean` prop (a contract change PR1 didn't ship, this batch is scoped to page integration, and no current or foreseeable usage of `SearchableSelect` in this codebase is ever optional — Marca/Color/Cliente are always required on both vehicle-form pages), I made the required-asterisk rendering **unconditional** inside `SearchableSelect`'s own label markup:

```tsx
<label htmlFor={id} className="text-sm font-medium text-stone-700">
  {label} <span className="text-rose-500">*</span>
</label>
```

This is additive to `SearchableSelect.tsx` (visual only, zero prop/behavior change), keeps `nuevo`/`editar` passing plain `label="Marca"`/`"Color"`/`"Cliente"` strings, and reproduces the exact same visual result (Tailwind classes, span placement) the native `<select>`'s sibling `<label>` had. If a future non-required use of `SearchableSelect` appears, this should become a proper `required?: boolean` prop — flagging that as a follow-up, not doing it preemptively since YAGNI and it's outside this batch's scope.

### Implementation decisions beyond what design.md/tasks.md pinned down (continuing the numbering from Batch 1)

9. **`SearchableSelect`'s label asterisk is now unconditional** (see above) — the only change to a PR1-shipped file in this batch, and it is additive/compatible: no prop was removed or renamed, `SearchableSelectProps` is byte-for-byte the same interface PR1 shipped.
10. **`editar/[id]/page.tsx` gained a `vehicle` state variable** not mentioned in tasks.md 5.4's phrasing ("Seed each `initialLabel` from the loaded vehicle") — tasks.md implies the loaded vehicle is already available somewhere, but `FormState` (the only state PR1-era code kept after loading) doesn't carry the nested label strings `initialLabel` needs. Storing the full `VehicleListItem` alongside `form` is the minimal correct fix; `form` remains the single source of truth for `updateField`/dirty-tracking, `vehicle` is read-only display data for the `initialLabel` props.

### Build verification

Ran `npm run build` in `client/`. Result: **success**, 0 type errors, 0 lint errors, both `/vehiculos/nuevo` and `/vehiculos/editar/[id]` compiled into the route manifest (`1.49 kB` / `2.25 kB` route-specific JS respectively). All ESLint warnings are the same pre-existing ones from Batch 1 (`react-hooks/exhaustive-deps` on unrelated list pages, `@next/next/no-img-element` in `lib/navigation.tsx`) — none attributed to any file touched in this batch.

**Gotcha discovered:** running `npm run build` (`next build`) while a `next dev` server is already running against the *same* `client/.next` directory corrupts the dev server's cache — `next build` overwrites `.next` with production artifacts mid-flight, and the already-running dev server then 500s with `Cannot find module './NNN.js'` on any subsequent request, because its in-memory webpack-runtime references chunk files that `next build` just deleted/renamed. Recovered by killing the dev-server process (`Stop-Process`) and restarting it (`npm run dev`) — do not run `next build` and `next dev` concurrently against the same `.next` output in future batches; if both are needed, point one at a different `distDir` or run them sequentially.

### Phase 6 manual verification — what was and wasn't actually confirmed

No browser automation is available in this environment, so **none of Phase 6's six scenarios were verified by actually clicking, typing, or observing network requests in a real browser.** What was done instead, and is explicitly weaker evidence:

- **Static/code-path verification** (read `SearchableSelect.tsx`'s implementation and reasoned through each scenario): debounce timing (`SEARCH_DEBOUNCE_MS = 350`, single search-effect keyed on `[searchTerm, open]`), keyboard nav (`highlightedIndex` shared state, `scrollIntoView` effect, `ArrowUp`/`ArrowDown`/`Enter` handlers), quick-create wiring (`handleQuickCreateSubmit` calls `create()` → `onChange` → `setSelectedLabel` → closes modal and panel), nested-Escape guard (`if (quickCreateOpen) return` in `handleKeyDown`), and dirty-tracking (unchanged `updateField` call path). This is the same code PR1 already built and was already flagged in Batch 1's decisions — this batch only confirms it's now actually reachable through the two pages.
- **Build-time verification**: `npm run build` passed with 0 type errors, confirming both pages compile against `SearchableSelect`'s real prop types (not just the design doc's sketch).
- **SSR-level smoke check via `curl`** (after restarting the corrupted dev server): `GET /vehiculos/nuevo` returns 200 and its HTML contains the three expected placeholder strings ("Seleccioná una marca/un color/un cliente"), confirming the page renders server-side without throwing; `GET /vehiculos/editar/1` returns 200 and its HTML contains "Cargando vehículo..." (the loading-state shell, since vehicle data loads client-side), confirming the page doesn't crash on initial render either. This is NOT equivalent to confirming the combobox actually opens, searches, or the modal actually works — `curl` can't execute the client JS that drives all of that.
- **NOT verified**: debounced network call timing/count, keyboard highlight movement and scroll-into-view, quick-create modal open/submit/close cycle for any of the three entities, an actual Cliente 409 response reaching the modal's error banner, the nested-Escape two-keypress sequence, and the dirty-tracking flow actually arming `beforeunload`/the discard-confirm dialog in a live session. **A human needs to run through all six Phase 6 scenarios in an actual browser (`http://localhost:3000/vehiculos/nuevo` and `/vehiculos/editar/[id]` with a real vehicle id) before this change is merged.**

### Constraints honored

- No `server/` files touched.
- No test files added (no test runner exists in `client/package.json`).
- No git commit/push/PR performed — working tree left uncommitted for orchestrator review.
- Did not start a duplicate dev server — reused the existing one on port 3000 (after restarting it to recover from the `next build`/`next dev` cache collision described above); did not touch the server process on port 3001.
