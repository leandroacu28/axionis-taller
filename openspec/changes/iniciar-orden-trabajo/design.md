# Design: Iniciar Orden de Trabajo + split próximo service into date/km

## Technical Approach

Two threaded changes on the existing `ordenes-trabajo` module, matching its established style (thin controller, service owns all Prisma + `$transaction`, `ORDEN_TRABAJO_SELECT` whitelist, Spanish Nest exceptions):

1. A dedicated `POST /ordenes-trabajo/:id/iniciar` business action that atomically flips a `pendiente` order and its still-`pendiente` detalles to `en_proceso` inside one interactive `$transaction`, mirroring `create`/`update`.
2. A schema/DTO/read-shape/client rename+add: `proximoService` → `proximoServiceFecha` and new `proximoServiceKm Int?`, threaded end-to-end.

## Architecture Decisions

### Decision: D1/Q1 — Guard is strict 409 for ANY non-`pendiente` state (CONFIRMED)

**Choice**: `iniciar` on an order whose `estado !== 'pendiente'` throws `ConflictException('La orden ya fue iniciada o no está pendiente.')` → HTTP 409. Applies to `en_proceso`, `terminado`, and `cancelado` alike. `NotFoundException` (404) if the order does not exist.
**Alternatives considered**: idempotent no-op (return 200 unchanged) for already-`en_proceso`, 409 only for `terminado`/`cancelado`.
**Rationale**: 409 is correct "wrong-state-for-action" semantics; safe-by-rejection makes a double-click/retry fail loudly instead of silently re-stamping `actualizadoPorId`. Start strict; relax to idempotent later only if the UI needs it.

**Concurrency (CRITICAL — must not regress)**: The 409 guard is enforced by a **conditional `updateMany({ where: { id, estado: 'pendiente' } })` and a `count === 0` check**, NOT by a plain read-then-branch. Under MySQL InnoDB's default REPEATABLE READ, `tx.ordenTrabajo.findUnique(...)` is a non-locking snapshot read: it cannot serialize two near-simultaneous `POST :id/iniciar` calls, and a subsequent unconditional `update({ where: { id } })` would re-stamp `actualizadoPorId` on the second call and silently swallow the mandated 409 (violating spec + D1). The scoped `UPDATE ... WHERE id = ? AND estado = 'pendiente'` is a *current* read that takes the exclusive row lock at statement execution, so the second transaction matches zero rows (`count === 0`) and we raise the `ConflictException`. This is the same race-free technique already used for the detalle cascade. The `findUnique` remains ONLY to distinguish 404 (order absent) from 409 (order present but not `pendiente`). All of this runs INSIDE the transaction, consistent with the in-tx guard philosophy of `create`/`update`.

### Decision: D9/Q2 — Response is the order shape only (CONFIRMED)

**Choice**: `iniciar` returns `mapOrdenTrabajo(orden)` via `ORDEN_TRABAJO_SELECT` — the same shape as `findOne`/`create`/`update`. It does NOT embed the updated detalles.
**Alternatives considered**: embed the cascaded detalles in the response.
**Rationale**: the only current consumer is the list/card row, which needs the refreshed order (estado badge) and already types `OrdenTrabajoListItem`. The list page renders no live detalle state, so embedding detalles would require a second select shape with zero consumer. A caller that needs detalles re-fetches `GET /ordenes-trabajo/:id/detalles`.

### Decision: Q3 — New "Iniciar orden" action lives in `AccionesMenu`, shown only when `estado === 'pendiente'` (CONFIRMED)

**Choice**: Add an "Iniciar orden" item to the existing `AccionesMenu` dropdown (table view) and mirror it in the card footer, rendered ONLY when `orden.estado === 'pendiente'`. It calls `iniciarOrdenTrabajo(orden.id)`, then `onToggled()` (re-fetch), with `showSuccess`/`showError` — reusing the exact async+refresh pattern of `handleToggleActivo`.
**Alternatives considered**: a standalone detail-page button; repurposing the existing "Iniciar trabajo" link.
**Rationale**: the existing "Iniciar trabajo" `<Link>` navigates to the DEFERRED `/ordenes-trabajo/[id]/trabajo` work page and is a distinct concern — do NOT overload it. The new action is a one-click state transition best expressed as a menu/footer action next to Editar/Desactivar, gated on `pendiente` so it disappears once the order is started (no disabled-but-visible clutter).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modify | Rename `proximoService` → `proximoServiceFecha`; add `proximoServiceKm Int?` on `OrdenTrabajoTipoServicio` |
| `server/prisma/migrations/<ts>_orden_trabajo_proximo_service_split/` | Create | Rename column + add nullable Int column |
| `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` | Modify | Add `iniciar()`; import `ConflictException`; swap `proximoService` for the two fields in `findDetalles`/`updateDetalle` selects + mapping |
| `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts` | Modify | Add `POST :id/iniciar` route |
| `server/src/ordenes-trabajo/dto/update-orden-trabajo-detalle.dto.ts` | Modify | Rename `proximoService?` → `proximoServiceFecha?`; add `proximoServiceKm?` |
| `client/app/lib/ordenes-trabajo.ts` | Modify | Add `iniciarOrdenTrabajo`; rename field + add `proximoServiceKm` on interface + payload |
| `client/app/(dashboard)/ordenes-trabajo/page.tsx` | Modify | Add gated "Iniciar orden" action in `AccionesMenu` + card footer |

## Interfaces / Contracts

### Prisma schema diff (`OrdenTrabajoTipoServicio`)

```prisma
-  proximoService    DateTime?
+  proximoServiceFecha DateTime?
+  proximoServiceKm    Int?
```

Migration SQL (edit the generated file so the rename preserves the column instead of drop+create; both columns are nullable and carry no shipped data):

```sql
ALTER TABLE `OrdenTrabajoTipoServicio` RENAME COLUMN `proximoService` TO `proximoServiceFecha`;
ALTER TABLE `OrdenTrabajoTipoServicio` ADD COLUMN `proximoServiceKm` INT NULL;
```

### Service — `iniciar` (mirrors `create`/`update` transaction style)

```ts
async iniciar(id: number, actualizadoPorId: number) {
  return this.prisma.$transaction(async (tx) => {
    // Snapshot read ONLY to distinguish 404 (absent) from 409 (present, wrong state).
    const existing = await tx.ordenTrabajo.findUnique({ where: { id }, select: { estado: true } });
    if (!existing) throw new NotFoundException('Orden de trabajo no encontrada.');

    // Race-free guard: the scoped UPDATE is a locking current-read. Two concurrent
    // iniciar calls cannot both flip 'pendiente' -> 'en_proceso'; the loser matches
    // zero rows and gets the mandated 409. A plain update({ where: { id } }) would
    // silently re-stamp actualizadoPorId and swallow the 409 (see D1 Concurrency note).
    const { count } = await tx.ordenTrabajo.updateMany({
      where: { id, estado: 'pendiente' },
      data: { estado: 'en_proceso', actualizadoPorId },
    });
    if (count === 0) {
      // existing was confirmed present above, so count === 0 means another
      // transaction already moved it out of 'pendiente'.
      throw new ConflictException('La orden ya fue iniciada o no está pendiente.');
    }

    // Cascade only still-pending lines (D6); lines advanced ahead are left as-is.
    await tx.ordenTrabajoTipoServicio.updateMany({
      where: { ordenTrabajoId: id, estado: 'pendiente' },
      data: { estado: 'en_proceso', actualizadoPorId },
    });

    const orden = await tx.ordenTrabajo.findUnique({ where: { id }, select: ORDEN_TRABAJO_SELECT });
    return mapOrdenTrabajo(orden); // D9: order shape only
  });
}
```

`findDetalles`/`updateDetalle`: replace `proximoService: true` with `proximoServiceFecha: true, proximoServiceKm: true` in both selects; in `updateDetalle.data` map `proximoServiceFecha: dto.proximoServiceFecha ? new Date(dto.proximoServiceFecha) : dto.proximoServiceFecha` and pass `proximoServiceKm: dto.proximoServiceKm` straight through.

### Controller route

```ts
@Post(':id/iniciar')
async iniciar(
  @Param('id', ParseIntPipe) id: number,
  @Request() req: { user: { userId: number; username: string } }
) {
  return this.ordenesTrabajoService.iniciar(id, req.user.userId);
}
```

### DTO diff

```ts
-  @IsOptional() @IsDateString() proximoService?: string | null;
+  @IsOptional() @IsDateString() proximoServiceFecha?: string | null;
+  @IsOptional() @IsInt() @Min(0) proximoServiceKm?: number | null;
```

(`@Min` added to imports from `class-validator`.)

### Client lib diff

```ts
// helper
export async function iniciarOrdenTrabajo(id: number): Promise<OrdenTrabajoListItem> {
  const res = await fetch(`${API_BASE_URL}/ordenes-trabajo/${id}/iniciar`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
  });
  return handleJsonResponse(res, 'No se pudo iniciar la orden de trabajo');
}
// OrdenTrabajoDetalle:  proximoService → proximoServiceFecha: string | null;  + proximoServiceKm: number | null;
// UpdateOrdenTrabajoDetallePayload: proximoService? → proximoServiceFecha?;  + proximoServiceKm?: number | null;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual/e2e | 401 without token; start `pendiente` order → order + only `pendiente` detalles become `en_proceso` in one txn; mixed-state order leaves non-`pendiente` lines untouched; 409 on already-started/terminado/cancelado; 404 on missing id; `actualizadoPorId` stamped from JWT; no `proximoService` key remains anywhere; `PATCH detalles` persists/clears both fields independently | Exercise endpoints against a reachable DB — confirm `DATABASE_URL` before migrating |

## Migration / Rollout

One migration (rename + add column). Reversible per proposal Rollback Plan; orders/detalles already moved to `en_proceso` are legitimate state, not reverted.

`sdd-apply` MUST follow this exact sequence — the `--create-only` step is mandatory, because a default `prisma migrate dev` would auto-generate AND auto-apply a destructive `DROP COLUMN proximoService` + `ADD COLUMN proximoServiceFecha` before anyone can edit the SQL:

1. `prisma migrate dev --create-only --name orden_trabajo_proximo_service_split` — generates the migration file WITHOUT applying it.
2. Hand-edit the generated `migration.sql` so the rename PRESERVES the column (`ALTER TABLE ... RENAME COLUMN proximoService TO proximoServiceFecha;` + `ALTER TABLE ... ADD COLUMN proximoServiceKm INT NULL;`) instead of Prisma's default drop-and-recreate.
3. `prisma migrate dev` (or `prisma migrate deploy` in a deploy context) — applies the edited file.

`sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` targets before running any `prisma migrate` command.

## Open Questions

- [ ] None blocking. Confirm `DATABASE_URL` target at apply time (operational, carried from proposal).
