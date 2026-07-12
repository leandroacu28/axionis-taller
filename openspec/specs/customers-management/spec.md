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

### Requirement: Export Customers Endpoint

`GET /customers/export` MUST require a valid Bearer token via the same `JwtAuthGuard` as `GET /customers`, and MUST accept `search` and `status` query params with matching semantics to `GET /customers`. The filter logic MUST reuse `GET /customers`'s `where`-building logic (not a duplicated copy), executed as a single query without `skip`/`take`, so the export returns every matching cliente rather than a single page. The response MUST be served with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="clientes.xlsx"`.

#### Scenario: Authenticated export returns full matching set

- GIVEN a valid Bearer token and clientes matching the current `search`/`status` filters exceed one page's worth
- WHEN `GET /customers/export` is called with those `search`/`status` values
- THEN it returns 200 with an Excel (.xlsx) body containing every matching cliente, not limited to a single page

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /customers/export` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no Excel file is returned

#### Scenario: Filters match GET /customers semantics

- GIVEN the same `search` and `status` query values are sent to both `GET /customers` and `GET /customers/export`
- WHEN both requests are handled
- THEN the set of clientes matched by `GET /customers/export` is identical to the set returned (across all pages) by `GET /customers`

#### Scenario: Response is served as a downloadable Excel file

- GIVEN a valid `GET /customers/export` request
- WHEN the response is returned
- THEN its `Content-Type` is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and its `Content-Disposition` header is `attachment; filename="clientes.xlsx"`

### Requirement: Excel Column Set and Formatting

The Excel workbook returned by `GET /customers/export` MUST contain a single worksheet named `Clientes` with a bold header row followed by one row per matching cliente, with columns in this exact order: `Razón Social`, `Tipo de identificación`, `Identificación`, `Teléfono`, `Domicilio`, `Estado`. The `Estado` column MUST render the cliente's `activo` boolean as `Activo` or `Inactivo`, not a raw boolean.

#### Scenario: Columns appear in the specified order with a header row

- GIVEN at least one cliente matches the export filters
- WHEN the workbook is generated
- THEN the first row is the header `Razón Social`, `Tipo de identificación`, `Identificación`, `Teléfono`, `Domicilio`, `Estado`, rendered in bold
- AND each following row has values in that same column order

#### Scenario: Estado column renders Activo/Inactivo

- GIVEN a matching cliente with `activo: true` and another with `activo: false`
- WHEN the workbook is generated
- THEN the first cliente's Estado cell is `Activo` and the second's is `Inactivo`

#### Scenario: Worksheet is named Clientes

- GIVEN any `GET /customers/export` response
- WHEN the workbook is inspected
- THEN it contains a single worksheet named `Clientes`

### Requirement: Excel Cell Values Are Stored Natively

Field values (including `razonSocial` and `domicilio`) MUST be written as native Excel string cell values via the workbook library, with no manual escaping or delimiter handling — commas, quotes, and newlines inside a value MUST NOT corrupt the row or column structure, since each cell is its own storage unit rather than a delimited text field.

#### Scenario: Field with a comma is stored intact

- GIVEN a cliente whose `razonSocial` contains a comma (e.g. `Pérez, S.A.`)
- WHEN the workbook is generated
- THEN the cell's value is the exact string `Pérez, S.A.` and the row still has exactly six columns

#### Scenario: Field with a double-quote is stored intact

- GIVEN a cliente whose `domicilio` contains a double-quote character
- WHEN the workbook is generated
- THEN the cell's value is the exact original string, unmodified

#### Scenario: Field with a newline is stored intact

- GIVEN a cliente whose `domicilio` contains a newline character
- WHEN the workbook is generated
- THEN the cell's value is the exact original string and the row is not split across multiple rows
