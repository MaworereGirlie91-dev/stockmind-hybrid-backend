import { NextRequest, NextResponse } from 'next/server';

import { createAccount, listAccounts, normalizeEmail } from '@/lib/server/accounts';
import { assertItAdminSession } from '@/lib/server/it-admin';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await assertItAdminSession(req);
    const accounts = await listAccounts();
    const response = NextResponse.json({ items: accounts });
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

export async function POST(req: NextRequest) {
  try {
    const session = await assertItAdminSession(req);
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      it_admin?: boolean;
    };

    const email = normalizeEmail(body.email);
    const password = normalizeRequiredText(body.password, 128);
    if (!email || !password) {
      const response = NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const account = await createAccount({
      email,
      password,
      createdBy: session.subject,
      role: body.it_admin === true ? 'admin' : 'sales',
    });

    const response = NextResponse.json({ ok: true, account });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account.';
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

