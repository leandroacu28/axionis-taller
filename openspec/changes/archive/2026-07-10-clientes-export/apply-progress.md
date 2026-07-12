# Apply Progress: Export button in /clientes

Status: All Phase 1-5 code tasks (20/20) implemented in a single pass. Phase 6 (6/7 items) verified statically; 1 item (6.6) requires a human browser session and was NOT performed.

## What was implemented

### Backend (`server/src/customers/`)

- **`customers.service.ts`**:
  - Extracted the inline `searchWhere`/`where` construction from `findAll` into a new module-level pure function `buildCustomerWhere(filter: CustomerFilter)`, placed alongside the existing `normalizeOptional`/`uniqueTargetIncludes` helpers. Preserves the MySQL `contains`-collation comment.
  - Added `export type CustomerFilter = { search?: string; status?: CustomerStatusFilter }`.
  - Rewrote `findAll` to destructure `{ searchWhere, where }` from `buildCustomerWhere(query)`; the `$transaction` (paginated `findMany`, `count`, `activeCount` via `searchWhere`) is otherwise untouched.
  - Added `async exportToCsv(filter: CustomerFilter): Promise<string>` — calls `buildCustomerWhere`, runs one `findMany` with `CUSTOMER_SELECT` and `orderBy: { id: 'asc' }`, no `skip`/`take`.
  - Added `CSV_HEADERS`, `csvCell()` (RFC 4180 escaping: quotes on comma/quote/CR/LF, doubles embedded quotes, null/undefined → `''`), and `buildCustomersCsv()` (header row + CRLF-joined data rows, `tipoIdentificacion` mapped through `ID_TYPE_LABELS` imported from `./customer.constants`, `activo` → `Activo`/`Inactivo'`, UTF-8 BOM prepended).
- **`customers.controller.ts`**: added `Header` to the `@nestjs/common` import and `ExportCustomersQueryDto` import; added the `@Get('export')` handler with `@Header('Content-Type', 'text/csv; charset=utf-8')` and `@Header('Content-Disposition', 'attachment; filename="clientes.csv"')`, placed immediately after `@Get()` (`findAll`) and before `@Get(':id')` (`findOne`) per the route-order constraint. `JwtAuthGuard` is already applied at the class level, so it covers this route with no extra decorator.
- **`dto/export-customers-query.dto.ts`** (new): `ExportCustomersQueryDto` with optional `search: string` and optional `status: CustomerStatusFilter` (`@IsIn(['all', 'activo', 'inactivo'])`, default `'all'`), reusing `CustomerStatusFilter` from `list-customers-query.dto.ts`.

### Frontend

- **`client/app/lib/customers.ts`**: added `ExportCustomersParams` and `exportCustomers(params): Promise<Blob>` — builds a `URLSearchParams` query (`search`/`status` only), fetches `GET /customers/export` with `getAuthHeader()`, defensively reads the JSON error body's `message` on `!res.ok` and throws a `Spanish` fallback message, otherwise resolves `res.blob()`. Deliberately does not go through `handleJsonResponse` since the success body is CSV, not JSON.
- **`client/app/(dashboard)/clientes/page.tsx`**:
  - Imported `exportCustomers`.
  - Added `const [exporting, setExporting] = useState(false)`.
  - Wrapped the header's top-right actions in `<div className="flex items-center gap-3">` with the new secondary/outline "Exportar" button (using this codebase's established secondary-button class pattern, matching `BrandFormModal.tsx`'s cancel button: `rounded-lg border border-stone-200 ... text-stone-600 hover:bg-stone-50`) placed before the existing rose-gradient "Nuevo cliente" link, which is untouched.
  - Added `handleExport`: sets `exporting`, calls `exportCustomers({ search: search || undefined, status: statusFilter })` — using the **applied** `search`/`statusFilter` state, not the debounced `searchInput` — creates an object URL from the Blob, triggers a synthetic `<a download="clientes.csv">` click, revokes the object URL, and on failure calls the existing `showError` toast; `setExporting(false)` runs in a `finally` block.

## Type checking

Ran `npx tsc --noEmit` in both `client/` and `server/` — both exit 0, no errors. No `npm run dev`/`start:dev` or DB migration was run, per instructions.

## Files touched

- `server/src/customers/customers.service.ts` (modify)
- `server/src/customers/customers.controller.ts` (modify)
- `server/src/customers/dto/export-customers-query.dto.ts` (create)
- `client/app/lib/customers.ts` (modify)
- `client/app/(dashboard)/clientes/page.tsx` (modify)
- `openspec/changes/clientes-export/tasks.md` (checkboxes updated)

No `package.json` change in either project (confirmed via `git status`/`git diff` — `client/package.json` shows as modified in the working tree but that change predates and is unrelated to this session; this session never wrote to either `package.json`). No file under `marcas`, `vehiculos`, `usuarios`, or `colores` was touched.

## Phase 6 (Manual Verification) — what was checked statically vs. what needs a human

I have no way to run the NestJS server or click a browser button in this environment, and was explicitly told not to start `start:dev`/`dev`. So Phase 6 was performed as **static code verification**, not live HTTP/browser testing. Being explicit about the gap:

- **6.1 (401 without token)** — verified by reading code, not by an actual request: `@UseGuards(JwtAuthGuard)` is a class-level decorator on `CustomersController` and the new `export` handler has no route-level guard override, so it inherits the same guard as every other route on this controller (identical to how `GET /customers` and `GET /customers/:id` already behave). Not executed against a running server.
- **6.2 (full set, not one page)** — verified by reading code: `exportToCsv` calls `prisma.cliente.findMany({ where, select: CUSTOMER_SELECT, orderBy: { id: 'asc' } })` with no `skip`/`take`, and `where` comes from the exact same `buildCustomerWhere(filter)` function `findAll` uses for its paginated query and its `count`. Since both callers share one function with the same inputs, the matched row sets are provably identical by construction — I did not run this against a seeded DB to observationally confirm it.
- **6.3 (headers/BOM/columns/Estado)** — verified by reading code: `@Header()` decorators set the exact `Content-Type`/`Content-Disposition` strings from the spec; `CSV_HEADERS.map(csvCell).join(',')` produces exactly `Razón Social,Tipo de identificación,Identificación,Teléfono,Domicilio,Estado` (none of the header strings contain `,`/`"`/CR/LF, so `csvCell` passes them through unquoted); `buildCustomersCsv` prepends the BOM character before joining; `Estado` is `r.activo ? 'Activo' : 'Inactivo'`. Not inspected as raw bytes of an actual HTTP response.
- **6.4 (escaping)** — verified by reading code: `csvCell`'s regex `/[",\r\n]/` triggers quoting on comma, double-quote, CR, or LF, and `.replace(/"/g, '""')` doubles embedded quotes — this is applied uniformly to every column including `razonSocial` and `domicilio`. Not exercised against an actual DB row containing those characters.
- **6.5 (route order / `:id` not shadowed)** — verified by reading `customers.controller.ts`: `@Get('export')` is declared directly after `@Get()` and before `@Get(':id')`, matching the required order. Not confirmed by an actual `GET /customers/1` request against a running server.
- **6.6 (browser click-through flow)** — **NOT performed at all.** This requires a running frontend + backend and a real browser click to confirm the loading/disabled state, the actual file download, and the `showError` toast on a simulated failure (e.g. expired token). I have no tool to drive a browser in this environment. **A human needs to run both servers and manually click "Exportar" on `/clientes`** to close this out.
- **6.7 (no new dependency, no other section touched)** — verified via `git status`/`git diff` inspection: neither `package.json` was written by this session's edits, and only `customers`-related backend files plus `client/app/lib/customers.ts` and `client/app/(dashboard)/clientes/page.tsx` were modified.

## Risks / deviations from design

None identified. Implementation follows the design document's code samples closely (module placement, function signatures, CSV escaping logic, route order, `@Header()` usage). One minor adaptation: the secondary button class list uses this codebase's actual established outline-button pattern (`border-stone-200 ... text-stone-600 hover:bg-stone-50`, matching `BrandFormModal.tsx`'s cancel button) rather than the slightly different `border-stone-300 ... text-stone-700` classes shown in the design doc's illustrative snippet — per the ground rules instruction to check existing pages for the exact class pattern before inventing one.
