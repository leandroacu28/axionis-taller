# Exploration: Panel de Trabajo (work board) for Órdenes de Trabajo

## Current State

**Schema** (`server/prisma/schema.prisma`):
- `enum Estado { pendiente, en_proceso, terminado, cancelado }` (line 207) — `cancelado` was added later via `server/prisma/migrations/20260716124433_add_cancelado_estado/migration.sql`. The existing `openspec/specs/ordenes-trabajo-management/spec.md` (lines 166, 214) still explicitly states "no `cancelado` state exists" — that spec is now **stale/inconsistent** with the live schema and should be corrected as part of this change or a prerequisite fix.
- `enum Prioridad { normal, alta, urgente }` (line 201).
- `model OrdenTrabajo` (line 214): `id`, `numero` (unique), `fechaIngreso` (DateTime, defaults to now but client-overridable for backdated entries), `kilometros`, `prioridad`, `motivoIngreso`, `estado`, `fechaFinalizacion` (nullable), `activo` (soft-deactivation, orthogonal to `estado`), `clienteId`/`cliente`, `vehiculoId`/`vehiculo`, `mecanicoId`/`mecanico` (→ `User`), `detalles` (→ `OrdenTrabajoTipoServicio[]`), audit FKs, timestamps.
- **No separate "Mecanico" entity.** `mecanico` is just `User` via the `OrdenTrabajoMecanico` relation — any active `User` regardless of `rol` (confirmed by `assertMecanicoActivo` in the service, comment: "any active User (D6), not role-restricted"). `User.rol` is a free string (`@default("empleado")`), not enforced anywhere in this domain.
- **No "currently working" concept exists as stored data.** The only proxy for "a mechanic is working" is: an `OrdenTrabajo` row with `estado = 'en_proceso'` and a non-null `mecanicoId`. "Mecánicos trabajando" would have to be derived (e.g., `SELECT DISTINCT mecanicoId FROM OrdenTrabajo WHERE estado = 'en_proceso' AND activo = true`), not read from an existing field.

**Backend** (`server/src/ordenes-trabajo/`):
- `ordenes-trabajo.controller.ts` exposes: `GET /ordenes-trabajo` (paginated list), `GET /ordenes-trabajo/:id`, `GET /ordenes-trabajo/:id/detalles`, `PATCH /ordenes-trabajo/:id/detalles/:detalleId`, producto sub-routes, `POST /ordenes-trabajo`, `PATCH /ordenes-trabajo/:id`, `POST /ordenes-trabajo/:id/iniciar`. All guarded only by `JwtAuthGuard` (no role/permission gating — deferred per spec).
- `ordenes-trabajo.service.ts` `findAll()` already: paginates (`page`/`pageSize`), filters by `search` (numero/cliente/marca+modelo), `estado` (single or `all`), `status` (activo/inactivo/all — orthogonal to estado), `mecanicoId`, `prioridad`; and computes **per-estado counts** (`pendiente`/`en_proceso`/`terminado`/`cancelado`) in the same `$transaction`, always forcing `activo: true` on the counts regardless of the `status` filter (`countsWhere`), and ignoring `mecanicoId`/`prioridad` for the counts. This is the closest existing precedent for the Panel's stats block.
- **No date-range filtering exists anywhere in this module** (no `fechaIngreso`/`createdAt` range params in `ListOrdenesTrabajoQueryDto` or `buildOrdenTrabajoWhere`). Today/week/month/custom filtering is entirely new backend work.
- `iniciar()` is the **only** dedicated state-transition action, and it is asymmetric: it only handles `pendiente → en_proceso` and atomically cascades still-`pendiente` `detalles` to `en_proceso` too. The generic `update()` (`PATCH /ordenes-trabajo/:id`) allows free `estado` transitions in any direction (per `ordenes-trabajo-management/spec.md` "Update Order With Free Estado Transitions") but does **not** cascade `detalles` state — it only reconciles the `tipoServicioIds` M2M-via-`detalles` set. This asymmetry matters directly for Kanban drag semantics (see Open Questions).

**Frontend** (`client/app/(dashboard)/ordenes-trabajo/page.tsx`, `client/app/lib/ordenes-trabajo.ts`):
- The list page already implements: a summary-pills row (`counts.pendiente/en_proceso/terminado/cancelado`, styled per view-mode palette), a filter bar (`search` debounced 350ms, `estado` select, `activo` select, `mecanico` select populated from `listUsers({ status: 'activo' })`, `prioridad` select, page-size select), and a table/tarjetas (cards) view toggle with per-row "..." actions menu (portal-rendered dropdown). This is the strongest existing pattern to reuse for the Panel's filter bar and card rendering — the "tarjetas" view's card markup (cliente, vehículo, mecánico, prioridad badge, tipos de servicio chips) is very close to what a Kanban card would need.
- `client/app/lib/ordenes-trabajo.ts` defines `listOrdenesTrabajo()`, `PaginatedOrdenesTrabajo` (with the `counts` shape), and all types (`Estado`, `Prioridad`, `OrdenTrabajoListItem`). No date-filter params exist on `ListOrdenesTrabajoParams`.
- No `SearchableSelect`-driven mecánico picker on this list page — it uses a plain `<select>` populated once from `listUsers`. (A true searchable select component does exist at `client/app/(dashboard)/vehiculos/SearchableSelect.tsx`, used elsewhere, e.g. vehículo/cliente pickers — available if the Panel's mecánico filter needs search-as-you-type instead of a plain dropdown.)
- **No Kanban-like UI exists anywhere else in the codebase** (checked component and page globs; nothing resembling drag/columns).
- **No drag-and-drop library is installed.** `client/package.json` dependencies: `next`, `react`, `react-dom`, `sweetalert2`, `sweetalert2-react-content` only. No `@dnd-kit/*`, `react-beautiful-dnd`, `react-dnd`, etc. Adding true drag-and-drop is a new dependency decision, not a reuse of existing infra.
- **Navigation**: `client/app/lib/navigation.tsx` defines a flat `NavigationItem[]` consumed by `Sidebar.tsx`. "Órdenes de Trabajo" is currently a top-level leaf item (`href: '/ordenes-trabajo'`). A new "Panel de Trabajo" entry would most naturally sit as a sibling top-level item or as a new route under `ordenes-trabajo/` (e.g. `/ordenes-trabajo/panel`) — either is a trivial addition to the `navigation` array; no structural blocker.

**Existing OpenSpec artifacts** (`openspec/specs/`):
- `ordenes-trabajo-management/spec.md` — defines the base CRUD/model contract (see the stale `cancelado` note above).
- `ordenes-trabajo-iniciar/spec.md` — defines the dedicated `iniciar` action's atomicity/guard contract (409 on non-`pendiente`, cascades only still-`pendiente` detalles).
- `orden-trabajo-vehiculo-quick-create/spec.md` — unrelated quick-create-vehicle-from-order-form flow, not directly relevant to the Panel.
- No existing spec or change touches a "panel"/"dashboard"/"kanban" concept for órdenes de trabajo — this is a clean-slate capability.

## Key Open Questions for Proposal

1. **"Del día" semantics** — does the daily order count mean `fechaIngreso` (client-editable intake date, can be backdated) falling on today, or `createdAt` (immutable, server-stamped) falling on today? These can diverge (a mechanic can log a job today with a backdated `fechaIngreso`). Needs an explicit decision.
2. **"Mecánicos trabajando" shape** — is this a bare count, or a list of distinct mechanics (id + name) each with >=1 order in `en_proceso`? Should it also require `activo: true` on the order (consistent with the existing per-estado counts pattern)? Does an order in `en_proceso` but `activo: false` (soft-deactivated) still count as "working"?
3. **Do the top summary stats respect the filter bar, or are they fixed snapshots?** The requirement lists the stats block and the filters as separate sections — likely the stats are a fixed "right now / today" snapshot independent of whatever filter/date-range is selected below, while only the Kanban board reacts to filters. This needs to be confirmed, since it changes whether stats need their own unfiltered query or share the filtered query.
4. **Date filter target field** — same ambiguity as (1): does "hoy/semana/mes/personalizado" filter on `fechaIngreso` or `createdAt`? Likely should match whatever field the "del día" stat uses for consistency.
5. **Kanban drag-and-drop write semantics** — is the board read-only (cards grouped by estado, no drag), or does dragging a card between columns actually mutate the order's `estado`? If it mutates: dragging into `en_proceso` — does it call the generic `PATCH` (free transition, no detalle cascade) or the dedicated `iniciar` action (cascades detalles, but only works from `pendiente` and 409s otherwise)? This is a real behavioral fork, not just UI polish, since the two backend paths produce different side effects on `detalles`.
6. **Kanban columns and scope** — one column per `Estado` value (4: `pendiente`/`en_proceso`/`terminado`/`cancelado`)? Should `cancelado` and/or `terminado` be excluded or collapsed to keep the board focused on active work? Should `activo: false` (soft-deactivated) orders ever appear on the board?
7. **Dataset size per column / pagination** — the existing `GET /ordenes-trabajo` is paginated (`page`/`pageSize`, max 100). A Kanban board typically wants "all cards matching current filters" rendered at once (or per-column pagination/infinite scroll). This is a real backend/frontend contract decision, not just a UI detail.
8. **Mecánico filter component** — reuse the plain `<select>` pattern from the list page, or use the richer `SearchableSelect` component (already used elsewhere) given a taller mechanic pool could make a plain dropdown unwieldy?

## Approaches

1. **Dedicated aggregated Panel endpoint** — new `GET /ordenes-trabajo/panel` (or similar) that accepts all filters (estado, mecanico, prioridad, date range) and returns `{ stats: {...}, mecanicosTrabajando: [...], data: [...] }` in one call, computed server-side following the exact `buildOrdenTrabajoWhere` + `$transaction` pattern already used by `findAll`.
   - Pros: single round trip; keeps aggregation logic in the service layer (consistent with existing per-estado `counts` pattern); avoids shipping large unpaginated datasets just to compute stats client-side; easiest to keep correct as data grows.
   - Cons: new endpoint, DTO, and service method to design and test from scratch; response contract needs careful design (especially the unpaginated Kanban dataset).
   - Effort: Medium.

2. **Reuse existing `GET /ordenes-trabajo` client-side** — extend `ListOrdenesTrabajoQueryDto`/`buildOrdenTrabajoWhere` with date-range params only, and have the Panel page call the existing list endpoint (with a large `pageSize` or a new "no pagination" mode) for the board, computing "mecánicos trabajando" and "del día" client-side from the returned rows.
   - Pros: minimal new backend surface — just add date filters to the DTO/where-builder that already exists; reuses `listOrdenesTrabajo()` client-side entirely.
   - Cons: fights the existing pagination contract (Kanban needs the full matching set, not a page); pushes aggregation logic (distinct mechanics, "today" counting) into the frontend, duplicating business logic that today lives server-side (per-estado counts); risk of stats being wrong/incomplete once volume grows past one page.
   - Effort: Low-to-Medium up front, but carries real risk of growing messier than approach 1 once pagination/perf edge cases surface.

3. **Hybrid** — extend the existing endpoint with date-range filters and use it (unpaginated-friendly) to drive the Kanban board, but add one small new endpoint purely for the stats/mecánicos-trabajando summary block.
   - Pros: isolates the trickier aggregation (distinct mechanics, "today" count) in a small, independently testable endpoint while reusing existing filter infra for the board itself.
   - Cons: two round trips instead of one; still has to resolve the "full dataset vs. paginated" question for the board half.
   - Effort: Medium.

## Recommendation

Approach 1 (dedicated aggregated Panel endpoint) is the best fit — it mirrors the codebase's existing convention of computing summary counts server-side inside the same `$transaction` as the list query (`findAll`'s `counts`), rather than pushing aggregation logic into the frontend. It also cleanly resolves the "full dataset for Kanban vs. paginated list" tension by giving the Panel its own contract instead of overloading the existing paginated list endpoint. Final choice is for `sdd-propose`, but the open questions above (especially #1/#3/#4 date-field semantics and #5 drag-write semantics) should be resolved as explicit product decisions before design, since they materially change the backend contract.

## Risks

- `openspec/specs/ordenes-trabajo-management/spec.md` is stale regarding `cancelado` (states "no `cancelado` state exists" when the schema now has it) — this should be corrected, ideally as part of this change's spec delta, to avoid compounding spec/schema drift.
- No drag-and-drop library exists in `client/package.json` — if approach requires true drag interactions, a new dependency must be chosen and vetted (bundle size, React 18/Next 14 compatibility, accessibility).
- The asymmetry between `iniciar` (cascading, `pendiente`-only, 409-guarded) and generic `PATCH` (free transition, no cascade) means naive drag-to-column implementation could silently produce different side effects than the existing dedicated "Iniciar trabajo" button elsewhere in the app, causing inconsistent detalle states if not deliberately reconciled.
- "Mecánicos trabajando" and "del día" have no existing server-side aggregation to reuse — must be built and tested from scratch, including deciding how `activo: false` orders interact with both.

## Ready for Proposal

Yes, with the explicit condition that `sdd-propose` resolve the open questions above (date-field semantics, stats-vs-filter scope, Kanban drag-write behavior and column scope, dataset-size/pagination contract) as concrete product decisions before `sdd-spec`/`sdd-design` proceed.
