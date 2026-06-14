import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { buildCsv } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

const MAX_ROWS = 5000;

function toIsoOrNull(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
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
    const dateFrom = toIsoOrNull(params.get('date_from'));
    const dateTo = toIsoOrNull(params.get('date_to'));

    const supabase = createAdminClient();

    let salesQuery = supabase
      .from('sales')
      .select('id, sold_at, title, isbn, category, location, epc_tag, price_paid, notes, updated_at')
      .is('deleted_at', null)
      .order('sold_at', { ascending: false })
      .limit(MAX_ROWS);

    if (dateFrom) {
      salesQuery = salesQuery.gte('sold_at', dateFrom);
    }
    if (dateTo) {
      salesQuery = salesQuery.lte('sold_at', dateTo);
    }

    const inventoryQuery = supabase
      .from('book_copies')
      .select(
        'id, epc_tag, location, status, date_added, updated_at, books_master(id, title, isbn, category)'
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_ROWS);

    const boxQuery = supabase
      .from('book_boxes')
      .select(
        'id, epc_tag, quantity, location, created_at, updated_at, books_master(id, title, isbn, category)'
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_ROWS);

    const [
      { data: salesData, error: salesError },
      { data: inventoryData, error: inventoryError },
      { data: boxData, error: boxError },
    ] = await Promise.all([salesQuery, inventoryQuery, boxQuery]);

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }
    if (inventoryError) {
      return NextResponse.json({ error: inventoryError.message }, { status: 500 });
    }
    if (boxError) {
      return NextResponse.json({ error: boxError.message }, { status: 500 });
    }

    const salesRows = (salesData ?? []).filter((row) => {
      const rowCategory = asString(row.category).trim().toLowerCase();
      if (category && rowCategory !== category) {
        return false;
      }
      if (
        !locationMatchesFilter({
          filter: location,
          location: asString(row.location) || null,
          locationType: null,
          locationName: null,
        })
      ) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = [
        row.title,
        row.isbn,
        row.category,
        row.location,
        row.epc_tag,
        row.notes,
      ]
        .map((item) => (item === null || item === undefined ? '' : String(item)))
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    const inventoryRows = (inventoryData ?? [])
      .map((row) => {
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
          updated_at: row.updated_at,
          title: master?.title ?? '',
          isbn: master?.isbn ?? '',
          category: master?.category ?? '',
        };
      })
      .filter((row) => {
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
          row.location_type,
          row.location_name,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });

    const inventoryBoxRows = (boxData ?? [])
      .map((row) => {
        const master = Array.isArray(row.books_master) ? row.books_master[0] : row.books_master;
        const parsedLocation = parseLocation({
          location: row.location,
        });
        return {
          epc_tag: row.epc_tag,
          quantity: Number(row.quantity ?? 1),
          location: parsedLocation.location,
          location_type: parsedLocation.locationType,
          location_name: parsedLocation.locationName,
          status: 'in_stock',
          date_added: row.created_at,
          updated_at: row.updated_at,
          title: master?.title ?? '',
          isbn: master?.isbn ?? '',
          category: master?.category ?? '',
        };
      })
      .filter((row) => {
        if (status !== 'all' && status !== 'in_stock') {
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
          row.location_type,
          row.location_name,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });

    const csv = buildCsv(
      [
        'Record Type',
        'Date & Time',
        'Title',
        'ISBN',
        'Category',
        'Location',
        'EPC Tag',
        'Status',
        'Price Paid',
        'Notes',
        'Date Added (Date & Time)',
        'Last Updated (Date & Time)',
      ],
      [
        ...salesRows.map((row) => [
          'sale',
          row.sold_at,
          row.title,
          row.isbn ?? '',
          row.category ?? '',
          row.location ?? '',
          row.epc_tag,
          'sold',
          Number(row.price_paid ?? 0).toFixed(2),
          row.notes ?? '',
          '',
          row.updated_at ?? row.sold_at,
        ]),
        ...inventoryRows.map((row) => [
          'inventory',
          row.updated_at,
          row.title,
          row.isbn,
          row.category,
          row.location,
          row.epc_tag,
          row.status,
          '',
          '',
          row.date_added,
          row.updated_at,
        ]),
        ...inventoryBoxRows.map((row) => [
          'inventory_box',
          row.updated_at,
          row.title,
          row.isbn,
          row.category,
          row.location,
          row.epc_tag,
          `boxed_${row.status} (${row.quantity})`,
          '',
          '',
          row.date_added,
          row.updated_at,
        ]),
      ]
    );

    const datePart = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="stockmind-full-report-${datePart}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export full report CSV.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
