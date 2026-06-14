import { NextRequest, NextResponse } from 'next/server';

import { requireAdminSession } from '@/lib/server/auth-guard';
import { createAccount, idNumberToPassword, listAccounts } from '@/lib/server/accounts';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdminSession();
    const accounts = await listAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const claims = await requireAdminSession();

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      idNumber?: string;
      displayName?: string;
      role?: string;
    };

    const email = body.email?.trim() ?? '';
    const idNumber = body.idNumber?.trim() ?? '';
    const displayName = normalizeRequiredText(body.displayName, 80) ?? '';
    const role = body.role === 'sales' ? 'sales' : 'admin';

    if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    if (!idNumber) return NextResponse.json({ error: 'ID number is required.' }, { status: 400 });
    if (!displayName) return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });

    const generatedPassword = idNumberToPassword(idNumber);
    if (generatedPassword.length < 4) {
      return NextResponse.json({ error: 'ID number is too short to generate a secure password.' }, { status: 400 });
    }

    const account = await createAccount({
      email,
      password: generatedPassword,
      createdBy: claims.sub,
      role,
      username: email, // default username = email
      displayName: displayName || undefined,
      mustChangePassword: true,
    });

    return NextResponse.json({
      ok: true,
      account,
      generatedPassword, // shown once to the admin so they can share it
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}
