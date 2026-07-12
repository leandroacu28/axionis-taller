# Exploration: Port post-login redirect + header + lateral navbar from template-spa into axionis-taller

## Current State

**template-spa reference (read-only, `C:\empresa\template-spa\client\src`):**

- Stack: Next.js 16.1.6, React 19.2.3, Tailwind v4 (CSS-first `@theme`/`@custom-variant` config). Path alias `@/*` → `./src/*`.
- Header (`components/layout/Header.tsx`, `"use client"`): props `{ sidebarOpen, setSidebarOpen, user, onLogout }`. Sticky top bar, mobile sidebar-toggle, client-side nav search over `flattenNavigationItems(filterNavigationByUser(user))`, notification bell, `<ThemeToggle />`, profile dropdown (avatar initials from `user.nombre`/`user.apellido`, name/email/rol, logout button).
- Sidebar (`components/layout/Sidebar.tsx`, `"use client"`): props `{ sidebarOpen, setSidebarOpen, user }`. Fixed `<aside>` below header, animated width/translate for mobile + desktop collapse, mobile overlay backdrop. Renders `filterNavigationByUser(user)`; items with `children` become collapsible groups (auto-expand active submenu via `pathname`); leaf items are `<Link>` with active-state classes.
- Composition: `app/(dashboard)/layout.tsx` (route group, `"use client"`) is the ONLY place Header+Sidebar mount. Holds `sidebarOpen`/`user` state (hydrates from cookie via `getUser()`), defines `handleLogout`, renders Sidebar + Header + `<main>{children}</main>` in a flex shell. Root `app/layout.tsx` only wraps `<ThemeProvider>`. `app/login/page.tsx` has its own full-bleed layout (no Header/Sidebar).
- Navigation config (`lib/navigation.tsx`): typed `NavigationItem[]` (name, href, icon JSX, optional children). `filterNavigationByUser(user)` role/permission-filters; `flattenNavigationItems()` flattens for search.
- Redirect mechanism (cookie-based, not localStorage):
  - `lib/auth.ts`: `setToken()`/`setUser()` write `document.cookie` (`token=`, `user=`, `path=/`, `max-age=86400`); `getToken()`/`getUser()` read/parse; `removeToken()` clears both.
  - `middleware.ts`: reads `request.cookies.get("token")`. Protected prefixes (`/home`, `/perfil`, `/testing`, `/usuarios`, `/maestro`) redirect to `/login` if no token; `/login` redirects to `/home` if token present. `config.matcher` scopes it.
  - Login page also does client-side `router.push("/home")` right after successful login (belt-and-suspenders with middleware).
  - Root `app/page.tsx` unconditionally `redirect("/login")`. Actual dashboard landing is `/home` (inside `(dashboard)` group).
- Supporting: `lib/theme.tsx` (`ThemeProvider`/`useTheme`, toggles `.dark` class on `<html>`, persists localStorage), `components/ThemeToggle.tsx`, `lib/api.ts` (`apiPath()` prefixes `/api`).
- Nav icons: plain `<img src="/xxx.svg">` — `inicio.svg`, `configuraciones.svg`, `usuarios.svg`, `maestro.svg`, `licencia.svg`.

**axionis-taller target (`C:\empresa\axionis-taller\client`):**

- Stack: Next.js 14.2.18 App Router, NO `src/` dir — routes live directly at `client/app/*`. React 18.3.1. Tailwind v3.4.19, classic `tailwind.config.ts` (`content: ['./app/**/*.{ts,tsx}']`, no `darkMode` key — defaults to `media`).
- `client/app/layout.tsx`: bare `<html><body>{children}</body></html>`, no ThemeProvider.
- `client/app/page.tsx`: static "under construction" placeholder — does NOT redirect anywhere today.
- `client/app/login/page.tsx`: working login UI (rose/red theme). On success: `localStorage.setItem('access_token', data.access_token)`, then `router.push('/')`. No cookie set.
- `client/app/init/page.tsx`: master-user bootstrap, POSTs `/auth/init`, redirects to `/login`.
- `client/app/lib/api.ts`: exports `API_BASE_URL` (full origin), used as `${API_BASE_URL}/auth/login` — different pattern from template-spa's `apiPath()` (`/api` prefix + rewrite proxy).
- No `middleware.ts`, no route group, no `Header`/`Sidebar`/`ThemeToggle`, no `lib/auth.ts`/`navigation.tsx`/`theme.tsx`. `public/` only has `images/axionis-negativo.png` — no nav icons.
- Backend (`server/src/auth`): `POST /auth/login` returns `{ access_token }` only. Prisma `User` model: `id, username, passwordHash, createdAt, updatedAt` — no `nombre`, `apellido`, `rol`. JWT payload `{ sub, username }`. `JwtAuthGuard` is Bearer-token based, not cookie-based. Other backend modules: `users`, `configuraciones-generales`. No test runner configured (strict_tdd off).

## Affected Areas

- `client/app/layout.tsx` — needs ThemeProvider.
- `client/app/page.tsx` — needs redirect to `/login`.
- `client/app/login/page.tsx` — needs to set cookie(s) instead of/alongside localStorage, push to `/home`.
- `client/app/lib/api.ts` — any ported fetch logic must use `API_BASE_URL`, not `apiPath()`.
- `client/tailwind.config.ts` — needs `darkMode: 'class'`.
- `client/app/globals.css` — stays Tailwind v3 directives (not v4 CSS-first syntax).
- `server/prisma/schema.prisma` (`User` model) — needs `nombre`, `apellido`, `rol`.
- `server/src/auth/auth.controller.ts` / `auth.service.ts` — `login()` needs to return a `user` object.
- No `middleware.ts`, route group, `lib/auth.ts`, `navigation.tsx`, `theme.tsx`, or `components/layout/*` exist yet — pure additions.
- `client/public/` — needs new nav icons (3 sections, axionis domain differs from template-spa's).

## Decisions Resolved With User (final, do not re-litigate)

1. Landing route: `/home` after login (matches user's original request).
2. Session mechanism: cookie + `middleware.ts`, mirroring template-spa exactly.
3. Header user data: extend backend now (`nombre`, `apellido`, `rol` on `User` + login response).
4. Dark mode: port `ThemeProvider`/`ThemeToggle` now, adapted to Tailwind v3 (`darkMode: 'class'`, keep v3 directives — no v4 upgrade).
5. Navbar v1 sections: Inicio (→ `/home`), Usuarios (→ users module), Configuraciones Generales (→ configuraciones-generales module). No role-based filtering in v1; keep nav item shape extensible.

## Ready for Proposal

Yes. See `proposal.md` in this same change folder.
