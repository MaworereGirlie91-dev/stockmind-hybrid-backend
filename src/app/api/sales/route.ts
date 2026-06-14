import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid, normalizeOptionalText } from '@/lib/server/validation';

interface SalesItemInput {
  copy_id: string;
  price_paid: number;
  notes?: string | null;
}

interface SalesPayload {
  items: SalesItemInput[];
  notes?: string | null;
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json().catch(() => ({}))) as Partial<SalesPayload>;

    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    if (rawItems.length > 500) {
      return NextResponse.json({ error: 'Too many sale items in one request.' }, { status: 413 });
    }

    const parentNotes = normalizeOptionalText(payload.notes, 1000);

    const items = rawItems
      .map((item) => ({
        copy_id: String(item.copy_id ?? '').trim(),
        price_paid: Number(item.price_paid),
        notes: normalizeOptionalText(item.notes, 1000),
      }))
      .filter(
        (item) =>
          item.copy_id &&
          isUuid(item.copy_id) &&
          Number.isFinite(item.price_paid) &&
          item.price_paid >= 0
      );

    if (!items.length) {
      return NextResponse.json({ error: 'At least one valid sale item is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const copyIds = items.map((item) => item.copy_id);

    const { data: copies, error: copyError } = await supabase
      .from('book_copies')
      .select('id, book_id, epc_tag, location, status, books_master(title, isbn, category)')
      .in('id', copyIds)
      .eq('deleted_at', null);

    if (copyError) {
      return NextResponse.json({ error: copyError.message }, { status: 500 });
    }

    const copyMap = new Map((copies ?? []).map((copy) => [copy.id, copy]));
    const now = new Date().toISOString();

    const salesRows: Record<string, unknown>[] = [];
    for (const item of items) {
      const copy = copyMap.get(item.copy_id);
      if (!copy) {
        return NextResponse.json({ error: `Copy not found: ${item.copy_id}` }, { status: 404 });
      }
      if (copy.status !== 'in_stock') {
        return NextResponse.json({ error: `Copy is not available for sale: ${copy.epc_tag}` }, { status: 409 });
      }

      const master = Array.isArray(copy.books_master) ? copy.books_master[0] : copy.books_master;
      salesRows.push({
        copy_id: copy.id,
        book_id: copy.book_id,
        epc_tag: copy.epc_tag,
        title: master?.title ?? 'Unknown',
        isbn: master?.isbn ?? null,
        category: master?.category ?? null,
        location: copy.location ?? null,
        price_paid: item.price_paid,
        sold_at: now,
        notes: item.notes || parentNotes,
        updated_at: now,
        row_version: 1,
      });
    }

    const { error: saleInsertError } = await supabase.from('sales').insert(salesRows);
    if (saleInsertError) {
      return NextResponse.json({ error: saleInsertError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from('book_copies')
      .update({
        status: 'checked_out',
        updated_at: now,
      })
      .in('id', copyIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sold_count: salesRows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record sale.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
