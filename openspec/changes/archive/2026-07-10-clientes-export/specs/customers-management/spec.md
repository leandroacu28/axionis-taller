# Delta for Customers Management

## ADDED Requirements

### Requirement: Export Customers Endpoint

`GET /customers/export` MUST require a valid Bearer token via the same `JwtAuthGuard` as `GET /customers`, and MUST accept `search` and `status` query params with matching semantics to `GET /customers`. The filter logic MUST reuse `GET /customers`'s `where`-building logic (not a duplicated copy), executed as a single query without `skip`/`take`, so the export returns every matching cliente rather than a single page. The response MUST be served with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="clientes.csv"`.

#### Scenario: Authenticated export returns full matching set

- GIVEN a valid Bearer token and clientes matching the current `search`/`status` filters exceed one page's worth
- WHEN `GET /customers/export` is called with those `search`/`status` values
- THEN it returns 200 with a CSV body containing every matching cliente, not limited to a single page

#### Scenario: Missing or invalid token is rejected

- GIVEN a request to `GET /customers/export` has no `Authorization` header or an invalid/expired token
- WHEN the backend handles the request
- THEN it returns 401 and no CSV is returned

#### Scenario: Filters match GET /customers semantics

- GIVEN the same `search` and `status` query values are sent to both `GET /customers` and `GET /customers/export`
- WHEN both requests are handled
- THEN the set of clientes matched by `GET /customers/export` is identical to the set returned (across all pages) by `GET /customers`

#### Scenario: Response is served as a downloadable CSV file

- GIVEN a valid `GET /customers/export` request
- WHEN the response is returned
- THEN its `Content-Type` is `text/csv; charset=utf-8` and its `Content-Disposition` header is `attachment; filename="clientes.csv"`

### Requirement: CSV Column Set and Encoding

The CSV body returned by `GET /customers/export` MUST include a header row followed by one row per matching cliente, with columns in this exact order: `Razón Social`, `Tipo de identificación`, `Identificación`, `Teléfono`, `Domicilio`, `Estado`. The `Estado` column MUST render the cliente's `activo` boolean as `Activo` or `Inactivo`, not a raw boolean. The CSV payload MUST be prepended with a UTF-8 byte-order mark (BOM).

#### Scenario: Columns appear in the specified order with a header row

- GIVEN at least one cliente matches the export filters
- WHEN the CSV is generated
- THEN the first row is the header `Razón Social,Tipo de identificación,Identificación,Teléfono,Domicilio,Estado`
- AND each following row has values in that same column order

#### Scenario: Estado column renders Activo/Inactivo

- GIVEN a matching cliente with `activo: true` and another with `activo: false`
- WHEN the CSV is generated
- THEN the first cliente's Estado cell is `Activo` and the second's is `Inactivo`

#### Scenario: UTF-8 BOM precedes the CSV content

- GIVEN any `GET /customers/export` response
- WHEN the raw response body is inspected
- THEN it begins with the UTF-8 BOM byte sequence, followed by the CSV header row

### Requirement: CSV Field Escaping

Any field value containing a comma, a double-quote, or a newline MUST be quoted, and any embedded double-quote MUST be doubled, following standard CSV escaping rules. This MUST apply to all columns, in particular `razonSocial` and `domicilio`.

#### Scenario: Field with an embedded comma is quoted

- GIVEN a cliente whose `razonSocial` contains a comma (e.g. `Pérez, S.A.`)
- WHEN the CSV is generated
- THEN that field is wrapped in double-quotes so the comma is not read as a column separator

#### Scenario: Field with an embedded double-quote is escaped

- GIVEN a cliente whose `domicilio` contains a double-quote character
- WHEN the CSV is generated
- THEN the field is wrapped in double-quotes and the embedded quote is doubled

#### Scenario: Field with an embedded newline is quoted

- GIVEN a cliente whose `domicilio` contains a newline character
- WHEN the CSV is generated
- THEN the field is wrapped in double-quotes so the row is not split across multiple CSV lines
