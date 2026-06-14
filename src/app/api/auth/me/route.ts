import { NextResponse } from 'next/server';

import { requireWebSession } from '@/lib/server/auth-guard';
import { findAccountByUsername } from '@/lib/server/accounts';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const claims = await requireWebSession();

    // Try to get full profile from DB
    const account = await findAccountByUsername(claims.sub);
    if (account) {
      return NextResponse.json({
        id: account.id,
        username: account.username,
        email: account.email,
        displayName: account.display_name,
        role: account.role,
        avatarUrl: account.avatar_url,
        mustChangePassword: account.must_change_password,
      });
    }

    // Env-var admin has no DB record
    return NextResponse.json({
      id: null,
      username: claims.sub,
      email: claims.sub,
      displayName: 'Administrator',
      role: claims.role,
      avatarUrl: null,
      mustChangePassword: false,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status });
  }
}
