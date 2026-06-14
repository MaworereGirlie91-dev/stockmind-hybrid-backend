import { NextRequest, NextResponse } from 'next/server';

import { composeLocation, parseLocation, normalizeLocationType } from '@/lib/location';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { normalizeReferenceName } from '@/lib/server/reference-data';

export const runtime = 'nodejs';

function usageKey(locationType: string | null, name: string | null): string | null {
  const normalizedName = name?.trim();
  if (!normalizedName) {
    return null;
  }
  const normalizedType = normalizeLocationType(locationType) ?? 'shelf';
  return `${normalizedType}::${normalizedName}`.toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const includeDeleted = req.nextUrl.searchParams.get('include_deleted') === 'true';
    const supabase = createAdminClient();

    let locationsQuery = supabase
      .from('inventory_locations')
      .select('id, name, created_at, updated_at, deleted_at')
      .order('name', { ascending: true });

    if (!includeDeleted) {
      locationsQuery = locationsQuery.is('deleted_at', null);
    }

    const [
      { data: locations, error: locationsError },
      { data: copies, error: copiesError },
      { data: boxes, error: boxesError },
    ] = await Promise.all([
      locationsQuery,
      supabase
        .from('book_copies')
        .select('location')
        .is('deleted_at', null)
        .not('location', 'is', null),
      supabase
        .from('book_boxes')
        .select('location')
        .is('deleted_at', null)
        .not('location', 'is', null),
    ]);

    if (locationsError) {
      return NextResponse.json({ error: locationsError.message }, { status: 500 });
    }
    if (copiesError) {
      return NextResponse.json({ error: copiesError.message }, { status: 500 });
    }
    if (boxesError) {
      return NextResponse.json({ error: boxesError.message }, { status: 500 });
    }

    const usageMap = new Map<string, number>();
    const countUsage = (row: { location?: unknown }) => {
      const parsed = parseLocation({ location: row.location });
      const key = usageKey(parsed.locationType, parsed.locationName);
      if (!key) {
        return;
      }
      usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
    };
    for (const row of copies ?? []) {
      countUsage(row);
    }
    for (const row of boxes ?? []) {
      countUsage(row);
    }

    const items = (locations ?? []).map((row) => {
      const parsedLocation = parseLocation({ location: row.name });
      const key = usageKey(
        parsedLocation.locationType,
        parsedLocation.locationName ?? row.name
      );
      return {
        ...row,
        location_type: normalizeLocationType(parsedLocation.locationType) ?? 'shelf',
        name: parsedLocation.locationName ?? row.name,
        usage_count: key ? usageMap.get(key) ?? 0 : 0,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch locations.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      location_type?: unknown;
    };
    const name = normalizeReferenceName(body.name);
    const locationType = normalizeLocationType(body.location_type) ?? 'shelf';
    if (!name) {
      return NextResponse.json({ error: 'Location name is required.' }, { status: 400 });
    }

    const locationLabel = composeLocation({
      locationType,
      locationName: name,
      fallbackLocation: name,
    }) ?? name;

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('inventory_locations')
      .insert({
        name: locationLabel,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .select('id, name, created_at, updated_at, deleted_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Location already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const parsedDataLocation = parseLocation({ location: data.name });
    return NextResponse.json(
      {
        item: {
          ...data,
          location_type: normalizeLocationType(parsedDataLocation.locationType) ?? 'shelf',
          name: parsedDataLocation.locationName ?? data.name,
          usage_count: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create location.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
