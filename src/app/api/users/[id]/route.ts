import { NextRequest, NextResponse } from 'next/server';

import { requireAdminSession } from '@/lib/server/auth-guard';
import { updateAccountRole, deleteAccount, changeAccountPassword, idNumberToPassword } from '@/lib/server/accounts';
import type { AppRole } from '@/lib/server/accounts';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as {
      role?: string;
      isActive?: boolean;
      newPassword?: string;
      idNumber?: string;
    };

    // Password reset by admin
    if (body.idNumber || body.newPassword) {
      const pw = body.idNumber ? idNumberToPassword(body.idNumber) : body.newPassword!;
      await changeAccountPassword({ accountId: id, newPassword: pw, clearMustChange: false });
      return NextResponse.json({ ok: true, resetPassword: pw });
    }

    const role: AppRole = body.role === 'sales' ? 'sales' : 'admin';
    const account = await updateAccountRole({ accountId: id, role, isActive: body.isActive });
    return NextResponse.json({ ok: true, account });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await params;
    await deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}
