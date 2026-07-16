# Delta for Vehicles Listing

## ADDED Requirements

### Requirement: Cliente Filter on Vehicle Listing

`GET /vehicles` MUST accept an optional `clienteId` query parameter (numeric). When present, the returned list MUST include only vehículos whose `clienteId` matches. When omitted, the endpoint's existing behavior (pagination, `search`, `status` filtering, and result set) MUST be unchanged from before this change.

#### Scenario: Filtering vehicles by clienteId

- GIVEN vehículos exist for multiple clientes
- WHEN `GET /vehicles?clienteId=<id>` is called
- THEN only vehículos belonging to that `clienteId` are returned, still respecting pagination

#### Scenario: Omitting clienteId preserves existing behavior

- GIVEN a request to `GET /vehicles` that does not include `clienteId`
- WHEN the backend handles the request
- THEN the response shape and result set are identical to the endpoint's behavior before this change

#### Scenario: clienteId combines with existing search and status filters

- GIVEN `clienteId`, `search`, and `status` are all provided
- WHEN `GET /vehicles?clienteId=<id>&search=<term>&status=activo` is called
- THEN only vehículos matching `clienteId` AND `search` AND `status` are returned

#### Scenario: clienteId with no matching vehículos returns an empty page

- GIVEN a `clienteId` that has no vehículos, or does not exist
- WHEN `GET /vehicles?clienteId=<id>` is called
- THEN it returns 200 with an empty `data` array and `total: 0`, not an error
