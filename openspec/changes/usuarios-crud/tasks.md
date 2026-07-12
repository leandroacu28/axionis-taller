# Tasks: Usuarios CRUD (Create, List, Update)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380-460 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend) → PR 2 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend `users` module + `app.module.ts` registration + spec drift fix | PR 1 | ~130-150 lines; independently mergeable, manually verifiable via curl/Postman |
| 2 | Frontend `lib/users.ts` + `usuarios/page.tsx` rewrite | PR 2 | ~250-300 lines (table+form+states+styling); depends on PR 1's endpoints |

## Phase 1: Backend Foundation (DTOs)

- [x] 1.1 Create `server/src/users/dto/create-user.dto.ts`: `CreateUserDto` (`username`, `password` required; `nombre`/`apellido` optional; `rol` via `@IsIn(['admin','empleado'])`)
- [x] 1.2 Create `server/src/users/dto/update-user.dto.ts`: `UpdateUserDto` — all optional, no `username` field

## Phase 2: Backend Core (Service, Controller, Module)

- [x] 2.1 Create `server/src/users/users.service.ts`: `findAll()` using Prisma `select` to exclude `passwordHash`
- [x] 2.2 Add `create(dto)`: duplicate `username` → `ConflictException`; else `bcrypt.hash(dto.password, 10)` + `prisma.user.create`
- [x] 2.3 Add `update(id, dto)`: missing id → `NotFoundException`; rehash password only if `dto.password` present
- [x] 2.4 Create `server/src/users/users.controller.ts`: `@Controller('users')`, `@UseGuards(JwtAuthGuard)` at class level, `GET/POST/PATCH(':id')` routes
- [x] 2.5 Create `server/src/users/users.module.ts` wiring controller + service
- [x] 2.6 Modify `server/src/app.module.ts`: import and register `UsersModule`

## Phase 3: Backend Manual Verification

- [x] 3.1 Confirm reachable `DATABASE_URL` / DB container before testing
- [x] 3.2 Verify `GET/POST/PATCH /users` return 401 without a Bearer token
- [x] 3.3 Verify `POST /users` with a duplicate `username` returns 409, no row created
- [x] 3.4 Verify `PATCH /users/:id`: omitted password leaves hash unchanged; provided password replaces hash; `username` in body is silently ignored
- [x] 3.5 Verify `PATCH /users/:id` with unknown id returns 404

## Phase 4: Frontend Infrastructure

- [x] 4.1 Create `client/app/lib/users.ts`: `UserListItem`/`CreateUserPayload`/`UpdateUserPayload` types
- [x] 4.2 Add `listUsers()` (GET), `createUser()` (POST), `updateUser(id, data)` (PATCH `/users/:id`) — mirror `login()`'s fetch/`res.ok`/throw shape, using `getAuthHeader()`

## Phase 5: Frontend Page

- [x] 5.1 Rewrite `client/app/(dashboard)/usuarios/page.tsx` (`'use client'`): state for `users`/`loading`/`error`/`editingUser`/`formOpen`/form fields; `useEffect` calls `listUsers()` on mount
- [x] 5.2 Render table (`username`, `nombre`, `apellido`, `rol`, Editar action) with loading/error/empty states
- [x] 5.3 Add inline form: "Nuevo usuario" (create, `editingUser=null`) and "Editar" (pre-filled, `username` disabled); `rol` `<select>` with exactly `admin`/`empleado`
- [x] 5.4 Wire submit: `editingUser ? updateUser(...) : createUser(...)`, refresh list, close form, error banner on failure
- [x] 5.5 Apply established styling: white table card, slate/stone borders, rose gradient primary buttons, red error banner (per `login/page.tsx`)

## Phase 6: Frontend Manual Verification

- [x] 6.1 Verify `/usuarios` lists users on load, create adds a row, edit updates a row without full reload, `username` uneditable, loading/error/empty states render without crashing, page reachable by any authenticated `rol`

## Phase 7: Documentation & Final Sign-off

- [x] 7.1 Fix `openspec/specs/user-identity/spec.md`: `rol` default `"admin"` → `"empleado"` (requirement text + scenario, lines ~6 and ~11)
- [x] 7.2 Walk proposal.md's full Success Criteria checklist end-to-end and confirm each item (all confirmed: 401 without token, 409 duplicate username, PATCH partial updates with username immutable, frontend lists/creates/edits, `user-identity` spec corrected)
