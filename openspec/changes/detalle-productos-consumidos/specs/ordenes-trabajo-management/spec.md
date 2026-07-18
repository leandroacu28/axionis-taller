# Delta for Órdenes de Trabajo Management

## ADDED Requirements

### Requirement: Detalle Read Shape Exposes Consumed Producto Lines

`GET /ordenes-trabajo/:id/detalles` MUST include, for each detalle, its consumed producto lines. Each line in the response MUST expose `id`, `productoId`, the producto's label/descripcion, `cantidad`, and `precioTotal`.

#### Scenario: Detalle with consumed productos returns their line data

- GIVEN a detalle has two producto lines
- WHEN `GET /ordenes-trabajo/:id/detalles` is called
- THEN that detalle's response includes both lines, each with `id`, `productoId`, the producto's descripcion, `cantidad`, and `precioTotal`

#### Scenario: Detalle with no consumed productos returns an empty list

- GIVEN a detalle has no producto lines
- WHEN `GET /ordenes-trabajo/:id/detalles` is called
- THEN that detalle's producto lines are returned as an empty array, not omitted or `null`
