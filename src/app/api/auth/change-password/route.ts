import { NextRequest, NextResponse } from 'next/server';

import { requireWebSession } from '@/lib/server/auth-guard';
import { findAccountByUsername, changeAccountPassword, authenticateAccount } from '@/lib/server/accounts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const claims = await requireWebSession();
    const account = await findAccountByUsername(claims.sub);
    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (!body.currentPassword) {
      return NextResponse.json({ error: 'Current password is required.' }, { status: 400 });
    }
    if (!body.newPassword || body.newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
    }
    if (body.newPassword !== body.confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    // Verify current password
    const valid = await authenticateAccount(account.username, body.currentPassword);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    }

    await changeAccountPassword({
      accountId: account.id,
      newPassword: body.newPassword,
      clearMustChange: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}
