'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Radio, Scan, Smartphone, Wifi, XCircle } from 'lucide-react';

import CsvTitleAssist from '@/components/CsvTitleAssist';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import SelectOrAdd from '@/components/SelectOrAdd';
import StatusBadge from '@/components/StatusBadge';
import { useSettings } from '@/hooks/useSettings';
import { locationTypeLabel, parseLocation } from '@/lib/location';
import { createClient } from '@/lib/supabase/client';
import { BookCopyWithMaster, CsvTitleCandidate } from '@/types';

type Phase = 'waiting' | 'checking' | 'already_exists' | 'new_tag' | 'saving' | 'saved' | 'error';

interface FormData {
  title: string;
  isbn: string;
  category: string;
  author: string;
  publisher: string;
  edition: string;
  list_price: string;
  location_type: 'warehouse' | 'stock_room' | 'shelf';
  location: string;
}

const initialForm: FormData = {
  title: '',
  isbn: '',
  category: '',
  author: '',
  publisher: '',
  edition: '',
  list_price: '',
  location_type: 'shelf',
  location: '',
};

const inputCls =
  'w-full border border-[#f3c6cc] rounded-xl px-3.5 py-2.5 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-[#c8102e] bg-white transition-colors';

export default function SingleAddPage() {
  const supabase = createClient();
  const { categories, locations, addCategory, addLocation } = useSettings();

  const [phase, setPhase] = useState<Phase>('waiting');
  const [epc, setEpc] = useState('');
  const [existingCopy, setExistingCopy] = useState<BookCopyWithMaster | null>(null);
  const [form, setForm] = useState<FormData>(initialForm);
  const [error, setError] = useState('');
  const [handheldConnected, setHandheldConnected] = useState(false);
  const [lastHandheldFlash, setLastHandheldFlash] = useState(false);

  const wedgeInputRef = useRef<HTMLInputElement>(null);
  const phaseRef = useRef<Phase>('waiting');

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const applyCsvCandidate = useCallback((candidate: CsvTitleCandidate) => {
    const parsedLocation = parseLocation({ location: candidate.location });
    setForm((prev) => ({
      ...prev,
      title: candidate.title || prev.title,
      isbn: candidate.isbn || prev.isbn,
      category: candidate.category || prev.category,
      author: candidate.author || prev.author,
      publisher: candidate.publisher || prev.publisher,
      edition: candidate.edition || prev.edition,
      list_price: candidate.list_price || prev.list_price,
      location_type: parsedLocation.locationType ?? prev.location_type,
      location: parsedLocation.locationName || candidate.location || prev.location,
    }));
  }, []);

  const handleEpc = useCallback(async (scannedEpc: string) => {
    const trimmed = scannedEpc.trim();
    if (!trimmed) return;
    setEpc(trimmed);
    setError('');
    setPhase('checking');

    const { data, error: dbErr } = await supabase
      .from('book_copies')
      .select('*, books_master(*)')
      .eq('epc_tag', trimmed)
      .maybeSingle();

    if (dbErr) { setError(dbErr.message); setPhase('error'); return; }

    if (data) { setExistingCopy(data as BookCopyWithMaster); setPhase('already_exists'); }
    else { setExistingCopy(null); setPhase('new_tag'); }
  }, [supabase]);

  useEffect(() => { window.onRFIDScan = handleEpc; }, [handleEpc]);

  useEffect(() => {
    const channel = supabase
      .channel('rfid-scan')
      .on('broadcast', { event: 'epc_scanned' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const incoming = typeof payload?.epc === 'string' ? payload.epc : '';
        if (!incoming) return;
        setHandheldConnected(true);
        setLastHandheldFlash(true);
        setTimeout(() => setLastHandheldFlash(false), 1200);
        const current = phaseRef.current;
        if (current === 'waiting' || current === 'saved' || current === 'error') void handleEpc(incoming);
      })
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') setHandheldConnected(true); });
    return () => { void supabase.removeChannel(channel); };
  }, [handleEpc, supabase]);

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Book title is required.'); return; }
    setPhase('saving');
    setError('');
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
        location_type: form.location_type,
        location_name: form.location || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to save book.');
      setPhase('error');
      return;
    }
    setPhase('saved');
  };

  const reset = () => {
    setPhase('waiting');
    setEpc('');
    setExistingCopy(null);
    setForm(initialForm);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 pb-24 sm:pb-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#1f2937]">Single Add</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">Scan one RFID tag and register it to a title.</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-500 shrink-0 ${
            lastHandheldFlash ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : handheldConnected ? 'border-blue-200 bg-blue-50 text-blue-600'
            : 'border-[#f3c6cc] bg-[#fffafa] text-[#9ca3af]'
          }`}>
            {lastHandheldFlash ? <Smartphone size={12} className="animate-bounce" />
              : handheldConnected ? <Wifi size={12} />
              : <Wifi size={12} className="opacity-40" />}
            {lastHandheldFlash ? 'EPC received' : handheldConnected ? 'Handheld ready' : 'Listening'}
          </div>
        </div>

        {/* Status card */}
        <div className={`border rounded-2xl p-5 mb-5 transition-colors ${
          phase === 'waiting'          ? 'border-[#f3c6cc] bg-[#fffafa]'
          : phase === 'already_exists' ? 'border-amber-200 bg-amber-50'
          : phase === 'saved'          ? 'border-emerald-200 bg-emerald-50'
          : phase === 'error'          ? 'border-red-200 bg-red-50'
          : 'border-blue-200 bg-blue-50'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            {phase === 'waiting'          && <Radio size={18} className="text-[#c8102e] scan-pulse" />}
            {phase === 'checking'         && <Loader2 size={18} className="text-blue-500 animate-spin" />}
            {phase === 'already_exists'   && <CheckCircle2 size={18} className="text-amber-500" />}
            {phase === 'new_tag'          && <Scan size={18} className="text-[#1f2937]" />}
            {phase === 'saving'           && <Loader2 size={18} className="text-[#1f2937] animate-spin" />}
            {phase === 'saved'            && <CheckCircle2 size={18} className="text-emerald-600" />}
            {phase === 'error'            && <XCircle size={18} className="text-red-500" />}
            <div>
              <div className="text-sm font-semibold text-[#1f2937]">
                {phase === 'waiting'        && 'Waiting for scan'}
                {phase === 'checking'       && 'Checking database…'}
                {phase === 'already_exists' && 'Tag already registered'}
                {phase === 'new_tag'        && 'New tag — fill in details'}
                {phase === 'saving'         && 'Saving…'}
                {phase === 'saved'          && 'Saved successfully'}
                {phase === 'error'          && 'Error'}
              </div>
              {epc && <code className="text-xs text-[#6b7280] font-mono">{epc}</code>}
            </div>
          </div>

          {phase === 'already_exists' && existingCopy && (
            <div className="space-y-3 mt-3 border-t border-amber-200 pt-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-[#6b7280]">Title</span>
                  <div className="text-[#1f2937] font-medium leading-tight">{existingCopy.books_master?.title}</div>
                </div>
                <div>
                  <span className="text-xs text-[#6b7280]">Status</span>
                  <div className="mt-0.5"><StatusBadge status={existingCopy.status} /></div>
                </div>
                <div>
                  <span className="text-xs text-[#6b7280]">ISBN</span>
                  <div className="text-[#6b7280] font-mono text-xs">{existingCopy.books_master?.isbn ?? '-'}</div>
                </div>
                <div>
                  <span className="text-xs text-[#6b7280]">Location</span>
                  <div className="text-[#6b7280] text-sm">{existingCopy.location ?? '-'}</div>
                </div>
              </div>
              <button onClick={reset} className="w-full py-2 rounded-xl border border-amber-200 text-sm text-amber-700 hover:bg-amber-100 transition-colors">
                Scan another tag
              </button>
            </div>
          )}

          {phase === 'saved' && (
            <button onClick={reset} className="w-full py-2 rounded-xl border border-emerald-200 text-sm text-emerald-700 hover:bg-emerald-100 transition-colors mt-3">
              Scan another tag
            </button>
          )}
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm">{error}</div>}

        {/* Registration form */}
        {phase === 'new_tag' && (
          <div className="border border-[#f3c6cc] rounded-2xl p-5 bg-white space-y-4">
            <h2 className="text-sm font-semibold text-[#1f2937]">Register New Tag</h2>
            <CsvTitleAssist onSelect={applyCsvCandidate} />
            <div>
              <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Book Title <span className="text-[#c8102e]">*</span></label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Graham Computer Science" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">ISBN</label>
                <input type="text" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} placeholder="978-3-16-148410-0" className={inputCls} />
              </div>
              <SelectOrAdd label="Category" value={form.category}
                onChange={(v) => setForm({ ...form, category: v === '__other__' ? '' : v })}
                options={categories}
                onAddNew={(v) => { addCategory(v); setForm((p) => ({ ...p, category: v })); }}
                placeholder="Select category" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Location Type</label>
              <select value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value as FormData['location_type'] })} className={inputCls}>
                <option value="warehouse">Warehouse</option>
                <option value="stock_room">Stock Room</option>
                <option value="shelf">Shelf</option>
              </select>
            </div>
            <SelectOrAdd label="Location Name"
              value={form.location ? `${locationTypeLabel(form.location_type)}: ${form.location}` : ''}
              onChange={(v) => {
                if (v === '__other__') { setForm({ ...form, location: '' }); return; }
                const p = v.includes(':') ? parseLocation({ location: v }) : { locationType: form.location_type, locationName: v };
                setForm({ ...form, location_type: p.locationType ?? form.location_type, location: p.locationName ?? v });
              }}
              options={locations}
              onAddNew={(v) => {
                const p = v.includes(':') ? parseLocation({ location: v }) : { locationType: form.location_type, locationName: v };
                addLocation(p.locationName ?? v, p.locationType ?? form.location_type);
                setForm((prev) => ({ ...prev, location_type: p.locationType ?? prev.location_type, location: p.locationName ?? v }));
              }}
              placeholder="Select location name" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Author</label>
                <input type="text" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Author name" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Publisher</label>
                <input type="text" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} placeholder="Publisher" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Edition</label>
                <input type="text" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} placeholder="e.g. 3rd" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">List Price</label>
                <input type="number" min="0" step="0.01" value={form.list_price} onChange={(e) => setForm({ ...form, list_price: e.target.value })} placeholder="0.00" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-[#c8102e] text-white text-sm font-semibold hover:bg-[#9f1027] transition-colors">Save to Inventory</button>
              <button onClick={reset} className="px-4 py-2.5 rounded-xl border border-[#f3c6cc] text-sm text-[#6b7280] hover:border-[#c8102e] hover:text-[#c8102e] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Keyboard wedge */}
        {(phase === 'waiting' || phase === 'error') && (
          <div className="border border-[#f3c6cc] rounded-2xl p-5 bg-white space-y-3 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Keyboard Wedge / Manual Entry</div>
              <div className="flex items-center gap-1.5 text-[10px] text-blue-500">
                <Smartphone size={10} />
                <span>Or scan from handheld — EPC appears automatically</span>
              </div>
            </div>
            <input
              ref={wedgeInputRef}
              type="text"
              autoComplete="off"
              placeholder="Tap here, then pull trigger on handheld (USB or BT)"
              className="w-full border border-emerald-300 rounded-xl px-3.5 py-2.5 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-emerald-500 bg-white font-mono transition-colors"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) { void handleEpc(v); (e.target as HTMLInputElement).value = ''; }
                e.preventDefault();
              }}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
