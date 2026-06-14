import { NextRequest, NextResponse } from 'next/server';

import { SESSION_ACTIVITY_COOKIE_NAME, isActivityExpired } from '@/lib/auth/inactivity';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/server/auth';

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/scan') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/mobile') ||
    pathname === '/api/it-admin/register' ||
    pathname.startsWith('/api/sync') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json' ||
    pathname.startsWith('/robokorda') ||
    pathname === '/login'
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const activity = req.cookies.get(SESSION_ACTIVITY_COOKIE_NAME)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims && claims.role === 'admin' && !isActivityExpired(activity)) {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith('/api/')) {
    const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return response;
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|manifest.json).*)',
  ],
};
