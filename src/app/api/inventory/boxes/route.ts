import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { ensureReferenceName } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { normalizeEpc, normalizeOptionalText, normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

interface BoxRow {
  epc_tag: string;
  title: string;
  isbn?: string | null;
  category?: string | null;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  list_price?: number | string | null;
  quantity?: number | string | null;
  location?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { boxes?: unknown[] };
    const rawBoxes = Array.isArray(body.boxes) ? body.boxes : [];

    if (!rawBoxes.length) {
      return NextResponse.json({ error: 'At least one box row is required.' }, { status: 400 });
    }
    if (rawBoxes.length > 2000) {
      return NextResponse.json({ error: 'Too many rows in one request.' }, { status: 413 });
    }

    const supabase = createAdminClient();
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const raw of rawBoxes) {
      const row = raw as Partial<BoxRow>;

      const epc = normalizeEpc(row.epc_tag);
      const title = normalizeRequiredText(row.title, 200);

      if (!epc || !title) {
        skipped += 1;
        continue;
      }

      const isbn = normalizeOptionalText(row.isbn, 64);
      const category = normalizeOptionalText(row.category, 120);
      const author = normalizeOptionalText(row.author, 200);
      const publisher = normalizeOptionalText(row.publisher, 200);
      const edition = normalizeOptionalText(row.edition, 120);

      const listPriceRaw = row.list_price;
      const numericListPrice =
        typeof listPriceRaw === 'string' ? Number(listPriceRaw.trim()) : Number(listPriceRaw);
      const listPrice =
        listPriceRaw === null || listPriceRaw === undefined ||
        (typeof listPriceRaw === 'string' && !listPriceRaw.trim())
          ? null
          : Number.isFinite(numericListPrice) && numericListPrice >= 0
            ? Math.round(numericListPrice * 100) / 100
            : null;

      const quantityRaw = row.quantity;
      const numericQty =
        typeof quantityRaw === 'string' ? Number(quantityRaw.trim()) : Number(quantityRaw);
      const quantity =
        quantityRaw === null || quantityRaw === undefined ||
        (typeof quantityRaw === 'string' && !quantityRaw.trim())
          ? 1
          : Number.isFinite(numericQty) && numericQty > 0
            ? Math.round(numericQty)
            : 1;

      const parsedLocation = parseLocation({ location: normalizeOptionalText(row.location, 120) });

      const { data: existingCopy } = await supabase
        .from('book_copies').select('id').eq('epc_tag', epc).is('deleted_at', null).maybeSingle();
      const { data: existingBox } = await supabase
        .from('book_boxes').select('id').eq('epc_tag', epc).is('deleted_at', null).maybeSingle();

      if (existingCopy || existingBox) {
        skipped += 1;
        continue;
      }

      const { data: existingBook } = await supabase
        .from('books_master').select('id').eq('title', title).eq('isbn', isbn).is('deleted_at', null).maybeSingle();

      let bookId = existingBook?.id as string | undefined;
      if (!bookId) {
        const now = new Date().toISOString();
        const { data: createdBook, error: bookError } = await supabase
          .from('books_master')
          .insert({ title, isbn, category, author, publisher, edition, list_price: listPrice, created_at: now, updated_at: now, row_version: 1 })
          .select('id')
          .single();

        if (bookError || !createdBook) {
          errors.push(`${epc}: ${bookError?.message ?? 'Failed to create book record'}`);
          continue;
        }
        bookId = createdBook.id;
      }

      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from('book_boxes').insert({
        book_id: bookId,
        epc_tag: epc,
        quantity,
        location: parsedLocation.location,
        location_type: parsedLocation.locationType ?? null,
        location_name: parsedLocation.locationName ?? null,
        created_at: now,
        updated_at: now,
        row_version: 1,
      });

      if (insertError) {
        errors.push(`${epc}: ${insertError.message}`);
        continue;
      }

      inserted += 1;
      await Promise.all([
        ensureReferenceName('inventory_categories', category),
        ensureReferenceName('inventory_locations', parsedLocation.locationName, parsedLocation.locationType),
      ]);
    }

    return NextResponse.json({ ok: true, inserted, skipped, errors: errors.slice(0, 20) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Box import failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
