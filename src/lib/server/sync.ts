import { createAdminClient } from '@/lib/server/supabase-admin';
import { mirrorSoftDelete, mirrorUpsert } from '@/lib/server/mysql';

export const SUPPORTED_TABLES = ['books_master', 'book_copies', 'book_boxes', 'sales'] as const;
export type SyncTable = (typeof SUPPORTED_TABLES)[number];

export type SyncAction = 'upsert' | 'delete';

export interface SyncOperation {
  operation_id: string;
  table: SyncTable;
  action: SyncAction;
  local_id: string;
  remote_id?: string | null;
  payload: Record<string, unknown>;
  client_updated_at: string;
  row_version?: number;
}

export interface PushAck {
  operation_id: string;
  table: SyncTable;
  local_id: string;
  remote_id: string;
  updated_at: string;
  row_version: number;
}

export interface PushConflict {
  operation_id: string;
  table: SyncTable;
  local_id: string;
  remote_id: string;
  reason: string;
  server_updated_at: string;
  server_row_version: number;
}

export interface PushFailed {
  operation_id: string;
  table: SyncTable;
  local_id: string;
  remote_id: string | null;
  error: string;
}

export interface PushResult {
  strategy: 'server_authoritative_lww';
  acknowledged: PushAck[];
  conflicts: PushConflict[];
  failed: PushFailed[];
}

const MUTABLE_FIELDS: Record<SyncTable, string[]> = {
  books_master: [
    'title',
    'isbn',
    'category',
    'author',
    'publisher',
    'edition',
    'list_price',
    'created_at',
    'deleted_at',
    'device_id',
    'last_modified_by',
  ],
  book_copies: [
    'book_id',
    'epc_tag',
    'location',
    'status',
    'date_added',
    'deleted_at',
    'device_id',
    'last_modified_by',
  ],
  book_boxes: [
    'book_id',
    'epc_tag',
    'quantity',
    'location',
    'created_at',
    'deleted_at',
    'device_id',
    'last_modified_by',
  ],
  sales: [
    'copy_id',
    'book_id',
    'epc_tag',
    'title',
    'isbn',
    'category',
    'location',
    'price_paid',
    'sold_at',
    'notes',
    'deleted_at',
    'device_id',
    'last_modified_by',
  ],
};

function parseMs(input: string): number {
  const parsed = new Date(input).getTime();
  if (Number.isNaN(parsed)) {
    return Date.now();
  }
  return parsed;
}

function filterPayload(table: SyncTable, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(MUTABLE_FIELDS[table]);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => allowed.has(key))
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readRemoteVersion(table: SyncTable, remoteId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(table)
    .select('id, updated_at, row_version')
    .eq('id', remoteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string; updated_at: string; row_version: number } | null;
}

async function readBookCopyByEpc(epcTag: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('book_copies')
    .select('id')
    .eq('epc_tag', epcTag)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string } | null;
}

async function readBookBoxByEpc(epcTag: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('book_boxes')
    .select('id')
    .eq('epc_tag', epcTag)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string } | null;
}

async function applyUpsert(args: {
  op: SyncOperation;
  deviceId: string;
  result: PushResult;
  localToRemote: Record<SyncTable, Map<string, string>>;
}) {
  const { op, deviceId, result, localToRemote } = args;

  const payload = { ...op.payload };
  let inferredRemoteId: string | null = null;

  if (op.table === 'book_copies') {
    const epcCandidate = typeof payload.epc_tag === 'string'
      ? payload.epc_tag.trim().toUpperCase()
      : '';
    if (epcCandidate) {
      payload.epc_tag = epcCandidate;
      const existingBox = await readBookBoxByEpc(epcCandidate);
      if (existingBox?.id) {
        result.failed.push({
          operation_id: op.operation_id,
          table: op.table,
          local_id: op.local_id,
          remote_id: op.remote_id ?? null,
          error: 'This EPC tag is already assigned to a tagged box.',
        });
        return;
      }
      const existingCopy = await readBookCopyByEpc(epcCandidate);
      if (existingCopy?.id) {
        inferredRemoteId = existingCopy.id;
      }
    }

    const currentBookId = payload.book_id;
    if (!currentBookId && typeof payload.book_local_id === 'string') {
      const resolved = localToRemote.books_master.get(payload.book_local_id);
      if (resolved) {
        payload.book_id = resolved;
      }
    }
  } else if (op.table === 'book_boxes') {
    const epcCandidate = typeof payload.epc_tag === 'string'
      ? payload.epc_tag.trim().toUpperCase()
      : '';
    if (epcCandidate) {
      payload.epc_tag = epcCandidate;
      const existingCopy = await readBookCopyByEpc(epcCandidate);
      if (existingCopy?.id) {
        result.failed.push({
          operation_id: op.operation_id,
          table: op.table,
          local_id: op.local_id,
          remote_id: op.remote_id ?? null,
          error: 'This EPC tag is already assigned to an individual copy.',
        });
        return;
      }
      const existingBox = await readBookBoxByEpc(epcCandidate);
      if (existingBox?.id) {
        inferredRemoteId = existingBox.id;
      }
    }

    const currentBookId = payload.book_id;
    if (!currentBookId && typeof payload.book_local_id === 'string') {
      const resolved = localToRemote.books_master.get(payload.book_local_id);
      if (resolved) {
        payload.book_id = resolved;
      }
    }
  } else if (op.table === 'sales') {
    const currentCopyId = payload.copy_id;
    if (!currentCopyId && typeof payload.copy_local_id === 'string') {
      const resolved = localToRemote.book_copies.get(payload.copy_local_id);
      if (resolved) {
        payload.copy_id = resolved;
      }
    }

    const currentBookId = payload.book_id;
    if (!currentBookId && typeof payload.book_local_id === 'string') {
      const resolved = localToRemote.books_master.get(payload.book_local_id);
      if (resolved) {
        payload.book_id = resolved;
      }
    }
  }

  const mappedRemoteId = localToRemote[op.table].get(op.local_id);
  const remoteId = op.remote_id?.trim()
    || mappedRemoteId
    || inferredRemoteId
    || (isUuid(op.local_id) ? op.local_id : crypto.randomUUID());
  const remoteVersion = await readRemoteVersion(op.table, remoteId);
  const clientMs = parseMs(op.client_updated_at);
  const remoteMs = remoteVersion ? parseMs(remoteVersion.updated_at) : 0;

  if (remoteVersion && remoteMs > clientMs) {
    result.conflicts.push({
      operation_id: op.operation_id,
      table: op.table,
      local_id: op.local_id,
      remote_id: remoteId,
      reason: 'Remote row is newer than local change.',
      server_updated_at: remoteVersion.updated_at,
      server_row_version: remoteVersion.row_version,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const sanitized = filterPayload(op.table, payload);
  const nextRowVersion = (remoteVersion?.row_version ?? 0) + 1;

  const row: Record<string, unknown> = {
    ...sanitized,
    id: remoteId,
    updated_at: nowIso,
    row_version: nextRowVersion,
    last_modified_by: deviceId,
    device_id: deviceId,
  };

  if (!remoteVersion && op.table === 'books_master' && !row.created_at) {
    row.created_at = nowIso;
  }
  if (!remoteVersion && op.table === 'book_copies' && !row.date_added) {
    row.date_added = nowIso;
  }
  if (!remoteVersion && op.table === 'book_boxes' && !row.created_at) {
    row.created_at = nowIso;
  }
  if (!remoteVersion && op.table === 'sales' && !row.sold_at) {
    row.sold_at = nowIso;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(op.table)
    .upsert(row, { onConflict: 'id' })
    .select('id, updated_at, row_version')
    .single();

  if (error || !data) {
    result.failed.push({
      operation_id: op.operation_id,
      table: op.table,
      local_id: op.local_id,
      remote_id: remoteId,
      error: error?.message ?? 'Unknown upsert failure',
    });
    return;
  }

  try {
    await mirrorUpsert(op.table, {
      ...row,
      updated_at: data.updated_at,
      row_version: data.row_version,
    });
  } catch (mirrorError) {
    console.error('MySQL mirror upsert failed', mirrorError);
  }

  result.acknowledged.push({
    operation_id: op.operation_id,
    table: op.table,
    local_id: op.local_id,
    remote_id: data.id,
    updated_at: data.updated_at,
    row_version: data.row_version,
  });

  localToRemote[op.table].set(op.local_id, data.id);
}

async function applyDelete(args: {
  op: SyncOperation;
  deviceId: string;
  result: PushResult;
  localToRemote: Record<SyncTable, Map<string, string>>;
}) {
  const { op, deviceId, result, localToRemote } = args;

  const remoteId = op.remote_id?.trim() || localToRemote[op.table].get(op.local_id);
  if (!remoteId) {
    // Local-only row deleted before ever receiving a remote id.
    // Treat as completed so this operation does not block sync retries.
    result.acknowledged.push({
      operation_id: op.operation_id,
      table: op.table,
      local_id: op.local_id,
      remote_id: op.local_id,
      updated_at: new Date().toISOString(),
      row_version: op.row_version ?? 1,
    });
    return;
  }

  const remoteVersion = await readRemoteVersion(op.table, remoteId);
  if (!remoteVersion) {
    result.acknowledged.push({
      operation_id: op.operation_id,
      table: op.table,
      local_id: op.local_id,
      remote_id: remoteId,
      updated_at: new Date().toISOString(),
      row_version: op.row_version ?? 1,
    });
    return;
  }

  const clientMs = parseMs(op.client_updated_at);
  const remoteMs = parseMs(remoteVersion.updated_at);
  if (remoteMs > clientMs) {
    result.conflicts.push({
      operation_id: op.operation_id,
      table: op.table,
      local_id: op.local_id,
      remote_id: remoteId,
      reason: 'Remote row changed after local delete.',
      server_updated_at: remoteVersion.updated_at,
      server_row_version: remoteVersion.row_version,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const nextVersion = (remoteVersion.row_version ?? 0) + 1;
  const updatePayload: Record<string, unknown> = {
    deleted_at: nowIso,
    updated_at: nowIso,
    row_version: nextVersion,
    last_modified_by: deviceId,
    device_id: deviceId,
  };
  if (op.table === 'book_copies' || op.table === 'book_boxes') {
    updatePayload.epc_tag = `__DELETED__${remoteId}`;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(op.table)
    .update(updatePayload)
    .eq('id', remoteId)
    .select('id, updated_at, row_version')
    .single();

  if (error || !data) {
    result.failed.push({
      operation_id: op.operation_id,
      table: op.table,
      local_id: op.local_id,
      remote_id: remoteId,
      error: error?.message ?? 'Unknown delete failure',
    });
    return;
  }

  try {
    await mirrorSoftDelete(op.table, remoteId, {
      deleted_at: nowIso,
      updated_at: data.updated_at,
      row_version: data.row_version,
      last_modified_by: deviceId,
      device_id: deviceId,
    });
  } catch (mirrorError) {
    console.error('MySQL mirror soft delete failed', mirrorError);
  }

  result.acknowledged.push({
    operation_id: op.operation_id,
    table: op.table,
    local_id: op.local_id,
    remote_id: remoteId,
    updated_at: data.updated_at,
    row_version: data.row_version,
  });

  localToRemote[op.table].set(op.local_id, remoteId);
}

export async function processPush(deviceId: string, operations: SyncOperation[]): Promise<PushResult> {
  const result: PushResult = {
    strategy: 'server_authoritative_lww',
    acknowledged: [],
    conflicts: [],
    failed: [],
  };

  const localToRemote: Record<SyncTable, Map<string, string>> = {
    books_master: new Map<string, string>(),
    book_copies: new Map<string, string>(),
    book_boxes: new Map<string, string>(),
    sales: new Map<string, string>(),
  };

  for (const op of operations) {
    try {
      if (!SUPPORTED_TABLES.includes(op.table)) {
        result.failed.push({
          operation_id: op.operation_id,
          table: op.table,
          local_id: op.local_id,
          remote_id: op.remote_id ?? null,
          error: `Unsupported table: ${op.table}`,
        });
        continue;
      }

      if (op.action === 'upsert') {
        await applyUpsert({ op, deviceId, result, localToRemote });
      } else {
        await applyDelete({ op, deviceId, result, localToRemote });
      }
    } catch (error) {
      result.failed.push({
        operation_id: op.operation_id,
        table: op.table,
        local_id: op.local_id,
        remote_id: op.remote_id ?? null,
        error: error instanceof Error ? error.message : 'Unexpected sync error',
      });
    }
  }

  return result;
}

export async function processPull(checkpoints: Partial<Record<SyncTable, string>>, limit = 1000) {
  const supabase = createAdminClient();
  const changes: Partial<Record<SyncTable, Record<string, unknown>[]>> = {};
  const nextCheckpoints: Partial<Record<SyncTable, string>> = {};

  for (const table of SUPPORTED_TABLES) {
    let query = supabase
      .from(table)
      .select('*')
      .order('updated_at', { ascending: true })
      .limit(limit);

    const checkpoint = checkpoints[table];
    if (checkpoint) {
      query = query.gt('updated_at', checkpoint);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Pull failed for ${table}: ${error.message}`);
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    changes[table] = rows;

    const lastUpdated = rows.length
      ? String(rows[rows.length - 1]?.updated_at ?? checkpoint ?? new Date(0).toISOString())
      : checkpoint ?? new Date(0).toISOString();

    nextCheckpoints[table] = lastUpdated;
  }

  return {
    strategy: 'server_authoritative_lww' as const,
    changes,
    checkpoints: nextCheckpoints,
    server_time: new Date().toISOString(),
  };
}
