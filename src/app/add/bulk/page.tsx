'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Layers,
  Loader2,
  Radio,
  Scan,
  Smartphone,
  StopCircle,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';

import CsvTitleAssist from '@/components/CsvTitleAssist';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import SelectOrAdd from '@/components/SelectOrAdd';
import { useSettings } from '@/hooks/useSettings';
import { locationTypeLabel, parseLocation } from '@/lib/location';
import { createClient } from '@/lib/supabase/client';
import { CsvTitleCandidate } from '@/types';

interface BulkForm {
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

interface ScannedTag {
  epc: string;
  scannedAt: Date;
  fromHandheld: boolean;
}

type BulkPhase = 'setup' | 'scanning' | 'confirming' | 'done' | 'error';

const initialForm: BulkForm = {
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

export default function BulkAddPage() {
  const supabase = createClient();
  const { categories, locations, addCategory, addLocation } = useSettings();

  const [phase, setPhase] = useState<BulkPhase>('setup');
  const [form, setForm] = useState<BulkForm>(initialForm);
  const [tags, setTags] = useState<ScannedTag[]>([]);
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [handheldConnected, setHandheldConnected] = useState(false);
  const [lastFlash, setLastFlash] = useState(false);

  const epcSet = useRef<Set<string>>(new Set());
  const phaseRef = useRef<BulkPhase>('setup');

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

  const handleEpc = useCallback((raw: string, fromHandheld: boolean) => {
    const epc = raw.trim().toUpperCase();
    if (!epc || epcSet.current.has(epc)) return;
    epcSet.current.add(epc);
    setTags((prev) => [{ epc, scannedAt: new Date(), fromHandheld }, ...prev]);
  }, []);

  useEffect(() => {
    window.onRFIDScan = (epc: string) => {
      if (phaseRef.current === 'scanning') handleEpc(epc, false);
    };
  }, [handleEpc]);

  useEffect(() => {
    const channel = supabase
      .channel('rfid-bulk')
      .on('broadcast', { event: 'bulk_epc' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const incoming = typeof payload?.epc === 'string' ? payload.epc : '';
        if (!incoming) return;
        setHandheldConnected(true);
        setLastFlash(true);
        setTimeout(() => setLastFlash(false), 800);
        if (phaseRef.current === 'scanning') handleEpc(incoming, true);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') setHandheldConnected(true);
      });
    return () => { void supabase.removeChannel(channel); };
  }, [handleEpc, supabase]);

  const startScan = () => {
    if (!form.title.trim()) { setFormError('Book title is required to start scanning.'); return; }
    setFormError('');
    epcSet.current.clear();
    setTags([]);
    setPhase('scanning');
  };

  const removeTag = (epc: string) => {
    epcSet.current.delete(epc);
    setTags((prev) => prev.filter((t) => t.epc !== epc));
  };

  const reset = () => {
    setPhase('setup');
    setForm(initialForm);
    setTags([]);
    epcSet.current.clear();
    setFormError('');
    setSaveError('');
    setSavedCount(0);
  };

  const confirmAll = async () => {
    if (!tags.length) return;
    setSaveError('');
    setPhase('confirming');

    const res = await fetch('/api/inventory/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
        tags: tags.map((t) => t.epc),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setSaveError(data.error ?? 'Bulk save failed.'); setPhase('error'); return; }
    setSavedCount(Number(data.inserted_count ?? tags.length));
    setPhase('done');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 pb-24 sm:pb-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#1f2937]">Bulk Add</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">Set title details once, then scan multiple EPC tags.</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-500 shrink-0 ${
            lastFlash ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : handheldConnected ? 'border-blue-200 bg-blue-50 text-blue-600'
            : 'border-[#f3c6cc] bg-[#fffafa] text-[#9ca3af]'
          }`}>
            {lastFlash ? <Smartphone size={12} className="animate-bounce" />
              : handheldConnected ? <Wifi size={12} />
              : <Wifi size={12} className="opacity-40" />}
            {lastFlash ? 'Tag received' : handheldConnected ? 'Handheld ready' : 'Listening'}
          </div>
        </div>

        {/* Done state */}
        {phase === 'done' && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-2xl p-8 text-center">
            <CheckCircle2 size={36} className="text-emerald-600 mx-auto mb-3" />
            <div className="text-[#1f2937] font-semibold text-lg mb-1">{savedCount} copies saved</div>
            <div className="text-[#6b7280] text-sm mb-6">
              All scanned tags were linked to <span className="font-medium text-[#1f2937]">{form.title}</span>
            </div>
            <button type="button" onClick={reset}
              className="px-6 py-2.5 rounded-xl bg-[#c8102e] text-white text-sm font-semibold hover:bg-[#9f1027] transition-colors">
              Start new bulk scan
            </button>
          </div>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="border border-red-200 bg-red-50 rounded-2xl p-6 text-center">
            <XCircle size={32} className="text-red-500 mx-auto mb-3" />
            <div className="text-[#1f2937] font-semibold mb-1">Save failed</div>
            <div className="text-red-600 text-sm mb-4">{saveError}</div>
            <button type="button" onClick={() => setPhase('scanning')}
              className="px-5 py-2 rounded-xl border border-[#f3c6cc] text-sm text-[#6b7280] hover:border-[#c8102e] hover:text-[#c8102e] transition-colors">
              Return to scanning
            </button>
          </div>
        )}

        {/* Setup form */}
        {phase === 'setup' && (
          <div className="border border-[#f3c6cc] rounded-2xl p-6 bg-white">
            <h2 className="text-sm font-semibold text-[#1f2937] mb-5 flex items-center gap-2">
              <Layers size={15} className="text-[#c8102e]" />
              Step 1 — Set title metadata
            </h2>
            <div className="space-y-4">
              <CsvTitleAssist onSelect={applyCsvCandidate} />

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Book Title <span className="text-[#c8102e]">*</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Graham Computer Science" className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#6b7280] block mb-1.5">ISBN</label>
                  <input type="text" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                    placeholder="978-3-16-148410-0" className={inputCls} />
                </div>
                <SelectOrAdd label="Category" value={form.category}
                  onChange={(v) => setForm({ ...form, category: v === '__other__' ? '' : v })}
                  options={categories}
                  onAddNew={(v) => { addCategory(v); setForm((p) => ({ ...p, category: v })); }}
                  placeholder="Select category" />
              </div>

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Location Type</label>
                <select value={form.location_type}
                  onChange={(e) => setForm({ ...form, location_type: e.target.value as BulkForm['location_type'] })}
                  className={inputCls}>
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
                  <input type="text" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
                    placeholder="Author name" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Publisher</label>
                  <input type="text" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                    placeholder="Publisher" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Edition</label>
                  <input type="text" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })}
                    placeholder="e.g. 3rd" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#6b7280] block mb-1.5">List Price</label>
                  <input type="number" min="0" step="0.01" value={form.list_price}
                    onChange={(e) => setForm({ ...form, list_price: e.target.value })} placeholder="0.00" className={inputCls} />
                </div>
              </div>

              {formError && <div className="text-red-600 text-xs">{formError}</div>}

              <button type="button" onClick={startScan}
                className="w-full py-2.5 rounded-xl bg-[#c8102e] text-white text-sm font-semibold hover:bg-[#9f1027] transition-colors flex items-center justify-center gap-2">
                <Scan size={15} />
                Start Scanning
              </button>
            </div>
          </div>
        )}

        {/* Scanning / confirming */}
        {(phase === 'scanning' || phase === 'confirming') && (
          <div className="space-y-4">
            {/* Title summary bar */}
            <div className="border border-[#f3c6cc] rounded-2xl p-4 bg-white flex items-center justify-between">
              <div>
                <div className="text-[#1f2937] font-medium text-sm">{form.title}</div>
                <div className="text-[#6b7280] text-xs mt-0.5">
                  {form.category && <span>{form.category}</span>}
                  {form.category && form.location && <span> · </span>}
                  {form.location && <span>{locationTypeLabel(form.location_type)}: {form.location}</span>}
                </div>
              </div>
              <button type="button" onClick={reset} className="text-xs text-[#9ca3af] hover:text-[#c8102e] transition-colors">
                Reset
              </button>
            </div>

            {/* Scan status */}
            <div className={`border rounded-2xl p-4 flex items-center justify-between transition-colors ${
              phase === 'scanning' ? 'border-blue-200 bg-blue-50' : 'border-[#f3c6cc] bg-white'
            }`}>
              <div className="flex items-center gap-2.5">
                {phase === 'scanning'
                  ? <Radio size={16} className="text-blue-500 scan-pulse" />
                  : <StopCircle size={16} className="text-[#9ca3af]" />}
                <div>
                  <div className="text-sm font-medium text-[#1f2937]">{phase === 'scanning' ? 'Scanning…' : 'Ready to save'}</div>
                  <div className="text-xs text-[#6b7280]">{tags.length} tag{tags.length !== 1 ? 's' : ''} captured</div>
                </div>
              </div>
              {phase === 'scanning' ? (
                <button type="button" onClick={() => setPhase('confirming')}
                  className="px-3 py-1.5 rounded-xl border border-[#f3c6cc] text-xs text-[#6b7280] hover:border-[#c8102e] hover:text-[#c8102e] transition-colors">
                  Stop
                </button>
              ) : (
                <button type="button" onClick={confirmAll}
                  className="px-3 py-1.5 rounded-xl bg-[#c8102e] text-white text-xs font-semibold hover:bg-[#9f1027] transition-colors">
                  Save all
                </button>
              )}
            </div>

            {/* Keyboard wedge input while scanning */}
            {phase === 'scanning' && (
              <div className="border border-blue-200 rounded-2xl p-4 bg-blue-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold">
                    <Smartphone size={13} />
                    Scan from handheld app or keyboard wedge
                  </div>
                  <div className={`text-xs ${lastFlash ? 'text-emerald-600' : handheldConnected ? 'text-blue-500' : 'text-[#9ca3af]'}`}>
                    {lastFlash ? 'Receiving…' : handheldConnected ? 'Connected' : 'Waiting for app'}
                  </div>
                </div>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Tap here, then scan tags with keyboard wedge"
                  className="w-full border border-blue-200 rounded-xl px-3.5 py-2.5 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-blue-400 bg-white font-mono transition-colors"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v) { handleEpc(v, false); (e.target as HTMLInputElement).value = ''; }
                    e.preventDefault();
                  }}
                />
              </div>
            )}

            {/* Tag list */}
            {tags.length > 0 && (
              <div className="border border-[#f3c6cc] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#f3c6cc] bg-[#fffafa] flex items-center justify-between">
                  <span className="text-xs text-[#6b7280] font-medium uppercase tracking-wider">Scanned Tags ({tags.length})</span>
                  {phase === 'scanning' && (
                    <button type="button" onClick={() => { epcSet.current.clear(); setTags([]); }}
                      className="text-xs text-[#9ca3af] hover:text-red-500 transition-colors">
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-[320px] overflow-y-auto divide-y divide-[#f3c6cc]">
                  {tags.map((tag) => (
                    <div key={tag.epc} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#fffafa] transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${tag.fromHandheld ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                        <code className="text-xs text-[#6b7280] font-mono">{tag.epc}</code>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#9ca3af]">{tag.scannedAt.toLocaleTimeString()}</span>
                        {phase === 'scanning' && (
                          <button type="button" onClick={() => removeTag(tag.epc)}
                            className="text-[#9ca3af] hover:text-red-500 transition-colors" title="Remove">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {phase === 'confirming' && (
              <button type="button" onClick={confirmAll} disabled={!tags.length}
                className="w-full py-3 rounded-xl bg-[#c8102e] text-white font-semibold text-sm hover:bg-[#9f1027] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                <CheckCircle2 size={16} />
                Confirm all {tags.length} tags and save
              </button>
            )}
          </div>
        )}

        {phase === 'confirming' && !tags.length && (
          <div className="flex items-center justify-center py-12 gap-3 text-[#6b7280]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Saving…</span>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
