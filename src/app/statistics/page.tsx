export const dynamic = 'force-dynamic';

import DashboardPageClient from '@/components/dashboard/DashboardPageClient';
import { createAdminClient } from '@/lib/server/supabase-admin';
import { BookBoxWithMaster, BookCopyWithMaster, Sale } from '@/types';

export default async function StatisticsPage() {
  let copies: BookCopyWithMaster[] = [];
  let boxes: BookBoxWithMaster[] = [];
  let sales: Sale[] = [];
  let error = '';

  try {
    const supabase = createAdminClient();
    const [copiesRes, boxesRes, salesRes] = await Promise.all([
      supabase
        .from('book_copies')
        .select(
          'id, book_id, epc_tag, location, status, date_added, updated_at, books_master(id, title, isbn, category)'
        )
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1500),
      supabase
        .from('book_boxes')
        .select(
          'id, book_id, epc_tag, quantity, location, created_at, updated_at, books_master(id, title, isbn, category)'
        )
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1500),
      supabase
        .from('sales')
        .select(
          'id, copy_id, book_id, epc_tag, title, isbn, category, location, price_paid, sold_at, notes'
        )
        .is('deleted_at', null)
        .order('sold_at', { ascending: false })
        .limit(1500),
    ]);

    if (copiesRes.error || boxesRes.error || salesRes.error) {
      error =
        copiesRes.error?.message ??
        boxesRes.error?.message ??
        salesRes.error?.message ??
        'Failed to load dashboard.';
    } else {
      copies = (copiesRes.data ?? []) as unknown as BookCopyWithMaster[];
      boxes = (boxesRes.data ?? []) as unknown as BookBoxWithMaster[];
      sales = (salesRes.data ?? []) as unknown as Sale[];
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load dashboard.';
  }

  return (
    <DashboardPageClient
      copies={copies}
      boxes={boxes}
      sales={sales}
      error={error}
      lastUpdated={new Date().toISOString()}
    />
  );
}
