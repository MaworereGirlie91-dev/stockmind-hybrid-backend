import { NextResponse } from 'next/server';

import { SESSION_ACTIVITY_COOKIE_NAME } from '@/lib/auth/inactivity';
import { SESSION_COOKIE_NAME, USER_INFO_COOKIE_NAME } from '@/lib/server/auth';
import { isProd } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function POST() {
  const opts = { httpOnly: false, secure: isProd(), sameSite: 'lax' as const, path: '/', maxAge: 0 };
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', { ...opts, httpOnly: true });
  response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, '', opts);
  response.cookies.set(USER_INFO_COOKIE_NAME, '', opts);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
