# Tasks: Home Layout, Navigation & Cookie Session

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-650 (18 files: 1 migration, 2 backend, 15 frontend) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 (see Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: migration + login user payload (Phase 1) | PR 1 | Independent; ~40-60 lines; satisfies `user-identity` |
| 2 | Frontend infra: auth.ts, theme.tsx, tailwind, ThemeToggle (Phase 2) | PR 2 | Depends on PR 1's `user` shape; ~160-200 lines; `theme-switching` |
| 3 | Frontend nav + shell: navigation.tsx, icons, Header, Sidebar, dashboard layout, root layout wrap (Phase 3+4) | PR 3 | Depends on PR 2; ~310-330 lines; `app-navigation` + `dashboard-shell` |
| 4 | Frontend routing + placeholders: middleware, page.tsx, login/page.tsx, placeholder pages (Phase 5+6) | PR 4 | Depends on PR 3 (routes must exist); ~95-110 lines; `session-routing` |
| — | Manual verification (Phase 7) | part of PR 4 or standalone follow-up | No new files; checklist only |

## Phase 1: Backend Foundation (`user-identity`)

- [x] 1.1 Add nullable `nombre`, `apellido`, and `rol` (`String @default("admin")`) to `User` in `server/prisma/schema.prisma`.
- [x] 1.2 Run `npx prisma migrate dev --name add_user_profile` against docker-compose MySQL; verify generated `ALTER TABLE` backfills existing rows via `DEFAULT 'admin'`.
- [x] 1.3 Update `server/src/auth/auth.service.ts` `login()` to accept profile fields and return `{ access_token, user: { username, nombre, apellido, rol } }`.
- [x] 1.4 Confirm `server/src/auth/auth.controller.ts` still forwards `login()` result unchanged (no edit expected).

## Phase 2: Frontend Infra (`theme-switching` + auth foundation)

- [x] 2.1 Create `client/app/lib/auth.ts`: `login()` via `API_BASE_URL` (NOT `apiPath()`), `setToken/getToken`, `setUser/getUser`, `removeToken`, `UserData` interface; cookies `path=/; max-age=86400`.
- [x] 2.2 Create `client/app/lib/theme.tsx`: `ThemeProvider`/`useTheme`, toggles `.dark` on `<html>`, persists `localStorage['theme']`, `mounted` guard.
- [x] 2.3 Add `darkMode: 'class'` to `client/tailwind.config.ts` (keep v3 `@tailwind` directives).
- [x] 2.4 Create `client/app/components/ThemeToggle.tsx` (relative import `../lib/theme`, `mounted` guard).

## Phase 3: Frontend Navigation (`app-navigation`)

- [x] 3.1 Create `client/app/lib/navigation.tsx`: `NavigationItem` type (`name, href, id, icon, children?`) + 3 v1 items (Inicio/Usuarios/Configuraciones Generales) in that order.
- [x] 3.2 Add `client/public/icons/inicio.svg`, `usuarios.svg`, `configuraciones.svg` (plain inline SVG, no icon library).

## Phase 4: Frontend Shell (`dashboard-shell`)

- [x] 4.1 Create `client/app/components/layout/Header.tsx`: sidebar toggle, `<ThemeToggle/>`, user block (initials from `nombre[0]+apellido[0]`, fallback `username`; shows name + `rol`), logout button.
- [x] 4.2 Create `client/app/components/layout/Sidebar.tsx`: renders `navigation` array, active-route highlight via `usePathname()`, mobile overlay driven by `sidebarOpen`.
- [x] 4.3 Create `client/app/(dashboard)/layout.tsx`: owns `sidebarOpen`/`user` state, hydrates `user` from cookie in `useEffect(getUser)` without throwing on missing/malformed cookie, `handleLogout` (clears cookies, redirects `/login`), composes Header+Sidebar+`<main>`.
- [x] 4.4 Wrap `{children}` in `<ThemeProvider>` in `client/app/layout.tsx`; add `suppressHydrationWarning` to `<html>`.

## Phase 5: Frontend Routing (`session-routing`)

- [x] 5.1 Create `client/middleware.ts`: protect `/home`, `/usuarios`, `/configuraciones-generales`; unauth → `/login`; auth-on-`/login` → `/home`; set `config.matcher`.
- [x] 5.2 Update `client/app/page.tsx` to unconditionally `redirect('/login')`.
- [x] 5.3 Update `client/app/login/page.tsx`: call `setToken`/`setUser` on success, remove `localStorage['access_token']` write, `router.push('/home')`.

## Phase 6: Placeholder Pages

- [x] 6.1 Create `client/app/(dashboard)/home/page.tsx` (heading + short placeholder note).
- [x] 6.2 Create `client/app/(dashboard)/usuarios/page.tsx` (heading + short placeholder note).
- [x] 6.3 Create `client/app/(dashboard)/configuraciones-generales/page.tsx` (heading + short placeholder note).

## Phase 7: Manual Verification (Success Criteria)

- [ ] 7.1 Login sets `token`/`user` cookies, no `access_token` in `localStorage`, lands on `/home`.
- [ ] 7.2 Middleware matrix: `/` → `/login`; unauth on protected routes → `/login`; auth on `/login` → `/home`.
- [ ] 7.3 Dashboard shell renders Header + Sidebar with exactly 3 nav links; all resolve (no 404s).
- [ ] 7.4 Header shows name/initials/`rol` from the login user payload.
- [ ] 7.5 Dark mode toggles, persists across reload, and survives logout (theme unaffected by session clear).
- [ ] 7.6 `prisma migrate dev` applies cleanly; master user (`lmoreno`) has non-null `nombre`, `apellido`, `rol='admin'` after migration.
