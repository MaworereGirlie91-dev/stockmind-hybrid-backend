import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { ensureReferenceName } from '@/lib/server/reference-data';
import {
  normalizeEpc,
  normalizeOptionalText,
  normalizeRequiredText,
} from '@/lib/server/validation';

interface SingleAddPayload {
  epc: string;
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
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json().catch(() => ({}))) as Partial<SingleAddPayload>;

    const epc = normalizeEpc(payload.epc);
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

    if (!epc || !title) {
      return NextResponse.json({ error: 'EPC and title are required.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: duplicate, error: duplicateError } = await supabase
      .from('book_copies')
      .select('id')
      .eq('epc_tag', epc)
      .is('deleted_at', null)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    }
    if (duplicate) {
      return NextResponse.json({ error: 'This EPC tag already exists.' }, { status: 409 });
    }

    const { data: duplicateBox, error: duplicateBoxError } = await supabase
      .from('book_boxes')
      .select('id')
      .eq('epc_tag', epc)
      .is('deleted_at', null)
      .maybeSingle();

    if (duplicateBoxError) {
      return NextResponse.json({ error: duplicateBoxError.message }, { status: 500 });
    }
    if (duplicateBox) {
      return NextResponse.json(
        { error: 'This EPC tag already exists as a tagged box.' },
        { status: 409 }
      );
    }

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
        return NextResponse.json({ error: bookError?.message ?? 'Failed to create book.' }, { status: 500 });
      }
      bookId = createdBook.id;
    }

    const now = new Date().toISOString();
    const { data: createdCopy, error: copyError } = await supabase
      .from('book_copies')
      .insert({
        book_id: bookId,
        epc_tag: epc,
        location: parsedLocation.location,
        status: 'in_stock',
        date_added: now,
        updated_at: now,
        row_version: 1,
      })
      .select('id, epc_tag')
      .single();

    if (copyError || !createdCopy) {
      return NextResponse.json({ error: copyError?.message ?? 'Failed to create copy.' }, { status: 500 });
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
      copy_id: createdCopy.id,
      epc_tag: createdCopy.epc_tag,
      book_id: bookId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save inventory item.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
