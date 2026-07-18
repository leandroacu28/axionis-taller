# Delta for Products Management

## ADDED Requirements

### Requirement: searchProductos Client Helper

`client/app/lib/productos.ts` MUST export a `searchProductos(term)` helper that queries `listProductos` with `{ search: term || undefined, status: 'activo', page: 1, pageSize: 20 }` and maps the result to `{ id, label }` pairs, mirroring `searchEtiquetas`/`searchUnidadesMedida` in the same file.

#### Scenario: searchProductos returns active productos as id/label pairs

- GIVEN active and inactive productos exist matching a search term
- WHEN `searchProductos(term)` is called
- THEN only `activo: true` productos are returned, each mapped to `{ id: producto.id, label: producto.descripcion }`

#### Scenario: searchProductos limits and filters like the other search helpers

- GIVEN more than 20 active productos match a search term
- WHEN `searchProductos(term)` is called
- THEN the underlying request uses `status: 'activo'`, `page: 1`, and `pageSize: 20`, consistent with `searchEtiquetas`/`searchUnidadesMedida`
