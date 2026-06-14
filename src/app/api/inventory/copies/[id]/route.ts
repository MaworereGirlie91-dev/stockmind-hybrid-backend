import { NextRequest, NextResponse } from 'next/server';

import { parseLocation } from '@/lib/location';
import { normalizeDeleteMode, ensureReferenceName } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid, normalizeEpc, normalizeOptionalText } from '@/lib/server/validation';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['in_stock', 'checked_out', 'lost']);

interface CopyPatchPayload {
  epc_tag?: unknown;
  location?: unknown;
  location_type?: unknown;
  location_name?: unknown;
  status?: unknown;
}

interface CopyDeletePayload {
  mode?: unknown;
  confirm?: unknown;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid copy id.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as CopyPatchPayload;
    const nextEpc = body.epc_tag === undefined ? undefined : normalizeEpc(body.epc_tag);
    const hasLocationInput =
      body.location !== undefined ||
      body.location_type !== undefined ||
      body.location_name !== undefined;
    const nextLocation = hasLocationInput
      ? parseLocation({
          location: normalizeOptionalText(body.location, 120),
          locationType: normalizeOptionalText(body.location_type, 40),
          locationName: normalizeOptionalText(body.location_name, 120),
        })
      : undefined;
    const statusRaw = typeof body.status === 'string' ? body.status.trim().toLowerCase() : undefined;
    const nextStatus = statusRaw && VALID_STATUSES.has(statusRaw) ? statusRaw : undefined;

    if (
      body.epc_tag !== undefined &&
      !nextEpc
    ) {
      return NextResponse.json({ error: 'Invalid EPC value.' }, { status: 400 });
    }
    if (body.status !== undefined && !nextStatus) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
    }
    if (
      body.epc_tag === undefined &&
      !hasLocationInput &&
      body.status === undefined
    ) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('book_copies')
      .select('id, epc_tag, location, status, row_version, updated_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Inventory copy not found.' }, { status: 404 });
    }

    if (nextEpc && nextEpc !== existing.epc_tag) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('book_copies')
        .select('id')
        .eq('epc_tag', nextEpc)
        .neq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (duplicateError) {
        return NextResponse.json({ error: duplicateError.message }, { status: 500 });
      }
      if (duplicate) {
        return NextResponse.json({ error: 'Another copy already uses this EPC tag.' }, { status: 409 });
      }

      const { data: duplicateBox, error: duplicateBoxError } = await supabase
        .from('book_boxes')
        .select('id')
        .eq('epc_tag', nextEpc)
        .is('deleted_at', null)
        .maybeSingle();
      if (duplicateBoxError) {
        return NextResponse.json({ error: duplicateBoxError.message }, { status: 500 });
      }
      if (duplicateBox) {
        return NextResponse.json(
          { error: 'This EPC tag is already assigned to a tagged box.' },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const nextRowVersion = Math.max(1, Number(existing.row_version ?? 1)) + 1;
    const updatePayload: Record<string, unknown> = {
      updated_at: now,
      row_version: nextRowVersion,
    };

    if (body.epc_tag !== undefined) {
      updatePayload.epc_tag = nextEpc;
    }
    if (hasLocationInput) {
      updatePayload.location = nextLocation?.location ?? null;
    }
    if (body.status !== undefined) {
      updatePayload.status = nextStatus;
    }

    const { data: updated, error: updateError } = await supabase
      .from('book_copies')
      .update(updatePayload)
      .eq('id', id)
      .select('id, book_id, epc_tag, location, status, date_added, updated_at, row_version')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (hasLocationInput) {
      await ensureReferenceName(
        'inventory_locations',
        nextLocation?.locationName ?? null,
        nextLocation?.locationType ?? null
      );
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update inventory copy.';
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
      return NextResponse.json({ error: 'Invalid copy id.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as CopyDeletePayload;
    const mode = normalizeDeleteMode(req.nextUrl.searchParams.get('mode') ?? body.mode);
    const confirmToken = typeof body.confirm === 'string' ? body.confirm.trim() : '';

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('book_copies')
      .select('id, row_version')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Inventory copy not found.' }, { status: 404 });
    }

    if (mode === 'hard') {
      if (confirmToken !== 'DELETE') {
        return NextResponse.json(
          { error: 'Hard delete requires confirm token "DELETE".' },
          { status: 400 }
        );
      }

      const { count, error: countError } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('copy_id', id)
        .is('deleted_at', null);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: 'Cannot hard-delete copy with linked sales records.',
            linked_sales_count: count ?? 0,
          },
          { status: 409 }
        );
      }

      const { error } = await supabase.from('book_copies').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, mode: 'hard' });
    }

    const now = new Date().toISOString();
    const nextRowVersion = Math.max(1, Number(existing.row_version ?? 1)) + 1;
    const { error } = await supabase
      .from('book_copies')
      .update({
        deleted_at: now,
        updated_at: now,
        row_version: nextRowVersion,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: 'soft' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete inventory copy.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
