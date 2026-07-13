# Units of Measure Management Specification

## Purpose

Backend CRUD (create/list/update, no delete, no export) for `UnidadMedida` records, mirroring the `service-types` module shape (paginated + filtered list, get-by-id, create, update), with server-side creator/last-updater audit stamping following the same dual-audit pattern. Access is limited to any authenticated user in this change (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: UnidadMedida Data Model

The `UnidadMedida` Prisma model MUST declare `id`, `descripcion` (`String`, `@unique`), `activo` (`Boolean`, `@default(true)`), `createdAt`, `updatedAt`, `creadoPorId` (nullable FK to `User.id`, relation `"UnidadMedidaCreadoPor"`, `onDelete: SetNull`), and `actualizadoPorId` (nullable FK to `User.id`, relation `"UnidadMedidaActualizadoPor"`, `onDelete: SetNull`). The `User` model MUST declare the two matching back-relation arrays, `unidadesMedidaCreadas` and `unidadesMedidaActualizadas`. The `UnidadMedida` model MUST also declare a `productos` back-relation array (`Producto[]`) reflecting `Producto.unidadMedidaId`'s required FK to `UnidadMedida.id`. The migration MUST be additive-only (no existing table/column dropped or altered).

#### Scenario: Migration adds UnidadMedida without touching existing tables

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN a `UnidadMedida` table exists with the fields above
- AND `User` has the two new back-relation arrays
- AND no existing table's columns were dropped, renamed, or type-changed

#### Scenario: Deleting a user nulls the reference instead of deleting or blocking the unit

- GIVEN a `UnidadMedida` row whose `creadoPorId` and/or `actualizadoPorId` point to an existing `User`
- WHEN that `User` row is deleted
- THEN the delete succeeds (it is not blocked by the `UnidadMedida` reference)
- AND the `UnidadMedida` row still exists afterward
- AND its `creadoPorId`/`actualizadoPorId` (whichever pointed at the deleted user) become `null`

#### Scenario: UnidadMedida exposes its productos back-relation

- GIVEN a `UnidadMedida` row referenced by one or more `Producto` rows
- WHEN the schema is inspected
- THEN the `UnidadMedida` model's `productos` array reflects those `Producto` rows

### Requirement: List Units of Measure Requires Authentication Only

`GET /unidades-medida` MUST require a valid `Authorization: Bearer` token via `JwtAuthGuard` and MUST return a paginated, filtered list of unidades de medida (`page`, `pageSize`, `search` on `descripcion`, `status` in `'all' | 'activo' | 'inactivo'`). It MUST NOT check `rol` or any permission. Each returned object MUST use a `SELECT` whitelist shape including nested `creadoPor: { id, username }` and `actualizadoPor: { id, username }` (each nullable).

#### Scenario: Authenticated user lists unidades de medida

- GIVEN a request to `GET /unidades-medida` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with a page of unidades de medida, each including `id`, `descripcion`, `activo`, `creadoPor`, `actualizadoPor`
- AND the response includes pagination totals

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /unidades-medida` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no unidad de medida data is returned

#### Scenario: Search and status filters narrow the list

- GIVEN unidades de medida exist with varying `descripcion` values and `activo` states
- WHEN `GET /unidades-medida` is called with a `search` term and/or a `status` of `'activo'` or `'inactivo'`
- THEN only unidades de medida matching both the search term (on `descripcion`) and the status filter are returned

### Requirement: Get Single Unit of Measure

`GET /unidades-medida/:id` MUST require a valid Bearer token and MUST return the whitelisted shape for the matching `id`. An unmatched `id` MUST return 404.

#### Scenario: Fetch existing unidad de medida by id

- GIVEN an existing unidad de medida id and a valid Bearer token
- WHEN `GET /unidades-medida/:id` is called
- THEN it returns 200 with that unidad de medida's whitelisted shape

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing unidad de medida
- WHEN `GET /unidades-medida/:id` is called
- THEN it returns 404

### Requirement: Create Unit of Measure

`POST /unidades-medida` MUST require `descripcion` (non-empty string). `activo` MUST be optional and default to `true`. Duplicate `descripcion` MUST return 409, using a TOCTOU-safe pre-check plus a Prisma `P2002` catch-block backstop.

#### Scenario: Successful unit creation

- GIVEN a valid Bearer token and a body with a unique `descripcion`
- WHEN `POST /unidades-medida` is called
- THEN it returns 201 with the created unidad de medida in the whitelisted shape

#### Scenario: Duplicate descripcion is rejected on create

- GIVEN a `descripcion` that already exists on another unidad de medida
- WHEN `POST /unidades-medida` is called with that `descripcion`
- THEN it returns 409 and no new row is created

### Requirement: Update Unit of Measure

`PATCH /unidades-medida/:id` MUST accept `descripcion` (non-empty string when provided) and `activo` as optional body fields. An unmatched `id` MUST return 404. Changing `descripcion` to a value already used by a different unidad de medida MUST return 409, using the same TOCTOU-safe pre-check plus `P2002` backstop as create.

#### Scenario: Successful update

- GIVEN an existing unidad de medida id and a body containing `descripcion` and/or `activo`
- WHEN `PATCH /unidades-medida/:id` is called
- THEN it returns 200 with the updated unidad de medida in the whitelisted shape

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing unidad de medida
- WHEN `PATCH /unidades-medida/:id` is called
- THEN it returns 404 and no row is modified

#### Scenario: Update to a duplicate descripcion is rejected

- GIVEN two existing unidades de medida A and B with distinct `descripcion` values
- WHEN `PATCH /unidades-medida/:id` is called on A with B's `descripcion`
- THEN it returns 409 and A's row is not modified

### Requirement: Server-Side Creator and Updater Audit Stamping

`POST /unidades-medida` MUST set `creadoPorId` and `actualizadoPorId` to the id of the authenticated caller, resolved server-side from the validated JWT (`req.user.userId`). `PATCH /unidades-medida/:id` MUST set `actualizadoPorId` to the id of the authenticated caller on every update and MUST NOT modify `creadoPorId`. Neither field MUST be settable from client request body input; any `creadoPorId`/`actualizadoPorId` present in the request body MUST be ignored (not declared on the DTOs, stripped by the global `whitelist: true` `ValidationPipe`).

#### Scenario: Create stamps creator and updater from the JWT caller

- GIVEN a valid Bearer token for user U and a `POST /unidades-medida` body that does not include `creadoPorId` or `actualizadoPorId`
- WHEN the unidad de medida is created
- THEN the stored row has `creadoPorId = U.id` and `actualizadoPorId = U.id`

#### Scenario: Update stamps only the updater from the JWT caller

- GIVEN an existing unidad de medida created by user A, and a valid Bearer token for user B
- WHEN user B calls `PATCH /unidades-medida/:id` with any field change
- THEN the stored row's `actualizadoPorId` becomes `B.id`
- AND the stored row's `creadoPorId` remains `A.id`

#### Scenario: Client-supplied creadoPorId/actualizadoPorId is ignored

- GIVEN a valid Bearer token for user U and a `POST /unidades-medida` or `PATCH /unidades-medida/:id` body that includes an explicit `creadoPorId` or `actualizadoPorId` value different from `U.id`
- WHEN the request is handled
- THEN the client-supplied value is stripped by the `ValidationPipe` before reaching the service
- AND the stored `creadoPorId`/`actualizadoPorId` reflects `U.id`, never the client-supplied value

### Requirement: No Role or Permission Check in This Change

`GET /unidades-medida`, `GET /unidades-medida/:id`, `POST /unidades-medida`, and `PATCH /unidades-medida/:id` MUST authorize solely via `JwtAuthGuard` (valid Bearer token). This is a deliberate, user-directed deferral to a future "Permisos" feature, not an omission.

#### Scenario: Any authenticated rol can manage units of measure

- GIVEN a valid Bearer token belonging to a user with `rol` `'empleado'`
- WHEN that user calls any of `GET /unidades-medida`, `GET /unidades-medida/:id`, `POST /unidades-medida`, `PATCH /unidades-medida/:id`
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: No Delete Capability and No Export Capability

This capability MUST NOT expose a `DELETE /unidades-medida` or `DELETE /unidades-medida/:id` route, and MUST NOT expose a `GET /unidades-medida/export` route, in this change. Deactivation MUST be performed via `PATCH /unidades-medida/:id` setting `activo: false`.

#### Scenario: No delete route exists

- GIVEN the `unidades-medida` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /unidades-medida` or `DELETE /unidades-medida/:id`

#### Scenario: No export route exists

- GIVEN the `unidades-medida` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `GET /unidades-medida/export`

#### Scenario: Deactivation is done via the activo toggle

- GIVEN an existing active unidad de medida
- WHEN `PATCH /unidades-medida/:id` is called with `activo: false`
- THEN the row is updated (not deleted) and subsequently reads back with `activo: false`

### Requirement: Referenced UnidadMedida Cannot Be Deleted

A `UnidadMedida` row referenced by any `Producto.unidadMedidaId` MUST NOT be deletable (restrict-like default — no `onDelete` cascade or set-null on that relation). This is a forward-looking invariant: no `DELETE /unidades-medida` or `DELETE /unidades-medida/:id` route exists in this or any prior change, so no observable behavior changes today. The invariant becomes enforceable the moment a delete endpoint is introduced.

#### Scenario: FK constraint blocks deletion at the database level once a delete path exists

- GIVEN a `UnidadMedida` row referenced by at least one `Producto.unidadMedidaId`
- WHEN a direct deletion of that `UnidadMedida` row is attempted (e.g. via Prisma client or a future delete endpoint)
- THEN the deletion fails due to the FK constraint (restrict-like default), and the `UnidadMedida` row remains

#### Scenario: Unreferenced UnidadMedida deletion is unaffected by this invariant

- GIVEN a `UnidadMedida` row referenced by zero `Producto` rows
- WHEN a direct deletion of that `UnidadMedida` row is attempted
- THEN the FK constraint from `Producto` does not block it (though today no delete endpoint exists to exercise this)
