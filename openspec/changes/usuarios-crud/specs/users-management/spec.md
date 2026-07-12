# Delta for Users Management

## ADDED Requirements

### Requirement: List Users Requires Authentication Only

`GET /users` MUST return all users and MUST require a valid `Authorization: Bearer` token via the existing `JwtAuthGuard`. It MUST NOT check `rol` or any permission. Each returned user object MUST include `id`, `username`, `nombre`, `apellido`, and `rol`, and MUST NOT include `passwordHash`.

#### Scenario: Authenticated user lists all users

- GIVEN a request to `GET /users` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with an array of users containing `id`, `username`, `nombre`, `apellido`, `rol`
- AND no user object includes `passwordHash`

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /users` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no user data is returned

### Requirement: Create User

`POST /users` MUST require `username` (unique, immutable after creation), `password` (hashed with `bcrypt` at 10 rounds via `bcryptjs`, matching `auth.service.ts`), and `rol` (validated with `@IsIn(['admin', 'empleado'])`). `nombre` and `apellido` MUST be optional. On success the response MUST NOT include `passwordHash`. Duplicate `username` MUST return 409, mirroring the `ConflictException` precedent in `AuthService.initMasterUser`.

#### Scenario: Successful user creation

- GIVEN a valid Bearer token and a body with a unique `username`, `password`, and `rol` of `'admin'` or `'empleado'`
- WHEN `POST /users` is called
- THEN it returns 201 with the created user (`id`, `username`, `nombre`, `apellido`, `rol`)
- AND the response does not include `passwordHash`
- AND the stored `passwordHash` is a bcrypt hash generated with 10 rounds

#### Scenario: Duplicate username is rejected

- GIVEN a `username` that already exists
- WHEN `POST /users` is called with that `username`
- THEN it returns 409 and no new row is created

#### Scenario: Invalid rol value is rejected

- GIVEN a body with `rol` set to any value other than `'admin'` or `'empleado'`
- WHEN `POST /users` is called
- THEN validation fails and no user is created

### Requirement: Update User

`PATCH /users/:id` MUST accept any subset of `nombre`, `apellido`, and `rol`. `password` MUST be optional: if present it MUST be hashed (bcrypt, 10 rounds) and replace the stored hash; if omitted, the stored hash MUST remain unchanged. `username` MUST be immutable: the update DTO MUST NOT declare a `username` field, so the global `whitelist: true` `ValidationPipe` silently strips any `username` sent in the request body rather than applying it. A missing `id` MUST return 404.

#### Scenario: Partial update without password

- GIVEN an existing user id and a body containing only `nombre`
- WHEN `PATCH /users/:id` is called
- THEN `nombre` is updated and `apellido`, `rol`, and `passwordHash` remain unchanged

#### Scenario: Update including a new password

- GIVEN an existing user id and a body containing `password`
- WHEN `PATCH /users/:id` is called
- THEN the stored `passwordHash` is replaced with a new bcrypt hash (10 rounds) of the provided password

#### Scenario: Username in request body is silently ignored

- GIVEN an existing user id and a body containing `username` alongside other fields
- WHEN `PATCH /users/:id` is called
- THEN the `whitelist: true` ValidationPipe strips the undeclared `username` field before it reaches the service
- AND the user's `username` column is unchanged

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing user
- WHEN `PATCH /users/:id` is called
- THEN it returns 404 and no row is modified

### Requirement: No Role or Permission Check in This Change

`GET /users`, `POST /users`, and `PATCH /users/:id` MUST authorize solely via `JwtAuthGuard` (valid Bearer token). This is a deliberate, user-directed deferral to a future "Permisos" feature, not an omission — it MUST NOT be treated as a defect until that feature lands and explicitly amends this requirement.

#### Scenario: Any authenticated rol can manage users

- GIVEN a valid Bearer token belonging to a user with `rol` `'empleado'`
- WHEN that user calls `GET /users`, `POST /users`, or `PATCH /users/:id`
- THEN the request succeeds identically to a request from an `'admin'` user, since no role check exists in this change

### Requirement: No Delete Capability

This capability MUST NOT expose a `DELETE /users/:id` endpoint or any deactivate/soft-delete mechanism in this change.

#### Scenario: No delete route exists

- GIVEN the `users` module's registered routes
- WHEN inspecting the controller
- THEN no route handles `DELETE /users` or `DELETE /users/:id`
