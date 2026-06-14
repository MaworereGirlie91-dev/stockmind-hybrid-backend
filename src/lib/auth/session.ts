export type SessionRole = 'admin' | 'mobile';

export interface SessionClaims {
  sub: string;
  role: SessionRole;
  iat: number;
  exp: number;
  device_id?: string;
}

const textEncoder = new TextEncoder();

function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return atob(normalized + '='.repeat(padLength));
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  const bytes = Array.from(new Uint8Array(signature), (n) => String.fromCharCode(n)).join('');
  return toBase64Url(bytes);
}

async function verifyHmac(secret: string, payload: string, signature: string): Promise<boolean> {
  const expected = await hmac(secret, payload);
  if (expected.length !== signature.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const payload = JSON.stringify(claims);
  const payloadEncoded = toBase64Url(payload);
  const signature = await hmac(secret, payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const [payloadEncoded, signature] = token.split('.');
    if (!payloadEncoded || !signature) {
      return null;
    }

    const valid = await verifyHmac(secret, payloadEncoded, signature);
    if (!valid) {
      return null;
    }

    const payloadJson = fromBase64Url(payloadEncoded);
    const parsed = JSON.parse(payloadJson) as SessionClaims;

    if (!parsed.sub || !parsed.role || typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp <= now) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function createClaims(args: {
  sub: string;
  role: SessionRole;
  ttlSeconds: number;
  deviceId?: string;
}): SessionClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: args.sub,
    role: args.role,
    iat: now,
    exp: now + args.ttlSeconds,
    device_id: args.deviceId,
  };
}

export function sessionToHeader(claims: SessionClaims): string {
  return `${claims.role}:${claims.sub}:${claims.exp}`;
}

export function decodePayloadUnsafe(token: string): SessionClaims | null {
  try {
    const [payloadEncoded] = token.split('.');
    if (!payloadEncoded) {
      return null;
    }
    const payloadJson = fromBase64Url(payloadEncoded);
    return JSON.parse(payloadJson) as SessionClaims;
  } catch {
    return null;
  }
}
