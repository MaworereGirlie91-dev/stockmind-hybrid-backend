import { cookies } from 'next/headers';

import { SessionClaims } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/server/auth';

async function getSession(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(): Promise<SessionClaims> {
  const claims = await getSession();
  if (!claims) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
  return claims;
}

export async function requireAdminSession(): Promise<SessionClaims> {
  const claims = await requireSession();
  if (claims.role !== 'admin') throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  return claims;
}

export async function requireWebSession(): Promise<SessionClaims> {
  const claims = await requireSession();
  if (claims.role === 'mobile') throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  return claims;
}
