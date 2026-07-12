# Design: Home Layout, Navigation & Cookie Session

## Technical Approach

Port template-spa's proven `(dashboard)` shell into axionis-taller's **no-`src`** App Router layout, simplified to v1 scope (no nav-search, notification bell, or role filtering). The cookie becomes the single session source of truth (non-httpOnly, read by edge `middleware.ts` for routing and by the client to hydrate `user`). The NestJS backend stays strictly Bearer-guarded — the cookie never reaches it. Backend gains three nullable `User` profile fields so `POST /auth/login` can return a `user` object the Header renders. Dark mode is Tailwind v3 `darkMode: 'class'`. Everything is additive except five small edits (root layout, root page, login page, tailwind config, auth service/controller).

Hard constraint: all frontend files live under `client/app/*` and `client/middleware.ts` — NO `src/` migration. Path imports use existing relative style (axionis has no `@/*` alias for app internals; use relative `../lib/...`).

## Directory / File Layout

```
client/
  middleware.ts                                    CREATE  edge route protection
  tailwind.config.ts                               MODIFY  add darkMode: 'class'
  app/
    layout.tsx                                     MODIFY  wrap <ThemeProvider>
    page.tsx                                       MODIFY  redirect('/login')
    login/page.tsx                                 MODIFY  set cookies, drop localStorage, push('/home')
    lib/
      api.ts                                       (unchanged; reuse API_BASE_URL)
      auth.ts                                      CREATE  login() + cookie token/user helpers + UserData
      navigation.tsx                               CREATE  NavigationItem type + 3 v1 items
      theme.tsx                                    CREATE  ThemeProvider / useTheme
    components/
      ThemeToggle.tsx                              CREATE  light/dark button (relative import of ../lib/theme)
      layout/
        Header.tsx                                 CREATE  top bar: toggle, user block, logout
        Sidebar.tsx                                CREATE  nav sections + active highlight
    (dashboard)/
      layout.tsx                                   CREATE  shell: state, hydration, logout, Header+Sidebar+main
      home/page.tsx                                CREATE  placeholder
      usuarios/page.tsx                            CREATE  placeholder
      configuraciones-generales/page.tsx          CREATE  placeholder
  public/
    icons/inicio.svg                               CREATE  nav icon
    icons/usuarios.svg                             CREATE  nav icon
    icons/configuraciones.svg                      CREATE  nav icon
server/
  prisma/schema.prisma                             MODIFY  add nombre, apellido, rol to User
  prisma/migrations/<ts>_add_user_profile/…        CREATE  migration + backfill
  src/auth/auth.service.ts                         MODIFY  login() returns { access_token, user }
  src/auth/auth.controller.ts                      (unchanged; already returns login() result)
```

## Cookie / Session Design

Two client-set cookies, both **non-httpOnly** (JS-readable), attributes `path=/; max-age=86400` (24h). This mirrors template-spa exactly and matches the prior localStorage exposure level — explicitly a **temporary, accepted tradeoff** (see proposal "Cookie/Auth Boundary"), not the end state. Follow-up to httpOnly server-set session is out of scope but nothing here blocks it.

| Cookie | Value | Set by | Read by |
|--------|-------|--------|---------|
| `token` | raw JWT string | `setToken()` in login page | middleware (routing), `getToken()` for Bearer header |
| `user` | `encodeURIComponent(JSON.stringify(UserData))` | `setUser()` in login page | `(dashboard)/layout.tsx` via `getUser()` |

`lib/auth.ts` exposes (mirrors template-spa's shape, axionis conventions):
- `login(username, password)` — `fetch(\`${API_BASE_URL}/auth/login\`, …)` (NOT `apiPath()`; axionis has no `/api` rewrite). Returns `{ access_token, user }`.
- `setToken(token)` / `getToken()` — write/read `token` cookie.
- `setUser(user)` / `getUser()` — write/read+parse `user` cookie (returns `null` on SSR/parse failure).
- `removeToken()` — clears both cookies (`max-age=0`).
- `UserData` interface (see Interfaces).

**Backend boundary (non-negotiable):** `JwtAuthGuard` / `ExtractJwt.fromAuthHeaderAsBearerToken()` is UNTOUCHED. The backend authenticates only via `Authorization: Bearer <token>` and NEVER reads the cookie. Any ported fetch that hits a protected endpoint attaches the Bearer header from `getToken()`. The cookie is purely a Next.js routing/hydration concern.

## middleware.ts Design

```ts
const PROTECTED = ['/home', '/usuarios', '/configuraciones-generales'];
```
- Read `request.cookies.get('token')?.value`.
- If path starts with any PROTECTED prefix and no token → `redirect('/login')`.
- If path starts with `/login` and token present → `redirect('/home')`.
- Root `/` handled by `app/page.tsx` (`redirect('/login')`), not middleware, so `/` need not be in the matcher.
- `config.matcher`: `['/home/:path*', '/usuarios/:path*', '/configuraciones-generales/:path*', '/login']`.

Redirect-loop guard: matcher scopes middleware only to protected routes + `/login`; `/login` is public so unauthenticated users are never bounced from it. Belt-and-suspenders: login page also `router.push('/home')` after success.

## Component Design

### `(dashboard)/layout.tsx` (`"use client"`) — state owner
Holds `sidebarOpen: boolean` (default `false`) and `user: UserData | null`. Hydrates `user` in `useEffect(() => setUser(getUser()), [])`. Defines `handleLogout = () => { removeToken(); router.push('/login'); }`. Renders flex shell: `<Sidebar>` + column(`<Header>` + `<main>{children}</main>`). This is the ONLY mount point for Header/Sidebar; `/login` keeps its own full-bleed layout.

### `Header.tsx` (`"use client"`)
Props `{ sidebarOpen, setSidebarOpen, user, onLogout }`. Renders: mobile sidebar-toggle button (flips `sidebarOpen`), spacer, `<ThemeToggle />`, a user block (initials from `user.nombre[0]+user.apellido[0]` with `user.username` fallback; shows name + `rol`), and a logout button calling `onLogout`. **Omitted vs template-spa:** nav-search over flattened items, notification bell, profile dropdown menu (inline block instead — keep it simple).

### `Sidebar.tsx` (`"use client"`)
Props `{ sidebarOpen, setSidebarOpen, user }`. Maps `navigation` (imported directly — NOT `filterNavigationByUser`) to `<Link>` rows; active-route highlight via `usePathname()` (`pathname === item.href` or `startsWith`). Mobile: translate/overlay driven by `sidebarOpen`. **Omitted vs template-spa:** `filterNavigationByUser` (v1 has no roles), collapsible children groups (v1 items are all flat leaves). `user` prop is accepted but only used for optional display; role filtering is deliberately NOT ported. The `NavigationItem` shape stays compatible so `filterNavigationByUser` + `children` groups can be added later without changing consumers.

## lib/navigation.tsx Design

```ts
export type NavigationItem = {
  name: string;
  href: string;          // v1: always present (flat leaves)
  id: string;
  icon: ReactNode;
  children?: NavigationItem[];  // reserved for later; unused in v1
};

export const navigation: NavigationItem[] = [
  { name: 'Inicio', href: '/home', id: 'home',
    icon: <img src="/icons/inicio.svg" alt="" className="h-5 w-5" aria-hidden /> },
  { name: 'Usuarios', href: '/usuarios', id: 'usuarios',
    icon: <img src="/icons/usuarios.svg" alt="" className="h-5 w-5" aria-hidden /> },
  { name: 'Configuraciones Generales', href: '/configuraciones-generales', id: 'configuraciones',
    icon: <img src="/icons/configuraciones.svg" alt="" className="h-5 w-5" aria-hidden /> },
];
```
Icons are three plain inline-SVG files in `public/icons/` (no external icon library, no design system). `optional children` field kept on the type so future role-filtered/grouped nav is additive.

## Theme Design

- `lib/theme.tsx`: port template-spa verbatim — `ThemeProvider` toggles `.dark` on `document.documentElement`, persists `localStorage['theme']`, `mounted` guard prevents hydration flash. `useTheme()` hook.
- `components/ThemeToggle.tsx`: port verbatim except `import { useTheme } from '../lib/theme'` (relative, no `@/*` alias). Sun/moon SVG, `mounted` guard.
- `tailwind.config.ts` diff: add `darkMode: 'class'` at config root (keeps v3 directives in `globals.css`; NO v4 upgrade). `content` glob already covers `./app/**/*.{ts,tsx}` — components under `app/components/` are included.
- `app/layout.tsx` diff: wrap `{children}` in `<ThemeProvider>`; keep `<html lang="en">` (add `suppressHydrationWarning` to `<html>` to silence the class swap).

## Backend Design

### Prisma migration
Add to `User`:
```prisma
nombre    String?
apellido  String?
rol       String   @default("admin")
```
`nombre`/`apellido` nullable (existing master row has none); `rol` non-null with DB default `"admin"` so existing rows backfill automatically. Migration via `npx prisma migrate dev --name add_user_profile` (requires running docker-compose MySQL). Generated SQL shape:
```sql
ALTER TABLE `User`
  ADD COLUMN `nombre` VARCHAR(191) NULL,
  ADD COLUMN `apellido` VARCHAR(191) NULL,
  ADD COLUMN `rol` VARCHAR(191) NOT NULL DEFAULT 'admin';
```
The `DEFAULT 'admin'` backfills every existing row (incl. master `lmoreno`) in the same `ALTER`. Optional explicit backfill for clarity: `UPDATE \`User\` SET \`rol\` = 'admin' WHERE \`rol\` IS NULL;` — not strictly needed given the NOT NULL DEFAULT.

### auth.service.ts
`validateUser()` already strips `passwordHash` and returns the full row (now including `nombre`/`apellido`/`rol`). Change `login()` signature to accept the profile fields and return the user object:
```ts
async login(user: { id: number; username: string; nombre: string | null; apellido: string | null; rol: string }) {
  const payload = { sub: user.id, username: user.username };
  return {
    access_token: this.jwtService.sign(payload),
    user: {
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
    },
  };
}
```
JWT payload stays `{ sub, username }` (unchanged — no rol in token). `auth.controller.ts` is unchanged (already forwards `authService.login(user)` result). No DTO change (login request body unchanged). `initMasterUser()` unchanged (new fields default/null).

## Placeholder Pages

`(dashboard)/home/page.tsx`, `usuarios/page.tsx`, `configuraciones-generales/page.tsx` — each a default-export server component returning a heading + short "en construcción" note, enough that links resolve (no 404) and the shell renders around them. No CRUD UI (out of scope).

## Interfaces / Contracts

```ts
// lib/auth.ts
export interface UserData {
  username: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
}
```
`POST /auth/login` response contract (new): `{ access_token: string, user: { username, nombre, apellido, rol } }`. `UserData` intentionally narrower than template-spa's (drops id/email/dni/permissions) — only what the Header needs; extend later when roles/permissions land.

## Data Flow

```
Login form ──login()──► POST /auth/login ──► { access_token, user }
     │                                            │
     ├─ setToken(access_token) ──► cookie `token`
     ├─ setUser(user)         ──► cookie `user`
     └─ router.push('/home')
                    │
   middleware (edge) reads cookie `token` ──► allows /home (else /login)
                    │
   (dashboard)/layout.tsx  useEffect ─getUser()─► cookie `user` ─► setUser(state)
                    │
        ┌───────────┴───────────┐
     Header (user, logout)   Sidebar (navigation, active route)
```

## Sequence Diagram

```mermaid
sequenceDiagram
  participant U as User
  participant L as login/page.tsx
  participant API as NestJS /auth/login (Bearer-only)
  participant C as Cookies (token,user)
  participant MW as middleware.ts (edge)
  participant D as (dashboard)/layout.tsx
  U->>L: submit credentials
  L->>API: POST { username, password }
  API-->>L: { access_token, user }
  L->>C: setToken(token); setUser(user)
  L->>MW: router.push('/home')
  MW->>C: read cookie token
  alt token present
    MW-->>D: allow /home
    D->>C: getUser() (hydrate)
    D-->>U: render Header + Sidebar + home page
  else no token
    MW-->>L: redirect /login
  end
```

## Architecture Decisions

### Decision: Cookie + edge middleware over client-only guard
**Choice**: Non-httpOnly `token`/`user` cookies read by `middleware.ts`. **Alternatives**: client-side `useEffect` redirect guard in a layout; server components reading cookies. **Rationale**: Middleware redirects at the edge BEFORE any protected page renders — no flash of protected content, no per-page guard duplication. Matches the proven template-spa pattern and the proposal's explicit decision.

### Decision: Non-httpOnly cookie accepted for v1
**Choice**: JS-readable cookie set client-side. **Alternatives**: httpOnly server-set session cookie now. **Rationale**: Parity with the localStorage it replaces (same XSS exposure), needs no backend cookie/CSRF work, keeps the backend Bearer-only. Explicitly temporary; httpOnly migration is a tracked follow-up nothing here blocks.

### Decision: `rol` as plain String, not enum
**Choice**: `String @default("admin")`. **Alternatives**: Prisma `enum Rol`. **Rationale**: Single-tenant, 1–2 roles today; a String avoids an enum migration and enum-value churn. Cheap to promote to an enum later if roles proliferate.

### Decision: Drop localStorage entirely (single source of truth)
**Choice**: Login sets cookies ONLY; remove `localStorage['access_token']`. **Alternatives**: keep localStorage as fallback alongside the cookie. **Rationale**: Two stores drift — middleware reads the cookie, so a stale/missing cookie with a live localStorage token silently desyncs routing from the Bearer header. One source (cookie) eliminates the drift class the proposal calls out. `theme` localStorage stays (separate concern, not session).

### Decision: No `filterNavigationByUser` port; keep type extensible
**Choice**: Sidebar renders the flat `navigation` array directly. **Alternatives**: port role filtering now. **Rationale**: v1 has no roles wired to nav; porting filtering adds dead code. `NavigationItem.children` and the `id` field are retained so filtering/grouping is a purely additive later change.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Manual/E2E | login → cookie set → `/home` land; `/` → `/login`; unauth on `/home` → `/login`; auth on `/login` → `/home` | manual (no test runner configured; `strict_tdd` off) |
| Manual | dark mode toggles + persists across reload | manual |
| Manual | migration applies; master `lmoreno` has `rol='admin'`, null names; login returns `user` | `prisma migrate dev` + curl `/auth/login` |

## Migration / Rollout

Backend requires running docker-compose MySQL for `prisma migrate dev`. Frontend is additive. Rollback: drop the 3 columns via down migration and revert login payload; delete new frontend files and revert the five edits (data-safe — new columns nullable/defaulted).

## Open Questions

- [ ] Nav icon visual assets — three placeholder SVGs are acceptable for v1 (no design system); final glyphs can be swapped without code change.
