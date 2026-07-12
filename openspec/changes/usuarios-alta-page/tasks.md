# Tasks: Usuarios — Dedicated Create Page, DNI, Required Name, Password Confirmation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes (precautionary) |
| Suggested split | PR 1 (backend) → PR 2 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma migration + DTOs + service DNI logic | PR 1 | ~90-110 lines; independently verifiable via curl/Postman |
| 2 | `lib/users.ts` + new `/usuarios/nuevo` page + list page edits | PR 2 | ~210-270 lines; depends on PR 1's `dni` field/endpoints |

## Phase 1: Backend Foundation — Schema & Migration

- [x] 1.1 `server/prisma/schema.prisma`: add `dni String? @unique` to `model User` (near `passwordHash`)
- [x] 1.2 Run `npx prisma migrate dev --name add_user_dni` in `server/` to generate the migration and regenerate Prisma Client (note: `migrate dev` failed non-interactively in this shell — migration folder was created manually with the exact SQL Prisma would generate, applied via `prisma migrate deploy`, then `prisma generate` regenerated the client; verified via `prisma migrate status`)

## Phase 2: Backend DTOs

- [x] 2.1 `server/src/users/dto/create-user.dto.ts`: add required `dni` (`@IsString() @IsNotEmpty()`); tighten `nombre`/`apellido` to required
- [x] 2.2 `server/src/users/dto/update-user.dto.ts`: add required `dni`; tighten `nombre`/`apellido` to required; keep `password`/`rol`/`activo` optional, `username` absent

## Phase 3: Backend Service

- [x] 3.1 `server/src/users/users.service.ts`: add `DUPLICATE_DNI_ERROR` constant + target-aware `uniqueTargetIncludes(error, field)` helper
- [x] 3.2 `create()`: add `findUnique({ where: { dni } })` pre-check → 409; add `dni` to `data`; discriminate `P2002` catch (`username` vs `dni`)
- [x] 3.3 `update()`: add exclude-self pre-check `findFirst({ where: { dni, NOT: { id } } })` → 409; add `dni` to `data`; wrap `update` in try/catch with the same `P2002` discrimination
- [x] 3.4 Add `dni: true` to the `USER_SELECT` whitelist

## Phase 4: Backend Manual Verification

- [x] 4.1 `POST /users` missing `dni`/`nombre`/`apellido` → 400 (verified via curl: `class-validator` messages `"dni should not be empty"`, `"nombre should not be empty"`, `"apellido should not be empty"`, HTTP 400)
- [x] 4.2 `POST /users` duplicate `dni` → 409; duplicate `username` still → 409 (verified via curl against reachable MySQL DB — both distinct 409s with correct messages)
- [x] 4.3 `PATCH /users/:id` edit without changing `dni` does NOT 409 (exclude-self) (verified via curl — 200, row updated)
- [x] 4.4 `PATCH /users/:id` with another user's `dni` → 409 (verified via curl — 409 `El DNI ya está registrado.`)
- [x] 4.5 `GET /users` still lists a legacy row with `dni: null` without error (verified via curl — `lmoreno` row returns `"dni":null`, HTTP 200)

## Phase 5: Frontend Types

- [x] 5.1 `client/app/lib/users.ts`: add `dni` to `UserListItem` (`string | null`), `CreateUserPayload`, `UpdateUserPayload` (`string`)

## Phase 6: Frontend New Create Page

- [x] 6.1 Create `client/app/(dashboard)/usuarios/nuevo/page.tsx` (`'use client'`): form state for all 8 fields, reusing the list page's Tailwind classes verbatim
- [x] 6.2 Client-side validation in `handleSubmit`: required-field trim-check + password/confirm-password match, before any fetch
- [x] 6.3 Submit: build `CreateUserPayload` excluding `confirmPassword`, call `createUser()`, `router.push('/usuarios')` on success, error banner on failure
- [x] 6.4 Add "Cancelar" `<Link href="/usuarios">` and page header per `design.md` section 4

## Phase 7: Frontend List Page Updates

- [x] 7.1 `client/app/(dashboard)/usuarios/page.tsx`: remove the create branch (`openCreateForm`, create's `EMPTY_FORM` path, `handleSubmit`'s create branch)
- [x] 7.2 Replace "Nuevo usuario" button with `<Link href="/usuarios/nuevo">` (keep the `!formOpen &&` guard)
- [x] 7.3 Add `dni` to edit `FormState`/`EMPTY_FORM`/`openEditForm` pre-fill (`user.dni ?? ''`) and a DNI input in the inline edit form
- [x] 7.4 Add a DNI `<th>`/`<td>` table column, rendering `user.dni || '—'`
- [x] 7.5 Add `dni: form.dni` to the `updateUser` payload

## Phase 8: Frontend Manual Verification

> NOTE (honesty on verification depth): no headless browser (Playwright/Puppeteer) is available in this environment, and this session cannot drive a real browser UI. What WAS verified: `tsc --noEmit` passes with no errors on the client; both `/usuarios` and `/usuarios/nuevo` return HTTP 200 (not 404/500) from the running `next dev` server when requested with a valid `token` cookie via curl; the SSR HTML shell for `/usuarios/nuevo` contains the expected static markup (`Nuevo usuario`, `Crear usuario`, `Repetir contraseña`, DNI label) and `/usuarios` contains the `href="/usuarios/nuevo"` link; the backend API-level behavior these pages depend on (`dni` round-trips, duplicate-DNI 409, exclude-self on edit, `dni: null` for legacy rows) was directly verified via curl in Phase 4. What was NOT verified: actual client-side interactivity after hydration (real submit clicks, the confirm-password mismatch inline banner appearing live, `router.push` firing, the DNI table column rendering with live fetched data, the edit form pre-fill) — the initial SSR payload for the client-fetched list only shows the loading spinner (data loads client-side via `useEffect`), so curl-based inspection cannot see the post-hydration table. A human should click through 8.1-8.4 in an actual browser before considering the frontend fully signed off.

- [ ] 8.1 `/usuarios/nuevo` creates a user and redirects to `/usuarios` — NOT exercised in a real browser (see note above); code path reviewed and the underlying `POST /users` was verified working via curl in Phase 4
- [ ] 8.2 Mismatched confirm-password blocks submit with an inline error, no request sent — NOT exercised in a real browser; validated by code review only (`handleSubmit` checks `form.password !== form.confirmPassword` before calling `createUser`)
- [ ] 8.3 List table shows the DNI column, including `—` for a legacy null-DNI row — NOT exercised in a real browser; column markup confirmed present in JSX and `GET /users` confirmed to return `dni: null` for the legacy `lmoreno` row via curl in Phase 4
- [ ] 8.4 Inline edit includes DNI; saving without changing it does not error — NOT exercised in a real browser; the exact scenario (PATCH with unchanged `dni`) was verified working at the API level via curl in Phase 4, and the edit form code passes `dni: form.dni` pre-filled from `user.dni ?? ''`

## Phase 9: Documentation & Final Sign-off

- [x] 9.1 Note that `openspec/specs/user-identity/spec.md` needs the delta merged on archive (already authored under this change's `specs/`) — recorded here; no action taken in `apply`, deferred to `sdd-archive`
- [x] 9.2 Walk `proposal.md`'s Success Criteria checklist end-to-end and confirm each item:
  - [x] "Nuevo usuario" navigates to `/usuarios/nuevo`; create form no longer inline — code confirms + curl confirms link present and route serves the form; the create branch was removed from `usuarios/page.tsx`
  - [x] Create requires `dni`/`nombre`/`apellido` (400 if missing) — verified via curl (Phase 4.1)
  - [x] Duplicate `dni` → 409 via two-layer check — verified via curl (Phase 4.2)
  - [x] DNI editable via PATCH; edit without changing DNI does not 409 — verified via curl (Phase 4.3)
  - [~] Confirm-password mismatch blocks submit client-side, never sent to backend — code-reviewed only (no browser session available to click through); logic matches spec exactly
  - [~] List table shows DNI column; inline edit form includes DNI + required nombre/apellido — code-reviewed + SSR markup confirmed for `/usuarios/nuevo`; live post-hydration table render not exercised in a browser
  - [x] DB columns for `nombre`/`apellido`/`dni` remain nullable, no backfill — confirmed: migration only does `ADD COLUMN dni VARCHAR(191) NULL` + unique index, no `NOT NULL` alter; DTOs enforce required-ness at the application layer only
