import { createBrowserClient } from '@supabase/ssr';

type AppClient = ReturnType<typeof createBrowserClient>;

let cachedClient: AppClient | null = null;

function readPublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required public environment variable: ${name}`);
  }
  return value;
}

const SUPABASE_OPTS = { db: { schema: 'stockmind' } } as const;

export const createClient = (): AppClient => {
  const url = readPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey, SUPABASE_OPTS);
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient(url, anonKey, SUPABASE_OPTS);
  }

  return cachedClient;
};
