# Design: Tipos de Servicio CRUD (Create, List, Update)

## Technical Approach

Add a NestJS `service-types` module structurally identical to `colors/` (thin controller, service owns all Prisma + ExcelJS, `class-validator` DTOs, `SELECT` whitelist constant, `buildWhere` + `$transaction` list, P2002 duplicate backstop), plus a client-rendered `/tipos-servicio` page with a shared `ServiceTypeFormModal` and a `lib/service-types.ts` fetch wrapper mirroring `lib/colors.ts`. One additive Prisma migration adds the `TipoServicio` model. All endpoints are protected by `JwtAuthGuard` only (no role guard — deferred to Permisos).

The single deliberate divergence from `colors/` is the **dual audit relation** (creator + last updater, like `Cliente`): `create()` stamps both `creadoPorId` and `actualizadoPorId` from the JWT caller, and `update()` — unlike `colors.service.update()` — **takes an actor-id parameter** and stamps `actualizadoPorId`, following `customers.service.update()`.

## Data Model

### Prisma schema diff (`server/prisma/schema.prisma`)

Append a new model:

```prisma
model TipoServicio {
  id                 Int      @id @default(autoincrement())
  descripcion        String   @unique
  activo             Boolean  @default(true)
  creadoPorId        Int?
  creadoPor          User?    @relation("TipoServicioCreadoPor", fields: [creadoPorId], references: [id], onDelete: SetNull)
  actualizadoPorId   Int?
  actualizadoPor     User?    @relation("TipoServicioActualizadoPor", fields: [actualizadoPorId], references: [id], onDelete: SetNull)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

Add two back-relation arrays on `User` (alongside the existing `clientesCreados`/`coloresCreados` etc.):

```prisma
  tiposServicioCreados      TipoServicio[] @relation("TipoServicioCreadoPor")
  tiposServicioActualizados TipoServicio[] @relation("TipoServicioActualizadoPor")
```

This is the `Cliente` dual-audit shape (both FKs nullable, `onDelete: SetNull`), **not** the single-creator `Color`/`Marca` shape. Migration is additive-only (new table + two FKs), reversible per the proposal Rollback Plan. `sdd-apply` MUST confirm `DATABASE_URL` before running `prisma migrate`.

## Backend Module Structure

`server/src/service-types/` mirrors `colors/`:

| File | Contents |
|------|----------|
| `service-types.module.ts` | `@Module({ controllers: [ServiceTypesController], providers: [ServiceTypesService] })` → `export class ServiceTypesModule {}` |
| `service-types.controller.ts` | `@Controller('service-types')`, `@UseGuards(JwtAuthGuard)` at class level; routes `GET /`, `GET /export`, `GET /:id`, `POST /`, `PATCH /:id` |
| `service-types.service.ts` | `findAll`, `exportToExcel`, `findOne`, `create`, `update`; owns all Prisma + ExcelJS |
| `dto/create-service-type.dto.ts` | `CreateServiceTypeDto` |
| `dto/update-service-type.dto.ts` | `UpdateServiceTypeDto` |
| `dto/list-service-types-query.dto.ts` | `ListServiceTypesQueryDto` + `ServiceTypeStatusFilter` type |
| `dto/export-service-types-query.dto.ts` | `ExportServiceTypesQueryDto` |

### DTOs (every field explicit — global `whitelist: true` strips unknowns)

```ts
// create-service-type.dto.ts
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateServiceTypeDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
```

```ts
// update-service-type.dto.ts — same field set repeated (mirrors update-color.dto.ts, no PartialType)
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateServiceTypeDto {
  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
```

```ts
// list-service-types-query.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export type ServiceTypeStatusFilter = 'all' | 'activo' | 'inactivo';

export class ListServiceTypesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: ServiceTypeStatusFilter = 'all';
}
```

```ts
// export-service-types-query.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ServiceTypeStatusFilter } from './list-service-types-query.dto';

export class ExportServiceTypesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'activo', 'inactivo'])
  status?: ServiceTypeStatusFilter = 'all';
}
```

### Controller (`service-types.controller.ts`)

`@Controller('service-types')` + class-level `@UseGuards(JwtAuthGuard)`. Routes, in this exact order (`export` MUST precede `:id` so Express doesn't capture the literal segment with `ParseIntPipe`):

```ts
@Get()
async findAll(@Query() query: ListServiceTypesQueryDto) {
  return this.serviceTypesService.findAll(query);
}

@Get('export')
@Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
@Header('Content-Disposition', 'attachment; filename="tipos-servicio.xlsx"')
async export(@Query() query: ExportServiceTypesQueryDto): Promise<StreamableFile> {
  const buffer = await this.serviceTypesService.exportToExcel(query);
  return new StreamableFile(buffer);
}

@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  return this.serviceTypesService.findOne(id);
}

@Post()
async create(
  @Body() dto: CreateServiceTypeDto,
  @Request() req: { user: { userId: number; username: string } },
) {
  return this.serviceTypesService.create(dto, req.user.userId);
}

@Patch(':id')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateServiceTypeDto,
  @Request() req: { user: { userId: number; username: string } },
) {
  return this.serviceTypesService.update(id, dto, req.user.userId);
}
```

> **Divergence from `colors.controller.ts`**: its `@Patch(':id')` does NOT inject `@Request()` (Color has no updater). Here `PATCH` MUST inject `req` and pass `req.user.userId` as the third `update()` argument. The `StreamableFile` wrapper (not raw Buffer) and the `export`-before-`:id` ordering are copied verbatim, including the reasons documented in `colors.controller.ts`.

### Service (`service-types.service.ts`)

**SELECT whitelist** — projects both audit relations with the richer `colors` shape (`{ id, username, nombre, apellido }`), because the frontend list column renders `nombre`/`apellido` with a `username` fallback (mirroring `colores/page.tsx`). This is a deliberate resolution of the proposal's shorthand `{ id, username }`: the module mirrors `colors`, whose `COLOR_SELECT` projects the four-field shape, and the `lib/service-types.ts` mirror of `lib/colors.ts` types `creadoPor` with those four fields.

```ts
const SERVICE_TYPE_SELECT = {
  id: true,
  descripcion: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  creadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
  actualizadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
};

const DUPLICATE_DESCRIPCION_ERROR = 'Ya existe un tipo de servicio con esa descripción.';

export type ServiceTypeFilter = { search?: string; status?: ServiceTypeStatusFilter };
```

**Filter helper** — copy `buildColorWhere` verbatim, renamed `buildServiceTypeWhere`, retyped to `Prisma.TipoServicioWhereInput`. Search is single-field `{ descripcion: { contains: term } }` (same as colors). Keep the MySQL `mode: 'insensitive'`-unsupported / collation comment.

```ts
function buildServiceTypeWhere(filter: ServiceTypeFilter): {
  searchWhere: Prisma.TipoServicioWhereInput;
  where: Prisma.TipoServicioWhereInput;
} {
  const term = filter.search?.trim();
  const status = filter.status ?? 'all';
  const searchWhere: Prisma.TipoServicioWhereInput = term
    ? { descripcion: { contains: term } }
    : {};
  const where: Prisma.TipoServicioWhereInput = {
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

**P2002 duplicate helper** — copy `isDescripcionConflict` verbatim (guards `PrismaClientKnownRequestError` + `code === 'P2002'` + `target` includes `descripcion`, handling both `string` and `string[]` target shapes).

**Excel builder** — mirror `buildColorsExcel`, sheet name `'Tipos de servicio'`. `ServiceTypeRow` type + `creadoPorLabel` (nombre/apellido → username fallback) copied from colors. Columns: `Descripción` (32), `Creado por` (24), `Fecha de creación` (22), `Estado` (12). Same rose header fill `FFF43F5E` + white bold font. Rows: `descripcion`, `creadoPor: creadoPorLabel(r.creadoPor)`, `fechaCreacion: r.createdAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })`, `estado: r.activo ? 'Activo' : 'Inactivo'`.

**Method signatures** (`@Injectable()` class, `constructor(private readonly prisma: PrismaService) {}`):

| Method | Signature | Behavior |
|--------|-----------|----------|
| `findAll` | `findAll(query: ListServiceTypesQueryDto)` | `page ?? 1`, `pageSize ?? 10`, `buildServiceTypeWhere(query)`; `$transaction([findMany({ where, select: SERVICE_TYPE_SELECT, orderBy: { id: 'asc' }, skip, take }), count({ where }), count({ where: { ...searchWhere, activo: true } })])`; returns `{ data, total, activeCount }`. Verbatim from `colors.findAll`, `prisma.color` → `prisma.tipoServicio`. |
| `exportToExcel` | `exportToExcel(filter: ServiceTypeFilter): Promise<Buffer>` | `buildServiceTypeWhere(filter)`; `findMany({ where, select: SERVICE_TYPE_SELECT, orderBy: { id: 'asc' } })`; `return buildServiceTypesExcel(rows)`. |
| `findOne` | `findOne(id: number)` | `findUnique({ where: { id }, select: SERVICE_TYPE_SELECT })`; if null `throw new NotFoundException('Tipo de servicio no encontrado.')`. |
| `create` | `create(dto: CreateServiceTypeDto, creadoPorId: number)` | Pre-check `findUnique({ where: { descripcion: dto.descripcion } })` → `ConflictException(DUPLICATE_DESCRIPCION_ERROR)`. Then `try { create({ data: { descripcion: dto.descripcion, activo: dto.activo, creadoPorId, actualizadoPorId: creadoPorId }, select: SERVICE_TYPE_SELECT }) } catch` → if `isDescripcionConflict(error)` re-throw `ConflictException`, else re-throw. **Stamps both audit FKs from the same caller id** (like `customers.create`). |
| `update` | `update(id: number, dto: UpdateServiceTypeDto, actualizadoPorId: number)` | `findUnique({ where: { id } })` → `NotFoundException` if missing. `findFirst({ where: { descripcion: dto.descripcion, NOT: { id } } })` → `ConflictException` if owned by another row. Then `try { update({ where: { id }, data: { descripcion: dto.descripcion, activo: dto.activo, actualizadoPorId }, select: SERVICE_TYPE_SELECT }) } catch` → P2002 backstop. **This is the one method that MUST NOT copy `colors.service.update()`** — it takes the actor id and writes `actualizadoPorId`, following `customers.service.update()`. |

`create`/`update` `activo` handling matches colors: pass `dto.activo` straight through (Prisma applies the schema `@default(true)` when `undefined`).

## Module Registration

`server/src/app.module.ts` — add import and register in `imports`:

```ts
import { ServiceTypesModule } from './service-types/service-types.module';
// imports: [ ..., ColorsModule, BrandsModule, VehiclesModule, ServiceTypesModule ]
```

## Frontend

### `client/app/lib/service-types.ts` (mirror of `lib/colors.ts`)

```ts
export interface ServiceTypeListItem {
  id: number;
  descripcion: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
  actualizadoPor: { id: number; username: string; nombre: string | null; apellido: string | null } | null;
}

export interface CreateServiceTypePayload { descripcion: string; activo?: boolean; }
export interface UpdateServiceTypePayload { descripcion: string; activo?: boolean; }
```

Copy `handleJsonResponse<T>`, `ListServiceTypesParams` (`page`, `pageSize`, `search?`, `status?`), and `PaginatedServiceTypes` (`{ data: ServiceTypeListItem[]; total: number; activeCount: number }`) verbatim from colors. Functions, each spreading `getAuthHeader()` (+ `Content-Type` on mutations):

| Function | Signature | Endpoint | Fallback message |
|----------|-----------|----------|------------------|
| `listServiceTypes` | `(params: ListServiceTypesParams): Promise<PaginatedServiceTypes>` | `GET /service-types?…` | `No se pudo obtener la lista de tipos de servicio` |
| `getServiceType` | `(id: number): Promise<ServiceTypeListItem>` | `GET /service-types/${id}` | `No se pudo obtener el tipo de servicio` |
| `createServiceType` | `(data: CreateServiceTypePayload): Promise<ServiceTypeListItem>` | `POST /service-types` | `No se pudo crear el tipo de servicio` |
| `updateServiceType` | `(id: number, data: UpdateServiceTypePayload): Promise<ServiceTypeListItem>` | `PATCH /service-types/${id}` | `No se pudo actualizar el tipo de servicio` |
| `exportServiceTypes` | `(params: ExportServiceTypesParams): Promise<Blob>` | `GET /service-types/export?…` | `No se pudo exportar los tipos de servicio` |

`ExportServiceTypesParams` = `{ search?: string; status?: 'all' | 'activo' | 'inactivo' }`. `exportServiceTypes` uses the same defensive non-JSON error branch as `exportColors` and returns `res.blob()`.

### `client/app/(dashboard)/tipos-servicio/page.tsx` (mirror of `colores/page.tsx`)

`'use client'`. Copy the entire `ColoresPage` structure, renaming `Color`→`ServiceType`, `colors`→`serviceTypes`, calling `listServiceTypes`/`updateServiceType`/`exportServiceTypes`. Preserve verbatim: the debounce (350ms `searchInput`→`search`), `DEFAULT_STATUS_FILTER = 'activo'`, `PAGE_SIZE_OPTIONS = [10, 25, 50]`, the fixed-position `createPortal` actions menu (`MENU_WIDTH = 160`, upward-flip logic, click-outside/scroll/resize close), the local SVG icon components (`PencilIcon`, `CheckCircleIcon`, `NoSymbolIcon`, `SearchIcon`, `ExcelFileIcon`), and the light-mode table card styling.

Differences (copy text only):
- Header title `Tipos de Servicio`, subtitle e.g. `Gestioná los tipos de servicio del sistema.`
- Primary button `Nuevo tipo de servicio`; export download filename `tipos-servicio.xlsx`.
- Active-count pill and empty/filtered-empty/toggle-confirm copy reworded to "tipo(s) de servicio".
- Table columns identical to colors: `#`, `Descripción`, `Creación` (renders `creadoPor` nombre/apellido→username + `createdAt` timestamp), `Estado` badge, `Acciones`.
- Renders `<ServiceTypeFormModal open={modalOpen} onClose={…} serviceType={selectedServiceType} onSaved={…} />`.

### `client/app/(dashboard)/tipos-servicio/ServiceTypeFormModal.tsx` (mirror of `ColorFormModal.tsx`)

Copy verbatim, renaming the prop `color`→`serviceType` (type `ServiceTypeListItem | null`) and the imports to `createServiceType`/`updateServiceType`/`CreateServiceTypePayload`/`UpdateServiceTypePayload`. Preserve: `FormState = { descripcion: string; activo: boolean }`, `EMPTY_FORM = { descripcion: '', activo: true }`, `isFormDirty` shallow-compare, `initialFormRef` baseline, `descripcionRef` autofocus, `isEdit = serviceType !== null`, and the `showConfirm` dirty-check on close (via `lib/alerts.ts`). The `activo` checkbox renders **only when `isEdit`** (create omits it — Prisma defaults `activo` to `true`). Submit branches `isEdit ? updateServiceType(serviceType.id, payload) : createServiceType(payload)`. Copy text: modal titles `Editar tipo de servicio` / `Nuevo tipo de servicio`, descriptions, `Crear tipo de servicio` button, placeholder e.g. `Ej: Cambio de aceite`, success/error toasts reworded.

Uses the existing shared `client/app/components/ui/Modal.tsx` (already imported by `ColorFormModal`).

### `client/app/lib/navigation.tsx`

Add one flat top-level entry after `Vehículos`, matching the `NavigationItem` shape used by `Colores`/`Marcas` (placeholder `usuarios.svg` icon):

```tsx
{
  name: 'Tipos de Servicio',
  href: '/tipos-servicio',
  id: 'tipos-servicio',
  // No dedicated /icons/tipos-servicio.svg asset exists yet; reuse the
  // usuarios icon rather than ship a broken image, same as Vehículos above.
  icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden />,
},
```

## Architecture Decisions

### Decision: Mirror `colors/` structurally, diverge only on the audit relation (D2/D3)
**Choice**: `service-types` copies `colors`'s controller/service/DTO/filter/export/P2002 shape verbatim, changing only (a) the dual audit FKs on the model + SELECT, and (b) `update()` taking an actor id. **Alternatives**: copy `customers/` wholesale (heavier — multi-field search, normalizeOptional, two unique constraints not needed here). **Rationale**: colors is the closest single-`descripcion`-unique catalog precedent; keeping parallel catalog modules avoids divergent conventions. The updater relation is the only place `customers` is the better model.

### Decision: `update()` takes an actor-id parameter (D3)
**Choice**: `update(id, dto, actualizadoPorId)`; controller injects `@Request()` on `PATCH` and passes `req.user.userId`. **Alternatives**: copy `colors.service.update(id, dto)` (no actor). **Rationale**: Color has no `actualizadoPor`; copying it would silently drop the updater stamp. `customers.service.update()` is the correct precedent. The caller id is JWT-sourced server-side, never client-suppliable (no `creadoPorId`/`actualizadoPorId` in any DTO — `whitelist: true` strips stray fields).

### Decision: SELECT projects the four-field `{ id, username, nombre, apellido }` audit shape
**Choice**: both `creadoPor` and `actualizadoPor` use the `colors` `{ id, username, nombre, apellido }` projection. **Alternatives**: `customers`'s slimmer `{ id, username }` (which the proposal wrote as shorthand). **Rationale**: the frontend mirrors `colores/page.tsx`, whose "Creación" column renders `nombre`/`apellido` with a `username` fallback; the slim shape would break that mirror. Consistent with the module's colors lineage.

### Decision: Duplicate `descripcion` → 409 via pre-check + P2002 backstop (D4)
**Choice**: copy colors' `isDescripcionConflict` + pre-check-then-catch on both create and update. **Alternatives**: rely on P2002 alone (loses the friendly pre-check path) or pre-check alone (TOCTOU-unsafe). **Rationale**: the pre-check gives a clean 409 on the common path; the catch is the atomic backstop for concurrent inserts. Column collation (utf8mb4 `_*_ci`) makes it case-insensitive without manual normalization.

### Decision: `JwtAuthGuard` only, no role guard (D6)
**Choice**: class-level `@UseGuards(JwtAuthGuard)`, no `RolesGuard`. **Rationale**: consistent with every existing section; access control deferred to the future Permisos feature. No `RolesGuard` exists in the codebase.

### Decision: Modal-based UI, `activo` only in edit (D5)
**Choice**: single list page + one shared `FormModal` toggled by selected-item state; `activo` checkbox rendered only in edit mode. **Alternatives**: separate create/edit pages (usuarios' inline style). **Rationale**: colores/marcas already set the modal catalog precedent; tipos de servicio should look identical. Create omits `activo` because the schema defaults it to `true`.

### Decision: Export included by consistency (D8)
**Choice**: ship `GET /service-types/export` (.xlsx) matching sibling catalogs. **Rationale**: every list module (`customers`, `colors`) exports; omitting it here would be an inconsistency. Flagged in the proposal for user push-back — droppable without affecting the rest if unwanted.

## Data Flow

    /tipos-servicio page ──listServiceTypes()──▶ GET /service-types ──JwtAuthGuard──▶ ServiceTypesService.findAll ──▶ Prisma ($transaction: data + total + activeCount)
        │  Nuevo / Editar (modal submit)
        ├──createServiceType()──▶ POST /service-types ──▶ create(dto, req.user.userId) ──▶ stamps creadoPorId + actualizadoPorId ──▶ refreshed list
        ├──updateServiceType()──▶ PATCH /service-types/:id ──▶ update(id, dto, req.user.userId) ──▶ stamps actualizadoPorId ──▶ refreshed list
        └──exportServiceTypes()──▶ GET /service-types/export ──▶ exportToExcel(filter) ──▶ StreamableFile (.xlsx attachment)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modify | Add `TipoServicio` model + two `User` back-relations |
| `server/prisma/migrations/<ts>_add_tipo_servicio/` | Create | Additive migration (new table + two FKs) |
| `server/src/service-types/service-types.module.ts` | Create | Module wiring |
| `server/src/service-types/service-types.controller.ts` | Create | Guarded controller, 5 routes (`export` before `:id`; PATCH injects `@Request()`) |
| `server/src/service-types/service-types.service.ts` | Create | findAll/exportToExcel/findOne/create/update + ExcelJS + P2002 |
| `server/src/service-types/dto/create-service-type.dto.ts` | Create | CreateServiceTypeDto |
| `server/src/service-types/dto/update-service-type.dto.ts` | Create | UpdateServiceTypeDto |
| `server/src/service-types/dto/list-service-types-query.dto.ts` | Create | ListServiceTypesQueryDto + status type |
| `server/src/service-types/dto/export-service-types-query.dto.ts` | Create | ExportServiceTypesQueryDto |
| `server/src/app.module.ts` | Modify | Import + register `ServiceTypesModule` |
| `client/app/lib/service-types.ts` | Create | Typed fetch wrappers |
| `client/app/(dashboard)/tipos-servicio/page.tsx` | Create | List + table + filters + export + actions menu |
| `client/app/(dashboard)/tipos-servicio/ServiceTypeFormModal.tsx` | Create | Shared create/edit modal |
| `client/app/lib/navigation.tsx` | Modify | Add flat "Tipos de Servicio" nav entry |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Manual/e2e | 401 without token on all 5 routes; 409 on duplicate `descripcion` (create + update); POST stamps both audit FKs, PATCH updates `actualizadoPorId` from JWT; `export` returns `.xlsx` not JSON; list paginates/filters; deleting a user nulls the FK without deleting the row | Exercise endpoints + page against reachable DB (**confirm `DATABASE_URL` before migrating** — `.env` unreadable in prior phases) |

## Migration / Rollout

One additive migration adds the `TipoServicio` table and its two nullable FKs. Reversible: drop the table (nothing references it). No data backfill. `descripcion` is a plain unique `String` column; `activo`/`createdAt`/`updatedAt` use Prisma defaults.

## Open Questions

- [ ] Confirm the correct MySQL instance is reachable (`DATABASE_URL`) before running the migration in apply.
- [ ] Confirm the user still wants Excel export in this section (D8 flagged for push-back) before implementing `export`.
