import { NextRequest, NextResponse } from 'next/server';

import {
  changeAccountPassword,
  deleteAccount,
  findAccountByEmail,
} from '@/lib/server/accounts';
import { assertItAdminSession } from '@/lib/server/it-admin';
import { isUuid, normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertItAdminSession(req);
    const { id } = await context.params;
    if (!isUuid(id)) {
      const response = NextResponse.json({ error: 'Invalid account id.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      password?: string;
    };
    const password = normalizeRequiredText(body.password, 128);
    if (!password) {
      const response = NextResponse.json({ error: 'New password is required.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    await changeAccountPassword({
      accountId: id,
      newPassword: password,
    });

    const response = NextResponse.json({ ok: true });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to change password.';
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await assertItAdminSession(req);
    const { id } = await context.params;
    if (!isUuid(id)) {
      const response = NextResponse.json({ error: 'Invalid account id.' }, { status: 400 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const current = await findAccountByEmail(session.subject);
    if (current && current.id === id) {
      const response = NextResponse.json(
        { error: 'IT admin cannot delete the currently signed-in account.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    await deleteAccount(id);
    const response = NextResponse.json({ ok: true });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete account.';
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

