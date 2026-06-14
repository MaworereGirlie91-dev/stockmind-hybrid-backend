import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };

    if (body.confirm !== 'CLEAR_ALL_BOXES') {
      return NextResponse.json(
        { error: 'Confirm token required. Send { confirm: "CLEAR_ALL_BOXES" }.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { count, error: countError } = await supabase
      .from('book_boxes')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const { error } = await supabase
      .from('book_boxes')
      .update({ deleted_at: now, updated_at: now })
      .is('deleted_at', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to clear box tags.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
