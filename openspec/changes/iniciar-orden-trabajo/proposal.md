# Proposal: Iniciar Orden de Trabajo + split próximo service into date/km

## Intent
The `ordenes-trabajo` module can already capture a work order at intake and, with the recently added (still mid-flight, uncommitted) **detalle** work, track each service line (`OrdenTrabajoTipoServicio`) with its own `estado`, `diagnostico`, `trabajoRealizado`, and next-service info. What is **missing is the transition that actually puts a work order into production**: today there is no single action that says "this order is now being worked on." Advancing an order means editing the order's `estado` by hand (via the generic `PATCH /ordenes-trabajo/:id`) and then, separately, walking each detalle card and flipping its `estado` one by one. That is error-prone (a mechanic forgets a line), inconsistent (order says `en_proceso` while three detalles are still `pendiente`), and has no atomic guarantee.

This change delivers a dedicated **"Iniciar orden de trabajo"** action: one explicit, transactional operation that moves a `pendiente` order to `en_proceso` **and** cascades every still-`pendiente` service line to `en_proceso` in the same commit, leaving any line a mechanic already advanced ahead untouched. It is intentionally **not** a side effect of the generic order `PATCH` — starting an order is a distinct business event with its own guard and its own audit stamp, and it should read that way in the API and in the UI.

The same change also **splits the detalle's "próximo service" concept into two independent fields**: the existing date-based next-service field and a new km-based one (absolute odometer value the mechanic types directly). A workshop schedules the next service either by date, by kilometraje, by both, or by neither — the current single `DateTime?` field cannot express "next service at 55.000 km." Because the detalle model is still uncommitted, correcting this now (before it ships) is cheap and avoids a later breaking rename.

This is a **small, tightly-scoped follow-on** to `orden-de-trabajo`, not a new module. Access control stays exactly as it is (JWT only), mirroring every existing section.

## Scope

### In Scope
- **Backend — new "iniciar" action** on the `ordenes-trabajo` module:
  - New service method `iniciar(id, actualizadoPorId)` that runs in a single Prisma transaction and:
    1. Loads the order; 404 if it does not exist.
    2. **Guards on current state**: only an order whose `estado` is `pendiente` may be started (see Decision D1 for the rejection rule when it is `en_proceso` / `terminado` / `cancelado`).
    3. Sets `OrdenTrabajo.estado = en_proceso` and stamps `actualizadoPorId` from the JWT caller.
    4. Sets every `OrdenTrabajoTipoServicio` (detalle) of that order **whose `estado` is currently `pendiente`** to `en_proceso`, stamping each touched detalle's `actualizadoPorId`. Detalles already in any other state (`en_proceso`, `terminado`, `cancelado`) are **left untouched** — a mechanic may have advanced a line ahead of the order.
    5. Returns the updated order in the standard `ORDEN_TRABAJO_SELECT` / `mapOrdenTrabajo` shape so the list/detail can refresh the row.
  - New controller route `POST /ordenes-trabajo/:id/iniciar`, guarded by `JwtAuthGuard` like the rest of the controller. **No request body** — the order id in the URL and the JWT caller are all the inputs; `actualizadoPorId` comes from `req.user.userId`, never client-supplied.
- **Data model — split próximo service into two independent fields** on `OrdenTrabajoTipoServicio`:
  - Rename `proximoService DateTime?` → **`proximoServiceFecha DateTime?`** (date-based next service). *(Rename recommended for clarity/symmetry — see D3; keeping the old name is the fallback.)*
  - Add **`proximoServiceKm Int?`** — the **absolute odometer value** for the next service (the mechanic types the exact future kilometraje, e.g. `55000`; it is **not** an interval/delta added to current mileage, and there is **no** auto-calculation).
  - Both fields are **optional and fully independent** — they can coexist, either may be set alone, and there is **no** mutual-exclusivity validation and **no** "at least one required" rule.
  - One additive/rename migration on `OrdenTrabajoTipoServicio`. Because the detalle table is brand-new and unshipped in this environment, the rename is low-risk (no meaningful production data to migrate).
- **Backend — DTO update**: `UpdateOrdenTrabajoDetalleDto` gains `proximoServiceKm?: number | null` (`@IsOptional`, `@IsInt`, non-negative) and renames `proximoService?` → `proximoServiceFecha?` (still `@IsOptional`, `@IsDateString`). The existing partial-update semantics (a mechanic can set or clear each field independently) are preserved.
- **Backend — read shape**: `findDetalles` and `updateDetalle` `select` blocks expose `proximoServiceFecha` and `proximoServiceKm` in place of `proximoService`. `updateDetalle` maps `proximoServiceFecha` (date string → `Date`) and passes `proximoServiceKm` straight through.
- **Frontend — client lib** (`client/app/lib/ordenes-trabajo.ts`):
  - New `iniciarOrdenTrabajo(id)` helper calling `POST /ordenes-trabajo/:id/iniciar` (no body), returning the updated order.
  - `OrdenTrabajoDetalle` interface: `proximoService` → `proximoServiceFecha: string | null`, add `proximoServiceKm: number | null`.
  - `UpdateOrdenTrabajoDetallePayload`: `proximoService?` → `proximoServiceFecha?`, add `proximoServiceKm?: number | null`.
- **Frontend — minimal "Iniciar" trigger**: expose the start action in the existing order UI (e.g. the order card/row actions on `client/app/(dashboard)/ordenes-trabajo/page.tsx`, enabled only when `estado === 'pendiente'`). The exact placement/label is a small design detail (see Decisions). Any detalle-editing surface that renders próximo service must render the two split fields (date input + numeric km input).

### Explicitly Deferred (not this change)
- **Mechanic-facing "Iniciar trabajo" detail page**: the DTO comment references a mechanic detail page that sends per-card detalle changes; the detalle endpoints exist but the dedicated page is **not built by this change** and is not a prerequisite for the "iniciar" action. If/when that page lands, it consumes the same endpoints. The `client/app/(dashboard)/ordenes-trabajo/[id]/` route group present in the working tree is out of scope here beyond the two split fields it must render.
- **Bulk / multi-order "start"**: this action starts exactly one order per call. No "start all pending orders" operation.
- **Auto-calculating `proximoServiceKm` from current kilometraje + an interval**: explicitly rejected — the field is the absolute value the mechanic types.
- **Access control / roles**: unchanged; no `RolesGuard`, deferred to the future Permisos feature.

### Out of Scope (non-goals)
- **Reverse / "pausar" / "cancelar" bulk actions** — no dedicated action to move an order back to `pendiente` or to bulk-cancel; those stay on the generic `PATCH`.
- **Enforced state machine** — starting is the only cascading transition added; all other `estado` changes remain free via `PATCH` (per the original D7).
- **Notifications / reminders from `proximoServiceFecha` / `proximoServiceKm`** — the fields are stored and displayed; no scheduling, alerting, or "service due" logic is built.
- **Odometer interaction** — `proximoServiceKm` does not read from or write to `Vehiculo.kilometraje`; it is a standalone target value on the detalle.

## Capabilities
### New Capabilities
- `ordenes-trabajo-iniciar`: a dedicated `POST /ordenes-trabajo/:id/iniciar` action that atomically transitions a `pendiente` order and its still-`pendiente` service lines to `en_proceso`, with a state guard and JWT-derived audit stamping. Available to any authenticated user (permission-gating deferred to Permisos).

### Modified Capabilities
- `ordenes-trabajo-management`: the detalle sub-entity (`OrdenTrabajoTipoServicio`) splits its single `proximoService` date field into two independent, optional fields — `proximoServiceFecha` (date) and `proximoServiceKm` (absolute odometer Int) — surfaced through the detalle read/update endpoints and the client lib.

## Approach
The "iniciar" action mirrors the module's existing transactional style: guards and writes run inside a single `this.prisma.$transaction(async (tx) => …)`, exactly like `create`/`update` already do, so the order flip and the detalle cascade either both commit or both roll back — the order can never end up `en_proceso` with its lines left `pendiente` on a partial failure. The detalle cascade is a single `updateMany` scoped to `{ ordenTrabajoId: id, estado: 'pendiente' }`, which is both efficient and exactly expresses "only the still-pending lines." Audit stamping (`actualizadoPorId`) reuses the same JWT-caller pattern already established in `updateDetalle` and the order writes.

Keeping "iniciar" as its own endpoint (rather than special-casing an `estado: 'en_proceso'` value inside the generic `PATCH`) is deliberate: the generic `PATCH` is a field-level edit with no cascade, while starting an order is a business event with a state precondition and a side effect on child rows. Separate endpoints keep each contract honest and make the audit trail legible ("this order was *started*", not "someone edited estado").

The próximo-service split is a straightforward schema/DTO/read-shape/client change threaded end-to-end. The rename half (`proximoService` → `proximoServiceFecha`) is done now precisely because the detalle model is still uncommitted — renaming a field that has already shipped to the client contract would be a breaking change; renaming it before it ships is a no-cost clarity win and gives the two next-service fields symmetric, self-describing names.

## Decisions (documented for later review/override)
- **D1 — Guard when the order is not `pendiente` (design must confirm)**: this specific edge case was **not** put to the user, so a sensible default is proposed for `design.md` to confirm. **Proposed rule**: `POST /ordenes-trabajo/:id/iniciar` on an order whose `estado` is not `pendiente` is **rejected with HTTP 409 Conflict** (`ConflictException`, Spanish message e.g. "La orden ya fue iniciada o no está pendiente."). *Rationale*: 409 is the correct semantics for "resource is in the wrong state for this action"; it also makes a double-click / retry safe-by-rejection rather than silently re-stamping. **Alternative to weigh in design**: make the call **idempotent** for an already-`en_proceso` order (return 200 with the order unchanged) and only 409 for `terminado`/`cancelado`. Recommendation: start strict (409 for any non-`pendiente`), relax later if the UI needs idempotency.
- **D2 — No request body; single order per call**: the endpoint takes only the URL id and the JWT caller. `actualizadoPorId` is resolved server-side from `req.user.userId`, never client-suppliable — mirrors `updateDetalle` / the order writes. *Rationale*: nothing else is needed to start an order; keeps the contract minimal and un-spoofable.
- **D3 — Rename `proximoService` → `proximoServiceFecha`**: recommended so the date field and the new `proximoServiceKm` read as a symmetric pair. *Rationale*: clarity, and it is free to do now (field is unshipped). *Fallback*: if design prefers minimal churn, keep `proximoService` as the date field and only add `proximoServiceKm` — but then the two related fields have asymmetric names.
- **D4 — `proximoServiceKm` is an absolute odometer value, stored directly**: no delta, no interval, no auto-calc from `Vehiculo.kilometraje`. `Int?`, optional, non-negative. *Rationale*: user-confirmed decision.
- **D5 — The two próximo-service fields are independent**: both optional, may coexist, no mutual-exclusivity and no "at least one required" validation. *Rationale*: user-confirmed decision.
- **D6 — Detalle cascade only touches `pendiente` lines**: lines already `en_proceso`/`terminado`/`cancelado` are left as-is. *Rationale*: user-confirmed — a line advanced ahead of the order must not be regressed or double-stamped.
- **D7 — Access control unchanged**: `JwtAuthGuard` only, no role check on the new endpoint. *Rationale*: consistent with every section; deferred to Permisos.
- **D8 — Audit trail via existing `actualizadoPorId` only**: no new audit-log entity or event table is introduced for the "start" event beyond stamping `actualizadoPorId` on the order and the touched detalles. *Rationale*: consistent with the module's existing audit posture; a richer audit log is out of scope.
- **D9 — Response shape**: `iniciar` returns the updated order in the standard `ORDEN_TRABAJO_SELECT` / `mapOrdenTrabajo` shape (not the detalle list). *Rationale*: the caller (list/detail row) needs the refreshed order; detalles can be re-fetched via `GET /ordenes-trabajo/:id/detalles` if the UI needs them. Design may confirm whether the response should also embed the updated detalles.

## Rollback Plan
This change is small and mostly additive. Rollback is mechanical:
1. Revert the timestamped migration: rename `proximoServiceFecha` back to `proximoService` and drop the `proximoServiceKm` column. Safe — both are nullable and (in this environment) carry no meaningful data.
2. Remove the `iniciar` service method and the `POST /ordenes-trabajo/:id/iniciar` controller route. Nothing else depends on them; no data was destroyed by the action (it only advanced `estado` values, which remain valid).
3. Revert `UpdateOrdenTrabajoDetalleDto` (drop `proximoServiceKm`, rename `proximoServiceFecha` → `proximoService`) and the matching `select` blocks in `findDetalles` / `updateDetalle`.
4. Revert `client/app/lib/ordenes-trabajo.ts` (drop `iniciarOrdenTrabajo`, revert the two interface/payload field renames) and remove the frontend "Iniciar" trigger.
- **Note**: orders/detalles already moved to `en_proceso` by the action are **not** reverted to `pendiente` by a rollback — those are legitimate state values, not corruption. This is the only lingering data effect and it is benign.

## Known Gaps / Accepted Tradeoffs
- **Non-`pendiente` guard rule is a proposed default, not user-confirmed**: D1 picks 409-reject as the sensible default and flags idempotency as the alternative; `design.md` must confirm before apply.
- **No dedicated audit event for "start"**: the only trace that an order was *started* (vs. field-edited) is the `estado` value plus `actualizadoPorId`/`updatedAt`. Accepted for this scope (D8).
- **Rename ripples through the API contract**: `proximoService` → `proximoServiceFecha` changes the JSON field name returned by the detalle endpoints and consumed by the client lib. Because the field is unshipped, no external consumer breaks; still, every reader must be updated in lockstep (server select + client interface), enforced at spec/apply time.
- **No shared type package**: detalle payload/response types remain duplicated between `server/` DTOs and `client/app/lib/`; follows the existing "change one, change the other" convention.
- **`server/.env` DB target not verified in this environment**: this change adds a migration; `sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` points at before running it.

## Open Questions
- **Q1 (design)**: 409-reject vs. idempotent-no-op for an already-`en_proceso` order? (See D1 — default: 409-reject.)
- **Q2 (design)**: should the `iniciar` response embed the updated detalles, or is the order shape enough with a separate `GET …/detalles` follow-up? (See D9 — default: order shape only.)
- **Q3 (design/spec)**: exact placement and label of the frontend "Iniciar" trigger (list row action vs. detail page button), and its disabled/hidden condition (only when `estado === 'pendiente'`).

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Non-atomic start leaves order `en_proceso` while some detalles stay `pendiente` | Med | Single Prisma `$transaction` wrapping the order flip + the `updateMany` cascade; both commit or both roll back |
| Cascade wrongly regresses/re-stamps a line already advanced ahead of the order | Med | `updateMany` scoped to `estado: 'pendiente'` only (D6); `sdd-verify` checks a mixed-state order |
| Wrong guard choice makes retries/double-clicks misbehave | Med | D1 default (409-reject) is safe-by-rejection; design confirms; idempotency is the documented alternative |
| Field rename breaks a detalle reader left un-updated (server select or client lib out of sync) | Med | Field is unshipped; rename threaded end-to-end in one change; spec lists every touch point; `sdd-verify` greps for the old `proximoService` name |
| `proximoServiceKm` misread as an interval/delta rather than an absolute value | Low | D4 states absolute-value semantics explicitly; UI label makes it clear ("Próximo service (km)") |
| New migration runs against the wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating (see Known Gaps) |

## Success Criteria
- [ ] `POST /ordenes-trabajo/:id/iniciar` requires a valid Bearer token (401 otherwise) — no role check.
- [ ] Starting a `pendiente` order sets its `estado` to `en_proceso` and sets every detalle whose `estado` was `pendiente` to `en_proceso`, in a single transaction.
- [ ] Detalles already `en_proceso` / `terminado` / `cancelado` are left unchanged by the action.
- [ ] The order's `actualizadoPorId` and each touched detalle's `actualizadoPorId` are stamped from the JWT caller, never from client input; the endpoint accepts no request body.
- [ ] Calling `iniciar` on a non-`pendiente` order is rejected per the confirmed D1 rule (default: 409 Conflict), with a clear Spanish message, and does not mutate any row.
- [ ] Calling `iniciar` on a non-existent order returns 404.
- [ ] `OrdenTrabajoTipoServicio` exposes `proximoServiceFecha` (date) and `proximoServiceKm` (Int) as two independent, optional fields; both may be set, either alone, or neither.
- [ ] `PATCH /ordenes-trabajo/:id/detalles/:detalleId` accepts and independently persists/clears `proximoServiceFecha` and `proximoServiceKm`.
- [ ] `GET /ordenes-trabajo/:id/detalles` returns both fields; no endpoint still returns the old `proximoService` key.
- [ ] The client lib exposes `iniciarOrdenTrabajo(id)` and the updated detalle interface/payload with the two split fields.
- [ ] The frontend surfaces an "Iniciar" trigger that is available only for `pendiente` orders and refreshes the order state on success.
- [ ] The migration is additive/rename-only; rollback follows the Rollback Plan (with the documented benign `estado`-not-reverted caveat).
