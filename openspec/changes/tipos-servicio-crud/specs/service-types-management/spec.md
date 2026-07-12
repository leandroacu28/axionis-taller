# Service Types Management Specification

## Purpose

Backend CRUD (minus delete) for `TipoServicio` records, mirroring the `colors/` module shape (paginated + filtered list, export, get-by-id, create, update), with server-side creator/last-updater audit stamping following the `Cliente` dual-audit pattern. Access is limited to any authenticated user in this change (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: TipoServicio Data Model

The `TipoServicio` Prisma model MUST declare `id`, `descripcion` (`String`, `@unique`), `activo` (`Boolean`, `@default(true)`), `createdAt`, `updatedAt`, `creadoPorId` (nullable FK to `User.id`, relation `"TipoServicioCreadoPor"`, `onDelete: SetNull`), and `actualizadoPorId` (nullable FK to `User.id`, relation `"TipoServicioActualizadoPor"`, `onDelete: SetNull`). The `User` model MUST declare the two matching back-relation arrays, `tiposServicioCreados` and `tiposServicioActualizados`. The migration MUST be additive-only (no existing table/column dropped or altered).

#### Scenario: Migration adds TipoServicio without touching existing tables

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN a `TipoServicio` table exists with the fields above
- AND `User` has the two new back-relation arrays
- AND no existing table's columns were dropped, renamed, or type-changed

#### Scenario: Deleting a user nulls the reference instead of deleting or blocking the service type

- GIVEN a `TipoServicio` row whose `creadoPorId` and/or `actualizadoPorId` point to an existing `User`
- WHEN that `User` row is deleted
- THEN the delete succeeds (it is not blocked by the `TipoServicio` reference)
- AND the `TipoServicio` row still exists afterward
- AND its `creadoPorId`/`actualizadoPorId` (whichever pointed at the deleted user) become `null`

### Requirement: List Service Types Requires Authentication Only

`GET /service-types` MUST require a valid `Authorization: Bearer` token via `JwtAuthGuard` and MUST return a paginated, filtered list of tipos de servicio (`page`, `pageSize`, `search` on `descripcion`, `status` in `'all' | 'activo' | 'inactivo'`). It MUST NOT check `rol` or any permission. Each returned object MUST use a `SELECT` whitelist shape including nested `creadoPor: { id, username }` and `actualizadoPor: { id, username }` (each nullable).

#### Scenario: Authenticated user lists tipos de servicio

- GIVEN a request to `GET /service-types` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with a page of tipos de servicio, each including `id`, `descripcion`, `activo`, `creadoPor`, `actualizadoPor`
- AND the response includes pagination totals

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /service-types` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no tipo de servicio data is returned

#### Scenario: Search and status filters narrow the list

- GIVEN tipos de servicio exist with varying `descripcion` values and `activo` states
- WHEN `GET /service-types` is called with a `search` term and/or a `status` of `'activo'` or `'inactivo'`
- THEN only tipos de servicio matching both the search term (on `descripcion`) and the status filter are returned

### Requirement: Export Service Types Endpoint

`GET /service-types/export` MUST require a valid Bearer token via the same `JwtAuthGuard` as `GET /service-types`, MUST be declared before the `GET /service-types/:id` route so the literal `export` segment is not captured by the `:id` param, and MUST accept `search` and `status` query params with matching semantics to `GET /service-types`. The filter logic MUST reuse `GET /service-types`'s `where`-building logic, executed as a single query without `skip`/`take`, so the export returns every matching tipo de servicio rather than a single page. The response MUST be served as an `.xlsx` workbook with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="tipos-servicio.xlsx"`.

#### Scenario: Authenticated export returns full matching set as xlsx

- GIVEN a valid Bearer token and tipos de servicio matching the current `search`/`status` filters exceed one page's worth
- WHEN `GET /service-types/export` is called with those `search`/`status` values
- THEN it returns 200 with an `.xlsx` body containing every matching tipo de servicio, not limited to a single page
- AND the response `Content-Type` and `Content-Disposition` headers match the values above

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /service-types/export` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no file is returned

#### Scenario: Export route is not shadowed by the id route

- GIVEN the `service-types` controller's registered routes
- WHEN a request is made to `GET /service-types/export`
- THEN it is handled by the export handler, not rejected by `ParseIntPipe` as an invalid `:id`

### Requirement: Get Single Service Type

`GET /service-types/:id` MUST require a valid Bearer token and MUST return the whitelisted shape for the matching `id`. An unmatched `id` MUST return 404.

#### Scenario: Fetch existing tipo de servicio by id

- GIVEN an existing tipo de servicio id and a valid Bearer token
- WHEN `GET /service-types/:id` is called
- THEN it returns 200 with that tipo de servicio's whitelisted shape

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing tipo de servicio
- WHEN `GET /service-types/:id` is called
- THEN it returns 404

### Requirement: Create Service Type

`POST /service-types` MUST require `descripcion` (non-empty string). `activo` MUST be optional and default to `true`. Duplicate `descripcion` MUST return 409, using a TOCTOU-safe pre-check plus a Prisma `P2002` catch-block backstop.

#### Scenario: Successful service type creation

- GIVEN a valid Bearer token and a body with a unique `descripcion`
- WHEN `POST /service-types` is called
- THEN it returns 201 with the created tipo de servicio in the whitelisted shape

#### Scenario: Duplicate descripcion is rejected on create

- GIVEN a `descripcion` that already exists on another tipo de servicio
- WHEN `POST /service-types` is called with that `descripcion`
- THEN it returns 409 and no new row is created

### Requirement: Update Service Type

`PATCH /service-types/:id` MUST require `descripcion` (non-empty string) in the body, with `activo` optional, mirroring `UpdateColorDto`'s convention. An unmatched `id` MUST return 404. Changing `descripcion` to a value already used by a different tipo de servicio MUST return 409, using the same TOCTOU-safe pre-check plus `P2002` backstop as create.

#### Scenario: Successful update

- GIVEN an existing tipo de servicio id and a body containing `descripcion` (and optionally `activo`)
- WHEN `PATCH /service-types/:id` is called
- THEN it returns 200 with the updated tipo de servicio in the whitelisted shape

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing tipo de servicio
- WHEN `PATCH /service-types/:id` is called
- THEN it returns 404 and no row is modified

#### Scenario: Update to a duplicate descripcion is rejected

- GIVEN two existing tipos de servicio A and B with distinct `descripcion` values
- WHEN `PATCH /service-types/:id` is called on A with B's `descripcion`
- THEN it returns 409 and A's row is not modified

### Requirement: Server-Side Creator and Updater Audit Stamping

`POST /service-types` MUST set `creadoPorId` and `actualizadoPorId` to the id of the authenticated caller, resolved server-side from the validated JWT (`req.user.userId`). `PATCH /service-types/:id` MUST set `actualizadoPorId` to the id of the authenticated caller on every update and MUST NOT modify `creadoPorId`. Neither field MUST be settable from client request body input; any `creadoPorId`/`actualizadoPorId` present in the request body MUST be ignored (not declared on the DTOs, stripped by the global `whitelist: true` `ValidationPipe`).

#### Scenario: Create stamps creator and updater from the JWT caller

- GIVEN a valid Bearer token for user U and a `POST /service-types` body that does not include `creadoPorId` or `actualizadoPorId`
- WHEN the tipo de servicio is created
- THEN the stored row has `creadoPorId = U.id` and `actualizadoPorId = U.id`

#### Scenario: Update stamps only the updater from the JWT caller

- GIVEN an existing tipo de servicio created by user A, and a valid Bearer token for user B
- WHEN user B calls `PATCH /service-types/:id` with any field change
- THEN the stored row's `actualizadoPorId` becomes `B.id`
- AND the stored row's `creadoPorId` remains `A.id`

#### Scenario: Client-supplied creadoPorId/actualizadoPorId is ignored

- GIVEN a valid Bearer token for user U and a `POST /service-types` or `PATCH /service-types/:id` body that includes an explicit `creadoPorId` or `actualizadoPorId` value different from `U.id`
- WHEN the request is handled
- THEN the client-supplied value is stripped by the `ValidationPipe` before reaching the service
- AND the stored `creadoPorId`/`actualizadoPorId` reflects `U.id`, never the client-supplied value

### Requirement: No Role or Permission Check in This Change

`GET /service-types`, `GET /service-types/export`, `GET /service-types/:id`, `POST /service-types`, and `PATCH /service-types/:id` MUST authorize solely via `JwtAuthGuard` (valid Bearer token). This is a deliberate, user-directed deferral to a future "Permisos" feature, not an omission.

#### Scenario: Any authenticated rol can manage service types

- GIVEN a valid Bearer token belonging to a user with `rol` `'empleado'`
- WHEN that user calls any of `GET /service-types`, `GET /service-types/export`, `GET /service-types/:id`, `POST /service-types`, `PATCH /service-types/:id`
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: No Delete Capability

This capability MUST NOT expose a `DELETE /service-types` or `DELETE /service-types/:id` route in this change. Deactivation MUST be performed via `PATCH /service-types/:id` setting `activo: false`.

#### Scenario: No delete route exists

- GIVEN the `service-types` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /service-types` or `DELETE /service-types/:id`

#### Scenario: Deactivation is done via the activo toggle

- GIVEN an existing active tipo de servicio
- WHEN `PATCH /service-types/:id` is called with `activo: false`
- THEN the row is updated (not deleted) and subsequently reads back with `activo: false`
