import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { ensureReferenceName } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';
import {
  normalizeEpc,
  normalizeOptionalText,
  normalizeRequiredText,
} from '@/lib/server/validation';

interface BulkPayload {
  title: string;
  isbn?: string | null;
  category?: string | null;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  list_price?: number | string | null;
  location?: string | null;
  location_type?: string | null;
  location_name?: string | null;
  tags: string[];
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json().catch(() => ({}))) as Partial<BulkPayload>;

    const title = normalizeRequiredText(payload.title, 200);
    const isbn = normalizeOptionalText(payload.isbn, 64);
    const category = normalizeOptionalText(payload.category, 120);
    const author = normalizeOptionalText(payload.author, 200);
    const publisher = normalizeOptionalText(payload.publisher, 200);
    const edition = normalizeOptionalText(payload.edition, 120);
    const listPriceRaw = payload.list_price;
    const numericListPrice =
      typeof listPriceRaw === 'string' ? Number(listPriceRaw.trim()) : Number(listPriceRaw);
    const listPrice =
      listPriceRaw === null ||
      listPriceRaw === undefined ||
      (typeof listPriceRaw === 'string' && listPriceRaw.trim() === '')
        ? null
        : Number.isFinite(numericListPrice) && numericListPrice >= 0
          ? Math.round(numericListPrice * 100) / 100
          : null;
    const parsedLocation = parseLocation({
      location: normalizeOptionalText(payload.location, 120),
      locationType: normalizeOptionalText(payload.location_type, 40),
      locationName: normalizeOptionalText(payload.location_name, 120),
    });

    const rawTags = Array.isArray(payload.tags) ? payload.tags : [];
    if (rawTags.length > 2000) {
      return NextResponse.json({ error: 'Too many tags in one request.' }, { status: 413 });
    }

    const tags = Array.from(
      new Set(
        rawTags
          .map((tag) => normalizeEpc(tag))
          .filter((tag): tag is string => !!tag)
      )
    );

    if (!title) {
      return NextResponse.json({ error: 'Book title is required.' }, { status: 400 });
    }
    if (!tags.length) {
      return NextResponse.json({ error: 'At least one valid EPC tag is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existingBook } = await supabase
      .from('books_master')
      .select('id')
      .eq('title', title)
      .eq('isbn', isbn)
      .is('deleted_at', null)
      .maybeSingle();

    let bookId = existingBook?.id as string | undefined;
    if (!bookId) {
      const now = new Date().toISOString();
      const { data: createdBook, error: bookError } = await supabase
        .from('books_master')
        .insert({
          title,
          isbn,
          category,
          author,
          publisher,
          edition,
          list_price: listPrice,
          created_at: now,
          updated_at: now,
          row_version: 1,
        })
        .select('id')
        .single();

      if (bookError || !createdBook) {
        return NextResponse.json({ error: bookError?.message ?? 'Failed to create book record.' }, { status: 500 });
      }
      bookId = createdBook.id;
    }

    const { data: duplicates, error: duplicateError } = await supabase
      .from('book_copies')
      .select('epc_tag')
      .is('deleted_at', null)
      .in('epc_tag', tags);

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    }

    const duplicateSet = new Set((duplicates ?? []).map((item) => item.epc_tag));
    const { data: duplicateBoxes, error: duplicateBoxesError } = await supabase
      .from('book_boxes')
      .select('epc_tag')
      .is('deleted_at', null)
      .in('epc_tag', tags);

    if (duplicateBoxesError) {
      return NextResponse.json({ error: duplicateBoxesError.message }, { status: 500 });
    }
    for (const row of duplicateBoxes ?? []) {
      duplicateSet.add(row.epc_tag);
    }

    const newTags = tags.filter((tag) => !duplicateSet.has(tag));

    if (!newTags.length) {
      return NextResponse.json({
        ok: true,
        inserted_count: 0,
        skipped_existing: tags.length,
        duplicate_tags: tags,
      });
    }

    const now = new Date().toISOString();
    const rows = newTags.map((epc) => ({
      book_id: bookId,
      epc_tag: epc,
      location: parsedLocation.location,
      status: 'in_stock',
      date_added: now,
      updated_at: now,
      row_version: 1,
    }));

    const { error: insertError } = await supabase.from('book_copies').insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await Promise.all([
      ensureReferenceName('inventory_categories', category),
      ensureReferenceName(
        'inventory_locations',
        parsedLocation.locationName,
        parsedLocation.locationType
      ),
    ]);

    return NextResponse.json({
      ok: true,
      inserted_count: newTags.length,
      skipped_existing: tags.length - newTags.length,
      duplicate_tags: tags.filter((tag) => duplicateSet.has(tag)),
      book_id: bookId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulk insert failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
