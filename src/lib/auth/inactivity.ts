export const SESSION_ACTIVITY_COOKIE_NAME = 'sm_last_activity';
export const SESSION_INACTIVITY_TIMEOUT_MS = 40_000;

export function currentActivityValue(now = Date.now()): string {
  return String(now);
}

export function isActivityExpired(raw: string | undefined, now = Date.now()): boolean {
  if (!raw) {
    return true;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return true;
  }

  return now - parsed > SESSION_INACTIVITY_TIMEOUT_MS;
}
