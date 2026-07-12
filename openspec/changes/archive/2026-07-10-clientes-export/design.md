# Design: Export button in /clientes

## Technical Approach

Add one guarded backend route (`GET /customers/export`) and one secondary header button on the `/clientes` list. The backend reuses `findAll`'s exact filter semantics by extracting the `where`-building logic that is currently inline in `CustomersService.findAll` into a single shared, module-level pure function, so the export and the paginated list can never drift. The export runs one unpaginated `findMany`, maps rows to a fixed 6-column set, and hand-builds an RFC-4180-escaped CSV string (BOM-prefixed) returned as `text/csv` via `@Header()` decorators — no `@Res()`, matching this controller's "return a plain value" style. The frontend adds `exportCustomers()` to `lib/customers.ts` (a non-JSON fetch path resolving to a `Blob`) and a Blob-based download trigger with a loading/disabled state and toast error handling in `page.tsx`.

No data model change. No new npm dependency in either `package.json`. No change to `GET /customers` behavior — the extraction is a pure refactor that leaves `findAll`'s output byte-for-byte identical.

The only genuinely novel design decisions are (1) how the shared `where`-builder is shaped so both callers use one code path, (2) the response-emission mechanism (`@Header()` + returned string vs `@Res()`), and (3) the route-registration order gotcha (`export` must be declared before `:id`). All three are documented in Architecture Decisions.

## Data Model

No change. `CUSTOMER_SELECT` already shapes exactly the fields the export needs (`razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, `domicilio`, `activo`). No migration, no schema edit.

## Backend

### Shared `where`-builder — `customers.service.ts` (the filter-parity resolution)

This directly resolves the proposal's flagged `Filter-parity coupling` risk. Today `findAll` builds `searchWhere` and `where` inline (lines 64–81). Extract that construction into a **module-level pure function** (same placement/style as the existing module-level `normalizeOptional` and `uniqueTargetIncludes` helpers) so both `findAll` and the new export call the identical code path — not a copy.

```ts
type CustomerFilter = { search?: string; status?: CustomerStatusFilter };

// Single source of truth for cliente list/export filtering. Returns BOTH
// pieces because findAll needs `searchWhere` on its own for the
// status-independent activeCount, while `where` is the combined filter used
// by the paginated list, its count, and the export. The MySQL collation note
// (Prisma `mode: 'insensitive'` is unsupported on MySQL; `contains` is already
// case-insensitive under utf8mb4 _*_ci) lives here now, next to the OR block.
function buildCustomerWhere(filter: CustomerFilter): {
  searchWhere: Prisma.ClienteWhereInput;
  where: Prisma.ClienteWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';

  const searchWhere: Prisma.ClienteWhereInput = term
    ? {
        OR: [
          { razonSocial: { contains: term } },
          { identificacion: { contains: term } },
          { telefono: { contains: term } },
        ],
      }
    : {};

  const where: Prisma.ClienteWhereInput = {
    ...searchWhere,
    ...(status === 'activo'
      ? { activo: true }
      : status === 'inactivo'
        ? { activo: false }
        : {}),
  };

  return { searchWhere, where };
}
```

`findAll` is rewritten to consume it (behavior unchanged):

```ts
async findAll(query: ListCustomersQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const { searchWhere, where } = buildCustomerWhere(query);

  const [data, total, activeCount] = await this.prisma.$transaction([
    this.prisma.cliente.findMany({
      where, select: CUSTOMER_SELECT, orderBy: { id: 'asc' },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    this.prisma.cliente.count({ where }),
    this.prisma.cliente.count({ where: { ...searchWhere, activo: true } }),
  ]);

  return { data, total, activeCount };
}
```

Why return `{ searchWhere, where }` and not just `where`: `findAll`'s `activeCount` pill deliberately honors `search` but ignores `status` (existing lines 92–95), so it needs `searchWhere` separately. The export only ever uses `where`. Returning both keeps the function the single owner of filter construction without forcing the export to know about the `activeCount` special case.

### Export service method — `customers.service.ts`

```ts
async exportToCsv(filter: CustomerFilter): Promise<string> {
  const { where } = buildCustomerWhere(filter);
  const rows = await this.prisma.cliente.findMany({
    where,
    select: CUSTOMER_SELECT,
    orderBy: { id: 'asc' }, // same ordering as the list for predictable output
  });
  return buildCustomersCsv(rows);
}
```

Single unpaginated query — same `where`, same `orderBy` as `findAll`, minus `skip`/`take`. By the `Filters match GET /customers semantics` scenario, the matched set is provably identical because both paths call `buildCustomerWhere` with the same inputs.

### CSV serialization — `customers.service.ts` (module-level helpers)

Two small local helpers, no dependency. Column order is fixed by spec.

```ts
const CSV_HEADERS = [
  'Razón Social',
  'Tipo de identificación',
  'Identificación',
  'Teléfono',
  'Domicilio',
  'Estado',
] as const;

// RFC 4180: quote a field only if it contains a comma, a double-quote, CR, or
// LF; double any embedded double-quote. null/undefined render as empty.
function csvCell(value: string | null | undefined): string {
  const s = value ?? '';
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCustomersCsv(rows: /* CUSTOMER_SELECT[] */ CustomerRow[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(csvCell).join(','));
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.razonSocial),
        csvCell(ID_TYPE_LABELS[r.tipoIdentificacion as IdType] ?? r.tipoIdentificacion),
        csvCell(r.identificacion),
        csvCell(r.telefono),
        csvCell(r.domicilio),
        csvCell(r.activo ? 'Activo' : 'Inactivo'),
      ].join(','),
    );
  }
  // CRLF row terminator (RFC 4180 / Excel-friendly). Prepend the UTF-8 BOM as a
  // single ﻿ char — Express serializes the returned string as UTF-8, so
  // this char is emitted as the 3-byte EF BB BF sequence at the start of the body.
  return '﻿' + lines.join('\r\n');
}
```

- `Estado`: `activo ? 'Activo' : 'Inactivo'` — satisfies the `Estado column renders Activo/Inactivo` scenario.
- `Tipo de identificación`: rendered through the existing server-side `ID_TYPE_LABELS` (`dni → DNI`, etc.) so the CSV matches what the user sees in the table's Tipo badge, honoring the feature's "export reflects exactly what the user is looking at" intent. This is a minor, non-spec-mandated choice (the spec only fixes the header text and the `Estado` transform); if raw codes are ever preferred it's a one-line switch to `csvCell(r.tipoIdentificacion)`. Documented in Architecture Decisions.
- Nullable fields (`identificacion`, `telefono`, `domicilio` are `string | null`) collapse to `''` via `csvCell`.
- BOM covers the `UTF-8 BOM precedes the CSV content` scenario; `csvCell` covers all three escaping scenarios (comma, embedded quote, newline) for every column including `razonSocial`/`domicilio`.

### Export query DTO — `dto/export-customers-query.dto.ts` (new)

A dedicated DTO with only `search` + `status` (no `page`/`pageSize`), reusing the same validation as `ListCustomersQueryDto`'s corresponding fields. With the app's global `whitelist: true`, this also strips any stray `page`/`pageSize` a client might send.

```ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CustomerStatusFilter } from './list-customers-query.dto';

export class ExportCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: CustomerStatusFilter = 'all';
}
```

### Controller route — `customers.controller.ts`

```ts
@Get('export')
@Header('Content-Type', 'text/csv; charset=utf-8')
@Header('Content-Disposition', 'attachment; filename="clientes.csv"')
async export(@Query() query: ExportCustomersQueryDto): Promise<string> {
  return this.customersService.exportToCsv(query);
}
```

**Route order gotcha (critical):** `@Get('export')` MUST be declared **before** the existing `@Get(':id')`. NestJS/Express match routes top-to-bottom; if `:id` comes first, `GET /customers/export` matches `:id` with `id = "export"`, hits `ParseIntPipe`, and returns 400 instead of the CSV. Place the export handler immediately after `@Get()` and above `@Get(':id')`. This is the one ordering constraint the apply phase must not get wrong.

The class-level `@UseGuards(JwtAuthGuard)` already covers this route — satisfies the `Missing or invalid token is rejected` (401) scenario with no extra decorator. Add `Header` and `Query` to the existing `@nestjs/common` import.

## Frontend

### `client/app/lib/customers.ts` — `exportCustomers()`

New typed function. Because the success body is CSV (not JSON), it needs its own fetch path and must NOT go through `handleJsonResponse` (which unconditionally calls `res.json()`). On success it resolves to a `Blob`; on failure it parses the Nest JSON error body — Nest still returns JSON on errors even when the success content-type is CSV — and throws, matching the module's `throw-on-failure` convention.

```ts
export interface ExportCustomersParams {
  search?: string;
  status?: 'all' | 'activo' | 'inactivo';
}

export async function exportCustomers(params: ExportCustomersParams): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();

  const res = await fetch(`${API_BASE_URL}/customers/export${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeader() },
  });

  if (!res.ok) {
    // Non-JSON success path — but Nest error bodies are still JSON, so read the
    // message defensively (mirrors handleJsonResponse's error branch) rather
    // than forcing the whole response through it.
    const message = await res
      .json()
      .then((body) => body?.message)
      .catch(() => undefined);
    throw new Error(message || 'No se pudo exportar los clientes');
  }

  return res.blob();
}
```

Matches existing conventions: `URLSearchParams` query assembly like `listCustomers`, `getAuthHeader()` Bearer header, `res.ok` check, Spanish fallback message. Satisfies the `exportCustomers attaches auth header and returns a Blob` and `Failed export request throws` scenarios.

### `client/app/(dashboard)/clientes/page.tsx` — button + download trigger

**Header layout.** Wrap the top-right actions in a flex row so the secondary export button sits next to the primary create link:

```tsx
<div className="flex items-center gap-3">
  <button
    type="button"
    onClick={handleExport}
    disabled={exporting}
    className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {exporting && (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" aria-hidden="true" />
    )}
    {exporting ? 'Exportando...' : 'Exportar'}
  </button>
  <Link href="/clientes/nuevo" className="rounded-lg bg-gradient-to-r from-rose-500 to-red-500 ...">
    Nuevo cliente
  </Link>
</div>
```

The rose gradient stays on `Nuevo cliente` only; `Exportar` uses the stone outline/secondary style — satisfies the `Export button uses secondary styling` scenario.

**State + handler.** Add one boolean `exporting` state (mirrors the single-purpose `togglingId`/`loading` pattern already in the file). Errors surface via the existing `showError` toast from `lib/alerts.ts` — the same mechanism `handleToggleActivo` already uses for async-action failures — so a failed export never crashes the page and needs no new inline error region.

```tsx
const [exporting, setExporting] = useState(false);

const handleExport = async () => {
  setExporting(true);
  try {
    // Use the APPLIED filters (`search`, `statusFilter`) — not `searchInput` —
    // so the CSV matches exactly the set the list is currently showing.
    const blob = await exportCustomers({
      search: search || undefined,
      status: statusFilter,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError(
      'No se pudo exportar',
      err instanceof Error ? err.message : 'No se pudo conectar con el servidor.',
    );
  } finally {
    setExporting(false);
  }
};
```

Add `exportCustomers` to the existing `../../lib/customers` import. `showError` is already imported. Filter source is the debounced/applied `search` and `statusFilter` (not `searchInput`) so the export mirrors the on-screen result set precisely. Satisfies `Button shows loading/disabled state during export`, `Export button downloads CSV with current filters`, `Successful export triggers a file download` (createObjectURL → synthetic `<a download>` click → revoke), and `Failed export shows an error without crashing`.

## Architecture Decisions

### Decision: extract one shared module-level `buildCustomerWhere` returning `{ searchWhere, where }`
**Choice**: pull `findAll`'s inline `searchWhere`/`where` construction into a pure module-level function both `findAll` and `exportToCsv` call.
**Alternatives**: (a) copy the `where` block into the export method — **rejected**: this is exactly the drift the proposal flagged; two copies will diverge the first time a search field is added. (b) return only `where` — **rejected**: `findAll`'s `activeCount` needs `searchWhere` in isolation (search honored, status ignored), so a `where`-only helper would force `findAll` to rebuild `searchWhere` separately, reintroducing partial duplication. (c) a private instance method — **workable but** the file's existing filter-adjacent helpers (`normalizeOptional`, `uniqueTargetIncludes`) are module-level pure functions; matching that keeps the module consistent and makes the builder trivially unit-testable.
**Rationale**: one code path = provable filter parity (`Filters match GET /customers semantics`), and returning both pieces preserves `findAll`'s existing `activeCount` behavior with zero output change.

### Decision: emit CSV via `@Header()` decorators + returned string, not `@Res()`
**Choice**: static `@Header('Content-Type', ...)` / `@Header('Content-Disposition', ...)` on the route and `return csvString`.
**Alternatives**: inject `@Res()` and call `res.set(...).send(...)` — **rejected**: this controller (and the whole codebase) has **zero** `@Res()` usage; every handler returns a plain value and lets Nest serialize. Opting into `@Res()` passthrough mode bypasses Nest's response pipeline (interceptors, the standard flow) for no benefit here — both header values are static and known at compile time, which is precisely `@Header()`'s use case. The BOM and CSV body travel fine as a returned UTF-8 string.
**Rationale**: least-surprise, matches the existing "return objects/arrays" style, keeps the guard/interceptor pipeline intact. `@Res()` would only be justified if the filename were dynamic (it is not — always `clientes.csv`).

### Decision: render `Tipo de identificación` through `ID_TYPE_LABELS` (DNI/CUIT/CUIL), not raw codes
**Choice**: map `tipoIdentificacion` via the existing server-side `ID_TYPE_LABELS` in the CSV cell.
**Alternatives**: emit the raw `dni`/`cuit`/`cuil` string — **acceptable per spec** (the spec only fixes the header text and the `Estado` transform, leaving Tipo's value unspecified) but **not chosen**: the list table shows the uppercased label badge, and the feature's stated intent is that the export reflect what the user is looking at. Lowercase codes would read as less polished in a business-facing file.
**Rationale**: consistency with the on-screen table and the export's purpose; the fallback `?? r.tipoIdentificacion` keeps unknown/future codes from silently blanking. One-line reversible if raw codes are ever wanted.

### Decision: route order — `@Get('export')` before `@Get(':id')`
**Choice**: declare the export handler above the parameterized `:id` handler.
**Rationale**: Express matches in declaration order; a literal `export` segment would otherwise be captured by `:id` and rejected by `ParseIntPipe` (400). This is a correctness constraint, not a preference — called out so apply/verify enforce it.

## Data Flow

    /clientes page ──[click "Exportar"]──▶ handleExport (setExporting true)
        │
        ├─ exportCustomers({ search, status: statusFilter })  // applied filters, not searchInput
        │      └─▶ GET /customers/export?search&status ──JwtAuthGuard──▶ CustomersController.export
        │              └─▶ CustomersService.exportToCsv(filter)
        │                     └─ buildCustomerWhere(filter) ─── SAME builder as findAll ──▶ where
        │                     └─ prisma.cliente.findMany({ where, CUSTOMER_SELECT, orderBy id asc })  // no skip/take
        │                     └─ buildCustomersCsv(rows) → '﻿' + header + CRLF rows
        │              └─ @Header text/csv + Content-Disposition attachment; filename="clientes.csv"
        │      ◀── Response (Blob)
        └─ URL.createObjectURL(blob) → synthetic <a download="clientes.csv">.click() → URL.revokeObjectURL → setExporting false
             (on throw: showError toast, page stays intact)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/src/customers/customers.service.ts` | Modify | Extract `buildCustomerWhere` (module-level); rewrite `findAll` to use it; add `exportToCsv(filter)`, `buildCustomersCsv`, `csvCell`, `CSV_HEADERS`; import `ID_TYPE_LABELS`/`IdType` from `./customer.constants` |
| `server/src/customers/customers.controller.ts` | Modify | Add `@Get('export')` **above** `@Get(':id')` with two `@Header()` decorators; import `Header`, `Query` (Query already imported), `ExportCustomersQueryDto` |
| `server/src/customers/dto/export-customers-query.dto.ts` | Create | `ExportCustomersQueryDto` (`search` + `status` only) |
| `client/app/lib/customers.ts` | Modify | Add `ExportCustomersParams` + `exportCustomers()` (non-JSON Blob fetch path) |
| `client/app/(dashboard)/clientes/page.tsx` | Modify | Wrap header actions in a flex row; add secondary `Exportar` button + `exporting` state + `handleExport` (Blob download + `showError` on failure); import `exportCustomers` |

No `package.json` change (server or client). No schema/migration change. No other section touched (`marcas`/`vehiculos`/`usuarios`/`colores`).

## Testing Strategy

No automated harness is assumed for this change (matching the `clientes-crud` precedent); verification is manual/e2e against a reachable DB. If `sdd-init` reports a strict-TDD capability, `sdd-apply` follows it instead.

| Layer | What | Approach |
|-------|------|----------|
| Manual/e2e | 401 without a Bearer token | `GET /customers/export` with no `Authorization` header → 401, no CSV |
| Manual/e2e | Full set, not one page | With >1 page of matching clientes, `GET /customers/export` returns every matching row |
| Manual/e2e | Filter parity | Same `search`/`status` to `GET /customers` (all pages) and `/export` → identical cliente set |
| Manual/e2e | Response headers | `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="clientes.csv"` |
| Manual/e2e | Column order + header row | First row = `Razón Social,Tipo de identificación,Identificación,Teléfono,Domicilio,Estado`; data rows follow |
| Manual/e2e | Estado rendering | `activo:true` → `Activo`, `activo:false` → `Inactivo` |
| Manual/e2e | BOM present | Raw body begins with EF BB BF before the header row (open in Excel → accents intact) |
| Manual/e2e | Escaping | Cliente with `,` / `"` / newline in `razonSocial`/`domicilio` → field quoted, embedded `"` doubled, no column/row shift |
| Manual/e2e | Route order | `GET /customers/export` returns CSV (not a 400 from `:id`+`ParseIntPipe`) |
| Manual/e2e | Frontend flow | Click `Exportar` → button disables + spinner; file downloads as `clientes.csv` reflecting current `search`/`statusFilter`; simulated failure → `showError` toast, page intact |

## Migration / Rollout

No DB migration. Backend deploy adds one route + service method; frontend deploy adds one button. Deploy order is safe either way: an older frontend simply never calls the new route, and the new route is additive. **Rollback** (mechanical, additive-only): remove `exportToCsv`/CSV helpers and revert `findAll` to inline `where` (or keep `buildCustomerWhere` — it is behavior-neutral), remove the export route + DTO, remove `exportCustomers` and the `Exportar` button. Nothing else references any of it.

## Open Questions / Assumptions

- [ ] `Tipo de identificación` is rendered as the uppercased label (DNI/CUIT/CUIL) to match the table; the spec leaves this cell's value format unspecified. If raw codes are preferred, switch `csvCell(ID_TYPE_LABELS[...] ?? ...)` to `csvCell(r.tipoIdentificacion)` — one line.
- [ ] No row cap on export (accepted limitation at current data scale per the proposal). Streaming/capping is a future change if volume grows.
- [ ] Keeping `buildCustomerWhere` on rollback is harmless (behavior-neutral); listed as removable only for a strict revert to the pre-change file shape.
