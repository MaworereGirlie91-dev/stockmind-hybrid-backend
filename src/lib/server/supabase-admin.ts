import { createClient } from '@supabase/supabase-js';

import { readRequiredEnv } from '@/lib/server/env';

export function createAdminClient() {
  const url = readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
