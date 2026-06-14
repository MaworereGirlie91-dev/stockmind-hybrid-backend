import { NextRequest, NextResponse } from 'next/server';

import {
  getBearerToken,
  readDeviceId,
  verifySessionToken,
  verifySyncApiToken,
} from '@/lib/server/auth';
import { processPull, SUPPORTED_TABLES, SyncTable } from '@/lib/server/sync';
import { normalizeIsoTimestamp } from '@/lib/server/validation';

export const runtime = 'nodejs';

const MAX_PULL_LIMIT = 2000;

function toBoundedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return '';
  }

  return trimmed;
}

function parseCheckpoints(raw: unknown): Partial<Record<SyncTable, string>> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const checkpoints: Partial<Record<SyncTable, string>> = {};
  for (const table of SUPPORTED_TABLES) {
    const value = (raw as Record<string, unknown>)[table];
    const timestamp = normalizeIsoTimestamp(value);
    if (timestamp) {
      checkpoints[table] = timestamp;
    }
  }
  return checkpoints;
}

async function authorize(req: NextRequest, bodyDeviceId?: string) {
  const syncToken = req.headers.get('x-sync-token');
  if (verifySyncApiToken(syncToken)) {
    return {
      ok: true as const,
      deviceId: toBoundedString(bodyDeviceId, 128) || readDeviceId(req),
      role: 'sync_token' as const,
    };
  }

  const bearer = getBearerToken(req);
  if (!bearer) {
    return { ok: false as const, status: 401, error: 'Missing authentication token.' };
  }

  const claims = await verifySessionToken(bearer);
  if (!claims || (claims.role !== 'mobile' && claims.role !== 'admin')) {
    return { ok: false as const, status: 401, error: 'Invalid authentication token.' };
  }

  const requestedDeviceId = toBoundedString(bodyDeviceId, 128) || readDeviceId(req);
  if (claims.role === 'mobile' && claims.device_id && claims.device_id !== requestedDeviceId) {
    return { ok: false as const, status: 403, error: 'Token device mismatch.' };
  }

  return {
    ok: true as const,
    deviceId: requestedDeviceId,
    role: claims.role,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      device_id?: string;
      checkpoints?: unknown;
      limit?: number;
    };

    const auth = await authorize(req, body.device_id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const checkpoints = parseCheckpoints(body.checkpoints);
    const limit = typeof body.limit === 'number' && body.limit > 0
      ? Math.min(Math.floor(body.limit), MAX_PULL_LIMIT)
      : 1000;

    const result = await processPull(checkpoints, limit);

    return NextResponse.json({
      ...result,
      device_id: auth.deviceId,
      pulled_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync pull failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
