'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  LayoutDashboard,
  Layers,
  Loader2,
  Radio,
  Scan,
  StopCircle,
  Trash2,
  XCircle,
  X,
} from 'lucide-react';

import CsvTitleAssist from '@/components/CsvTitleAssist';
import StatusBadge from '@/components/StatusBadge';
import { parseLocation } from '@/lib/location';
import { createClient } from '@/lib/supabase/client';
import { BookCopyWithMaster, CsvTitleCandidate } from '@/types';

type AppMode = 'home' | 'single' | 'bulk';
type SinglePhase = 'waiting' | 'checking' | 'exists' | 'new_tag' | 'saving' | 'saved' | 'error';

interface SingleForm {
  title: string;
  isbn: string;
  category: string;
  author: string;
  publisher: string;
  edition: string;
  list_price: string;
  location: string;
}

const singleInitialForm: SingleForm = {
  title: '',
  isbn: '',
  category: '',
  author: '',
  publisher: '',
  edition: '',
  list_price: '',
  location: '',
};

export default function ScanPage() {
  const [mode, setMode] = useState<AppMode>('home');

  return (
    <div className="min-h-screen bg-white text-[#1f2937] flex flex-col max-w-md mx-auto overflow-x-hidden">
      {mode === 'home' && <HomeScreen onSelect={setMode} />}
      {mode === 'single' && <SingleMode onBack={() => setMode('home')} />}
      {mode === 'bulk' && <BulkMode onBack={() => setMode('home')} />}
    </div>
  );
}

function HomeScreen({ onSelect }: { onSelect: (mode: AppMode) => void }) {
  return (
    <div className="flex flex-col min-h-screen px-4 pt-8 pb-6">
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-8 h-8 relative rounded-lg overflow-hidden border border-[#f3c6cc] bg-white shrink-0">
          <Image src="/aiec-logo.png" alt="AIEC" fill className="object-contain p-1" />
        </div>
        <div>
          <div className="text-[#1f2937] font-bold text-base leading-none">StockMind</div>
          <div className="text-[#6b7280] text-[10px] mt-0.5">RFID Scanner</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelect('single')}
          className="w-full text-left bg-white border border-[#f3c6cc] rounded-xl p-4 hover:border-[#c8102e] hover:bg-[#fff5f6] active:scale-[0.98] transition-all"
        >
          <div className="flex items-start justify-between mb-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#fff0f2] border border-[#f3c6cc] flex items-center justify-center">
              <Scan size={16} className="text-[#c8102e]" />
            </div>
            <span className="text-[9px] text-[#c8102e] border border-[#f3c6cc] bg-[#fff0f2] rounded px-1.5 py-0.5 font-medium uppercase tracking-wider">Single</span>
          </div>
          <div className="text-[#1f2937] font-semibold text-sm mb-1">Single Add</div>
          <div className="text-[#6b7280] text-xs leading-relaxed">Scan one tag — verify or register.</div>
        </button>

        <button
          type="button"
          onClick={() => onSelect('bulk')}
          className="w-full text-left bg-white border border-[#f3c6cc] rounded-xl p-4 hover:border-[#c8102e] hover:bg-[#fff5f6] active:scale-[0.98] transition-all"
        >
          <div className="flex items-start justify-between mb-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#fff0f2] border border-[#f3c6cc] flex items-center justify-center">
              <Layers size={16} className="text-[#c8102e]" />
            </div>
            <span className="text-[9px] text-[#c8102e] border border-[#f3c6cc] bg-[#fff0f2] rounded px-1.5 py-0.5 font-medium uppercase tracking-wider">Bulk</span>
          </div>
          <div className="text-[#1f2937] font-semibold text-sm mb-1">Bulk Scan</div>
          <div className="text-[#6b7280] text-xs leading-relaxed">Broadcast tags live to desktop.</div>
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-[#f3c6cc]">
        <Link href="/" className="flex items-center gap-1.5 text-[11px] text-[#6b7280] hover:text-[#c8102e] transition-colors">
          <LayoutDashboard size={12} />
          Open Dashboard
        </Link>
      </div>
    </div>
  );
}

function SingleMode({ onBack }: { onBack: () => void }) {
  const supabase = createClient();
  const [phase, setPhase] = useState<SinglePhase>('waiting');
  const [epc, setEpc] = useState('');
  const [savedCopyId, setSavedCopyId] = useState<string | null>(null);
  const [existing, setExisting] = useState<BookCopyWithMaster | null>(null);
  const [form, setForm] = useState<SingleForm>(singleInitialForm);
  const [error, setError] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyCsvCandidate = useCallback((candidate: CsvTitleCandidate) => {
    setForm((prev) => ({
      ...prev,
      title: candidate.title || prev.title,
      isbn: candidate.isbn || prev.isbn,
      category: candidate.category || prev.category,
      author: candidate.author || prev.author,
      publisher: candidate.publisher || prev.publisher,
      edition: candidate.edition || prev.edition,
      list_price: candidate.list_price || prev.list_price,
      location: candidate.location || prev.location,
    }));
  }, []);

  const reset = useCallback(() => {
    if (autoResetRef.current) clearTimeout(autoResetRef.current);
    setPhase('waiting');
    setEpc('');
    setSavedCopyId(null);
    setExisting(null);
    setForm(singleInitialForm);
    setError('');
    setScanInput('');
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }, []);

  const handleEpc = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (autoResetRef.current) clearTimeout(autoResetRef.current);
      setEpc(trimmed);
      setError('');
      setScanInput('');
      setPhase('checking');

      const { data, error: dbErr } = await supabase
        .from('book_copies')
        .select('*, books_master(*)')
        .eq('epc_tag', trimmed)
        .maybeSingle();

      if (dbErr) {
        setError(dbErr.message);
        setPhase('error');
        return;
      }

      void supabase.channel('rfid-scan').send({
        type: 'broadcast',
        event: 'epc_scanned',
        payload: { epc: trimmed, from: 'handheld' },
      });

      if (data) {
        setExisting(data as BookCopyWithMaster);
        setPhase('exists');
        autoResetRef.current = setTimeout(reset, 4000);
      } else {
        setExisting(null);
        setPhase('new_tag');
      }
    },
    [supabase, reset]
  );

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setPhase('saving');
    setError('');

    const parsedLocation = parseLocation({ location: form.location || null });
    const res = await fetch('/api/inventory/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epc,
        title: form.title.trim(),
        isbn: form.isbn || null,
        category: form.category || null,
        author: form.author || null,
        publisher: form.publisher || null,
        edition: form.edition || null,
        list_price: form.list_price ? Number(form.list_price) : null,
        location: form.location || null,
        location_type: parsedLocation.locationType,
        location_name: parsedLocation.locationName,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to save record.');
      setPhase('error');
      return;
    }

    const responseData = await res.json().catch(() => ({}));
    setSavedCopyId(responseData?.copy_id ?? null);
    setPhase('saved');
    autoResetRef.current = setTimeout(reset, 2000);
  };

  const handleDeleteSaved = async () => {
    if (!savedCopyId) return;
    setDeleting(true);
    await fetch(`/api/inventory/copies/${savedCopyId}`, { method: 'DELETE' });
    setDeleting(false);
    reset();
  };

  useEffect(() => {
    scanInputRef.current?.focus();
    return () => { if (autoResetRef.current) clearTimeout(autoResetRef.current); };
  }, []);

  const scanVisible = phase === 'waiting' || phase === 'error' || phase === 'saved';

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2.5 px-4 pt-6 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 rounded-lg border border-[#f3c6cc] bg-white flex items-center justify-center text-[#6b7280] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors shrink-0"
        >
          <ArrowLeft size={13} />
        </button>
        <div>
          <div className="text-[#1f2937] font-semibold text-sm">Single Add</div>
          <div className="text-[#6b7280] text-[10px]">Scan · verify · register</div>
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 space-y-3">
        {/* Status card */}
        <div className={`rounded-xl p-4 border transition-colors ${
          phase === 'waiting'   ? 'border-[#f3c6cc] bg-[#fff5f6]'
          : phase === 'exists' ? 'border-amber-200 bg-amber-50'
          : phase === 'saved'  ? 'border-emerald-200 bg-emerald-50'
          : phase === 'error'  ? 'border-red-200 bg-red-50'
          : 'border-blue-200 bg-blue-50'
        }`}>
          <div className="flex items-center gap-2.5">
            {phase === 'waiting'  && <Radio size={17} className="text-[#c8102e] scan-pulse shrink-0" />}
            {phase === 'checking' && <Loader2 size={17} className="text-blue-500 animate-spin shrink-0" />}
            {phase === 'exists'   && <CheckCircle2 size={17} className="text-amber-500 shrink-0" />}
            {phase === 'new_tag'  && <Scan size={17} className="text-blue-500 shrink-0" />}
            {phase === 'saving'   && <Loader2 size={17} className="text-blue-500 animate-spin shrink-0" />}
            {phase === 'saved'    && <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />}
            {phase === 'error'    && <XCircle size={17} className="text-red-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1f2937] truncate">
                {phase === 'waiting'  && 'Ready to scan'}
                {phase === 'checking' && 'Checking…'}
                {phase === 'exists'   && 'Already registered'}
                {phase === 'new_tag'  && 'New tag — fill details'}
                {phase === 'saving'   && 'Saving…'}
                {phase === 'saved'    && 'Saved ✓'}
                {phase === 'error'    && 'Error'}
              </div>
              {epc && <code className="text-[10px] text-[#6b7280] font-mono truncate block mt-0.5">{epc}</code>}
            </div>
            {(phase === 'exists' || phase === 'new_tag' || phase === 'saved' || phase === 'error') && (
              <button type="button" onClick={reset} className="text-[#9ca3af] hover:text-[#c8102e] transition-colors shrink-0 p-1" title="Clear / scan next">
                <X size={14} />
              </button>
            )}
          </div>

          {phase === 'exists' && existing && (
            <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[#6b7280] text-[10px] mb-0.5">Title</div>
                  <div className="text-[#1f2937] font-medium text-xs leading-tight truncate">{existing.books_master?.title}</div>
                </div>
                <div>
                  <div className="text-[#6b7280] text-[10px] mb-0.5">Status</div>
                  <div className="mt-0.5"><StatusBadge status={existing.status} /></div>
                </div>
                <div>
                  <div className="text-[#6b7280] text-[10px] mb-0.5">Category</div>
                  <div className="text-[#6b7280] text-xs truncate">{existing.books_master?.category ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[#6b7280] text-[10px] mb-0.5">Location</div>
                  <div className="text-[#6b7280] text-xs truncate">{existing.location ?? '—'}</div>
                </div>
              </div>
              <p className="text-[10px] text-[#9ca3af]">Auto-scanning next in 4 s…</p>
            </div>
          )}

          {phase === 'saved' && (
            <div className="mt-3 border-t border-emerald-200 pt-3 flex items-center justify-between gap-2">
              <p className="text-[10px] text-emerald-600">Saved. Auto-scanning next…</p>
              {savedCopyId && (
                <button
                  type="button"
                  onClick={handleDeleteSaved}
                  disabled={deleting}
                  className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                >
                  <Trash2 size={11} />
                  {deleting ? 'Deleting…' : 'Undo / Delete'}
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">{error}</div>
        )}

        {/* New tag form */}
        {phase === 'new_tag' && (
          <div className="border border-[#f3c6cc] rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#1f2937]">Register this tag</div>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 text-[10px] text-[#6b7280] hover:text-red-500 transition-colors"
                title="Discard and scan another"
              >
                <Trash2 size={11} />
                Discard
              </button>
            </div>

            <CsvTitleAssist onSelect={applyCsvCandidate} />

            <div>
              <label className="text-[10px] text-[#6b7280] font-medium block mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Book title"
                className="rk-input w-full px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#6b7280] font-medium block mb-1">ISBN</label>
                <input
                  type="text"
                  value={form.isbn}
                  onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                  placeholder="ISBN"
                  className="rk-input w-full px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#6b7280] font-medium block mb-1">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. English"
                  className="rk-input w-full px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[#6b7280] font-medium block mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Shelf: A1"
                className="rk-input w-full px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="Author"
                className="rk-input px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
              />
              <input
                type="text"
                value={form.publisher}
                onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                placeholder="Publisher"
                className="rk-input px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={form.edition}
                onChange={(e) => setForm({ ...form, edition: e.target.value })}
                placeholder="Edition"
                className="rk-input px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.list_price}
                onChange={(e) => setForm({ ...form, list_price: e.target.value })}
                placeholder="Price"
                className="rk-input px-3 py-2 text-xs placeholder-[#9ca3af] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="rk-button-primary w-full py-2.5 rounded-lg font-semibold text-xs"
            >
              Save to Inventory
            </button>
          </div>
        )}

        {/* Scan input */}
        {scanVisible && (
          <div className="border border-[#f3c6cc] rounded-xl p-3 bg-[#fff5f6]">
            <div className="text-[#c8102e] text-[10px] font-semibold mb-2">Tap here · pull trigger to scan</div>
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => {
                const value = e.target.value;
                setScanInput(value);
                if (value.includes('\n') || value.includes('\r')) {
                  const clean = value.replace(/[\r\n]/g, '').trim();
                  if (clean.length >= 4) void handleEpc(clean);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (scanInput.trim().length >= 4) void handleEpc(scanInput.trim());
                  e.preventDefault();
                }
              }}
              onBlur={() => {
                if (scanInput.trim().length >= 8) void handleEpc(scanInput.trim());
              }}
              placeholder="Tap to focus and scan"
              autoComplete="off"
              className="rk-input w-full px-3 py-3 font-mono text-sm placeholder:text-[#9ca3af] focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BulkMode({ onBack }: { onBack: () => void }) {
  const supabase = createClient();
  const [isScanning, setIsScanning] = useState(false);
  const [tags, setTags] = useState<Array<{ epc: string; at: Date }>>([]);
  const [scanInput, setScanInput] = useState('');
  const epcSet = useRef<Set<string>>(new Set());
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleEpc = useCallback(
    (raw: string) => {
      const epc = raw.trim().toUpperCase();
      if (!epc || epcSet.current.has(epc)) return;
      epcSet.current.add(epc);
      setTags((prev) => [{ epc, at: new Date() }, ...prev]);
      setScanInput('');
      void supabase.channel('rfid-bulk').send({
        type: 'broadcast',
        event: 'bulk_epc',
        payload: { epc, from: 'handheld' },
      });
    },
    [supabase]
  );

  useEffect(() => {
    window.onRFIDScan = (epc: string) => { if (isScanning) handleEpc(epc); };
  }, [handleEpc, isScanning]);

  const reset = () => {
    epcSet.current.clear();
    setTags([]);
    setScanInput('');
    setIsScanning(false);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-2.5 px-4 pt-6 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 rounded-lg border border-[#f3c6cc] bg-white flex items-center justify-center text-[#6b7280] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors shrink-0"
        >
          <ArrowLeft size={13} />
        </button>
        <div>
          <div className="text-[#1f2937] font-semibold text-sm">Bulk Scan</div>
          <div className="text-[#6b7280] text-[10px]">Broadcast to desktop Bulk Add</div>
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 space-y-3">
        <button
          type="button"
          onClick={() => {
            setIsScanning((v) => !v);
            if (!isScanning) setTimeout(() => scanInputRef.current?.focus(), 100);
          }}
          className={`w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
            isScanning
              ? 'bg-red-50 border border-red-200 text-red-600'
              : 'rk-button-primary rounded-xl'
          }`}
        >
          {isScanning ? <StopCircle size={17} /> : <Scan size={17} />}
          {isScanning ? 'Stop Scanning' : 'Start Scanning'}
        </button>

        {isScanning && (
          <div className="border border-[#f3c6cc] rounded-xl p-3 bg-[#fff5f6]">
            <div className="text-[#c8102e] text-[10px] font-semibold mb-2">Tap here · pull trigger</div>
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => {
                const value = e.target.value;
                setScanInput(value);
                if (value.includes('\n') || value.includes('\r')) {
                  const clean = value.replace(/[\r\n]/g, '').trim();
                  if (clean.length >= 4) handleEpc(clean);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (scanInput.trim().length >= 4) handleEpc(scanInput.trim());
                  e.preventDefault();
                }
              }}
              onBlur={() => {
                if (scanInput.trim().length >= 8) handleEpc(scanInput.trim());
              }}
              placeholder="Tap to focus and scan tags"
              autoComplete="off"
              className="rk-input w-full px-3 py-3 font-mono text-sm placeholder:text-[#9ca3af] focus:outline-none"
            />
          </div>
        )}

        {tags.length > 0 && (
          <div className="border border-[#f3c6cc] rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[#f3c6cc] bg-[#fff5f6] flex justify-between items-center">
              <span className="text-[10px] text-[#6b7280] font-medium uppercase tracking-wider">Scanned ({tags.length})</span>
              <button type="button" onClick={reset} className="text-[#9ca3af] hover:text-red-500 text-[10px] transition-colors flex items-center gap-1">
                <Trash2 size={10} />
                Clear all
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-[#f3c6cc]">
              {tags.map((tag) => (
                <div key={tag.epc} className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#c8102e] shrink-0" />
                  <code className="text-[10px] text-[#6b7280] font-mono flex-1 truncate">{tag.epc}</code>
                  <span className="text-[9px] text-[#9ca3af] shrink-0">{tag.at.toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
