# Presupuestos Management Specification

## Purpose

Backend CRUD (minus delete) for `Presupuesto` records — a pre-sale quote tied to a `Cliente` and a single `TipoServicio`, with product line items (`PresupuestoProducto`) carrying a frozen unit price captured at add-time and a computed total. Header CRUD mirrors `productos/`'s catalog shape (`activo` toggle, dual audit, no delete). Line items mirror `OrdenTrabajoTipoServicioProducto`'s add/update/remove trio (freeze-price-on-add, sum-on-duplicate, recompute-on-update). Access is limited to any authenticated user in this change (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: Presupuesto Data Model

The `Presupuesto` Prisma model MUST declare `id`, `fecha` (`DateTime`), `clienteId` (required FK to `Cliente`, `onDelete: Restrict`), `tipoServicioId` (required single FK to `TipoServicio`, `onDelete: Restrict` — not many-to-many), `telefono` (`String?`), `descripcion` (`String?`), `activo` (`Boolean @default(true)`), nullable `creadoPorId`/`actualizadoPorId` FKs to `User.id` (relations `PresupuestoCreadoPor`/`PresupuestoActualizadoPor`, `onDelete: SetNull`), a `productos PresupuestoProducto[]` back-relation, `createdAt`, `updatedAt`. `User`, `Cliente`, `TipoServicio` MUST each declare the matching back-relation arrays. The migration MUST be additive-only.

#### Scenario: Migration adds Presupuesto without touching existing tables

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN `Presupuesto` and `PresupuestoProducto` tables exist with the fields described
- AND `User`, `Cliente`, `TipoServicio`, `Producto` each gain their new back-relations
- AND no existing table's columns are dropped, renamed, or type-changed

#### Scenario: Deleting a user nulls the audit reference

- GIVEN a `Presupuesto` or `PresupuestoProducto` row whose audit FK points to an existing `User`
- WHEN that `User` row is deleted
- THEN the delete succeeds and the referencing row still exists with the audit field set to `null`

#### Scenario: Deleting a referenced Cliente or TipoServicio is restricted

- GIVEN a `Presupuesto` referencing an existing `Cliente` and `TipoServicio`
- WHEN a delete of that `Cliente` or `TipoServicio` is attempted
- THEN the delete is rejected by the `onDelete: Restrict` FK constraint

### Requirement: PresupuestoProducto Line Item Data Model

The `PresupuestoProducto` Prisma model MUST declare `id`, `presupuestoId` (FK to `Presupuesto`, `onDelete: Cascade`), `productoId` (FK to `Producto`, no cascade), `cantidad` (`Decimal(10,2)`), `precioUnitario` (`Decimal(10,2)`, frozen), `precioTotal` (`Decimal(10,2)`, computed/stored), nullable `actualizadoPorId` (relation `PresupuestoProductoActualizadoPor`, `onDelete: SetNull`), `createdAt`, `updatedAt`, and `@@unique([presupuestoId, productoId])`.

#### Scenario: Deleting a presupuesto cascades to its line items

- GIVEN a `Presupuesto` with one or more `PresupuestoProducto` rows
- WHEN that `Presupuesto` row is deleted at the database level
- THEN its `PresupuestoProducto` rows are deleted as well (cascade)

### Requirement: List Presupuestos Requires Authentication Only

`GET /presupuestos` MUST require a valid Bearer token via `JwtAuthGuard` and MUST return a paginated, filtered list (`page`, `pageSize`, `search`, `status` in `'all' | 'activo' | 'inactivo'`). It MUST NOT check `rol`. Each item MUST use a `SELECT` whitelist including nested `cliente`, `tipoServicio`, `creadoPor: { id, username }`, `actualizadoPor: { id, username }`.

#### Scenario: Authenticated user lists presupuestos

- GIVEN a request to `GET /presupuestos` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with a page of presupuestos including `cliente`, `tipoServicio`, `activo`, audit fields

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /presupuestos` has no `Authorization` header or an invalid token
- WHEN the backend handles the request
- THEN it returns 401 and no presupuesto data is returned

#### Scenario: Status filter narrows the list

- GIVEN presupuestos exist with varying `activo` states
- WHEN `GET /presupuestos` is called with `status: 'activo'` or `'inactivo'`
- THEN only presupuestos matching that status are returned

### Requirement: Get Single Presupuesto

`GET /presupuestos/:id` MUST require a valid Bearer token and MUST return the whitelisted shape including its `productos` line items (each with `producto`, `cantidad`, `precioUnitario`, `precioTotal`). An unmatched `id` MUST return 404.

#### Scenario: Fetch existing presupuesto with line items

- GIVEN an existing presupuesto id with one or more line items and a valid Bearer token
- WHEN `GET /presupuestos/:id` is called
- THEN it returns 200 with the presupuesto's whitelisted shape, including its `productos` array

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing presupuesto
- WHEN `GET /presupuestos/:id` is called
- THEN it returns 404

### Requirement: Create Presupuesto

`POST /presupuestos` MUST require `fecha`, `clienteId`, `tipoServicioId`; MUST accept optional `telefono`, `descripcion`; MUST default `activo` to `true` and MUST NOT accept `activo` as client-settable on create; MAY accept an initial `productos[]` array of line items, each frozen per the line-item add rules below. A nonexistent `clienteId` or `tipoServicioId` MUST return 400.

#### Scenario: Successful creation without initial line items

- GIVEN a valid Bearer token and a body with `fecha`, an existing `clienteId`, an existing `tipoServicioId`
- WHEN `POST /presupuestos` is called
- THEN it returns 201 with the created presupuesto and an empty `productos` array

#### Scenario: Successful creation with initial line items

- GIVEN a valid body that also includes `productos: [{ productoId, cantidad }]` for an active producto with a set `precioVenta`
- WHEN `POST /presupuestos` is called
- THEN it returns 201 with the presupuesto's `productos` array containing the frozen `precioUnitario` and computed `precioTotal`

#### Scenario: Nonexistent clienteId or tipoServicioId is rejected

- GIVEN a body with a `clienteId` or `tipoServicioId` that does not exist
- WHEN `POST /presupuestos` is called
- THEN it returns 400 and no row is created

### Requirement: Update Presupuesto Header

`PATCH /presupuestos/:id` MUST accept `fecha`, `clienteId`, `tipoServicioId` as required fields on every request, while `telefono`, `descripcion`, and `activo` are optional (nullable fields stay optional, matching the `Producto` update convention) — full-body convention, not partial-update. An unmatched `id` MUST return 404. This endpoint MUST NOT modify line items; those are handled through the dedicated sub-routes.

#### Scenario: Successful header update

- GIVEN an existing presupuesto id
- WHEN `PATCH /presupuestos/:id` is called with the full required body and a changed `descripcion`
- THEN it returns 200 with the updated `descripcion`

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing presupuesto
- WHEN `PATCH /presupuestos/:id` is called
- THEN it returns 404 and no row is modified

#### Scenario: Deactivation via activo toggle

- GIVEN an existing active presupuesto
- WHEN `PATCH /presupuestos/:id` is called with `activo: false` and the other required fields unchanged
- THEN the row is updated (not deleted) and subsequently reads back with `activo: false`

### Requirement: Single Required Tipo de Servicio, Not Many-to-Many

A `Presupuesto` MUST have exactly one `cliente` and exactly one `tipoServicio`, both via required single foreign keys. This capability MUST NOT introduce a many-to-many `tiposServicio` relation of the kind used by `OrdenTrabajo`.

#### Scenario: Single tipoServicioId accepted, not an array

- GIVEN a create or update body
- WHEN it is validated
- THEN it accepts a single `tipoServicioId` field, and no `tipoServicioIds` array field exists on the DTO

### Requirement: Telefono Is Independent of Cliente

`telefono` on a `Presupuesto` MUST be stored exactly as supplied by the client and MUST NOT be auto-filled, defaulted, or overwritten from the related `Cliente.telefono` on create or update.

#### Scenario: telefono differs from the cliente's registered phone

- GIVEN a `Cliente` with a registered `telefono` and a create body supplying a different `telefono` value
- WHEN `POST /presupuestos` is called
- THEN the stored presupuesto's `telefono` is exactly the supplied value, not the cliente's

#### Scenario: telefono omitted is not backfilled

- GIVEN a create body that omits `telefono`
- WHEN `POST /presupuestos` is called
- THEN the stored `telefono` is `null`, not copied from `Cliente.telefono`

### Requirement: Add Line Item Freezes Price and Sums on Duplicate

`POST /presupuestos/:id/productos` MUST require an active `productoId` with a non-null `Producto.precioVenta` (else 400) and a `cantidad`. If no existing line for that `productoId` exists on the presupuesto, it MUST create one with `precioUnitario` frozen from the current `Producto.precioVenta` and `precioTotal = precioUnitario * cantidad`. If a line for that `productoId` already exists (per `@@unique([presupuestoId, productoId])`), it MUST sum the new `cantidad` into the existing line's `cantidad`, recompute `precioTotal` from the existing (unchanged) frozen `precioUnitario`, and MUST NOT re-read the catalog price.

#### Scenario: New line freezes the current catalog price

- GIVEN a presupuesto with no existing line for producto P, and P has `precioVenta = 100`
- WHEN `POST /presupuestos/:id/productos` adds P with `cantidad: 2`
- THEN a new line is created with `precioUnitario: 100` and `precioTotal: 200`

#### Scenario: Re-adding the same product sums into the existing line

- GIVEN a presupuesto with an existing line for producto P at `precioUnitario: 100`, `cantidad: 2`
- WHEN `POST /presupuestos/:id/productos` adds P again with `cantidad: 3`
- THEN the existing line's `cantidad` becomes `5`, `precioTotal` becomes `500`, and no second row is created for P
- AND `precioUnitario` remains `100` even if `Producto.precioVenta` has since changed

#### Scenario: Adding a producto with no precioVenta is rejected

- GIVEN a producto with `precioVenta: null`
- WHEN `POST /presupuestos/:id/productos` is called with that `productoId`
- THEN it returns 400 and no line item is created

#### Scenario: Adding an inactive producto is rejected

- GIVEN a producto with `activo: false`
- WHEN `POST /presupuestos/:id/productos` is called with that `productoId`
- THEN it returns 400 and no line item is created

### Requirement: Update Line Item Recomputes Total From Frozen Price

`PATCH /presupuestos/:id/productos/:detalleId` MUST accept a new `cantidad` and MUST recompute `precioTotal` as the line's existing frozen `precioUnitario * cantidad`. It MUST NOT re-read or change `precioUnitario` from the current catalog price.

#### Scenario: Updating cantidad recomputes precioTotal from the frozen price

- GIVEN a line item with `precioUnitario: 100`, `cantidad: 2`, and the catalog `Producto.precioVenta` has since changed to `150`
- WHEN `PATCH /presupuestos/:id/productos/:detalleId` sets `cantidad: 4`
- THEN the line's `precioTotal` becomes `400` (`100 * 4`), not `600`
- AND `precioUnitario` remains `100`

### Requirement: Remove Line Item

`DELETE /presupuestos/:id/productos/:detalleId` MUST delete the specified line item and MUST NOT delete or deactivate the parent presupuesto. An unmatched `detalleId` (or one belonging to a different presupuesto) MUST return 404.

#### Scenario: Deleting a line item leaves the presupuesto intact

- GIVEN a presupuesto with two line items
- WHEN `DELETE /presupuestos/:id/productos/:detalleId` removes one of them
- THEN that line item no longer appears in the presupuesto's `productos`, the other line item remains, and the presupuesto itself still exists with `activo` unchanged

#### Scenario: Mismatched detalleId is rejected

- GIVEN a `detalleId` that belongs to a different presupuesto than `:id`
- WHEN `DELETE /presupuestos/:id/productos/:detalleId` is called
- THEN it returns 404 and no row is deleted

### Requirement: Server-Side Creator and Updater Audit Stamping

`POST /presupuestos` MUST set `creadoPorId` and `actualizadoPorId` from the authenticated caller's JWT (`req.user.userId`). `PATCH /presupuestos/:id` and every line-item write (`POST`/`PATCH` on `/productos` sub-routes) MUST set `actualizadoPorId` from the JWT caller. `PATCH` MUST NOT modify `creadoPorId`. None of these fields MUST be settable from client request body input.

#### Scenario: Create stamps creator and updater from the JWT caller

- GIVEN a valid Bearer token for user U and a `POST /presupuestos` body without `creadoPorId`/`actualizadoPorId`
- WHEN the presupuesto is created
- THEN the stored row has `creadoPorId = U.id` and `actualizadoPorId = U.id`

#### Scenario: Header update stamps only the updater

- GIVEN a presupuesto created by user A, and a valid Bearer token for user B
- WHEN user B calls `PATCH /presupuestos/:id`
- THEN `actualizadoPorId` becomes `B.id` and `creadoPorId` remains `A.id`

#### Scenario: Line-item write stamps actualizadoPorId

- GIVEN a valid Bearer token for user B
- WHEN B calls `POST /presupuestos/:id/productos` or `PATCH /presupuestos/:id/productos/:detalleId`
- THEN the affected line's `actualizadoPorId` becomes `B.id`

#### Scenario: Client-supplied audit fields are ignored

- GIVEN a request body that includes an explicit `creadoPorId` or `actualizadoPorId` different from the caller
- WHEN the request is handled
- THEN the client-supplied value is stripped and the stored value reflects the JWT caller

### Requirement: No Role or Permission Check in This Change

`GET /presupuestos`, `GET /presupuestos/:id`, `POST /presupuestos`, `PATCH /presupuestos/:id`, and the line-item sub-routes MUST authorize solely via `JwtAuthGuard`. This is a deliberate deferral to a future "Permisos" feature.

#### Scenario: Any authenticated rol can manage presupuestos

- GIVEN a valid Bearer token belonging to a user with `rol` `'empleado'`
- WHEN that user calls any presupuestos or line-item route
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: No Delete Capability for the Presupuesto Itself

This capability MUST NOT expose a `DELETE /presupuestos` or `DELETE /presupuestos/:id` route. Deactivation MUST be performed via `PATCH /presupuestos/:id` with `activo: false`. Line-item delete sub-routes are a distinct capability and remain in scope.

#### Scenario: No presupuesto-level delete route exists

- GIVEN the `presupuestos` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /presupuestos` or `DELETE /presupuestos/:id`
- AND `DELETE /presupuestos/:id/productos/:detalleId` does exist as the only delete-shaped route
