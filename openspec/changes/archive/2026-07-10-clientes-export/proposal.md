# Proposal: Export button in /clientes

## Intent
The `/clientes` list lets a user search and filter clients (by `search` text and `activo|inactivo|all` status) but offers no way to get that filtered data *out* of the app — there is no export/download feature anywhere in the codebase today. This change adds a single "Exportar" button to the `/clientes` list header that downloads a CSV of **all** clients matching the user's current filters (not just the visible page), so the export reflects exactly what the user is looking at. This is the app's first export/download feature.

## Scope

### In Scope
- **Frontend**: one "Exportar" button in the `/clientes` list header, placed next to the existing "Nuevo cliente" action (top-right). It uses a **secondary/outline** style — the rose gradient stays reserved for the primary create action. Clicking it downloads a CSV named `clientes.csv`. The request carries the **current** `search` and `statusFilter` values (not `page`/`pageSize`) so the CSV contains the full filtered result set, not just the on-screen page. Standard loading/disabled + error handling while the download is in flight, following the fetch/error convention already used in `client/app/lib/*.ts` (`fetch` → check `res.ok` → throw on failure), with `getAuthHeader()` for the Bearer token.
- **Backend**: new route `GET /customers/export` on `CustomersController`, under the same `JwtAuthGuard` as the rest of `/customers`. It accepts the same `search` and `status` query params as `GET /customers` (no `page`/`pageSize`). A new `CustomersService` method reuses `findAll`'s exact `where`-building logic **minus** `skip`/`take`, so the filter semantics match `GET /customers` identically. The result is serialized to CSV by hand (no new dependency) and returned as `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="clientes.csv"`.
- **CSV columns** (in this order), sourced from `CustomerListItem` / `CUSTOMER_SELECT`:
  1. `Razón Social` ← `razonSocial`
  2. `Tipo de identificación` ← `tipoIdentificacion`
  3. `Identificación` ← `identificacion`
  4. `Teléfono` ← `telefono`
  5. `Domicilio` ← `domicilio`
  6. `Estado` ← `activo` (rendered as `Activo` / `Inactivo`, matching the table's label semantics, not a raw boolean)
- **CSV escaping**: fields are quoted/escaped correctly for embedded commas, double-quotes, and newlines (relevant for `razonSocial` and `domicilio`). Header row included. A UTF-8 BOM may be prepended so Excel opens accented characters correctly (design detail).

### Column decision: include `Domicilio`
`Domicilio` is **not** a visible table column but **is** a real customer field. A CSV export is a data-oriented view, not a pixel-mirror of the table, so all non-audit customer fields are included. Excluded: audit/system fields (`id`, `createdAt`, `updatedAt`, `creadoPor`, `actualizadoPor`) — not useful in a business-facing client list and noisy for the end user.

### Out of Scope
- Any changes to other sections (`marcas`, `vehiculos`, `usuarios`, `colores`). This is `/clientes`-only. Reusing the same button elsewhere is a separate future change.
- Reworking the list page's filtering, pagination, or table.

### Non-Goals (explicitly not this change)
- `.xlsx` / PDF export (CSV only — a spreadsheet library is an unjustified new dependency for v1; see rejected Option 3 in exploration).
- Row-count cap, streaming, or background/scheduled export — accepted limitation at the app's current data scale.
- Column-customization UI (which columns, order, etc.).
- Exporting audit fields or a "select rows to export" interaction.

## Capabilities
### New Capabilities
- `customers-export`: authenticated users can download a CSV of all clients matching the current `/clientes` search + status filters, via `GET /customers/export`.

### Modified Capabilities
- None. Existing `GET /customers` behavior is untouched.

## Approach
Backend: add one controller route and one service method. The service method extracts (or shares) the same `where` construction `findAll` already uses, runs a single `findMany` without `skip`/`take`, maps rows to the fixed column set, and builds the CSV string with a small local escape helper (quote a field when it contains `,`, `"`, or a newline; double any embedded `"`). The controller sets `Content-Type` and `Content-Disposition` and returns the string. No new npm dependency in either `package.json`.

Frontend: add a secondary button in the existing header toolbar. On click, it calls a new `exportCustomers({ search, status })` in `client/app/lib/customers.ts` that fetches the CSV as a `Blob`, then triggers a browser download (`URL.createObjectURL` + a synthetic `<a download>`), revoking the object URL afterward. No new state-management or file-download library.

## Known Gaps / Accepted Tradeoffs
- **No row cap on export**: at very high client counts the endpoint returns the full set in one response. Accepted at current scale; streaming/capping is a future change if volume grows.
- **CSV, not xlsx**: locale/encoding quirks in Excel are mitigated with a UTF-8 BOM, but CSV remains a plain-text format. Deliberate v1 choice to avoid a new dependency.
- **Filter-parity coupling**: the export must keep matching `findAll`'s filter logic. Sharing the `where`-builder (rather than duplicating it) keeps them from drifting — flagged for `sdd-design`.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Export filter logic drifts from `GET /customers` and exports a different set than the user sees | Med | Reuse the same `where`-building code path, not a copy; called out for design/verify |
| CSV field with commas/quotes/newlines corrupts columns | Med | Explicit escape helper + test with `razonSocial`/`domicilio` containing those characters |
| Accented characters render garbled in Excel | Low | Prepend UTF-8 BOM to the CSV payload |
| Large result set produces a slow/heavy single response | Low (current scale) | Accepted limitation; no cap in v1, documented above |

## Success Criteria
- [ ] `GET /customers/export` requires a valid Bearer token (401 otherwise) and accepts `search` + `status` params matching `GET /customers`.
- [ ] The CSV contains **all** rows matching the current filters, not just the current page.
- [ ] Columns are exactly: Razón Social, Tipo de identificación, Identificación, Teléfono, Domicilio, Estado — in that order, with a header row; `Estado` shows `Activo`/`Inactivo`.
- [ ] Fields containing commas, quotes, or newlines are correctly escaped (no column shift).
- [ ] Response is served as `text/csv` with a `Content-Disposition: attachment` filename, triggering a browser download of `clientes.csv`.
- [ ] The "Exportar" button sits next to "Nuevo cliente" in secondary style; the rose gradient remains the create action only.
- [ ] No new npm dependency added to either `package.json`.
- [ ] No other section (`marcas`/`vehiculos`/`usuarios`/`colores`) is modified.
