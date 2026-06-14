import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const category = (params.get('category') ?? '').trim().toLowerCase();
    const location = (params.get('location') ?? '').trim().toLowerCase();
    const dateFrom = toIsoOrNull(params.get('date_from'));
    const dateTo = toIsoOrNull(params.get('date_to'));

    const supabase = createAdminClient();
    let query = supabase
      .from('sales')
      .select('id, sold_at, title, isbn, category, location, epc_tag, price_paid, notes')
      .is('deleted_at', null)
      .order('sold_at', { ascending: false })
      .limit(MAX_ROWS);

    if (dateFrom) {
      query = query.gte('sold_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('sold_at', dateTo);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const filtered = (data ?? []).filter((row) => {
      const rowCategory = (typeof row.category === 'string' ? row.category : '').trim().toLowerCase();
      if (category && rowCategory !== category) {
        return false;
      }
      const rowLocation = (typeof row.location === 'string' ? row.location : '').trim().toLowerCase();
      if (location && rowLocation !== location) {
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

    const csv = buildCsv(
      ['Date & Time', 'Title', 'ISBN', 'Category', 'Location', 'EPC Tag', 'Price Paid', 'Notes'],
      filtered.map((row) => [
        row.sold_at,
        row.title,
        row.isbn ?? '',
        row.category ?? '',
        row.location ?? '',
        row.epc_tag,
        Number(row.price_paid ?? 0).toFixed(2),
        row.notes ?? '',
      ])
    );

    const datePart = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="stockmind-sales-${datePart}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export sales CSV.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
