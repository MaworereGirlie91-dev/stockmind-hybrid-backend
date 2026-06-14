import { NextRequest, NextResponse } from 'next/server';

import {
  authenticateCredentials,
  issueMobileSession,
  readClientIp,
  readDeviceId,
} from '@/lib/server/auth';
import { sessionDurationSeconds } from '@/lib/server/env';
import { clearRateLimit, consumeRateLimit } from '@/lib/server/rate-limit';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      device_id?: string;
    };

    const username = normalizeRequiredText(body.username, 180) ?? '';
    const password = normalizeRequiredText(body.password, 256) ?? '';
    const deviceId = body.device_id?.trim() || readDeviceId(req);

    const ip = readClientIp(req);
    const rateKey = `mobile-login:${ip}:${username.toLowerCase() || 'unknown'}`;
    const rate = consumeRateLimit({
      key: rateKey,
      maxAttempts: 15,
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

    const token = await issueMobileSession(match.subject, deviceId);
    const ttl = sessionDurationSeconds();

    const response = NextResponse.json({
      token,
      token_type: 'Bearer',
      expires_in: ttl,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      device_id: deviceId,
      role: 'mobile',
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
