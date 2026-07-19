# Design: Per-mechanic open-workload section on `/ordenes-trabajo/panel`

## Technical Approach

Add one dedicated aggregated read endpoint `GET /ordenes-trabajo/panel/mecanicos` and one new
frontend presentational section rendered **below** `<KanbanBoard>` on the existing
`/ordenes-trabajo/panel` page. Both are strictly additive — the existing panel endpoint
(`GET /ordenes-trabajo/panel`), its `panel()` service method, `buildPanelOrdenTrabajoWhere`, the
board, the stats row, and the filter bar are all untouched (proposal Non-Goals; D1).

The endpoint takes **no** query params. It returns, in a single `$transaction`, one entry per
**active** mechanic (`User.activo = true`) with that mechanic's count of open orders
(`pendiente + en_proceso`, `activo: true`), the percentage that count represents of the shop-wide
open total, and the total itself in `meta`. Idle mechanics appear as `0 / 0%` because the aggregation
**starts from the active-mechanics pool and left-joins** the order counts (D2), never from the order
`groupBy` alone. Percentages, zero-fill, and sort (load desc, name asc tiebreak) are computed in the
**service layer** so the frontend component stays purely presentational — the same
aggregation-in-service posture the sibling `panel-trabajo` design established.

**Where this deliberately diverges from the sibling `panel-trabajo` design.** This endpoint takes
**no DTO / no query params at all** — there is no `PanelOrdenesTrabajoQueryDto` equivalent, no
`buildPanelWhere` helper parameterized by filters, no cross-field date validation, no cap. It is a
fixed, always-unfiltered global snapshot (D1), which is exactly why it is a separate endpoint rather
than an extra field on `panel()`'s filtered `$transaction` (the "two filter semantics in one
transaction" smell the sibling design flagged). Everything else — file/class locations, route-ordering
discipline, `$transaction` convention, mapping in the service, additive client types, and the
`mecanicoLabel()`-redeclaration pattern — follows the sibling precedent.

No schema/migration change, no new dependency, no shared type package.

---

## 1. Backend

### 1.1 Route & controller method placement (route-collision analysis)

New handler `@Get('panel/mecanicos')` on the existing `OrdenesTrabajoController`, in the existing
file `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts`. Guarded by the class-level
`@UseGuards(JwtAuthGuard)` already present — no per-route guard, no `RolesGuard` (D1, sibling D8).

**Recommended placement — immediately after `@Get('panel')` and before `@Get(':id')`:**

```ts
@Get('panel')                                    // existing — unchanged
async panel(@Query() query: PanelOrdenesTrabajoQueryDto) {
  return this.ordenesTrabajoService.panel(query);
}

@Get('panel/mecanicos')                          // NEW — two-segment literal, no params
async panelMecanicos() {
  return this.ordenesTrabajoService.panelMecanicos();
}

@Get(':id')                                      // existing — unchanged
async findOne(@Param('id', ParseIntPipe) id: number) { … }
```

**Collision analysis (the proposal's rollback-plan claim, confirmed correct).**
`panel/mecanicos` is a **two-segment literal** path (`panel` + `mecanicos`). Nest resolves routes via
Express, which matches by path depth and pattern:

- `@Get(':id')` is a **single-segment** param route. It can only capture a one-segment request
  (`/ordenes-trabajo/xyz`); it can never match the two-segment `/ordenes-trabajo/panel/mecanicos`.
- `@Get(':id/detalles')` is two segments, but its second segment is the **literal** `detalles`;
  a request whose second segment is `mecanicos` does not match it.
- `@Get('panel')` is a single-segment literal; it does not match a two-segment request either.

So `GET /ordenes-trabajo/panel/mecanicos` routes to `panelMecanicos` **regardless of declaration
order** — there is no param route that can shadow it. Placement after `@Get('panel')` is therefore
chosen purely for **readability/auditability**: it keeps the two `panel*` literal routes physically
adjacent so the controller's literal-route discipline stays reviewable at a glance (the same rationale
the existing `@Get('panel')` comment gives). No handler signature needs a body or params.

### 1.2 No query DTO (explicit)

There is **no** DTO for this route. The handler takes no `@Query()`, no `@Param()`, no `@Body()`.
The section is a fixed always-unfiltered snapshot (D1), so there is nothing to validate or parse.
This is the deliberate divergence from `panel()` noted in the Technical Approach.

### 1.3 Response shape (final — implemented verbatim by `sdd-tasks`/`sdd-apply`)

```ts
// Server return type (inferred; documented here for the client mirror in §2.1).
interface PanelMecanicosResponse {
  mecanicos: {
    mecanicoId: number;        // User.id
    nombre: string | null;     // raw User.nombre  (client applies mecanicoLabel — see 1.6)
    apellido: string | null;   // raw User.apellido
    username: string;          // raw User.username (fallback label source)
    count: number;             // this mechanic's pendiente + en_proceso count (0 if idle)
    percentage: number;        // integer 0..100, Math.round(count / total * 100); 0 when total = 0
  }[];
  meta: {
    totalOrdenes: number;      // shop-wide pendiente + en_proceso total (the % denominator)
  };
}
```

`mecanicos` is returned **already sorted** (count desc, resolved-label asc tiebreak — §1.6). The
array carries the **raw** name parts (`nombre`/`apellido`/`username`), not a pre-joined display
string — mirroring how the sibling endpoint returns `orden.mecanico` as raw parts and lets the client
apply `mecanicoLabel()` (D7). See §1.6 for why the server nonetheless computes the same label
internally for the sort tiebreak.

**Percentage rounding rule (resolves the proposal's deferred decision): nearest integer via
`Math.round`.** `percentage = total === 0 ? 0 : Math.round((count / total) * 100)`. Justification: the
cards are a scannable at-a-glance load grid, and the exact `count` is always shown alongside each
percentage (and `meta.totalOrdenes` is exact), so tenths-of-a-percent add zero operational value while
adding visual noise. Independent per-card rounding means displayed percentages may not sum to exactly
100 — an accepted presentation-level tradeoff (proposal Known Gaps); the raw figures remain auditable.
See ADR-4.

### 1.4 Service method design — `panelMecanicos()`

New method `panelMecanicos()` on `OrdenesTrabajoService`, in the existing file
`server/src/ordenes-trabajo/ordenes-trabajo.service.ts`. It reuses no filter/where builder (there are
no filters). Exact query sequence:

```ts
// Live-open predicate for the order groupBy. `activo: true` here is the ORDER's
// soft-delete flag (live orders only) — distinct from the User's `activo` below.
const OPEN_ESTADOS: Estado[] = ['pendiente', 'en_proceso'];

async panelMecanicos() {
  // (a)+(b) run together in one $transaction for a consistent point-in-time
  // snapshot (ADR-2) and to match this module's read convention (panel()).
  const [mecanicos, groups] = await this.prisma.$transaction([
    // (a) Active-mechanics pool — same pool the panel filter uses
    //     (listUsers({ status: 'activo' })). No `rol` filter (D5).
    this.prisma.user.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, apellido: true, username: true },
      orderBy: { id: 'asc' }, // deterministic input; final order is set in (e)
    }),
    // (b) Open-order counts per mechanic. `_count: { _all: true }` gives the
    //     per-group total; grouping is over whatever mecanicoIds actually hold
    //     open orders (may include a mechanic later deactivated — see note).
    this.prisma.ordenTrabajo.groupBy({
      by: ['mecanicoId'],
      where: { activo: true, estado: { in: OPEN_ESTADOS } },
      _count: { _all: true },
    }),
  ]);

  // (c) Map mecanicoId -> open count.
  const countByMecanico = new Map<number, number>(
    groups.map((g) => [g.mecanicoId, g._count._all]),
  );

  // (d) Denominator = shop-wide open total = sum of ALL group counts.
  //     Equivalent to count({ where: { activo, estado in OPEN_ESTADOS } }) —
  //     they agree by construction — so we derive it from the same groupBy
  //     rather than issuing a third query (ADR-3).
  const totalOrdenes = groups.reduce((sum, g) => sum + g._count._all, 0);

  // (e) Left-join counts onto the active-mechanic pool (zero-fill idle ones),
  //     compute percentage with the zero-denominator guard (D4), then sort.
  const mecanicosOut = mecanicos
    .map((m) => {
      const count = countByMecanico.get(m.id) ?? 0;
      const percentage = totalOrdenes === 0 ? 0 : Math.round((count / totalOrdenes) * 100);
      return {
        mecanicoId: m.id,
        nombre: m.nombre,
        apellido: m.apellido,
        username: m.username,
        count,
        percentage,
      };
    })
    // (f) load desc, then resolved display-name asc as the stable tiebreak (D8).
    .sort((a, b) => b.count - a.count || labelFor(a).localeCompare(labelFor(b), 'es'));

  return { mecanicos: mecanicosOut, meta: { totalOrdenes } };
}
```

Where `labelFor` is a tiny module-local helper mirroring the client `mecanicoLabel()` formula, used
**only** for the sort tiebreak (§1.6):

```ts
function labelFor(m: { nombre: string | null; apellido: string | null; username: string }): string {
  return `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() || m.username;
}
```

**Confirmed `User` fields (verified against `schema.prisma`, not assumed).** The `User` model has
`nombre String?`, `apellido String?`, `username String @unique`, and `activo Boolean` — so the label
formula is `` `${nombre ?? ''} ${apellido ?? ''}`.trim() || username ``, identical to the existing
`searchUsers()` helper in `client/app/lib/users.ts`. `select` requests exactly `id, nombre, apellido,
username`.

**Zero-denominator guard (exact, unambiguous).** `totalOrdenes === 0 ? 0 : Math.round((count /
totalOrdenes) * 100)`. When the shop has zero open orders, every mechanic's `count` is `0` and every
`percentage` is `0` — never `NaN`, never a hidden section (D4).

**Design note — a deactivated mechanic holding open orders.** `groupBy` (b) groups over *every*
`mecanicoId` with an open order, including a `User` deactivated **after** being assigned open work; the
active-mechanics pool (a) excludes them, so that mechanic gets no card, yet their orders remain in
`totalOrdenes` (d). Consequence: in that rare case the visible cards' percentages sum to **less than
100%**. This is correct-by-spec — the proposal fixes the denominator as the "shop-wide
`pendiente + en_proceso` total across all mechanics" (D3), which literally includes those orders — and
it is auditable (`meta.totalOrdenes` and each raw `count` are exact). Flagged in Open Questions.

### 1.5 `$transaction` for the two reads — yes (see ADR-2)

The two reads — `user.findMany` (a) and `ordenTrabajo.groupBy` (b) — are logically independent, but
they are wrapped in a single `$transaction([...])`. Rationale summarized here, full record in ADR-2:
(1) **snapshot consistency** — the zero-fill join and the percentage denominator are both derived
from these two reads; a `$transaction` guarantees they reflect one point in time, so an order changing
estado *between* the reads cannot make the pool and the counts disagree; (2) **module convention** —
`panel()` already reads via `$transaction`, so a future maintainer finds one read convention, not two;
(3) **cost is negligible** — two cheap indexed reads in one round trip. Not overkill; it is free
correctness.

### 1.6 Name label: raw parts on the wire, server-side label only for sorting

The response returns **raw** `nombre`/`apellido`/`username` (§1.3), and the **client** applies its
re-declared `mecanicoLabel()` for display — this is exactly how the sibling board renders
`orden.mecanico` (D7: `mecanicoLabel()` re-declared per surface, no shared module extracted). The
server does **not** ship a resolved display string.

The one wrinkle: D8 requires the **service layer** to sort by name (descending load, ascending name
tiebreak), so the server must know the label to order by it. It computes that label inline via
`labelFor` (§1.4) using the **same formula** as the client `mecanicoLabel()`. Because both sides use
`` `${nombre ?? ''} ${apellido ?? ''}`.trim() || username ``, the server's sort order and the client's
displayed names always agree. `labelFor` is a module-local function — it is **not** an extracted
shared module and touches no other surface, so it honors D7's "don't extract" constraint on the server
side too. This server/client formula duplication is the codebase's standing "change one, change the
other" convention (same as `users.ts`'s duplication comment).

---

## 2. Frontend

### 2.1 API function & types (`client/app/lib/ordenes-trabajo.ts`) — additive

Mirrors the existing `getOrdenesTrabajoPanel` fetch/`handleJsonResponse` pattern, but **takes no
params** (no `GetPanelParams` equivalent — the endpoint is unfiltered):

```ts
export interface MecanicoWorkload {
  mecanicoId: number;
  nombre: string | null;
  apellido: string | null;
  username: string;
  count: number;
  percentage: number;
}

export interface PanelMecanicosResponse {
  mecanicos: MecanicoWorkload[];
  meta: { totalOrdenes: number };
}

// No params — the endpoint is an always-unfiltered global snapshot (D1),
// unlike getOrdenesTrabajoPanel(params: GetPanelParams).
export async function getPanelMecanicos(): Promise<PanelMecanicosResponse> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/panel/mecanicos`, {
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo obtener la carga por mecánico');
}
```

`PanelMecanicosResponse` is **duplicated** from the server contract (no shared type package — the
codebase's standing convention; matches the proposal's Known Gaps).

### 2.2 New presentational component `MecanicosWorkload.tsx`

New file `client/app/(dashboard)/ordenes-trabajo/panel/MecanicosWorkload.tsx`. Pure presentational
(`{ mecanicos }` prop, **no fetching**), same posture as `PanelStats.tsx`. It re-declares
`mecanicoLabel()` (D7) and renders one card per entry, in the order received (already sorted
server-side — the component does **not** re-sort):

```tsx
import type { MecanicoWorkload } from '../../../lib/ordenes-trabajo';

// Re-declared per D7 — same formula as the server's labelFor and the list
// page's mecanicoLabel. Not extracted (would touch untouched surfaces).
function mecanicoLabel(m: { nombre: string | null; apellido: string | null; username: string }): string {
  return `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() || m.username;
}

export default function MecanicosWorkload({ mecanicos }: { mecanicos: MecanicoWorkload[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Carga por mecánico</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {mecanicos.map((m) => (
          <div
            key={m.mecanicoId}
            className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <span className="truncate text-sm font-medium text-stone-700" title={mecanicoLabel(m)}>
              {mecanicoLabel(m)}
            </span>
            <span className="text-2xl font-bold text-stone-900">{m.count}</span>
            <span className="text-xs text-stone-500">{m.percentage}% de la carga</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

**Card visual treatment — neutral/simple, no color scale or bar (see ADR-6).** The card shows the
name, the count (the primary figure), and the percentage as a subtitle — reusing `PanelStats.tsx`'s
exact card shell (`rounded-xl border border-stone-200 bg-white p-4 shadow-sm`). No load-level color
coding and no percentage bar: a color scale would demand arbitrary "busy/free" thresholds the product
has not defined, and availability is already communicated by the sort order (idle `0/0%` cards sink to
the bottom) plus the explicit figures. Keeping it a plain figure grid matches the panel's existing
visual language and avoids over-designing a stat card. A percentage progress bar is noted as a possible
future enhancement (Open Questions).

### 2.3 `page.tsx` changes — separate state + once-on-mount `useEffect`

Add, alongside the existing panel state, an **independent** trio of state and a **separate**
`useEffect` with an **empty dependency array** so it fetches exactly once on mount and **never**
re-fetches on filter changes (D1; ADR-5):

```tsx
const [mecanicosWorkload, setMecanicosWorkload] = useState<MecanicoWorkload[] | null>(null);
const [workloadLoading, setWorkloadLoading] = useState(true);
const [workloadError, setWorkloadError] = useState('');

const loadWorkload = async () => {
  setWorkloadLoading(true);
  setWorkloadError('');
  try {
    const res = await getPanelMecanicos();
    setMecanicosWorkload(res.mecanicos);
  } catch (err) {
    setWorkloadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor.');
  } finally {
    setWorkloadLoading(false);
  }
};

// Fetch ONCE on mount. This section is filter-INDEPENDENT (D1): its deps array
// is intentionally EMPTY. Do NOT add estado/mecanicoId/prioridad/date deps here
// — unlike the loadPanel() effect below, which IS keyed on every filter. Adding
// filter deps would (a) re-shape a section that must stay global, and (b) waste
// a request returning identical data. See design.md ADR-5.
useEffect(() => {
  loadWorkload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Explicit contrast (for future readers).** The existing panel-data effect is
`useEffect(() => { loadPanel(); }, [estado, mecanicoId, prioridad, datePreset, customDesde,
customHasta])` — it re-fetches on every filter change *by design*. The new workload effect is
`useEffect(() => { loadWorkload(); }, [])` — it must **never** gain those deps. The two fetches are
logically independent and have independent loading/error states; they do not coordinate.

Render the new section **below** `<KanbanBoard>`, with its own loading/error/empty handling that
reuses the page's existing spinner / red-banner-with-retry markup — independent of the board's states:

```tsx
      ) : (
        <KanbanBoard data={result.data} meta={result.meta} />
      )}

      {/* Per-mechanic open-workload — independent of the filter bar (D1). */}
      {workloadLoading ? (
        <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500" aria-hidden="true" />
          Cargando carga por mecánico...
        </div>
      ) : workloadError ? (
        <div className="mt-8 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{workloadError}</span>
          <button type="button" onClick={loadWorkload} className="shrink-0 font-medium text-red-700 underline hover:text-red-800">
            Reintentar
          </button>
        </div>
      ) : mecanicosWorkload && mecanicosWorkload.length > 0 ? (
        <MecanicosWorkload mecanicos={mecanicosWorkload} />
      ) : (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 shadow-sm">
          No hay mecánicos activos para mostrar.
        </div>
      )}
```

The empty state (no active mechanics at all) is distinct from the zero-load state: with active
mechanics but no open orders, `mecanicosWorkload` is a non-empty array of `0/0%` cards (D4), so
`MecanicosWorkload` renders — the "No hay mecánicos activos" message shows only when the pool itself is
empty.

New imports in `page.tsx`: `getPanelMecanicos`, `type MecanicoWorkload` from `lib/ordenes-trabajo`,
and the `MecanicosWorkload` component.

---

## 3. Sequence diagram — page mount → two independent fetches → independent renders

```mermaid
sequenceDiagram
    actor U as Supervisor
    participant F as Panel page (client)
    participant PA as GET /ordenes-trabajo/panel
    participant MA as GET /ordenes-trabajo/panel/mecanicos
    participant S as OrdenesTrabajoService.panelMecanicos
    participant DB as Prisma ($transaction)

    U->>F: navigate to /ordenes-trabajo/panel (mount)

    par Filter-driven panel fetch (existing)
        F->>F: resolve preset -> {fechaDesde, fechaHasta}; compute local hoy
        F->>PA: getOrdenesTrabajoPanel({estado, mecanicoId, prioridad, dates, hoy})
        PA-->>F: PanelResponse { stats, data, meta }
        F->>F: PanelStats + KanbanBoard render (re-fetch on every filter change)
    and Once-on-mount workload fetch (new, filter-independent)
        F->>MA: getPanelMecanicos()   // no params
        MA->>S: panelMecanicos()
        S->>DB: $transaction([ user.findMany(activo:true), ordenTrabajo.groupBy(mecanicoId, open) ])
        DB-->>S: active mechanics, per-mechanic open counts
        S->>S: left-join zero-fill; total = Σ counts; percentage = round(count/total*100); sort load↓ name↑
        S-->>MA: { mecanicos[], meta:{ totalOrdenes } }
        MA-->>F: PanelMecanicosResponse
        F->>F: MecanicosWorkload renders (deps: []) — never re-fetches on filter change
    end

    Note over F: The two sections have independent loading/error states and never coordinate.
    U->>F: change any panel filter
    F->>PA: panel re-fetch (board + stats update)
    Note over F,MA: workload section is NOT re-fetched and does NOT change
```

---

## 4. Architecture Decision Records

### ADR-1 — Dedicated endpoint with no DTO / no query params
**Decision:** `GET /ordenes-trabajo/panel/mecanicos` is a standalone route with an empty handler
signature — no `@Query()`, no DTO, no where-builder. **Why:** the section is a fixed always-unfiltered
global snapshot (proposal D1); there is nothing to parse or validate. A separate endpoint makes that
"always global" contract explicit and decouples its once-on-mount fetch from the panel's
re-fetch-on-every-filter lifecycle, avoiding the "two filter semantics in one `$transaction`" smell the
sibling design flagged. **Rejected:** extend `panel()`'s response with an always-unfiltered `mecanicos`
field — mixes filtered and unfiltered semantics in one transaction and recomputes identical data on
every filter change. This is the primary intentional divergence from the sibling design, which is
DTO-driven.

### ADR-2 — The two reads run in a single `$transaction`
**Decision:** wrap `user.findMany` and `ordenTrabajo.groupBy` in one `$transaction([...])` even though
they are independent. **Why:** the percentage denominator (`totalOrdenes`) and the zero-fill join are
both derived from these two reads; a transaction pins them to one point in time, so an order changing
estado between the reads cannot desynchronize the pool from the counts. It also matches this module's
existing read convention (`panel()` reads via `$transaction`), so a maintainer finds one convention.
Cost is negligible — two cheap indexed reads, one round trip. **Rejected:** two sequential
`await`s — reintroduces a (small) inconsistency window for no saving and diverges from the module's
read style.

### ADR-3 — `meta.totalOrdenes` derived from the `groupBy` sum, not a separate `count()`
**Decision:** `totalOrdenes = Σ group._count._all`, not a third `ordenTrabajo.count()` query. **Why:**
the sum over all groups is, by construction, equal to `count({ where: { activo: true, estado: { in:
['pendiente','en_proceso'] } } })` (every open order belongs to exactly one `mecanicoId`, which is
non-nullable per D3). Deriving it from the same `groupBy` guarantees the denominator and the per-card
counts share a single source of truth (they can never disagree) and avoids a redundant query.
**Rejected:** a separate `count()` — a second source that must be kept in agreement for no benefit.

### ADR-4 — Percentage rounded to the nearest integer (`Math.round`)
**Decision:** `percentage = total === 0 ? 0 : Math.round((count / total) * 100)` — integer, not one
decimal. **Why:** the cards are a scannable load grid, and each card always shows the exact `count`
next to the percentage (and `meta.totalOrdenes` is exact), so tenths-of-a-percent add visual noise
without operational value. Independent per-card rounding may make displayed percentages not sum to
exactly 100 — an accepted presentation-level tradeoff; the raw figures stay auditable. **Rejected:**
one-decimal display — more precision than a card grid warrants; sum-to-100 is unachievable with
independent rounding regardless of decimals.

### ADR-5 — Once-on-mount fetch lifecycle, no polling
**Decision:** the workload section fetches exactly once on mount via a `useEffect` with an empty deps
array; it never re-fetches on filter changes and does not poll. **Why:** the section is
filter-independent (D1), so re-fetching on filter change would return identical data — pure waste — and
would risk a maintainer wiring it to the filter bar. Once-on-mount is the minimal correct lifecycle;
the operator reloads the page to refresh (accepted "snapshot stale until reload" tradeoff, proposal
Known Gaps). **Rejected:** polling / interval refresh — adds a moving part and request load for a
secondary read-only figure with no product requirement for live updates; **rejected:** keying it on
filter deps — structurally wrong for a global snapshot.

### ADR-6 — Neutral stat cards, no load-level color or bar
**Decision:** each card is a plain figure tile (name + count + `N% de la carga`) reusing
`PanelStats.tsx`'s shell; no color-coding by load level and no percentage bar. **Why:** a color scale
needs "busy vs. free" thresholds the product has not specified, and availability is already conveyed by
the sort order (idle cards sink) and the explicit figures. A neutral grid matches the panel's existing
visual language and keeps the change tightly additive. **Rejected:** heatmap/traffic-light coloring —
arbitrary thresholds, scope creep; **deferred:** a thin percentage progress bar — low-risk and
genuinely informative, noted as a future enhancement, but omitted now to avoid over-designing a stat
card.

---

## 5. Testing Strategy

No test runner is configured in either package (`strict_tdd: false`, `test_command: ""`). No automated
tests are added; `sdd-verify` performs manual checks via the dev server and `npm run build`. Mirrors
the sibling design's §7 format.

| Check | Steps |
|-------|-------|
| Route reachability | `GET /ordenes-trabajo/panel/mecanicos` returns the workload payload (not a 400 from `:id`'s `ParseIntPipe`, not the `panel` payload); auth required (401 without token) |
| All active mechanics incl. zero-load | Every `User` with `activo: true` gets a card, including mechanics with no open orders shown as `0` / `0%`; a mechanic with only `terminado`/`cancelado` orders reads `0` / `0%` |
| Zero-denominator shop-wide (D4) | With zero shop-wide `pendiente + en_proceso` orders, every card shows `0` / `0%` — no `NaN`, section not hidden; `meta.totalOrdenes = 0` |
| Sort order + tiebreak (D8) | Cards ordered by `count` descending; equal-load mechanics ordered by resolved name ascending (`${nombre} ${apellido}`.trim() ‖ `username`); order stable across reloads |
| Percentage math | For a mechanic with `count = c` and `totalOrdenes = t > 0`, displayed % equals `Math.round(c / t * 100)`; sum of card counts equals `meta.totalOrdenes` (modulo a deactivated-mechanic-with-open-orders case, where the sum of *card* counts is less — see Open Questions) |
| Filter-independence (D1) | With DevTools open on the workload DOM subtree, change **every** panel filter in turn (estado, prioridad, mecánico, date preset, custom range) and confirm the section's rendered content is **byte-identical** before/after and that **no** `GET …/panel/mecanicos` request re-fires |
| Count semantics | Only `pendiente + en_proceso`, `activo: true` orders count; a soft-deleted (`activo: false`) order or a `terminado`/`cancelado` order does not inflate a mechanic's count or `totalOrdenes` |
| No regression | The Kanban board, stats row, filter bar, `GET /ordenes-trabajo/panel`, and the list page (`/ordenes-trabajo`) behave exactly as before; `npm run build` passes in both packages |

---

## 6. Open Questions

- [x] **Deactivated mechanic still holding open orders — resolved.** Confirmed with the user: orders
      assigned to a mechanic who is later deactivated still count toward `meta.totalOrdenes`, even
      though that mechanic gets no card. Visible cards' counts can sum to less than `meta.totalOrdenes`
      in that case — expected and auditable, not a bug. `spec.md`'s "Percentage Is Computed..."
      requirement was corrected to state this explicitly (it previously said "sum of every **active**
      mechanic's count", which contradicted this section's §1.4/ADR-3 implementation). §1.4's
      `totalOrdenes = Σ group._count._all` (ADR-3) stands as designed, no change needed.
- [ ] **Percentage progress bar.** ADR-6 keeps cards neutral; a thin bar (width = `percentage`) is a
      low-risk future enhancement that needs no backend change if desired later.
- [ ] **Manual refresh affordance.** ADR-5 fetches once on mount; a "refresh" button re-calling
      `loadWorkload()` (or later polling) is a possible enhancement, out of scope here.
</content>
</invoke>
