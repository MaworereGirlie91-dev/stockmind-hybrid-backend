import { NextRequest, NextResponse } from 'next/server';

import {
  createAccount,
  findAccountByUsername,
  findBrokenAccountByEmail,
  forceSetPassword,
  normalizeEmail,
  updateProfile,
} from '@/lib/server/accounts';
import { SESSION_COOKIE_NAME, USER_INFO_COOKIE_NAME, encodeUserInfo, issueWebSession } from '@/lib/server/auth';
import { requireWebSession } from '@/lib/server/auth-guard';
import { isProd, sessionDurationSeconds } from '@/lib/server/env';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const claims = await requireWebSession();

    // Only allowed when the current session has no DB record (env-var admin bootstrap)
    const sessionAccount = await findAccountByUsername(claims.sub);
    if (sessionAccount) {
      return NextResponse.json(
        { error: 'Your session already has a database account. Use the profile page to edit it.' },
        { status: 400 }
      );
    }

    if (claims.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin sessions can create the first account.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
    };

    const email = normalizeEmail(body.email);
    const password = normalizeRequiredText(body.password, 128);
    const displayName = normalizeRequiredText(body.displayName, 100) ?? null;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const ttl = sessionDurationSeconds();
    let account;

    // Check if there's a broken account (manually inserted, no password hash)
    const broken = await findBrokenAccountByEmail(email);
    if (broken) {
      // Repair it: set a proper password hash and optionally update display name
      await forceSetPassword(broken.id, password);
      if (displayName) {
        await updateProfile({ accountId: broken.id, displayName });
      }
      account = broken;
    } else {
      // Create a fresh account
      account = await createAccount({
        email,
        password,
        displayName: displayName ?? undefined,
        createdBy: 'bootstrap',
        role: 'admin',
      });
    }

    // Issue a new session bound to the account
    const token = await issueWebSession(account.username, 'admin');

    const response = NextResponse.json({ ok: true, username: account.username, repaired: !!broken });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: ttl,
    });
    response.cookies.set(
      USER_INFO_COOKIE_NAME,
      encodeUserInfo({
        sub: account.username,
        role: account.role,
        displayName: account.display_name,
        avatarUrl: account.avatar_url,
      }),
      { httpOnly: false, secure: isProd(), sameSite: 'lax', path: '/', maxAge: ttl }
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create account.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
