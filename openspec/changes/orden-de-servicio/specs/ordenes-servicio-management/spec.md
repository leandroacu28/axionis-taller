# Órdenes de Servicio Management Specification

## Purpose

Backend CRUD (minus delete) for `OrdenServicio` records — the operational work-order intake record tying together cliente, vehículo, mecánico, and tipos de servicio, with a lifecycle `estado` instead of catalog-style `activo`. Structure mirrors the `etiquetas/` module (thin controller, service owns Prisma calls, whitelist-safe DTOs, Nest built-in exceptions, Spanish user-facing messages, `SELECT` whitelist response shape). Access is any authenticated user in this change (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: OrdenServicio Data Model

The `OrdenServicio` Prisma model MUST declare `id`, `numero` (unique, human-readable, sequential), `fechaIngreso` (`DateTime`), `kilometros` (`Int`), `prioridad` (`Prioridad` enum: `normal | alta | urgente`), `motivoIngreso` (text), `estado` (`Estado` enum: `pendiente | en_proceso | terminado`), required FKs `clienteId`, `vehiculoId`, `mecanicoId` (to `User`), a many-to-many `tiposServicio TipoServicio[]`, nullable audit FKs `creadoPorId`/`actualizadoPorId` (to `User`, `onDelete: SetNull`), and `createdAt`/`updatedAt`. `mecanicoId` MUST be distinct from `creadoPorId`/`actualizadoPorId`. The migration MUST be additive-only.

#### Scenario: Migration adds OrdenServicio without touching existing tables

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN an `OrdenServicio` table, its `Estado`/`Prioridad` enums, and the `tiposServicio` join table exist
- AND `User`, `Cliente`, `Vehiculo`, and `TipoServicio` each gain their new back-relations
- AND no existing table's columns are dropped, renamed, or type-changed

#### Scenario: Deleting a referenced user nulls only the audit FKs

- GIVEN an `OrdenServicio` row whose `creadoPorId` and/or `actualizadoPorId` point to an existing `User`
- WHEN that `User` row is deleted
- THEN the delete succeeds and the `OrdenServicio` row still exists
- AND its `creadoPorId`/`actualizadoPorId` become `null`

### Requirement: Order Number Uniqueness

Every created order MUST receive a `numero` that is unique across all orders and human-readable (e.g. `OS-0001`). Concurrent creation MUST NOT produce two orders with the same `numero`. The generation mechanism is not specified here (see design.md); only the uniqueness/monotonic-ordering contract is required.

#### Scenario: Two orders never share a numero

- GIVEN two `POST /ordenes-servicio` requests are made, including concurrently
- WHEN both succeed
- THEN each created order has a distinct `numero`

### Requirement: List Orders Requires Authentication Only

`GET /ordenes-servicio` MUST require a valid Bearer token via `JwtAuthGuard` and MUST return a paginated (`page`, `pageSize`) list. It MUST support filtering by `estado` (single value or all). It MUST NOT support an `activo`/status active-inactive filter — that concept does not apply to this entity. Counts summarizing the list SHOULD be grouped per `estado` value rather than an active/inactive split.

#### Scenario: Authenticated user lists orders

- GIVEN a request to `GET /ordenes-servicio` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with a page of orders including `numero`, `cliente`, `vehiculo`, `estado`, `prioridad`, `mecanico`, `fechaIngreso`
- AND the response includes pagination totals

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /ordenes-servicio` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no order data is returned

#### Scenario: Filtering by estado narrows the list

- GIVEN orders exist in different `estado` values
- WHEN `GET /ordenes-servicio` is called with `estado=pendiente`
- THEN only orders with `estado = 'pendiente'` are returned

### Requirement: Get Single Order

`GET /ordenes-servicio/:id` MUST require a valid Bearer token and MUST return the whitelisted shape (including nested `cliente`, `vehiculo`, `mecanico`, `tiposServicio`, `creadoPor`, `actualizadoPor`) for the matching `id`. An unmatched `id` MUST return 404.

#### Scenario: Fetch existing order by id

- GIVEN an existing order id and a valid Bearer token
- WHEN `GET /ordenes-servicio/:id` is called
- THEN it returns 200 with that order's whitelisted shape, including nested relations

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing order
- WHEN `GET /ordenes-servicio/:id` is called
- THEN it returns 404

### Requirement: Create Order

`POST /ordenes-servicio` MUST require `clienteId`, `vehiculoId`, `mecanicoId`, `kilometros`, `prioridad`, `motivoIngreso`, `estado`, and at least one `tipoServicioId`. `fechaIngreso` MUST default to the current server time when omitted and MUST be accepted and honored when supplied by the client.

#### Scenario: Successful order creation with default fechaIngreso

- GIVEN a valid Bearer token and a body with all required fields and no `fechaIngreso`
- WHEN `POST /ordenes-servicio` is called
- THEN it returns 201 with the created order, `fechaIngreso` set to approximately the current time, and a generated unique `numero`

#### Scenario: Client-supplied fechaIngreso is honored for late-logged orders

- GIVEN a valid Bearer token and a body with all required fields and an explicit past `fechaIngreso`
- WHEN `POST /ordenes-servicio` is called
- THEN it returns 201 with the order's `fechaIngreso` set to the client-supplied value, not the current time

#### Scenario: Missing a required field is rejected

- GIVEN a body missing `clienteId`, `vehiculoId`, `mecanicoId`, `kilometros`, `prioridad`, `motivoIngreso`, `estado`, or `tipoServicioIds`
- WHEN `POST /ordenes-servicio` is called
- THEN it returns 400 and no order is created

### Requirement: Vehículo Must Belong to Cliente

The server MUST reject a `vehiculoId` that does not belong to the order's `clienteId`, on both create and update, even if the frontend cascade was bypassed.

#### Scenario: Mismatched vehiculo and cliente rejected on create

- GIVEN a `vehiculoId` that belongs to a cliente different from the body's `clienteId`
- WHEN `POST /ordenes-servicio` is called with that combination
- THEN it returns 400 and no order is created

#### Scenario: Mismatched vehiculo and cliente rejected on update

- GIVEN an existing order and an update body whose `vehiculoId` does not belong to its `clienteId`
- WHEN `PATCH /ordenes-servicio/:id` is called with that combination
- THEN it returns 400 and the order is not modified

### Requirement: Tipos de Servicio Many-to-Many Validation

`tipoServicioIds` MUST accept one or more `TipoServicio` ids on create and update. The server MUST reject the request if any id does not exist or belongs to an inactive `TipoServicio`, mirroring `assertEtiquetasActivas`'s behavior. Unlike the optional etiquetas relation on Producto, at least one `tipoServicioId` is required.

#### Scenario: Empty tipoServicioIds rejected

- GIVEN a create or update body with `tipoServicioIds: []` or the field omitted
- WHEN the request is handled
- THEN it returns 400 and no order is created or modified

#### Scenario: Inactive or nonexistent tipoServicioId rejected

- GIVEN a `tipoServicioIds` array containing an id that is inactive or does not exist
- WHEN `POST /ordenes-servicio` or `PATCH /ordenes-servicio/:id` is called
- THEN it returns 400 and no order is created or modified

#### Scenario: Valid tipoServicioIds are connected

- GIVEN a `tipoServicioIds` array of one or more active, existing ids
- WHEN the order is created or updated
- THEN the order's `tiposServicio` relation reflects exactly those ids

### Requirement: Mecánico Picker Accepts Any Active User

`mecanicoId` MUST reference any active `User`, not restricted to `rol === 'mecanico'`.

#### Scenario: Non-mecanico role accepted as mecanicoId

- GIVEN an active `User` whose `rol` is not `'mecanico'`
- WHEN that user's id is supplied as `mecanicoId` on create or update
- THEN the request succeeds and the order's `mecanico` reflects that user

### Requirement: Odometer Sync Side Effect

Saving an order (create or update) MUST overwrite the associated `Vehiculo.kilometraje` with the order's `kilometros` value, executed in the same database transaction as the order write.

#### Scenario: Creating an order updates the vehicle's kilometraje

- GIVEN a vehículo with an existing `kilometraje`
- WHEN an order is created for that vehículo with a different `kilometros` value
- THEN the vehículo's `kilometraje` is overwritten with the order's `kilometros`
- AND both writes commit or roll back together

#### Scenario: Updating an order's kilometros re-syncs the vehicle

- GIVEN an existing order and its vehículo
- WHEN `PATCH /ordenes-servicio/:id` is called with a new `kilometros` value
- THEN the vehículo's `kilometraje` is overwritten with the new value in the same transaction

### Requirement: Update Order With Free Estado Transitions

`PATCH /ordenes-servicio/:id` MUST allow updating any editable field, including transitioning `estado` to any of `pendiente`/`en_proceso`/`terminado` from any current value, in any direction. No linear workflow MUST be enforced and no `cancelado` state exists. An unmatched `id` MUST return 404.

#### Scenario: Estado transitions freely in any direction

- GIVEN an order with `estado = 'terminado'`
- WHEN `PATCH /ordenes-servicio/:id` is called with `estado: 'pendiente'`
- THEN it returns 200 and the order's `estado` becomes `'pendiente'`

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing order
- WHEN `PATCH /ordenes-servicio/:id` is called
- THEN it returns 404 and nothing is modified

### Requirement: Server-Side Creator and Updater Audit Stamping

`POST /ordenes-servicio` MUST set `creadoPorId` and `actualizadoPorId` to the authenticated caller's id, resolved server-side from `req.user.userId`. `PATCH /ordenes-servicio/:id` MUST set `actualizadoPorId` from the caller and MUST NOT modify `creadoPorId`. Neither field is client-settable; any client-supplied value MUST be ignored. `mecanicoId` is a distinct, client-supplied field and MUST NOT be derived from the JWT.

#### Scenario: Create stamps creator and updater from the JWT caller

- GIVEN a valid Bearer token for user U and a create body without `creadoPorId`/`actualizadoPorId`
- WHEN the order is created
- THEN the stored row has `creadoPorId = U.id` and `actualizadoPorId = U.id`

#### Scenario: Update stamps only the updater

- GIVEN an order created by user A and a valid Bearer token for user B
- WHEN user B calls `PATCH /ordenes-servicio/:id`
- THEN the stored row's `actualizadoPorId` becomes `B.id` and `creadoPorId` remains `A.id`

#### Scenario: Client-supplied audit fields are ignored

- GIVEN a request body that includes an explicit `creadoPorId` or `actualizadoPorId` different from the caller
- WHEN the request is handled
- THEN the client-supplied value is stripped by the `ValidationPipe` and the stored value reflects the caller's id, never the client-supplied one

### Requirement: No Role or Permission Check in This Change

`GET /ordenes-servicio`, `GET /ordenes-servicio/:id`, `POST /ordenes-servicio`, and `PATCH /ordenes-servicio/:id` MUST authorize solely via `JwtAuthGuard`. This is a deliberate deferral to a future "Permisos" feature.

#### Scenario: Any authenticated rol can manage orders

- GIVEN a valid Bearer token for a user with `rol` `'empleado'`
- WHEN that user calls any of the four endpoints
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: No Delete Capability

This capability MUST NOT expose a `DELETE /ordenes-servicio` or `DELETE /ordenes-servicio/:id` route. Lifecycle is expressed only through `estado`.

#### Scenario: No delete route exists

- GIVEN the `ordenes-servicio` controller's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /ordenes-servicio` or `DELETE /ordenes-servicio/:id`
