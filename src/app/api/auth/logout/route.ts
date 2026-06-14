import { NextResponse } from 'next/server';

import { SESSION_ACTIVITY_COOKIE_NAME } from '@/lib/auth/inactivity';
import { SESSION_COOKIE_NAME } from '@/lib/server/auth';
import { isProd } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, '', {
    httpOnly: false,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
