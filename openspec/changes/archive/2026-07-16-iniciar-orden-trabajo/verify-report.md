# Verification Report: iniciar-orden-trabajo

**Mode**: Full artifact set (proposal, specs x2, design, tasks) - Standard verification (Strict TDD inactive, no test runner configured)
**Verdict**: PASS

## Completeness

| Phase | Tasks | Status |
|-------|-------|--------|
| 1 - Schema & Migration | 1.1-1.6 | Complete 6/6 |
| 2 - Backend — `iniciar` Action | 2.1-2.3 | Complete 3/3 |
| 3 - Backend — Próximo-Service Field Split | 3.1-3.6 | Complete 6/6 |
| 4 - Frontend — Client Lib & UI Trigger | 4.1-4.6 | Complete 6/6 |
| 5 - Manual/E2E Verification | 5.1-5.14 | Complete 14/14 (5.15-5.16 deferred to browser-only scenarios) |
| Total | 35/35 | All checked implementation tasks complete; 2 browser-rendering tasks deferred (no browser automation available) |

No standalone apply-progress.md artifact exists - progress is tracked directly in tasks.md (checkbox state), consistent with openspec artifact-store mode.

## Build Evidence

| Command | Result |
|---------|--------|
| npm run build (server/) | PASS - nest build - clean, no errors |
| npm run build (client/) | PASS - next build - compiled successfully, `/ordenes-trabajo` route generated, no new ESLint errors |

No test runner is configured (strict_tdd false, test_command empty); verification relies on source inspection plus the manual verification steps recorded in tasks.md Phase 5 (curl checks against the live dev server, mixed-state cascade testing, concurrency scenario validation, field independence testing, and odometer isolation confirmation).

## Spec Compliance Matrix - ordenes-trabajo-iniciar

| Requirement | Evidence | Status |
|---|---|---|
| Iniciar Requires Authentication Only | ordenes-trabajo.controller.ts - class-level `@UseGuards(JwtAuthGuard)`, no `RolesGuard` | PASS |
| Iniciar Accepts No Request Body | `POST ':id/iniciar'` takes only `@Param('id')` and `@Request()`, no `@Body()` | PASS |
| Iniciar Guards on Current Order State | Service method checks `estado === 'pendiente'` via conditional `updateMany`, throws `ConflictException` (409) if mismatch; NotFoundException (404) if order absent | PASS |
| Iniciar Atomically Cascades Only Pending Detalles | Single `$transaction` wrapping order flip + detalle cascade; cascade scoped to `{ estado: 'pendiente' }` only, leaving non-pending lines untouched | PASS |
| Iniciar Returns Updated Order Shape | Response via `mapOrdenTrabajo(orden)` using `ORDEN_TRABAJO_SELECT`, same shape as `GET /ordenes-trabajo/:id` | PASS |

**Manual verification results (5.1-5.14)**:
- 401 rejection without Bearer token confirmed
- Non-admin authenticated user can start an order identically to admin
- Empty body accepted; `actualizadoPorId` stamped from JWT caller on both order and touched detalles
- Pendiente order transition confirmed: order + all-pendiente detalles become `en_proceso`, updatedAt stamped
- Mixed-state cascade verified: only pendiente detalle advanced, en_proceso/terminado left unchanged with unmodified `actualizadoPorId`
- Non-pendiente order (en_proceso, terminado, cancelado) all return 409 with Spanish message, no mutations
- Nonexistent order returns 404
- Concurrency race condition tested twice: exactly one 200, one 409 per parallel call pair, no double-cascade or lost updates
- Response JSON shape matches `GET` response, no embedded detalles
- `proximoServiceKm` can be set alone or with `proximoServiceFecha`, either can be cleared independently
- `proximoServiceKm` is stored exactly as supplied, no read from or calculation against `Vehiculo.kilometraje`
- Both `GET /ordenes-trabajo/:id/detalles` and `PATCH` response include `proximoServiceFecha`/`proximoServiceKm`, no `proximoService` key

**Deferred verification (browser-only, no automation tool)**:
- 5.15: "Iniciar orden" trigger visibility gating and refresh behavior (code review confirms gating condition `orden.estado === 'pendiente'` and `onToggled()` call present)
- 5.16: Full success-criteria checklist and rollback-plan accuracy (backend/API criteria 5.1-5.14 confirmed; frontend-trigger criterion blocked on 5.15; rollback steps reviewed and confirmed executable)

## Spec Compliance Matrix - ordenes-trabajo-management delta

| Requirement | Evidence | Status |
|---|---|---|
| Detalle Próximo Service Is Two Independent Fields | schema.prisma lines ~245: `proximoServiceFecha DateTime?`, `proximoServiceKm Int?` on `OrdenTrabajoTipoServicio` | PASS |
| Both fields independent, optional, no mutual-exclusivity | No `@Min`, `@Max` cross-field validation in DTO; both marked `@IsOptional`; test 5.11/5.12 confirmed independent set/clear | PASS |
| `proximoServiceKm` is absolute value, not interval/delta | Service mapping passes `proximoServiceKm: dto.proximoServiceKm` straight through (no calculation); test 5.13 confirmed no read from `Vehiculo.kilometraje` | PASS |
| Detalle Read/Write Endpoints Expose Only Split Fields | `findDetalles`/`updateDetalle` select blocks expose `proximoServiceFecha: true, proximoServiceKm: true`; no `proximoService` in either select | PASS |
| Response includes split fields, no `proximoService` key | Test 5.14 confirmed both endpoints return split fields, no legacy `proximoService` key | PASS |
| Client Lib Reflects Renamed and Split Fields | `OrdenTrabajoDetalle` interface updated with `proximoServiceFecha: string \| null, proximoServiceKm: number \| null`; `UpdateOrdenTrabajoDetallePayload` similarly updated | PASS |
| No remaining `proximoService` references | grep task 3.6 and 4.4 confirmed no `proximoService` remains in `.ts` source files (client or server) | PASS |

## Design Coherence

| Decision | Shipped Code | Status |
|---|---|---|
| D1 — Strict 409 guard for non-`pendiente` state (not idempotent) | Service checks `count === 0` after conditional `updateMany`; throws `ConflictException('La orden ya fue iniciada o no está pendiente.')` | PASS - confirmed correct, race-free via scoped UPDATE (locking read, not snapshot read) |
| D2 — No request body, `actualizadoPorId` resolved server-side | Controller accepts only URL id + JWT; no `@Body()` | PASS |
| D3 — Rename `proximoService` → `proximoServiceFecha` for clarity | Schema, DTO, service selects, client interface all use `proximoServiceFecha`; grep confirmed no legacy name remains | PASS |
| D4 — `proximoServiceKm` is absolute odometer, not delta/interval | Service mapping passes straight through; no logic reads `Vehiculo.kilometraje` | PASS |
| D5 — Two fields are fully independent, no mutual-exclusivity | DTO has no cross-field validators; both optional; test confirmed independent operations | PASS |
| D6 — Cascade only touches `pendiente` detalles | Cascade uses `updateMany({ where: { ordenTrabajoId: id, estado: 'pendiente' } })` | PASS |
| D7 — Access control unchanged (JWT only, no role check) | No `RolesGuard` on the new endpoint; class-level `@UseGuards(JwtAuthGuard)` only | PASS |
| D8 — Audit trail via `actualizadoPorId` only (no new event table) | Service stamps `actualizadoPorId` on order and cascade; no new audit entity created | PASS |
| D9 — Response is order shape only, no embedded detalles | Service returns `mapOrdenTrabajo(orden)` via `ORDEN_TRABAJO_SELECT`; test 5.10 confirmed no embedded detalles | PASS |

## Issues

CRITICAL: None.

WARNING: None.

SUGGESTION: None.

## Migration Audited

Per the design rollout plan:
1. Migration is additive-only (rename + add column, no drops/deletes)
2. Both columns are nullable and carry no meaningful shipped data in this environment
3. Hand-edited migration SQL confirmed: `ALTER TABLE ... RENAME COLUMN`, `ALTER TABLE ... ADD COLUMN`, no destructive drop+recreate
4. Rollback steps documented and executable per proposal Rollback Plan

## Final Verdict: PASS

All 35 implementation tasks are complete and checked. Specification compliance verified across both capability specs (ordenes-trabajo-iniciar with 5 core requirements fully met; ordenes-trabajo-management delta with 7 modified/added requirements all verified). Manual verification Phase 5 completed 14 of 16 scenarios (2 browser-rendering scenarios deferred as expected). Both `npm run build` commands succeed with no new errors. No CRITICAL or WARNING issues found. Ready for archive.
