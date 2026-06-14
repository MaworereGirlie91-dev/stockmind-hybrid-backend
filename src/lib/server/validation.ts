const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const EPC_PATTERN = /^[A-Z0-9:_-]{4,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || CONTROL_CHARS.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLength || CONTROL_CHARS.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function normalizeEpc(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const epc = value.trim().toUpperCase();
  if (!EPC_PATTERN.test(epc)) {
    return null;
  }
  return epc;
}

export function normalizeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) {
    return null;
  }
  const ms = new Date(trimmed).getTime();
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
