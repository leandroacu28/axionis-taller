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

## Placeholder Pages

`(dashboard)/home/page.tsx`, `usuarios/page.tsx`, `configuraciones-generales/page.tsx` — each a default-export server component returning a heading + short "en construcción" note, enough that links resolve (no 404) and the shell renders around them. No CRUD UI (out of scope).
