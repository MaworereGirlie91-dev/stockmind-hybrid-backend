import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { buildCsv } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

const MAX_ROWS = 5000;

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
  const candidates = [
    args.location ?? '',
    args.locationType ?? '',
    args.locationName ?? '',
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

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('book_copies')
      .select(
        'id, epc_tag, location, status, date_added, updated_at, books_master(id, title, isbn, category)'
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: boxData, error: boxError } = await supabase
      .from('book_boxes')
      .select(
        'id, epc_tag, quantity, location, created_at, updated_at, books_master(id, title, isbn, category)'
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_ROWS);

    if (boxError) {
      return NextResponse.json({ error: boxError.message }, { status: 500 });
    }

    const copyRows = (data ?? []).map((row) => {
      const master = Array.isArray(row.books_master) ? row.books_master[0] : row.books_master;
      const parsedLocation = parseLocation({
        location: row.location,
      });
      return {
        epc_tag: row.epc_tag,
        location: parsedLocation.location,
        location_type: parsedLocation.locationType,
        location_name: parsedLocation.locationName,
        status: row.status,
        date_added: row.date_added,
        title: master?.title ?? '',
        isbn: master?.isbn ?? '',
        category: master?.category ?? '',
        type: 'Shelved',
        packaging: 'Single Copy',
      };
    });

    const boxedRows = (boxData ?? []).map((row) => {
      const master = Array.isArray(row.books_master) ? row.books_master[0] : row.books_master;
      const parsedLocation = parseLocation({
        location: row.location,
      });
      return {
        epc_tag: row.epc_tag,
        location: parsedLocation.location,
        location_type: parsedLocation.locationType,
        location_name: parsedLocation.locationName,
        status: 'in_stock',
        date_added: row.created_at,
        title: master?.title ?? '',
        isbn: master?.isbn ?? '',
        category: master?.category ?? '',
        type: 'Boxed',
        packaging: 'In Box',
      };
    });

    const rows = [...copyRows, ...boxedRows];

    const filtered = rows.filter((row) => {
      if (status !== 'all' && asString(row.status).toLowerCase() !== status) {
        return false;
      }
      if (category && asString(row.category).toLowerCase() !== category) {
        return false;
      }
      if (
        !locationMatchesFilter({
          filter: location,
          location: row.location,
          locationType: row.location_type,
          locationName: row.location_name,
        })
      ) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = [
        row.epc_tag,
        row.location,
        row.status,
        row.title,
        row.isbn,
        row.category,
        row.type,
        row.packaging,
        row.location_type,
        row.location_name,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    const csv = buildCsv(
      [
        'EPC Tag',
        'Title',
        'ISBN',
        'Category',
        'Location',
        'Type',
        'Packaging',
        'Status',
        'Date Added',
      ],
      filtered.map((row) => [
        row.epc_tag,
        row.title,
        row.isbn,
        row.category,
        row.location,
        row.type,
        row.packaging,
        row.status,
        row.date_added,
      ])
    );

    const datePart = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="stockmind-inventory-${datePart}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export inventory CSV.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
