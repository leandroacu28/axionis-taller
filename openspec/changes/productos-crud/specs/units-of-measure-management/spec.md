# Delta for Units of Measure Management

## MODIFIED Requirements

### Requirement: UnidadMedida Data Model

The `UnidadMedida` Prisma model MUST declare `id`, `descripcion` (`String`, `@unique`), `activo` (`Boolean`, `@default(true)`), `createdAt`, `updatedAt`, `creadoPorId` (nullable FK to `User.id`, relation `"UnidadMedidaCreadoPor"`, `onDelete: SetNull`), and `actualizadoPorId` (nullable FK to `User.id`, relation `"UnidadMedidaActualizadoPor"`, `onDelete: SetNull`). The `User` model MUST declare the two matching back-relation arrays, `unidadesMedidaCreadas` and `unidadesMedidaActualizadas`. The `UnidadMedida` model MUST also declare a `productos` back-relation array (`Producto[]`) reflecting `Producto.unidadMedidaId`'s required FK to `UnidadMedida.id`. The migration MUST be additive-only (no existing table/column dropped or altered).
(Previously: same fields, without the `productos` back-relation array — `UnidadMedida` had no consumers.)

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

## ADDED Requirements

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
