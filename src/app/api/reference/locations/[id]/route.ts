import { NextRequest, NextResponse } from 'next/server';

import { composeLocation, normalizeLocationType, parseLocation } from '@/lib/location';
import { normalizeDeleteMode, normalizeReferenceName } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid } from '@/lib/server/validation';

export const runtime = 'nodejs';

function usageKey(locationType: string | null, locationName: string | null): string | null {
  const normalizedName = locationName?.trim();
  if (!normalizedName) {
    return null;
  }
  const normalizedType = normalizeLocationType(locationType) ?? 'shelf';
  return `${normalizedType}::${normalizedName}`.toLowerCase();
}

async function readUsageCount(args: {
  locationName: string;
  locationType?: string | null;
}): Promise<{ count: number; error?: string }> {
  const supabase = createAdminClient();
  const [
    { data: copies, error: copyError },
    { data: boxes, error: boxError },
  ] = await Promise.all([
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

  if (copyError) {
    return { count: 0, error: copyError.message };
  }
  if (boxError) {
    return { count: 0, error: boxError.message };
  }

  const key = usageKey(args.locationType ?? null, args.locationName);
  if (!key) {
    return { count: 0 };
  }

  const countRows = (rows: Array<{ location?: unknown }>) => {
    let count = 0;
    for (const row of rows) {
      const parsed = parseLocation({ location: row.location });
      const rowKey = usageKey(parsed.locationType, parsed.locationName);
      if (rowKey === key) {
        count += 1;
      }
    }
    return count;
  };

  const count = countRows(copies ?? []) + countRows(boxes ?? []);

  return { count };
}

interface LocationPatchPayload {
  name?: unknown;
  location_type?: unknown;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid location id.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as LocationPatchPayload;
    const name = normalizeReferenceName(body.name);
    const locationTypeInput = normalizeLocationType(body.location_type);
    if (!name) {
      return NextResponse.json({ error: 'Location name is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: current, error: currentError } = await supabase
      .from('inventory_locations')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
    }
    const locationType =
      locationTypeInput ??
      normalizeLocationType(parseLocation({ location: current.name }).locationType) ??
      'shelf';
    const locationLabel = composeLocation({
      locationType,
      locationName: name,
      fallbackLocation: name,
    }) ?? name;

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('inventory_locations')
      .update({
        name: locationLabel,
        updated_at: now,
        deleted_at: null,
      })
      .eq('id', id)
      .select('id, name, created_at, updated_at, deleted_at')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Location already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
    }

    const usage = await readUsageCount({
      locationName: name,
      locationType,
    });
    if (usage.error) {
      return NextResponse.json({ error: usage.error }, { status: 500 });
    }

    return NextResponse.json({
      item: {
        ...data,
        location_type: locationType,
        name,
        usage_count: usage.count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update location.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid location id.' }, { status: 400 });
    }

    const mode = normalizeDeleteMode(req.nextUrl.searchParams.get('mode'));
    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    const confirmToken = typeof body.confirm === 'string' ? body.confirm.trim() : '';

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('inventory_locations')
      .select('id, name, deleted_at')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
    }

    const existingParsedLocation = parseLocation({ location: existing.name });
    const usage = await readUsageCount({
      locationName: existingParsedLocation.locationName ?? existing.name,
      locationType: existingParsedLocation.locationType,
    });
    if (usage.error) {
      return NextResponse.json({ error: usage.error }, { status: 500 });
    }
    if (usage.count > 0) {
      return NextResponse.json(
        {
          error: 'Location is currently used by inventory records.',
          in_use_count: usage.count,
        },
        { status: 409 }
      );
    }

    if (mode === 'hard') {
      if (confirmToken !== 'DELETE') {
        return NextResponse.json(
          { error: 'Hard delete requires confirm token "DELETE".' },
          { status: 400 }
        );
      }
      const { error } = await supabase.from('inventory_locations').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, mode: 'hard' });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('inventory_locations')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: 'soft' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete location.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
