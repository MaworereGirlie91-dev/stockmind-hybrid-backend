import { NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/server/auth';
import { findAccountByEmail } from '@/lib/server/accounts';
import { readRequiredEnv } from '@/lib/server/env';

interface ItAdminSession {
  subject: string;
}

function safeEqualIgnoreCase(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function assertItAdminSession(req: NextRequest): Promise<ItAdminSession> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new Error('Unauthorized');
  }

  const claims = await verifySessionToken(token);
  if (!claims || claims.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const envAdminUsername = readRequiredEnv('ADMIN_USERNAME');
  if (safeEqualIgnoreCase(claims.sub, envAdminUsername)) {
    return { subject: claims.sub };
  }

  const account = await findAccountByEmail(claims.sub);
  if (!account || !account.is_it_admin || !account.is_active || account.deleted_at) {
    throw new Error('Forbidden');
  }

  return { subject: account.email };
}

