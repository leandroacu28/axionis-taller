# Tasks: Permisos de Usuarios (Section Access Management — data + admin UI only)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-650 |
| 400-line budget risk | Medium (total exceeds 400, but the natural backend/frontend phase boundary keeps each PR under budget) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (drift cleanup + Prisma schema/migration + backend `permisos` module) → PR 2 (frontend API client + Permisos page + dropdown entry) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

This slice is much smaller than `presupuestos-crud` (no list page, no create/edit form pair, no duplicated large picker component) — one new backend module (4 thin CRUD-ish endpoints) and one new frontend page plus a client and a one-line dropdown insertion. Estimate breakdown, calibrated against `design.md`'s File Changes table and the exact code snippets it specifies:

- `server/prisma/schema.prisma`: `SectionAccessLevel` enum + `RoleSectionAccess` + `UserSectionOverride` models + `User.sectionOverrides` back-relation — ~30 lines
- `server/prisma/drop-orphaned-section-tables.sql`: temporary, deleted after apply (not part of final diff) — ~3 lines transient
- Generated migration SQL (two tables + one FK, per `design.md` "Migration SQL"): ~28 lines
- `permisos.module.ts`: ~8 lines
- `permisos.controller.ts` (4 routes, no `@Request()` needed — D3): ~45-55 lines
- `permisos.service.ts` (4 public methods + 3 private helpers, all Prisma-owning): ~90-110 lines
- `section-catalog.ts` (`SECTION_IDS`, `SECTION_ACCESS_LEVELS` + types): ~15 lines
- `dto/put-role-grid.dto.ts`: ~20 lines
- `dto/put-user-overrides.dto.ts` (nullable `level`): ~27 lines
- `app.module.ts` edit: ~2 lines
- `client/app/lib/permisos.ts` (`SECTION_CATALOG` + types + 4 typed functions): ~100-130 lines
- `client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` (15-row table + 4-state control + batch save): ~150-190 lines
- `client/app/(dashboard)/usuarios/page.tsx` edit (dropdown item + optional `KeyIcon`): ~15-25 lines

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Drift cleanup + Prisma schema + migration (`SectionAccessLevel` enum, `RoleSectionAccess` + `UserSectionOverride` models, `User` back-relation, `add_section_access` migration) | PR 1 | ~60-70 lines net (drop-sql is transient); foundational, must land before the Prisma Client exposes the new delegates |
| 2 | Backend `permisos` module (`section-catalog.ts`, DTOs, service, controller, module) + `app.module.ts` registration | PR 1 | ~205-235 lines; combined with Unit 1, PR 1 lands at ~265-305 lines — comfortably under 400 |
| 3 | `client/app/lib/permisos.ts` + `usuarios/permisos/[id]/page.tsx` | PR 2 | ~250-320 lines; depends on PR 1's endpoints being live |
| 4 | `usuarios/page.tsx` dropdown entry | PR 2 | ~15-25 lines; small, bundled with Unit 3 rather than its own PR |

## Phase 1: Drift Cleanup, Prisma Schema & Migration

- [x] 1.1 **Apply-phase precondition (Step 0)**: confirm `DATABASE_URL` in `server/.env` points at the intended local dev instance (`localhost:3310/axionis-taller`) before touching anything (proposal Known-Gap, restated in `design.md`)
- [x] 1.2 Create `server/prisma/drop-orphaned-section-tables.sql` with exactly `DROP TABLE IF EXISTS \`UserSectionOverride\`;` then `DROP TABLE IF EXISTS \`RoleSectionAccess\`;` (Step 1, `design.md` R1)
- [x] 1.3 Run `npx prisma db execute --file prisma/drop-orphaned-section-tables.sql --schema prisma/schema.prisma` from `server/` to drop the two confirmed-empty orphaned drift tables (idempotent — safe if already gone)
- [x] 1.4 Modify `server/prisma/schema.prisma`: add `enum SectionAccessLevel { total lectura sin_acceso }` (Step 2)
- [x] 1.5 Modify `server/prisma/schema.prisma`: add the `RoleSectionAccess` model exactly as specified in `design.md` (`id`, `rol String`, `sectionId String`, `level SectionAccessLevel`, `createdAt`, `updatedAt`, `@@unique([rol, sectionId])`) — no relation to `User`
- [x] 1.6 Modify `server/prisma/schema.prisma`: add the `UserSectionOverride` model exactly as specified in `design.md` (`id`, `userId Int`, `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` unnamed relation, `sectionId String`, `level SectionAccessLevel`, `createdAt`, `updatedAt`, `@@unique([userId, sectionId])`)
- [x] 1.7 Modify `server/prisma/schema.prisma`: add the back-relation `sectionOverrides UserSectionOverride[]` to the `User` model (append alongside `presupuestoProductosActualizados`)
- [x] 1.8 Run `npx prisma migrate dev --name add_section_access` in `server/` (Step 3 primary path) — expected to generate `server/prisma/migrations/<timestamp>_add_section_access/migration.sql` creating both tables + the `UserSectionOverride_userId_fkey` FK cleanly, and regenerate the Prisma Client. **Refused non-interactively as documented** ("environment is non-interactive").
- [x] 1.9 **Fallback used (1.8 refused non-interactively)**: `npx prisma migrate diff --from-url "$DATABASE_URL" ...` was tried first but surfaced unrelated pre-existing drift (`Presupuesto`/`PresupuestoProducto` tables live in the DB with no matching model/migration in this branch) that would have been dropped — **not applied**. Switched to a pure schema-to-schema diff (`migrate diff --from-schema-datamodel <pre-change schema> --to-schema-datamodel prisma/schema.prisma --script`, no DB involved) to get only the two new tables, matching `design.md`'s exact SQL. Hand-built `prisma/migrations/20260721133817_add_section_access/migration.sql`, then `npx prisma migrate deploy` and `npx prisma generate`
- [x] 1.10 Delete the temporary `server/prisma/drop-orphaned-section-tables.sql` after the migration is applied (not part of migration history)
- [x] 1.11 Verify via `SHOW TABLES` + `SHOW CREATE TABLE` that both tables exist under proper migration history (`_prisma_migrations` records the new migration), both `@@unique` indexes (`RoleSectionAccess_rol_sectionId_key`, `UserSectionOverride_userId_sectionId_key`) are present, and `level` is a MySQL `ENUM('total','lectura','sin_acceso')`

## Phase 2: Backend Module — DTOs

_Depends on: Phase 1 (Prisma Client must expose the new delegates)._

- [ ] 2.1 Create `server/src/permisos/section-catalog.ts`: `SECTION_IDS` (the 15 canonical slugs `as const`), `SectionId` type, `SECTION_ACCESS_LEVELS` (`['total', 'lectura', 'sin_acceso'] as const`), `SectionAccessLevelValue` type — exact content per `design.md` (with the cross-reference comment pointing at `client/app/lib/permisos.ts`)
- [ ] 2.2 Create `server/src/permisos/dto/put-role-grid.dto.ts`: `RoleSectionEntryDto` (`sectionId: string` `@IsString @IsIn(SECTION_IDS)`; `level: string` `@IsIn(SECTION_ACCESS_LEVELS)`) + `PutRoleGridDto` (`sections: RoleSectionEntryDto[]` `@IsArray @ArrayNotEmpty @ValidateNested({each:true}) @Type(() => RoleSectionEntryDto)`) — exact content per `design.md`
- [ ] 2.3 Create `server/src/permisos/dto/put-user-overrides.dto.ts`: `UserOverrideEntryDto` (`sectionId: string` `@IsString @IsIn(SECTION_IDS)`; `level: string | null` with `@ValidateIf((o) => o.level !== null) @IsIn(SECTION_ACCESS_LEVELS)`) + `PutUserOverridesDto` (`sections: UserOverrideEntryDto[]`) — exact content per `design.md`

## Phase 3: Backend Module — Service

_Depends on: Phase 2 (DTOs), Phase 1 (Prisma Client)._

- [ ] 3.1 Create `server/src/permisos/permisos.service.ts`: `@Injectable()`, `constructor(private readonly prisma: PrismaService) {}`, import `Prisma`/`SectionAccessLevel` from `@prisma/client` and `SECTION_IDS` from `./section-catalog`
- [ ] 3.2 Add private `assertUserExists(userId)`: `prisma.user.findUnique({ where: { id: userId }, select: { id: true, rol: true } })`; `null` → `NotFoundException('Usuario no encontrado.')`; returns `{ id, rol }`
- [ ] 3.3 Add private `buildRoleGrid(rol)`: `prisma.roleSectionAccess.findMany({ where: { rol } })` → `Map<sectionId, level>`; map over `SECTION_IDS` → `{ sectionId, level: map.get(sectionId) ?? 'sin_acceso' }`
- [ ] 3.4 Add private `buildEffectiveGrid(user)`: fetch role rows (`user.rol`) into one `Map` and override rows (`user.id`) into another; map over `SECTION_IDS` → `{ sectionId, roleLevel, overrideLevel, effectiveLevel }` per the merge algorithm in `design.md` (`roleLevel = roleMap.get(sectionId) ?? 'sin_acceso'`, `overrideLevel = overrideMap.get(sectionId) ?? null`, `effectiveLevel = overrideLevel ?? roleLevel`)
- [ ] 3.5 Add `getRoleGrid(rol)`: return `{ rol, sections: buildRoleGrid(rol) }` — no `rol` validation (free-form per Decision A3)
- [ ] 3.6 Add `putRoleGrid(rol, dto)`: `$transaction(dto.sections.map(s => prisma.roleSectionAccess.upsert({ where: { rol_sectionId: { rol, sectionId: s.sectionId } }, create: { rol, sectionId: s.sectionId, level: s.level }, update: { level: s.level } })))`; return `{ rol, sections: buildRoleGrid(rol) }` (a section omitted from the body is left unchanged — partial-grid upsert)
- [ ] 3.7 Add `getUserGrid(userId)`: `const user = await assertUserExists(userId)`; return `{ userId, rol: user.rol, sections: buildEffectiveGrid(user) }`
- [ ] 3.8 Add `putUserGrid(userId, dto)`: `const user = await assertUserExists(userId)`; in a `$transaction`, for each entry — `level === null` → `deleteMany({ where: { userId, sectionId } })` (Decision A4, idempotent no-op if absent); else `upsert({ where: { userId_sectionId: { userId, sectionId } }, create: { userId, sectionId, level }, update: { level } })`; then return `{ userId, rol: user.rol, sections: buildEffectiveGrid(user) }` (re-run the merge for authoritative post-write state)

## Phase 4: Backend Module — Controller & Module Registration

_Depends on: Phase 3 (service)._

- [ ] 4.1 Create `server/src/permisos/permisos.controller.ts`: `@Controller('permisos')`, class-level `@UseGuards(JwtAuthGuard)` (no role guard)
- [ ] 4.2 Add `@Get('roles/:rol')` → `getRoleGrid(@Param('rol') rol: string)` calling `permisosService.getRoleGrid(rol)`
- [ ] 4.3 Add `@Put('roles/:rol')` → `putRoleGrid(@Param('rol') rol: string, @Body() dto: PutRoleGridDto)` calling `permisosService.putRoleGrid(rol, dto)`
- [ ] 4.4 Add `@Get('users/:userId')` → `getUserGrid(@Param('userId', ParseIntPipe) userId: number)` calling `permisosService.getUserGrid(userId)`
- [ ] 4.5 Add `@Put('users/:userId')` → `putUserGrid(@Param('userId', ParseIntPipe) userId: number, @Body() dto: PutUserOverridesDto)` calling `permisosService.putUserGrid(userId, dto)`
- [ ] 4.6 Confirm route declaration order places the literal `roles`/`users` segments before their params (no `:id`-capture hazard) — matches `design.md`'s controller snippet; no `@Request()`/`req.user` param anywhere (D3 — no audit columns to stamp)
- [ ] 4.7 Create `server/src/permisos/permisos.module.ts`: `controllers: [PermisosController]`, `providers: [PermisosService]` → `export class PermisosModule {}`
- [ ] 4.8 Modify `server/src/app.module.ts`: import `PermisosModule` from `./permisos/permisos.module` and register it in `imports` (after `PresupuestosModule`)

## Phase 5: Backend Manual Verification

_No automated test runner is configured in this repo (`strict_tdd: false`); verify manually against a running server + reachable DB._

- [ ] 5.1 Verify `GET/PUT /permisos/roles/:rol` and `GET/PUT /permisos/users/:userId` all return 401 without a Bearer token
- [ ] 5.2 Verify `GET`/`PUT /permisos/roles/:rol` with an unknown/typo'd `rol` returns `200` with 15 all-`sin_acceso` rows (no `400` — free-form per Decision A3)
- [ ] 5.3 Verify `PUT /permisos/roles/:rol` and `PUT /permisos/users/:userId` return `400` on an unknown `sectionId` or an invalid `level` value
- [ ] 5.4 Verify `GET /permisos/users/:userId` returns `404 'Usuario no encontrado.'` for a non-existent user, and exactly 15 rows with correct `override ?? role ?? sin_acceso` merge for an existing user
- [ ] 5.5 Verify `PUT /permisos/users/:userId` upserts a `UserSectionOverride` row when a level is set, and **deletes it via `deleteMany`** (idempotent, no `404`) when `level` is `null` — including clearing an already-inherited (never-overridden) section as a safe no-op
- [ ] 5.6 Verify `PUT /permisos/roles/:rol` upserts `RoleSectionAccess` rows keyed on `(rol, sectionId)`, leaving sections omitted from the body unchanged (partial-grid upsert, not full replace)
- [ ] 5.7 Verify deleting a `User` cascades away its `UserSectionOverride` rows (`onDelete: Cascade`)
- [ ] 5.8 Verify any authenticated `rol` (e.g. `'empleado'`) succeeds identically to `'administrador'` on all 4 routes (no role guard)
- [ ] 5.9 Regression: grep for new `@UseGuards`/`RolesGuard` outside `server/src/permisos/` — confirm none added; diff `server/src/auth/strategies/jwt.strategy.ts` — confirm `req.user` stays exactly `{ userId, username }`

## Phase 6: Frontend API Client

_Depends on: Phase 5 (backend verified live)._

- [ ] 6.1 Create `client/app/lib/permisos.ts`: `SECTION_CATALOG` (`{ id, label }[]`, 15 entries mirroring `section-catalog.ts`'s `SECTION_IDS` with the cross-reference comment, labels per `design.md`), `SectionAccessLevel` type, `RoleGridRow`/`RoleGrid`, `EffectiveGridRow`/`EffectiveGrid`, `RoleGridEntryPayload`/`UserOverrideEntryPayload` types — exact shapes per `design.md`
- [ ] 6.2 Copy the `handleJsonResponse<T>` + `getAuthHeader()` pattern verbatim from `client/app/lib/users.ts`
- [ ] 6.3 Add `getRolePermisos(rol: string): Promise<RoleGrid>` → `GET /permisos/roles/${rol}`
- [ ] 6.4 Add `putRolePermisos(rol, sections: RoleGridEntryPayload[]): Promise<RoleGrid>` → `PUT /permisos/roles/${rol}`
- [ ] 6.5 Add `getUserPermisos(userId: number): Promise<EffectiveGrid>` → `GET /permisos/users/${userId}`
- [ ] 6.6 Add `putUserPermisos(userId, sections: UserOverrideEntryPayload[]): Promise<EffectiveGrid>` → `PUT /permisos/users/${userId}`; mutations send `{ ...getAuthHeader(), 'Content-Type': 'application/json' }` and `body: JSON.stringify({ sections })`; fallback error messages `'No se pudieron obtener los permisos'` / `'No se pudieron guardar los permisos'`

## Phase 7: Frontend Permisos Page

_Depends on: Phase 6 (API client)._

- [ ] 7.1 Create `client/app/(dashboard)/usuarios/permisos/[id]/page.tsx` as a `'use client'` page, mirroring `usuarios/editar/[id]`'s route/loading/error conventions (route param `id` = target `userId`)
- [ ] 7.2 On mount, fetch `getUserPermisos(Number(id))` into `EffectiveGrid` state, and `getUser(id)` (`lib/users.ts`) for the header display name (title reads "Permisos de {nombre apellido / username}")
- [ ] 7.3 Render a per-section table joined with `SECTION_CATALOG` (canonical order), columns: Sección (`label`) / Valor del rol (read-only pill: `Acceso total` / `Solo lectura` / `Sin acceso`, driven by `roleLevel`) / Acceso del usuario (the 4-state control)
- [ ] 7.4 Implement the 4-state control per row (`<select>` or segmented buttons): `Usar valor del rol (heredar)` → `overrideLevel = null`; `Acceso total` → `total`; `Solo lectura` → `lectura`; `Sin acceso` → `sin_acceso`. Current selection reflects `row.overrideLevel` (`null` → heredar). Add a small read-only `effectiveLevel` indicator per row
- [ ] 7.5 Implement the "Guardar cambios" button: collect all rows into `UserOverrideEntryPayload[]` (`{ sectionId, level: overrideLevel }`, inherited rows send `level: null`), call `putUserPermisos(userId, sections)`, replace state with the response on success (authoritative re-render), disable the button while in-flight, show a toast and keep the edited state on error (Decision A5 — batch save, not per-row instant save)
- [ ] 7.6 Add header/help copy that reads as *configuración*, not active gating, using the exact tone from `design.md`: "Configurá el acceso por sección para este usuario. Todavía no se aplica el bloqueo — la restricción llega en una etapa futura."

## Phase 8: Frontend Dropdown Entry

_Depends on: Phase 7 (target route must exist)._

- [ ] 8.1 Modify `client/app/(dashboard)/usuarios/page.tsx`: insert a "Permisos" `<Link href={`/usuarios/permisos/${user.id}`}>` item **between** the existing "Editar" `<Link>` and the Activar/Desactivar `<button>`, following the exact `<Icon/>` + `Link` pattern of "Editar" (`onClick={closeMenu}`, same `className`) per the `design.md` snippet
- [ ] 8.2 Add a `KeyIcon` inline SVG component alongside the file's existing `PencilIcon`/`NoSymbolIcon`/`CheckCircleIcon` (or reuse `PencilIcon` if icon addition is out of budget — cosmetic, non-blocking per `design.md`)
- [ ] 8.3 Confirm the "Permisos" entry is **not** added to `client/app/lib/navigation.tsx` — no sidebar nav item (proposal Success Criteria)

## Phase 9: Frontend Manual Verification

_No automated test runner configured (`strict_tdd: false`); verify manually._

- [ ] 9.1 Verify the Usuarios row-actions dropdown shows items in order "Editar", "Permisos", "Activar/Desactivar", and "Permisos" links to `/usuarios/permisos/{id}`
- [ ] 9.2 Verify navigating to `/usuarios/permisos/{id}` for an existing user loads and renders 15 rows with the correct role default (read-only) and effective level
- [ ] 9.3 Verify navigating to `/usuarios/permisos/{id}` for a non-existent `id` shows an error state without crashing (matching the `404` from `GET /permisos/users/:userId`)
- [ ] 9.4 Verify setting a section to `lectura`/`total`/`sin_acceso` and clicking "Guardar cambios" persists the override and the row reflects the new effective value after the authoritative re-render
- [ ] 9.5 Verify selecting "usar valor del rol" on a previously-overridden section, then "Guardar cambios", clears the override and the row falls back to the role default
- [ ] 9.6 Verify the page is reachable by any authenticated user regardless of `rol` (no role check applied), and that `client/app/lib/navigation.tsx` has no entry linking to `/usuarios/permisos` or any `permisos` route (grep confirms `Sidebar` unchanged)

## Phase 10: Documentation & Final Sign-off

- [ ] 10.1 Walk `proposal.md`'s Success Criteria list end to end (clean reversible migration, `GET/PUT` effective-grid merge semantics, `PUT` upsert/clear semantics, dropdown position, no new guards, `req.user`/JWT unchanged) and confirm each item as implemented
- [ ] 10.2 Confirm the Rollback Plan steps are accurate and executable as written: reverting the migration drops both tables + the `User` back-relation cleanly (both empty, no orphaned history to reconcile); `server/src/permisos/` + the `app.module.ts` import are removable independently; the frontend page, `lib/permisos.ts`, and the dropdown entry are removable independently
- [ ] 10.3 Confirm the proposal's Non-Goals still hold as implemented: no route/page/controller gained a guard outside `server/src/permisos/`; `req.user`/JWT shape unchanged (`{ userId, username }`); `app-navigation`'s "No Role Filtering in V1" and sidebar structure unchanged; no audit columns added (D3); no role-default seeding performed (grids default to `sin_acceso` until an admin sets them)
