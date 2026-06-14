import { NextRequest, NextResponse } from 'next/server';

import { requireWebSession } from '@/lib/server/auth-guard';
import { findAccountByUsername, updateProfile } from '@/lib/server/accounts';
import { USER_INFO_COOKIE_NAME, encodeUserInfo } from '@/lib/server/auth';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { isProd, sessionDurationSeconds } from '@/lib/server/env';

export const runtime = 'nodejs';

/** PUT — update display name, username, avatar URL */
export async function PUT(req: NextRequest) {
  try {
    const claims = await requireWebSession();
    const account = await findAccountByUsername(claims.sub);
    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      displayName?: string | null;
      username?: string;
      avatarUrl?: string | null;
    };

    const updated = await updateProfile({
      accountId: account.id,
      displayName: body.displayName,
      username: body.username,
      avatarUrl: body.avatarUrl,
    });

    const response = NextResponse.json({ ok: true, account: updated });
    // Refresh the user info cookie with updated values
    const ttl = sessionDurationSeconds();
    response.cookies.set(
      USER_INFO_COOKIE_NAME,
      encodeUserInfo({
        sub: updated.username,
        role: updated.role,
        displayName: updated.display_name,
        avatarUrl: updated.avatar_url,
      }),
      { httpOnly: false, secure: isProd(), sameSite: 'lax', path: '/', maxAge: ttl }
    );
    return response;
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}

/** POST — upload avatar to Supabase storage */
export async function POST(req: NextRequest) {
  try {
    const claims = await requireWebSession();
    const account = await findAccountByUsername(claims.sub);
    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;
    if (!file || !file.size) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 2 MB.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = createAdminClient();
    const bucket = 'stockmind-avatars';

    // Ensure bucket exists
    await supabase.storage.createBucket(bucket, { public: true }).catch(() => {});

    const path = `${account.id}.${ext}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);

    // Save URL to profile
    const updated = await updateProfile({ accountId: account.id, avatarUrl: publicUrl });

    const response = NextResponse.json({ ok: true, url: publicUrl });
    const ttl = sessionDurationSeconds();
    response.cookies.set(
      USER_INFO_COOKIE_NAME,
      encodeUserInfo({
        sub: updated.username,
        role: updated.role,
        displayName: updated.display_name,
        avatarUrl: updated.avatar_url,
      }),
      { httpOnly: false, secure: isProd(), sameSite: 'lax', path: '/', maxAge: ttl }
    );
    return response;
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status });
  }
}
