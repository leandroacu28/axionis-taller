# Design: Unidades de Medida CRUD (Create, List, Update)

## Technical Approach

Add a NestJS `unidades-medida` module that is a verbatim copy of the shipped `service-types` module **minus the Excel export** (no `export` route, no `exportToExcel`, no export DTO, no ExcelJS). It keeps the same thin controller / service-owns-all-Prisma / `class-validator` DTO / `SELECT` whitelist / `buildWhere` + `$transaction` list / pre-check + `P2002` duplicate backstop shape. Frontend adds a client-rendered `/unidades-medida` page with a shared `UnidadMedidaFormModal` and a `lib/unidades-medida.ts` fetch wrapper, mirroring `tipos-servicio` **minus the export button/function**. One additive Prisma migration adds the `UnidadMedida` model. All endpoints are guarded by `JwtAuthGuard` only (no role guard exists in the codebase). The `UnidadMedida` model reuses the exact `TipoServicio` dual-audit shape; `create()` stamps both `creadoPorId` + `actualizadoPorId`, and `update()` takes an actor-id parameter to stamp `actualizadoPorId`.

## Data Model

Append to `server/prisma/schema.prisma` (identical shape to `TipoServicio`, lines 102-112):

```prisma
model UnidadMedida {
  id                 Int      @id @default(autoincrement())
  descripcion        String   @unique
  activo             Boolean  @default(true)
  creadoPorId        Int?
  creadoPor          User?    @relation("UnidadMedidaCreadoPor", fields: [creadoPorId], references: [id], onDelete: SetNull)
  actualizadoPorId   Int?
  actualizadoPor     User?    @relation("UnidadMedidaActualizadoPor", fields: [actualizadoPorId], references: [id], onDelete: SetNull)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

Add two back-relation arrays on `User` alongside the existing `tiposServicioCreados`/`tiposServicioActualizados`:

```prisma
  unidadesMedidaCreadas      UnidadMedida[] @relation("UnidadMedidaCreadoPor")
  unidadesMedidaActualizadas UnidadMedida[] @relation("UnidadMedidaActualizadoPor")
```

Additive-only migration (new table + two nullable FKs), reversible per the proposal Rollback Plan. `sdd-apply` MUST confirm `DATABASE_URL` before running `prisma migrate`.

## Backend Module Structure — `server/src/unidades-medida/`

| File | Contents (mirror of `service-types`, export stripped) |
|------|--------|
| `unidades-medida.module.ts` | `@Module({ controllers: [UnidadesMedidaController], providers: [UnidadesMedidaService] })` |
| `unidades-medida.controller.ts` | `@Controller('unidades-medida')`, class-level `@UseGuards(JwtAuthGuard)`; routes `GET /`, `GET /:id`, `POST /`, `PATCH /:id` — **no `GET /export`** |
| `unidades-medida.service.ts` | `findAll`, `findOne`, `create`, `update` + `buildUnidadMedidaWhere` + `isDescripcionConflict` — **no `exportToExcel`, no ExcelJS, no Excel helpers** |
| `dto/create-unidad-medida.dto.ts` | `descripcion: @IsString @IsNotEmpty @MaxLength(191)`; `activo?: @IsOptional @IsBoolean` |
| `dto/update-unidad-medida.dto.ts` | same field set (no `PartialType`) |
| `dto/list-unidades-medida-query.dto.ts` | `page/pageSize (Max 100)/search/status` + `UnidadMedidaStatusFilter = 'all' \| 'activo' \| 'inactivo'` |

**No `export-*-query.dto.ts`.** Register in `server/src/app.module.ts` (`import { UnidadesMedidaModule }` + add to `imports`).

`UNIDAD_MEDIDA_SELECT` projects `{ id, descripcion, activo, createdAt, updatedAt }` plus both audit relations as `{ id, username, nombre, apellido }` (four-field shape, matching `SERVICE_TYPE_SELECT` and the list column's name→username fallback). `DUPLICATE_DESCRIPCION_ERROR = 'Ya existe una unidad de medida con esa descripción.'`

Service methods (mirror `service-types.service`):
- `findAll(query)` — `$transaction([findMany(where,select,orderBy id asc,skip,take), count(where), count({...searchWhere, activo:true})])` → `{ data, total, activeCount }`.
- `findOne(id)` — `findUnique` or `NotFoundException('Unidad de medida no encontrada.')`.
- `create(dto, creadoPorId)` — pre-check `findUnique({ where:{ descripcion } })` → `ConflictException`; then `create` stamping `creadoPorId` + `actualizadoPorId: creadoPorId`; catch `isDescripcionConflict` → `ConflictException` (P2002 backstop).
- `update(id, dto, actualizadoPorId)` — `findUnique(id)` or `NotFoundException`; `findFirst({ descripcion, NOT:{ id } })` → `ConflictException`; then `update` stamping `actualizadoPorId`; P2002 backstop.

**Audit stamping mechanics**: the controller injects `@Request() req: { user: { userId: number; username: string } }` on `POST` and `PATCH`, passing `req.user.userId` as the service's last argument. The actor id is JWT-sourced server-side; no `creadoPorId`/`actualizadoPorId` appears in any DTO, and global `whitelist: true` strips stray client fields.

## Frontend

- `client/app/lib/unidades-medida.ts` — mirror `lib/service-types.ts`: `UnidadMedidaListItem`, `Create/UpdateUnidadMedidaPayload`, `handleJsonResponse<T>`, `ListUnidadesMedidaParams`, `PaginatedUnidadesMedida`, and `listUnidadesMedida`/`getUnidadMedida`/`createUnidadMedida`/`updateUnidadMedida`. **No `exportUnidadesMedida`, no `ExportParams`.** Fallback messages reworded to "unidad(es) de medida".
- `client/app/(dashboard)/unidades-medida/page.tsx` — mirror `tipos-servicio/page.tsx` (debounce 350ms, `DEFAULT_STATUS_FILTER='activo'`, `PAGE_SIZE_OPTIONS=[10,25,50]`, portal actions menu, local SVG icons, light-mode table card). **Remove the export button and the `ExcelFileIcon`/`exportUnidadesMedida` wiring.** Columns: `#`, `Descripción`, `Creación`, `Estado`, `Acciones`. Renders `<UnidadMedidaFormModal>`. Copy reworded to "Unidades de Medida" / "Nueva unidad de medida".
- `client/app/(dashboard)/unidades-medida/UnidadMedidaFormModal.tsx` — mirror `ServiceTypeFormModal.tsx`: `FormState`/`EMPTY_FORM={ descripcion:'', activo:true }`, dirty-check confirm on close via `lib/alerts.ts`, `activo` checkbox **only when `isEdit`**, submit branches create/update. Uses shared `components/ui/Modal.tsx`.
- `client/app/lib/navigation.tsx` — add one flat entry after `Tipos de Servicio`.

## Architecture Decisions

| Decision | Choice | Rejected alternative | Rationale |
|----------|--------|----------------------|-----------|
| Copy `service-types`, not `colors` | Fork the `service-types` module verbatim | Fork `colors`/`customers` | `service-types` is the newest single-`descripcion` catalog with the exact dual-audit + actor-id-`update()` shape needed; forking it keeps one consistent catalog convention. |
| Strip export | No `export` route/method/DTO, no ExcelJS, no export button | Keep export "for consistency" | Proposal explicitly declines export; carrying it would ship a dead feature the user rejected. This is the one deliberate divergence from `service-types`. |
| `update()` takes actor id | `update(id, dto, actualizadoPorId)`; `PATCH` injects `@Request()` | Parameterless `update` | `UnidadMedida` has `actualizadoPor`; a parameterless copy would silently drop the updater stamp. |
| Duplicate → 409 | Pre-check `findUnique`/`findFirst` + `P2002` backstop | P2002-only or pre-check-only | Pre-check gives a clean 409 on the common path; the catch is the TOCTOU-safe atomic backstop for concurrent inserts. Column collation (utf8mb4 `_ci`) makes it case-insensitive. |
| `JwtAuthGuard` only | Class-level `@UseGuards(JwtAuthGuard)`, no role gate | Add `RolesGuard` | No `RolesGuard` exists anywhere in the codebase; access control is deferred to a future Permisos feature, consistent with every existing section. |
| Nav icon (open item) | **Reuse `configuraciones.svg` as a placeholder now**, swappable later | Block on a dedicated `unidades-medida.svg` asset; reuse a thematic icon (`tipos-servicio.svg`) | No `unidades-medida.svg` asset exists yet. Shipped catalogs each use a dedicated icon, but the proposal marks this non-blocking. `configuraciones.svg` (a generic gear) is the least misleading placeholder — reusing a thematic sibling icon would imply a wrong relationship. Swap for a dedicated asset in a follow-up. |

## Data Flow

```
/unidades-medida page ──listUnidadesMedida()──▶ GET /unidades-medida ──JwtAuthGuard──▶ Service.findAll ──▶ Prisma ($transaction: data + total + activeCount)
    │  Nuevo / Editar (modal submit)
    ├──createUnidadMedida()──▶ POST /unidades-medida ──▶ create(dto, req.user.userId) ──▶ stamps creadoPorId + actualizadoPorId ──▶ refreshed list
    └──updateUnidadMedida()──▶ PATCH /unidades-medida/:id ──▶ update(id, dto, req.user.userId) ──▶ stamps actualizadoPorId ──▶ refreshed list
```

### Sequence: Create with duplicate check

```
Modal    Client(lib)       Controller(JwtAuthGuard)   Service           Prisma/DB
  │ submit  │                    │                       │                 │
  ├────────▶│ createUnidadMedida │                       │                 │
  │         ├───POST + Bearer───▶│ (guard validates JWT) │                 │
  │         │                    ├──create(dto,userId)──▶│                 │
  │         │                    │                       ├─findUnique(desc)▶│
  │         │                    │                       │◀──row | null────┤
  │         │                    │            row? ─────▶ throw 409 ────────┤
  │         │                    │                       ├─create(+audit)─▶│
  │         │                    │                       │  (P2002?)──▶ 409 backstop
  │         │                    │◀──201 UnidadMedida────┤                 │
  │◀────────┤◀───JSON────────────┤                       │                 │
```

### Sequence: Update

```
Modal ─submit▶ Client ─PATCH /:id + Bearer▶ Controller ─update(id,dto,userId)▶ Service
  Service: findUnique(id) → 404 if missing
         : findFirst(descripcion, NOT:{id}) → 409 if owned by another row
         : update({ data:{ descripcion, activo, actualizadoPorId } })  (P2002 backstop → 409)
  ◀── 200 UnidadMedida ── refreshed list
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modify | Add `UnidadMedida` model + two `User` back-relations |
| `server/prisma/migrations/<ts>_add_unidad_medida/` | Create | Additive migration (new table + two FKs) |
| `server/src/unidades-medida/unidades-medida.module.ts` | Create | Module wiring |
| `server/src/unidades-medida/unidades-medida.controller.ts` | Create | Guarded controller, 4 routes (no export) |
| `server/src/unidades-medida/unidades-medida.service.ts` | Create | findAll/findOne/create/update + P2002 (no ExcelJS) |
| `server/src/unidades-medida/dto/create-unidad-medida.dto.ts` | Create | CreateUnidadMedidaDto |
| `server/src/unidades-medida/dto/update-unidad-medida.dto.ts` | Create | UpdateUnidadMedidaDto |
| `server/src/unidades-medida/dto/list-unidades-medida-query.dto.ts` | Create | ListUnidadesMedidaQueryDto + status type |
| `server/src/app.module.ts` | Modify | Import + register `UnidadesMedidaModule` |
| `client/app/lib/unidades-medida.ts` | Create | Typed fetch wrappers (no export) |
| `client/app/(dashboard)/unidades-medida/page.tsx` | Create | List + table + filters + actions menu (no export button) |
| `client/app/(dashboard)/unidades-medida/UnidadMedidaFormModal.tsx` | Create | Shared create/edit modal |
| `client/app/lib/navigation.tsx` | Modify | Add flat "Unidades de Medida" nav entry |

## Testing Strategy

No test runner configured (`strict_tdd: false`). Manual/e2e: 401 without token on all 4 routes; no `DELETE`, no `/export` (404); 409 on duplicate `descripcion` (create + update); `POST` stamps both audit FKs, `PATCH` updates `actualizadoPorId` from the JWT caller only; deleting a user nulls the FK without deleting the unit row; list paginates/filters; page opens shared modal, `activo` only in edit, unsaved-close prompts confirm, no export button. Confirm `DATABASE_URL` before migrating. Validate with `npm run build`.

## Migration / Rollout

One additive migration adds the `UnidadMedida` table and its two nullable FKs. Reversible: drop the table (nothing references it). No data backfill.

## Open Questions

- [ ] Confirm the correct MySQL instance is reachable (`DATABASE_URL`) before running the migration in apply.
- [ ] Nav icon: shipping `configuraciones.svg` as placeholder; confirm whether a dedicated `unidades-medida.svg` asset should be requested for a follow-up (non-blocking).
