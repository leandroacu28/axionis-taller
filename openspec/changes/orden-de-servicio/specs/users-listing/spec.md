# Delta for Users Listing

## ADDED Requirements

### Requirement: Search and Status Query Params on User Listing

`GET /users` MUST accept optional `search` (string) and `status` (`'all' | 'activo' | 'inactivo'`) query params, mirroring `ListEtiquetasQueryDto`'s shape. `search` MUST perform a case-insensitive partial match against user-identifying fields (at minimum `username`). `status` MUST filter on `User.activo`. This change MUST NOT introduce pagination — the endpoint MUST continue returning a plain array, not a paginated envelope.

#### Scenario: Filtering users by search term

- GIVEN users exist with varying `username` values
- WHEN `GET /users?search=<term>` is called
- THEN only users whose `username` (or other matched field) contains that term are returned

#### Scenario: Filtering users by status

- GIVEN users exist with `activo: true` and `activo: false`
- WHEN `GET /users?status=activo` is called
- THEN only users with `activo: true` are returned

#### Scenario: Omitting both params preserves existing behavior

- GIVEN a request to `GET /users` with no query params
- WHEN the backend handles the request
- THEN it returns the full list of users as a plain array, identical to the endpoint's behavior before this change

#### Scenario: search and status combine

- GIVEN both `search` and `status` are provided
- WHEN `GET /users?search=<term>&status=activo` is called
- THEN only users matching both the search term and the active status are returned
