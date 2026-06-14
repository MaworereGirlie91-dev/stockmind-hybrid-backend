import { NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME, USER_INFO_COOKIE_NAME, verifySessionToken } from '@/lib/server/auth';

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/mobile/',
  '/api/sync/',
  '/_next',
  '/favicon',
  '/manifest.json',
  '/robokorda',
  '/api/it-admin/register',
];

// Paths a sales user can access
const SALES_ALLOWED_PREFIXES = [
  '/sales',
  '/profile',
  '/api/auth/',
  '/api/sales',
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let public paths through without auth
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(req);
  }

  const claims = await verifySessionToken(token);
  if (!claims) {
    const res = redirectToLogin(req);
    res.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    res.cookies.set(USER_INFO_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return res;
  }

  // Mobile sessions only touch mobile/sync APIs
  if (claims.role === 'mobile') {
    if (!pathname.startsWith('/api/mobile/') && !pathname.startsWith('/api/sync/')) {
      return redirectToLogin(req);
    }
    return NextResponse.next();
  }

  // Sales role: only allowed on certain paths
  if (claims.role === 'sales') {
    const allowed =
      pathname === '/' ||
      SALES_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = '/sales';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|manifest\\.json).*)',
  ],
};
