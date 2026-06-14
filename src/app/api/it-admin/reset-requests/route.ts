import { NextRequest, NextResponse } from 'next/server';

import { assertItAdminSession } from '@/lib/server/it-admin';
import { listPasswordResetRequests } from '@/lib/server/accounts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await assertItAdminSession(req);
    const requests = await listPasswordResetRequests(200);
    const response = NextResponse.json({ items: requests });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status = message === 'Forbidden' ? 403 : 401;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

