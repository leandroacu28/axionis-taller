# Tasks: Clientes CRUD (Create, List, Update)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1250 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (data model + backend module) → PR 2 (frontend API client + list page) → PR 3 (frontend create/edit pages + navigation) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

This is a **new module + new pages**, so almost all of it is net-new code, not a diff against existing files:
- Prisma schema delta (`Cliente` model + 2 back-relations): ~15-20 lines
- Generated migration SQL: ~20-30 lines
- Backend module (constants, validator, 2 DTOs, service, controller, module, `app.module.ts` edit): ~300-350 lines
- `client/app/lib/customers.ts`: ~90-120 lines
- Three frontend pages (list ~200-280 incl. portal menu/pagination/toggle; nuevo ~150-200; editar ~220-280 incl. dirty-tracking + two navigation guards): ~570-760 lines combined
- `navigation.tsx` edit: ~6 lines
- Optional `clientes.svg`: negligible

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + migration (`Cliente` model, `User` back-relations, `add_cliente` migration) | PR 1 | ~40-50 lines; foundational, must land before backend module compiles against the Prisma Client |
| 2 | Backend `customers` module (constants, validator, DTOs, service, controller, module) + `app.module.ts` registration | PR 1 | ~300-350 lines; independently verifiable via curl/Postman once migrated; combined with Unit 1 keeps PR 1 around ~340-400 lines |
| 3 | `client/app/lib/customers.ts` + `clientes/page.tsx` (list) | PR 2 | ~290-400 lines; depends on PR 1's endpoints being live |
| 4 | `clientes/nuevo/page.tsx` + `clientes/editar/[id]/page.tsx` (incl. unsaved-edit-warning) + `navigation.tsx` entry | PR 3 | ~380-490 lines; the editar page's dirty-tracking + dual navigation guards are the bulk of the size here |

## Phase 1: Data Model & Migration

- [x] 1.1 Modify `server/prisma/schema.prisma`: add the `Cliente` model (`id`, `razonSocial`, `tipoIdentificacion`, `identificacion` `@unique`, `telefono`, `domicilio`, `activo` `@default(true)`, `createdAt`, `updatedAt`, `creadoPorId`/`creadoPor` and `actualizadoPorId`/`actualizadoPor` nullable FKs with `onDelete: SetNull`, relation names `"ClienteCreadoPor"`/`"ClienteActualizadoPor"`)
- [x] 1.2 Modify `server/prisma/schema.prisma`: add `clientesCreados Cliente[] @relation("ClienteCreadoPor")` and `clientesActualizados Cliente[] @relation("ClienteActualizadoPor")` back-relations on `User`
- [x] 1.3 **Apply-phase precondition**: confirm `DATABASE_URL` in `server/.env` points at a reachable MySQL instance before migrating — this is the first migration since `usuarios-crud` and the target was unverified in prior phases
- [x] 1.4 Run `npx prisma migrate dev --name add_cliente` in `server/` to generate the additive migration and regenerate the Prisma Client (`Cliente` delegate + new `User` back-relations)

## Phase 2: Backend Module — Constants & Validation

- [x] 2.1 Create `server/src/customers/customer.constants.ts`: `ID_TYPES`, `IdType`, `ID_TYPE_PATTERNS` (dni `^\d{7,8}$`, cuit/cuil `^\d{11}$`), `ID_TYPE_LABELS`
- [x] 2.2 Create `server/src/customers/dto/identificacion.validator.ts`: custom `@IsIdentificacionValida()` `ValidatorConstraint` that reads sibling `tipoIdentificacion` off `args.object` and applies `ID_TYPE_PATTERNS`
- [x] 2.3 Create `server/src/customers/dto/create-customer.dto.ts`: `CreateCustomerDto` with `@Transform` non-digit stripping on `identificacion`, required `razonSocial`/`tipoIdentificacion`/`identificacion`/`telefono`/`domicilio`, optional `activo`
- [x] 2.4 Create `server/src/customers/dto/update-customer.dto.ts`: `UpdateCustomerDto` — same full required field set as create (no partial updates), mirroring `UpdateUserDto`'s convention

## Phase 3: Backend Module — Service, Controller, Module

- [x] 3.1 Create `server/src/customers/customers.service.ts`: `CUSTOMER_SELECT` whitelist (incl. nested `creadoPor`/`actualizadoPor` `{ id, username }`), reuse `uniqueTargetIncludes(error, field)` pattern from `users.service.ts`, `findAll()`, `findOne(id)` (`NotFoundException` on miss)
- [x] 3.2 Add `create(dto, creadoPorId)`: TOCTOU pre-check via `findUnique({ identificacion })` → `ConflictException`, then `prisma.cliente.create` with `creadoPorId`/`actualizadoPorId` both set to caller, `try/catch` `P2002` backstop
- [x] 3.3 Add `update(id, dto, actualizadoPorId)`: `findUnique` existence check → `NotFoundException`, `findFirst({ identificacion, NOT: { id } })` duplicate check → `ConflictException`, `prisma.cliente.update` setting only `actualizadoPorId` (never `creadoPorId`), same backstop
- [x] 3.4 Create `server/src/customers/customers.controller.ts`: `@Controller('customers')`, class-level `@UseGuards(JwtAuthGuard)`, `GET()`/`GET(':id')` (`ParseIntPipe`)/`POST()`/`PATCH(':id')`, wiring `req.user.userId` into create/update — no `DELETE` route
- [x] 3.5 Create `server/src/customers/customers.module.ts`: `controllers: [CustomersController]`, `providers: [CustomersService]`
- [x] 3.6 Modify `server/src/app.module.ts`: import and register `CustomersModule`

## Phase 4: Backend Manual Verification

- [x] 4.1 Verify `GET/POST/PATCH /customers` (and `GET /customers/:id`) all return 401 without a Bearer token
- [x] 4.2 Verify `POST /customers` with a duplicate `identificacion` returns 409, no row created (TOCTOU + `P2002` backstop)
- [x] 4.3 Verify `PATCH /customers/:id` with another cliente's `identificacion` returns 409 and does not modify the row; `PATCH` with the row's own unchanged `identificacion` returns 200
- [x] 4.4 Verify DNI validates at 7-8 digits, CUIT/CUIL at 11 digits, dashes normalized and stored digits-only (e.g. `20-12345678-9` → `20123456789`)
- [x] 4.5 Verify `creadoPorId` is immutable after creation (create as user X, `PATCH` as user Y → `creadoPor` still X) and `actualizadoPorId` updates on every `PATCH`
- [x] 4.6 Verify `PATCH /customers/:id` with a missing required field returns 400 without modifying the row; verify no `DELETE` route exists; verify any `rol` succeeds identically (no role check)

## Phase 5: Frontend API Client

- [ ] 5.1 Create `client/app/lib/customers.ts`: `ID_TYPES`/`IdType`/`ID_TYPE_LABELS`/`toIdType()` (duplicated from server constants per the no-shared-package convention), `CustomerListItem`, `CreateCustomerPayload`, `UpdateCustomerPayload`
- [ ] 5.2 Add `listCustomers()` (GET), `getCustomer(id)` (GET `/customers/:id`), `createCustomer(data)` (POST), `updateCustomer(id, data)` (PATCH `/customers/:id`) — shared `handleJsonResponse<T>()`, `getAuthHeader()` on every call, Spanish fallback error messages

## Phase 6: Frontend List Page

- [ ] 6.1 Create `client/app/(dashboard)/clientes/page.tsx` (`'use client'`) base structure: state (`customers`, `loading`, `listError`, `openMenuId`, `menuPos`, `togglingId`, `search`, `statusFilter` default `'activo'`, `page`, `pageSize`), `useEffect` load via `listCustomers()`
- [ ] 6.2 Implement in-memory search filter over `[razonSocial, identificacion, telefono]`, status filter (defaults to `activo: true` only), and pagination (`PAGE_SIZE_OPTIONS = [10, 25, 50]`)
- [ ] 6.3 Implement table columns (Razón Social · Tipo badge via `ID_TYPE_LABELS` · Identificación · Teléfono · Estado · Acciones) with `createPortal`-based row action dropdown (`openUpward` flip, click-outside/scroll/resize close)
- [ ] 6.4 Implement status toggle action: `showConfirm` on deactivate, `updateCustomer(id, { ...fullPayload, activo: !c.activo })` then reload, `showSuccess`/`showError` — no master/self-lockout guard (unconditional toggle)
- [ ] 6.5 Implement loading/error/empty/no-results states and "Nuevo cliente" header button linking to `/clientes/nuevo`

## Phase 7: Frontend Create Page

- [ ] 7.1 Create `client/app/(dashboard)/clientes/nuevo/page.tsx`: `FormState` + generic `updateField`, `tipoIdentificacion` `<select>` over `ID_TYPES`/`ID_TYPE_LABELS`, `EMPTY_FORM` defaults `tipoIdentificacion: 'dni'`
- [ ] 7.2 Wire required-field validation (`razonSocial`, `tipoIdentificacion`, `identificacion`, `telefono`, `domicilio`) before submit, `createCustomer(payload)` call, `showSuccess` + `router.push('/clientes')` on success, `showError` on 409/failure with entered data intact

## Phase 8: Frontend Edit Page

- [ ] 8.1 Create `client/app/(dashboard)/clientes/editar/[id]/page.tsx`: `useEffect` load via `getCustomer(id)` with a `cancelled` unmount guard, loading/error states, pre-fill `FormState`
- [ ] 8.2 Wire required-field validation, `updateCustomer(id, payload)` on submit, `showSuccess` + `router.push('/clientes')` on success, `showError` on failure
- [ ] 8.3 Implement dirty-state tracking: `initialFormRef` (`useRef<FormState | null>`) set on successful load and reset on successful save (before the post-save redirect); `isFormDirty(form, initialFormRef.current)` shallow-comparison helper
- [ ] 8.4 Implement in-app navigation guard: convert the "Cancelar" `Link` to a `button` with an async `onClick`; when dirty, `await showConfirm({...})` (same shape as usuarios' deactivate confirm, `confirmButtonColor: '#e11d48'`) before `router.push('/clientes')`, early-return on cancel
- [ ] 8.5 Implement native `beforeunload` guard: `useEffect` listener that calls `e.preventDefault()`/sets `e.returnValue` only when `isDirty`, cleaned up on unmount/dependency change

## Phase 9: Navigation

- [ ] 9.1 Modify `client/app/lib/navigation.tsx`: add a new **top-level** "Clientes" entry (`href: '/clientes'`, sibling of "Inicio" — NOT nested under "Configuraciones"'s `children`)
- [ ] 9.2 (Optional) Create `client/public/icons/clientes.svg` nav icon; if omitted, reuse an existing icon to avoid a broken image

## Phase 10: Frontend Manual Verification

- [ ] 10.1 Verify `/clientes` loads and shows only `activo: true` clientes by default; search filters by razón social/identificación/teléfono in-memory; status filter reveals inactive clientes; pagination limits visible rows
- [ ] 10.2 Verify the status toggle calls `PATCH /customers/:id` with the flipped `activo` and the row updates without a full reload
- [ ] 10.3 Verify `/clientes/nuevo` blocks submission on a missing required field, creates successfully with a valid payload (toast + redirect), and shows an error toast with data intact on a 409 duplicate `identificacion`
- [ ] 10.4 Verify `/clientes/editar/[id]` pre-fills from `GET /customers/:id`, saves via `PATCH` with toast + redirect, and does not set state if unmounted before the load resolves
- [ ] 10.5 Verify the unsaved-edit warning end-to-end: edit a field then click Cancelar → `showConfirm` appears; confirm discards and routes to `/clientes`, cancel stays with edits intact; editing a field back to its original value suppresses the prompt (not dirty); after a successful save, the redirect fires with no prompt; with unsaved edits, refresh/close the tab triggers the native `beforeunload` prompt
- [ ] 10.6 Verify the "Clientes" nav entry is visible for any authenticated `rol`, renders as a top-level item (not nested under "Configuraciones"), and links to `/clientes`

## Phase 11: Documentation & Final Sign-off

- [ ] 11.1 Walk `proposal.md`'s full Success Criteria checklist end-to-end and confirm each item (401 without token, 409 duplicate `identificacion` create+update, audit stamping correctness, DNI/CUIT/CUIL format validation, frontend list/create/edit behavior, nav entry visibility, migration additive-only)
- [ ] 11.2 Confirm the Rollback Plan steps in `proposal.md` are accurate and executable as written (migration revert, module removal, back-relation removal, frontend route/nav removal)
