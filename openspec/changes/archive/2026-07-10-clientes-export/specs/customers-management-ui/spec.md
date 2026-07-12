# Delta for Customers Management UI

## ADDED Requirements

### Requirement: Export Button on Clientes List

The `/clientes` list header MUST include an "Exportar" button placed next to the existing "Nuevo cliente" action, styled as a secondary/outline button (not the primary rose-gradient style reserved for "Nuevo cliente"). Clicking it MUST trigger a download of `GET /customers/export`'s response, using the list's current `search` and `statusFilter` values, saved as `clientes.csv`.

#### Scenario: Export button downloads CSV with current filters

- GIVEN the clientes list has an active `search` term and a `statusFilter` value
- WHEN the user clicks "Exportar"
- THEN a request is made carrying those same `search` and `status` values to the export endpoint
- AND the response is saved as a file named `clientes.csv`

#### Scenario: Export button uses secondary styling

- GIVEN the `/clientes` list header renders both "Nuevo cliente" and "Exportar"
- WHEN the buttons are rendered
- THEN "Exportar" uses the secondary/outline style and "Nuevo cliente" retains the rose-gradient primary style

### Requirement: Typed Export API Client Function

`client/app/lib/customers.ts` MUST export an `exportCustomers({ search, status })` function that fetches `GET /customers/export` with those query params, attaches the `Authorization` header via `getAuthHeader()`, and resolves to a `Blob` on success following the module's existing `fetch` → check `res.ok` → throw-on-failure convention.

#### Scenario: exportCustomers attaches auth header and returns a Blob

- GIVEN a logged-in user with a valid token
- WHEN `exportCustomers({ search, status })` is called
- THEN the request includes the `Authorization` header produced by `getAuthHeader()`
- AND on a successful response it resolves to a `Blob`

#### Scenario: Failed export request throws

- GIVEN `GET /customers/export` responds with a non-2xx status
- WHEN `exportCustomers` handles that response
- THEN it throws, matching the error-handling convention used by other functions in `customers.ts`

### Requirement: Browser Download Trigger and Loading/Error Handling

Clicking "Exportar" MUST show a loading/disabled state on the button while the export request is in flight, MUST trigger a browser download via `URL.createObjectURL` on the resolved `Blob` and a synthetic `<a download="clientes.csv">` click, and MUST revoke the created object URL afterward. A failed export MUST surface an error state without crashing the page.

#### Scenario: Button shows loading/disabled state during export

- GIVEN the user clicks "Exportar"
- WHEN the export request is in flight
- THEN the button is disabled and shows a loading indicator until the request settles

#### Scenario: Successful export triggers a file download

- GIVEN `exportCustomers` resolves with a CSV `Blob`
- WHEN the download is triggered
- THEN an object URL is created from the `Blob`, a synthetic `<a download="clientes.csv">` element is clicked to start the download, and the object URL is revoked afterward

#### Scenario: Failed export shows an error without crashing

- GIVEN `exportCustomers` throws (network error or non-2xx response)
- WHEN the failure is handled
- THEN an error is surfaced to the user and the page does not crash
