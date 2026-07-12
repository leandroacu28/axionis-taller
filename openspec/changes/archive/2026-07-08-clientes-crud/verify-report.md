# Verification Report: clientes-crud

Change: clientes-crud
Mode: Full artifacts (proposal, specs x3, design, tasks) verified against the actual committed code on master, not against design.md alone.
Commits verified: d95c265 (backend module), 9c60a15 (frontend API client and list page), ccb3ced (create/edit pages and nav entry)
Verdict: PASS WITH WARNINGS

## Completeness Table

| Phase | Tasks | Status |
|---|---|---|
| 1. Data Model and Migration | 1.1-1.4 | Complete, verified against schema.prisma and migration SQL |
| 2. Backend DTOs and Validation | 2.1-2.4 | Complete, verified against actual DTO and validator files |
| 3. Backend Service, Controller, Module | 3.1-3.6 | Complete, verified against actual files plus live curl |
| 4. Backend Manual Verification | 4.1-4.6 | Complete, re-verified live in this session (see Runtime Evidence) |
| 5. Frontend API Client | 5.1-5.2 | Complete, verified against customers.ts |
| 6. Frontend List Page | 6.1-6.5 | Complete, verified against page.tsx |
| 7. Frontend Create Page | 7.1-7.2 | Complete, verified against nuevo/page.tsx |
| 8. Frontend Edit Page | 8.1-8.5 | Complete, verified against editar/[id]/page.tsx, including dirty-tracking logic traced by hand |
| 9. Navigation | 9.1-9.2 | Complete, verified against navigation.tsx |
| 10. Frontend Manual Verification | 10.1-10.6 | Unchecked, known and disclosed gap. No live-browser click-through was possible in the apply agent sandboxed session. This verify pass substitutes a clean next build plus tsc --noEmit, plus a line-by-line trace of the dirty-state and beforeunload logic (see Design Coherence below). Not re-flagged as a new defect per the disclosed-gap instruction. |
| 11. Documentation and Sign-off | 11.1 unchecked, 11.2 checked | 11.1 mirrors the Phase 10 gap for the frontend portion only. The backend portion was already confirmed in Phase 4 and re-confirmed live below. |

## Build and Compile Evidence (executed this session)

| Command | Result |
|---|---|
| cd server; npx nest build | Exit 0, clean |
| cd client; npx tsc --noEmit | Exit 0, clean |
| cd client; npx next build | Exit 0, clean. All three new routes generated: /clientes (5.41 kB), /clientes/editar/[id] (3.89 kB, dynamic), /clientes/nuevo (3.31 kB). Only pre-existing img LCP lint warnings on navigation.tsx, unrelated to this change. |

No automated test suite exists anywhere in this repo (no spec.ts files, no test script in either package.json). This is a pre-existing project convention, not a gap introduced by this change. Manual and live verification substitutes for automated tests, consistent with how usuarios-crud was verified previously.

## Runtime Evidence, Backend (executed live this session)

A Nest server was already running on port 3001, left over from Phase 4 of the apply session, with the current committed customers module loaded and routes mapped (GET/POST /customers, GET/PATCH /customers/:id, confirmed no DELETE). Logged in as the seeded master user and exercised the live API directly:

| Scenario (spec) | Live result |
|---|---|
| GET /customers without token returns 401 | Confirmed 401, message Unauthorized |
| POST /customers without token returns 401 | Confirmed 401 |
| PATCH /customers/:id without token returns 401 | Confirmed 401 |
| POST /customers with unique DNI (8 digits) returns 201, activo defaults true | Confirmed 201, activo true |
| POST /customers with DNI 6 digits is rejected | Confirmed 400, El DNI debe tener 7 u 8 digitos |
| POST /customers with CUIT 20-99887766-5 normalized, stored digits-only | Confirmed 201, stored identificacion 20998877665 |
| POST /customers with duplicate identificacion returns 409, no row created | Confirmed 409, La identificacion ya esta registrada |
| POST /customers with client-supplied creadoPorId/actualizadoPorId spoofed to 999 is ignored | Confirmed 201, stored creadoPor id 1 (actual caller), not 999. Confirms the global whitelist true strips undeclared DTO fields |
| PATCH /customers/:id missing telefono returns 400, row not modified | Confirmed 400; re-fetched row shows updatedAt unchanged |
| PATCH /customers/:id to another cliente identificacion returns 409, row not modified | Confirmed 409 |
| PATCH /customers/:id full valid body, own unchanged identificacion returns 200 | Confirmed 200, updatedAt bumped |
| GET /customers/:id unknown id returns 404 | Confirmed 404, Cliente no encontrado |
| DELETE /customers/:id has no such route | Confirmed 404, Cannot DELETE /customers/7 |
| creadoPorId immutable across users, actualizadoPorId updates per caller | Corroborated by a pre-existing DB row from Phase 4 of the apply session (id 5: creadoPor id 1 username lmoreno, actualizadoPor id 24 username clitest2 after a cross-user edit) |

All CRITICAL backend spec scenarios in customers-management/spec.md were exercised live and passed. This exceeds the disclosed gap description in the task brief: the apply agent could not run a live server in its own session due to an EPERM/hang issue with nest start --watch; this verify session found and used an already-running instance (nest start, no watch) successfully.

## Spec Compliance Matrix

### customers-management (backend)

| Requirement | Status |
|---|---|
| Cliente Data Model | Pass. schema.prisma matches field for field. Migration is additive-only (CreateTable plus two AddForeignKey, no ALTER or DROP on existing tables) |
| List Customers Requires Authentication Only | Pass, verified live |
| Get Single Customer | Pass, verified live |
| Create Customer | Pass, verified live |
| Update Customer, full field set, no partial update | Pass. Confirmed both in DTO source (UpdateCustomerDto has no IsOptional decorator except on activo) and live (missing-field PATCH returns 400) |
| Server-Side Creator and Updater Audit Stamping | Pass, verified live plus DB corroboration. req.user.userId resolved from JWT per jwt.strategy.ts (payload.sub) |
| Conditional Identification Format Validation | Pass, verified live for DNI short reject, DNI valid, CUIT dash normalize |
| No Role or Permission Check | Pass. JwtAuthGuard only, no RolesGuard, no rol check anywhere in controller or service |
| No Delete Capability | Pass, confirmed live (404) and by controller source (no Delete decorator) |

### customers-management-ui (frontend)

| Requirement | Status |
|---|---|
| Clientes List Page (search, filter, pagination, toggle) | Pass, code-verified. Search over razonSocial, identificacion, telefono; default status filter activo; page size options present; toggle calls updateCustomer with a flipped activo value and the full payload |
| Create Customer Page | Pass, code-verified. Required-field check before submit, createCustomer call, success toast plus redirect to /clientes, error toast on failure with form state intact (not reset in the catch branch) |
| Edit Customer Page | Pass, code-verified. getCustomer on mount with a cancelled unmount guard, pre-fill, updateCustomer on submit, success toast plus redirect |
| Loading, Error, Empty States on List | Pass. All three branches present and distinct: loading, listError, and two separate empty states (zero customers total vs zero matching filters) |
| Typed Customers API Client | Pass. customers.ts mirrors users.ts structurally: shared handleJsonResponse, getAuthHeader on every call, matching payload and list-item shapes |
| No New Route Protection | Pass. No role check added anywhere in the new pages or client |

### app-navigation (delta)

| Requirement | Status |
|---|---|
| Top-Level Navigation Sections, three entries, Clientes as sibling | Pass. navigation.tsx: Clientes is a top-level array item (index 2), href /clientes, not inside Configuraciones children |
| No Role Filtering in V1 | Pass. No role-based logic anywhere in navigation.tsx |

## Design Coherence, Edit Page Dirty-Tracking (highest-risk area, traced by hand)

Read client/app/(dashboard)/clientes/editar/[id]/page.tsx line by line for the sub-questions raised in the task brief:

1. Does the dirty-check compare against the loaded baseline correctly? Yes. isFormDirty(form, initialFormRef.current) is a live shallow comparison recomputed on every render, not cached at edit time, so editing a field back to its original value correctly clears isDirty again. This satisfies the editing-back-to-original scenario in task 10.5 without needing a browser to confirm the logic itself.
2. Does beforeunload get cleaned up on unmount? Yes. The effect registers the listener and returns a cleanup that removes it, with isDirty as the dependency, so cleanup runs on both dependency change and unmount.
3. Does saving reset the dirty baseline before the redirect? Yes. initialFormRef.current is set to the current form right after updateCustomer resolves and before router.push, matching task 8.3 exactly.
4. Cancel button conversion: confirmed. Cancelar is now a button element with an onClick handler, not a Link. The handler awaits showConfirm only when isDirty, returns early on cancel, otherwise navigates.
5. Minor closure-staleness note, not a defect: the beforeunload effect closure captures isDirty from the render that last ran the effect. Between the ref mutation on save (which does not trigger a re-render) and the subsequent router.push, there is a sub-millisecond window where the closure still holds the pre-save isDirty value of true. This is not exploitable: there is no synchronous yield point in that window where a user action could fire beforeunload, and the component unmounts (running real cleanup) the instant navigation completes. Documented for completeness only, not listed as an Issue below.

## Issues

No CRITICAL issues found.

No WARNING issues found. The only outstanding gap (Phase 10 live-browser click-through) is a pre-disclosed, already-tracked limitation of the apply session sandbox, not a new defect, and this verify pass independently corroborated the same scenarios via live backend curl testing and hand-traced frontend logic.

### SUGGESTION

1. customers.service.ts update() fetches the full Cliente row via findUnique with no select, purely to check existence before the duplicate-identificacion check. A select limited to id would avoid pulling unused columns. Cosmetic only, and mirrors an equivalent minor inefficiency already present in users.service.ts, so it is consistent with existing project style rather than a new regression.
2. Phase 10 and 11 unchecked tasks should be closed out with an actual browser click-through (Playwright or manual) in a follow-up session that has display or browser tooling available, specifically to confirm the beforeunload native prompt fires correctly, since static analysis cannot observe browser-level dialog behavior. This is the one class of behavior that genuinely cannot be confirmed without a real browser.

## Success Criteria Scorecard (proposal.md)

| Criterion | Status |
|---|---|
| All four endpoints require a Bearer token (401 otherwise), no role check | Pass, verified live |
| Duplicate identificacion returns 409 (TOCTOU plus P2002 backstop) | Pass, verified live plus code confirms both layers present |
| creadoPorId and actualizadoPorId stamped from the JWT caller, never from client input | Pass, verified live (spoofed value ignored) |
| DNI 7-8 digits, CUIT/CUIL 11 digits, dashes normalized | Pass, verified live |
| Frontend list (search, filter, pagination, toggle) plus nuevo/editar create and edit | Pass, code-verified, build-clean. Not live-browser-verified (disclosed gap) |
| Clientes nav entry visible to any authenticated user | Pass, code-verified (no role filtering, top-level sibling) |
| Migration additive-only and reversible | Pass. Only CREATE TABLE and ADD FOREIGN KEY statements, no touches to existing tables |

## Final Verdict: PASS WITH WARNINGS

The warnings designation reflects the disclosed, pre-existing gap (Phase 10 and 11 live-browser verification not performed) rather than any newly discovered defect. All CRITICAL backend contract scenarios were independently re-verified live in this session with a real running server and passed without exception. All frontend code was read in full and traced against every spec requirement and scenario, including the highest-risk dirty-tracking and navigation-guard logic on the edit page, with no correctness defects found. Both next build and nest build compile cleanly. This change is ready for archive. The only recommended follow-up is a browser-based click-through pass to close Phase 10 and 11 formally, which does not block archiving given the backend and frontend evidence gathered here.
