import { NextRequest } from 'next/server';

import { createClaims, signSession, verifySession } from '@/lib/auth/session';
import { authenticateAccount } from '@/lib/server/accounts';
import { readRequiredEnv, sessionDurationSeconds } from '@/lib/server/env';

export const SESSION_COOKIE_NAME = 'sm_session';

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,128}$/;

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

export async function issueAdminSession(username: string): Promise<string> {
  const secret = readRequiredEnv('LOGIN_SECRET');
  const claims = createClaims({
    sub: username,
    role: 'admin',
    ttlSeconds: sessionDurationSeconds(),
  });
  return signSession(claims, secret);
}

export async function issueMobileSession(username: string, deviceId: string): Promise<string> {
  const secret = readRequiredEnv('LOGIN_SECRET');
  const claims = createClaims({
    sub: username,
    role: 'mobile',
    ttlSeconds: sessionDurationSeconds(),
    deviceId,
  });
  return signSession(claims, secret);
}

export async function verifySessionToken(token: string) {
  const secret = readRequiredEnv('LOGIN_SECRET');
  return verifySession(token, secret);
}

export function isValidAdminCredentials(username: string, password: string): boolean {
  const expectedUser = readRequiredEnv('ADMIN_USERNAME');
  const expectedPass = readRequiredEnv('ADMIN_PASSWORD');

  return safeEqual(username, expectedUser) && safeEqual(password, expectedPass);
}

export async function authenticateCredentials(
  loginIdentifier: string,
  password: string
): Promise<{ subject: string; isItAdmin: boolean } | null> {
  const account = await authenticateAccount(loginIdentifier, password);
  if (account) {
    return {
      subject: account.email,
      isItAdmin: account.is_it_admin,
    };
  }

  if (isValidAdminCredentials(loginIdentifier, password)) {
    return {
      subject: loginIdentifier,
      isItAdmin: true,
    };
  }

  return null;
}

export function verifySyncApiToken(token: string | null): boolean {
  if (!token) {
    return false;
  }

  const expected = process.env.SYNC_API_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  return safeEqual(token, expected);
}

export function getBearerToken(req: NextRequest): string | null {
  const raw = req.headers.get('authorization');
  if (!raw) {
    return null;
  }

  const [scheme, value] = raw.split(' ');
  if (!scheme || !value || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return value.trim();
}

export function readClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'unknown-ip';
}

export function readDeviceId(req: NextRequest): string {
  const fromHeader = req.headers.get('x-device-id')?.trim();
  if (fromHeader && DEVICE_ID_PATTERN.test(fromHeader)) {
    return fromHeader;
  }

  return readClientIp(req);
}
