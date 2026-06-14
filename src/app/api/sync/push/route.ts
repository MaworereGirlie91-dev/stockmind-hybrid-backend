import { NextRequest, NextResponse } from 'next/server';

import {
  getBearerToken,
  readDeviceId,
  verifySessionToken,
  verifySyncApiToken,
} from '@/lib/server/auth';
import { processPush, SUPPORTED_TABLES, SyncAction, SyncOperation } from '@/lib/server/sync';
import { normalizeIsoTimestamp } from '@/lib/server/validation';

export const runtime = 'nodejs';

const MAX_OPERATIONS_PER_REQUEST = 300;
const MAX_JSON_PAYLOAD_CHARS = 64 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

function parseOperations(raw: unknown): SyncOperation[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const operations: SyncOperation[] = [];

  for (const item of raw) {
    if (operations.length >= MAX_OPERATIONS_PER_REQUEST) {
      break;
    }

    if (!isObject(item)) {
      continue;
    }

    const table = toBoundedString(item.table, 64);
    if (!SUPPORTED_TABLES.includes(table as (typeof SUPPORTED_TABLES)[number])) {
      continue;
    }

    const action = item.action === 'delete' ? 'delete' : 'upsert';
    const payload = isObject(item.payload) ? item.payload : {};

    const payloadSize = JSON.stringify(payload).length;
    if (payloadSize > MAX_JSON_PAYLOAD_CHARS) {
      continue;
    }

    const localId = toBoundedString(item.local_id, 128);
    if (!localId) {
      continue;
    }

    const remoteIdCandidate = toBoundedString(item.remote_id, 128);
    const normalizedTimestamp = normalizeIsoTimestamp(item.client_updated_at);

    const op: SyncOperation = {
      operation_id: toBoundedString(item.operation_id, 128) || crypto.randomUUID(),
      table: table as SyncOperation['table'],
      action: action as SyncAction,
      local_id: localId,
      remote_id: remoteIdCandidate || null,
      payload,
      client_updated_at: normalizedTimestamp ?? new Date().toISOString(),
      row_version: typeof item.row_version === 'number' ? Math.max(1, Math.floor(item.row_version)) : undefined,
    };

    operations.push(op);
  }

  return operations;
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
      operations?: unknown;
    };

    if (Array.isArray(body.operations) && body.operations.length > MAX_OPERATIONS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Request contains too many operations. Limit is ${MAX_OPERATIONS_PER_REQUEST}.` },
        { status: 413 }
      );
    }

    const auth = await authorize(req, body.device_id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const operations = parseOperations(body.operations);
    if (!operations.length) {
      return NextResponse.json({
        strategy: 'server_authoritative_lww',
        acknowledged: [],
        conflicts: [],
        failed: [],
        warning: 'No valid operations received.',
      });
    }

    const result = await processPush(auth.deviceId, operations);

    return NextResponse.json({
      ...result,
      device_id: auth.deviceId,
      received_operations: operations.length,
      processed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync push failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
