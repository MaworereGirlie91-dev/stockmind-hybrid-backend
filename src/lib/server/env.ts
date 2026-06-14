type RequiredEnvName =
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'ADMIN_USERNAME'
  | 'ADMIN_PASSWORD'
  | 'LOGIN_SECRET'
  | 'SYNC_API_TOKEN'
  | 'IT_ADMIN_SECRET_KEY';

export function readRequiredEnv(name: RequiredEnvName): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function readOptionalEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return fallback;
  }
  return value;
}

export function sessionDurationSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS;
  if (!raw) {
    return 60 * 60 * 24 * 7;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60 * 60 * 24 * 7;
  }
  return Math.floor(parsed);
}

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}
