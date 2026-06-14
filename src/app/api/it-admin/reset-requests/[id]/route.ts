import { NextRequest, NextResponse } from 'next/server';

import {
  changeAccountPassword,
  findAccountByEmail,
  resolvePasswordResetRequest,
} from '@/lib/server/accounts';
import { assertItAdminSession } from '@/lib/server/it-admin';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid, normalizeOptionalText, normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await assertItAdminSession(req);
    const { id } = await context.params;
    if (!isUuid(id)) {
      const response = NextResponse.json(
        { error: 'Invalid reset request id.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      new_password?: string;
      notes?: string;
    };
    const newPassword = normalizeRequiredText(body.new_password, 128);
    if (!newPassword) {
      const response = NextResponse.json(
        { error: 'New password is required.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const supabase = createAdminClient();
    const { data: requestRow, error: requestError } = await supabase
      .from('password_reset_requests')
      .select('id, email, status')
      .eq('id', id)
      .maybeSingle();

    if (requestError) {
      throw new Error(requestError.message);
    }
    if (!requestRow) {
      const response = NextResponse.json({ error: 'Reset request not found.' }, { status: 404 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    if (requestRow.status === 'completed') {
      const response = NextResponse.json(
        { error: 'This reset request has already been completed.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const account = await findAccountByEmail(requestRow.email);
    if (!account || account.deleted_at || !account.is_active) {
      const response = NextResponse.json(
        { error: 'No active account found for the requested email.' },
        { status: 404 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    await changeAccountPassword({
      accountId: account.id,
      newPassword,
    });

    await resolvePasswordResetRequest({
      requestId: id,
      resolver: session.subject,
      notes: normalizeOptionalText(body.notes, 400),
    });

    const response = NextResponse.json({ ok: true });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resolve reset request.';
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500;
    const response = NextResponse.json({ error: message }, { status });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

