# Proposal: Productos CRUD (Create, List, Update)

## Intent
The workshop needs a catalog of *products/supplies* (insumos) it buys and sells, but no `Producto` concept exists anywhere in the schema today (net-new — zero references). This change delivers a "Productos" section where any authenticated user can list, create, and edit products with pricing, stock, VAT rate, and a required unit of measure, each stamped with a create/update audit trail. It is the third catalog in the family after `TipoServicio` and `UnidadMedida` and reuses their CRUD shell verbatim — but it is materially richer: it introduces **the first money/`Decimal` fields**, **the first derived/computed field** (`precioVenta`), **the first VAT enum** (`alicuotaIva`), and **the first REQUIRED FK to another catalog** (`unidadMedida`). Establishing these precedents cleanly here keeps the codebase consistent for every future priced/stocked entity.

## Scope

### In Scope
- **Data model**: new `Producto` Prisma model + one additive migration. Fields: `id`, `descripcion` (`String @unique`), `unidadMedidaId Int` / `unidadMedida UnidadMedida @relation(...)` (**required**, mirroring `Vehiculo → Marca` shape, no explicit `onDelete` → Prisma restrict-like default), `activo Boolean @default(true)`, `cantidadInicial`, `alertaStock Boolean`, `cantidadMinima`, `precioCompra`, `porcentajeGanancia`, `precioVenta` (derived, stored), `precioMayorista`, `alicuotaIva` (enum `21 | 10.5`), dual nullable `User` audit FKs `creadoPorId`/`creadoPor` + `actualizadoPorId`/`actualizadoPor` (both `onDelete: SetNull`), `createdAt`/`updatedAt`. Adds a `productos` back-relation on `UnidadMedida` and two `User` back-relations.
- **Backend**: new `server/src/productos/` module mirroring `server/src/unidades-medida/` file-for-file — thin controller (`@UseGuards(JwtAuthGuard)` only), service owning all Prisma calls, create/update/list-query DTOs, registered in `app.module.ts`.
- **Endpoints** (route base `productos`): `GET /` (paginated + filtered list), `GET /:id`, `POST /`, `PATCH /:id`. **No `DELETE`. No `/export`.** `POST` stamps `creadoPorId` + `actualizadoPorId`; `PATCH` stamps `actualizadoPorId` from `req.user.userId`. Service validates that `unidadMedidaId` references an existing `UnidadMedida` (400/404 otherwise). `precioVenta` is computed server-side on every create/update — never accepted from client input.
- **Frontend**: new `client/app/(dashboard)/productos/page.tsx` (list + filters + pagination, no export) + shared `ProductoFormModal.tsx` (create/edit; `activo` only in edit; dirty-check confirm on close via `lib/alerts.ts`; `precioVenta` shown read-only/auto-computed) + a **searchable select** for Unidad de Medida (mirroring `client/app/(dashboard)/vehiculos/SearchableSelect.tsx`) + typed `client/app/lib/productos.ts` client + one flat nav entry.

### Out of Scope
- **Delete** — deactivation via `activo` toggle (soft-disable), same as sibling catalogs.
- **Excel export** — not requested; separate change if wanted later (same posture as `UnidadMedida`).
- **Access control / permissions** — `JwtAuthGuard` only; no `RolesGuard` exists; deferred to future Permisos.
- **Stock movement history / transactions** — `cantidadInicial` is a single editable current-quantity field; no ledger, no in/out movement log.
- **Consumers** — no work-order/sale entity references `Producto`; wiring is a future change.

## Confirmed Decisions (final — user-confirmed, do not re-open)
- **D1 — `precioVenta` is derived, not editable**: computed as `precioVenta = precioCompra * (1 + porcentajeGanancia/100)`. Read-only in UI, stripped from write DTOs, recomputed server-side on every create/update. **Stored (denormalized), not computed-on-read** — chosen so listing/sorting/filtering by sale price is trivial (no codebase precedent either way; this sets it).
- **D2 — `alertaStock` and `cantidadMinima` are separate fields**: `alertaStock` (Boolean) enables/disables the low-stock warning; `cantidadMinima` (numeric) is the threshold that triggers it when `alertaStock` is true.
- **D3 — `cantidadInicial` is the current on-hand quantity**, freely editable via `PATCH` at any time — NOT a one-time historical seed. Field name kept as `cantidadInicial` per user request despite the "current quantity" semantics; this naming nuance is intentional, not an oversight.
- **D4 — `alicuotaIva` is a fixed two-value enum (`21`, `10.5`)** — Argentine VAT rates. Modeled as a constrained Prisma enum, NOT an open decimal and NOT a lookup table.

## Flagged Assumptions (NOT yet confirmed — user should review/correct)
- **A1 — `precioMayorista` is independently editable** (manually entered wholesale price), NOT derived from `precioCompra`/`porcentajeGanancia` the way `precioVenta` is. If it should be derived, that changes DTO + compute logic.
- **A2 — Quantity fields are `Decimal`, not `Int`** (`cantidadInicial`, `cantidadMinima`) — a unit of measure can be fractional (e.g. 2.5 kg). If products are always whole units, these become `Int`.
- **A3 — `descripcion` is globally unique** (`@unique`, 409 on duplicate), mirroring every existing catalog. Products could plausibly share near-identical names; consistency favors uniqueness unless the user opts out.
- **A4 — Money/decimal precision**: `Decimal(10,2)` for `precioCompra`, `precioVenta`, `precioMayorista`; `Decimal(5,2)` for `porcentajeGanancia` (e.g. 45.50%). First `Decimal` precedent in the codebase. Assume same precision for `Decimal` quantity fields (A2) pending confirmation.

## Capabilities

### New Capabilities
- `products-management`: backend CRUD (create/list/update, no delete, no export) for products with derived sale price, VAT rate, stock threshold, a required unit-of-measure FK, and create/update audit stamping, available to any authenticated user.

### Modified Capabilities
- `units-of-measure-management`: gains its first consumer — `Producto` holds a required FK to `UnidadMedida`, and a `productos` back-relation is added. Requirement change: a `UnidadMedida` row referenced by any product cannot be deleted (restrict-like default). No delete endpoint exists today, so behavior is unaffected in practice but the invariant is now spec-relevant.
- `app-navigation`: adds one flat "Productos" entry, no role filtering — consistent with existing sections.

## Approach
Copy the shipped `unidades-medida` backend module and frontend route as the CRUD shell, renaming to `Producto`/`productos`, then extend for the richer field set: add `Decimal` price fields + the compute step for `precioVenta` in the service (on create and update), add the `alicuotaIva` enum, and add the required `unidadMedida` relation with an existence check. The frontend reuses the shared-modal + list-page pattern and adds a searchable Unidad de Medida select copied from `vehiculos/SearchableSelect.tsx`. Prisma money fields use `@db.Decimal(p,s)` per A4. The required FK mirrors `Vehiculo.marcaId` (required, relation without cascade) rather than the nullable audit-FK shape.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modified | New `Producto` model + `alicuotaIva` enum; `productos` back-relation on `UnidadMedida`; 2 `User` back-relations |
| `server/prisma/migrations/` | New | One additive migration (new table + enum + FKs) |
| `server/src/productos/` | New | Module, controller, service, DTOs |
| `server/src/app.module.ts` | Modified | Register `ProductosModule` |
| `client/app/(dashboard)/productos/` | New | `page.tsx` + `ProductoFormModal.tsx` + searchable UM select |
| `client/app/lib/productos.ts` | New | Typed API client |
| `client/app/lib/navigation.tsx` | Modified | One nav entry |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `precioVenta` accepted from client or drifts from compute rule | Med | Strip from write DTOs; recompute server-side every write; spec asserts it |
| First `Decimal` money fields — float/rounding or precision mismatch | Med | Fix `@db.Decimal(10,2)`/`(5,2)` (A4); handle as string/Decimal, never JS float |
| Required `unidadMedidaId` created without validating the referenced UM exists | Med | Service pre-checks UM existence → 400/404; FK enforces at DB level |
| `alicuotaIva` enum value formatting (`10.5` not a clean identifier) | Med | Design phase specifies exact enum representation (e.g. string-valued enum) |
| Flagged assumptions (A1–A4) wrong → rework of schema/DTO | Med | Surfaced as labeled items for user review before spec/design freeze |
| Any authenticated user can manage products | Accepted | Deliberate deferral to Permisos, same as all sections |
| Migration runs against wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating |

## Rollback Plan
Additive-only. Rollback is mechanical and **must respect FK ordering** because `Producto` depends on `UnidadMedida`: (1) revert the migration — drop the `Producto` table (and its FKs to `UnidadMedida` and `User`) and the `alicuotaIva` enum **before** touching `UnidadMedida`; `UnidadMedida` itself is untouched by this change and stays. (2) Remove `server/src/productos/` and its `app.module.ts` import; remove the `productos` back-relation on `UnidadMedida` and the two `User` back-relations. (3) Remove `client/app/(dashboard)/productos/`, `client/app/lib/productos.ts`, and the nav entry. No backfill/data migration, so no loss beyond the product rows themselves.

## Open Items
- **Inline UnidadMedida quick-create**: `vehiculos/` ships a `QuickCreateModal.tsx` letting users create a Marca/Color inline from the form. Whether the Producto form gets an equivalent "create UM inline" affordance adds real scope. **Leaning: defer to a follow-up** and ship only the searchable select in this first slice — `sdd-design` makes the final call with rationale.
- **Nav icon**: reuse a placeholder icon (existing convention) or request a dedicated `productos.svg`; non-blocking, swappable later.

## Success Criteria
- [x] `GET /productos`, `GET /:id`, `POST /`, `PATCH /:id` require a valid Bearer token (401 otherwise); no `DELETE`, no `/export`.
- [x] `precioVenta` is never read from client input; it is recomputed from `precioCompra` + `porcentajeGanancia` on every create and update (D1).
- [x] `alicuotaIva` accepts only `21` or `10.5`; any other value is rejected (D4).
- [x] `alertaStock` (Boolean) and `cantidadMinima` (numeric) persist independently (D2); `cantidadInicial` is editable via `PATCH` (D3).
- [x] `Producto` requires a valid existing `unidadMedidaId`; a missing/invalid reference is rejected; the referenced `UnidadMedida` cannot be deleted while referenced.
- [x] Duplicate `descripcion` returns 409 on create and update (A3, pending confirmation).
- [x] `POST` stamps `creadoPorId` + `actualizadoPorId`; `PATCH` updates `actualizadoPorId` from the JWT caller, never client input; both audit FKs `onDelete: SetNull`.
- [x] `/productos` page lists (paginated + filtered) and opens a shared modal for create/edit; `activo` only in edit; `precioVenta` shown read-only; Unidad de Medida chosen via searchable select; unsaved-close prompts confirm.
- [x] One flat "Productos" nav entry visible to any authenticated user.
- [x] Migration is additive-only and reversible per the Rollback Plan (FK ordering respected).
