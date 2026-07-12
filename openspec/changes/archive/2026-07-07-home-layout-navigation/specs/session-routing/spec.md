# Session Routing Specification

## Requirements

### Requirement: Cookie-Based Session
On successful login, the client MUST set `token` and `user` cookies with `path=/`, `max-age=86400`, non-httpOnly. Client-side `localStorage` MUST NOT be used to store the access token.

#### Scenario: Login sets session cookies
- GIVEN a user submits valid credentials
- WHEN `POST /auth/login` succeeds
- THEN the client sets `token` and `user` cookies with `path=/` and `max-age=86400`
- AND no `access_token` is written to `localStorage`

### Requirement: Middleware Protects Dashboard Routes
`middleware.ts` MUST redirect unauthenticated requests (no valid `token` cookie) to `/login` for `/home`, `/usuarios`, and `/configuraciones-generales`.

#### Scenario: Unauthenticated user hits a protected route
- GIVEN no `token` cookie is present
- WHEN the user requests `/usuarios`
- THEN the response redirects to `/login`

### Requirement: Middleware Redirects Authenticated Users Off /login
`middleware.ts` MUST redirect requests to `/login` to `/home` when a valid `token` cookie is present.

#### Scenario: Authenticated user revisits /login
- GIVEN a valid `token` cookie is present
- WHEN the user requests `/login`
- THEN the response redirects to `/home`

### Requirement: Root Path Always Redirects to Login
`/` MUST unconditionally redirect to `/login`, regardless of authentication state.

#### Scenario: Any user hits root
- GIVEN any authentication state (present or absent `token` cookie)
- WHEN a request is made to `/`
- THEN the response redirects to `/login`

### Requirement: Client-Side Post-Login Navigation
The login page MUST perform a client-side `router.push('/home')` immediately after a successful login response, independent of middleware redirect behavior.

#### Scenario: Login success navigates without full reload
- GIVEN valid credentials are submitted from `/login`
- WHEN the login request succeeds and cookies are set
- THEN the client calls `router.push('/home')`

### Requirement: Backend Authentication Boundary Is Bearer-Only
The NestJS backend MUST continue to authenticate exclusively via the `Authorization: Bearer <token>` header using the existing `JwtAuthGuard`. The backend MUST NOT read, parse, or trust the `token`/`user` cookies for any authentication or authorization decision. The session cookies exist only for Next.js middleware routing and client-side `user` hydration.

#### Scenario: Backend ignores cookie even if present
- GIVEN a request to a Bearer-guarded backend endpoint includes a valid `token` cookie but no `Authorization` header
- WHEN the backend evaluates the request
- THEN `JwtAuthGuard` rejects the request as unauthenticated, since only the `Authorization` header is honored

#### Scenario: Non-httpOnly cookie is an accepted parity tradeoff
- GIVEN the `token`/`user` cookies are set as non-httpOnly
- WHEN evaluating this against the prior `localStorage`-based session
- THEN this is treated as parity (not a regression); httpOnly migration is explicitly out of scope for this change and MUST NOT be required by this spec
