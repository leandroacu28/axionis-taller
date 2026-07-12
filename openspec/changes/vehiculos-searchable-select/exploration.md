# Exploration: Vehículos — Searchable Select + Inline Create for Marca/Color/Cliente

## Current State

Both `client/app/(dashboard)/vehiculos/nuevo/page.tsx` and `client/app/(dashboard)/vehiculos/editar/[id]/page.tsx` render `marcaId`, `colorId`, `clienteId` as plain native `<select>` elements — no search, no inline create. Options are loaded once on mount via:

```ts
Promise.all([
  listBrands({ page: 1, pageSize: 100, status: 'activo' }),
  listColors({ page: 1, pageSize: 100, status: 'activo' }),
  listCustomers({ page: 1, pageSize: 100, status: 'activo' }),
])
```

into `brands: BrandListItem[]`, `colors: ColorListItem[]`, `customers: CustomerListItem[]` state, gated by a single `optionsLoading` flag that disables all three selects while in flight. Each `<option>` shows `brand.marca + ' ' + brand.modelo`, `color.descripcion`, `customer.razonSocial` respectively. The `pageSize: 100` cap means any shop with >100 active brands/colors/clientes silently truncates the list today — worth flagging even though search would mask it.

**FormState / dirty-tracking asymmetry between the two pages:**
- `nuevo/page.tsx`: flat `FormState` (`marcaId, colorId, anio, kilometraje, clienteId`), no dirty tracking, no `beforeunload` guard — a plain create form.
- `editar/[id]/page.tsx`: same fields plus `activo`, and a full dirty-tracking apparatus — `initialFormRef` (`useRef<FormState|null>`) captures the loaded baseline, `isFormDirty()` shallow-compares every key, `isDirty` gates both a native `beforeunload` listener and an in-app `showConfirm` on Cancel. Any new combobox/inline-create component must integrate with this baseline comparison in the edit page but can be simpler in the create page.

Both pages share the same `updateField<K>` generic setter pattern and identical Tailwind classes for the select (`rounded-lg border border-stone-200 bg-stone-50 ...`).

## The Crux: Create-Endpoint Field-Complexity Asymmetry

This is the central open problem for the proposal phase. The three entities' create payloads are wildly different in shape:

| Entity | DTO file | Required fields | Validation complexity |
|---|---|---|---|
| **Color** | `server/src/colors/dto/create-color.dto.ts` | `descripcion: string` (1 field) | `@IsString() @IsNotEmpty()` only |
| **Marca** | `server/src/brands/dto/create-brand.dto.ts` | `marca: string, modelo: string` (2 fields) | Both `@IsString() @IsNotEmpty()`, no cross-field logic |
| **Cliente** | `server/src/customers/dto/create-customer.dto.ts` | `razonSocial, tipoIdentificacion, identificacion, telefono, domicilio` (5 fields) | `tipoIdentificacion` is an enum (`@IsIn(ID_TYPES)`, `dni\|cuit\|cuil`); `identificacion` has a custom validator (`IsIdentificacionValida`, `server/src/customers/dto/identificacion.validator.ts`) that picks a regex per `tipoIdentificacion` (`dni: /^\d{7,8}$/`, `cuit`/`cuil: /^\d{11}$/`) after a `@Transform` strips non-digits; `identificacion` is also globally unique, enforced by a `findUnique` pre-check + a TOCTOU backstop that catches Prisma's `P2002` in `customers.service.ts::create()` and throws `ConflictException('La identificación ya está registrada.')` |

Concretely:
- **Color** → a single free-text "type a name, hit create" affordance inside the combobox dropdown works cleanly, no extra fields needed.
- **Marca** → needs *two* text inputs (marca + modelo) — a bare "create from search term" doesn't map 1:1 onto the payload; the search term would have to become one of two fields, leaving the other blank, or the UI needs a small 2-field mini-form.
- **Cliente** → cannot be reduced to a quick free-text create at all: it needs an enum selector, a format-validated identifier field, and phone/address — plus server-side duplicate handling that the UI has to surface (a 409 with a specific message, not a generic error). A single search-box "create" button is structurally insufficient here.

This asymmetry is the reason the proposal phase must decide per-entity UX (quick-create popover vs. mini-modal vs. reusing the full `/clientes/nuevo` page), not a single uniform pattern.

## Existing Patterns to Reuse

- **`client/app/components/ui/Modal.tsx`** — portal-based (`createPortal` to `document.body`), listens for `Escape` via `document.addEventListener('keydown', ...)`, freezes `body.style.overflow` while open, dismiss-on-backdrop-click via an absolutely positioned overlay `div` with `onClick={onClose}`. Generic `title`/`description`/`children` props — reusable as-is for any inline-create mini-form.
- **Nuance**: the app currently has two coexisting CRUD UI patterns. `colores/` and `marcas/` list pages (`ColorFormModal.tsx`, `BrandFormModal.tsx`) open `Modal` for both create and edit, staying on the list page. `clientes/` and `vehiculos/` instead use dedicated routed pages (`.../nuevo/page.tsx`, `.../editar/[id]/page.tsx`) — vehiculos itself does not use the modal pattern for its own CRUD, even though the two entities it references (marca, color) do use modals in their own list pages. Both `ColorFormModal` and `BrandFormModal` follow the identical `isFormDirty`/`initialFormRef` dirty-tracking pattern as `editar/[id]/page.tsx` — an established, copy-pasted convention across the codebase, not unique to one file.
- **No combobox/autocomplete library exists anywhere in the client.** Confirmed via `client/package.json`: dependencies are only `next`, `react`, `react-dom`, `sweetalert2`, `sweetalert2-react-content`; devDependencies are build tooling only (no `@headlessui/react`, `cmdk`, `downshift`, `react-select`). A grep for `combobox|autocomplete|Listbox|cmdk|downshift|react-select` across `client/app` returned only a false positive (the HTML `autocomplete` input attribute in `login/page.tsx` and the usuarios pages) — zero actual UI-library usage. Any searchable-select/inline-create component must be built from scratch with plain React + Tailwind, consistent with this codebase's established "no external UI libs" approach.
- **Closest existing precedent for a floating, dismissible panel**: the row-action "⋯" menu in `client/app/(dashboard)/vehiculos/page.tsx` (lines ~106–212). Pattern: `getBoundingClientRect()` on the trigger button at click time → fixed-position coordinates computed once (`top`/`left`), flips upward if `window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE`; rendered via `createPortal` to `document.body`; dismissed via a `mousedown` listener checking `triggerRef.current?.contains(target)` / `menuRef.current?.contains(target)`; closes (rather than repositions) on `scroll`/`resize`. Gap: this menu has no keyboard navigation (no arrow keys, no Enter-to-select, no Escape) — only `Modal.tsx` handles `Escape`. A searchable combobox would need to extend this positioning/dismiss pattern with real keyboard support, which doesn't exist anywhere in the codebase yet.

## Scope Boundary Check

Grep for `listBrands(`, `listColors(`, `listCustomers(` across `client/app` found exactly 8 files:
- `app/lib/brands.ts`, `app/lib/colors.ts`, `app/lib/customers.ts` — the function definitions themselves.
- `app/(dashboard)/marcas/page.tsx` → calls `listBrands` only (its own list page).
- `app/(dashboard)/colores/page.tsx` → calls `listColors` only (its own list page).
- `app/(dashboard)/clientes/page.tsx` → calls `listCustomers` only (its own list page).
- `app/(dashboard)/vehiculos/nuevo/page.tsx` and `app/(dashboard)/vehiculos/editar/[id]/page.tsx` → call all three together.

Confirmed: the vehiculos create/edit forms are the only place in the app that consumes all three entities as cross-referenced selects. No other form call sites exist to bring into scope. This change is correctly bounded to the two vehiculos form pages; it should not touch the colores/marcas/clientes list pages' own modals, nor any other form.

## Open Questions for the Proposal Phase

- What does "inline create" mean per entity given the field-count asymmetry above — a single free-text quick-create for Color, a small 2-field popover for Marca, and either a reduced mini-modal or a link-out to the existing `/clientes/nuevo` full page for Cliente?
- Should the new combobox be a single reusable component parameterized per entity (generic `SearchableSelect<T>` with pluggable render/create-form slots), or three separate purpose-built components given how different the create flows are?
- Does creating a new Marca/Color/Cliente from inside the vehicle form need the same validation/duplicate-handling as the existing dedicated create flows — specifically Cliente's unique `identificacion` conflict (`ConflictException` / 409 from `customers.service.ts::create()`) and the per-`tipoIdentificacion` format regex from `identificacion.validator.ts`? If yes, the inline-create UI for Cliente needs to surface that same error path.
- Keyboard accessibility expectations (arrow keys to navigate filtered options, Enter to select, Escape to close) — required for this change, or acceptable as a follow-up given no existing dropdown in this codebase currently supports it?
- Should the `pageSize: 100` cap on the three `list*` calls be revisited now that a search box exists (e.g., switch to server-side search-as-you-type instead of client-side filtering over a capped 100-item local list), or is that out of scope for this change?

## Ready for Proposal

Yes — investigation is complete and the field-complexity asymmetry (the main design fork) is documented in enough detail for `sdd-propose` to make a per-entity UX decision with user input.
