# Design: Productos consumidos por detalle de orden de trabajo

## Technical Approach

One purely-additive thread on the existing `ordenes-trabajo` module, matching its established style (thin controller, service owns all Prisma + `$transaction`, module-level `*_SELECT` whitelists, Spanish Nest exceptions, guards run **inside** the transaction to close the TOCTOU window):

1. A new explicit join model `OrdenTrabajoTipoServicioProducto` — the same "explicit join carrying per-pair business data" template the parent `OrdenTrabajoTipoServicio` already set — plus one additive migration. Each row is one producto consumed on one detalle, carrying `cantidad`, a **frozen `precioUnitario` snapshot**, and the derived `precioTotal`.
2. Three nested sub-resource endpoints under the existing detalle route family: `POST/PATCH/DELETE :id/detalles/:detalleId/productos[/:lineaId]`. Add is an **upsert-by-`(detalleId, productoId)`** that sums quantity; PATCH sets an absolute quantity; DELETE removes a line.
3. Consumed lines are **embedded inline** in the existing detalle read shape (`GET :id/detalles`) and in `updateDetalle`'s response, exactly the way `tipoServicio`/`diagnostico` are already embedded — one detalle payload, one client type.
4. Frontend: a `searchProductos` helper, new client-lib types + three API functions, and a purpose-built `ProductosConsumidos` sub-section inside `DetalleCard` whose add/update/remove are **immediate per-action writes** (like the diagnóstico inline-create), not deferred into the card's "Completar Servicio" submit.

The whole change is additive: no existing column, row, or contract is renamed or migrated.

## Architecture Decisions

### Decision: Q1 — Model, relation, and audit-FK names (CONFIRMED)

**Choice**:
- Model: **`OrdenTrabajoTipoServicioProducto`** (own `Int @id @default(autoincrement())` PK), mirroring the sibling `OrdenTrabajoTipoServicio`.
- FK to parent detalle: `ordenTrabajoTipoServicioId` / `ordenTrabajoTipoServicio`, **`onDelete: Cascade`** (D5).
- FK to catalog: `productoId` / `producto`, `onDelete: Restrict` — left **implicit** (Prisma's default for a required relation is `RESTRICT` on MySQL), exactly mirroring how the sibling declares `tipoServicio TipoServicio @relation(fields: [tipoServicioId], references: [id])` with no explicit `onDelete` (the generated migration emits `ON DELETE RESTRICT`).
- Audit FK: `actualizadoPorId` / `actualizadoPor`, `onDelete: SetNull`, relation name **`"OrdenTrabajoTipoServicioProductoActualizadoPor"`**. **No `creadoPorId`** (D8 confirmed).
- Back-relations: `productos` on `OrdenTrabajoTipoServicio`; `ordenTrabajoTipoServicioProductos` on `Producto`; `ordenTrabajoTipoServicioProductosActualizados` on `User`.

**Alternatives considered**: a shorter model name (`DetalleProducto`, `LineaProducto`); adding `creadoPorId`.
**Rationale**: the verbose name is the house convention — the sibling is literally `OrdenTrabajoTipoServicio`, and every back-relation in the schema is named after the referencing model (`ordenTrabajoTipoServicioActualizados`, `productosActualizados`, …). Consistency beats brevity here. `creadoPorId` is dropped to mirror the parent detalle's audit posture exactly (the parent tracks only the last updater); a consumed line is created and mutated by the same mechanic in the same flow, so a separate creator stamp adds a column with no consumer.

### Decision: Q1b — Materialize the proposal's "frozen snapshot unit price" as a `precioUnitario` column (CONFIRMED — extends the proposal's enumerated fields)

**Choice**: store **three** money/qty columns — `cantidad`, `precioUnitario`, `precioTotal` (all `Decimal @db.Decimal(10, 2)`) — where `precioUnitario` is the unit price **frozen at first add** and `precioTotal = cantidad × precioUnitario` is always derived from it.

**Alternatives considered**: store only `cantidad` + `precioTotal` (the proposal's literal field list) and **derive** the frozen unit on demand as `precioTotal / cantidad` for the D4 sum-path and the PATCH recompute.
**Rationale**: the proposal itself makes "the frozen snapshot unit price" a first-class concept — D1 ("the snapshot is frozen") and the PATCH requirement verbatim: *"recomputing `precioTotal` from the frozen snapshot unit price × new `cantidad`."* That unit price MUST live somewhere to be recomputed from. Deriving it by division is lossy: `cantidad` is `Decimal(10, 2)` and legitimately fractional (oil in litres, cable in metres — that is exactly why `Producto.unidadMedida` exists), so `precioTotal / cantidad` does **not** round-trip. Example: `precioUnitario = 3.33`, `cantidad = 0.33` → `precioTotal = 1.10` (rounded from `1.0989`); deriving back gives `1.10 / 0.33 = 3.3333… ≠ 3.33`, and the error compounds on every subsequent add/PATCH. Persisting `precioUnitario` makes the freeze explicit, makes both the D4 sum and the PATCH recompute division-free and exactly correct, and is standard invoice-line modeling. This **implements** the proposal's own "frozen snapshot unit price" rather than inventing a requirement; it is still purely additive (one nullable-free column on a brand-new table, no existing data touched). Flagged in Risks so the gatekeeper/user sees the column is one field beyond the proposal's literal enumeration.

### Decision: Q2 — Consumed lines are embedded inline in the detalle read shape (CONFIRMED)

**Choice**: `findDetalles` and `updateDetalle` both add a nested `productos` select to their existing `select`; there is **no** separate read endpoint. Each line exposes `id`, `producto: { id, descripcion }`, `cantidad`, `precioUnitario`, `precioTotal`, `updatedAt`.
**Alternatives considered**: a dedicated `GET :id/detalles/:detalleId/productos` read.
**Rationale**: this is exactly how `tipoServicio` and `diagnostico` are already embedded in the same `select`. The `/trabajo` page loads all detalles once via `listOrdenTrabajoDetalles`; embedding gives the productos sub-section its initial rows with zero extra round-trips and keeps the client's single `OrdenTrabajoDetalle` type authoritative. A separate endpoint would add a fetch and a second type for no consumer. `updateDetalle` must embed it too — otherwise its returned detalle would drop `productos` and the client's `onSaved` merge would wipe them from local state.

### Decision: Q3 — Route, DTO, and method shapes (CONFIRMED)

**Choice**:
- `POST :id/detalles/:detalleId/productos` → `addDetalleProducto`, body `CreateOrdenTrabajoProductoDto { productoId, cantidad }`, returns the affected line (201 default is fine — a line is genuinely created or its quantity mutated; we do not special-case to 200).
- `PATCH :id/detalles/:detalleId/productos/:lineaId` → `updateDetalleProducto`, body `UpdateOrdenTrabajoProductoDto { cantidad }`, returns the updated line.
- `DELETE :id/detalles/:detalleId/productos/:lineaId` → `removeDetalleProducto`, `@HttpCode(204)`, returns nothing.
- DTO files: `dto/create-orden-trabajo-producto.dto.ts` / `dto/update-orden-trabajo-producto.dto.ts`, classes `CreateOrdenTrabajoProductoDto` / `UpdateOrdenTrabajoProductoDto` — following the existing `create-orden-trabajo.dto.ts` / `update-orden-trabajo-detalle.dto.ts` naming.
- `cantidad` validation mirrors the `Decimal`-backed money/qty fields in `create-producto.dto.ts`: `@IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99)` — required, strictly positive (`0.01` min, unlike the catalog's `@Min(0)` because a zero-quantity consumed line is meaningless). `productoId` is `@IsInt()`, required.
**Alternatives considered**: a single `PUT` upsert for both add and set; `@HttpCode(200)` + returning the whole detalle from DELETE.
**Rationale**: three verbs map cleanly to the three user intents (add-or-sum, set-absolute, remove). Returning the single affected line (not the whole detalle) is the minimal payload the client needs to reconcile one row; DELETE has nothing to return, so 204 is correct. The DTO decorator style is copied verbatim from the catalog's `precioVenta`/`cantidadInicial` fields so `class-validator` whitelisting behaves identically.

### Decision: Q3b — Server-side `terminado` guard is NOVEL (CONFIRMED — no precedent to copy)

**Choice**: every producto write (add/update/remove) first loads the detalle and throws `ConflictException('No se pueden modificar los productos de un servicio terminado.')` (HTTP 409) when `detalle.estado === 'terminado'`, via a shared private helper `loadDetalleParaProducto` that also performs the belongs-to check.
**Alternatives considered**: rely only on the client-side `bloqueada` lock (as every other detalle field does today); use `BadRequestException` (400).
**Rationale**: this is genuinely novel — `updateDetalle` has **zero** server-side `terminado` guard today (verified in `ordenes-trabajo.service.ts` lines 357-411); the D3 lock is enforced *only* by `DetalleCard`'s `bloqueada` flag client-side. Because these are new mutation endpoints, the D3 invariant ("locked after Completar Servicio") must be enforced server-side too, or a crafted request bypasses it. 409 ("wrong state for this action") matches the semantics the module already chose for `iniciar` (D1 of the sibling change), not 400 (malformed input). This guard is defense-in-depth: the UI still hides the controls via `bloqueada`, but the server is now the source of truth for the lock.

### Decision: Q3c — Add is an explicit find-then-branch upsert, not Prisma `upsert()` (CONFIRMED)

**Choice**: `addDetalleProducto` does a `findUnique` on the compound key `ordenTrabajoTipoServicioId_productoId`; if a line exists it **sums** (`cantidad = existing.cantidad + incoming`, `precioTotal = existing.precioUnitario × newCantidad`, `precioUnitario` untouched); otherwise it **creates** (`precioUnitario = current Producto.precioVenta`, `precioTotal = precioUnitario × cantidad`). All `Decimal` math uses `Prisma.Decimal` (`.plus`, `.times`), never JS floats.
**Alternatives considered**: Prisma `upsert()` with `increment` on `cantidad`.
**Rationale**: D4's sum-path must recompute `precioTotal` as `newCantidad × precioUnitario`, an expression Prisma's `upsert.update` block cannot represent (it can `increment` a scalar but cannot multiply two of the row's own fields). Find-then-branch inside the existing `$transaction` style is explicit, readable, and lets the create-path read the **current** `precioVenta` to freeze `precioUnitario` while the sum-path deliberately **does not** re-read it (D1 — frozen). The `@@unique([ordenTrabajoTipoServicioId, productoId])` is the concurrency backstop: two racing first-adds resolve to one row + a `P2002` on the loser (same posture the module documents for `descripcion` collisions).

### Decision: Q4 — Reuse the inline `` `$${Number(x).toFixed(2)}` `` currency pattern (CONFIRMED)

**Choice**: display `precioTotal` (and `precioUnitario`, if shown) in the new sub-section with the exact inline snippet from `productos/page.tsx` line 423 — `` `$${Number(linea.precioTotal).toFixed(2)}` `` — not a new shared formatter.
**Alternatives considered**: introduce the first shared `formatCurrency` helper in `client/app/lib/`.
**Rationale**: lowest-effort and consistent with the only currency-formatting precedent in the codebase. A shared formatter is a reasonable future cleanup but is unrequested scope here, and introducing it now would be the *only* caller of a new util. `Number(...)` is mandatory because `precioTotal` arrives as a `Decimal`-serialized **string** (same as `Producto.precio*`).

### Decision: Q3d/UX — Producto-line writes are immediate per-action, not bundled into the card submit (CONFIRMED)

**Choice**: the `ProductosConsumidos` sub-section calls the add/update/remove endpoints **directly and immediately** on each user action and updates its own local list from each response — it does **not** stage changes into `DetalleCard`'s `handleSubmit` ("Completar Servicio") payload. All its buttons are `type="button"` so they never submit the enclosing card `<form>`.
**Alternatives considered**: accumulate line edits in `DetalleCard` state and flush them on "Completar Servicio".
**Rationale**: the user asked to *"agregar los productos, cantidad y el precio total"* and see the total — an immediate "add now, see the server-computed total now" loop, matching the diagnóstico inline-create modal's immediacy. The three sub-resource endpoints are independent of the detalle's field update; bundling would require a batch endpoint (out of scope) and would defer the price snapshot until an unrelated action. The card's `handleSubmit` stays strictly about `estado`/`fechaFinalizacion`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modify | Add `OrdenTrabajoTipoServicioProducto` model; add `productos` back-relation on `OrdenTrabajoTipoServicio`, `ordenTrabajoTipoServicioProductos` on `Producto`, `ordenTrabajoTipoServicioProductosActualizados` on `User` |
| `server/prisma/migrations/<ts>_orden_trabajo_tipo_servicio_producto/migration.sql` | Create | Additive `CREATE TABLE` + 3 FKs + `@@unique` (Prisma-generated, no hand-edit) |
| `server/src/ordenes-trabajo/dto/create-orden-trabajo-producto.dto.ts` | Create | `CreateOrdenTrabajoProductoDto { productoId, cantidad }` |
| `server/src/ordenes-trabajo/dto/update-orden-trabajo-producto.dto.ts` | Create | `UpdateOrdenTrabajoProductoDto { cantidad }` |
| `server/src/ordenes-trabajo/ordenes-trabajo.service.ts` | Modify | Add `ORDEN_TRABAJO_PRODUCTO_SELECT`; `loadDetalleParaProducto`, `loadLinea`, `assertProductoActivo` helpers; `addDetalleProducto`/`updateDetalleProducto`/`removeDetalleProducto`; embed `productos` in `findDetalles` + `updateDetalle` selects |
| `server/src/ordenes-trabajo/ordenes-trabajo.controller.ts` | Modify | Import `Delete`; add the 3 routes |
| `client/app/lib/productos.ts` | Modify | Add `searchProductos` |
| `client/app/lib/ordenes-trabajo.ts` | Modify | Add `OrdenTrabajoProductoLinea` type; extend `OrdenTrabajoDetalle` with `productos`; add `Add/Update` payloads + `add/update/remove` client functions |
| `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx` | Modify | New `ProductosConsumidos` sub-component; render it inside `DetalleCard` gated on `bloqueada` |

## Interfaces / Contracts

### Prisma schema diff

New model:

```prisma
model OrdenTrabajoTipoServicioProducto {
  id                         Int                      @id @default(autoincrement())
  ordenTrabajoTipoServicioId Int
  ordenTrabajoTipoServicio   OrdenTrabajoTipoServicio @relation(fields: [ordenTrabajoTipoServicioId], references: [id], onDelete: Cascade)
  productoId                 Int
  producto                   Producto                 @relation(fields: [productoId], references: [id])
  cantidad                   Decimal                  @db.Decimal(10, 2)
  precioUnitario             Decimal                  @db.Decimal(10, 2)
  precioTotal                Decimal                  @db.Decimal(10, 2)
  actualizadoPorId           Int?
  actualizadoPor             User?                    @relation("OrdenTrabajoTipoServicioProductoActualizadoPor", fields: [actualizadoPorId], references: [id], onDelete: SetNull)
  createdAt                  DateTime                 @default(now())
  updatedAt                  DateTime                 @updatedAt

  @@unique([ordenTrabajoTipoServicioId, productoId])
}
```

Back-relations (added to existing models):

```prisma
// model OrdenTrabajoTipoServicio { ... }
+  productos           OrdenTrabajoTipoServicioProducto[]

// model Producto { ... }
+  ordenTrabajoTipoServicioProductos OrdenTrabajoTipoServicioProducto[]

// model User { ... }
+  ordenTrabajoTipoServicioProductosActualizados OrdenTrabajoTipoServicioProducto[] @relation("OrdenTrabajoTipoServicioProductoActualizadoPor")
```

### Migration SQL

Purely additive — `CREATE TABLE` + FKs + unique index, no data migration, nothing destructive. **Unlike the sibling `proximoService` split, no `--create-only` hand-edit is needed**: a default `prisma migrate dev --name orden_trabajo_tipo_servicio_producto` generates and applies exactly this (Prisma also auto-shortens the unique-index/constraint identifiers to fit MySQL's 64-char limit — do not hand-write them). Expected shape:

```sql
CREATE TABLE `OrdenTrabajoTipoServicioProducto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ordenTrabajoTipoServicioId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` DECIMAL(10, 2) NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,
    `precioTotal` DECIMAL(10, 2) NOT NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrdenTrabajoTipoServicioProducto_ordenTrabajoTipoServicioId_p_key`(`ordenTrabajoTipoServicioId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrdenTrabajoTipoServicioProducto` ADD CONSTRAINT `OrdenTrabajoTipoServicioProducto_ordenTrabajoTipoServicioId_fkey`
  FOREIGN KEY (`ordenTrabajoTipoServicioId`) REFERENCES `OrdenTrabajoTipoServicio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajoTipoServicioProducto` ADD CONSTRAINT `OrdenTrabajoTipoServicioProducto_productoId_fkey`
  FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajoTipoServicioProducto` ADD CONSTRAINT `OrdenTrabajoTipoServicioProducto_actualizadoPorId_fkey`
  FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

(The exact `UNIQUE INDEX` / constraint names are whatever Prisma emits — the snippet shows the truncated form Prisma tends to produce; use the generated file verbatim.)

### DTOs (full bodies)

`dto/create-orden-trabajo-producto.dto.ts`:

```ts
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateOrdenTrabajoProductoDto {
  @IsInt()
  productoId: number;

  // Mirrors create-producto.dto.ts's Decimal-backed money/qty fields, but
  // strictly positive: a zero-quantity consumed line is meaningless.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  cantidad: number;
}
```

`dto/update-orden-trabajo-producto.dto.ts`:

```ts
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateOrdenTrabajoProductoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  cantidad: number;
}
```

### Service (full bodies)

Module-level line select, reused everywhere a line is returned:

```ts
const ORDEN_TRABAJO_PRODUCTO_SELECT = {
  id: true,
  cantidad: true,
  precioUnitario: true,
  precioTotal: true,
  producto: { select: { id: true, descripcion: true } },
  updatedAt: true,
};
```

Private helpers (all accept `tx` so they run inside the transaction, matching `assertTiposServicioActivos`/`assertMecanicoActivo`):

```ts
// NOVEL server-side terminado guard + belongs-to check. No existing method
// guards estado === 'terminado' server-side (updateDetalle does not), so this
// is the enforcement point for D3 on the new producto endpoints.
private async loadDetalleParaProducto(
  client: Prisma.TransactionClient | PrismaService,
  ordenTrabajoId: number,
  detalleId: number
) {
  const detalle = await client.ordenTrabajoTipoServicio.findUnique({
    where: { id: detalleId },
    select: { id: true, ordenTrabajoId: true, estado: true },
  });
  if (!detalle || detalle.ordenTrabajoId !== ordenTrabajoId) {
    throw new NotFoundException('Detalle de orden de trabajo no encontrado.');
  }
  if (detalle.estado === 'terminado') {
    throw new ConflictException('No se pueden modificar los productos de un servicio terminado.');
  }
  return detalle;
}

// Belongs-to check: the línea must belong to this detalle (so one detalle's
// línea can't be edited via another detalleId in the URL). Returns the frozen
// precioUnitario + cantidad needed by the update/sum recompute.
private async loadLinea(
  client: Prisma.TransactionClient | PrismaService,
  detalleId: number,
  lineaId: number
) {
  const linea = await client.ordenTrabajoTipoServicioProducto.findUnique({
    where: { id: lineaId },
    select: { id: true, ordenTrabajoTipoServicioId: true, cantidad: true, precioUnitario: true },
  });
  if (!linea || linea.ordenTrabajoTipoServicioId !== detalleId) {
    throw new NotFoundException('Línea de producto no encontrada.');
  }
  return linea;
}

// Mirrors assertUnidadMedidaActiva / assertTiposServicioActivos. Also returns
// the live precioVenta so the caller can freeze it into precioUnitario, and
// guards the nullable precioVenta (schema: Decimal?).
private async assertProductoActivo(
  client: Prisma.TransactionClient | PrismaService,
  productoId: number
): Promise<{ precioVenta: Prisma.Decimal }> {
  const producto = await client.producto.findUnique({
    where: { id: productoId },
    select: { activo: true, precioVenta: true },
  });
  if (!producto || !producto.activo) {
    throw new BadRequestException('El producto no existe o está inactivo.');
  }
  if (producto.precioVenta == null) {
    throw new BadRequestException('El producto no tiene un precio de venta definido.');
  }
  return { precioVenta: producto.precioVenta };
}
```

Add / upsert (D4 sum; D1 freeze):

```ts
async addDetalleProducto(
  ordenTrabajoId: number,
  detalleId: number,
  dto: CreateOrdenTrabajoProductoDto,
  actualizadoPorId: number
) {
  return this.prisma.$transaction(async (tx) => {
    await this.loadDetalleParaProducto(tx, ordenTrabajoId, detalleId);
    const { precioVenta } = await this.assertProductoActivo(tx, dto.productoId);

    const cantidad = new Prisma.Decimal(dto.cantidad);
    const existing = await tx.ordenTrabajoTipoServicioProducto.findUnique({
      where: {
        ordenTrabajoTipoServicioId_productoId: {
          ordenTrabajoTipoServicioId: detalleId,
          productoId: dto.productoId,
        },
      },
      select: { id: true, cantidad: true, precioUnitario: true },
    });

    if (existing) {
      // D4: re-adding sums into the existing line and KEEPS the frozen
      // precioUnitario (D1) — the current catalog precioVenta is NOT re-read.
      const nuevaCantidad = existing.cantidad.plus(cantidad);
      return tx.ordenTrabajoTipoServicioProducto.update({
        where: { id: existing.id },
        data: {
          cantidad: nuevaCantidad,
          precioTotal: existing.precioUnitario.times(nuevaCantidad),
          actualizadoPorId,
        },
        select: ORDEN_TRABAJO_PRODUCTO_SELECT,
      });
    }

    // New line: freeze precioUnitario from the current catalog precioVenta.
    return tx.ordenTrabajoTipoServicioProducto.create({
      data: {
        ordenTrabajoTipoServicioId: detalleId,
        productoId: dto.productoId,
        cantidad,
        precioUnitario: precioVenta,
        precioTotal: precioVenta.times(cantidad),
        actualizadoPorId,
      },
      select: ORDEN_TRABAJO_PRODUCTO_SELECT,
    });
  });
}
```

Set absolute quantity (recompute from frozen unit):

```ts
async updateDetalleProducto(
  ordenTrabajoId: number,
  detalleId: number,
  lineaId: number,
  dto: UpdateOrdenTrabajoProductoDto,
  actualizadoPorId: number
) {
  return this.prisma.$transaction(async (tx) => {
    await this.loadDetalleParaProducto(tx, ordenTrabajoId, detalleId);
    const linea = await this.loadLinea(tx, detalleId, lineaId);

    const cantidad = new Prisma.Decimal(dto.cantidad);
    return tx.ordenTrabajoTipoServicioProducto.update({
      where: { id: lineaId },
      data: {
        cantidad,
        // Recompute from the FROZEN precioUnitario (D1) — catalog never re-read.
        precioTotal: linea.precioUnitario.times(cantidad),
        actualizadoPorId,
      },
      select: ORDEN_TRABAJO_PRODUCTO_SELECT,
    });
  });
}
```

Remove (D6):

```ts
async removeDetalleProducto(ordenTrabajoId: number, detalleId: number, lineaId: number) {
  return this.prisma.$transaction(async (tx) => {
    await this.loadDetalleParaProducto(tx, ordenTrabajoId, detalleId);
    await this.loadLinea(tx, detalleId, lineaId);
    await tx.ordenTrabajoTipoServicioProducto.delete({ where: { id: lineaId } });
  });
}
```

(No `actualizadoPorId` param — the row is deleted, there is nowhere to stamp it.)

### Read-shape diff (`findDetalles` and `updateDetalle` selects)

Add the nested `productos` block to **both** selects (the two currently-identical detalle selects in the service):

```ts
     select: {
       id: true,
       estado: true,
       trabajoRealizado: true,
       proximoServiceFecha: true,
       proximoServiceKm: true,
       fechaFinalizacion: true,
       tipoServicio: { select: { id: true, descripcion: true } },
       diagnostico: { select: { id: true, descripcion: true } },
+      productos: { select: ORDEN_TRABAJO_PRODUCTO_SELECT, orderBy: { id: 'asc' } },
       updatedAt: true,
     },
```

### Controller routes

```ts
import { /* …existing… */ Delete } from '@nestjs/common';
import { CreateOrdenTrabajoProductoDto } from './dto/create-orden-trabajo-producto.dto';
import { UpdateOrdenTrabajoProductoDto } from './dto/update-orden-trabajo-producto.dto';

@Post(':id/detalles/:detalleId/productos')
async addDetalleProducto(
  @Param('id', ParseIntPipe) id: number,
  @Param('detalleId', ParseIntPipe) detalleId: number,
  @Body() dto: CreateOrdenTrabajoProductoDto,
  @Request() req: { user: { userId: number; username: string } }
) {
  return this.ordenesTrabajoService.addDetalleProducto(id, detalleId, dto, req.user.userId);
}

@Patch(':id/detalles/:detalleId/productos/:lineaId')
async updateDetalleProducto(
  @Param('id', ParseIntPipe) id: number,
  @Param('detalleId', ParseIntPipe) detalleId: number,
  @Param('lineaId', ParseIntPipe) lineaId: number,
  @Body() dto: UpdateOrdenTrabajoProductoDto,
  @Request() req: { user: { userId: number; username: string } }
) {
  return this.ordenesTrabajoService.updateDetalleProducto(id, detalleId, lineaId, dto, req.user.userId);
}

@Delete(':id/detalles/:detalleId/productos/:lineaId')
@HttpCode(204)
async removeDetalleProducto(
  @Param('id', ParseIntPipe) id: number,
  @Param('detalleId', ParseIntPipe) detalleId: number,
  @Param('lineaId', ParseIntPipe) lineaId: number
) {
  return this.ordenesTrabajoService.removeDetalleProducto(id, detalleId, lineaId);
}
```

### Client lib — `productos.ts`

```ts
/**
 * Search helper for the productos-consumidos picker (mirrors searchUnidadesMedida
 * / searchEtiquetas). Restricts to active productos — a consumed line must not
 * reference an inactive producto (see ordenes-trabajo.service.ts's
 * assertProductoActivo).
 */
export async function searchProductos(term: string): Promise<{ id: number; label: string }[]> {
  const result = await listProductos({
    search: term || undefined,
    status: 'activo',
    page: 1,
    pageSize: 20,
  });
  return result.data.map((producto) => ({ id: producto.id, label: producto.descripcion }));
}
```

### Client lib — `ordenes-trabajo.ts`

```ts
// Decimal-backed fields serialize as JSON strings (like Producto.precio*) —
// UI must Number(...) before arithmetic/formatting.
export interface OrdenTrabajoProductoLinea {
  id: number;
  producto: { id: number; descripcion: string };
  cantidad: string;
  precioUnitario: string;
  precioTotal: string;
  updatedAt: string;
}

// EXTEND the existing interface:
export interface OrdenTrabajoDetalle {
  // …existing fields…
  productos: OrdenTrabajoProductoLinea[];
}

export interface AddOrdenTrabajoProductoPayload {
  productoId: number;
  cantidad: number;
}
export interface UpdateOrdenTrabajoProductoPayload {
  cantidad: number;
}

export async function addOrdenTrabajoDetalleProducto(
  ordenId: number,
  detalleId: number,
  data: AddOrdenTrabajoProductoPayload,
): Promise<OrdenTrabajoProductoLinea> {
  const res = await fetch(
    `${API_BASE_URL}/ordenes-trabajo/${ordenId}/detalles/${detalleId}/productos`,
    {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  return handleJsonResponse(res, 'No se pudo agregar el producto al detalle');
}

export async function updateOrdenTrabajoDetalleProducto(
  ordenId: number,
  detalleId: number,
  lineaId: number,
  data: UpdateOrdenTrabajoProductoPayload,
): Promise<OrdenTrabajoProductoLinea> {
  const res = await fetch(
    `${API_BASE_URL}/ordenes-trabajo/${ordenId}/detalles/${detalleId}/productos/${lineaId}`,
    {
      method: 'PATCH',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  return handleJsonResponse(res, 'No se pudo actualizar el producto del detalle');
}

// DELETE returns 204 (no body) — don't run handleJsonResponse (it calls
// res.json() and would throw on an empty body).
export async function removeOrdenTrabajoDetalleProducto(
  ordenId: number,
  detalleId: number,
  lineaId: number,
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/ordenes-trabajo/${ordenId}/detalles/${detalleId}/productos/${lineaId}`,
    { method: 'DELETE', headers: { ...getAuthHeader() } },
  );
  if (!res.ok) {
    const message = await res
      .json()
      .then((body) => body?.message)
      .catch(() => undefined);
    throw new Error(message || 'No se pudo eliminar el producto del detalle');
  }
}
```

### Frontend sub-component — `ProductosConsumidos`

New component inside `client/app/(dashboard)/ordenes-trabajo/[id]/trabajo/page.tsx`, rendered by `DetalleCard` (which now reads `detalle.productos`).

**Props**:

```ts
interface ProductosConsumidosProps {
  ordenId: number;
  detalleId: number;
  productosIniciales: OrdenTrabajoProductoLinea[]; // seed from detalle.productos
  bloqueada: boolean;                              // estado === 'terminado'
}
```

**State**:

```ts
const [lineas, setLineas] = useState<OrdenTrabajoProductoLinea[]>(productosIniciales);
const [productoSel, setProductoSel] = useState<{ id: number; label: string } | null>(null);
const [cantidad, setCantidad] = useState('');   // string input, Number(...) on submit
const [agregando, setAgregando] = useState(false);
const [busyLineaId, setBusyLineaId] = useState<number | null>(null); // per-row update/remove lock
```

**Which API call fires on which action** (all immediate; all no-ops when `bloqueada`):

| User action | Call | Local reconcile |
|-------------|------|-----------------|
| Pick producto + type cantidad + "Agregar" | `addOrdenTrabajoDetalleProducto(ordenId, detalleId, { productoId, cantidad: Number(cantidad) })` | Upsert returned line into `lineas` (replace if `id` present — the sum case — else append); clear `productoSel`/`cantidad` |
| Edit a row's cantidad + "Actualizar" (or blur) | `updateOrdenTrabajoDetalleProducto(ordenId, detalleId, lineaId, { cantidad: Number(next) })` | Replace that line in `lineas` |
| "Quitar" on a row (after `showConfirm`) | `removeOrdenTrabajoDetalleProducto(ordenId, detalleId, lineaId)` | Filter that line out of `lineas` |

**Rendering notes**:
- Each row: producto descripcion, a `cantidad` numeric input, `precioUnitario` and `precioTotal` shown via `` `$${Number(linea.precioTotal).toFixed(2)}` `` (Q4), and a "Quitar" button.
- Producto picker: single-select async combobox backed by `searchProductos` (debounced), following the existing `SearchableSelect` / `TipoServicioMultiSelect` UX conventions (portaled panel, keyboard nav) — **not** a reuse of the multi-select chip model (D11).
- **All buttons/inputs here are `type="button"`** and never call the card's `handleSubmit`; the sub-section lives inside the card `<form>` but must not trigger it (a stray `type="submit"` would fire "Completar Servicio").
- Errors surface via `showError`; successes are silent or a light `showSuccess`, matching the diagnóstico-create immediacy.
- When `bloqueada`, the whole sub-section renders read-only (inputs/buttons disabled), mirroring the card's other fields.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual/e2e | 401 without token on all 3 routes | Call each endpoint without a Bearer token |
| Manual/e2e | Add producto → line persists with server-computed `precioTotal = cantidad × precioVenta` and frozen `precioUnitario`; client cannot supply a price | POST with `{ productoId, cantidad }`; inspect row |
| Manual/e2e | **Add the same producto twice → sums into one row** (`cantidad` grows, `precioTotal` follows, one row only) | POST same `productoId` twice to same detalle; assert single row + summed qty |
| Manual/e2e | **Price snapshot survives a later catalog price change**: add line, change `Producto.precioVenta`, then PATCH the line's cantidad → `precioTotal` uses the OLD frozen `precioUnitario`, not the new catalog price | Add → edit catalog → PATCH cantidad → assert `precioUnitario` unchanged |
| Manual/e2e | PATCH set-absolute-cantidad recomputes `precioTotal` from frozen unit | PATCH `{ cantidad }`; assert `precioTotal = precioUnitario × cantidad` |
| Manual/e2e | **Remove one line among several** leaves the others intact | Add 3 lines, DELETE the middle one, assert other 2 remain |
| Manual/e2e | **Reject add/update/remove on a `terminado` detalle** with 409 + Spanish message | Complete the service, then POST/PATCH/DELETE → expect 409 |
| Manual/e2e | **Reject inactive producto** with clear Spanish message | Deactivate a producto, POST it → expect 400 |
| Manual/e2e | Reject producto with null `precioVenta` | POST a producto lacking `precioVenta` → expect 400 |
| Manual/e2e | `actualizadoPorId` stamped from JWT on add/update (never client-supplied) | Inspect row's `actualizadoPor` after write |
| Manual/e2e | Detalle read exposes each line's `id`, `productoId`/label, `cantidad`, `precioUnitario`, `precioTotal` | `GET :id/detalles` after adding lines |
| Manual/e2e | **Cascade-delete works via the existing `update()` reconciliation** (D5's core risk): remove a tipo de servicio that HAS consumed productos via `PATCH /ordenes-trabajo/:id` → succeeds, no FK violation, lines gone | Add lines to a detalle, then PATCH the order dropping that `tipoServicioId`; assert 200 + lines cascade-deleted |
| Manual/e2e | Belongs-to: a line/detalle from order A cannot be mutated via order B's id in the URL | Cross-id request → expect 404 |
| Manual/e2e | UI: sub-section adds/edits/removes immediately, shows `precioTotal`, and is read-only when `estado === 'terminado'` | Exercise `/ordenes-trabajo/[id]/trabajo` |

Confirm which MySQL instance `DATABASE_URL` targets before running the migration (carried from proposal Known Gaps).

## Migration / Rollout

One additive migration (`CREATE TABLE` + 3 FKs + `@@unique`). **No `--create-only` dance** — nothing is destructive, so `prisma migrate dev --name orden_trabajo_tipo_servicio_producto` generates and applies the correct SQL directly, and Prisma handles the 64-char identifier truncation for the unique index/constraints. `sdd-apply` MUST still confirm the `DATABASE_URL` target before running any `prisma migrate` command.

Rollback follows the proposal Rollback Plan verbatim: drop the table (safe — nothing else references it; parent detalles untouched; nothing decrements stock or reads `precioTotal` elsewhere), then revert the service/controller/DTO/schema back-relations and the client lib + UI additions. Fully clean, no lingering data effect.

## Open Questions

- [ ] None blocking. Q1–Q4 resolved above. Operational only: confirm `DATABASE_URL` target at apply time (carried from proposal). Note for the gatekeeper/user: the design persists a `precioUnitario` column — one field beyond the proposal's literal `cantidad` + `precioTotal` enumeration — to implement the proposal's own "frozen snapshot unit price" correctly (see Decision Q1b); still purely additive.
