# User Identity Specification

## Requirements

### Requirement: User Profile Columns
The Prisma `User` model MUST gain nullable `nombre` (String), `apellido` (String), and `rol` (String, default `"admin"`) columns, introduced via a new Prisma migration.

#### Scenario: New user row without explicit profile values
- GIVEN a new `User` row is inserted without specifying `nombre`, `apellido`, or `rol`
- WHEN the row is persisted
- THEN `nombre` and `apellido` are `null` and `rol` defaults to `"admin"`

### Requirement: Master User Backfill
The migration MUST backfill the existing master user row so that `nombre`, `apellido`, and `rol` are non-null after migration, even though the columns themselves remain nullable for future rows.

#### Scenario: Migration applies cleanly against existing data
- GIVEN a pre-existing master `User` row created before this migration
- WHEN the migration runs
- THEN the master user row has non-null `nombre`, `apellido`, and `rol` values after migration completes

### Requirement: Login Response Includes User Object
`POST /auth/login` MUST return a `user` object (`{ username, nombre, apellido, rol }`) alongside the existing `access_token` on successful authentication.

#### Scenario: Successful login returns user profile
- GIVEN valid credentials are submitted to `POST /auth/login`
- WHEN authentication succeeds
- THEN the response body includes `access_token` AND a `user` object with `username`, `nombre`, `apellido`, and `rol`

#### Scenario: access_token shape is preserved
- GIVEN the login response is extended with `user`
- WHEN a client that only reads `access_token` consumes the response
- THEN `access_token` remains present at the top level in its previous form, unaffected by the addition of `user`
