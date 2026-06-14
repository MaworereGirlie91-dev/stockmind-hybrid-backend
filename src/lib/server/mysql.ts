import { readOptionalEnv } from '@/lib/server/env';

const TABLE_MAP = {
  books_master: 'sync_books_master',
  book_copies: 'sync_book_copies',
  book_boxes: 'sync_book_boxes',
  sales: 'sync_sales',
} as const;

type SyncTable = keyof typeof TABLE_MAP;
type Pool = import('mysql2/promise').Pool;
type CreatePoolFn = (config: Record<string, unknown>) => Pool;
type SqlValue = string | number | bigint | boolean | Date | null | Uint8Array;

let pool: Pool | null | undefined;
let poolInitPromise: Promise<Pool | null> | null = null;

function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  return JSON.stringify(value);
}

async function resolvePool(): Promise<Pool | null> {
  if (pool !== undefined) {
    return pool;
  }

  if (poolInitPromise) {
    return poolInitPromise;
  }

  const url = readOptionalEnv('MYSQL_URL');
  if (!url) {
    pool = null;
    return pool;
  }

  poolInitPromise = (async () => {
    try {
      const mysql = await import('mysql2/promise');
      const createPool = (
        mysql as { createPool?: CreatePoolFn; default?: { createPool?: CreatePoolFn } }
      ).createPool ?? (
        mysql as { createPool?: CreatePoolFn; default?: { createPool?: CreatePoolFn } }
      ).default?.createPool;

      if (!createPool) {
        throw new Error('mysql2 createPool is unavailable.');
      }

      pool = createPool({
        uri: url,
        waitForConnections: true,
        connectionLimit: 6,
        queueLimit: 0,
      });

      return pool;
    } catch (error) {
      console.error('MySQL pool initialization failed', error);
      pool = null;
      return null;
    } finally {
      poolInitPromise = null;
    }
  })();

  return poolInitPromise;
}

export async function mirrorUpsert(table: SyncTable, row: Record<string, unknown>) {
  const db = await resolvePool();
  if (!db) {
    return;
  }

  const tableName = TABLE_MAP[table];
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return;
  }

  const columns = entries.map(([key]) => `\`${key}\``);
  const values: SqlValue[] = entries.map(([, value]) => toSqlValue(value));

  const updates = entries
    .filter(([key]) => key !== 'id')
    .map(([key]) => `\`${key}\` = VALUES(\`${key}\`)`);

  const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updates.join(', ') || '`id` = VALUES(`id`)'} `;

  await db.execute(sql, values);
}

export async function mirrorSoftDelete(table: SyncTable, id: string, metadata: {
  deleted_at: string;
  updated_at: string;
  row_version: number;
  last_modified_by: string;
  device_id: string;
}) {
  const db = await resolvePool();
  if (!db) {
    return;
  }

  const tableName = TABLE_MAP[table];
  await db.execute(
    `UPDATE ${tableName} SET deleted_at = ?, updated_at = ?, row_version = ?, last_modified_by = ?, device_id = ? WHERE id = ?`,
    [
      metadata.deleted_at,
      metadata.updated_at,
      metadata.row_version,
      metadata.last_modified_by,
      metadata.device_id,
      id,
    ]
  );
}
