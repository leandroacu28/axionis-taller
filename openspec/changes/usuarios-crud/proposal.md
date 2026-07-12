# Proposal: Usuarios CRUD (Create, List, Update)

## Intent
The "Usuarios" nav section exists but is a static placeholder — there is no backend `users` module at all (only `auth`) and no real frontend page. This change delivers the first real management feature: any authenticated user can list, create, and update staff users (username, nombre, apellido, rol, and optionally reset a password on update). Explicitly no delete/deactivate. Who is *allowed* to access this section is intentionally left ungated here — that will be handled by a future "Permisos" feature.

## Scope

### In Scope
- **Backend**: new `server/src/users/` module (controller, service, module, `create-user.dto.ts`, `update-user.dto.ts`), registered in `app.module.ts`. Follows `auth/` conventions exactly: thin controller, service owns Prisma calls + bcrypt hashing (10 rounds, matching `auth.service.ts`), `class-validator` DTOs (whitelist-safe, every field explicit), Nest built-in exceptions (`ConflictException` for duplicate username, `NotFoundException` for update-on-missing-id).
- **Endpoints**: `GET /users` (list), `POST /users` (create), `PATCH /users/:id` (update). No `DELETE`. All three require only a valid Bearer token (`JwtAuthGuard`, already exists) — **no role/permission check in this change**.
- **Password handling**: `POST /users` requires a password field (admin sets it directly — no email/invite flow, confirmed no mail infrastructure exists in this repo). `PATCH /users/:id` accepts an *optional* password field — if provided, it's hashed and replaces the stored hash; if omitted, the password is untouched. Username is immutable after creation (it's the login identifier).
- **Role field**: fixed set `'admin' | 'empleado'` — a dropdown in the frontend form, validated with `@IsIn(['admin', 'empleado'])` in the backend DTO (not a free-text field, not a Prisma enum/migration — matches the existing plain-`String` column with app-level validation, no schema change needed). This is still a plain **data field** on the user profile — it does not drive any access-control logic in this change.
- **Frontend**: `client/app/(dashboard)/usuarios/page.tsx` rewritten from placeholder to a real client-rendered CRUD page — establishes this app's first data-table + create/edit-form pattern, following `login/page.tsx`'s existing fetch/error-handling convention (not inventing a new one). New `client/app/lib/users.ts` (mirrors `lib/auth.ts`'s `login()` shape: `fetch` → check `res.ok` → throw `Error(message)` on failure → `return res.json()`), using `getAuthHeader()` for the `Authorization: Bearer` header on every call.

### Explicitly Deferred (not this change)
- **Access control / permissions**: per user direction, visibility and usage of sections (including Usuarios) will be governed by a future **"Permisos"** feature, not defined yet. This change does **not** add any role-based guard, does **not** restrict the nav item, and does **not** amend the `app-navigation` "No Role Filtering in V1" spec — that spec stays valid as-is. When the Permisos system is designed, it will retrofit gating onto Usuarios (and other sections) as its own change; building an ad-hoc admin-only check now would just be thrown away or need reconciling with that future design.

### Out of Scope
- Delete/deactivate users.
- Self-service "change my own password" flow.
- Email/invite-based user creation (no mail infrastructure exists).
- Any role/permission enforcement (see "Explicitly Deferred" above).
- Audit trail / history of who changed what.
- Pagination on the list endpoint (small staff roster expected; can be added later without breaking the contract).

## Capabilities
### New Capabilities
- `users-management`: backend CRUD (minus delete) for staff users, available to any authenticated user in this change (permission-gating deferred to the future Permisos feature).

### Modified Capabilities
- None. `app-navigation`'s existing "No Role Filtering in V1" requirement is left intact — no spec amendment needed since this change adds no filtering.

## Approach
Backend: standard NestJS module mirroring `auth/`'s exact shape, so a future reader finds two structurally-identical modules rather than two different conventions. Only `JwtAuthGuard` is applied (`@UseGuards(JwtAuthGuard)`) — no new guard infrastructure in this change.

Frontend: the page fetches the list on mount (`useEffect`), shows a simple table, a "Nuevo usuario" button opens a create form (modal or inline — implementation detail for `sdd-design`), and each row has an "Editar" action opening the same form pre-filled (username read-only in edit mode). Loading/error/empty states follow the same pattern already used in `login/page.tsx` (local `useState`, no new state-management library).

## Known Gaps / Accepted Tradeoffs
- **No access control on this feature yet**: any authenticated user (any `rol`) can list/create/update users through this endpoint and page. This is a deliberate, user-directed deferral to a future Permisos feature, not an oversight — flagged here so it's an explicit, visible tradeoff rather than a silent gap discovered later.
- **`server/.env` could not be read in this environment** (permission-denied at the tool level) to confirm which MySQL container `DATABASE_URL` targets. Lower-risk than in prior changes since no schema migration is needed here (all `User` fields already exist) — `sdd-apply` should still confirm the correct DB is reachable before testing.

## Spec Changes Required
- `openspec/specs/user-identity/spec.md`: correct a pre-existing drift — the spec says `rol` defaults to `"admin"`, but the actual migration/schema use `DEFAULT 'empleado'` (only the master user row was explicitly backfilled to `admin`). Fix the spec to match reality while here. (`app-navigation` needs no change — its "No Role Filtering in V1" requirement stays accurate.)

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Any authenticated user (not just intended admins) can manage all users | High (by design, deferred) | Explicitly called out to the user as a known, accepted gap until the Permisos feature lands — not silently shipped |
| Admin resets another user's password without confirmation | Low | Optional password field is a deliberate action (typed input, not a hidden default) — acceptable for a small internal tool; no accidental resets since the field is empty/no-op by default |
| First data-table pattern in the frontend sets a bad precedent if rushed | Med | `sdd-design` explicitly specs the table/form/loading/error contract so it's consistent, reusable for future CRUD pages |

## Success Criteria
- [ ] `GET /users`, `POST /users`, `PATCH /users/:id` all require a valid Bearer token (401 otherwise) — no role check in this change.
- [ ] Creating a user with a duplicate `username` returns 409, matching the master-user-init precedent.
- [ ] `PATCH /users/:id` updates nombre/apellido/rol; password only changes if explicitly provided; username never changes.
- [ ] Frontend `/usuarios` page lists all users, supports create and edit, visible to any authenticated user (matches current `app-navigation` spec).
- [ ] `user-identity` spec is corrected to match the actual `rol` default.
