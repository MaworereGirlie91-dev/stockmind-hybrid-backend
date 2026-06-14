import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

function readPublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required public environment variable: ${name}`);
  }
  return value;
}

export const createClient = (): SupabaseClient => {
  const url = readPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const opts = { db: { schema: 'stockmind' } };

  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey, opts);
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient(url, anonKey, opts);
  }

  return cachedClient;
};
