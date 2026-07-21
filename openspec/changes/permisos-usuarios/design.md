# Design: Permisos de Usuarios (Section Access — data + admin UI, no enforcement)

## Technical Approach

This slice mirrors the thin-CRUD house style used everywhere in `server/src/` and the
page-based frontend style used by `usuarios/`. Nothing here is architecturally novel —
the only genuinely non-trivial pieces are (1) the pre-existing **schema drift cleanup**
before the migration and (2) the server-side **effective-grid merge**. Both are specified
exactly below.

- **Backend** — new `server/src/permisos/` module (`module` / `controller` / `service` /
  `dto/` + a `section-catalog.ts` constant), mirroring `server/src/users/` (thin controller,
  service owns all Prisma, `class-validator` DTOs, Nest exceptions, Spanish messages).
  Class-level `@UseGuards(JwtAuthGuard)` only — **no** role guard (none exists; enforcement
  is a separate future change, per proposal Non-Goals).
- **Data** — two additive models (`RoleSectionAccess`, `UserSectionOverride`) + one
  `SectionAccessLevel` Prisma enum + one `User` back-relation array. Adopted **as-is** from the
  drifted schema: no audit columns (D3), `sectionId` free-form `String` (D2), `level` a Prisma
  enum. One clean, properly-tracked migration creates both tables **from scratch** after the
  orphaned drift tables are dropped first.
- **Frontend** — new page `usuarios/permisos/[id]/page.tsx` (page-based, mirrors
  `usuarios/editar/[id]`), a new `client/app/lib/permisos.ts` typed client + the canonical
  section catalog with labels, and one inserted "Permisos" row-action entry in
  `usuarios/page.tsx`. **Not** a sidebar nav item.

The effective grid is computed server-side by iterating the 15-section **canonical list** and
left-joining it against `RoleSectionAccess` (by the user's `rol`) and `UserSectionOverride`
(by `userId`), collapsing each row to `override ?? roleDefault ?? sin_acceso`. Iterating the
canonical list (not the DB rows) guarantees exactly 15 rows every time and makes the endpoint
**self-healing against drift**: any stale `sectionId` row in the DB that is not in the canonical
list is simply ignored, and any canonical section with no rows returns `sin_acceso`.

## Resolution of the proposal's flagged risks

### R1 — Orphaned-table drift cleanup (the proposal's biggest flagged risk)

**Situation (confirmed by the orchestrator before this phase):** the live local dev DB
(`server/.env` → `DATABASE_URL=mysql://root:***@localhost:3310/axionis-taller`) already contains
two tables — `RoleSectionAccess` and `UserSectionOverride` — that are **EMPTY (zero rows)**,
exist in **NO migration file**, and are **NOT** in `server/prisma/schema.prisma`. They are pure
drift: created out-of-band, never tracked.

**Why this is dangerous for a naive `prisma migrate dev`:** `migrate dev` first compares the DB
against migration history. Two tables present in the DB but absent from history = **drift
detected**. `migrate dev`'s response to drift is to propose a **database reset** (a data-loss
operation), which requires an interactive confirmation. `prisma migrate dev` can outright fail in
a non-interactive shell whenever it needs to prompt like this (e.g. over a data-loss-risk diff) —
this is a known, general Prisma CLI behavior, not something specific to any prior change in this
repo. Dropping the orphaned tables first (below) should avoid triggering that prompt in this case,
but the `migrate diff` + hand-built-folder + `migrate deploy` fallback is documented as a
contingency regardless.

**The fix removes the drift condition first, so no prompt is ever triggered.** Prisma's
interactive prompt is triggered by the *data-loss / reset* warning; dropping the two conflicting
tables first makes the live DB match migration history exactly — no drift, no reset proposal, no
prompt. `migrate dev` then proceeds cleanly and generates a normal, properly-tracked migration
that creates both tables from scratch.

**Exact apply-time procedure (`sdd-apply` MUST follow this order):**

**Step 0 — verify target DB.** Confirm `DATABASE_URL` in `server/.env` points at the intended
local dev instance (`localhost:3310/axionis-taller`) before touching anything. (Same Known-Gap
guard as presupuestos-crud.)

**Step 1 — drop the two orphaned tables (safe: both confirmed empty).** Create
`server/prisma/drop-orphaned-section-tables.sql`:

```sql
DROP TABLE IF EXISTS `UserSectionOverride`;
DROP TABLE IF EXISTS `RoleSectionAccess`;
```

Run it non-interactively through Prisma's own DB connection (reads `DATABASE_URL` from the
datasource, no extra client needed):

```bash
cd server
npx prisma db execute --file prisma/drop-orphaned-section-tables.sql --schema prisma/schema.prisma
```

(There is no FK between the two tables; `UserSectionOverride` has a `userId` FK to `User`, so
`DROP TABLE` on it just removes that FK — dropping in this order is clean. `DROP TABLE IF EXISTS`
is idempotent, so re-running is harmless if one table was already gone.) After this step the DB
matches migration history — zero drift.

**Step 2 — add the two models + enum + back-relation to `schema.prisma`** exactly as specified
in *Data Model* below.

**Step 3 — generate the tracked migration (primary path, now expected to succeed):**

```bash
cd server
npx prisma migrate dev --name add_section_access
```

With the drift gone, this creates
`server/prisma/migrations/<timestamp>_add_section_access/migration.sql` (creating both tables
fresh), applies it, and regenerates the Prisma client. Delete the temporary
`drop-orphaned-section-tables.sql` afterward (it is not part of migration history).

**Step 3 (fallback) — if `migrate dev` still refuses non-interactively** (documented
contingency for the general non-interactive-prompt failure mode):

```bash
cd server
# 1. Generate the forward SQL by diffing the (now drift-free) DB against the schema
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > _add_section_access.sql
# 2. Hand-build the migration folder
#    prisma/migrations/<timestamp>_add_section_access/migration.sql  <- move the SQL here
# 3. Apply + record it in _prisma_migrations, then regenerate the client
npx prisma migrate deploy
npx prisma generate
```

The expected `migration.sql` content is given verbatim in *Data Model → Migration SQL* below, so
the fallback folder can be built with confidence.

**Rollback** (proposal Rollback Plan): the down operation drops `UserSectionOverride` then
`RoleSectionAccess` (both empty; no committed history ever referenced the orphaned versions, so
nothing else to reconcile) and removes the `User.sectionOverrides` back-relation. No data loss.

### R2 — Exact Prisma schema + relation-name collision check

**Collision check performed** against the full `User` back-relation block
(`server/prisma/schema.prisma:22-49`) and every `@relation("...")` in the schema:

- `UserSectionOverride` has a **single** FK to `User` (`userId`). Prisma does not require a
  *named* relation when a model has exactly one relation to a given model, so an **unnamed**
  relation is used (cleanest; matches `Vehiculo.marca/color/cliente`, which are single unnamed
  relations). The back-relation field on `User` is `sectionOverrides` — **no** existing `User`
  field is named `sectionOverrides` (verified against lines 22-49). Free, ratified.
- `RoleSectionAccess` keys off `rol` as a **free-form `String`** (D2), **not** a FK to any table
  (`rol` is a plain column on `User`, there is no `Role` table). Therefore it has **no** relation
  to `User` and needs **no** back-relation. No collision surface at all.

`onDelete: Cascade` on `UserSectionOverride.userId → User` is ratified per the proposal ("`userId
Int→User onDelete Cascade`"): deleting a user removes their overrides (they are meaningless
without the user). This mirrors the cascade shape of `OrdenTrabajoTipoServicioProducto` /
`PresupuestoProducto` child rows.

### R3 / R4 / R5

Resolved in *API Surface*, *Frontend*, and *Sequence Diagram* below.

## Data Model

### Prisma schema diff (`server/prisma/schema.prisma`)

Add one enum + two models (append near the other enums / at the end of the model list), and one
back-relation field to `User`:

```prisma
enum SectionAccessLevel {
  total
  lectura
  sin_acceso
}

model RoleSectionAccess {
  id        Int                @id @default(autoincrement())
  rol       String
  sectionId String
  level     SectionAccessLevel
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  @@unique([rol, sectionId])
}

model UserSectionOverride {
  id        Int                @id @default(autoincrement())
  userId    Int
  user      User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  sectionId String
  level     SectionAccessLevel
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  @@unique([userId, sectionId])
}
```

Back-relation added to the existing `User` model (append to the `User` relation block, alongside
`presupuestoProductosActualizados`):

```prisma
// model User
  sectionOverrides UserSectionOverride[]
```

The compound `@@unique([rol, sectionId])` generates the Prisma nested-unique input key
**`rol_sectionId`**; `@@unique([userId, sectionId])` generates **`userId_sectionId`**. Both are
used by the upsert paths in the service (see below). No `creadoPorId`/`actualizadoPorId` columns
(D3 — deliberate divergence from the house catalog convention; enforcement change can revisit).

### Migration SQL (expected `migration.sql` — for the Step 3 fallback folder)

```sql
-- CreateTable
CREATE TABLE `RoleSectionAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rol` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `level` ENUM('total', 'lectura', 'sin_acceso') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RoleSectionAccess_rol_sectionId_key`(`rol`, `sectionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSectionOverride` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `level` ENUM('total', 'lectura', 'sin_acceso') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSectionOverride_userId_sectionId_key`(`userId`, `sectionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSectionOverride` ADD CONSTRAINT `UserSectionOverride_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
```

(This is the canonical MySQL output Prisma produces for the schema above, matching the style of
`20260721131045_add_presupuestos/migration.sql`. `RoleSectionAccess` has no FK — `rol` is a plain
string column, not a reference.)

## The canonical section catalog (single source of truth, duplicated per house convention)

The 15 canonical `sectionId`s are the `navigation.tsx` leaf `id` values. There is no shared
package between `server/` and `client/` (documented house convention — see
`client/app/lib/users.ts:4-6` duplicating `server/src/users/user.constants.ts`). So the list is
**duplicated in exactly two places**, each with a comment pointing at the other:

1. **Backend — `server/src/permisos/section-catalog.ts`** (validation + grid iteration source):

```ts
// Canonical section slugs = client/app/lib/navigation.tsx leaf `id` values.
// Duplicated (no shared package) at client/app/lib/permisos.ts SECTION_CATALOG —
// if you add/rename a section, change BOTH. Enforcement change will read this list too.
export const SECTION_IDS = [
  'home', 'usuarios', 'colores', 'marcas', 'tipos-servicio', 'unidades-medida',
  'etiquetas', 'diagnosticos', 'empresa', 'clientes', 'vehiculos', 'productos',
  'presupuestos', 'ordenes-trabajo', 'ordenes-trabajo-panel',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_ACCESS_LEVELS = ['total', 'lectura', 'sin_acceso'] as const;
export type SectionAccessLevelValue = (typeof SECTION_ACCESS_LEVELS)[number];
```

2. **Frontend — `client/app/lib/permisos.ts`** (labels for the table; ids must match #1):

```ts
// Section ids mirror server/src/permisos/section-catalog.ts SECTION_IDS (no shared
// package) — if you add/rename a section, change BOTH. Labels mirror navigation.tsx names.
export const SECTION_CATALOG: { id: string; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'colores', label: 'Colores' },
  { id: 'marcas', label: 'Marcas' },
  { id: 'tipos-servicio', label: 'Tipos de Servicio' },
  { id: 'unidades-medida', label: 'Unidades de Medida' },
  { id: 'etiquetas', label: 'Etiquetas' },
  { id: 'diagnosticos', label: 'Diagnósticos' },
  { id: 'empresa', label: 'Empresa' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'vehiculos', label: 'Vehículos' },
  { id: 'productos', label: 'Productos' },
  { id: 'presupuestos', label: 'Presupuestos' },
  { id: 'ordenes-trabajo', label: 'Órdenes de Trabajo' },
  { id: 'ordenes-trabajo-panel', label: 'Panel de Trabajo' },
];
```

> **Risk mitigation (proposal risk row "sectionId list drifts from navigation.tsx"):** both files
> carry the cross-reference comment; the enforcement change is documented to read the backend
> `SECTION_IDS` as its source. New sections must be added to `navigation.tsx` **and** both catalogs.

## API Surface

Route base `permisos`, all four endpoints under class-level `@UseGuards(JwtAuthGuard)` (valid
Bearer token required; **no** role check). The `rol` path segment is a **free-form `String`** and
is **not** validated against `USER_ROLES` — the DB column is free-form (D2), so an unknown/typo'd
rol is accepted and simply resolves to an all-`sin_acceso` grid (see Decision A3). The four real
roles (`maestro`, `administrador`, `empleado`, `mecanico` — `server/src/users/user.constants.ts:6`)
are the ones the UI will drive, but the API imposes no allow-list on them.

### `GET /permisos/roles/:rol` — read a role's default grid

- **Validation:** none on `:rol` (free-form). An unknown rol returns 15 rows all defaulting to
  `sin_acceso` (no stored rows exist for it). See Decision A3.
- **Behavior:** read all `RoleSectionAccess` rows for `rol`, then iterate `SECTION_IDS`; each
  section returns its stored `level` or `sin_acceso` if no row exists. Exactly 15 rows.
- **Response `200`:**

```jsonc
{
  "rol": "empleado",
  "sections": [
    { "sectionId": "home", "level": "total" },
    { "sectionId": "usuarios", "level": "sin_acceso" }
    // ... 15 total, canonical order
  ]
}
```

### `PUT /permisos/roles/:rol` — upsert a role's default grid

- **Body (`PutRoleGridDto`):** `{ sections: [{ sectionId, level }] }` — each `sectionId` MUST be
  in `SECTION_IDS` (else `400`), each `level` in `SECTION_ACCESS_LEVELS` (else `400`). Duplicate
  `sectionId` in the array: last one wins (upsert is idempotent per key).
- **Behavior:** for each entry, `upsert` on `@@unique([rol, sectionId])` (`rol_sectionId`). A
  section omitted from the body is left unchanged (partial-grid upsert — not a full replace).
  Storing `sin_acceso` explicitly is allowed and idempotent (missing rows already read as
  `sin_acceso`). Returns the full recomputed grid (same shape as the GET).
- **Response `200`:** identical shape to `GET /permisos/roles/:rol`.

> The role-grid endpoints ship no UI in this slice (D4) — they exist so the two-tier model is
> complete for the future enforcement change. They are exercised via API only for now.

### `GET /permisos/users/:userId` — read the effective grid (the merge)

- **Validation:** `:userId` MUST resolve to an existing `User`; otherwise `404
  NotFoundException('Usuario no encontrado.')` (same message/shape as `UsersService.findOne`).
- **Merge algorithm (server-side left-join, canonical-driven):**
  1. `user = findUnique({ where: { id: userId }, select: { id, rol } })` → 404 if null.
  2. `roleRows = roleSectionAccess.findMany({ where: { rol: user.rol } })` → `Map<sectionId, level>`.
  3. `overrideRows = userSectionOverride.findMany({ where: { userId } })` → `Map<sectionId, level>`.
  4. For each `sectionId` in `SECTION_IDS` (canonical order):
     - `roleLevel = roleMap.get(sectionId) ?? 'sin_acceso'`
     - `overrideLevel = overrideMap.get(sectionId) ?? null`
     - `effectiveLevel = overrideLevel ?? roleLevel`   *(precedence: override ?? role ?? sin_acceso)*
  - Rows in either table whose `sectionId` is **not** in `SECTION_IDS` are ignored (drift-safe).
- **Response `200`:**

```jsonc
{
  "userId": 7,
  "rol": "empleado",
  "sections": [
    { "sectionId": "home", "roleLevel": "total", "overrideLevel": null, "effectiveLevel": "total" },
    { "sectionId": "usuarios", "roleLevel": "sin_acceso", "overrideLevel": "lectura", "effectiveLevel": "lectura" }
    // ... 15 total, canonical order
  ]
}
```

### `PUT /permisos/users/:userId` — upsert / clear per-user overrides

- **Validation:** `:userId` exists (else `404`); each `sectionId` in `SECTION_IDS` (else `400`);
  each `level` is either one of `SECTION_ACCESS_LEVELS` **or `null`** (else `400`).
- **Body (`PutUserOverridesDto`):** `{ sections: [{ sectionId, level }] }` where `level` may be a
  level string **or `null`**:
  - `level` is a valid level → `upsert` the override on `@@unique([userId, sectionId])`
    (`userId_sectionId`).
  - `level` is `null` → **delete** the override row (`deleteMany({ where: { userId, sectionId } })`
    — `deleteMany` is a no-op if the row is absent, so "clear an already-inherited section" never
    404s). The user then falls back to the role default for that section.
  - A `sectionId` omitted from the body is left unchanged.
- **Behavior:** apply all entries (upserts + deletes), then **re-run the same merge** and return
  the fresh effective grid so the client renders authoritative post-write state.
- **Response `200`:** identical shape to `GET /permisos/users/:userId`.

## Backend Module Structure

`server/src/permisos/` mirrors `server/src/users/`:

| File | Contents |
|------|----------|
| `permisos.module.ts` | `@Module({ controllers: [PermisosController], providers: [PermisosService] })` → `export class PermisosModule {}` |
| `permisos.controller.ts` | `@Controller('permisos')`, class-level `@UseGuards(JwtAuthGuard)`; 4 routes (roles GET/PUT, users GET/PUT) |
| `permisos.service.ts` | `getRoleGrid`, `putRoleGrid`, `getUserGrid`, `putUserGrid`; owns all Prisma; private `assertUserExists`, `buildRoleGrid`, `buildEffectiveGrid` |
| `section-catalog.ts` | `SECTION_IDS`, `SectionId`, `SECTION_ACCESS_LEVELS`, `SectionAccessLevelValue` (shown above) |
| `dto/put-role-grid.dto.ts` | `PutRoleGridDto` + nested `RoleSectionEntryDto` |
| `dto/put-user-overrides.dto.ts` | `PutUserOverridesDto` + nested `UserOverrideEntryDto` |

### DTOs (global `whitelist: true` strips unknowns; no audit fields exist)

```ts
// dto/put-role-grid.dto.ts
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { SECTION_ACCESS_LEVELS, SECTION_IDS } from '../section-catalog';

export class RoleSectionEntryDto {
  @IsString()
  @IsIn(SECTION_IDS as unknown as string[])
  sectionId: string;

  @IsIn(SECTION_ACCESS_LEVELS as unknown as string[])
  level: string;
}

export class PutRoleGridDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RoleSectionEntryDto)
  sections: RoleSectionEntryDto[];
}
```

```ts
// dto/put-user-overrides.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsIn, IsString, ValidateIf, ValidateNested,
} from 'class-validator';
import { SECTION_ACCESS_LEVELS, SECTION_IDS } from '../section-catalog';

export class UserOverrideEntryDto {
  @IsString()
  @IsIn(SECTION_IDS as unknown as string[])
  sectionId: string;

  // null clears the override (falls back to role default). @ValidateIf skips the
  // @IsIn check only when level === null, so any other invalid value still 400s.
  @ValidateIf((o) => o.level !== null)
  @IsIn(SECTION_ACCESS_LEVELS as unknown as string[])
  level: string | null;
}

export class PutUserOverridesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserOverrideEntryDto)
  sections: UserOverrideEntryDto[];
}
```

### Controller (`permisos.controller.ts`)

`@Controller('permisos')` + class-level `@UseGuards(JwtAuthGuard)`. Route order places the
literal `roles`/`users` segments before their params (no `:id`-capture hazard — the two segments
are distinct literals). No `@Request()`/`req.user` is needed for writes (D3 — no audit columns to
stamp), which is the one deliberate divergence from the `users`/`presupuestos` controller shape.

```ts
@Get('roles/:rol')
async getRoleGrid(@Param('rol') rol: string) {
  return this.permisosService.getRoleGrid(rol);
}

@Put('roles/:rol')
async putRoleGrid(@Param('rol') rol: string, @Body() dto: PutRoleGridDto) {
  return this.permisosService.putRoleGrid(rol, dto);
}

@Get('users/:userId')
async getUserGrid(@Param('userId', ParseIntPipe) userId: number) {
  return this.permisosService.getUserGrid(userId);
}

@Put('users/:userId')
async putUserGrid(
  @Param('userId', ParseIntPipe) userId: number,
  @Body() dto: PutUserOverridesDto,
) {
  return this.permisosService.putUserGrid(userId, dto);
}
```

### Service (`permisos.service.ts`)

`@Injectable()`, `constructor(private readonly prisma: PrismaService) {}`. Imports `Prisma` /
`SectionAccessLevel` from `@prisma/client`, `SECTION_IDS` from `./section-catalog`.

**Private helpers:**

| Helper | Behavior |
|--------|----------|
| `assertUserExists(userId)` | `findUnique({ where: { id: userId }, select: { id: true, rol: true } })`; if null → `NotFoundException('Usuario no encontrado.')`; returns `{ id, rol }` |
| `buildRoleGrid(rol)` | `roleSectionAccess.findMany({ where: { rol } })` → `Map`; map `SECTION_IDS` → `{ sectionId, level: map.get(sectionId) ?? 'sin_acceso' }` |
| `buildEffectiveGrid(user)` | fetch role rows (`user.rol`) + override rows (`user.id`) into two `Map`s; map `SECTION_IDS` → `{ sectionId, roleLevel, overrideLevel, effectiveLevel }` per the merge algorithm |

**Methods:**

| Method | Behavior |
|--------|----------|
| `getRoleGrid(rol)` | return `{ rol, sections: buildRoleGrid(rol) }` (no rol validation — free-form; unknown rol → all `sin_acceso`) |
| `putRoleGrid(rol, dto)` | `$transaction(dto.sections.map(s => upsert({ where: { rol_sectionId: { rol, sectionId: s.sectionId } }, create: { rol, sectionId: s.sectionId, level: s.level }, update: { level: s.level } })))`; then return `{ rol, sections: buildRoleGrid(rol) }` |
| `getUserGrid(userId)` | `const user = assertUserExists(userId)`; return `{ userId, rol: user.rol, sections: buildEffectiveGrid(user) }` |
| `putUserGrid(userId, dto)` | `const user = assertUserExists(userId)`; in a `$transaction`: for each entry, if `level === null` → `deleteMany({ where: { userId, sectionId } })`, else `upsert({ where: { userId_sectionId: { userId, sectionId } }, create: { userId, sectionId, level }, update: { level } })`; then return `{ userId, rol: user.rol, sections: buildEffectiveGrid(user) }` |

All writes wrapped in `$transaction` so a partial grid never lands half-applied. Enum values from
the DTO (`string`) are assigned to the `SectionAccessLevel` Prisma enum column directly — the
`@IsIn(SECTION_ACCESS_LEVELS)` DTO guard already constrained them to the three valid members, so
a plain cast (`level as SectionAccessLevel`) is safe.

## Module Registration

`server/src/app.module.ts` — add the import and register in `imports` (after
`PresupuestosModule`):

```ts
import { PermisosModule } from './permisos/permisos.module';
// imports: [ ..., PresupuestosModule, PermisosModule ]
```

## Frontend

### `client/app/lib/permisos.ts` (new — mirrors `lib/users.ts` fetch/error convention)

Exports `SECTION_CATALOG` (above), the level type, response/payload types, and four typed
functions. Reuses the `handleJsonResponse<T>` + `getAuthHeader()` pattern verbatim from
`lib/users.ts`.

```ts
export type SectionAccessLevel = 'total' | 'lectura' | 'sin_acceso';

export interface RoleGridRow { sectionId: string; level: SectionAccessLevel; }
export interface RoleGrid { rol: string; sections: RoleGridRow[]; }

export interface EffectiveGridRow {
  sectionId: string;
  roleLevel: SectionAccessLevel;
  overrideLevel: SectionAccessLevel | null;
  effectiveLevel: SectionAccessLevel;
}
export interface EffectiveGrid { userId: number; rol: string; sections: EffectiveGridRow[]; }

export interface RoleGridEntryPayload { sectionId: string; level: SectionAccessLevel; }
export interface UserOverrideEntryPayload { sectionId: string; level: SectionAccessLevel | null; }
```

| Function | Signature | Endpoint |
|----------|-----------|----------|
| `getRolePermisos` | `(rol: string): Promise<RoleGrid>` | `GET /permisos/roles/${rol}` |
| `putRolePermisos` | `(rol, sections: RoleGridEntryPayload[]): Promise<RoleGrid>` | `PUT /permisos/roles/${rol}` |
| `getUserPermisos` | `(userId: number): Promise<EffectiveGrid>` | `GET /permisos/users/${userId}` |
| `putUserPermisos` | `(userId, sections: UserOverrideEntryPayload[]): Promise<EffectiveGrid>` | `PUT /permisos/users/${userId}` |

Mutations send `{ ...getAuthHeader(), 'Content-Type': 'application/json' }` and
`body: JSON.stringify({ sections })`. Fallback messages: `'No se pudieron obtener los permisos'`
/ `'No se pudieron guardar los permisos'`.

### `client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` (new — mirrors `usuarios/editar/[id]`)

`'use client'` page. Route param `id` = the target `userId`.

- **Load:** on mount, `getUserPermisos(Number(id))`; hold the `EffectiveGrid` in state. Show a
  loading state and an error state mirroring `editar/[id]`'s conventions. Also fetch the user's
  display name for the header via `getUser(id)` (`lib/users.ts`), same as the edit page, so the
  title reads e.g. "Permisos de {nombre apellido / username}".
- **Render:** a per-section table joined with `SECTION_CATALOG` for labels (canonical order),
  columns:

  | Sección | Valor del rol | Acceso del usuario |
  |---------|---------------|--------------------|
  | `label` (from `SECTION_CATALOG`) | `roleLevel` rendered **read-only** as a pill (`Acceso total` / `Solo lectura` / `Sin acceso`) | the 4-state control below |

  The **control** is a `<select>` (or segmented buttons) per row with four options:
  - `Usar valor del rol (heredar)` → maps to `overrideLevel = null`
  - `Acceso total` → `total`
  - `Solo lectura` → `lectura`
  - `Sin acceso` → `sin_acceso`

  The current selection reflects `row.overrideLevel` (null → "Usar valor del rol"). A small
  read-only `effectiveLevel` indicator per row shows the resolved value (helps the admin see that
  "heredar" resolves to the role default).
- **Save:** a single "Guardar cambios" button collects **all rows** into
  `UserOverrideEntryPayload[]` (`{ sectionId, level: overrideLevel }`, where the inherited state
  sends `level: null`) and calls `putUserPermisos(userId, sections)`. The endpoint returns the
  fresh grid → replace state with the response (authoritative re-render). Optimistically disable
  the button while in-flight; on error show a toast and keep the edited state. (Per-row instant
  save is an accepted alternative — see Decision A5; the batch "Guardar" is the chosen default to
  match the page-based edit convention.)
- **Copy tone:** header/help text reads as *configuración* ("Configurá el acceso por sección para
  este usuario. Todavía no se aplica el bloqueo — la restricción llega en una etapa futura."),
  mitigating the proposal risk "team assumes this slice already enforces access".

### `client/app/(dashboard)/usuarios/page.tsx` (modify — insert the "Permisos" row-action)

Insert a third dropdown item **between** the existing "Editar" `<Link>` (ends at line 455) and
the Activar/Desactivar `<button>` (starts at line 456), following the exact `<Icon/> + <Link>`
pattern of the "Editar" entry:

```tsx
<Link
  href={`/usuarios/permisos/${user.id}`}
  onClick={closeMenu}
  className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
>
  <KeyIcon />
  Permisos
</Link>
```

Use an existing inline icon component in the file's icon set (the file already defines
`PencilIcon`, `NoSymbolIcon`, `CheckCircleIcon`); add a small `KeyIcon` alongside them following
the same SVG-component pattern, or reuse `PencilIcon` if adding an icon is out of budget
(cosmetic, non-blocking — same placeholder stance as the nav icons). It is **NOT** a sidebar nav
item (proposal Success Criteria).

## Architecture Decisions

### Decision A1: Drop orphaned drift tables BEFORE migrating, then plain `migrate dev` (resolves R1)

**Context:** two empty, untracked tables in the live dev DB would make `prisma migrate dev`
detect drift and propose an interactive database reset, which `prisma migrate dev` can fail on in
a non-interactive apply environment (a known, general Prisma CLI behavior when the command needs
to prompt).

**Choice:** drop both tables first via `prisma db execute` (non-interactive, reads the datasource
URL), which erases the drift condition, then run a normal `migrate dev` that creates both tables
cleanly under proper migration history.

**Alternatives:** (a) go straight to the `migrate diff` + hand-built-folder + `migrate deploy`
workaround as the *primary* path — rejected as the default because it bypasses `migrate dev`'s
history bookkeeping and is more error-prone; kept only as the **documented fallback** if
`migrate dev` still refuses. (b) `prisma db push` — rejected: it does not create a tracked
migration file, defeating the "clean, properly-tracked migration" success criterion.

**Rationale:** the interactive prompt is triggered by the data-loss/reset warning; removing the
conflicting tables first removes that trigger, so the normal, best-practice command works. Tables
are confirmed empty, so the drop is safe and reversible.

### Decision A2: Canonical-list-driven merge (server-side), drift-safe (resolves R3)

**Choice:** compute the effective grid by iterating `SECTION_IDS` and left-joining the two tables,
not by returning DB rows. Precedence `override ?? roleDefault ?? sin_acceso`.

**Rationale:** guarantees a fixed 15-row response regardless of DB contents; a section with no
rows returns `sin_acceso`; a stale `sectionId` in the DB (drift) is silently ignored. This keeps
the contract stable and self-healing, and puts the merge authority on the server (the client only
renders).

### Decision A3: `:rol` is free-form — unknown rol is allowed through (resolves R4)

**Choice:** the API does **not** validate `:rol` against `USER_ROLES`. Any string is accepted; an
unknown/typo'd rol simply has no stored `RoleSectionAccess` rows and resolves to an all-`sin_acceso`
grid. No `400 'Rol desconocido.'` is raised.

**Alternatives:** bound the API to the four `USER_ROLES` and reject unknown values with `400` —
rejected: it contradicts D2's explicit "free-form `String` (not a DB enum — revisable later without
a schema break)" and the spec, which imposes no rol allow-list ("Any authenticated rol can call the
permisos endpoints"). Adding an API-level allow-list would re-introduce the very coupling D2 avoids
and would break the moment the role set evolves. Make `rol` a DB enum — rejected for the same D2
reason.

**Rationale:** the `rol` column is deliberately free-form so the role set can change without a
migration; mirroring that at the API edge (no allow-list) keeps storage and contract consistent and
matches the spec. Validation is applied only where the contract requires it — `sectionId` (`@IsIn
SECTION_IDS` → 400) and `userId` (existence → 404). Unknown rol is a harmless read of an empty grid,
not an error.

### Decision A4: `null` level = clear via `deleteMany` (idempotent) (resolves R5 write path)

**Choice:** clearing a user override sends `level: null`, and the service uses `deleteMany({
where: { userId, sectionId } })` (a no-op when the row is absent) rather than `delete` (which
throws on a missing row).

**Rationale:** the admin UI's "usar valor del rol" is a toggle that may be selected on a section
that was never overridden; `deleteMany` makes "clear an already-inherited section" a safe no-op
instead of a 404. Matches the proposal's "clearing deletes the override row so the user falls back
to the role default."

### Decision A5: Batch "Guardar cambios" over per-row instant save

**Choice:** the page collects all 15 rows and saves them in one `PUT` (the endpoint already
accepts an array and returns the fresh grid).

**Alternatives:** per-row instant PUT on each `<select>` change — rejected as the default: it
multiplies round-trips and diverges from the page-based edit convention (`editar/[id]` saves on a
submit). The endpoint supports either (a single-element array works), so a later switch is cheap.

**Rationale:** one authoritative save + one authoritative re-render matches the house edit-page
UX and keeps the effective-grid recomputation on the server as the single source of truth.

### Decision A6: `JwtAuthGuard` only, no role guard; no audit columns; no `req.user` on writes

**Choice:** class-level `@UseGuards(JwtAuthGuard)`, no `RolesGuard`; writes take no
`actualizadoPorId` (D3 — no audit columns exist on these tables).

**Rationale:** consistent with every existing module (no `RolesGuard` exists); enforcement is a
separate future change (proposal Non-Goals). D3 adopts the recovered schema exactly; dropping the
`@Request()` stamping is the direct consequence and the one intentional divergence from the
`users` controller shape.

## Sequence Diagram — admin sets a per-user override for one section

```mermaid
sequenceDiagram
  actor A as Admin
  participant P as usuarios/permisos/[id] page
  participant C as lib/permisos.ts
  participant GAPI as GET /permisos/users/:userId
  participant PAPI as PUT /permisos/users/:userId
  participant S as PermisosService
  participant DB as MySQL (Prisma)

  Note over A,DB: 1) Open the page → load effective grid
  A->>P: navigate /usuarios/permisos/7 (from Usuarios "Permisos" action)
  P->>C: getUserPermisos(7)
  C->>GAPI: GET /permisos/users/7 (Bearer)
  GAPI->>S: getUserGrid(7)
  S->>DB: assertUserExists(7) → { id, rol }
  DB-->>S: user (else 404)
  S->>DB: roleSectionAccess.findMany({ rol }) + userSectionOverride.findMany({ userId: 7 })
  DB-->>S: role rows + override rows
  Note over S: merge over SECTION_IDS → 15 rows (override ?? role ?? sin_acceso)
  S-->>GAPI: { userId, rol, sections[15] }
  GAPI-->>C: 200 grid
  C-->>P: grid
  P->>A: render table (Sección | Valor del rol read-only | control)

  Note over A,DB: 2) Set an override on one section, then Guardar
  A->>P: change "usuarios" control from "heredar" to "Solo lectura"
  A->>P: click "Guardar cambios"
  P->>C: putUserPermisos(7, [ ...15 rows, { sectionId:"usuarios", level:"lectura" }, ... ])
  C->>PAPI: PUT /permisos/users/7 { sections }
  PAPI->>S: putUserGrid(7, dto)
  S->>DB: assertUserExists(7)
  rect rgb(238,238,238)
    note over S,DB: single $transaction
    S->>DB: upsert userId_sectionId {7,"usuarios"} → level="lectura"
    S->>DB: deleteMany for entries with level=null (inherited sections; no-op if absent)
  end
  S->>DB: buildEffectiveGrid → re-read role + override rows, merge over SECTION_IDS
  DB-->>S: fresh rows
  S-->>PAPI: { userId, rol, sections[15] }  (usuarios.overrideLevel="lectura", effective="lectura")
  PAPI-->>C: 200 fresh grid
  C-->>P: fresh grid
  P->>P: replace state with response (authoritative re-render)
  P->>A: "usuarios" row now shows override=Solo lectura, effective=Solo lectura
```

## Data Flow

    Usuarios list (usuarios/page.tsx) ── row action "Permisos" ──▶ /usuarios/permisos/[id]
        │
        ├─ getUserPermisos(userId) ──▶ GET /permisos/users/:userId ──JwtAuthGuard──▶ getUserGrid
        │        └──▶ assertUserExists → findMany(role) + findMany(override) → merge over SECTION_IDS → 15 rows
        │
        └─ edit controls (per-section: total|lectura|sin_acceso|heredar) + "Guardar cambios"
              └─ putUserPermisos(userId, sections[]) ──▶ PUT /permisos/users/:userId ──▶ putUserGrid
                     └──▶ $tx{ upsert(level set) / deleteMany(level null) } → re-merge → fresh 15-row grid

    (role-grid endpoints, API-only in this slice)
    GET /permisos/roles/:rol  ──▶ getRoleGrid  → buildRoleGrid (role rows ?? sin_acceso), 15 rows
    PUT /permisos/roles/:rol  ──▶ putRoleGrid  → $tx{ upsert per section } → buildRoleGrid

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/prisma/schema.prisma` | Modify | Add `SectionAccessLevel` enum + `RoleSectionAccess` + `UserSectionOverride` models; `User.sectionOverrides` back-relation |
| `server/prisma/drop-orphaned-section-tables.sql` | Create (temp) | Drops the two empty orphaned drift tables before migrating; deleted after apply |
| `server/prisma/migrations/<ts>_add_section_access/` | Create | Clean additive migration (two tables + enum + FK) generated by `migrate dev` (fallback: hand-built per *Migration SQL*) |
| `server/src/permisos/permisos.module.ts` | Create | Module wiring |
| `server/src/permisos/permisos.controller.ts` | Create | Guarded controller: `roles` GET/PUT + `users` GET/PUT |
| `server/src/permisos/permisos.service.ts` | Create | getRoleGrid/putRoleGrid/getUserGrid/putUserGrid + private guards + merge |
| `server/src/permisos/section-catalog.ts` | Create | `SECTION_IDS`, `SECTION_ACCESS_LEVELS` + types |
| `server/src/permisos/dto/put-role-grid.dto.ts` | Create | `PutRoleGridDto` + `RoleSectionEntryDto` |
| `server/src/permisos/dto/put-user-overrides.dto.ts` | Create | `PutUserOverridesDto` + `UserOverrideEntryDto` (nullable level) |
| `server/src/app.module.ts` | Modify | Import + register `PermisosModule` |
| `client/app/lib/permisos.ts` | Create | `SECTION_CATALOG` + typed client (4 fns) + types |
| `client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` | Create | Per-user effective-grid admin page |
| `client/app/(dashboard)/usuarios/page.tsx` | Modify | Insert "Permisos" row-action between "Editar" and Activar/Desactivar (lines 455→456) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Migration | Orphaned tables dropped first; `migrate dev` creates both tables under history; `_prisma_migrations` records the new migration; both `@@unique` indexes present; `level` is a MySQL `ENUM('total','lectura','sin_acceso')` | Run the Step 0–3 procedure against the confirmed local dev DB; verify with `SHOW TABLES` + `SHOW CREATE TABLE` |
| API | 401 without token on all 4 routes; `GET/PUT /permisos/roles/:rol` accepts an **unknown/typo'd rol** and returns 15 all-`sin_acceso` rows (no 400 — free-form); `PUT` bodies 400 on unknown `sectionId` / invalid `level`; `GET /permisos/users/:userId` 404 on non-existent user and returns exactly 15 rows with correct `override ?? role ?? sin_acceso`; `PUT /permisos/users/:userId` upserts on a level and **clears via deleteMany** on `null` (idempotent — clearing an already-inherited section is a no-op, not a 404); deleting a `User` cascades away its overrides | Exercise endpoints against the reachable DB — **confirm `DATABASE_URL` before migrating** |
| UI | The Usuarios dropdown shows "Permisos" between "Editar" and Activar/Desactivar, linking to `/usuarios/permisos/{id}`; it is NOT in the sidebar; the page renders 15 rows with the role default read-only and a 4-state control incl. "usar valor del rol"; Guardar round-trips and re-renders from the server response; copy reads as configuración, not active gating | Manual walkthrough |
| Regression | No existing route/page/controller gains a guard; `req.user`/JWT stays `{ userId, username }`; sidebar unchanged | Grep for new `@UseGuards`/`RolesGuard`; diff `jwt.strategy.ts` and `navigation.tsx` (unchanged) |

## Migration / Rollout

One additive migration adds `RoleSectionAccess` + `UserSectionOverride` (+ the enum type and the
`UserSectionOverride.userId` FK), **after** the pre-existing orphaned copies are dropped (Decision
A1 / R1). Reversible per the proposal Rollback Plan: the down operation drops
`UserSectionOverride` then `RoleSectionAccess` and removes `User.sectionOverrides`; both tables
are empty, no committed history referenced the orphaned versions, no data backfill. All referenced
tables (`User`) pre-exist and are touched only by the additive back-relation + FK.

## Open Questions

- [ ] Confirm `DATABASE_URL` points at the intended local dev instance (`localhost:3310/axionis-taller`) before Step 1's drop and Step 3's migrate (proposal Known-Gap; the drop is destructive-by-design but safe only against the confirmed-empty drift tables).
- [ ] Batch "Guardar" vs per-row instant save (Decision A5) — default is batch; confirm that matches the desired admin UX, since the endpoint supports either.
- [ ] "Permisos" row-action icon — add a dedicated `KeyIcon` or reuse an existing inline icon (cosmetic, non-blocking).
</content>
</invoke>
