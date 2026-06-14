/* eslint-disable react-hooks/set-state-in-effect */
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BookCopyWithMaster } from '@/types';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import StatusBadge from '@/components/StatusBadge';
import {
  ClipboardList, Search, RefreshCw, X, CheckCircle2,
  AlertCircle, AlertTriangle, ChevronDown, ScanLine,
  Download, MapPin, Trash2,
} from 'lucide-react';

type CountStatus = 'idle' | 'counting' | 'done';

interface ScannedEntry {
  epc: string;
  at: Date;
  matched: BookCopyWithMaster | null;
}

export default function StockCountPage() {
  const supabase = createClient();

  const [allCopies, setAllCopies] = useState<BookCopyWithMaster[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loadingDB, setLoadingDB] = useState(true);
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [sessionName, setSessionName] = useState('');
  const [status, setStatus] = useState<CountStatus>('idle');
  const [scanned, setScanned] = useState<ScannedEntry[]>([]);
  const [clearingBoxes, setClearingBoxes] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [epcBuffer, setEpcBuffer] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchCopies = useCallback(async () => {
    setLoadingDB(true);
    const { data, error } = await supabase
      .from('book_copies')
      .select('*, books_master(*)')
      .order('location', { ascending: true });
    if (error) { console.error(error); }
    const all = (data ?? []) as BookCopyWithMaster[];
    setAllCopies(all);
    const locs = Array.from(new Set(all.map((c) => c.location ?? '').filter(Boolean))).sort();
    setLocations(locs);
    setLoadingDB(false);
  }, [supabase]);

  useEffect(() => { fetchCopies(); }, [fetchCopies]);

  useEffect(() => {
    if (status === 'counting') inputRef.current?.focus();
  }, [status]);

  const expected: BookCopyWithMaster[] = allCopies.filter((c) =>
    filterLocation === 'all' ? true : (c.location ?? '') === filterLocation
  );
  const expectedByEpc = new Map(expected.map((c) => [c.epc_tag, c]));
  const scannedEpcs = new Set(scanned.map((s) => s.epc));
  const matched    = scanned.filter((s) => s.matched !== null);
  const unexpected = scanned.filter((s) => s.matched === null);
  const missing    = expected.filter((c) => !scannedEpcs.has(c.epc_tag));

  const handleEpcInput = (raw: string) => {
    const epc = raw.trim().toUpperCase();
    if (!epc) return;
    if (scanned.some((s) => s.epc === epc)) { setEpcBuffer(''); return; }
    const copy = allCopies.find((c) => c.epc_tag === epc) ?? null;
    setScanned((prev) => [...prev, { epc, at: new Date(), matched: copy }]);
    setEpcBuffer('');
  };

  const removeScanned = (epc: string) => setScanned((prev) => prev.filter((s) => s.epc !== epc));
  const startCount = () => { setScanned([]); setStatus('counting'); setTimeout(() => inputRef.current?.focus(), 100); };
  const finishCount = () => setStatus('done');
  const resetCount  = () => { setScanned([]); setStatus('idle'); };

  const exportCSV = () => {
    const rows: string[][] = [
      ['Result', 'EPC Tag', 'Title', 'ISBN', 'Category', 'Expected Location', 'DB Status', 'Scanned At'],
    ];
    scanned.forEach((s) => {
      const c = s.matched;
      rows.push([s.matched ? 'Found' : 'Unexpected', s.epc, c?.books_master?.title ?? '—', c?.books_master?.isbn ?? '—', c?.books_master?.category ?? '—', c?.location ?? '—', c?.status ?? '—', s.at.toLocaleString('en-GB')]);
    });
    missing.forEach((c) => {
      rows.push(['Missing', c.epc_tag, c.books_master?.title ?? '—', c.books_master?.isbn ?? '—', c.books_master?.category ?? '—', c.location ?? '—', c.status, '—']);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockcount-${sessionName || filterLocation}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAllBoxTags = async () => {
    setClearingBoxes(true);
    try {
      const res = await fetch('/api/inventory/boxes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'CLEAR_ALL_BOXES' }),
      });
      if (res.ok) { await fetchCopies(); resetCount(); }
    } finally {
      setClearingBoxes(false);
      setClearConfirmOpen(false);
    }
  };

  const accuracyPct = expected.length > 0
    ? Math.round((matched.filter((s) => expectedByEpc.has(s.epc)).length / expected.length) * 100)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* Hidden keyboard-wedge input */}
      <input
        ref={inputRef}
        value={epcBuffer}
        onChange={(e) => setEpcBuffer(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleEpcInput(epcBuffer); }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#1f2937] flex items-center gap-2">
              <ClipboardList size={18} className="text-amber-500" />
              Stock Count
            </h1>
            <p className="text-xs text-[#6b7280] mt-1">Scan books in a location and compare against expected stock.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={clearingBoxes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Trash2 size={12} />
              Clear Box Tags
            </button>
            <button
              type="button"
              onClick={fetchCopies}
              disabled={loadingDB}
              className="p-1.5 rounded-lg border border-[#f3c6cc] text-[#6b7280] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors disabled:opacity-40"
            >
              <RefreshCw size={13} className={loadingDB ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Clear box tags confirmation */}
        {clearConfirmOpen && (
          <div className="rk-card p-5 border-red-200 space-y-3">
            <div className="flex items-start gap-3">
              <Trash2 size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-[#1f2937]">Clear all box tags?</div>
                <p className="text-xs text-[#6b7280] mt-1">
                  This soft-deletes every record in <code className="text-red-500">book_boxes</code> and resets the box count to zero.
                  Individual book copies are not affected.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearAllBoxTags}
                disabled={clearingBoxes}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {clearingBoxes ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {clearingBoxes ? 'Clearing…' : 'Yes, clear all box tags'}
              </button>
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                disabled={clearingBoxes}
                className="rk-button-ghost px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Setup panel */}
        {status !== 'counting' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rk-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#1f2937]">Count Setup</h2>

              <div>
                <label className="text-xs text-[#6b7280] font-medium block mb-1.5">Session label (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Main Warehouse audit, Box 3 count..."
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="rk-input w-full px-3 py-2 text-sm placeholder-[#9ca3af] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-[#6b7280] font-medium block mb-1.5">
                  <MapPin size={11} className="inline mr-1 text-[#c8102e]" />
                  Filter by location (what the system expects)
                </label>
                <div className="relative">
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="rk-input w-full appearance-none pl-3 pr-8 py-2 text-sm cursor-pointer focus:outline-none"
                  >
                    <option value="all">All locations ({allCopies.length} copies)</option>
                    {locations.map((loc) => {
                      const cnt = allCopies.filter((c) => c.location === loc).length;
                      return <option key={loc} value={loc}>{loc} ({cnt} copies)</option>;
                    })}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={startCount}
                  disabled={loadingDB}
                  className="rk-button-primary flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40"
                >
                  <ScanLine size={15} />
                  {status === 'done' ? 'Start New Count' : 'Start Counting'}
                </button>
                {status === 'done' && (
                  <button
                    type="button"
                    onClick={exportCSV}
                    className="rk-button-ghost flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                )}
              </div>
            </div>

            {/* Expected summary */}
            <div className="rk-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-[#1f2937]">Expected</h2>
              <div className="text-4xl font-bold text-[#1f2937]">
                {loadingDB
                  ? <span className="inline-block w-16 h-9 bg-[#f3c6cc] rounded animate-pulse" />
                  : expected.length.toLocaleString()
                }
              </div>
              <p className="text-xs text-[#9ca3af]">
                {filterLocation === 'all' ? 'Total copies in DB' : `Copies assigned to "${filterLocation}"`}
              </p>

              {status === 'done' && accuracyPct !== null && (
                <div className="pt-2 border-t border-[#f3c6cc]">
                  <div className="text-xs text-[#6b7280] mb-1">Accuracy</div>
                  <div className={`text-2xl font-bold ${accuracyPct === 100 ? 'text-emerald-600' : accuracyPct >= 80 ? 'text-amber-500' : 'text-red-500'}`}>
                    {accuracyPct}%
                  </div>
                  <div className="h-1.5 bg-[#f3c6cc] rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${accuracyPct === 100 ? 'bg-emerald-500' : accuracyPct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${accuracyPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Counting panel */}
        {status === 'counting' && (
          <div className="rk-card border-amber-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-sm font-semibold text-[#1f2937]">
                  Counting{sessionName ? ` — ${sessionName}` : ''}{filterLocation !== 'all' ? ` · ${filterLocation}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9ca3af]">{scanned.length} scanned</span>
                <button
                  type="button"
                  onClick={finishCount}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 text-xs font-semibold transition-colors"
                >
                  <CheckCircle2 size={13} />
                  Finish
                </button>
                <button
                  type="button"
                  onClick={resetCount}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#f3c6cc] text-[#9ca3af] hover:text-red-500 text-xs transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Tap-to-focus zone */}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="w-full py-6 border-2 border-dashed border-[#f3c6cc] rounded-xl text-center text-[#9ca3af] hover:border-[#c8102e] hover:text-[#c8102e] transition-colors group"
            >
              <ScanLine size={28} className="mx-auto mb-2 group-hover:text-[#c8102e] text-[#f3c6cc]" />
              <span className="text-sm">Point scanner here and scan RFID tags</span>
              <span className="block text-xs text-[#9ca3af] mt-1">Tap to focus · Each scan auto-submits</span>
            </button>

            {/* Manual EPC entry */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                <input
                  type="text"
                  placeholder="Or type EPC manually and press Enter…"
                  value={epcBuffer}
                  onChange={(e) => setEpcBuffer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEpcInput(epcBuffer); }}
                  className="rk-input w-full pl-9 pr-4 py-2 text-sm placeholder-[#9ca3af] focus:outline-none font-mono"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                onClick={() => handleEpcInput(epcBuffer)}
                disabled={!epcBuffer.trim()}
                className="rk-button-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {/* Live scanned list */}
            {scanned.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {[...scanned].reverse().map((s) => (
                  <div
                    key={s.epc}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border fade-in ${
                      s.matched ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                    }`}
                  >
                    {s.matched
                      ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                      : <AlertCircle size={13} className="text-red-500 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-[#1f2937] text-xs font-medium truncate">
                        {s.matched?.books_master?.title ?? <span className="text-red-500">Not in system</span>}
                      </div>
                      <div className="text-[#9ca3af] text-[10px] font-mono">{s.epc}</div>
                    </div>
                    {s.matched && <StatusBadge status={s.matched.status} />}
                    <button type="button" onClick={() => removeScanned(s.epc)} className="text-[#9ca3af] hover:text-red-500 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {status === 'done' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Expected', value: expected.length,  color: 'text-[#1f2937]',   bg: 'bg-white border-[#f3c6cc]',         icon: ClipboardList },
                { label: 'Scanned',  value: scanned.length,   color: 'text-amber-500',    bg: 'bg-amber-50 border-amber-200',       icon: ScanLine },
                { label: 'Found',    value: matched.length,   color: 'text-emerald-600',  bg: 'bg-emerald-50 border-emerald-200',   icon: CheckCircle2 },
                { label: 'Missing',  value: missing.length,   color: missing.length > 0 ? 'text-red-500' : 'text-emerald-600', bg: missing.length > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200', icon: AlertTriangle },
              ].map(({ label, value, color, bg, icon: Icon }) => (
                <div key={label} className={`${bg} border rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#6b7280]">{label}</span>
                    <Icon size={13} className={color} />
                  </div>
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {unexpected.length > 0 && (
              <ResultSection title="Unexpected — scanned but not in expected set" icon={<AlertCircle size={14} className="text-amber-500" />} count={unexpected.length} color="amber">
                {unexpected.map((s) => <ResultRow key={s.epc} epc={s.epc} copy={s.matched} at={s.at} tag="unexpected" />)}
              </ResultSection>
            )}

            {missing.length > 0 && (
              <ResultSection title="Missing — expected but not scanned" icon={<AlertTriangle size={14} className="text-red-500" />} count={missing.length} color="red">
                {missing.map((c) => <ResultRow key={c.epc_tag} epc={c.epc_tag} copy={c} at={null} tag="missing" />)}
              </ResultSection>
            )}

            <ResultSection title="All scanned items" icon={<ScanLine size={14} className="text-[#6b7280]" />} count={scanned.length} color="neutral" collapsible>
              {scanned.map((s) => <ResultRow key={s.epc} epc={s.epc} copy={s.matched} at={s.at} tag={s.matched ? 'found' : 'unexpected'} />)}
            </ResultSection>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function ResultSection({
  title, icon, count, color, children, collapsible,
}: {
  title: string; icon: React.ReactNode; count: number;
  color: 'amber' | 'red' | 'emerald' | 'neutral';
  children: React.ReactNode; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const borderMap = { amber: 'border-amber-200', red: 'border-red-200', emerald: 'border-emerald-200', neutral: 'border-[#f3c6cc]' };
  const bgMap     = { amber: 'bg-amber-50',       red: 'bg-red-50',       emerald: 'bg-emerald-50',       neutral: 'bg-[#fff5f6]'    };

  return (
    <div className={`bg-white border ${borderMap[color]} rounded-xl overflow-hidden`}>
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 ${bgMap[color]} ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-[#1f2937]">{title}</span>
          <span className="text-xs text-[#6b7280] bg-white border border-[#f3c6cc] px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {collapsible && (
          <ChevronDown size={14} className={`text-[#9ca3af] transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div className={`border-t ${borderMap[color]} divide-y divide-[#f3c6cc] max-h-80 overflow-y-auto`}>
          {children}
        </div>
      )}
    </div>
  );
}

function ResultRow({ epc, copy, at, tag }: { epc: string; copy: BookCopyWithMaster | null; at: Date | null; tag: 'found' | 'missing' | 'unexpected' }) {
  const dotColor = tag === 'found' ? 'bg-emerald-400' : tag === 'missing' ? 'bg-red-400' : 'bg-amber-400';
  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#fff5f6] transition-colors">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[#1f2937] text-xs font-medium truncate">
          {copy?.books_master?.title ?? <span className="text-[#9ca3af] italic">Unknown — not in system</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <code className="text-[10px] text-[#9ca3af] font-mono">{epc}</code>
          {copy?.books_master?.category && <span className="text-[10px] text-[#6b7280]">{copy.books_master.category}</span>}
          {copy?.location && <span className="text-[10px] text-[#6b7280] flex items-center gap-0.5"><MapPin size={9} />{copy.location}</span>}
          {at && <span className="text-[10px] text-[#9ca3af]">{at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>
      {copy && <StatusBadge status={copy.status} />}
      <span className={`text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded ${
        tag === 'found'   ? 'text-emerald-600 bg-emerald-50' :
        tag === 'missing' ? 'text-red-500 bg-red-50' :
        'text-amber-500 bg-amber-50'
      }`}>
        {tag}
      </span>
    </div>
  );
}
