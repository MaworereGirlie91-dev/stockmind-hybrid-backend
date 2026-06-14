import { NextRequest, NextResponse } from 'next/server';

import { normalizeDeleteMode, ensureReferenceName } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid, normalizeOptionalText, normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

interface TitlePatchPayload {
  title?: unknown;
  isbn?: unknown;
  category?: unknown;
  author?: unknown;
  publisher?: unknown;
  edition?: unknown;
  list_price?: unknown;
}

interface TitleDeletePayload {
  mode?: unknown;
  confirm?: unknown;
}

function normalizeListPrice(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed * 100) / 100;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid title id.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as TitlePatchPayload;
    const nextTitle = body.title === undefined ? undefined : normalizeRequiredText(body.title, 200);
    const nextIsbn = body.isbn === undefined ? undefined : normalizeOptionalText(body.isbn, 64);
    const nextCategory = body.category === undefined ? undefined : normalizeOptionalText(body.category, 120);
    const nextAuthor = body.author === undefined ? undefined : normalizeOptionalText(body.author, 200);
    const nextPublisher = body.publisher === undefined ? undefined : normalizeOptionalText(body.publisher, 200);
    const nextEdition = body.edition === undefined ? undefined : normalizeOptionalText(body.edition, 120);
    const nextListPrice = normalizeListPrice(body.list_price);

    if (body.title !== undefined && !nextTitle) {
      return NextResponse.json({ error: 'Title is invalid.' }, { status: 400 });
    }
    if (body.list_price !== undefined && nextListPrice === undefined) {
      return NextResponse.json({ error: 'List price must be a non-negative number.' }, { status: 400 });
    }
    if (
      body.title === undefined &&
      body.isbn === undefined &&
      body.category === undefined &&
      body.author === undefined &&
      body.publisher === undefined &&
      body.edition === undefined &&
      body.list_price === undefined
    ) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('books_master')
      .select('id, row_version')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Title not found.' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const nextRowVersion = Math.max(1, Number(existing.row_version ?? 1)) + 1;
    const updatePayload: Record<string, unknown> = {
      updated_at: now,
      row_version: nextRowVersion,
    };

    if (body.title !== undefined) {
      updatePayload.title = nextTitle;
    }
    if (body.isbn !== undefined) {
      updatePayload.isbn = nextIsbn;
    }
    if (body.category !== undefined) {
      updatePayload.category = nextCategory;
    }
    if (body.author !== undefined) {
      updatePayload.author = nextAuthor;
    }
    if (body.publisher !== undefined) {
      updatePayload.publisher = nextPublisher;
    }
    if (body.edition !== undefined) {
      updatePayload.edition = nextEdition;
    }
    if (body.list_price !== undefined) {
      updatePayload.list_price = nextListPrice;
    }

    const { data: updated, error: updateError } = await supabase
      .from('books_master')
      .update(updatePayload)
      .eq('id', id)
      .select('id, title, isbn, category, author, publisher, edition, list_price, updated_at, row_version')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (body.category !== undefined) {
      await ensureReferenceName('inventory_categories', nextCategory);
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update title.';
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
      return NextResponse.json({ error: 'Invalid title id.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as TitleDeletePayload;
    const mode = normalizeDeleteMode(req.nextUrl.searchParams.get('mode') ?? body.mode);
    const confirmToken = typeof body.confirm === 'string' ? body.confirm.trim() : '';

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('books_master')
      .select('id, row_version')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Title not found.' }, { status: 404 });
    }

    const [{ count: copiesCount, error: copiesError }, { count: salesCount, error: salesError }] = await Promise.all([
      supabase
        .from('book_copies')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', id)
        .is('deleted_at', null),
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', id)
        .is('deleted_at', null),
    ]);

    if (copiesError) {
      return NextResponse.json({ error: copiesError.message }, { status: 500 });
    }
    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    if ((copiesCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete title while active copies still exist.',
          linked_copies_count: copiesCount ?? 0,
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
      if ((salesCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error: 'Cannot hard-delete title with linked sales records.',
            linked_sales_count: salesCount ?? 0,
          },
          { status: 409 }
        );
      }

      const { error } = await supabase.from('books_master').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, mode: 'hard' });
    }

    const now = new Date().toISOString();
    const nextRowVersion = Math.max(1, Number(existing.row_version ?? 1)) + 1;
    const { error } = await supabase
      .from('books_master')
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
    const message = error instanceof Error ? error.message : 'Failed to delete title.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
