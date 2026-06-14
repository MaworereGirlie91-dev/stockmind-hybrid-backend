'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart2, ChevronDown, Download, RefreshCw, Search, ShoppingCart } from 'lucide-react';

import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/client';
import { InventoryListRow, Sale } from '@/types';

type DateRange = '7d' | '30d' | '90d' | 'all';
type ReportView = 'sales' | 'inventory';

interface InventoryResponse {
  items: InventoryListRow[];
  total: number;
}

const REFRESH_INTERVAL_MS = 20000;

function toQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    qs.set(key, String(value));
  }
  return qs.toString();
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-GB');
}

function getDateFromRange(range: DateRange): string | undefined {
  if (range === 'all') {
    return undefined;
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since.toISOString();
}

export default function ReportsPage() {
  const supabase = createClient();
  const [view, setView] = useState<ReportView>('sales');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchSales = useCallback(async () => {
    let query = supabase.from('sales').select('*').is('deleted_at', null).order('sold_at', { ascending: false }).limit(3000);
    const dateFrom = getDateFromRange(dateRange);
    if (dateFrom) {
      query = query.gte('sold_at', dateFrom);
    }
    const { data, error: queryError } = await query;
    if (queryError) {
      throw new Error(queryError.message);
    }
    return (data ?? []) as Sale[];
  }, [dateRange, supabase]);

  const fetchInventory = useCallback(async () => {
    const query = toQuery({
      q: search,
      page: 1,
      page_size: 1000,
      status: 'all',
    });
    const res = await fetch(`/api/inventory?${query}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as Partial<InventoryResponse> & { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? 'Failed to load inventory report.');
    }
    return Array.isArray(data.items) ? data.items : [];
  }, [search]);

  const load = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = options?.quiet ?? false;
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const [salesData, inventoryData] = await Promise.all([fetchSales(), fetchInventory()]);
        setSales(salesData);
        setInventory(inventoryData);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchInventory, fetchSales]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void load({ quiet: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return sales;
    }
    return sales.filter((row) => {
      const haystack = [row.title, row.isbn ?? '', row.category ?? '', row.location ?? '', row.epc_tag, row.notes ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sales, search]);

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return inventory;
    }
    return inventory.filter((row) => {
      const haystack = [
        row.epc_tag,
        row.location ?? '',
        row.status,
        row.book?.title ?? '',
        row.book?.isbn ?? '',
        row.book?.category ?? '',
        row.book?.author ?? '',
        row.book?.publisher ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [inventory, search]);

  const salesTotal = filteredSales.reduce((sum, row) => sum + Number(row.price_paid), 0);
  const itemsSold = filteredSales.length;
  const averagePrice = itemsSold > 0 ? salesTotal / itemsSold : 0;

  const soldByCategory = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const row of filteredSales) {
      const key = row.category?.trim() || 'Uncategorised';
      const current = map.get(key) ?? { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(row.price_paid);
      map.set(key, current);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [filteredSales]);

  const salesTrend = useMemo(() => {
    const today = new Date();
    const points = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString('en-GB', { weekday: 'short' }),
        count: 0,
      };
    });

    const map = new Map(points.map((point) => [point.key, point]));
    for (const row of filteredSales) {
      const key = row.sold_at.slice(0, 10);
      const point = map.get(key);
      if (point) {
        point.count += 1;
      }
    }
    return points;
  }, [filteredSales]);

  const maxTrendValue = useMemo(() => Math.max(1, ...salesTrend.map((item) => item.count)), [salesTrend]);

  const salesCsvHref = useMemo(
    () =>
      `/api/reports/sales-csv?${toQuery({
        q: search,
        date_from: getDateFromRange(dateRange),
      })}`,
    [dateRange, search]
  );

  const inventoryCsvHref = useMemo(
    () => `/api/reports/inventory-csv?${toQuery({ q: search, status: 'all' })}`,
    [search]
  );

  const fullReportCsvHref = useMemo(
    () =>
      `/api/reports/full-report-csv?${toQuery({
        q: search,
        status: 'all',
        date_from: getDateFromRange(dateRange),
      })}`,
    [dateRange, search]
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rk-surface rounded-[28px] p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f3c6cc] bg-[#fff5f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">
                <BarChart2 size={14} />
                Reporting and Analytics
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#1f2937]">Operational reporting for the same live StockMind data.</h1>
              <p className="mt-3 text-sm leading-6 text-[#6b7280] sm:text-base">
                Review book movement, location-level inventory, recent transactions, and export-ready reports from the same
                account system and shared database used by the mobile app.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-[#f3c6cc] bg-white px-4 py-3 shadow-[0_12px_32px_rgba(200,16,46,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9f1027]">Last updated</p>
                <p className="mt-2 text-sm text-[#374151]">
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Waiting for first load'}
                </p>
                <p className="mt-1 text-xs text-[#6b7280]">Auto-refreshes every 20 seconds.</p>
              </div>
              <button
                onClick={() => void load({ quiet: true })}
                disabled={loading || refreshing}
                className="rk-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing' : 'Refresh now'}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rk-surface rounded-[28px] p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, ISBN, EPC, category, notes..."
                className="rk-input w-full pl-9 pr-4 py-2.5 text-sm"
              />
            </div>

            <div className="relative">
              <select
                value={view}
                onChange={(event) => setView(event.target.value as ReportView)}
                className="rk-input appearance-none w-full px-3 py-2.5 pr-8 text-sm"
              >
                <option value="sales">Sales report</option>
                <option value="inventory">Inventory report</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            </div>

            <div className="relative">
              <select
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value as DateRange)}
                className="rk-input appearance-none w-full px-3 py-2.5 pr-8 text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a href={salesCsvHref} className="rk-button-ghost inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
                <Download size={13} />
                Sales CSV
              </a>
              <a href={inventoryCsvHref} className="rk-button-ghost inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
                <Download size={13} />
                Inventory CSV
              </a>
              <a href={fullReportCsvHref} className="rk-button-ghost inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
                <Download size={13} />
                Full CSV
              </a>
            </div>
          </div>
        </section>

        {view === 'sales' ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Revenue', value: `$${salesTotal.toFixed(2)}`, hint: 'From recorded mobile and web sales' },
                { label: 'Items sold', value: String(itemsSold), hint: `${filteredSales.length} filtered sale rows` },
                { label: 'Average price', value: `$${averagePrice.toFixed(2)}`, hint: 'Computed from visible sales' },
                { label: 'Categories sold', value: String(soldByCategory.length), hint: 'Distinct categories in the current filter' },
              ].map((card) => (
                <div key={card.label} className="rk-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">{card.label}</p>
                  <div className="mt-3 text-3xl font-bold text-[#1f2937]">
                    {loading ? <span className="inline-block h-9 w-20 rounded-lg bg-[#f7d8dd] animate-pulse" /> : card.value}
                  </div>
                  <p className="mt-2 text-sm text-[#6b7280]">{card.hint}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
              <div className="rk-surface rounded-[28px] p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#1f2937]">Sales trend</h2>
                    <p className="text-sm text-[#6b7280]">Recent daily transaction volume in the current reporting window.</p>
                  </div>
                  <ShoppingCart size={18} className="text-[#c8102e]" />
                </div>
                <div className="mt-6 grid grid-cols-7 gap-3">
                  {salesTrend.map((point) => (
                    <div key={point.key} className="flex flex-col items-center gap-3">
                      <div className="flex h-36 w-full items-end rounded-2xl bg-white px-2 py-3 shadow-[inset_0_0_0_1px_rgba(243,198,204,0.85)]">
                        <div
                          className="w-full rounded-xl bg-gradient-to-t from-[#c8102e] via-[#e33b56] to-[#f8c7cf]"
                          style={{ height: `${Math.max(12, (point.count / maxTrendValue) * 100)}%` }}
                        />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-[#1f2937]">{point.count}</div>
                        <div className="text-xs text-[#6b7280]">{point.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rk-surface rounded-[28px] p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#1f2937]">Items sold by category</h2>
                    <p className="text-sm text-[#6b7280]">Category mix across the currently visible sales.</p>
                  </div>
                  <BarChart2 size={18} className="text-[#c8102e]" />
                </div>
                <div className="mt-5 space-y-3">
                  {soldByCategory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#f3c6cc] bg-white px-4 py-6 text-sm text-[#6b7280]">
                      No sales in this period.
                    </div>
                  ) : (
                    soldByCategory.slice(0, 8).map(([categoryName, meta]) => {
                      const width = itemsSold ? Math.max(8, (meta.count / itemsSold) * 100) : 0;
                      return (
                        <div key={categoryName} className="rounded-2xl border border-[#f3c6cc] bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-[#1f2937]">{categoryName}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9f1027]">
                              {meta.count} sold / ${meta.revenue.toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#fde7ea]">
                            <div className="h-full rounded-full bg-[#c8102e]" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="rk-surface rounded-[28px] overflow-hidden">
              <div className="border-b border-[#f3c6cc] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#1f2937]">Sales transactions</h2>
                <p className="text-sm text-[#6b7280]">Shared sale records with exact timestamps, titles, locations, and EPC values.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#fff8f9]">
                    <tr className="border-b border-[#f3c6cc]">
                      {['Date and time', 'Title', 'ISBN', 'Category', 'Location', 'EPC', 'Action'].map((header) => (
                        <th key={header} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f1027]">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-sm text-[#6b7280]">
                          No sales records for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredSales.slice(0, 300).map((row) => (
                        <tr key={row.id} className="border-b border-[#fdf0f2]">
                          <td className="px-3 py-3 text-xs text-[#6b7280]">{formatDateTime(row.sold_at)}</td>
                          <td className="px-3 py-3 font-semibold text-[#1f2937]">{row.title}</td>
                          <td className="px-3 py-3 font-mono text-xs text-[#6b7280]">{row.isbn ?? '-'}</td>
                          <td className="px-3 py-3 text-[#374151]">{row.category ?? '-'}</td>
                          <td className="px-3 py-3 text-[#374151]">{row.location ?? '-'}</td>
                          <td className="px-3 py-3">
                            <code className="rounded-lg bg-[#fff5f6] px-2 py-1 text-[11px] text-[#9f1027]">{row.epc_tag}</code>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center rounded-full bg-[#c8102e] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                              Sold
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="rk-surface rounded-[28px] overflow-hidden">
            <div className="border-b border-[#f3c6cc] px-5 py-4">
              <h2 className="text-lg font-semibold text-[#1f2937]">Inventory report</h2>
              <p className="text-sm text-[#6b7280]">Live inventory rows with linked title metadata, location assignment, and stock status.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#fff8f9]">
                  <tr className="border-b border-[#f3c6cc]">
                    {['Title', 'ISBN', 'Category', 'Location', 'EPC', 'Status', 'Updated'].map((header) => (
                      <th key={header} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f1027]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-sm text-[#6b7280]">
                        No inventory records for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.slice(0, 400).map((row) => (
                      <tr key={row.id} className="border-b border-[#fdf0f2]">
                        <td className="px-3 py-3 font-semibold text-[#1f2937]">{row.book?.title ?? '-'}</td>
                        <td className="px-3 py-3 font-mono text-xs text-[#6b7280]">{row.book?.isbn ?? '-'}</td>
                        <td className="px-3 py-3 text-[#374151]">{row.book?.category ?? '-'}</td>
                        <td className="px-3 py-3 text-[#374151]">{row.location ?? '-'}</td>
                        <td className="px-3 py-3">
                          <code className="rounded-lg bg-[#fff5f6] px-2 py-1 text-[11px] text-[#9f1027]">{row.epc_tag}</code>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-3 text-xs text-[#6b7280]">{formatDateTime(row.updated_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
