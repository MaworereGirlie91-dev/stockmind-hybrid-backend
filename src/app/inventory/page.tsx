'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';

import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import StatusBadge from '@/components/StatusBadge';
import { useSettings } from '@/hooks/useSettings';
import { InventoryBoxListRow, InventoryListRow } from '@/types';

interface InventoryResponse {
  items: InventoryListRow[];
  box_items: InventoryBoxListRow[];
  box_total: number;
  box_quantity_total: number;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const REFRESH_INTERVAL_MS = 15000;
const PAGE_SIZE = 40;

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-GB');
}

export default function InventoryPage() {
  const { categories, locations } = useSettings();

  const [items, setItems] = useState<InventoryListRow[]>([]);
  const [boxItems, setBoxItems] = useState<InventoryBoxListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [boxTotal, setBoxTotal] = useState(0);
  const [boxQuantityTotal, setBoxQuantityTotal] = useState(0);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'in_stock' | 'checked_out' | 'lost'>('all');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchInventory = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = options?.quiet ?? false;
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const query = toQuery({
        q,
        status,
        category,
        location,
        page,
        page_size: PAGE_SIZE,
      });
      const res = await fetch(`/api/inventory?${query}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as Partial<InventoryResponse> & {
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? 'Failed to load inventory.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setBoxItems(Array.isArray(data.box_items) ? data.box_items : []);
      setBoxTotal(typeof data.box_total === 'number' ? data.box_total : 0);
      setBoxQuantityTotal(
        typeof data.box_quantity_total === 'number' ? data.box_quantity_total : 0
      );
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTotalPages(typeof data.total_pages === 'number' ? Math.max(1, data.total_pages) : 1);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
    },
    [category, location, page, q, status]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchInventory();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchInventory]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchInventory({ quiet: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchInventory]);

  const setFilterWithReset = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(1);
  };

  const rangeText = useMemo(() => {
    if (total === 0) {
      return '0 records';
    }
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(total, start + items.length - 1);
    return `${start}-${end} of ${total}`;
  }, [items.length, page, total]);

  const pageSummary = useMemo(() => {
    const assignedLocationNames = new Set(
      items
        .map((item) => item.location?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase())
    );
    const located = assignedLocationNames.size;
    const unassigned = items.filter((item) => !item.location?.trim()).length;
    const inStock = items.filter((item) => item.status === 'in_stock').length;
    const activeTitles = new Set(items.map((item) => item.book?.id).filter(Boolean)).size;
    return { located, unassigned, inStock, activeTitles };
  }, [items]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="rk-surface rounded-[28px] p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f3c6cc] bg-[#fff5f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">
                <BookOpen size={14} />
                Inventory Control
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#1f2937]">Live inventory table with structured location visibility.</h1>
              <p className="mt-3 text-sm leading-6 text-[#6b7280] sm:text-base">
                This page mirrors the mobile inventory workflow. When locations are assigned during tagging on
                the app, the table below refreshes automatically and shows the updated location against the same ISBN and EPC.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-[#f3c6cc] bg-white px-4 py-3 shadow-[0_12px_32px_rgba(200,16,46,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9f1027]">Auto refresh</p>
                <p className="mt-2 text-sm text-[#374151]">
                  {lastUpdated ? `Last update ${lastUpdated.toLocaleTimeString()}` : 'Waiting for first load'}
                </p>
                <p className="mt-1 text-xs text-[#6b7280]">Pulls fresh inventory every 15 seconds.</p>
              </div>
              <button
                onClick={() => void fetchInventory({ quiet: true })}
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
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Filtered records', value: total, hint: rangeText },
            { label: 'Locations assigned', value: pageSummary.located, hint: 'Unique visible location names' },
            { label: 'Awaiting location', value: pageSummary.unassigned, hint: 'Visible rows without location assignment' },
            { label: 'Titles visible', value: pageSummary.activeTitles, hint: `${pageSummary.inStock} visible rows currently in stock` },
          ].map((card) => (
            <div key={card.label} className="rk-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">{card.label}</p>
              <div className="mt-3 text-3xl font-bold text-[#1f2937]">
                {loading ? <span className="inline-block h-9 w-16 rounded-lg bg-[#f7d8dd] animate-pulse" /> : card.value}
              </div>
              <p className="mt-2 text-sm text-[#6b7280]">{card.hint}</p>
            </div>
          ))}
        </section>

        <section className="rk-surface rounded-[28px] p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="text"
                value={q}
                onChange={(event) => setFilterWithReset(setQ, event.target.value)}
                placeholder="Search title, ISBN, EPC, category, location..."
                className="rk-input w-full pl-9 pr-4 py-2.5 text-sm"
              />
            </div>

            <div className="relative">
              <select
                value={status}
                onChange={(event) => setFilterWithReset(setStatus, event.target.value as typeof status)}
                className="rk-input appearance-none w-full px-3 py-2.5 pr-8 text-sm"
              >
                <option value="all">All status</option>
                <option value="in_stock">In stock</option>
                <option value="checked_out">Checked out</option>
                <option value="lost">Lost</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            </div>

            <div className="relative">
              <select
                value={category}
                onChange={(event) => setFilterWithReset(setCategory, event.target.value)}
                className="rk-input appearance-none w-full px-3 py-2.5 pr-8 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            </div>

            <div className="relative">
              <select
                value={location}
                onChange={(event) => setFilterWithReset(setLocation, event.target.value)}
                className="rk-input appearance-none w-full px-3 py-2.5 pr-8 text-sm"
              >
                <option value="">All locations</option>
                {locations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rk-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">Tagged boxes</p>
            <div className="mt-3 text-3xl font-bold text-[#1f2937]">{loading ? '...' : boxTotal}</div>
            <p className="mt-2 text-sm text-[#6b7280]">Box EPC tags linked to titles and locations from mobile bulk box tagging.</p>
          </div>
          <div className="rk-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">Books inside boxes</p>
            <div className="mt-3 text-3xl font-bold text-[#1f2937]">{loading ? '...' : boxQuantityTotal}</div>
            <p className="mt-2 text-sm text-[#6b7280]">Sum of the recorded quantities across the currently filtered tagged boxes.</p>
          </div>
        </section>

        <section className="rk-surface rounded-[28px] overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#f3c6cc] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[#1f2937]">Inventory records</h2>
              <p className="text-sm text-[#6b7280]">Each row keeps the linked title, ISBN, assigned location, and current status.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#fff0f2] px-3 py-1 text-xs font-semibold text-[#9f1027]">
              <MapPin size={13} />
              Location-aware feed
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[#fff8f9]">
                <tr className="border-b border-[#f3c6cc]">
                  {['Title', 'ISBN', 'Category', 'Location', 'Packaging', 'EPC', 'Status', 'Updated'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f1027]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-[#fdf0f2]">
                      {Array.from({ length: 8 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-4">
                          <div className="h-3.5 w-20 rounded bg-[#f7d8dd] animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-sm text-[#6b7280]">
                      No inventory records for the current filters.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-[#fdf0f2] hover:bg-[#fff8f9] transition-colors">
                      <td className="px-4 py-4 align-top">
                        <div className="max-w-[240px] truncate font-semibold text-[#1f2937]">{item.book?.title ?? '-'}</div>
                        <div className="mt-1 text-xs text-[#6b7280]">
                          {item.book?.author?.trim() || item.book?.publisher?.trim() || 'No metadata'}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top font-mono text-xs text-[#6b7280]">{item.book?.isbn ?? '-'}</td>
                      <td className="px-4 py-4 align-top text-[#374151]">{item.book?.category ?? '-'}</td>
                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex rounded-full bg-[#fff0f2] px-2.5 py-1 text-xs font-semibold text-[#9f1027]">
                          {item.location?.trim() || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex rounded-full bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#1d4ed8]">
                          Single Copy
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <code className="rounded-lg bg-[#fff5f6] px-2 py-1 text-[11px] text-[#9f1027]">{item.epc_tag}</code>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-4 align-top text-xs text-[#6b7280] whitespace-nowrap">
                        {formatDateTime(item.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#f3c6cc] bg-[#fff8f9] px-5 py-3 text-sm text-[#6b7280]">
            <span>{rangeText}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rk-button-ghost rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9f1027]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rk-button-ghost rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="rk-surface rounded-[28px] overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#f3c6cc] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[#1f2937]">Tagged box records</h2>
              <p className="text-sm text-[#6b7280]">Bulk box tags created in the mobile app appear here with their recorded title, quantity, and location.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#fff0f2] px-3 py-1 text-xs font-semibold text-[#9f1027]">
              <BookOpen size={13} />
              Box tagging
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[#fff8f9]">
                <tr className="border-b border-[#f3c6cc]">
                  {['Title', 'ISBN', 'Category', 'Location', 'Packaging', 'Box EPC', 'Quantity', 'Updated'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9f1027]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-[#fdf0f2]">
                      {Array.from({ length: 8 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-4">
                          <div className="h-3.5 w-20 rounded bg-[#f7d8dd] animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : boxItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-sm text-[#6b7280]">
                      No tagged boxes for the current filters.
                    </td>
                  </tr>
                ) : (
                  boxItems.map((item) => (
                    <tr key={item.id} className="border-b border-[#fdf0f2] hover:bg-[#fff8f9] transition-colors">
                      <td className="px-4 py-4 align-top">
                        <div className="max-w-[240px] truncate font-semibold text-[#1f2937]">{item.book?.title ?? '-'}</div>
                      </td>
                      <td className="px-4 py-4 align-top font-mono text-xs text-[#6b7280]">{item.book?.isbn ?? '-'}</td>
                      <td className="px-4 py-4 align-top text-[#374151]">{item.book?.category ?? '-'}</td>
                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex rounded-full bg-[#fff0f2] px-2.5 py-1 text-xs font-semibold text-[#9f1027]">
                          {item.location?.trim() || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex rounded-full bg-[#fef3c7] px-2.5 py-1 text-xs font-semibold text-[#92400e]">
                          In Box
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <code className="rounded-lg bg-[#fff5f6] px-2 py-1 text-[11px] text-[#9f1027]">{item.epc_tag}</code>
                      </td>
                      <td className="px-4 py-4 align-top font-semibold text-[#1f2937]">{item.quantity}</td>
                      <td className="px-4 py-4 align-top text-xs text-[#6b7280] whitespace-nowrap">
                        {formatDateTime(item.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
