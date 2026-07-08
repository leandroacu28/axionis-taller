import { NextRequest, NextResponse } from 'next/server';

// Next.js statically parses `config.matcher` at build time — it must be a
// literal array (no spread/map/computed expressions), so it cannot be
// derived from PROTECTED. When adding a section, update BOTH arrays below.
const PROTECTED = ['/home', '/usuarios'];

/**
 * Edge route protection based on the `token` cookie.
 *
 * This ONLY decides Next.js routing (redirects). It does not — and cannot —
 * validate the JWT signature at the edge; presence of the cookie is a routing
 * signal, not a security boundary. The NestJS backend re-validates the token
 * on every real API call via the `Authorization: Bearer` header.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('token')?.value;

  const isProtected = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/home/:path*', '/usuarios/:path*', '/login'],
};
