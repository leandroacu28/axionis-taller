# Tasks: Export button in /clientes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-230 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception (not needed — well under budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

This is a small, single-feature addition to an existing module — one new backend route, one new DTO, one refactor, one frontend function, one button. Estimate breakdown:
- `customers.service.ts`: extract `buildCustomerWhere`, rewrite `findAll`, add `exportToCsv`/`buildCustomersCsv`/`csvCell`/`CSV_HEADERS` — net ~+70/-25 lines
- `customers.controller.ts`: add `export` route + imports — ~+10 lines
- `dto/export-customers-query.dto.ts` (new): ~15 lines
- `client/app/lib/customers.ts`: add `ExportCustomersParams` + `exportCustomers()` — ~+30 lines
- `client/app/(dashboard)/clientes/page.tsx`: header flex wrap, button, `exporting` state, `handleExport` — ~+40 lines

Total is well under the 400-line review budget; no chaining or `size:exception` decision required before apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: shared `buildCustomerWhere`, `exportToCsv`, CSV helpers, DTO, controller route | Single PR | ~130-150 lines |
| 2 | Frontend: `exportCustomers()` + button/handler wiring | Single PR | ~50-80 lines |

Both units are small enough and tightly coupled (frontend calls the new endpoint) to ship as one PR — no split needed.

## Phase 1: Backend — Shared Filter + Refactor

- [x] 1.1 In `server/src/customers/customers.service.ts`, extract the inline `searchWhere`/`where` construction currently in `findAll` (lines ~59-81) into a new module-level pure function `buildCustomerWhere(filter: CustomerFilter): { searchWhere: Prisma.ClienteWhereInput; where: Prisma.ClienteWhereInput }`, placed alongside the existing `normalizeOptional`/`uniqueTargetIncludes` module-level helpers. Include the MySQL `contains` collation comment.
- [x] 1.2 Rewrite `findAll` to call `buildCustomerWhere(query)` and destructure `{ searchWhere, where }`, keeping the `$transaction` (paginated `findMany`, `count`, `activeCount` using `searchWhere`) byte-for-byte equivalent to current behavior.
- [x] 1.3 Add `type CustomerFilter = { search?: string; status?: CustomerStatusFilter }` (or reuse the existing status type from `list-customers-query.dto.ts`) used by `buildCustomerWhere` and `exportToCsv`.

## Phase 2: Backend — Export Service Method + CSV Serialization

- [x] 2.1 In `customers.service.ts`, add `async exportToCsv(filter: CustomerFilter): Promise<string>` that calls `buildCustomerWhere(filter)`, runs a single `prisma.cliente.findMany({ where, select: CUSTOMER_SELECT, orderBy: { id: 'asc' } })` with no `skip`/`take`, and returns `buildCustomersCsv(rows)`.
- [x] 2.2 Add module-level `CSV_HEADERS` constant (`Razón Social`, `Tipo de identificación`, `Identificación`, `Teléfono`, `Domicilio`, `Estado`) and `csvCell(value: string | null | undefined): string` implementing RFC 4180 escaping (quote on `,`/`"`/CR/LF, double embedded `"`, null/undefined → `''`).
- [x] 2.3 Add module-level `buildCustomersCsv(rows): string` that joins the header row + one row per cliente (CRLF line terminator), mapping `tipoIdentificacion` through `ID_TYPE_LABELS` (imported from `./customer.constants`) and `activo` to `'Activo'`/`'Inactivo'`, prepending the UTF-8 BOM character to the final string.

## Phase 3: Backend — DTO + Controller Route

- [x] 3.1 Create `server/src/customers/dto/export-customers-query.dto.ts`: `ExportCustomersQueryDto` with optional `search: string` and optional `status: CustomerStatusFilter` (`@IsIn(['all', 'activo', 'inactivo'])`, default `'all'`), reusing `CustomerStatusFilter` from `list-customers-query.dto.ts`.
- [x] 3.2 In `server/src/customers/customers.controller.ts`, add `Header` to the `@nestjs/common` import, import `ExportCustomersQueryDto`, and add the `export` route handler with `@Header('Content-Type', 'text/csv; charset=utf-8')` and `@Header('Content-Disposition', 'attachment; filename="clientes.csv"')` that calls `this.customersService.exportToCsv(query)`.
- [x] 3.3 **Route order constraint (critical, do not get wrong)**: place `@Get('export')` immediately after the existing `@Get()` (`findAll`) handler and **before** `@Get(':id')` (`findOne`). NestJS/Express match routes top-to-bottom — if `:id` is declared first, `GET /customers/export` is captured by `:id`, hits `ParseIntPipe`, and returns 400 instead of the CSV.

## Phase 4: Frontend — API Client Function

- [x] 4.1 In `client/app/lib/customers.ts`, add `export interface ExportCustomersParams { search?: string; status?: 'all' | 'activo' | 'inactivo' }`.
- [x] 4.2 Add `export async function exportCustomers(params: ExportCustomersParams): Promise<Blob>` — builds a `URLSearchParams` query (only `search`/`status`, no `page`/`pageSize`), fetches `GET /customers/export` with `getAuthHeader()`, and on `!res.ok` reads the JSON error body defensively (`body?.message`) and throws with a Spanish fallback message; on success returns `res.blob()`. Do NOT route this through `handleJsonResponse` (CSV body, not JSON).

## Phase 5: Frontend — Export Button + Download Trigger

- [x] 5.1 In `client/app/(dashboard)/clientes/page.tsx`, import `exportCustomers` from `../../lib/customers` and add `const [exporting, setExporting] = useState(false)`.
- [x] 5.2 Wrap the header's top-right actions (`Nuevo cliente` link) in a `<div className="flex items-center gap-3">` and add the secondary/outline "Exportar" button (stone border/text, disabled + spinner while `exporting`) before the existing `Nuevo cliente` link — do not change the rose-gradient styling on `Nuevo cliente`.
- [x] 5.3 Implement `handleExport`: `setExporting(true)`, call `exportCustomers({ search: search || undefined, status: statusFilter })` (the **applied** `search`/`statusFilter` state, not `searchInput`), on success create an object URL from the returned `Blob`, trigger a synthetic `<a download="clientes.csv">` click, `URL.revokeObjectURL`, on failure call the existing `showError` toast (already imported), and `setExporting(false)` in a `finally` block.

## Phase 6: Manual Verification

- [x] 6.1 (verified statically, no live server run — see apply-progress.md) Confirm `GET /customers/export` with no `Authorization` header returns 401 and no CSV body.
- [x] 6.2 (verified statically, no live server run — see apply-progress.md) Hit `GET /customers/export` with `search` and `status` query params matching an existing `/clientes` filter combination; confirm the returned CSV contains every matching cliente (not just one page) and the row set matches `GET /customers` across all pages for the same params.
- [x] 6.3 (verified statically, no live server run — see apply-progress.md) Confirm the CSV response headers are `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="clientes.csv"`, the body starts with the UTF-8 BOM (`EF BB BF`), the header row is exactly `Razón Social,Tipo de identificación,Identificación,Teléfono,Domicilio,Estado`, and `Estado` renders `Activo`/`Inactivo`.
- [x] 6.4 (verified statically, no live server run — see apply-progress.md) Confirm a cliente with a comma, a double-quote, or a newline in `razonSocial`/`domicilio` is correctly quoted/escaped in the CSV with no column or row shift.
- [x] 6.5 (verified statically by reading controller order — see apply-progress.md) Confirm `GET /customers/:id` (e.g. `GET /customers/1`) still returns the cliente by numeric id and is not shadowed by the new `export` route — validates the Phase 3.3 route-order constraint.
- [ ] 6.6 NOT PERFORMED — requires a human to click through in a running browser. See apply-progress.md for the gap. In the browser, click "Exportar" on `/clientes` with an active `search`/`statusFilter`; confirm the button disables with a loading indicator, a `clientes.csv` file downloads reflecting those filters, and simulate a failed request (e.g. expired token) to confirm the `showError` toast appears without crashing the page.
- [x] 6.7 Confirm no dependency was added to `server/package.json` or `client/package.json`, and no other section (`marcas`/`vehiculos`/`usuarios`/`colores`) was modified.
