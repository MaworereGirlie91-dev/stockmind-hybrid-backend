import { NextRequest, NextResponse } from 'next/server';

import { SESSION_ACTIVITY_COOKIE_NAME, currentActivityValue } from '@/lib/auth/inactivity';
import {
  SESSION_COOKIE_NAME,
  USER_INFO_COOKIE_NAME,
  authenticateCredentials,
  encodeUserInfo,
  issueWebSession,
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

    const rate = consumeRateLimit({ key: rateKey, maxAttempts: 12, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.', retry_after_seconds: rate.retryAfterSeconds },
        { status: 429, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const match = await authenticateCredentials(username, password);
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    clearRateLimit(rateKey);
    const token = await issueWebSession(match.subject, match.role);
    const ttl = sessionDurationSeconds();
    const cookieOpts = { httpOnly: true, secure: isProd(), sameSite: 'lax' as const, path: '/', maxAge: ttl };

    const response = NextResponse.json({
      ok: true,
      role: match.role,
      mustChangePassword: match.mustChangePassword,
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, cookieOpts);
    response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, currentActivityValue(), {
      ...cookieOpts,
      httpOnly: false,
    });
    // Non-httpOnly cookie for client-side display (role, name, avatar — not secret)
    response.cookies.set(
      USER_INFO_COOKIE_NAME,
      encodeUserInfo({
        sub: match.subject,
        role: match.role,
        displayName: match.displayName,
        avatarUrl: match.avatarUrl,
      }),
      { ...cookieOpts, httpOnly: false }
    );

    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in.';
    return NextResponse.json({ error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
