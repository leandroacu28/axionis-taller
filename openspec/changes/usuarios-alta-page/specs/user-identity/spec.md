# Delta for User Identity

## MODIFIED Requirements

### Requirement: User Profile Columns

The Prisma `User` model MUST retain nullable `nombre` (String), `apellido` (String), and `rol` (String, default `"empleado"`) columns, and MUST gain a nullable, unique `dni` (String) column, introduced via a Prisma migration. `nombre`, `apellido`, and `dni` remaining nullable at the database layer is a deliberate, permanent characteristic of this schema, not a stopgap: no backfill migration MUST be applied to existing rows as part of introducing `dni` or tightening validation. Application-layer validation (DTOs on create/update, and the corresponding forms) MAY impose stricter non-null, non-empty requirements on new writes without altering the underlying database nullability contract; existing rows with `null` `nombre`, `apellido`, or `dni` remain valid and are not required to be backfilled until an operator explicitly edits and saves them through a flow that enforces the required fields.
(Previously: only `nombre`, `apellido`, and `rol` were declared here as nullable columns; there was no `dni` column and no explicit statement distinguishing DB-level nullability from application-layer requiredness)

#### Scenario: New user row without explicit profile values

- GIVEN a new `User` row is inserted without specifying `nombre`, `apellido`, `dni`, or `rol`
- WHEN the row is persisted
- THEN `nombre`, `apellido`, and `dni` are `null` and `rol` defaults to `"empleado"`

#### Scenario: Application layer requires identity fields on write while the DB stays nullable

- GIVEN the users-management API validates a create or update request
- WHEN the request omits or empties `nombre`, `apellido`, or `dni`
- THEN the API rejects it with 400, even though the underlying database columns permit `null`

#### Scenario: Legacy rows retain null values without violating the contract

- GIVEN a `User` row created before this change has `null` `nombre`, `apellido`, and `dni`
- WHEN that row is queried after this change is applied
- THEN it remains valid and readable with those fields `null`, and is not required to be backfilled unless explicitly edited and saved through the users-management flows
