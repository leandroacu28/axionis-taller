# Exploration: Usuarios CRUD (create, list, update — no delete)

## Current State
- No `server/src/users/` module exists at all — only `server/src/auth/` (auth.controller.ts, auth.service.ts, auth.module.ts, dto/login.dto.ts, guards/jwt-auth.guard.ts, strategies/jwt.strategy.ts) and `server/src/prisma/`.
- Prisma `User` already has all needed fields: `username` (unique), `passwordHash`, `nombre?`, `apellido?`, `rol` (default `"empleado"`), `createdAt`, `updatedAt`. No schema/migration change needed for this feature.
- `client/app/(dashboard)/usuarios/page.tsx` is a static placeholder — no fetch, no state, no 'use client'. This will be the first frontend page that fetches from a protected backend endpoint.

## Backend Conventions (from `auth/`)
- Thin controller; service owns all Prisma calls and business logic.
- Sensitive fields stripped by destructuring (`const { passwordHash: _x, ...result } = user`).
- Password hashing: `bcryptjs`, `bcrypt.hash(password, 10)`, `bcrypt.compare()` for verification.
- DTOs: `class-validator`, minimal decorators (`@IsString() @IsNotEmpty()`). Global `ValidationPipe({ whitelist: true, transform: true })` in `main.ts` — every DTO field must be explicitly declared.
- `PrismaService` is `@Global()`, injected via constructor, no repository layer.
- Module registered in `AppModule.imports`.

## Confirmed Gap: JWT payload lacks `rol`
- `auth.service.ts`: `const payload = { sub: user.id, username: user.username };` — no `rol`.
- `jwt.strategy.ts`: `validate(payload: { sub: number; username: string })` → `req.user = { userId, username }`. No `rol` anywhere in the request pipeline today.
- No role/permission infrastructure exists anywhere (`grep -ri "Roles|RolesGuard|@Roles"` across `server/src` → zero matches beyond the `rol` field name itself).

## Role-Guard Design Options Considered
1. **Add `rol` to JWT payload at login** — cheap per-request, but creates a stale-privilege window (role changes don't take effect until re-login/token expiry).
2. **`RolesGuard` does a fresh Prisma lookup per request** (chosen) — role changes take effect immediately on the next request; no changes needed to the working login flow; small extra DB cost, negligible at this app's scale.
3. Hybrid caching — rejected as overkill for a single-taller staff app.

**Decision: Option 2.** Reasoning: immediate revocation matters more than a marginal DB read cost for an admin-managed staff tool; keeps the diff scoped to new code only.

## Mail Infrastructure
Confirmed: zero mail/SMTP/nodemailer references anywhere in `server/`. "Admin sets password directly on create" is grounded, not just assumed — there's no invite-email mechanism to build on or bypass.

## Frontend Conventions (from `lib/auth.ts` + `login/page.tsx`)
- Fetch pattern: `fetch()` → check `res.ok` → on failure `await res.json()`, throw `Error(message)` → on success `return res.json()`.
- Caller wraps in `try/catch/finally`, `loading`/`error` local state, `err instanceof Error ? err.message : fallback`.
- `getAuthHeader()` in `lib/auth.ts` returns `{ Authorization: 'Bearer <token>' }` — the established way to attach auth to any fetch.
- `UserData.rol` is explicitly documented as **display-only** (client-writable cookie) — never used for authorization client-side; the backend `RolesGuard` is the real boundary.
- `(dashboard)/layout.tsx` is already `'use client'` — no conflict with a client-rendered Usuarios page.

## Spec Conflicts Found
- `openspec/specs/app-navigation/spec.md` explicitly states: *"No Role Filtering in V1 — Navigation rendering MUST NOT filter items by user role... all three items render for any authenticated user."* Restricting Usuarios to admin-only requires an explicit spec amendment, not a silent override.
- `openspec/specs/user-identity/spec.md` says `rol` defaults to `"admin"` — actual migration/schema use `DEFAULT 'empleado'` (only the master user row is backfilled to admin). Pre-existing spec drift, unrelated to this feature but worth correcting while touching these specs.

## Unresolved / Unverifiable in This Environment
- `server/.env` is blocked by this session's file-permission settings — could not confirm `DATABASE_URL` (which MySQL container) or `JWT_EXPIRES_IN`. Not blocking: this feature needs no migration, and the chosen role-guard design (fresh lookup) is TTL-independent.

## Known Accepted Gap
- Stale frontend session on rol change: backend enforcement is immediate; frontend nav/route gating (cookie-hydrated at login) lags until next login. Accepted for v1.

## Ready for Proposal
Yes. See `proposal.md` in this same change folder.

## Addendum: access control deferred (user decision, same session)
User clarified that visibility/usage of sections (including Usuarios) will be governed by a future "Permisos" feature, not yet defined. This supersedes the role-guard analysis above — no `RolesGuard`, no JWT payload change, and no `app-navigation` spec amendment are part of this change. The role-guard design comparison above is preserved for reference when the Permisos feature is eventually scoped.
