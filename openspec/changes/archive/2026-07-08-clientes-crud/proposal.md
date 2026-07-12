# Proposal: Clientes CRUD (Create, List, Update)

## Intent
The shop can currently only manage staff users (`usuarios`) — there is no way to record the *customers* the workshop actually serves. This change delivers the first customer-facing entity: any authenticated user can list, create, and edit clientes (razón social, tipo de identificación, identificación, teléfono, domicilio, activo). It also introduces the first cross-model audit trail in this codebase — every cliente row records which staff user created it and which staff user last updated it, each with a timestamp — because customer records are shared operational data where "who touched this" matters, unlike the single-owner `usuarios` self-relation. Who is *allowed* to access this section is intentionally left ungated here, mirroring `usuarios` — that is deferred to the future "Permisos" feature.

## Scope

### In Scope
- **Backend**: new `server/src/customers/` module (controller, service, module, `create-customer.dto.ts`, `update-customer.dto.ts`), registered in `app.module.ts`. Follows the `users/` module shape exactly: thin controller, service owns all Prisma calls, `class-validator` DTOs (whitelist-safe, every field explicit), Nest built-in exceptions (`ConflictException` for duplicate `identificacion`, `NotFoundException` for update-on-missing-id), Spanish user-facing error messages, and a `CUSTOMER_SELECT` whitelist constant for the response shape (including nested `creadoPor`/`actualizadoPor` `{ id, username }`).
- **Data model**: new `Cliente` Prisma model + one timestamped migration (additive only). Fields: `id`, `razonSocial`, `tipoIdentificacion` (plain `String`, app-validated — no Prisma enum, matching the `User.rol` precedent), `identificacion` (single-column `@unique`), `telefono`, `domicilio`, `activo` (`Boolean @default(true)`), `createdAt`, `updatedAt`, plus two new nullable FK relations to `User`: `creadoPorId`/`creadoPor` and `actualizadoPorId`/`actualizadoPor` (both `onDelete: SetNull`). This adds the corresponding back-relation arrays on `User`.
- **Endpoints**: `GET /customers` (list), `GET /customers/:id` (single, for the edit page), `POST /customers` (create), `PATCH /customers/:id` (update). No `DELETE`. All require a valid Bearer token (`JwtAuthGuard`, already exists) — no role/permission check in this change.
- **Caller identity**: `POST /customers` sets `creadoPorId` (and `actualizadoPorId`) from `req.user.userId`; `PATCH /customers/:id` sets `actualizadoPorId` from `req.user.userId`. The caller id is resolved server-side from the JWT (`jwt.strategy.ts`), never client-suppliable — same mechanism `users.controller.ts` uses today.
- **Conditional ID validation**: light, `tipo`-keyed validation in the DTO — DNI: 7–8 digits; CUIT/CUIL: 11 digits, accepted with or without dashes and normalized (non-digits stripped) before length-check and storage.
- **Frontend**: new `client/app/(dashboard)/clientes/` route group — `page.tsx` (list), `nuevo/page.tsx` (create), `editar/[id]/page.tsx` (edit) — plus a new `client/app/lib/customers.ts` typed API client mirroring `lib/users.ts` (list-item interface, `Create*Payload`/`Update*Payload`, shared `handleJsonResponse<T>()`, `getAuthHeader()` on every call). Reuses `lib/alerts.ts` toasts/confirm as-is and the exact usuarios list-page UX (in-memory search/filter/status-toggle/pagination). A new "Clientes" nav entry is added to `lib/navigation.tsx`.

### Explicitly Deferred (not this change)
- **Access control / permissions**: visibility and usage of sections (including Clientes) will be governed by the future **"Permisos"** feature, not defined yet. This change adds no role-based guard and does not restrict the nav item — same posture as `usuarios`.

### Out of Scope
- **Delete/deactivate endpoint** — the user requested only create/list/edit; matches the `usuarios` no-delete precedent. (`activo` can be toggled via `PATCH`, but there is no row deletion.)
- **Business-logic gating on `activo`** — `activo` is a status field/badge only. No self/master-lockout guard (that was login-account-specific; clientes do not authenticate) and no cascading logic, since no other entity references `Cliente` yet.
- **Official AR ID checksum/check-digit validation** — only length/format sanity checks. Implementing the real CUIT/CUIL verifier digit is not requested and would be over-engineering.
- **Backend-side pagination / search / filtering** — the list endpoint returns the full set; all filtering is client-side in-memory, matching `GET /users`. Can be added later without breaking the contract.
- **Audit history beyond last-writer** — only the *current* creator and *last* updater are stored, not a full change log.

## Capabilities
### New Capabilities
- `customers-management`: backend CRUD (minus delete) for clientes with create/update audit stamping (creator + last updater + timestamps), available to any authenticated user in this change (permission-gating deferred to Permisos).

### Modified Capabilities
- `app-navigation`: adds a "Clientes" entry. No role filtering — consistent with the existing "No Role Filtering in V1" requirement, which stays valid as-is.

## Approach
Backend mirrors the `users/` module structurally, so a future reader finds parallel modules rather than divergent conventions. The one genuinely new element is the `Cliente → User` audit relation: unlike `User`'s self-relation, this is a cross-model many-to-one FK declared *twice* (creator + updater). Both are nullable with `onDelete: SetNull` so removing a staff user never deletes or blocks a customer row — the reference just goes null.

Frontend reuses the usuarios list/create/edit pattern verbatim (single `FormState` + generic `updateField` setter, required-field validation before submit, `useEffect` load with a `cancelled` unmount guard on the edit page, toasts via `alerts.ts`). This is deliberate: usuarios already set this app's CRUD-page precedent, so clientes should look identical, not introduce a second style.

## Decisions (Automatic mode — documented for later review/override)
- **D1 — `identificacion` uniqueness**: globally unique on the `identificacion` column alone (not composite with `tipo`). *Rationale*: mirrors `User.dni`'s single-column `@unique`; avoids two clientes sharing the same ID string across types.
- **D2 — Format validation depth**: light `tipo`-keyed validation only (DNI 7–8 digits; CUIT/CUIL 11 digits, dashes stripped/normalized). *Rationale*: official checksum verification wasn't requested and would be over-engineering; length/format is enough to catch typos.
- **D3 — List UX**: reuse the usuarios in-memory search/filter/status-toggle/pagination over the full `GET /customers` response. *Rationale*: no backend query-param pattern exists yet; matches `GET /users` precedent and keeps one UX convention.
- **D4 — Searchable fields**: razón social, identificación, teléfono (skip domicilio). *Rationale*: parallels usuarios choosing key identifying fields over every field.
- **D5 — Relation shape**: two `Cliente → User` many-to-one FKs (`creadoPorId`/`creadoPor`, `actualizadoPorId`/`actualizadoPor`), both nullable, `onDelete: SetNull`. *Rationale*: mirrors `User.creadoPor` FK behavior — removing a staff user leaves the cliente row intact with a null reference.
- **D6 — `activo` semantics**: status field/badge only, no business consequences in this change. *Rationale*: the self/master-lockout guard was login-specific; clientes don't authenticate and nothing else references them yet.
- **D7 — Delete**: out of scope. *Rationale*: user asked only for create/list/edit; matches the usuarios no-delete precedent.
- **D8 — Naming**: English module/route/file scaffolding (`server/src/customers/`, `/customers` route, `client/app/lib/customers.ts`) with the Prisma model kept as `Cliente` and Spanish DTO field names, error messages, UI copy, and the `/clientes` frontend route. *Rationale*: mirrors `users`' English scaffolding + Spanish domain convention; `Cliente` is the real business noun. This decision drives every file name in the change.
- **D9 — Future FK relationships**: forward-looking note only. A future `Vehiculo.clienteId` (or similar) will reference `Cliente`, making it the first "customer" entity distinct from `User` (staff). No action now.

## Rollback Plan
This change is **additive-only** — a new Prisma model, a new backend module, new frontend routes, one new nav entry, and one new API client file. No existing table, endpoint, page, or behavior is modified (the only touch to existing files is adding back-relation arrays on `User`, a new module import in `app.module.ts`, and one nav entry). Rollback is therefore mechanical:
1. Revert the timestamped migration (drop the `Cliente` table and its two FKs) — safe because nothing else references it.
2. Remove `server/src/customers/` and its `app.module.ts` import; remove the `creados`/`actualizados` back-relations from `User`.
3. Remove `client/app/(dashboard)/clientes/`, `client/app/lib/customers.ts`, and the "Clientes" nav entry.
No data migration or backfill is involved, so no data is lost on rollback beyond the clientes rows themselves.

## Known Gaps / Accepted Tradeoffs
- **No access control on this feature yet**: any authenticated user (any `rol`) can list/create/update clientes. Deliberate, user-directed deferral to the future Permisos feature — same posture as usuarios, flagged so it's visible, not silent.
- **`server/.env` DB target not verified in this environment**: `sdd-apply` MUST confirm which MySQL instance `DATABASE_URL` points at before running the new migration, since this change *does* add a migration (unlike usuarios-crud).
- **No shared type package**: `tipoIdentificacion` allowed values and payload types are duplicated between `server/` DTO/constants and `client/app/lib/customers.ts` — the codebase has no shared package, so this follows the existing "change one, change the other" convention from `users`.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Any authenticated user (not just intended staff) can manage all clientes | High (by design, deferred) | Explicitly called out as a known, accepted gap until the Permisos feature lands |
| New `Cliente → User` audit FK is a novel shape (cross-model, declared twice) — easy to mis-wire the two relations or back-relation names | Med | `sdd-design` specs the exact relation names/back-relations; `onDelete: SetNull` matches the existing `User.creadoPor` precedent |
| Light ID validation lets a malformed-but-right-length ID through | Med | Accepted tradeoff (D2) — length/normalization catches typos; real checksum verification is explicitly out of scope and can be added later without a contract change |
| First backend migration since usuarios runs against the wrong DB | Low | `sdd-apply` confirms `DATABASE_URL` before migrating (see Known Gaps) |

## Success Criteria
- [ ] `GET /customers`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id` all require a valid Bearer token (401 otherwise) — no role check in this change.
- [ ] Creating a cliente with a duplicate `identificacion` returns 409 (with the TOCTOU-safe pre-check + `P2002` backstop, matching users).
- [ ] `POST /customers` stamps `creadoPorId` and `actualizadoPorId` from the JWT caller; `PATCH /customers/:id` updates `actualizadoPorId` from the JWT caller — never from client input.
- [ ] DNI values validate at 7–8 digits; CUIT/CUIL validate at 11 digits with dashes normalized before storage.
- [ ] Frontend `/clientes` page lists all clientes with in-memory search (razón social / identificación / teléfono), status filter, pagination, and status toggle; `/clientes/nuevo` and `/clientes/editar/[id]` create and edit.
- [ ] A "Clientes" nav entry is visible to any authenticated user.
- [ ] The migration is additive-only and reversible per the Rollback Plan.
