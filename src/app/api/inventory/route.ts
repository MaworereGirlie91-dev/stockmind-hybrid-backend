import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { createAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_SCAN_ROWS = 5000;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function locationMatchesFilter(args: {
  filter: string;
  location: string | null;
  locationType: string | null;
  locationName: string | null;
}): boolean {
  if (!args.filter) {
    return true;
  }
  const filter = normalizeKey(args.filter);
  if (!filter) {
    return true;
  }
  const candidates = [
    args.location ?? '',
    args.locationName ?? '',
    args.locationType ?? '',
  ].map((value) => normalizeKey(value));
  return candidates.some((candidate) => candidate === filter || candidate.includes(filter));
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const status = (params.get('status') ?? 'all').trim().toLowerCase();
    const category = (params.get('category') ?? '').trim().toLowerCase();
    const location = (params.get('location') ?? '').trim().toLowerCase();
    const page = parsePositiveInt(params.get('page'), 1);
    const pageSize = Math.min(
      parsePositiveInt(params.get('page_size'), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('book_copies')
      .select(
        'id, book_id, epc_tag, location, status, date_added, updated_at, deleted_at, row_version, books_master(id, title, isbn, category, author, publisher, edition, list_price, deleted_at)'
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_SCAN_ROWS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: boxData, error: boxError } = await supabase
      .from('book_boxes')
      .select(
        'id, book_id, epc_tag, quantity, location, created_at, updated_at, deleted_at, row_version, books_master(id, title, isbn, category, author, publisher, edition, list_price, deleted_at)'
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_SCAN_ROWS);

    if (boxError) {
      return NextResponse.json({ error: boxError.message }, { status: 500 });
    }

    const rows = (data ?? []).map((row) => {
      const master = Array.isArray(row.books_master) ? row.books_master[0] : row.books_master;
      const parsedLocation = parseLocation({
        location: row.location,
      });
      return {
        id: row.id,
        book_id: row.book_id,
        epc_tag: row.epc_tag,
        location: parsedLocation.location,
        location_type: parsedLocation.locationType,
        location_name: parsedLocation.locationName,
        status: row.status,
        date_added: row.date_added,
        updated_at: row.updated_at,
        row_version: row.row_version,
        book: master
          ? {
              id: master.id,
              title: master.title,
              isbn: master.isbn,
              category: master.category,
              author: master.author,
              publisher: master.publisher,
              edition: master.edition,
              list_price: master.list_price,
            }
          : null,
      };
    });

    const boxRows = (boxData ?? []).map((row) => {
      const master = Array.isArray(row.books_master) ? row.books_master[0] : row.books_master;
      const parsedLocation = parseLocation({
        location: row.location,
      });
      return {
        id: row.id,
        book_id: row.book_id,
        epc_tag: row.epc_tag,
        quantity: row.quantity,
        location: parsedLocation.location,
        location_type: parsedLocation.locationType,
        location_name: parsedLocation.locationName,
        created_at: row.created_at,
        updated_at: row.updated_at,
        row_version: row.row_version,
        book: master
          ? {
              id: master.id,
              title: master.title,
              isbn: master.isbn,
              category: master.category,
              author: master.author,
              publisher: master.publisher,
              edition: master.edition,
              list_price: master.list_price,
            }
          : null,
      };
    });

    const filtered = rows.filter((row) => {
      const rowStatus = asString(row.status).toLowerCase();
      if (status && status !== 'all' && rowStatus !== status) {
        return false;
      }

      const rowCategory = asString(row.book?.category).trim().toLowerCase();
      if (category && rowCategory !== category) {
        return false;
      }

      if (
        !locationMatchesFilter({
          filter: location,
          location: asString(row.location),
          locationType: asString(row.location_type),
          locationName: asString(row.location_name),
        })
      ) {
        return false;
      }

      if (!q) {
        return true;
      }

      const haystack = [
        asString(row.epc_tag),
        asString(row.location),
        asString(row.location_type),
        asString(row.location_name),
        asString(row.book?.title),
        asString(row.book?.isbn),
        asString(row.book?.category),
        asString(row.book?.author),
        asString(row.book?.publisher),
        asString(row.book?.edition),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });

    const filteredBoxes = boxRows.filter((row) => {
      if (status && status !== 'all' && status !== 'in_stock') {
        return false;
      }

      const rowCategory = asString(row.book?.category).trim().toLowerCase();
      if (category && rowCategory !== category) {
        return false;
      }

      if (
        !locationMatchesFilter({
          filter: location,
          location: asString(row.location),
          locationType: asString(row.location_type),
          locationName: asString(row.location_name),
        })
      ) {
        return false;
      }

      if (!q) {
        return true;
      }

      const haystack = [
        asString(row.epc_tag),
        asString(row.location),
        asString(row.location_type),
        asString(row.location_name),
        asString(row.book?.title),
        asString(row.book?.isbn),
        asString(row.book?.category),
        asString(row.book?.author),
        asString(row.book?.publisher),
        asString(row.book?.edition),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    const boxQuantityTotal = filteredBoxes.reduce(
      (sum, row) => sum + (typeof row.quantity === 'number' ? row.quantity : 0),
      0
    );

    return NextResponse.json({
      items,
      box_items: filteredBoxes,
      box_total: filteredBoxes.length,
      box_quantity_total: boxQuantityTotal,
      page: safePage,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load inventory.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
