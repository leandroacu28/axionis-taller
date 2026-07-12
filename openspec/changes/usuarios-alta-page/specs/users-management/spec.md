# Delta for Users Management

## MODIFIED Requirements

### Requirement: List Users Requires Authentication Only

`GET /users` MUST return all users and MUST require a valid `Authorization: Bearer` token via the existing `JwtAuthGuard`. It MUST NOT check `rol` or any permission. Each returned user object MUST include `id`, `username`, `dni`, `nombre`, `apellido`, and `rol`, and MUST NOT include `passwordHash`. `dni` MAY be `null` for users created before this change.
(Previously: returned fields did not include `dni`)

#### Scenario: Authenticated user lists all users

- GIVEN a request to `GET /users` includes a valid Bearer token
- WHEN the backend handles the request
- THEN it returns 200 with an array of users containing `id`, `username`, `dni`, `nombre`, `apellido`, `rol`
- AND no user object includes `passwordHash`

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /users` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no user data is returned

#### Scenario: Legacy user with null DNI is listed normally

- GIVEN a `User` row created before this change has `dni = null`
- WHEN `GET /users` is called
- THEN that user appears in the response with `dni: null` and no error occurs

### Requirement: Create User

`POST /users` MUST require `username` (unique, immutable after creation), `dni` (unique, non-empty free text), `nombre` (non-empty), `apellido` (non-empty), `password` (hashed with `bcrypt` at 10 rounds via `bcryptjs`), and `rol` (validated with `@IsIn(['admin', 'empleado'])`). On success the response MUST NOT include `passwordHash`. Duplicate `username` OR duplicate `dni` MUST return 409, each enforced via a two-layer check (a pre-check query plus a database unique-constraint violation caught as a TOCTOU backstop), mirroring the existing `username` pattern.
(Previously: `nombre`/`apellido` were optional and no `dni` field existed)

#### Scenario: Successful user creation

- GIVEN a valid Bearer token and a body with a unique `username`, unique `dni`, non-empty `nombre`/`apellido`, `password`, and `rol` of `'admin'` or `'empleado'`
- WHEN `POST /users` is called
- THEN it returns 201 with the created user (`id`, `username`, `dni`, `nombre`, `apellido`, `rol`)
- AND the response does not include `passwordHash`

#### Scenario: Duplicate username is rejected

- GIVEN a `username` that already exists
- WHEN `POST /users` is called with that `username`
- THEN it returns 409 and no new row is created

#### Scenario: Duplicate dni is rejected

- GIVEN a `dni` that already exists on another user
- WHEN `POST /users` is called with that `dni`
- THEN it returns 409 and no new row is created

#### Scenario: Missing required identity fields are rejected

- GIVEN a body missing or with empty `dni`, `nombre`, or `apellido`
- WHEN `POST /users` is called
- THEN validation fails with 400 and no user is created

#### Scenario: Invalid rol value is rejected

- GIVEN a body with `rol` set to any value other than `'admin'` or `'empleado'`
- WHEN `POST /users` is called
- THEN validation fails and no user is created

### Requirement: Update User

`PATCH /users/:id` MUST require non-empty `dni`, `nombre`, and `apellido` on every request (the inline edit form always submits all three); `rol` MAY be included; `password` MUST remain optional (hashed and replaced if present, unchanged if omitted). `dni` uniqueness MUST be re-validated on update using an exclude-self check (the record being edited MUST NOT be blocked by its own current `dni`), via the same two-layer check (pre-check plus database unique-constraint backstop) used on create. `username` MUST remain immutable: the update DTO MUST NOT declare a `username` field. A missing `id` MUST return 404.
(Previously: only `nombre`, `apellido`, and `rol` were accepted, all optional; no `dni` field existed)

#### Scenario: Update with required fields and no password

- GIVEN an existing user id and a body containing `dni`, `nombre`, `apellido`, and `rol` but omitting `password`
- WHEN `PATCH /users/:id` is called
- THEN `dni`, `nombre`, `apellido`, and `rol` are updated and `passwordHash` remains unchanged

#### Scenario: Update including a new password

- GIVEN an existing user id and a body containing `password` alongside the required fields
- WHEN `PATCH /users/:id` is called
- THEN the stored `passwordHash` is replaced with a new bcrypt hash (10 rounds) of the provided password

#### Scenario: Username in request body is silently ignored

- GIVEN an existing user id and a body containing `username` alongside other fields
- WHEN `PATCH /users/:id` is called
- THEN the `whitelist: true` ValidationPipe strips the undeclared `username` field before it reaches the service
- AND the user's `username` column is unchanged

#### Scenario: Missing required identity fields on update are rejected

- GIVEN a body missing or with empty `dni`, `nombre`, or `apellido`
- WHEN `PATCH /users/:id` is called
- THEN validation fails with 400 and no row is modified

#### Scenario: Duplicate dni belonging to a different user is rejected

- GIVEN a `dni` that already belongs to a different existing user
- WHEN `PATCH /users/:id` is called with that `dni`
- THEN it returns 409 and no row is modified

#### Scenario: Editing a user without changing DNI does not conflict

- GIVEN an existing user is edited and the submitted `dni` is identical to that user's own current `dni`
- WHEN `PATCH /users/:id` is called
- THEN the exclude-self uniqueness check does not match any other row
- AND the update succeeds without a 409

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing user
- WHEN `PATCH /users/:id` is called
- THEN it returns 404 and no row is modified
