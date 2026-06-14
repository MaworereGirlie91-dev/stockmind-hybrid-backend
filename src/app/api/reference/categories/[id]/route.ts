import { NextRequest, NextResponse } from 'next/server';

import { normalizeDeleteMode, normalizeReferenceName } from '@/lib/server/reference-data';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid } from '@/lib/server/validation';

export const runtime = 'nodejs';

async function readUsageCount(categoryName: string): Promise<{ count: number; error?: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('books_master')
    .select('category')
    .is('deleted_at', null)
    .not('category', 'is', null);

  if (error) {
    return { count: 0, error: error.message };
  }

  const key = categoryName.trim().toLowerCase();
  const count = (data ?? []).reduce((acc, row) => {
    const value = typeof row.category === 'string' ? row.category.trim().toLowerCase() : '';
    if (!value) {
      return acc;
    }
    return value === key ? acc + 1 : acc;
  }, 0);

  return { count };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid category id.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = normalizeReferenceName(body.name);
    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('inventory_categories')
      .update({
        name,
        updated_at: now,
        deleted_at: null,
      })
      .eq('id', id)
      .select('id, name, created_at, updated_at, deleted_at')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Category already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }

    const usage = await readUsageCount(name);
    if (usage.error) {
      return NextResponse.json({ error: usage.error }, { status: 500 });
    }

    return NextResponse.json({ item: { ...data, usage_count: usage.count } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update category.';
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
      return NextResponse.json({ error: 'Invalid category id.' }, { status: 400 });
    }

    const mode = normalizeDeleteMode(req.nextUrl.searchParams.get('mode'));
    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    const confirmToken = typeof body.confirm === 'string' ? body.confirm.trim() : '';

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('inventory_categories')
      .select('id, name, deleted_at')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }

    const usage = await readUsageCount(existing.name);
    if (usage.error) {
      return NextResponse.json({ error: usage.error }, { status: 500 });
    }
    if (usage.count > 0) {
      return NextResponse.json(
        {
          error: 'Category is currently used by inventory records.',
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
      const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, mode: 'hard' });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('inventory_categories')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: 'soft' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete category.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
