# Delta for Órdenes de Trabajo Productos Consumidos

## ADDED Requirements

### Requirement: Add Producto Line Creates a New Line or Sums Into an Existing One

`POST /ordenes-trabajo/:id/detalles/:detalleId/productos` MUST accept `{ productoId, cantidad }`. If no line for `(detalleId, productoId)` exists, it MUST create one. If a line for that pair already exists (enforced by `@@unique([ordenTrabajoTipoServicioId, productoId])`), it MUST instead sum the incoming `cantidad` into the existing line's `cantidad` and recompute `precioTotal`, rather than creating a second row.

#### Scenario: First add creates a new line

- GIVEN a detalle with no line for `productoId: 7`
- WHEN `POST .../productos` is called with `{ productoId: 7, cantidad: 3 }`
- THEN a new line is created with `cantidad: 3`

#### Scenario: Adding the same producto again sums the quantity

- GIVEN a detalle already has a line for `productoId: 7` with `cantidad: 3`
- WHEN `POST .../productos` is called again with `{ productoId: 7, cantidad: 2 }`
- THEN no second row is created and the existing line's `cantidad` becomes `5`

#### Scenario: Summed line's precioTotal uses the frozen unit price

- GIVEN a line for `productoId: 7` was added when `Producto.precioVenta` was `10`, so `cantidad: 3` and `precioTotal: 30`
- WHEN `POST .../productos` sums in `cantidad: 2` (new `cantidad: 5`), regardless of `Producto.precioVenta`'s current value
- THEN the recomputed `precioTotal` is `5 × 10 = 50`, not `5 ×` the current catalog price

### Requirement: Price Is a Server-Computed Add-Time Snapshot

`precioTotal` MUST be computed server-side as `cantidad × Producto.precioVenta`, read at the moment the line is added. The client MUST NOT be able to supply a price; any price-like field in the request body MUST be ignored. A later change to `Producto.precioVenta` MUST NOT retroactively update `precioTotal` on already-added lines.

#### Scenario: precioTotal is computed from the catalog price at add-time

- GIVEN `Producto.precioVenta` is `15`
- WHEN `POST .../productos` adds `{ productoId, cantidad: 4 }`
- THEN the stored line has `precioTotal: 60` and any client-supplied price field is ignored

#### Scenario: Catalog price change does not retroactively update existing lines

- GIVEN a line was added with `cantidad: 4` when `Producto.precioVenta` was `15` (`precioTotal: 60`)
- WHEN `Producto.precioVenta` is later updated to `20` via `PATCH /productos/:id`
- THEN the existing line's `precioTotal` remains `60`

### Requirement: Update Line Quantity Recomputes From the Frozen Unit Price

`PATCH /ordenes-trabajo/:id/detalles/:detalleId/productos/:lineaId` MUST accept `{ cantidad }` as an absolute new value (not a delta) and MUST recompute `precioTotal` as `newCantidad × originalFrozenUnitPrice`. It MUST NOT re-read `Producto.precioVenta` from the catalog.

#### Scenario: Quantity update recomputes precioTotal from the original snapshot price

- GIVEN a line with `cantidad: 4` and `precioTotal: 60` (frozen unit price `15`)
- WHEN `PATCH .../productos/:lineaId` sets `{ cantidad: 6 }`
- THEN `cantidad` becomes `6` and `precioTotal` becomes `90` (`6 × 15`)

#### Scenario: Quantity update ignores a catalog price change since add-time

- GIVEN a line's frozen unit price is `15`, and `Producto.precioVenta` has since changed to `25`
- WHEN `PATCH .../productos/:lineaId` sets `{ cantidad: 2 }`
- THEN `precioTotal` becomes `30` (`2 × 15`), not `50`

### Requirement: Remove a Producto Line

`DELETE /ordenes-trabajo/:id/detalles/:detalleId/productos/:lineaId` MUST remove the matching line entirely.

#### Scenario: Line is removed

- GIVEN an existing line `lineaId`
- WHEN `DELETE .../productos/:lineaId` is called
- THEN the line no longer exists on the detalle

#### Scenario: Removing one line does not affect other lines

- GIVEN a detalle has three producto lines
- WHEN one of the three is removed via `DELETE .../productos/:lineaId`
- THEN the other two lines remain unchanged

### Requirement: No Stock Decrement on Consumption

Adding, updating, or removing a producto line MUST NOT modify `Producto.cantidadInicial`. This records consumption; it is not an inventory transaction.

#### Scenario: Adding a line does not change cantidadInicial

- GIVEN a `Producto` with `cantidadInicial: 100`
- WHEN a line is added for that producto via `POST .../productos`
- THEN `Producto.cantidadInicial` is still `100`

#### Scenario: Updating or removing a line does not change cantidadInicial

- GIVEN an existing line for a `Producto` with `cantidadInicial: 100`
- WHEN the line's `cantidad` is updated via `PATCH .../productos/:lineaId`, or the line is removed via `DELETE .../productos/:lineaId`
- THEN `Producto.cantidadInicial` is still `100`

### Requirement: Producto Lines Are Locked Once the Detalle Is Terminado

Once a detalle's `estado === 'terminado'`, `POST`, `PATCH`, and `DELETE` on its producto lines MUST be rejected with `409 Conflict` and a Spanish message, and MUST NOT mutate any line.

#### Scenario: Adding a line to a terminado detalle is rejected

- GIVEN a detalle with `estado: 'terminado'`
- WHEN `POST .../productos` is called on that detalle
- THEN it returns `409` and no line is created

#### Scenario: Updating or removing a line on a terminado detalle is rejected

- GIVEN a detalle with `estado: 'terminado'` and an existing producto line
- WHEN `PATCH .../productos/:lineaId` or `DELETE .../productos/:lineaId` is called
- THEN it returns `409` and the line is not modified or removed

### Requirement: Active-Producto Guard on Add

`POST .../productos` MUST reject a `productoId` referencing an inactive `Producto` (`activo: false`) with `400` and a Spanish message, via `assertProductoActivo`, before any write occurs. This guard applies only to adding a line; it MUST NOT be re-evaluated on remove.

#### Scenario: Adding a line with an inactive producto is rejected

- GIVEN a `Producto` with `activo: false`
- WHEN `POST .../productos` is called with that `productoId`
- THEN it returns `400` and no line is created or summed

#### Scenario: Removing a line never re-validates the producto's active status

- GIVEN an existing line whose `Producto` has since become `activo: false`
- WHEN `DELETE .../productos/:lineaId` is called
- THEN the line is removed successfully; the active-producto guard is not applied to removal
