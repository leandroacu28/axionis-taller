# Exploration: Export button in /clientes

## Current State
- List page: `client/app/(dashboard)/clientes/page.tsx`. Client component, fetches via `loadCustomers()` calling `listCustomers({ page, pageSize, search, status: statusFilter })`. State: `page`, `pageSize` (10/25/50, default 10), `search` (debounced 350ms), `statusFilter` (`all|activo|inactivo`, default `activo`).
- Table columns: `#`, `Cliente / Razón Social`, `Tipo`, `Identificación`, `Teléfono`, `Estado`, `Acciones`.
- Header layout: `<h1>` + subtitle on the left, a single primary action `<Link href="/clientes/nuevo">Nuevo cliente</Link>` (rose gradient) on the top-right. No existing multi-button toolbar anywhere in the app — all five list pages (`clientes`, `marcas`, `vehiculos`, `usuarios`, `colores`) share this same one-button-header structure.
- `customers` state only ever holds the **current page's rows** (max `pageSize`, ≤50) — never the full filtered result set.
- `CustomerListItem` (`client/app/lib/customers.ts`): `id, razonSocial, tipoIdentificacion, identificacion, telefono, domicilio, activo, createdAt, updatedAt, creadoPor, actualizadoPor`.

## Backend
- `GET /customers` → `CustomersController.findAll` → `CustomersService.findAll`, guarded by `JwtAuthGuard`.
- Hard-paginated: `skip: (page-1)*pageSize, take: pageSize`. Builds `where` from `search` (OR over `razonSocial`/`identificacion`/`telefono`, contains-match) and `status`. Returns `{ data, total, activeCount }`.
- **No endpoint exists today that returns all matching rows unpaginated** — no export route, no CSV/xlsx generation anywhere in the codebase.
- `CUSTOMER_SELECT` already shapes exactly the fields an export would need.

## Existing Patterns
- Repo-wide search (client + server) for `exportar|Blob(|createObjectURL|\.csv|download=|xlsx|exceljs|pdfkit` — **zero matches**. This would be the first export/download feature in the app.
- Neither `client/package.json` nor `server/package.json` has any CSV/Excel/PDF dependency today.

## Approaches Considered

1. **Frontend-only CSV of the currently loaded page** — build CSV client-side from the `customers` array already in state, trigger a `Blob` download.
   - Pros: zero new dependencies/backend changes, smallest diff.
   - Cons: silently limited to the ≤50 rows currently on screen — with search/status filters active this under-exports without warning. A user viewing "200 active clients" would only export the first page. Correctness risk, not just a UX nitpick.

2. **Backend export endpoint returning ALL matching rows (respecting current search/status filters) as CSV** — new route (e.g. `GET /customers/export`) reusing `CustomersService.findAll`'s `where`-building logic without `skip`/`take`, serialized to CSV server-side (`Content-Type: text/csv`, `Content-Disposition: attachment`).
   - Pros: correct semantics (exports the full filtered set the user intends), reuses existing filter logic, no new dependency (CSV for a fixed known column set can be hand-built with basic quote/comma/newline escaping).
   - Cons: one new controller route + service method; no row cap (acceptable at this app's current scale, worth noting as an accepted limitation).

3. **Add a spreadsheet library (`exceljs`/`xlsx`) for native `.xlsx`.**
   - Pros: nicer formatted output, avoids CSV locale/encoding quirks in Excel.
   - Cons: new dependency with real weight/maintenance/CVE surface, no existing precedent in either `package.json`, not justified for a first version.

## Recommendation
**Option 2** — backend CSV export endpoint reusing `CustomersService.findAll`'s filter logic minus pagination. It's the only option that produces correct data, needs no new dependency, and keeps the diff proportional. Option 1 should be explicitly rejected as a correctness bug disguised as a feature. Option 3 can be mentioned as a possible future enhancement, not part of this change.

## Risks
- Export endpoint must reuse the same `JwtAuthGuard` as the rest of `/customers`, and respect `search`/`status` identically to `findAll` so the export matches what the user is currently looking at.
- No pagination cap on the export at this time — accepted limitation at current data volume.
- CSV field-escaping (commas, quotes, newlines in `razonSocial`/`domicilio`) must be handled correctly.

## Ready for Proposal
Yes.
