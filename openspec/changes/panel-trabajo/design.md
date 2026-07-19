# Design: Panel de Trabajo (work board) for Órdenes de Trabajo

## Technical Approach

Add one dedicated aggregated read endpoint `GET /ordenes-trabajo/panel` and one new frontend
route `/ordenes-trabajo/panel`, both additive — the existing list endpoint (`GET /ordenes-trabajo`),
the list page, and `buildOrdenTrabajoWhere` are untouched. The endpoint accepts the Panel filters
(estado, mecanicoId, prioridad, a `fechaIngreso` date range, plus the client's local "today"), builds
a single filtered `where`, and returns — in one `$transaction`, mirroring `findAll`'s per-estado
`counts` precedent — a `stats` block, a `mecanicosTrabajando` figure, the full (capped) filtered
order set, and a `meta` block carrying the cap signal. Because stats and board are derived from the
**same** `where`, the numbers and the visible cards cannot disagree (satisfies D3).

On the frontend, a client component owns filter state and re-fetches on any filter change (the same
`useState`/`useEffect` pattern the list page already uses — no data-fetching library is introduced).
The page decomposes into a container plus three presentational components (stats row, filter bar,
Kanban board). No schema/migration change, no drag-and-drop dependency, no shared type package.

---

## 1. Backend

### 1.1 Route & controller method ordering (route-collision fix)

Nest resolves routes at the same path depth in **controller declaration order** (Express under the
hood). `@Get(':id')` is a param segment that will match the literal string `panel`; if `panel` is
declared after `:id`, a request to `/ordenes-trabajo/panel` is captured by `findOne`, where
`ParseIntPipe` then rejects it with `400 "Validation failed (numeric string is expected)"` — a
broken endpoint, not a silent mis-route, but broken all the same.

**Fix:** declare the new `@Get('panel')` handler **before** `@Get(':id')`. Exact placement in
`OrdenesTrabajoController` — immediately after `findAll` and before `findOne`:

```ts
@Get()
async findAll(@Query() query: ListOrdenesTrabajoQueryDto) { … }   // unchanged

@Get('panel')                                                     // NEW — literal, must precede :id
async panel(@Query() query: PanelOrdenesTrabajoQueryDto) {
  return this.ordenesTrabajoService.panel(query);
}

@Get(':id')                                                       // unchanged, now second
async findOne(@Param('id', ParseIntPipe) id: number) { … }
```

Guarded by the class-level `@UseGuards(JwtAuthGuard)` already present — no per-route guard, no
`RolesGuard` (D8). This is the same literal-before-param discipline the controller already applies
implicitly (its only literal routes are `@Get()` and the nested `:id/detalles` paths, so the
collision has not surfaced before).

### 1.2 Query DTO — `PanelOrdenesTrabajoQueryDto`

New file `server/src/ordenes-trabajo/dto/panel-ordenes-trabajo-query.dto.ts`. Reuses the existing
`EstadoFilter`/`PrioridadFilter` types and decorator conventions from
`list-ordenes-trabajo-query.dto.ts`. It carries **no** `page`/`pageSize` (the board is unpaginated,
bounded by the cap) and **no** `search`/`status` (not part of the Panel filter bar).

```ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches } from 'class-validator';
import { Estado, Prioridad } from '@prisma/client';
import { EstadoFilter, PrioridadFilter } from './list-ordenes-trabajo-query.dto';

// Date-only params (yyyy-mm-dd). A strict date-only shape is required so the
// service can safely append 'T00:00:00.000Z' to build UTC day boundaries
// (see 1.6). @IsDateString would also accept full ISO datetimes, which would
// break that concatenation — hence the explicit regex.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class PanelOrdenesTrabajoQueryDto {
  @IsOptional()
  @IsIn(['all', ...Object.values(Estado)])
  estado?: EstadoFilter = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mecanicoId?: number;

  @IsOptional()
  @IsIn(['all', ...Object.values(Prioridad)])
  prioridad?: PrioridadFilter = 'all';

  // Resolved date window on fechaIngreso, inclusive calendar days. Both-or-neither
  // (enforced in the service). Absent → unbounded date range (defensive default;
  // the client always sends a resolved range, so this only triggers on a raw call).
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fechaDesde debe tener formato yyyy-mm-dd' })
  fechaDesde?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'fechaHasta debe tener formato yyyy-mm-dd' })
  fechaHasta?: string;

  // The client's LOCAL calendar "today", used only for the "órdenes del día"
  // sub-count. The client owns what day "today" is (its timezone), never the
  // server (see ADR-3). Absent → delDia is 0.
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'hoy debe tener formato yyyy-mm-dd' })
  hoy?: string;
}
```

Cross-field rules validated in the **service** (mirrors how the service already raises
`BadRequestException` for business rules, rather than a custom class-validator):
- if exactly one of `fechaDesde`/`fechaHasta` is present → `BadRequestException`
- if `fechaDesde > fechaHasta` (string compare is safe for `yyyy-mm-dd`) → `BadRequestException`

**Preset resolution lives on the client, not here** (see ADR-2 / 3.4). The DTO is deliberately
preset-agnostic: it never sees `hoy`/`semana`/`mes`/`personalizado`, only concrete resolved dates.

### 1.3 Response shape

```ts
interface PanelResponse {
  stats: {
    delDia: number;              // filtered set ∩ fechaIngreso == hoy
    pendiente: number;           // filtered set ∩ estado = pendiente
    enProceso: number;           // filtered set ∩ estado = en_proceso
    terminado: number;           // filtered set ∩ estado = terminado
    mecanicosTrabajando: number; // distinct mecanicoId, estado = en_proceso, within filtered set
  };
  data: OrdenTrabajoListItem[];  // same mapped shape as the list endpoint (mapOrdenTrabajo)
  meta: {
    total: number;               // full count matching the filters (may exceed data.length)
    cap: number;                 // the hard cap constant (500)
    capped: boolean;             // total > cap → data is the first `cap` rows only
  };
}
```

`data` reuses `ORDEN_TRABAJO_SELECT` + `mapOrdenTrabajo`, so each item is the identical
`OrdenTrabajoListItem` the board cards already know how to render (cliente, vehículo, mecánico,
prioridad, `tiposServicio`). No new select, no new mapper.

Note: there is **no** `cancelado` figure in `stats` even though the board has a `cancelado` column —
the five figures are fixed by the proposal (del día, pendiente, en proceso, terminado, mecánicos
trabajando). The `cancelado` column is populated purely from `data` (client-side bucketing), so no
extra count is needed.

### 1.4 Hard cap (resolves D5)

**`PANEL_ORDENES_CAP = 500`** (module-level constant in the service).

*Rationale:* a workshop's live (`activo: true`) order set within any sane window — even "mes" —
is realistically dozens to low hundreds. 500 gives generous headroom while bounding worst-case
payload (~500 × ~1 KB card JSON ≈ 0.5 MB) and DOM cost (4 columns × up to 500 cards, which React
renders acceptably without virtualization). Crossing 500 signals a filter that is too broad (e.g. an
unbounded raw call) rather than a real operational need, and the "showing first N" banner tells the
operator to narrow the window. A single constant is trivially tunable later.

**Capped signal:** `meta.capped` is `true` when `total > cap`; `data` then holds exactly the first
`cap` rows by the query's `orderBy`. The frontend renders a banner (§3.5) — never silent truncation.

### 1.5 Service method & Panel-specific where builder

New method `panel(query)` on `OrdenesTrabajoService`, plus a Panel-local
`buildPanelOrdenTrabajoWhere(query)` helper (not a reuse of `buildOrdenTrabajoWhere` — see ADR-1).

```ts
const PANEL_ORDENES_CAP = 500;

function buildPanelOrdenTrabajoWhere(query: PanelOrdenesTrabajoQueryDto): Prisma.OrdenTrabajoWhereInput {
  const estado = query.estado ?? 'all';
  const prioridad = query.prioridad ?? 'all';

  return {
    activo: true,                                   // board = live work only (ADR-1, D4 convention)
    ...(estado !== 'all' ? { estado } : {}),
    ...(prioridad !== 'all' ? { prioridad } : {}),
    ...(query.mecanicoId ? { mecanicoId: query.mecanicoId } : {}),
    ...(query.fechaDesde && query.fechaHasta ? { fechaIngreso: dateRange(query.fechaDesde, query.fechaHasta) } : {}),
  };
}
```

`panel(query)` then:
1. Validates the date cross-field rules (§1.2).
2. Builds `where = buildPanelOrdenTrabajoWhere(query)`.
3. Runs the `$transaction` in §1.6.
4. Maps `data` through `mapOrdenTrabajo`, computes `capped`, returns `PanelResponse`.

**Per-estado sub-counts use `AND`-composition, not object spread.** Spreading
`{ ...where, estado: 'pendiente' }` would let the sub-count's `estado` **override** a user's estado
filter, breaking D3. Instead each sub-count ANDs an extra clause onto the full `where`:

```ts
const withEstado = (e: Estado): Prisma.OrdenTrabajoWhereInput => ({ AND: [where, { estado: e }] });
```

So if the user filtered `estado = en_proceso`, `withEstado('pendiente')` becomes
`{ AND: [{ …, estado: 'en_proceso' }, { estado: 'pendiente' }] }` → contradictory → `0`. This is
exactly the "selecting a single estado scopes the whole board and its figures" behavior D3 mandates,
and it is the key difference from `findAll`'s counts (which deliberately **ignore** the estado
filter). Documented as such so a future reader does not "fix" it back to the `findAll` pattern.

### 1.6 Prisma queries inside the `$transaction`

Array form (like `findAll`), seven operations, one round trip:

```ts
const where = buildPanelOrdenTrabajoWhere(query);
const delDiaWhere = query.hoy
  ? { AND: [where, { fechaIngreso: dateRange(query.hoy, query.hoy) }] }
  : { id: -1 }; // no `hoy` → delDia = 0 (impossible predicate, cheap)

const [rows, total, delDia, pendiente, enProceso, terminado, mecanicos] =
  await this.prisma.$transaction([
    this.prisma.ordenTrabajo.findMany({
      where,
      select: ORDEN_TRABAJO_SELECT,
      orderBy: [{ prioridad: 'desc' }, { fechaIngreso: 'desc' }, { id: 'desc' }],
      take: PANEL_ORDENES_CAP,
    }),
    this.prisma.ordenTrabajo.count({ where }),
    this.prisma.ordenTrabajo.count({ where: delDiaWhere }),
    this.prisma.ordenTrabajo.count({ where: { AND: [where, { estado: 'pendiente' }] } }),
    this.prisma.ordenTrabajo.count({ where: { AND: [where, { estado: 'en_proceso' }] } }),
    this.prisma.ordenTrabajo.count({ where: { AND: [where, { estado: 'terminado' }] } }),
    this.prisma.ordenTrabajo.groupBy({
      by: ['mecanicoId'],
      where: { AND: [where, { estado: 'en_proceso' }] },
    }),
  ]);
```

- **`orderBy`:** `prioridad` desc (Prisma orders the enum by declared order `normal < alta < urgente`,
  so desc surfaces `urgente` first), then `fechaIngreso` desc, then `id` desc as a **stable tiebreak**
  so the cap boundary is deterministic across calls. Because the frontend buckets `rows` by estado,
  each column inherits this order (urgent-then-recent). When capped, the rows that fall off are the
  lowest-priority / oldest — the least operationally urgent.
- **`mecanicosTrabajando = mecanicos.length`** — `groupBy(['mecanicoId'])` yields one row per distinct
  mechanic that has ≥1 `en_proceso` order in the filtered set; `.length` is the distinct count. Chosen
  over `findMany({ distinct })` because `groupBy` expresses "distinct count" directly and returns the
  minimal payload (D4). `activo: true` is already baked into `where`, so soft-deactivated orders never
  inflate it.
- **`capped = total > PANEL_ORDENES_CAP`**; `data = rows.map(mapOrdenTrabajo)`.

**Edge case — mecánico filter vs. `mecanicosTrabajando` (design note, expected behavior):** when a
specific `mecanicoId` is selected, `mecanicosTrabajando` collapses to `0` or `1` (that one mechanic,
iff they have an `en_proceso` order in range). This is **not** a bug — it is the direct consequence of
D3's shared filtered set: every figure is scoped by every active filter. Same holds for the estado
filter (§1.5). Surfaced here so it is not mistaken for a miscount at review.

### 1.7 Date-range resolution & timezone convention (resolves the `fechaIngreso` TZ risk)

**Storage reality (verified):** `fechaIngreso` is written from an `<input type="date">` value
(`yyyy-mm-dd`), validated by `@IsDateString()`, then `new Date('2026-07-19')` → **`2026-07-19T00:00:00.000Z`**
(midnight **UTC** of the picked calendar date). The list page's `formatFecha` reads it back by pure
string slicing (`iso.slice(0, 10)`), applying **no** timezone conversion. So the whole stack already
treats `fechaIngreso` as a timezone-naive calendar date pinned to UTC midnight.

**Convention (must match storage exactly):** the service converts a `yyyy-mm-dd` window to a UTC
half-open interval `[gte, lt)`:

```ts
function dateRange(desde: string, hasta: string): { gte: Date; lt: Date } {
  const gte = new Date(`${desde}T00:00:00.000Z`);      // inclusive lower bound, UTC midnight
  const lt = new Date(`${hasta}T00:00:00.000Z`);
  lt.setUTCDate(lt.getUTCDate() + 1);                  // exclusive upper bound = (hasta + 1 day) UTC midnight
  return { gte, lt };
}
```

Both `gte` and `lt` are built on **UTC** (`T00:00:00.000Z`, `setUTCDate`) — never local server time —
so a server running in any timezone yields identical boundaries that line up precisely with how the
rows were stored. Using local-time boundaries would shift the day edge by the server's offset and
silently drop/add a day of orders — the classic bug D1 flags.

**Who decides "today":** the **client** (browser local date), not the server (ADR-3). The client
resolves every preset to concrete `fechaDesde`/`fechaHasta` and sends its local `hoy`; the server only
does the dumb `yyyy-mm-dd → UTC-midnight` conversion above. This keeps "today" in the operator's real
timezone regardless of where the API process runs.

---

## 2. Frontend — file architecture

| File | Action | Purpose |
|------|--------|---------|
| `ordenes-trabajo/panel/page.tsx` | Create | Container: filter state, data fetch, loading/error/empty orchestration |
| `ordenes-trabajo/panel/PanelStats.tsx` | Create | Presentational — the five-figure stats row |
| `ordenes-trabajo/panel/PanelFilters.tsx` | Create | Presentational — mecánico/estado/prioridad selects + date preset control + custom range inputs |
| `ordenes-trabajo/panel/KanbanBoard.tsx` | Create | Buckets `data` into 4 estado columns; hosts co-located `KanbanColumn` + `KanbanCard` |
| `client/app/lib/ordenes-trabajo.ts` | Modify (add) | `getOrdenesTrabajoPanel(params)` + `PanelResponse`/`PanelStats`/`PanelParams` types |
| `client/app/lib/navigation.tsx` | Modify (add) | "Panel de Trabajo" leaf entry |

**Decomposition rationale (container/presentational):** the list page is a single ~970-line file
carrying table + tarjetas + menus. The Panel is a fresh surface, so we do better: the container owns
all state and side effects; three dumb presentational components render slices of it. This keeps each
piece eyeball-testable (no test runner exists — §6) and each concern isolated. `KanbanColumn` and
`KanbanCard` start **co-located inside `KanbanBoard.tsx`** (small, used only here) and can be promoted
to their own files if they grow — deliberately not over-split for four static columns.

### 2.1 API function & types (`lib/ordenes-trabajo.ts`)

Mirrors the existing `listOrdenesTrabajo` fetch/`handleJsonResponse` pattern:

```ts
export interface PanelStats {
  delDia: number; pendiente: number; enProceso: number; terminado: number; mecanicosTrabajando: number;
}
export interface PanelResponse {
  stats: PanelStats;
  data: OrdenTrabajoListItem[];
  meta: { total: number; cap: number; capped: boolean };
}
export interface GetPanelParams {
  estado?: 'all' | Estado;
  mecanicoId?: number;
  prioridad?: 'all' | Prioridad;
  fechaDesde?: string;   // yyyy-mm-dd
  fechaHasta?: string;   // yyyy-mm-dd
  hoy?: string;          // yyyy-mm-dd, browser-local today
}

export async function getOrdenesTrabajoPanel(params: GetPanelParams): Promise<PanelResponse> {
  const query = new URLSearchParams();
  if (params.estado) query.set('estado', params.estado);
  if (params.mecanicoId) query.set('mecanicoId', String(params.mecanicoId));
  if (params.prioridad) query.set('prioridad', params.prioridad);
  if (params.fechaDesde) query.set('fechaDesde', params.fechaDesde);
  if (params.fechaHasta) query.set('fechaHasta', params.fechaHasta);
  if (params.hoy) query.set('hoy', params.hoy);
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/panel?${query.toString()}`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener el panel de trabajo');
}
```

The `PanelResponse` type is **duplicated** from the server contract (no shared type package — the
codebase's standing "change one, change the other" convention; matches the proposal's Known Gaps).

### 2.2 Data-fetching approach

Client component, `useState` for filters + `useState<PanelResponse>` for results, `useEffect` that
re-fetches whenever any filter changes — the **exact** pattern the list page uses (`loadOrdenes` in
an effect keyed on the filter deps). **No React Query / SWR is introduced** (ADR-4): none is installed,
one screen does not justify a new dependency, and the list page proves the plain-effect pattern is
sufficient. Unlike the list page there is **no debounced text search** (all Panel filters are selects
and date inputs), so the fetch fires directly on change — for the custom range it fires only once both
`fechaDesde` and `fechaHasta` are set and `desde ≤ hasta`. Loading/error/empty states reuse the list
page's spinner / red-banner-with-retry / empty-message markup.

### 2.3 Presentation constants (duplication, intentional)

`ESTADO_LABELS`, `ESTADO_BADGE_CLASSES`, `PRIORIDAD_LABELS`, `PRIORIDAD_BADGE_CLASSES`,
`mecanicoLabel`, `formatFecha` currently live **local** to the list page. The Panel components
**re-declare** the small maps they need rather than extracting a shared module — extracting would
require editing the list page's imports, which violates the proposal's "list page untouched"
constraint (D7). Documented as an accepted tradeoff; promoting them to
`ordenes-trabajo/ordenesPresentation.ts` is a clean future refactor once both surfaces can be touched
together.

---

## 3. Frontend — component behavior

### 3.1 Container (`page.tsx`)

State: `estado`, `mecanicoId`, `prioridad`, `datePreset` (`'hoy' | 'semana' | 'mes' | 'personalizado'`,
default `'hoy'`), `customDesde`, `customHasta`, `mecanicos` (from `listUsers({ status: 'activo' })`
once on mount, same as the list page), plus `result`/`loading`/`error`. On any filter change it
resolves the preset to `{ fechaDesde, fechaHasta }` (§3.4), computes `hoy` (browser local), calls
`getOrdenesTrabajoPanel`, and passes `result.stats` → `PanelStats`, `result.data` → `KanbanBoard`,
`result.meta` → the cap banner.

### 3.2 `PanelStats`

Five figure tiles from `stats`: Del día, Pendientes, En proceso, Terminados, Mecánicos trabajando.
Pure presentational (`{ stats }` prop), reusing the list page's estado badge palette for the three
estado figures.

### 3.3 `PanelFilters`

Reuses the list page's `<select>`-based controls verbatim in spirit:
- **Mecánico:** a plain `<select>` populated from `mecanicos` (`listUsers({ status: 'activo' })`) —
  **not** `SearchableSelect` (ADR-5): parity with the list page, the active-user list is small and
  bounded, and a full-list `<select>` is already the proven control here.
- **Estado:** `<select>` — Todos / Pendiente / En proceso / Terminado / Cancelado.
- **Prioridad:** `<select>` — Todas / Normal / Alta / Urgente.
- **Fecha:** a preset `<select>` (Hoy / Esta semana / Este mes / Personalizado). When
  `Personalizado` is selected, two `<input type="date">` (`Desde` / `Hasta`) appear inline.

### 3.4 Date preset resolution (client-side)

All computed from the **browser-local** calendar date, formatted `yyyy-mm-dd`, "period-to-date" model
(consistent across presets):

| Preset | `fechaDesde` | `fechaHasta` |
|--------|--------------|--------------|
| `hoy` | today | today |
| `semana` | Monday of the current week | today |
| `mes` | 1st of the current month | today |
| `personalizado` | user's `Desde` input | user's `Hasta` input |

`hoy` (for the `delDia` stat) is always sent as today's local date, independent of the preset. Week
starts Monday (es-AR / ISO convention). Rationale: "to-date from period start" is how a shop reads
"this week's / this month's intake"; pinning it client-side keeps the day boundary in the operator's
timezone (ADR-3).

### 3.5 `KanbanBoard`

Four **static** columns in fixed order — `pendiente`, `en_proceso`, `terminado`, `cancelado` — each
titled with `ESTADO_LABELS` + a count of its cards. `data` is bucketed by `estado` client-side
(`data.filter(o => o.estado === col)`); the query's `orderBy` is preserved within each column. Each
card (`KanbanCard`) reuses the tarjetas-view markup: numero, cliente.razonSocial, vehículo
(marca/modelo + patente), mecánico (`mecanicoLabel`), prioridad badge, `tiposServicio` chips,
`fechaIngreso` (`formatFecha`). **Read-only** — no drag handlers, no DnD library (D2). When
`meta.capped`, a banner above the board reads *"Mostrando las primeras {cap} de {total} órdenes.
Ajustá los filtros para acotar."*

---

## 4. Navigation

Add one top-level **leaf** to `navigation` in `client/app/lib/navigation.tsx`, immediately after the
`ordenes-trabajo` entry (keeps the two órdenes surfaces adjacent):

```tsx
{
  name: 'Panel de Trabajo',
  href: '/ordenes-trabajo/panel',
  id: 'ordenes-trabajo-panel',
  // Cosmetic placeholder — no dedicated icon exists yet; reuses the same
  // "tipos-servicio" wrench as "Órdenes de Trabajo" so the two órdenes
  // surfaces read as a pair (same convention/comment as that entry).
  icon: <img src="/icons/tipos-servicio.svg" alt="" className="h-5 w-5" aria-hidden />,
},
```

No group/children restructuring, no role filtering (consistent with the "No Role Filtering" posture).

---

## 5. Sequence diagram — filter change → board + stats update

```mermaid
sequenceDiagram
    actor U as Supervisor
    participant F as Panel page (client)
    participant API as GET /ordenes-trabajo/panel
    participant S as OrdenesTrabajoService.panel
    participant DB as Prisma ($transaction)

    U->>F: change a filter (estado / mecánico / prioridad / date preset)
    F->>F: resolve preset → {fechaDesde, fechaHasta}; compute local hoy
    F->>API: getOrdenesTrabajoPanel({estado, mecanicoId, prioridad, fechaDesde, fechaHasta, hoy})
    API->>S: PanelOrdenesTrabajoQueryDto (validated: date format, cross-field)
    S->>S: buildPanelOrdenTrabajoWhere → where (activo:true + filters + UTC dateRange)
    S->>DB: $transaction([ findMany(take=cap), count(total), count(delDia),\ncount(pendiente), count(enProceso), count(terminado), groupBy(mecanicoId, en_proceso) ])
    DB-->>S: rows, total, delDia, per-estado counts, distinct mechanics
    S->>S: map rows → OrdenTrabajoListItem[]; capped = total > cap
    S-->>API: { stats, data, meta:{total,cap,capped} }
    API-->>F: PanelResponse
    F->>F: PanelStats ← stats; KanbanBoard ← data (bucket by estado); banner ← meta.capped
    F-->>U: stats row + board update together (same filtered set — cannot disagree)
```

---

## 6. Architecture Decision Records

### ADR-1 — Panel-specific where builder, not reuse of `buildOrdenTrabajoWhere`
**Decision:** add `buildPanelOrdenTrabajoWhere` returning a single `where`; leave the shared builder
untouched. **Why:** the Panel `where` has different invariants — it **always** forces `activo: true`
(the board is live work only, per D4's convention), adds a `fechaIngreso` range, and carries no
`search`/`status`. The shared builder returns a `{ searchWhere, where }` pair tuned for the paginated
list + its per-estado counts; overloading it with an optional date range and a different `activo`
posture would complicate the list path's contract for zero benefit and risk regressing it. The
codebase already favors per-feature where builders (etiquetas has its own). **Rejected:** extend
`buildOrdenTrabajoWhere` with an optional date range — couples two endpoints with divergent invariants.

### ADR-2 — Client resolves date presets; backend is preset-agnostic
**Decision:** the DTO accepts only concrete `fechaDesde`/`fechaHasta`/`hoy` (`yyyy-mm-dd`); the
`hoy`/`semana`/`mes`/`personalizado` logic lives entirely on the client. **Why:** the proposal already
specifies client-side preset resolution; it keeps the calendar math in one place (the browser, which
knows the operator's real timezone) and the server dumb and testable. **Rejected:** send `datePreset`
to the backend and resolve there — forces the server to compute "today", reintroducing the
server-timezone day-boundary bug ADR-3 exists to prevent, and duplicates calendar logic.

### ADR-3 — `fechaIngreso` date filtering uses UTC-midnight boundaries; client owns "today"
**Decision:** convert `yyyy-mm-dd` windows to `{ gte: 'yyyy-mm-ddT00:00:00.000Z', lt: (hasta+1)@UTC }`
using `setUTCDate`; the client supplies its local `hoy` and resolved range. **Why:** `fechaIngreso` is
stored as midnight **UTC** of the picked calendar date (`new Date('yyyy-mm-dd')`) and read back with
no TZ conversion (`formatFecha` string-slices). Boundaries must be built in UTC to line up exactly;
local-server boundaries would shift the day edge by the server's offset and drop/add a day of orders
(the D1 risk). "Today" is a client concept so it reflects the operator's timezone, not the API host's.
**Rejected:** local-time boundaries / server-computed today — timezone-fragile.

### ADR-4 — No data-fetching library introduced
**Decision:** plain `useState` + `useEffect` re-fetch, matching the list page. **Why:** no React
Query/SWR is installed; a single read-only screen with straightforward re-fetch-on-filter-change does
not justify a new runtime dependency and the learning/maintenance surface it brings. The list page already
proves the pattern. Aligns with the proposal's "no new dependency unless justified" spirit.
**Rejected:** add SWR/React Query for caching — premature for one screen; revisit if the Panel later
needs polling/background refresh.

### ADR-5 — Mecánico filter uses `<select>`, not `SearchableSelect`
**Decision:** reuse the list page's plain `<select>` populated by `listUsers({ status: 'activo' })`.
**Why:** parity with the proven list-page filter, a bounded active-user list renders fine in a native
select, and it avoids pulling the heavier combobox into a read-only filter bar. **Rejected:**
`SearchableSelect` — warranted for large/searchable reference sets (marca/cliente on the vehicle form),
not for the small mechanic roster here.

### ADR-6 — Hard cap = 500 with an explicit "showing first N" signal
**Decision:** `PANEL_ORDENES_CAP = 500`; `meta.capped` drives a banner, never silent truncation.
**Why / tradeoffs:** see §1.4 — bounds worst-case payload/DOM while comfortably exceeding realistic
live-order volume; a single constant is trivially tunable. **Rejected:** unbounded query (operational
foot-gun as data grows, D5); per-column pagination (out of scope, and a Kanban wants all matching
cards at once).

---

## 7. Testing Strategy

No test runner is configured in either package (`strict_tdd: false`, `test_command: ""`). No automated
tests are added; `sdd-verify` performs manual checks via the dev server and `npm run build`:

| Check | Steps |
|-------|-------|
| Route ordering | `GET /ordenes-trabajo/panel` returns the panel payload, not a 400 from `:id`'s `ParseIntPipe` |
| Stats ⇄ board consistency | Change each filter; the five figures and the visible cards reflect the same set |
| Estado filter scoping (D3) | Filter `estado = en_proceso`; other estado figures + columns go to 0 |
| Date presets (`fechaIngreso`) | hoy/semana/mes/personalizado each bound the board to the right `fechaIngreso` window; "del día" uses `fechaIngreso`, not `createdAt` |
| Timezone boundary | An order with `fechaIngreso` on the range edge is included (UTC-midnight boundary correct) |
| Mecánicos trabajando (D4) | Count = distinct mechanics with ≥1 `en_proceso`, `activo:true`; a soft-deactivated order does not inflate it |
| Cap signal | Force `total > 500` (or temporarily lower the cap); banner shows "primeras N de M", board renders exactly `cap` cards |
| Read-only board | No drag handlers; `client/package.json` gains no DnD dependency |
| Nav entry | "Panel de Trabajo" leaf routes to `/ordenes-trabajo/panel`; list page unchanged |

---

## 8. Open Questions

- [ ] "Esta semana" defined as Monday→today (period-to-date). If the shop expects a rolling 7-day
      window instead, only §3.4's client resolver changes — no backend impact.
- [ ] Icon is a cosmetic placeholder (shares the wrench with "Órdenes de Trabajo"); a dedicated
      board icon can be dropped in later without code change beyond the `src`.
</content>
</invoke>
