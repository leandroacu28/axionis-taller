# Órdenes de Trabajo Iniciar Specification

## Purpose

A dedicated `POST /ordenes-trabajo/:id/iniciar` action that atomically transitions a `pendiente` order and its still-`pendiente` service lines (`OrdenTrabajoTipoServicio` detalles) to `en_proceso`, guarded by a state precondition and stamped with JWT-derived audit fields. This is a distinct business event, not a special case of the generic `PATCH /ordenes-trabajo/:id`. Access is any authenticated user (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: Iniciar Requires Authentication Only

`POST /ordenes-trabajo/:id/iniciar` MUST require a valid Bearer token via `JwtAuthGuard` and MUST NOT enforce any role/permission check beyond authentication.

#### Scenario: Missing or invalid token rejected

- GIVEN a request to `POST /ordenes-trabajo/:id/iniciar` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no row is modified

#### Scenario: Any authenticated role can start an order

- GIVEN a valid Bearer token for a user whose `rol` is not `'admin'`
- WHEN that user calls the endpoint on a `pendiente` order they did not create
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: Iniciar Accepts No Request Body

The endpoint MUST take only the URL `id` as input. `actualizadoPorId` MUST be resolved server-side from `req.user.userId` and MUST NOT be accepted from or influenced by a client-supplied request body.

#### Scenario: Call with empty body succeeds

- GIVEN a `pendiente` order and a valid Bearer token
- WHEN `POST /ordenes-trabajo/:id/iniciar` is called with an empty body
- THEN the request succeeds and both the order's and every touched detalle's `actualizadoPorId` reflect the JWT caller's id

### Requirement: Iniciar Guards on Current Order State

Iniciar MUST only succeed when the order's current `estado` is `pendiente`. Calling it on an order whose `estado` is `en_proceso`, `terminado`, or `cancelado` MUST be rejected with `409 Conflict` and a Spanish message, and MUST NOT mutate the order or any of its detalles.

#### Scenario: Non-pendiente order rejected with 409

- GIVEN an existing order whose `estado` is `en_proceso`, `terminado`, or `cancelado`
- WHEN `POST /ordenes-trabajo/:id/iniciar` is called
- THEN it returns 409 and neither the order nor any of its detalles are modified

#### Scenario: Nonexistent order returns 404

- GIVEN an `id` that does not match any existing order
- WHEN `POST /ordenes-trabajo/:id/iniciar` is called
- THEN it returns 404 and nothing is modified

### Requirement: Iniciar Atomically Cascades Only Pending Detalles

Starting a `pendiente` order MUST, within a single database transaction: set the order's `estado` to `en_proceso` and stamp its `actualizadoPorId`; and set every detalle (`OrdenTrabajoTipoServicio`) of that order whose `estado` is currently `pendiente` to `en_proceso`, stamping each touched detalle's `actualizadoPorId`. Detalles whose `estado` is already `en_proceso`, `terminado`, or `cancelado` MUST be left unchanged — neither re-stamped nor regressed. The order flip and the detalle cascade MUST both commit or both roll back together.

#### Scenario: Starting a pendiente order cascades all-pending detalles

- GIVEN a `pendiente` order whose detalles are all `pendiente`
- WHEN `POST /ordenes-trabajo/:id/iniciar` is called
- THEN it returns 200 with the order's `estado` as `en_proceso`
- AND every detalle's `estado` becomes `en_proceso` with `actualizadoPorId` set to the caller

#### Scenario: Mixed-state order only advances still-pending detalles

- GIVEN a `pendiente` order with three detalles: one `en_proceso`, one `terminado`, one `pendiente`
- WHEN `POST /ordenes-trabajo/:id/iniciar` is called
- THEN it returns 200 with the order's `estado` as `en_proceso`
- AND only the `pendiente` detalle becomes `en_proceso`
- AND the `en_proceso` and `terminado` detalles keep their original `estado` and `actualizadoPorId` unchanged

### Requirement: Iniciar Returns the Updated Order Shape

A successful call MUST return the updated order in the standard `ORDEN_TRABAJO_SELECT`/`mapOrdenTrabajo` shape — the same shape returned by `GET /ordenes-trabajo/:id`, `POST /ordenes-trabajo`, and `PATCH /ordenes-trabajo/:id`.

#### Scenario: Response matches the standard order shape

- GIVEN a successful `iniciar` call
- WHEN the response body is inspected
- THEN it matches the same field shape returned by `GET /ordenes-trabajo/:id`, with `estado: 'en_proceso'`
