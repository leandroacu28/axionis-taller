# Tasks: Vehículos — Searchable Select + Inline Quick-Create

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-580 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (shared components) → PR 2 (page integration) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Resolved — chained PRs, stacked-to-main
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | New shared components: `QuickCreateModal.tsx` + `SearchableSelect.tsx` + `referenceSelectConfigs.tsx` | PR 1 | ~440-470 lines; three new files, not yet imported anywhere — zero functional risk to existing pages, independently reviewable/mergeable |
| 2 | Integrate into `vehiculos/nuevo/page.tsx` and `vehiculos/editar/[id]/page.tsx` | PR 2 | ~110-130 lines changed across two files; depends on PR 1's components and config exports |

## Phase 1: Shared Quick-Create Modal (`QuickCreateModal.tsx`)

- [x] 1.1 Create `client/app/(dashboard)/vehiculos/QuickCreateModal.tsx`: define the schema-driven props interface (`title`, `entityLabel`, `fields: QuickCreateField[]`, `prefillValue?`, `onSubmit`, `onClose`), built on the existing `Modal.tsx`
- [x] 1.2 Implement generic field-value state: initialize each field's value from `defaultValue`, seeding the `prefillField` entry from `prefillValue` when present
- [x] 1.3 Implement required-field validation mirroring the pages' `showError('Campos incompletos', …)` pattern — check every `field.required` is non-empty before submit
- [x] 1.4 Implement submit handling: `try/catch` around `onSubmit(values)`; on failure render `err.message` inside the reused red banner (`border-red-200 bg-red-50 … text-red-600`) without closing the modal; on success let the caller close it
- [x] 1.5 Render each field per `QuickCreateField.type` (`text` input or `select` populated from `options`), using `label`/`placeholder`/`required`

## Phase 2: The Combobox (`SearchableSelect.tsx`)

- [x] 2.1 Create `client/app/(dashboard)/vehiculos/SearchableSelect.tsx`: define the component with the exact `SearchableSelectProps` interface from design.md, plus internal state (`open`, `searchInput`, `search`, `loading`/`results`/`error`, `highlightedIndex`, `quickCreateOpen`, `selectedLabel`)
- [x] 2.2 Implement the closed control: displays `selectedLabel` (or `initialLabel` before first interaction, or `placeholder`); click/focus transitions to `open`
- [x] 2.3 Implement portal positioning: `getBoundingClientRect()` on open, `position:'fixed'` coords, flip-up when `innerHeight - rect.bottom < PANEL_HEIGHT_ESTIMATE`, `createPortal(..., document.body)`
- [x] 2.4 Implement dismiss handling: `mousedown` outside (`triggerRef`/`panelRef`) closes the panel; `resize` listener closes the panel; **non-capture** `window` `scroll` listener closes the panel (per design's scroll-divergence rationale — do not use capture-phase like the row-menu precedent)
- [x] 2.5 Implement debounced search: keystroke sets `searchInput` instantly; 350ms debounce sets `search`; `useEffect([search])` calls `config.search(search)` with `status:'activo'`, populating `loading`/`results`/`empty`/`error`
- [x] 2.6 Implement the keyboard contract on the search input's `onKeyDown`: `ArrowDown`/`ArrowUp` move and clamp `highlightedIndex` with `preventDefault`; `Enter` selects `results[highlightedIndex]` with `preventDefault`; `Escape` closes the panel and returns focus to the control **unless `quickCreateOpen` is true** (guard returns early, leaving both the modal-closing keypress and the panel untouched)
- [x] 2.7 Implement `highlightedIndex` as the single shared source of truth: row `onMouseEnter` sets it, arrow keys set it, row highlight style reads `i === highlightedIndex`; add `useEffect([highlightedIndex])` calling `rowRefs[highlightedIndex]?.scrollIntoView({ block: 'nearest' })`
- [x] 2.8 Render result rows plus a persistent `+ Crear <entityLabel>` footer action — visible with zero, one, or many results — prefilled from `searchInput` into `quickCreate.prefillField` when opening the modal
- [x] 2.9 Wire selection: Enter or row click calls `props.onChange(id)`, sets internal `selectedLabel` from the row, and closes the panel
- [x] 2.10 Host `QuickCreateModal` inside `SearchableSelect`: `quickCreateOpen` state toggled by the footer action; on submit success call `config.create(values)`, then `onChange(newId)`, set `selectedLabel`, and close both the modal and the panel; on submit error the modal shows the error and stays open, panel stays open behind it

## Phase 3: Entity Configs (`referenceSelectConfigs.tsx`)

- [x] 3.1 Create `client/app/(dashboard)/vehiculos/referenceSelectConfigs.tsx`: import `listBrands`/`listColors`/`listCustomers`, `createBrand`/`createColor`/`createCustomer`, and `ID_TYPES`/`ID_TYPE_LABELS`
- [x] 3.2 Export `marcaSelectConfig`: `search` maps `listBrands({ search, status: 'activo', page: 1, pageSize: 20 })` results to `{ id, label: marca + ' ' + modelo }`; `create` assembles `values` into `createBrand`'s payload and maps the response to `Option`; `quickCreate` fields `marca`/`modelo` (text, both required), `prefillField: 'marca'`
- [x] 3.3 Export `colorSelectConfig`: `search` maps `listColors({ search, status: 'activo', page: 1, pageSize: 20 })` results to `{ id, label: descripcion }`; `create` assembles `values` into `createColor`'s payload; `quickCreate` field `descripcion` (text, required), `prefillField: 'descripcion'`
- [x] 3.4 Export `clienteSelectConfig`: `search` maps `listCustomers({ search, status: 'activo', page: 1, pageSize: 20 })` results to `{ id, label: razonSocial }`; `create` assembles `values` into `createCustomer`'s payload; `quickCreate` fields `razonSocial` (text, required), `tipoIdentificacion` (select seeded from `ID_TYPES`/`ID_TYPE_LABELS`, required), `identificacion` (text, required), `telefono` (text), `domicilio` (text); `prefillField: 'razonSocial'`

## Phase 4: Integrate into `vehiculos/nuevo/page.tsx`

- [x] 4.1 Delete the option-fetch apparatus: `optionsLoading`, `brands`, `colors`, `customers` state, and the `Promise.all` mount `useEffect` that populates them
- [x] 4.2 Delete now-unused imports: `listBrands`/`listColors`/`listCustomers` and their `*ListItem` types; remove `disabled={optionsLoading}` and `optionsLoading` from the submit-button `disabled` condition
- [x] 4.3 Import `SearchableSelect` and `marcaSelectConfig`/`colorSelectConfig`/`clienteSelectConfig` from `referenceSelectConfigs.tsx`
- [x] 4.4 Replace the Marca `<select>` with `<SearchableSelect value={form.marcaId} onChange={(id) => updateField('marcaId', id)} {...marcaSelectConfig} />` (label/placeholder per current field copy)
- [x] 4.5 Replace the Color `<select>` with the equivalent `<SearchableSelect>` wired to `form.colorId` / `updateField('colorId', id)` using `colorSelectConfig`
- [x] 4.6 Replace the Cliente `<select>` with the equivalent `<SearchableSelect>` wired to `form.clienteId` / `updateField('clienteId', id)` using `clienteSelectConfig`

## Phase 5: Integrate into `vehiculos/editar/[id]/page.tsx`

- [x] 5.1 Delete the same option-fetch apparatus as 4.1 (`optionsLoading`/`brands`/`colors`/`customers` state, `Promise.all` fetch effect) and the same unused imports/`disabled` references as 4.2 — the vehicle-load effect itself is untouched
- [x] 5.2 Import `SearchableSelect` and the three configs from `referenceSelectConfigs.tsx`
- [x] 5.3 Replace the Marca/Color/Cliente `<select>` elements with `<SearchableSelect>` instances wired to `form.marcaId`/`form.colorId`/`form.clienteId` via `updateField`, matching 4.4-4.6
- [x] 5.4 Seed each `initialLabel` from the loaded vehicle so the collapsed control shows the correct label before interaction: Marca → `vehicle.marca.marca + ' ' + vehicle.marca.modelo`, Color → `vehicle.color.descripcion`, Cliente → `vehicle.cliente.razonSocial`
- [x] 5.5 Confirm (no code change expected) that `isFormDirty`, the `beforeunload` listener, and the discard-confirm dialog require zero modification, since combobox selection still flows through the same `updateField` setter the native `<select onChange>` handlers used

## Phase 6: Manual Verification

- [~] 6.1 Debounced search: on the dev server, type in each of the three comboboxes (nuevo and editar) and confirm exactly one `list*` call fires ~350ms after the last keystroke, with `status=activo` in the request — statically confirmed via code read (`SEARCH_DEBOUNCE_MS = 350`, single `useEffect([searchTerm, open])` call site); NOT confirmed by live browser interaction
- [~] 6.2 Keyboard navigation: confirm Arrow Up/Down move the highlight and scroll it into view past the fold, Enter selects the highlighted result and closes the panel, and hovering a row with the mouse syncs the same highlight state — statically confirmed via code read (shared `highlightedIndex` state, `scrollIntoView` effect); NOT confirmed by live browser interaction
- [~] 6.3 Quick-create per entity: from each combobox (Color, Marca, Cliente), trigger `+ Crear`, submit valid values, and confirm the new record becomes the selected value and both the modal and panel close — statically confirmed via code read (`handleQuickCreateSubmit` calls `onChange`/`setSelectedLabel`/closes both); NOT confirmed by live browser interaction
- [~] 6.4 Cliente 409 conflict: submit the Cliente quick-create modal with an `identificacion` that already exists and confirm the duplicate-`identificacion` message (matching `/clientes/nuevo`) renders inside the modal, which stays open, while the panel behind it also stays open — statically confirmed via code read (error banner rendering, `quickCreateOpen` guard on dismiss handlers); NOT confirmed with a real 409 response in a live browser
- [~] 6.5 Nested Escape: with a combobox panel open and its quick-create modal open on top, press Escape once and confirm only the modal closes (panel stays open, focus returns to the panel's search input); press Escape again and confirm the panel now closes — statically confirmed via code read (`if (quickCreateOpen) return` guard in `handleKeyDown`); NOT confirmed by live browser interaction
- [~] 6.6 Dirty tracking on editar: select an existing value and separately quick-create a new value in a combobox on `editar/[id]`, and confirm `isFormDirty()` becomes true, the `beforeunload` guard is armed, and the discard-confirm dialog fires on navigation away, exactly as it did with the native `<select>` — statically confirmed via code read (`onChange` still calls `updateField`, unchanged `isFormDirty`/`beforeunload`/`handleCancel` logic); NOT confirmed by live browser interaction

**Note:** `[~]` marks statically-verified-only items (build passed, SSR page load confirmed via curl, code paths read and reasoned about) — none of Phase 6 was verified via actual browser click/keyboard/network-tab interaction, which this environment cannot perform. A human should click through all six scenarios in a real browser before merge.
