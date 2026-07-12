# Customers Management Specification

## Purpose

Backend CRUD (minus delete) for `Cliente` records, mirroring the `users/` module shape, with server-side creator/last-updater audit stamping. Access is limited to any authenticated user in this change (permission-gating deferred to a future "Permisos" feature).

## Requirements

### Requirement: Cliente Data Model

The `Cliente` Prisma model MUST declare `id`, `razonSocial` (`String`), `tipoIdentificacion` (`String`, app-validated, no Prisma enum), `identificacion` (`String`, `@unique` single-column), `telefono` (`String`), `domicilio` (`String`), `activo` (`Boolean`, `@default(true)`), `createdAt`, `updatedAt`, `creadoPorId` (nullable FK to `User.id`, `onDelete: SetNull`), and `actualizadoPorId` (nullable FK to `User.id`, `onDelete: SetNull`). The migration MUST be additive-only (no existing table/column dropped or altered).

#### Scenario: Migration adds Cliente without touching existing tables

- GIVEN the new timestamped migration is applied
- WHEN the schema is inspected afterward
- THEN a `Cliente` table exists with the fields above
- AND no existing table's columns were dropped, renamed, or type-changed

### Requirement: List Customers Requires Authentication Only

`GET /customers` MUST require a valid `Authorization: Bearer` token via `JwtAuthGuard` and MUST return the full list of clientes. It MUST NOT check `rol` or any permission. Each returned object MUST use the `CUSTOMER_SELECT` whitelist shape, including nested `creadoPor: { id, username }` and `actualizadoPor: { id, username }` (each nullable).

#### Scenario: Authenticated user lists all clientes

- GIVEN a request to `GET /customers` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with an array of clientes, each including `id`, `razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, `domicilio`, `activo`, `creadoPor`, `actualizadoPor`

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /customers` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no cliente data is returned

### Requirement: Get Single Customer

`GET /customers/:id` MUST require a valid Bearer token and MUST return the `CUSTOMER_SELECT` shape for the matching `id`. An unmatched `id` MUST return 404.

#### Scenario: Fetch existing cliente by id

- GIVEN an existing cliente id and a valid Bearer token
- WHEN `GET /customers/:id` is called
- THEN it returns 200 with that cliente's `CUSTOMER_SELECT` shape

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing cliente
- WHEN `GET /customers/:id` is called
- THEN it returns 404

### Requirement: Create Customer

`POST /customers` MUST require `razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, and `domicilio`. `activo` MUST be optional and default to `true`. Duplicate `identificacion` MUST return 409, using a TOCTOU-safe pre-check plus a Prisma `P2002` backstop (matching the `users` module's duplicate-`username` handling).

#### Scenario: Successful customer creation

- GIVEN a valid Bearer token and a body with a unique `identificacion` and all required fields
- WHEN `POST /customers` is called
- THEN it returns 201 with the created cliente in `CUSTOMER_SELECT` shape

#### Scenario: Duplicate identificacion is rejected

- GIVEN an `identificacion` that already exists on another cliente
- WHEN `POST /customers` is called with that `identificacion`
- THEN it returns 409 and no new row is created

### Requirement: Update Customer

`PATCH /customers/:id` MUST require the full field set (`razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, `domicilio` all required in the body; only `activo` optional), mirroring `UpdateUserDto`'s convention exactly — this endpoint does not support partial updates. A request body missing any required field MUST return 400 and MUST NOT modify the row. An unmatched `id` MUST return 404. Changing `identificacion` to a value already used by a different cliente MUST return 409.

#### Scenario: Successful full-body update

- GIVEN an existing cliente id and a body containing all required fields (`razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, `domicilio`)
- WHEN `PATCH /customers/:id` is called
- THEN it returns 200 with the updated cliente in `CUSTOMER_SELECT` shape

#### Scenario: Missing required field is rejected

- GIVEN an existing cliente id and a body that omits `telefono` (or any other required field)
- WHEN `PATCH /customers/:id` is called
- THEN it returns 400 and the row is not modified

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing cliente
- WHEN `PATCH /customers/:id` is called
- THEN it returns 404 and no row is modified

#### Scenario: Update to a duplicate identificacion is rejected

- GIVEN two existing clientes A and B with distinct `identificacion` values
- WHEN `PATCH /customers/:id` is called on A with B's `identificacion`
- THEN it returns 409 and A's row is not modified

### Requirement: Server-Side Creator and Updater Audit Stamping

`POST /customers` MUST set `creadoPorId` and `actualizadoPorId` to the id of the authenticated caller, resolved server-side from the validated JWT (`req.user.userId`, `jwt.strategy.ts`). `PATCH /customers/:id` MUST set `actualizadoPorId` to the id of the authenticated caller on every update and MUST NOT modify `creadoPorId`. Neither field MUST be settable from client request body input; any `creadoPorId`/`actualizadoPorId` present in the request body MUST be ignored (not declared on the DTOs, stripped by the global `whitelist: true` `ValidationPipe`).

#### Scenario: Create stamps creator and updater from the JWT caller

- GIVEN a valid Bearer token for user U and a `POST /customers` body that does not include `creadoPorId` or `actualizadoPorId`
- WHEN the cliente is created
- THEN the stored row has `creadoPorId = U.id` and `actualizadoPorId = U.id`

#### Scenario: Update stamps only the updater from the JWT caller

- GIVEN an existing cliente created by user A, and a valid Bearer token for user B
- WHEN user B calls `PATCH /customers/:id` with any field change
- THEN the stored row's `actualizadoPorId` becomes `B.id`
- AND the stored row's `creadoPorId` remains `A.id`

#### Scenario: Client-supplied creadoPorId/actualizadoPorId is ignored

- GIVEN a valid Bearer token for user U and a `POST /customers` or `PATCH /customers/:id` body that includes an explicit `creadoPorId` or `actualizadoPorId` value different from `U.id`
- WHEN the request is handled
- THEN the client-supplied value is stripped by the `ValidationPipe` before reaching the service
- AND the stored `creadoPorId`/`actualizadoPorId` reflects `U.id`, never the client-supplied value

### Requirement: Conditional Identification Format Validation

The create/update DTOs MUST validate `identificacion` conditionally on `tipoIdentificacion`: when `tipoIdentificacion` is `'dni'`, the normalized (non-digit characters stripped) `identificacion` MUST be 7-8 digits; when `tipoIdentificacion` is `'cuit'` or `'cuil'`, the normalized `identificacion` MUST be exactly 11 digits, accepted with or without dashes in the input, normalized before length-check and before storage.

#### Scenario: Valid DNI passes

- GIVEN `tipoIdentificacion` is `'dni'` and `identificacion` is `'12345678'` (8 digits)
- WHEN `POST /customers` is called
- THEN validation passes and the cliente is created with `identificacion` stored as `'12345678'`

#### Scenario: Invalid DNI length is rejected

- GIVEN `tipoIdentificacion` is `'dni'` and `identificacion` is `'123456'` (6 digits)
- WHEN `POST /customers` is called
- THEN validation fails and no cliente is created

#### Scenario: CUIT with dashes is normalized and stored digits-only

- GIVEN `tipoIdentificacion` is `'cuit'` and `identificacion` is `'20-12345678-9'`
- WHEN `POST /customers` is called
- THEN validation passes (11 digits after stripping dashes)
- AND the stored `identificacion` is `'20123456789'`

#### Scenario: Invalid CUIL length is rejected

- GIVEN `tipoIdentificacion` is `'cuil'` and `identificacion` is `'2012345678'` (10 digits)
- WHEN `POST /customers` is called
- THEN validation fails and no cliente is created

### Requirement: No Role or Permission Check in This Change

`GET /customers`, `GET /customers/:id`, `POST /customers`, and `PATCH /customers/:id` MUST authorize solely via `JwtAuthGuard` (valid Bearer token). This is a deliberate, user-directed deferral to a future "Permisos" feature, not an omission.

#### Scenario: Any authenticated rol can manage customers

- GIVEN a valid Bearer token belonging to a user with `rol` `'empleado'`
- WHEN that user calls any of `GET /customers`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id`
- THEN the request succeeds identically to a request from an `'admin'` user

### Requirement: No Delete Capability

This capability MUST NOT expose a `DELETE /customers` or `DELETE /customers/:id` route in this change.

#### Scenario: No delete route exists

- GIVEN the `customers` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /customers` or `DELETE /customers/:id`
