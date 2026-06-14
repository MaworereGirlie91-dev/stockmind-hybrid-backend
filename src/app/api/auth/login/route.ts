import { NextRequest, NextResponse } from 'next/server';

import { SESSION_ACTIVITY_COOKIE_NAME, currentActivityValue } from '@/lib/auth/inactivity';
import {
  SESSION_COOKIE_NAME,
  authenticateCredentials,
  issueAdminSession,
  readClientIp,
} from '@/lib/server/auth';
import { isProd, sessionDurationSeconds } from '@/lib/server/env';
import { clearRateLimit, consumeRateLimit } from '@/lib/server/rate-limit';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
    };

    const username = normalizeRequiredText(body.username, 180) ?? '';
    const password = normalizeRequiredText(body.password, 256) ?? '';
    const ip = readClientIp(req);
    const rateKey = `web-login:${ip}:${username.toLowerCase() || 'unknown'}`;

    const rate = consumeRateLimit({
      key: rateKey,
      maxAttempts: 12,
      windowMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      const response = NextResponse.json(
        {
          error: 'Too many login attempts. Try again later.',
          retry_after_seconds: rate.retryAfterSeconds,
        },
        { status: 429 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    if (!username || !password) {
      const response = NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const match = await authenticateCredentials(username, password);
    if (!match) {
      const response = NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    clearRateLimit(rateKey);
    const token = await issueAdminSession(match.subject);
    const ttl = sessionDurationSeconds();

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: ttl,
    });
    response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, currentActivityValue(), {
      httpOnly: false,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: ttl,
    });
    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in.';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
