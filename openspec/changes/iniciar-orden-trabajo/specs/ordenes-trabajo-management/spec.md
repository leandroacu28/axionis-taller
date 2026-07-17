# Delta for Órdenes de Trabajo Management

## ADDED Requirements

### Requirement: Detalle Próximo Service Is Two Independent Fields

`OrdenTrabajoTipoServicio` MUST expose two independent, optional próximo-service fields: `proximoServiceFecha` (`DateTime?`, a calendar date — renamed from the former single `proximoService` field) and `proximoServiceKm` (`Int?`, the absolute target odometer reading). `proximoServiceKm` MUST be stored exactly as supplied — it is not an interval/delta and MUST NOT be auto-calculated from `Vehiculo.kilometraje`. Both fields MAY be set independently, together, or left `null`; the system MUST NOT enforce mutual exclusivity or an "at least one required" rule between them.

#### Scenario: Fields can be set independently

- GIVEN a detalle with `proximoServiceFecha: null` and `proximoServiceKm: null`
- WHEN `PATCH /ordenes-trabajo/:id/detalles/:detalleId` sets only `proximoServiceKm: 55000`
- THEN the detalle's `proximoServiceKm` becomes `55000` and `proximoServiceFecha` remains `null`

#### Scenario: Both fields set together

- GIVEN an existing detalle
- WHEN `PATCH /ordenes-trabajo/:id/detalles/:detalleId` sets both `proximoServiceFecha` and `proximoServiceKm` in the same request
- THEN both values are persisted independently and no validation error occurs

#### Scenario: Either field can be cleared independently

- GIVEN a detalle with both `proximoServiceFecha` and `proximoServiceKm` set
- WHEN `PATCH /ordenes-trabajo/:id/detalles/:detalleId` sets `proximoServiceKm: null` only
- THEN `proximoServiceKm` becomes `null` and `proximoServiceFecha` keeps its prior value

#### Scenario: proximoServiceKm is not derived from the odometer

- GIVEN a vehículo with a known `kilometraje`
- WHEN a detalle's `proximoServiceKm` is set via `PATCH /ordenes-trabajo/:id/detalles/:detalleId`
- THEN the stored value is exactly the client-supplied number, with no read from or calculation against `Vehiculo.kilometraje`

### Requirement: Detalle Read/Write Endpoints Expose Only the Split Fields

`GET /ordenes-trabajo/:id/detalles` and `PATCH /ordenes-trabajo/:id/detalles/:detalleId` MUST return `proximoServiceFecha` and `proximoServiceKm` in their response shape. Neither endpoint's response MUST contain a `proximoService` key.

#### Scenario: List detalles returns split fields

- GIVEN an order with at least one detalle
- WHEN `GET /ordenes-trabajo/:id/detalles` is called
- THEN each detalle in the response includes `proximoServiceFecha` and `proximoServiceKm`, and no `proximoService` key

#### Scenario: Update detalle response reflects split fields

- GIVEN an existing detalle
- WHEN `PATCH /ordenes-trabajo/:id/detalles/:detalleId` is called with a `proximoServiceFecha` value
- THEN the response includes the updated `proximoServiceFecha`, the unrelated `proximoServiceKm` value is unchanged, and no `proximoService` key is present

### Requirement: Client Lib Reflects the Renamed and Split Fields

`client/app/lib/ordenes-trabajo.ts`'s `OrdenTrabajoDetalle` interface and `UpdateOrdenTrabajoDetallePayload` type MUST expose `proximoServiceFecha: string | null` and `proximoServiceKm: number | null` in place of the former single `proximoService` field, matching the server's read/write shape.

#### Scenario: Client types have no remaining proximoService reference

- GIVEN the client lib's `OrdenTrabajoDetalle` and `UpdateOrdenTrabajoDetallePayload` type definitions
- WHEN inspected after the change
- THEN neither declares a `proximoService` field, and both declare `proximoServiceFecha: string | null` and `proximoServiceKm: number | null`
