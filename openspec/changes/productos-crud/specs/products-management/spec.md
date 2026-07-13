# Products Management Specification

## Purpose

Backend CRUD (create/list/update, no delete, no export) for `Producto` records — the third catalog after `TipoServicio` and `UnidadMedida`, mirroring their CRUD shell. Introduces money/`Decimal` fields, a server-computed sale price, a fixed VAT enum, and a required FK to `UnidadMedida`. Access is limited to any authenticated user (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: Producto Data Model

The `Producto` Prisma model MUST declare `id`, `descripcion` (`String`, `@unique`), `unidadMedidaId` (`Int`, required FK to `UnidadMedida.id`, no `onDelete` override — restrict-like default), `activo` (`Boolean`, `@default(true)`), `cantidadInicial` (`Decimal(10,2)`), `alertaStock` (`Boolean`), `cantidadMinima` (`Decimal(10,2)`), `precioCompra` (`Decimal(10,2)`), `porcentajeGanancia` (`Decimal(5,2)`), `precioVenta` (`Decimal(10,2)`, stored/derived), `precioMayorista` (`Decimal(10,2)`), `alicuotaIva` (enum, values `21` | `10.5`), nullable `creadoPorId`/`actualizadoPorId` FKs to `User.id` (`onDelete: SetNull`), `createdAt`, `updatedAt`. The migration MUST be additive-only.

#### Scenario: Migration adds Producto without touching existing tables

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN a `Producto` table exists with the fields above and the `alicuotaIva` enum
- AND no existing table's columns are dropped, renamed, or type-changed

#### Scenario: Deleting a user nulls the audit reference

- GIVEN a `Producto` row whose `creadoPorId` and/or `actualizadoPorId` point to an existing `User`
- WHEN that `User` row is deleted
- THEN the delete succeeds and the `Producto` row still exists with the corresponding field set to `null`

### Requirement: List Products Requires Authentication Only

`GET /productos` MUST require a valid Bearer token via `JwtAuthGuard` and MUST return a paginated, filtered list (`page`, `pageSize`, `search` on `descripcion`, `status` in `'all' | 'activo' | 'inactivo'`). It MUST NOT check `rol`. Each item MUST use a `SELECT` whitelist including nested `unidadMedida`, `creadoPor: { id, username }`, `actualizadoPor: { id, username }`.

#### Scenario: Authenticated user lists productos

- GIVEN a request to `GET /productos` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with a page of productos including pricing, stock, VAT, unit, and audit fields

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /productos` has no `Authorization` header or an invalid token
- WHEN the backend handles the request
- THEN it returns 401 and no producto data is returned

### Requirement: Get Single Product

`GET /productos/:id` MUST require a valid Bearer token and return the whitelisted shape. An unmatched `id` MUST return 404.

#### Scenario: Fetch existing producto by id

- GIVEN an existing producto id and a valid Bearer token
- WHEN `GET /productos/:id` is called
- THEN it returns 200 with that producto's whitelisted shape

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing producto
- WHEN `GET /productos/:id` is called
- THEN it returns 404

### Requirement: Create Product

`POST /productos` MUST require `descripcion` (non-empty, unique — 409 on duplicate via TOCTOU-safe pre-check plus `P2002` backstop), `unidadMedidaId` (must reference an existing `UnidadMedida` with `activo: true`, else 400), `precioCompra`, `porcentajeGanancia`, `alicuotaIva`, `cantidadInicial`, `alertaStock`, `cantidadMinima`. `precioMayorista` MAY be provided independently. `activo` MUST default to `true` and MUST NOT be settable on create.

#### Scenario: Successful product creation

- GIVEN a valid Bearer token, a unique `descripcion`, and a valid `unidadMedidaId`
- WHEN `POST /productos` is called
- THEN it returns 201 with the created producto, including a server-computed `precioVenta`

#### Scenario: Duplicate descripcion is rejected

- GIVEN a `descripcion` already used by another producto
- WHEN `POST /productos` is called with that `descripcion`
- THEN it returns 409 and no row is created

#### Scenario: Nonexistent unidadMedidaId is rejected

- GIVEN a `unidadMedidaId` that does not match any existing `UnidadMedida`
- WHEN `POST /productos` is called
- THEN it returns 400 and no row is created

#### Scenario: Inactive unidadMedidaId is rejected

- GIVEN a `unidadMedidaId` that matches an existing `UnidadMedida` with `activo: false`
- WHEN `POST /productos` is called
- THEN it returns 400 and no row is created

### Requirement: Update Product

`PATCH /productos/:id` MUST accept `descripcion`, `unidadMedidaId`, `precioCompra`, `porcentajeGanancia`, `precioMayorista`, `alicuotaIva`, `cantidadInicial`, `alertaStock`, `cantidadMinima` as required fields on every request, plus `activo` as the only truly optional field — mirroring the repeat-fields convention used by `PATCH /unidades-medida/:id` rather than a partial-update model. `cantidadInicial` MUST be freely editable at any time (current on-hand quantity, not a one-time seed). An unmatched `id` MUST return 404. `unidadMedidaId` MUST be revalidated against existing, active `UnidadMedida` rows on every update (not only when it changes, since the update DTO always carries it) — a currently inactive `UnidadMedida` blocks further updates to a producto until its `unidadMedidaId` is switched to an active unit. A `descripcion` change to a value used by a different producto MUST return 409.

#### Scenario: Successful update including stock quantity

- GIVEN an existing producto id
- WHEN `PATCH /productos/:id` is called with a new `cantidadInicial`
- THEN it returns 200 with the updated `cantidadInicial`

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing producto
- WHEN `PATCH /productos/:id` is called
- THEN it returns 404 and no row is modified

#### Scenario: Update to a duplicate descripcion is rejected

- GIVEN two existing productos A and B with distinct `descripcion` values
- WHEN `PATCH /productos/:id` is called on A with B's `descripcion`
- THEN it returns 409 and A's row is not modified

### Requirement: Derived Sale Price Computation

`precioVenta` MUST be computed server-side as `precioCompra * (1 + porcentajeGanancia / 100)` on every `POST` and `PATCH` that affects either input, and MUST be stored (not computed-on-read). Any `precioVenta` value present in a request body MUST be ignored — never persisted from client input.

#### Scenario: precioVenta is computed on create

- GIVEN a `POST /productos` body with `precioCompra: 100` and `porcentajeGanancia: 20`
- WHEN the producto is created
- THEN the stored `precioVenta` is `120`

#### Scenario: precioVenta is recomputed on update

- GIVEN an existing producto
- WHEN `PATCH /productos/:id` changes `precioCompra` or `porcentajeGanancia`
- THEN the stored `precioVenta` is recomputed from the new values

#### Scenario: Client-supplied precioVenta is ignored

- GIVEN a `POST` or `PATCH` body that includes an explicit `precioVenta` value
- WHEN the request is handled
- THEN the client-supplied value is stripped and never persisted; the stored value reflects the server computation

### Requirement: VAT Rate Constraint

`alicuotaIva` MUST accept only the values `21` or `10.5`. Any other value MUST be rejected with a validation error.

#### Scenario: Valid alicuotaIva values are accepted

- GIVEN a `POST` or `PATCH` body with `alicuotaIva: 21` or `alicuotaIva: 10.5`
- WHEN the request is handled
- THEN the value is persisted unchanged

#### Scenario: Invalid alicuotaIva is rejected

- GIVEN a `POST` or `PATCH` body with `alicuotaIva: 27`
- WHEN the request is handled
- THEN it returns a validation error and no row is created or modified

### Requirement: Independent Stock Threshold Fields

`alertaStock` (Boolean) and `cantidadMinima` (numeric) MUST persist as independent fields. `alertaStock` MUST enable/disable the low-stock warning; `cantidadMinima` MUST hold the threshold used only when `alertaStock` is `true`.

#### Scenario: Fields persist independently

- GIVEN a `POST` or `PATCH` body sets `alertaStock: true` and `cantidadMinima: 5`
- WHEN the producto is saved
- THEN both fields are stored as provided, independent of one another

### Requirement: Required Unit of Measure Reference

`unidadMedidaId` MUST reference an existing `UnidadMedida` row with `activo: true` on both create and update. A missing, invalid, or inactive reference MUST be rejected with 400 before any write occurs.

#### Scenario: Valid unidadMedidaId is accepted

- GIVEN a `unidadMedidaId` matching an existing, active `UnidadMedida`
- WHEN `POST /productos` or `PATCH /productos/:id` is called
- THEN the producto is saved with that `unidadMedidaId`

#### Scenario: Invalid unidadMedidaId on update is rejected

- GIVEN an existing producto
- WHEN `PATCH /productos/:id` is called with a `unidadMedidaId` that does not exist
- THEN it returns 400 and the row is not modified

#### Scenario: Inactive unidadMedidaId on update is rejected

- GIVEN an existing producto and a `UnidadMedida` with `activo: false`
- WHEN `PATCH /productos/:id` is called with that `unidadMedidaId` (whether newly set or already the producto's current value)
- THEN it returns 400 and the row is not modified

### Requirement: Server-Side Creator and Updater Audit Stamping

`POST /productos` MUST set `creadoPorId` and `actualizadoPorId` from the authenticated caller's JWT (`req.user.userId`). `PATCH /productos/:id` MUST set `actualizadoPorId` from the JWT caller on every update and MUST NOT modify `creadoPorId`. Neither field MUST be settable from client request body input.

#### Scenario: Create stamps creator and updater from the JWT caller

- GIVEN a valid Bearer token for user U and a `POST /productos` body without `creadoPorId`/`actualizadoPorId`
- WHEN the producto is created
- THEN the stored row has `creadoPorId = U.id` and `actualizadoPorId = U.id`

#### Scenario: Update stamps only the updater

- GIVEN a producto created by user A, and a valid Bearer token for user B
- WHEN user B calls `PATCH /productos/:id` with any field change
- THEN `actualizadoPorId` becomes `B.id` and `creadoPorId` remains `A.id`

#### Scenario: Client-supplied audit fields are ignored

- GIVEN a request body that includes an explicit `creadoPorId` or `actualizadoPorId` different from the caller
- WHEN the request is handled
- THEN the client-supplied value is stripped and the stored value reflects the JWT caller, never the client input

### Requirement: No Role or Permission Check in This Change

`GET /productos`, `GET /productos/:id`, `POST /productos`, and `PATCH /productos/:id` MUST authorize solely via `JwtAuthGuard`. This is a deliberate deferral to a future "Permisos" feature.

#### Scenario: Any authenticated rol can manage productos

- GIVEN a valid Bearer token belonging to a user with `rol` `'empleado'`
- WHEN that user calls any of the four routes
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: No Delete Capability and No Export Capability

This capability MUST NOT expose a `DELETE /productos` or `DELETE /productos/:id` route, and MUST NOT expose a `GET /productos/export` route. Deactivation MUST be performed via `PATCH /productos/:id` setting `activo: false`.

#### Scenario: No delete or export route exists

- GIVEN the `productos` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /productos`, `DELETE /productos/:id`, or `GET /productos/export`

#### Scenario: Deactivation is done via the activo toggle

- GIVEN an existing active producto
- WHEN `PATCH /productos/:id` is called with `activo: false`
- THEN the row is updated (not deleted) and subsequently reads back with `activo: false`
