# Section Access Management Specification

## Purpose

Backend two-tier permission recording: a per-role default access grid (`RoleSectionAccess`) plus per-user overrides (`UserSectionOverride`) across the 15 canonical app sections, exposed via a `permisos` module. This capability records intended access levels only — it does not enforce them. No route, page, or controller anywhere gains an authorization guard because of this change, and the `JwtAuthGuard`/`req.user` contract is unchanged.

## Requirements

### Requirement: Canonical Section List

The system MUST define a single canonical list of 15 `sectionId` values reused by backend validation and frontend labels: `home, usuarios, colores, marcas, tipos-servicio, unidades-medida, etiquetas, diagnosticos, empresa, clientes, vehiculos, productos, presupuestos, ordenes-trabajo, ordenes-trabajo-panel`. Every grid read (role or effective) MUST return exactly one entry per canonical `sectionId`, regardless of how many rows exist in the database.

#### Scenario: Grid read includes all sections even with no stored rows

- GIVEN a `rol` or `userId` with zero `RoleSectionAccess`/`UserSectionOverride` rows
- WHEN its grid is read
- THEN the response contains exactly 15 entries, one per canonical `sectionId`, each defaulting to `sin_acceso`

### Requirement: Two-Tier Data Model

The system MUST persist `RoleSectionAccess { id, rol, sectionId, level, createdAt, updatedAt }` with `@@unique([rol, sectionId])`, and `UserSectionOverride { id, userId, sectionId, level, createdAt, updatedAt }` with `@@unique([userId, sectionId])` and `userId` a required FK to `User.id` with `onDelete: Cascade`. `level` MUST be a Prisma enum with exactly the values `total`, `lectura`, `sin_acceso`. `User` MUST declare the back-relation array for `UserSectionOverride`. Neither model MUST declare `creadoPorId`/`actualizadoPorId` audit columns (D3).

#### Scenario: Duplicate rol+sectionId is rejected at the data layer

- GIVEN a `RoleSectionAccess` row already exists for `(rol, sectionId)`
- WHEN a second row is inserted for the same `(rol, sectionId)` pair outside the upsert path
- THEN the unique constraint rejects the insert

#### Scenario: Deleting a user cascades its overrides

- GIVEN a `User` with one or more `UserSectionOverride` rows
- WHEN that `User` row is deleted
- THEN its `UserSectionOverride` rows are deleted along with it

### Requirement: Migration Is Additive and Reversible

The two models MUST be introduced via a clean, forward Prisma migration; any pre-existing orphaned/untracked `RoleSectionAccess`/`UserSectionOverride` tables in the target database MUST be dropped before the migration runs, so both tables are (re)created under proper migration history. The migration's down path MUST drop both tables and the `User` back-relation without touching any other table.

#### Scenario: Migration applies cleanly despite pre-existing drift

- GIVEN the target database already has empty, untracked `RoleSectionAccess`/`UserSectionOverride` tables outside migration history
- WHEN the new migration runs
- THEN it succeeds without conflict and the resulting tables are tracked by migration history

#### Scenario: Rollback removes only the two new tables

- GIVEN the migration has been applied
- WHEN it is reverted
- THEN `RoleSectionAccess`, `UserSectionOverride`, and the `User` back-relation are removed
- AND no other existing table is altered

### Requirement: Read Role Default Grid

`GET /permisos/roles/:rol` MUST require a valid Bearer token via `JwtAuthGuard` only and MUST return one entry per canonical section with that role's stored `level`, defaulting missing rows to `sin_acceso`.

#### Scenario: Role grid read with partial stored data

- GIVEN a `rol` with `RoleSectionAccess` rows for some but not all sections
- WHEN `GET /permisos/roles/:rol` is called with a valid Bearer token
- THEN the response has 15 entries; sections without a stored row report `sin_acceso`

### Requirement: Upsert Role Default Grid

`PUT /permisos/roles/:rol` MUST require a valid Bearer token via `JwtAuthGuard` only and MUST upsert one `RoleSectionAccess` row per submitted `{ sectionId, level }` pair, keyed on `(rol, sectionId)`.

#### Scenario: Setting a role-level default persists

- GIVEN a valid Bearer token
- WHEN `PUT /permisos/roles/:rol` is called with `{ sectionId: 'productos', level: 'lectura' }`
- THEN the `RoleSectionAccess` row for `(rol, 'productos')` is created or updated to `level: 'lectura'`

### Requirement: Read Effective Grid for a User

`GET /permisos/users/:userId` MUST require a valid Bearer token via `JwtAuthGuard` only and MUST return one entry per canonical section with `{ sectionId, roleLevel, overrideLevel, effectiveLevel }`, where `roleLevel` is that user's `rol`'s stored default (or `sin_acceso` if unset), `overrideLevel` is the user's stored override for that section or `null` if none exists, and `effectiveLevel` MUST equal `overrideLevel` when an override row exists, otherwise `roleLevel`.

#### Scenario: Effective level falls back to role default when no override exists

- GIVEN a user with no `UserSectionOverride` row for `sectionId: 'clientes'` and their `rol` has `RoleSectionAccess` level `total` for `clientes`
- WHEN `GET /permisos/users/:userId` is called
- THEN the `clientes` entry reports `overrideLevel: null` and `effectiveLevel: 'total'`

#### Scenario: Override takes precedence over role default

- GIVEN a user with a `UserSectionOverride` of `lectura` for `sectionId: 'productos'` and their `rol` has `RoleSectionAccess` level `total` for `productos`
- WHEN `GET /permisos/users/:userId` is called
- THEN the `productos` entry reports `overrideLevel: 'lectura'` and `effectiveLevel: 'lectura'`

#### Scenario: No role default and no override falls back to sin_acceso

- GIVEN a user whose `rol` has no `RoleSectionAccess` row for `sectionId: 'empresa'` and no `UserSectionOverride` for it either
- WHEN `GET /permisos/users/:userId` is called
- THEN the `empresa` entry reports `roleLevel: 'sin_acceso'`, `overrideLevel: null`, `effectiveLevel: 'sin_acceso'`

### Requirement: Upsert or Clear Per-User Overrides

`PUT /permisos/users/:userId` MUST require a valid Bearer token via `JwtAuthGuard` only. For each submitted `{ sectionId, level }` entry: if `level` is one of `total`/`lectura`/`sin_acceso`, the system MUST upsert the `UserSectionOverride` row for `(userId, sectionId)` to that level. If `level` is `null` or omitted for a section that currently has a stored override, the system MUST delete that `UserSectionOverride` row so the user falls back to the role default.

#### Scenario: Setting a level upserts the override

- GIVEN a user with no existing override for `sectionId: 'diagnosticos'`
- WHEN `PUT /permisos/users/:userId` is called with `{ sectionId: 'diagnosticos', level: 'total' }`
- THEN a `UserSectionOverride` row for `(userId, 'diagnosticos')` is created with `level: 'total'`

#### Scenario: Setting null clears an existing override

- GIVEN a user with an existing `UserSectionOverride` of `lectura` for `sectionId: 'diagnosticos'`
- WHEN `PUT /permisos/users/:userId` is called with `{ sectionId: 'diagnosticos', level: null }`
- THEN the `UserSectionOverride` row for `(userId, 'diagnosticos')` is deleted
- AND a subsequent `GET /permisos/users/:userId` reports `overrideLevel: null` and `effectiveLevel` equal to the role default

#### Scenario: Unknown userId is rejected

- GIVEN a `userId` that does not match any existing `User`
- WHEN `PUT /permisos/users/:userId` or `GET /permisos/users/:userId` is called
- THEN it returns 404 and no override row is written

### Requirement: Authentication-Only Authorization, No New Guards Anywhere

All four `permisos` endpoints (`GET`/`PUT /permisos/roles/:rol`, `GET`/`PUT /permisos/users/:userId`) MUST authorize solely via `JwtAuthGuard` — a valid Bearer token, no `rol` or permission check. This change MUST NOT create a `RolesGuard`/`PermisosGuard`, MUST NOT add `@UseGuards` beyond `JwtAuthGuard` to any existing module, and MUST NOT add any authorization check to any route, page, or controller outside `server/src/permisos/`.

#### Scenario: Any authenticated rol can call the permisos endpoints

- GIVEN a valid Bearer token for a user with `rol: 'empleado'`
- WHEN that user calls any of the four `permisos` endpoints
- THEN the request succeeds identically to a request from an `'admin'` user

#### Scenario: No guard is added to unrelated modules

- GIVEN the full set of existing controllers outside `server/src/permisos/` (e.g. `productos`, `clientes`, `ordenes-trabajo`)
- WHEN their `@UseGuards` decorators are inspected before and after this change
- THEN none of them gained a new guard, and no route among them starts returning 401/403 for a request that previously succeeded

### Requirement: JWT Payload and req.user Shape Are Unchanged

This change MUST NOT modify `server/src/auth/strategies/jwt.strategy.ts` or the shape of `req.user`. `req.user` MUST remain exactly `{ userId, username }`; it MUST NOT gain a `rol`, `permisos`, or any access-level field.

#### Scenario: req.user shape is identical before and after

- GIVEN a request authenticated with a valid Bearer token, before and after this change is applied
- WHEN `req.user` is inspected inside any controller
- THEN it has exactly the keys `userId` and `username` in both cases, with no added fields
