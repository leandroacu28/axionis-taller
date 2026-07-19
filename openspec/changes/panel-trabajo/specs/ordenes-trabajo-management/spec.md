# Delta for Órdenes de Trabajo Management

## MODIFIED Requirements

### Requirement: Update Order With Free Estado Transitions

`PATCH /ordenes-trabajo/:id` MUST allow updating any editable field, including transitioning `estado` to any of `pendiente`/`en_proceso`/`terminado`/`cancelado` from any current value, in any direction. No linear workflow MUST be enforced. An unmatched `id` MUST return 404.
(Previously: stated "no `cancelado` state exists" and that `estado` could only transition among `pendiente`/`en_proceso`/`terminado`. That assertion was stale documentation — `Estado` has included `cancelado` since migration `20260716124433_add_cancelado_estado`. This delta is a documentation-only correction; no endpoint behavior changes.)

#### Scenario: Estado transitions freely in any direction

- GIVEN an order with `estado = 'terminado'`
- WHEN `PATCH /ordenes-trabajo/:id` is called with `estado: 'pendiente'`
- THEN it returns 200 and the order's `estado` becomes `'pendiente'`

#### Scenario: Estado can transition to cancelado

- GIVEN an order with `estado = 'pendiente'`
- WHEN `PATCH /ordenes-trabajo/:id` is called with `estado: 'cancelado'`
- THEN it returns 200 and the order's `estado` becomes `'cancelado'`

#### Scenario: Unknown id returns 404

- GIVEN an id that does not match any existing order
- WHEN `PATCH /ordenes-trabajo/:id` is called
- THEN it returns 404 and nothing is modified
