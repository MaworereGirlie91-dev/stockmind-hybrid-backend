import Link from 'next/link';
import {
  Activity,
  BookCopy,
  BookOpen,
  Boxes,
  Download,
  Layers,
  MapPin,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

import DashboardAutoRefresh from '@/components/dashboard/DashboardAutoRefresh';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import StatusBadge from '@/components/StatusBadge';
import { parseLocation } from '@/lib/location';
import { BookBoxWithMaster, BookCopyWithMaster, Sale } from '@/types';

interface DashboardSummary {
  totalBooks: number;
  totalBoxes: number;
  booksInBoxes: number;
  booksOutsideBoxes: number;
  totalSales: number;
  totalBooksLost: number;
}

interface TrendPoint {
  label: string;
  sales: number;
}

interface ActivityRow {
  id: string;
  type: 'sale' | 'inventory';
  title: string;
  subtitle: string;
  timestamp: string;
  status: string;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB');
}

function MetricCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: typeof Boxes;
}) {
  return (
    <div className="rk-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9f1027] leading-none">{label}</p>
          <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fff0f2] text-[#c8102e]">
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPageClient({
  copies,
  boxes,
  sales,
  error,
  lastUpdated,
}: {
  copies: BookCopyWithMaster[];
  boxes: BookBoxWithMaster[];
  sales: Sale[];
  error?: string;
  lastUpdated: string;
}) {
  const summary: DashboardSummary = (() => {
    const booksOutsideBoxes = copies.length;
    const booksInBoxes = boxes.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const totalBooks = booksOutsideBoxes + booksInBoxes;
    const totalBoxes = boxes.length;
    const totalBooksLost = copies.filter((row) => row.status === 'lost').length;
    const totalSales = sales.length;
    return { totalBooks, totalBoxes, booksInBoxes, booksOutsideBoxes, totalSales, totalBooksLost };
  })();

  const checkedOutBooks = copies.filter((row) => row.status === 'checked_out').length;
  const inStockBooks = Math.max(summary.totalBooks - checkedOutBooks - summary.totalBooksLost, 0);

  const topCategories = (() => {
    const map = new Map<string, number>();
    for (const row of copies) {
      const key = row.books_master?.category?.trim() || 'Uncategorised';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const row of boxes) {
      const key = row.books_master?.category?.trim() || 'Uncategorised';
      map.set(key, (map.get(key) ?? 0) + Number(row.quantity ?? 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  const topLocations = (() => {
    const map = new Map<string, number>();
    for (const row of copies) {
      const parsed = parseLocation({ location: row.location, locationType: row.location_type, locationName: row.location_name });
      const key = parsed.location?.trim() || 'Unassigned';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const row of boxes) {
      const parsed = parseLocation({ location: row.location, locationType: row.location_type, locationName: row.location_name });
      const key = parsed.location?.trim() || 'Unassigned';
      map.set(key, (map.get(key) ?? 0) + Number(row.quantity ?? 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  })();

  const trend: TrendPoint[] = (() => {
    const today = new Date();
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, label: date.toLocaleDateString('en-GB', { weekday: 'short' }), sales: 0 };
    });
    const map = new Map(buckets.map((item) => [item.key, item]));
    for (const row of sales) {
      const key = row.sold_at.slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.sales += 1;
    }
    return buckets.map(({ label, sales: count }) => ({ label, sales: count }));
  })();

  const activityFeed: ActivityRow[] = (() => {
    const inventoryActivity = copies.slice(0, 8).map((row) => ({
      id: `inventory-${row.id}`,
      type: 'inventory' as const,
      title: row.books_master?.title ?? 'Unknown title',
      subtitle: `${row.epc_tag}${row.location ? ` · ${row.location}` : ''}`,
      timestamp: row.updated_at,
      status: row.status,
    }));
    const salesActivity = sales.slice(0, 8).map((row) => ({
      id: `sale-${row.id}`,
      type: 'sale' as const,
      title: row.title,
      subtitle: `${row.isbn ?? 'No ISBN'}${row.location ? ` · ${row.location}` : ''}`.trim(),
      timestamp: row.sold_at,
      status: 'sold',
    }));
    return [...inventoryActivity, ...salesActivity]
      .sort((l, r) => new Date(r.timestamp).getTime() - new Date(l.timestamp).getTime())
      .slice(0, 10);
  })();

  const inventoryPreview = copies.slice(0, 10);
  const maxTrendValue = Math.max(1, ...trend.map((item) => item.sales));

  const friendlyError = error
    ? error.toLowerCase().includes('fetch') || error.toLowerCase().includes('network')
      ? 'Could not connect to the database. Check that the Supabase server is reachable.'
      : error
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <DashboardAutoRefresh intervalMs={30000} />
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-5 space-y-5">

        {/* Compact header */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[#c8102e]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9f1027]">Admin Dashboard</span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-[#1f2937]">AIEC Inventory Overview</h1>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Last synced {new Date(lastUpdated).toLocaleTimeString()} ·{' '}
              <Link href="/statistics" className="text-[#c8102e] hover:underline">refresh</Link>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/statistics"
              className="rk-button-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              <RefreshCw size={12} />
              Refresh
            </Link>
            <Link
              href="/inventory"
              className="rk-button-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              <BookCopy size={12} />
              Inventory
            </Link>
            <a
              href="/api/reports/inventory-csv"
              className="rk-button-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              <Download size={12} />
              CSV
            </a>
          </div>
        </section>

        {/* Error banner */}
        {friendlyError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Connection error — </span>
              {friendlyError}
              <Link href="/statistics" className="ml-2 underline text-red-600 font-semibold text-xs">Retry</Link>
            </div>
          </div>
        )}

        {/* Metric cards — 2 per row on mobile, 3 on lg */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard label="Total Books" value={summary.totalBooks} accent="text-[#1f2937]" icon={Boxes} />
          <MetricCard label="Total Boxes" value={summary.totalBoxes} accent="text-[#9f1027]" icon={BookOpen} />
          <MetricCard label="In Boxes" value={summary.booksInBoxes} accent="text-[#c8102e]" icon={Layers} />
          <MetricCard label="Individual" value={summary.booksOutsideBoxes} accent="text-[#1f2937]" icon={BookCopy} />
          <MetricCard label="Total Sales" value={summary.totalSales} accent="text-[#c8102e]" icon={ShoppingCart} />
          <MetricCard label="Books Lost" value={summary.totalBooksLost} accent="text-amber-600" icon={TrendingUp} />
        </section>

        {/* Charts row */}
        <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
          <div className="rk-surface rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-sm font-semibold text-[#1f2937]">Sales trend</h2>
                <p className="text-xs text-[#6b7280]">7-day activity</p>
              </div>
              <div className="rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-semibold text-[#9f1027]">
                {sales.length} total
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {trend.map((point) => (
                <div key={point.label} className="flex flex-col items-center gap-2">
                  <div className="flex h-28 w-full items-end rounded-xl bg-white px-1.5 py-2 shadow-[inset_0_0_0_1px_rgba(243,198,204,0.85)]">
                    <div
                      className="w-full rounded-lg bg-gradient-to-t from-[#c8102e] to-[#f8c7cf]"
                      style={{ height: `${Math.max(12, (point.sales / maxTrendValue) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-[#1f2937]">{point.sales}</div>
                    <div className="text-[9px] text-[#6b7280]">{point.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rk-surface rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold text-[#1f2937]">Inventory health</h2>
                <Layers size={15} className="text-[#c8102e]" />
              </div>
              <div className="overflow-hidden rounded-full bg-[#fde7ea]">
                <div className="flex h-3 w-full">
                  <div className="bg-emerald-500" style={{ width: `${summary.totalBooks ? (inStockBooks / summary.totalBooks) * 100 : 0}%` }} />
                  <div className="bg-amber-500" style={{ width: `${summary.totalBooks ? (checkedOutBooks / summary.totalBooks) * 100 : 0}%` }} />
                  <div className="bg-[#c8102e]" style={{ width: `${summary.totalBooks ? (summary.totalBooksLost / summary.totalBooks) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="mt-3 space-y-2 text-xs text-[#374151]">
                <div className="flex items-center justify-between rounded-xl border border-[#dcfce7] bg-[#f0fdf4] px-3 py-2">
                  <span>In stock</span>
                  <span className="font-semibold text-emerald-700">{inStockBooks}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[#fef3c7] bg-[#fffbeb] px-3 py-2">
                  <span>Checked out</span>
                  <span className="font-semibold text-amber-700">{checkedOutBooks}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[#f3c6cc] bg-[#fff0f2] px-3 py-2">
                  <span>Lost / missing</span>
                  <span className="font-semibold text-[#9f1027]">{summary.totalBooksLost}</span>
                </div>
              </div>
            </div>

            <div className="rk-surface rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold text-[#1f2937]">Exports</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a href="/api/reports/sales-csv" className="rk-button-ghost inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold">
                  <Download size={12} />Sales CSV
                </a>
                <a href="/api/reports/inventory-csv" className="rk-button-ghost inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold">
                  <Download size={12} />Inventory CSV
                </a>
                <a href="/api/reports/full-report-csv" className="rk-button-ghost inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold col-span-2">
                  <Download size={12} />Full Report CSV
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Location + Categories side by side */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rk-surface rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-[#1f2937]">Locations</h2>
              <MapPin size={14} className="text-[#c8102e]" />
            </div>
            <div className="space-y-2">
              {topLocations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#f3c6cc] px-4 py-5 text-xs text-[#6b7280] text-center">
                  No location assignments yet.
                </div>
              ) : (
                topLocations.map(([name, count]) => {
                  const width = summary.totalBooks ? Math.max(8, (count / summary.totalBooks) * 100) : 0;
                  return (
                    <div key={name} className="rounded-xl border border-[#f3c6cc] bg-white p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-[#1f2937] truncate">{name}</span>
                        <span className="text-[10px] font-semibold text-[#9f1027] shrink-0">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#fde7ea]">
                        <div className="h-full rounded-full bg-[#c8102e]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rk-surface rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-[#1f2937]">Top categories</h2>
              <BookCopy size={14} className="text-[#c8102e]" />
            </div>
            <div className="space-y-2">
              {topCategories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#f3c6cc] px-4 py-5 text-xs text-[#6b7280] text-center">
                  No category data yet.
                </div>
              ) : (
                topCategories.map(([name, count]) => {
                  const width = summary.totalBooks ? Math.max(8, (count / summary.totalBooks) * 100) : 0;
                  return (
                    <div key={name} className="rounded-xl border border-[#f3c6cc] bg-white p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-[#1f2937] truncate">{name}</span>
                        <span className="text-[10px] font-semibold text-[#9f1027] shrink-0">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#fde7ea]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#c8102e] to-[#f16b82]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* Live inventory + activity */}
        <section className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <div className="rk-surface rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[#f3c6cc] px-5 py-3">
              <h2 className="text-sm font-semibold text-[#1f2937]">Live inventory</h2>
              <Link href="/inventory" className="rk-button-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-[#f3c6cc]">
                    {['Title', 'EPC', 'Status', 'Updated'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f1027]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventoryPreview.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-xs text-[#6b7280]">
                        No inventory rows yet.
                      </td>
                    </tr>
                  ) : (
                    inventoryPreview.map((row) => (
                      <tr key={row.id} className="border-b border-[#fdf0f2] align-top">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-[#1f2937] max-w-[180px] truncate">{row.books_master?.title ?? '—'}</div>
                          <div className="text-[10px] text-[#6b7280]">{row.books_master?.category ?? ''}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <code className="rounded bg-[#fff5f6] px-1.5 py-0.5 text-[10px] text-[#9f1027]">{row.epc_tag}</code>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-[#6b7280] whitespace-nowrap">{formatDateTime(row.updated_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rk-surface rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-[#1f2937]">Recent activity</h2>
              <Activity size={14} className="text-[#c8102e]" />
            </div>
            <div className="space-y-2">
              {activityFeed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#f3c6cc] px-4 py-5 text-xs text-[#6b7280] text-center">
                  No activity yet.
                </div>
              ) : (
                activityFeed.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[#f3c6cc] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex h-2 w-2 rounded-full ${item.type === 'sale' ? 'bg-[#c8102e]' : 'bg-emerald-500'}`} />
                          <span className="truncate text-xs font-semibold text-[#1f2937]">{item.title}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#6b7280] truncate">{item.subtitle}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-[#9f1027]">{formatDateTime(item.timestamp)}</div>
                      </div>
                      {item.type === 'sale' ? (
                        <span className="rounded-full bg-[#fff0f2] px-2 py-0.5 text-[9px] font-semibold uppercase text-[#9f1027] shrink-0">Sold</span>
                      ) : (
                        <StatusBadge status={item.status} />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
