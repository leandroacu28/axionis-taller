# Delta for Órdenes de Trabajo Management

## ADDED Requirements

### Requirement: Client Order Vehiculo Type Includes Patente

`client/app/lib/ordenes-trabajo.ts`'s inline `vehiculo` shape (used by `OrdenTrabajoListItem` and any order detail/read type) MUST include `patente: string | null`, matching the server's `VEHICLE_SELECT` shape.

#### Scenario: Client type declares patente

- GIVEN the client lib's inline `vehiculo` type definition
- WHEN inspected after this change
- THEN it declares `patente: string | null` alongside `id`, `kilometraje`, and `marca`

### Requirement: Vehículo Picker Label Includes Patente

The Vehículo `SearchableSelect` in `OrdenTrabajoForm.tsx` MUST format each search result's label to include the vehicle's `patente` when present (e.g. appended after marca/modelo), and MUST fall back to the marca/modelo-only label, unchanged, when `patente` is absent.

#### Scenario: Result label includes patente when present

- GIVEN a vehicle with `patente: 'ABC123'` matches the picker's current search
- WHEN the results panel renders that vehicle
- THEN its label includes `ABC123` alongside marca and modelo

#### Scenario: Result label omits patente when absent

- GIVEN a vehicle with no `patente` matches the picker's current search
- WHEN the results panel renders that vehicle
- THEN its label shows only marca and modelo, in the same format used before this capability

### Requirement: Read-Only Order Views Display Patente

The order list (`ordenes-trabajo/page.tsx`), the order detail/work view (`ordenes-trabajo/[id]/trabajo/page.tsx`), and the order edit page's read-only vehicle summary (`ordenes-trabajo/editar/[id]/page.tsx`) MUST display the associated vehicle's `patente` alongside marca/modelo when present, and MUST NOT render a placeholder or broken artifact when `patente` is absent.

#### Scenario: Order list row shows patente when present

- GIVEN an order whose vehicle has `patente: 'ABC123'`
- WHEN the order list renders that row
- THEN the vehicle's `patente` is visible alongside marca/modelo

#### Scenario: Order detail view shows patente when present

- GIVEN an order whose vehicle has `patente: 'ABC123'`
- WHEN `ordenes-trabajo/[id]/trabajo` renders that order
- THEN the vehicle's `patente` is visible in the read-only vehicle summary

#### Scenario: Absent patente renders no placeholder

- GIVEN an order whose vehicle has no `patente`
- WHEN any of the three read-only views renders that order
- THEN no placeholder text, empty label, or broken artifact appears where the plate would otherwise show
