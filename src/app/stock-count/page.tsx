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
  matched: BookCopyWithMaster | null; // null = unexpected / not in system
}

export default function StockCountPage() {
  const supabase = createClient();

  // All copies from DB (optionally filtered by location)
  const [allCopies, setAllCopies] = useState<BookCopyWithMaster[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loadingDB, setLoadingDB] = useState(true);

  // Session config
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [sessionName, setSessionName] = useState('');

  // Count state
  const [status, setStatus] = useState<CountStatus>('idle');
  const [scanned, setScanned] = useState<ScannedEntry[]>([]);

  // Clear box tags
  const [clearingBoxes, setClearingBoxes] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Keyboard-wedge input
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

    // Derive unique locations
    const locs = Array.from(
      new Set(all.map((c) => c.location ?? '').filter(Boolean))
    ).sort();
    setLocations(locs);
    setLoadingDB(false);
  }, [supabase]);

  useEffect(() => { fetchCopies(); }, [fetchCopies]);

  // Focus the hidden input whenever counting
  useEffect(() => {
    if (status === 'counting') {
      inputRef.current?.focus();
    }
  }, [status]);

  // Expected set: copies in the selected location (or all)
  const expected: BookCopyWithMaster[] = allCopies.filter((c) => {
    if (filterLocation === 'all') return true;
    return (c.location ?? '') === filterLocation;
  });

  const expectedByEpc = new Map(expected.map((c) => [c.epc_tag, c]));

  // Derived results
  const scannedEpcs = new Set(scanned.map((s) => s.epc));

  const matched   = scanned.filter((s) => s.matched !== null);
  const unexpected = scanned.filter((s) => s.matched === null);
  const missing   = expected.filter((c) => !scannedEpcs.has(c.epc_tag));

  const handleEpcInput = (raw: string) => {
    const epc = raw.trim().toUpperCase();
    if (!epc) return;

    // Dedupe
    if (scanned.some((s) => s.epc === epc)) {
      setEpcBuffer('');
      return;
    }

    const copy = allCopies.find((c) => c.epc_tag === epc) ?? null;
    setScanned((prev) => [...prev, { epc, at: new Date(), matched: copy }]);
    setEpcBuffer('');
  };

  const removeScanned = (epc: string) => {
    setScanned((prev) => prev.filter((s) => s.epc !== epc));
  };

  const startCount = () => {
    setScanned([]);
    setStatus('counting');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const finishCount = () => setStatus('done');
  const resetCount  = () => { setScanned([]); setStatus('idle'); };

  // Export CSV
  const exportCSV = () => {
    const rows: string[][] = [
      ['Result', 'EPC Tag', 'Title', 'ISBN', 'Category', 'Expected Location', 'DB Status', 'Scanned At'],
    ];

    scanned.forEach((s) => {
      const c = s.matched;
      rows.push([
        c ? 'Found' : 'Unexpected',
        s.epc,
        c?.books_master?.title ?? 'â€”',
        c?.books_master?.isbn ?? 'â€”',
        c?.books_master?.category ?? 'â€”',
        c?.location ?? 'â€”',
        c?.status ?? 'â€”',
        s.at.toLocaleString('en-GB'),
      ]);
    });

    missing.forEach((c) => {
      rows.push([
        'Missing',
        c.epc_tag,
        c.books_master?.title ?? 'â€”',
        c.books_master?.isbn ?? 'â€”',
        c.books_master?.category ?? 'â€”',
        c.location ?? 'â€”',
        c.status,
        'â€”',
      ]);
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
      if (res.ok) {
        await fetchCopies();
        resetCount();
      }
    } finally {
      setClearingBoxes(false);
      setClearConfirmOpen(false);
    }
  };

  const accuracyPct = expected.length > 0
    ? Math.round((matched.filter((s) => expectedByEpc.has(s.epc)).length / expected.length) * 100)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hidden keyboard-wedge input â€” always rendered so scanner can type into it */}
      <input
        ref={inputRef}
        value={epcBuffer}
        onChange={(e) => setEpcBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { handleEpcInput(epcBuffer); }
        }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ClipboardList size={18} className="text-amber-400" />
              Stock Count
            </h1>
            <p className="text-xs text-[#555] mt-1">
              Scan books in a location and compare against expected stock.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={clearingBoxes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors disabled:opacity-40"
              title="Clear all tagged box records"
            >
              <Trash2 size={12} />
              Clear Box Tags
            </button>
            <button
              type="button"
              onClick={fetchCopies}
              disabled={loadingDB}
              className="p-1.5 rounded-lg border border-[#2a2a2a] text-[#555] hover:text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-40"
              title="Refresh from DB"
            >
              <RefreshCw size={13} className={loadingDB ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Clear box tags confirmation dialog */}
        {clearConfirmOpen && (
          <div className="rk-surface rounded-xl p-5 border border-red-500/30 space-y-3">
            <div className="flex items-start gap-3">
              <Trash2 size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">Clear all box tags?</div>
                <p className="text-xs text-[#555] mt-1">
                  This soft-deletes every record in <code className="text-red-300">book_boxes</code> and resets the box count to zero.
                  Use this to restart the counting process. Individual book copies are not affected.
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
                className="px-4 py-2 rounded-lg border border-[#2a2a2a] text-[#888] hover:text-white text-xs transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* â”€â”€ SETUP PANEL (idle + done) â”€â”€ */}
        {status !== 'counting' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Config */}
            <div className="md:col-span-2 rk-surface rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Count Setup</h2>

              {/* Session name */}
              <div>
                <label className="text-xs text-[#555] font-medium block mb-1.5">Session label (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Main Warehouse audit, Box 3 count..."
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555] transition-colors"
                />
              </div>

              {/* Location filter */}
              <div>
                <label className="text-xs text-[#555] font-medium block mb-1.5">
                  <MapPin size={11} className="inline mr-1 text-[#c8102e]" />
                  Filter by location (what the system expects)
                </label>
                <div className="relative">
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full appearance-none bg-[#161616] border border-[#2a2a2a] rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-[#555] cursor-pointer"
                  >
                    <option value="all">All locations ({allCopies.length} copies)</option>
                    {locations.map((loc) => {
                      const cnt = allCopies.filter((c) => c.location === loc).length;
                      return (
                        <option key={loc} value={loc}>{loc} ({cnt} copies)</option>
                      );
                    })}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={startCount}
                  disabled={loadingDB}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-[#e6e6e6] transition-colors disabled:opacity-40"
                >
                  <ScanLine size={15} />
                  {status === 'done' ? 'Start New Count' : 'Start Counting'}
                </button>
                {status === 'done' && (
                  <button
                    type="button"
                    onClick={exportCSV}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#3a3a3a] transition-colors text-sm font-medium"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                )}
              </div>
            </div>

            {/* Expected summary */}
            <div className="rk-surface rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Expected</h2>
              <div className="text-4xl font-bold text-white">
                {loadingDB
                  ? <span className="inline-block w-16 h-9 bg-[#1e1e1e] rounded animate-pulse" />
                  : expected.length.toLocaleString()
                }
              </div>
              <p className="text-xs text-[#444]">
                {filterLocation === 'all' ? 'Total copies in DB' : `Copies assigned to "${filterLocation}"`}
              </p>

              {status === 'done' && accuracyPct !== null && (
                <div className="pt-2 border-t border-[#1e1e1e]">
                  <div className="text-xs text-[#555] mb-1">Accuracy</div>
                  <div className={`text-2xl font-bold ${accuracyPct === 100 ? 'text-emerald-400' : accuracyPct >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                    {accuracyPct}%
                  </div>
                  <div className="h-1.5 bg-[#1e1e1e] rounded-full mt-2 overflow-hidden">
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

        {/* â”€â”€ COUNTING PANEL â”€â”€ */}
        {status === 'counting' && (
          <div className="bg-[#111] border border-amber-500/40 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-sm font-semibold text-white">
                  Counting{sessionName ? ` â€” ${sessionName}` : ''}{filterLocation !== 'all' ? ` Â· ${filterLocation}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#555]">{scanned.length} scanned</span>
                <button
                  type="button"
                  onClick={finishCount}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold transition-colors"
                >
                  <CheckCircle2 size={13} />
                  Finish
                </button>
                <button
                  type="button"
                  onClick={resetCount}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#555] hover:text-red-400 text-xs transition-colors"
                  title="Cancel count"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Tap-to-focus zone */}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="w-full py-6 border-2 border-dashed border-[#2a2a2a] rounded-xl text-center text-[#444] hover:border-amber-500/40 hover:text-amber-400 transition-colors group"
            >
              <ScanLine size={28} className="mx-auto mb-2 group-hover:text-amber-400 text-[#333]" />
              <span className="text-sm">Point scanner here and scan RFID tags</span>
              <span className="block text-xs text-[#333] mt-1">Tap to focus Â· Each scan auto-submits</span>
            </button>

            {/* Manual EPC entry fallback */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
                <input
                  type="text"
                  placeholder="Or type EPC manually and press Enterâ€¦"
                  value={epcBuffer}
                  onChange={(e) => setEpcBuffer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEpcInput(epcBuffer); }}
                  className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555] transition-colors font-mono"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                onClick={() => handleEpcInput(epcBuffer)}
                disabled={!epcBuffer.trim()}
                className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-[#e6e6e6] transition-colors disabled:opacity-40"
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
                      s.matched
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    {s.matched
                      ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      : <AlertCircle size={13} className="text-red-400 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium truncate">
                        {s.matched?.books_master?.title ?? <span className="text-red-300">Not in system</span>}
                      </div>
                      <div className="text-[#444] text-[10px] font-mono">{s.epc}</div>
                    </div>
                    {s.matched && <StatusBadge status={s.matched.status} />}
                    <button type="button" onClick={() => removeScanned(s.epc)} className="text-[#333] hover:text-red-400 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ RESULTS (after finish) â”€â”€ */}
        {status === 'done' && (
          <div className="space-y-6">

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Expected', value: expected.length, color: 'text-white', bg: 'bg-white/5', icon: ClipboardList },
                { label: 'Scanned', value: scanned.length, color: 'text-amber-400', bg: 'bg-amber-500/5', icon: ScanLine },
                { label: 'Found', value: matched.length, color: 'text-emerald-400', bg: 'bg-emerald-500/5', icon: CheckCircle2 },
                { label: 'Missing', value: missing.length, color: missing.length > 0 ? 'text-red-400' : 'text-emerald-400', bg: missing.length > 0 ? 'bg-red-500/5' : 'bg-emerald-500/5', icon: AlertTriangle },
              ].map(({ label, value, color, bg, icon: Icon }) => (
                <div key={label} className={`${bg} border border-[#2a2a2a] rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#555]">{label}</span>
                    <Icon size={13} className={color} />
                  </div>
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Unexpected */}
            {unexpected.length > 0 && (
              <ResultSection
                title="Unexpected â€” scanned but not in expected set"
                icon={<AlertCircle size={14} className="text-amber-400" />}
                count={unexpected.length}
                color="amber"
              >
                {unexpected.map((s) => (
                  <ResultRow key={s.epc} epc={s.epc} copy={s.matched} at={s.at} tag="unexpected" />
                ))}
              </ResultSection>
            )}

            {/* Missing */}
            {missing.length > 0 && (
              <ResultSection
                title="Missing â€” expected but not scanned"
                icon={<AlertTriangle size={14} className="text-red-400" />}
                count={missing.length}
                color="red"
              >
                {missing.map((c) => (
                  <ResultRow key={c.epc_tag} epc={c.epc_tag} copy={c} at={null} tag="missing" />
                ))}
              </ResultSection>
            )}

            {/* All scanned */}
            <ResultSection
              title="All scanned items"
              icon={<ScanLine size={14} className="text-[#555]" />}
              count={scanned.length}
              color="neutral"
              collapsible
            >
              {scanned.map((s) => (
                <ResultRow key={s.epc} epc={s.epc} copy={s.matched} at={s.at} tag={s.matched ? 'found' : 'unexpected'} />
              ))}
            </ResultSection>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ResultSection({
  title, icon, count, color, children, collapsible,
}: {
  title: string; icon: React.ReactNode; count: number;
  color: 'amber' | 'red' | 'emerald' | 'neutral';
  children: React.ReactNode; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const borderMap = { amber: 'border-amber-500/20', red: 'border-red-500/20', emerald: 'border-emerald-500/20', neutral: 'border-[#2a2a2a]' };

  return (
    <div className={`bg-[#111] border ${borderMap[color]} rounded-xl overflow-hidden`}>
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 ${collapsible ? 'cursor-pointer hover:bg-[#161616]' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="text-xs text-[#444] bg-[#1e1e1e] px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {collapsible && (
          <ChevronDown size={14} className={`text-[#555] transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div className="border-t border-[#1e1e1e] divide-y divide-[#1a1a1a] max-h-80 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  epc, copy, at, tag,
}: {
  epc: string;
  copy: BookCopyWithMaster | null;
  at: Date | null;
  tag: 'found' | 'missing' | 'unexpected';
}) {
  const dotColor = tag === 'found' ? 'bg-emerald-400' : tag === 'missing' ? 'bg-red-400' : 'bg-amber-400';
  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#161616] transition-colors">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <div className="text-white text-xs font-medium truncate">
          {copy?.books_master?.title ?? <span className="text-[#555] italic">Unknown â€” not in system</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <code className="text-[10px] text-[#555] font-mono">{epc}</code>
          {copy?.books_master?.category && <span className="text-[10px] text-[#444]">{copy.books_master.category}</span>}
          {copy?.location && <span className="text-[10px] text-[#444] flex items-center gap-0.5"><MapPin size={9} />{copy.location}</span>}
          {at && <span className="text-[10px] text-[#333]">{at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>
      {copy && <StatusBadge status={copy.status} />}
      <span className={`text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded ${
        tag === 'found'      ? 'text-emerald-400 bg-emerald-500/10' :
        tag === 'missing'    ? 'text-red-400 bg-red-500/10' :
        'text-amber-400 bg-amber-500/10'
      }`}>
        {tag}
      </span>
    </div>
  );
}

