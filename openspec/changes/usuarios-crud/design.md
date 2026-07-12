# Design: Usuarios CRUD (Create, List, Update)

## Technical Approach

Add a NestJS `users` module that is structurally identical to `auth/` (thin controller, service owns Prisma + bcrypt, explicit `class-validator` DTOs), plus a client-rendered `/usuarios` page and a `lib/users.ts` fetch wrapper mirroring `lib/auth.ts`. No schema change (all `User` fields exist), no role/permission guard (deferred to future Permisos — see exploration addendum). Only `JwtAuthGuard` protects the endpoints.

## Backend Module Structure

`server/src/users/` mirrors `auth/`'s shape:

| File | Contents |
|------|----------|
| `users.controller.ts` | `@Controller('users')`, `@UseGuards(JwtAuthGuard)` at class level; `@Get()`, `@Post()`, `@Patch(':id')` |
| `users.service.ts` | `findAll()`, `create(dto)`, `update(id, dto)`; owns Prisma + bcrypt |
| `users.module.ts` | `controllers: [UsersController]`, `providers: [UsersService]` |
| `dto/create-user.dto.ts` | see below |
| `dto/update-user.dto.ts` | see below |

### DTOs (every field explicit — global `whitelist: true` silently strips unknowns)

```ts
// create-user.dto.ts
export class CreateUserDto {
  @IsString() @IsNotEmpty() username: string;
  @IsString() @IsNotEmpty() password: string;
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() apellido?: string;
  @IsIn(['admin', 'empleado']) rol: string;
}

// update-user.dto.ts — NO username field (immutable by omission)
export class UpdateUserDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() apellido?: string;
  @IsOptional() @IsIn(['admin', 'empleado']) rol?: string;
  @IsOptional() @IsString() @IsNotEmpty() password?: string;
}
```

### Service methods

- `findAll()` → `prisma.user.findMany({ select: { id, username, nombre, apellido, rol, createdAt, updatedAt } })` — `passwordHash` excluded via `select` so N hashes never enter memory.
- `create(dto)` → `findUnique({ where: { username } })`; if found `throw new ConflictException(...)`. Else `bcrypt.hash(dto.password, 10)`, `prisma.user.create({ data: { username, passwordHash, nombre, apellido, rol } })`, return without hash.
- `update(id, dto)` → `findUnique({ where: { id } })`; if missing `throw new NotFoundException(...)`. Build `data` from provided fields; only if `dto.password` present, set `passwordHash = await bcrypt.hash(dto.password, 10)`. `prisma.user.update({ where: { id }, data })`, return without hash.

## Module Registration

`server/src/app.module.ts` — add import and register:

```ts
import { UsersModule } from './users/users.module';
// imports: [ ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, UsersModule ]
```

## Frontend

### `client/app/lib/users.ts`

Reuse `UserData` (has `username/nombre/apellido/rol`) and extend for list rows (needs `id`, cookie-sourced `UserData` lacks it):

```ts
export interface UserListItem extends UserData { id: number; }
export interface CreateUserPayload { username: string; password: string; nombre?: string; apellido?: string; rol: 'admin' | 'empleado'; }
export interface UpdateUserPayload { nombre?: string; apellido?: string; rol?: 'admin' | 'empleado'; password?: string; }
```

Functions mirror `login()`'s shape (`fetch` → `!res.ok` → `throw new Error(msg)` → `res.json()`), each spreading `getAuthHeader()` plus `Content-Type`:
`listUsers(): Promise<UserListItem[]>` (GET), `createUser(data: CreateUserPayload): Promise<UserListItem>` (POST), `updateUser(id: number, data: UpdateUserPayload): Promise<UserListItem>` (PATCH `/users/${id}`).

### `client/app/(dashboard)/usuarios/page.tsx` (rewrite, `'use client'`)

Single page, inline form area (no modal, no new dependency — package.json confirms only next/react/tailwind). State: `users: UserListItem[]`, `loading`, `error`, `editingUser: UserListItem | null`, `formOpen`, form fields. `useEffect` calls `listUsers()` on mount. A table renders rows (username, nombre, apellido, rol, Editar action). "Nuevo usuario" opens the form with `editingUser = null`; "Editar" sets `editingUser = row` and pre-fills fields. Submit: `editingUser ? updateUser(editingUser.id, payload) : createUser(payload)`, then refresh list and close form. In edit mode username input is `disabled` (immutable); password input empty = untouched. `rol` `<select>` has exactly two `<option>`s: `admin`, `empleado`.

### Styling

Light-mode content area (matches dashboard `<main>` on `bg-gray-50`): white table card, slate/stone borders, `text-stone-*`. Primary buttons reuse the exact gradient from `login`/`init`: `bg-gradient-to-r from-rose-500 to-red-500 ... hover:from-rose-600 hover:to-red-600 shadow-lg shadow-rose-500/30`. Error banner reuses `login/page.tsx`: `rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600`. Slate-900 chrome stays in Header/Sidebar; table content is light.

### Error / validation display

`try/catch` around each mutation sets `error` from `err instanceof Error ? err.message : fallback`. Backend 400 (class-validator) and 409 (duplicate username) both arrive as `Error(message)` from the lib wrapper and render in the same red banner above the form.

## Architecture Decisions

### Decision: No role/permission guard
**Choice**: Only `@UseGuards(JwtAuthGuard)`. **Alternatives**: `RolesGuard` with fresh Prisma lookup (exploration Option 2). **Rationale**: User deferred all access control to a future Permisos feature (exploration addendum supersedes the role-guard analysis). Building an ad-hoc admin check now would be discarded/reconciled later.

### Decision: Exclude `passwordHash` via Prisma `select` (not destructuring)
**Choice**: `select` in `findAll`. **Alternatives**: auth.service.ts's post-hoc destructuring (`const { passwordHash, ...rest }`). **Rationale**: destructuring is fine for auth's single post-validation user, but a list would pull every hash into memory before discarding it. `select` never materializes hashes. Create/update return the created/updated record with the hash omitted the same way (select) for consistency within this module. Divergence from auth is intentional and scoped to list semantics.

### Decision: Username immutable via DTO omission
**Choice**: `UpdateUserDto` has no `username` field. **Alternatives**: explicit runtime "cannot change username" rejection. **Rationale**: global `whitelist: true` strips any stray `username` before it reaches the service — omission is enforcement, not just documentation. A runtime check would be redundant code guarding an input that can never arrive.

### Decision: Controller-level guard, first protected controller
**Choice**: `@UseGuards(JwtAuthGuard)` on the class. **Alternatives**: per-method. **Rationale**: no existing precedent (auth's routes are public); all three routes need identical protection, so class-level avoids repetition. This establishes the convention for future protected controllers.

### Decision: Inline form over modal
**Choice**: single page with an inline form area. **Alternatives**: modal dialog. **Rationale**: no headless-ui/radix in package.json; a modal means hand-rolling focus/escape/overlay. Inline stays at the project's current complexity level and sets a reusable data-table + form precedent.

## Data Flow

    /usuarios page ──listUsers()──▶ GET /users ──JwtAuthGuard──▶ UsersService.findAll ──▶ Prisma (select, no hash)
        │  submit (create/update)
        └──createUser/updateUser()──▶ POST/PATCH /users ──▶ UsersService ──▶ bcrypt + Prisma ──▶ refreshed list

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server/src/users/users.controller.ts` | Create | Guarded controller, 3 routes |
| `server/src/users/users.service.ts` | Create | findAll/create/update + bcrypt |
| `server/src/users/users.module.ts` | Create | Module wiring |
| `server/src/users/dto/create-user.dto.ts` | Create | CreateUserDto |
| `server/src/users/dto/update-user.dto.ts` | Create | UpdateUserDto (no username) |
| `server/src/app.module.ts` | Modify | Import + register `UsersModule` |
| `client/app/lib/users.ts` | Create | Typed fetch wrappers |
| `client/app/(dashboard)/usuarios/page.tsx` | Modify | Placeholder → real CRUD page |
| `openspec/specs/user-identity/spec.md` | Modify | Fix `rol` default drift (`admin` → `empleado`) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Manual/e2e | 401 without token; 409 duplicate username; PATCH updates fields, password only when provided, username never changes; list renders | Exercise endpoints + page against reachable DB (confirm `DATABASE_URL` first — `.env` was unreadable in prior phases) |

## Migration / Rollout

No migration required — all `User` columns already exist. `rol` stays a plain `String` with app-level `@IsIn` validation (no Prisma enum).

## Open Questions

- [ ] Confirm the correct MySQL container is reachable before apply-phase testing (`.env` unreadable in prior phases).
