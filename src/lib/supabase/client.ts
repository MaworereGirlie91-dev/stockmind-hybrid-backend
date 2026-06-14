import { createBrowserClient } from '@supabase/ssr';

type AppClient = ReturnType<typeof createBrowserClient>;

let cachedClient: AppClient | null = null;

const SUPABASE_OPTS = { db: { schema: 'stockmind' } } as const;

export const createClient = (): AppClient => {
  // Must use static property access — webpack can only inline process.env.NEXT_PUBLIC_*
  // when the key is a string literal, not a variable (process.env[varName] stays undefined).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !url.trim()) {
    throw new Error('Missing required public environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!anonKey || !anonKey.trim()) {
    throw new Error('Missing required public environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey, SUPABASE_OPTS);
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient(url, anonKey, SUPABASE_OPTS);
  }

  return cachedClient;
};
