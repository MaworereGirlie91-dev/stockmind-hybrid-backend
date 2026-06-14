import { NextRequest, NextResponse } from 'next/server';

import { createAccount, normalizeEmail } from '@/lib/server/accounts';
import { SESSION_COOKIE_NAME, issueAdminSession } from '@/lib/server/auth';
import { isProd, readRequiredEnv, sessionDurationSeconds } from '@/lib/server/env';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      secret_key?: string;
    };

    const email = normalizeEmail(body.email);
    const password = normalizeRequiredText(body.password, 128);
    const secretKey = normalizeRequiredText(body.secret_key, 256);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown-ip';
    const rateKey = `it-admin-register:${ip}:${email ?? 'unknown'}`;
    const rate = consumeRateLimit({
      key: rateKey,
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rate.allowed) {
      const response = NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    if (!email || !password || !secretKey) {
      const response = NextResponse.json(
        { error: 'Email, password, and secret key are required.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const expectedSecret = readRequiredEnv('IT_ADMIN_SECRET_KEY');
    if (!safeEqual(secretKey, expectedSecret)) {
      const response = NextResponse.json({ error: 'Invalid secret key.' }, { status: 403 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    await createAccount({
      email,
      password,
      createdBy: 'bootstrap',
      itAdmin: true,
    });

    const token = await issueAdminSession(email);
    const ttl = sessionDurationSeconds();
    const response = NextResponse.json({
      ok: true,
      message: 'IT admin account created.',
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: ttl,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to create IT admin account.';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

