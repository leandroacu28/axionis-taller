# Proposal: Home Layout, Navigation & Cookie Session

## Intent
axionis-taller has a working login but no authenticated app: `/` is a static placeholder, session lives only in localStorage, there is no shell, navigation, theme, or identity display. Users land nowhere useful after login. This change delivers the authenticated dashboard foundation (shell + nav + session routing + theme + minimal user identity), mirroring the proven template-spa pattern, so future feature modules plug into a real app frame.

## Scope

### In Scope
- `(dashboard)` route group under existing `client/app/` (NO src/ migration) owning shell state, user hydration, logout; landing route `/home`.
- Ported `Header`, `Sidebar`, `ThemeToggle`, `lib/navigation.tsx`, `lib/theme.tsx`, `lib/auth.ts` adapted to axionis conventions (`API_BASE_URL`, Tailwind v3).
- Three v1 nav sections: Inicio → `/home`, Usuarios → `/usuarios`, Configuraciones Generales → `/configuraciones-generales`. No role filtering; item shape kept extensible.
- Cookie + `middleware.ts` session: protect `/home`, `/usuarios`, `/configuraciones-generales`; unauthenticated → `/login`; authenticated on `/login` → `/home`; `/` → `/login`.
- Login change: set `token` + `user` cookies on success (source of truth); drop localStorage `access_token`.
- Dark mode: `darkMode: 'class'` in `tailwind.config.ts`, keep Tailwind v3 directives.
- Backend: add nullable `nombre`, `apellido`, `rol` (String, default `"admin"`) to `User` + Prisma migration + master-user backfill; extend `POST /auth/login` to return a `user` object.
- Minimal placeholder page for `/home`, `/usuarios`, `/configuraciones-generales` so nav links don't 404; simple inline-SVG nav icons.

### Out of Scope
- Full CRUD UI for Usuarios / Configuraciones Generales.
- Role-based nav filtering; `/auth/me` endpoint; httpOnly/refresh-token/backend cookie auth (guard stays Bearer).
- Tailwind v4 upgrade; src/ restructure; notification backend; test runner setup.

## Capabilities

### New Capabilities
- `dashboard-shell`: authenticated `(dashboard)` layout (Header+Sidebar+main), state, hydration, logout, `/home` landing.
- `app-navigation`: typed nav model + Sidebar/Header rendering for the three v1 sections.
- `session-routing`: cookie-based session + middleware route protection and redirects.
- `theme-switching`: Tailwind-v3 dark mode provider/toggle.
- `user-identity`: minimal backend User profile fields + login user payload for header display.

### Modified Capabilities
- None (fresh scaffold; no existing specs).

## Approach
Keep axionis's no-`src` layout: add `app/(dashboard)/layout.tsx` plus `app/lib/*` and `app/components/layout/*`. Cookie becomes the single session source (non-httpOnly, `path=/`, `max-age=86400`) read by edge middleware for routing and by the client to hydrate `user` and build the `Authorization: Bearer` header — eliminating localStorage dual-source drift. Backend stays Bearer-guarded; the cookie is purely a Next.js routing/hydration concern. `rol` is a plain String (single-tenant, 1-2 roles) to avoid an enum migration now.

### Cookie/Auth Boundary (explicit, non-negotiable for this change)
- The `token`/`user` cookies exist **only** to let `middleware.ts` (Next.js edge) and the `(dashboard)` layout (client hydration) decide routing — where to redirect, what to render as the logged-in user.
- The NestJS backend **continues to authenticate exclusively via `Authorization: Bearer <token>`** (`JwtAuthGuard` / `ExtractJwt.fromAuthHeaderAsBearerToken()`). The backend never reads the cookie. `lib/auth.ts`'s fetch helpers must keep attaching the Bearer header from the token value, regardless of where that value is sourced from.
- The cookie is set **non-httpOnly** in this change, matching the current localStorage's exposure level — this is parity, not a regression, but it is explicitly a **temporary, accepted tradeoff**, not a target end-state.
- **Follow-up (out of scope here, tracked for later):** migrate to an httpOnly, server-set session cookie (e.g. issued by a Nest response header on `/auth/login`, or via a Next.js Route Handler) once there's budget to also address CSRF implications of httpOnly cookies talking to a Bearer-only backend. Do not implement this now — just don't design anything that blocks it later.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `client/app/(dashboard)/` | New | Route group, layout, placeholder pages |
| `client/app/components/layout/` | New | Header, Sidebar, ThemeToggle |
| `client/app/lib/` | New | navigation.tsx, theme.tsx, auth.ts |
| `client/app/layout.tsx` | Modified | Wrap ThemeProvider |
| `client/app/page.tsx` | Modified | Redirect `/` → `/login` |
| `client/app/login/page.tsx` | Modified | Set cookies, drop localStorage, push `/home` |
| `client/middleware.ts` | New | Route protection |
| `client/tailwind.config.ts` | Modified | `darkMode: 'class'` |
| `client/public/` | New | Nav icons |
| `server/prisma/schema.prisma` + migration | Modified | Add nombre/apellido/rol |
| `server/src/auth/auth.service.ts` | Modified | Login returns user object + backfill |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Non-httpOnly cookie XSS exposure | Med | Parity with prior localStorage; note as accepted; revisit with httpOnly later |
| Cookie vs Bearer boundary confusion | Med | Cookie = routing/hydration only; backend keeps Bearer; document in lib/auth.ts |
| Master user null on new columns | Med | Nullable + default `"admin"` + explicit backfill in migration |
| Login/middleware redirect loop | Low | Mirror template-spa matcher; test `/`, `/login`, protected routes |

## Rollback Plan
Frontend is additive: delete new route-group/lib/components/middleware files, revert login/page.tsx/layout.tsx/tailwind.config.ts, restore localStorage push to `/`. Backend: new migration dropping the 3 columns and revert login payload. No data loss (new columns nullable/defaulted).

## Dependencies
- Running docker-compose MySQL to apply the Prisma migration.
- template-spa remains available read-only as the porting reference.

## Success Criteria
- [ ] Login sets cookies, drops localStorage, lands on `/home`.
- [ ] Middleware redirects unauthenticated users to `/login` and authenticated users off `/login`; `/` → `/login`.
- [ ] Dashboard shell renders Header + Sidebar with the three sections; links resolve (no 404).
- [ ] Header shows name/initials/rol from the login user payload.
- [ ] Dark mode toggles and persists.
- [ ] `User` migration applies cleanly and master user has non-null profile fields.
