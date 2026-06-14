import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/server/supabase-admin';
import { normalizeReferenceName } from '@/lib/server/reference-data';

export const runtime = 'nodejs';

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const includeDeleted = req.nextUrl.searchParams.get('include_deleted') === 'true';
    const supabase = createAdminClient();

    let categoriesQuery = supabase
      .from('inventory_categories')
      .select('id, name, created_at, updated_at, deleted_at')
      .order('name', { ascending: true });

    if (!includeDeleted) {
      categoriesQuery = categoriesQuery.is('deleted_at', null);
    }

    const [{ data: categories, error: categoriesError }, { data: books, error: booksError }] = await Promise.all([
      categoriesQuery,
      supabase
        .from('books_master')
        .select('category')
        .is('deleted_at', null)
        .not('category', 'is', null),
    ]);

    if (categoriesError) {
      return NextResponse.json({ error: categoriesError.message }, { status: 500 });
    }
    if (booksError) {
      return NextResponse.json({ error: booksError.message }, { status: 500 });
    }

    const usageMap = new Map<string, number>();
    for (const row of books ?? []) {
      const raw = typeof row.category === 'string' ? row.category.trim() : '';
      if (!raw) {
        continue;
      }
      const key = normalizeKey(raw);
      usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
    }

    const items = (categories ?? []).map((row) => ({
      ...row,
      usage_count: usageMap.get(normalizeKey(row.name)) ?? 0,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch categories.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = normalizeReferenceName(body.name);
    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('inventory_categories')
      .insert({
        name,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .select('id, name, created_at, updated_at, deleted_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Category already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: { ...data, usage_count: 0 } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create category.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
