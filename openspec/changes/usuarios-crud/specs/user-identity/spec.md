# Delta for User Identity

## MODIFIED Requirements

### Requirement: User Profile Columns

The Prisma `User` model MUST gain nullable `nombre` (String), `apellido` (String), and `rol` (String, default `"empleado"`) columns, introduced via a new Prisma migration.

(Previously: this requirement incorrectly stated `rol` defaults to `"admin"`. The actual migration/schema default is `"empleado"`; only the master user row is explicitly backfilled to `"admin"`, per the separate "Master User Backfill" requirement.)

#### Scenario: New user row without explicit profile values

- GIVEN a new `User` row is inserted without specifying `nombre`, `apellido`, or `rol`
- WHEN the row is persisted
- THEN `nombre` and `apellido` are `null` and `rol` defaults to `"empleado"`
