import { createAdminClient } from '@/lib/server/supabase-admin';
import { composeLocation } from '@/lib/location';
import { normalizeOptionalText } from '@/lib/server/validation';

export type ReferenceTable = 'inventory_categories' | 'inventory_locations';

export function normalizeReferenceName(value: unknown): string | null {
  return normalizeOptionalText(value, 120);
}

export async function ensureReferenceName(
  table: ReferenceTable,
  value: string | null | undefined,
  locationType?: string | null
): Promise<void> {
  const normalized = normalizeReferenceName(value);
  if (!normalized) {
    return;
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const locationValue =
    table === 'inventory_locations'
      ? composeLocation({ locationType, locationName: normalized, fallbackLocation: normalized }) ??
        normalized
      : normalized;

  const row: Record<string, unknown> = {
    name: locationValue,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  const { error } = await supabase.from(table).insert(row);

  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }
}

export function normalizeDeleteMode(value: unknown): 'soft' | 'hard' {
  return value === 'hard' ? 'hard' : 'soft';
}

export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const output = [headers.map((header) => sanitizeCsvCell(header)).join(',')];
  for (const row of rows) {
    output.push(row.map((cell) => sanitizeCsvCell(cell)).join(','));
  }
  return output.join('\n');
}
