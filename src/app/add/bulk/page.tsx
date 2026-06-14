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

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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
    if (!epc || epcSet.current.has(epc)) {
      return;
    }
    epcSet.current.add(epc);
    setTags((prev) => [{ epc, scannedAt: new Date(), fromHandheld }, ...prev]);
  }, []);

  useEffect(() => {
    window.onRFIDScan = (epc: string) => {
      if (phaseRef.current === 'scanning') {
        handleEpc(epc, false);
      }
    };
  }, [handleEpc]);

  useEffect(() => {
    const channel = supabase
      .channel('rfid-bulk')
      .on('broadcast', { event: 'bulk_epc' }, ({ payload }) => {
        const incoming = typeof payload?.epc === 'string' ? payload.epc : '';
        if (!incoming) {
          return;
        }
        setHandheldConnected(true);
        setLastFlash(true);
        setTimeout(() => setLastFlash(false), 800);
        if (phaseRef.current === 'scanning') {
          handleEpc(incoming, true);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setHandheldConnected(true);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [handleEpc, supabase]);

  const startScan = () => {
    if (!form.title.trim()) {
      setFormError('Book title is required to start scanning.');
      return;
    }
    setFormError('');
    epcSet.current.clear();
    setTags([]);
    setPhase('scanning');
  };

  const removeTag = (epc: string) => {
    epcSet.current.delete(epc);
    setTags((prev) => prev.filter((tag) => tag.epc !== epc));
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
    if (!tags.length) {
      return;
    }
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
        tags: tags.map((tag) => tag.epc),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveError(data.error ?? 'Bulk save failed.');
      setPhase('error');
      return;
    }

    setSavedCount(Number(data.inserted_count ?? tags.length));
    setPhase('done');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Bulk Add</h1>
            <p className="text-sm text-[#555] mt-0.5">Set title details once, then scan multiple EPC tags.</p>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-500 shrink-0 ${
              lastFlash
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                : handheldConnected
                  ? 'border-blue-500/30 bg-blue-500/5 text-blue-400'
                  : 'border-[#2a2a2a] bg-[#111] text-[#444]'
            }`}
          >
            {lastFlash ? (
              <Smartphone size={12} className="animate-bounce" />
            ) : handheldConnected ? (
              <Wifi size={12} />
            ) : (
              <Wifi size={12} className="opacity-40" />
            )}
            {lastFlash ? 'Tag received' : handheldConnected ? 'Handheld ready' : 'Listening'}
          </div>
        </div>

        {phase === 'done' && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-8 text-center slide-in">
            <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
            <div className="text-white font-semibold text-lg mb-1">{savedCount} copies saved</div>
            <div className="text-[#555] text-sm mb-6">
              All scanned tags were linked to <span className="text-white">{form.title}</span>
            </div>
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-[#e6e6e6] transition-colors"
            >
              Start new bulk scan
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-6 text-center slide-in">
            <XCircle size={28} className="text-red-400 mx-auto mb-3" />
            <div className="text-white font-semibold mb-1">Save failed</div>
            <div className="text-red-400 text-sm mb-4">{saveError}</div>
            <button
              onClick={() => setPhase('scanning')}
              className="px-5 py-2 rounded-lg border border-[#2a2a2a] text-sm text-[#888] hover:text-white transition-colors"
            >
              Return to scanning
            </button>
          </div>
        )}

        {phase === 'setup' && (
          <div className="border border-[#2a2a2a] rounded-xl p-6 bg-[#161616]">
            <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <Layers size={15} className="text-[#555]" />
              Step 1: Set title metadata
            </h2>
            <div className="space-y-4">
              <CsvTitleAssist onSelect={applyCsvCandidate} />
              <div>
                <label className="text-xs text-[#555] font-medium block mb-1.5">
                  Book Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="e.g. Graham Computer Science"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#555] font-medium block mb-1.5">ISBN</label>
                  <input
                    type="text"
                    value={form.isbn}
                    onChange={(event) => setForm({ ...form, isbn: event.target.value })}
                    placeholder="978-3-16-148410-0"
                    className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555]"
                  />
                </div>
                <SelectOrAdd
                  label="Category"
                  value={form.category}
                  onChange={(value) => setForm({ ...form, category: value === '__other__' ? '' : value })}
                  options={categories}
                  onAddNew={(value) => {
                    addCategory(value);
                    setForm((prev) => ({ ...prev, category: value }));
                  }}
                  placeholder="Select category"
                />
              </div>

              <div>
                <label className="text-xs text-[#555] font-medium block mb-1.5">Location Type</label>
                <select
                  value={form.location_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      location_type: event.target.value as BulkForm['location_type'],
                    })
                  }
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#555]"
                >
                  <option value="warehouse">Warehouse</option>
                  <option value="stock_room">Stock Room</option>
                  <option value="shelf">Shelf</option>
                </select>
              </div>

              <SelectOrAdd
                label="Location Name"
                value={form.location ? `${locationTypeLabel(form.location_type)}: ${form.location}` : ''}
                onChange={(value) => {
                  if (value === '__other__') {
                    setForm({ ...form, location: '' });
                    return;
                  }
                  const parsed = value.includes(':')
                    ? parseLocation({ location: value })
                    : { locationType: form.location_type, locationName: value };
                  setForm({
                    ...form,
                    location_type: parsed.locationType ?? form.location_type,
                    location: parsed.locationName ?? value,
                  });
                }}
                options={locations}
                onAddNew={(value) => {
                  const parsed = value.includes(':')
                    ? parseLocation({ location: value })
                    : { locationType: form.location_type, locationName: value };
                  const locationName = parsed.locationName ?? value;
                  const locationType = parsed.locationType ?? form.location_type;
                  addLocation(locationName, locationType);
                  setForm((prev) => ({
                    ...prev,
                    location_type: locationType,
                    location: locationName,
                  }));
                }}
                placeholder="Select location name"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#555] font-medium block mb-1.5">Author</label>
                  <input
                    type="text"
                    value={form.author}
                    onChange={(event) => setForm({ ...form, author: event.target.value })}
                    placeholder="Author name"
                    className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#555] font-medium block mb-1.5">Publisher</label>
                  <input
                    type="text"
                    value={form.publisher}
                    onChange={(event) => setForm({ ...form, publisher: event.target.value })}
                    placeholder="Publisher"
                    className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#555] font-medium block mb-1.5">Edition</label>
                  <input
                    type="text"
                    value={form.edition}
                    onChange={(event) => setForm({ ...form, edition: event.target.value })}
                    placeholder="e.g. 3rd"
                    className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#555] font-medium block mb-1.5">List Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.list_price}
                    onChange={(event) => setForm({ ...form, list_price: event.target.value })}
                    placeholder="0.00"
                    className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#555]"
                  />
                </div>
              </div>

              {formError && <div className="text-red-400 text-xs">{formError}</div>}

              <button
                onClick={startScan}
                className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-[#e6e6e6] transition-colors flex items-center justify-center gap-2"
              >
                <Scan size={15} />
                Start Scanning
              </button>
            </div>
          </div>
        )}

        {(phase === 'scanning' || phase === 'confirming') && (
          <div className="space-y-4">
            <div className="border border-[#2a2a2a] rounded-xl p-4 bg-[#161616] flex items-center justify-between">
              <div>
                <div className="text-white font-medium text-sm">{form.title}</div>
                <div className="text-[#555] text-xs mt-0.5">
                  {form.category && <span>{form.category} | </span>}
                  {form.location && (
                    <span>
                      {locationTypeLabel(form.location_type)}: {form.location}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={reset} className="text-xs text-[#444] hover:text-[#888] transition-colors">
                Reset
              </button>
            </div>

            <div
              className={`border rounded-xl p-4 flex items-center justify-between transition-colors ${
                phase === 'scanning' ? 'border-blue-500/30 bg-blue-500/5' : 'border-[#2a2a2a] bg-[#161616]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {phase === 'scanning' ? (
                  <Radio size={16} className="text-blue-400 scan-pulse" />
                ) : (
                  <StopCircle size={16} className="text-[#555]" />
                )}
                <div>
                  <div className="text-sm font-medium text-white">{phase === 'scanning' ? 'Scanning' : 'Ready to save'}</div>
                  <div className="text-xs text-[#555]">
                    {tags.length} tag{tags.length !== 1 ? 's' : ''} captured
                  </div>
                </div>
              </div>
              {phase === 'scanning' ? (
                <button
                  onClick={() => setPhase('confirming')}
                  className="px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-xs text-[#888] hover:text-white hover:border-[#3a3a3a] transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={confirmAll}
                  className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-[#e6e6e6] transition-colors"
                >
                  Save all
                </button>
              )}
            </div>

            {phase === 'scanning' && (
              <div className="border border-blue-500/20 rounded-xl p-4 bg-[#0d0d0d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold">
                    <Smartphone size={13} />
                    Scan from handheld app
                  </div>
                  <div className={`text-xs ${lastFlash ? 'text-emerald-400' : handheldConnected ? 'text-blue-400' : 'text-[#444]'}`}>
                    {lastFlash ? 'Receiving...' : handheldConnected ? 'Connected' : 'Waiting for app'}
                  </div>
                </div>

                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Tap here, then scan tags with keyboard wedge"
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-blue-500/40 font-mono"
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') {
                      return;
                    }
                    const value = (event.target as HTMLInputElement).value.trim();
                    if (value) {
                      handleEpc(value, false);
                      (event.target as HTMLInputElement).value = '';
                    }
                    event.preventDefault();
                  }}
                />
              </div>
            )}

            {tags.length > 0 && (
              <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#111] flex items-center justify-between">
                  <span className="text-xs text-[#555] font-medium uppercase tracking-wider">Scanned Tags ({tags.length})</span>
                  {phase === 'scanning' && (
                    <button
                      onClick={() => {
                        epcSet.current.clear();
                        setTags([]);
                      }}
                      className="text-xs text-[#444] hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {tags.map((tag) => (
                    <div
                      key={tag.epc}
                      className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${tag.fromHandheld ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                        <code className="text-xs text-[#888] font-mono">{tag.epc}</code>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#333]">{tag.scannedAt.toLocaleTimeString()}</span>
                        {phase === 'scanning' && (
                          <button
                            onClick={() => removeTag(tag.epc)}
                            className="text-[#444] hover:text-red-400 transition-colors"
                            title="Remove"
                          >
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
              <button
                onClick={confirmAll}
                disabled={!tags.length}
                className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-[#e6e6e6] transition-colors disabled:opacity-40"
              >
                <CheckCircle2 size={16} className="inline mr-1" />
                Confirm all {tags.length} tags and save
              </button>
            )}
          </div>
        )}

        {phase === 'confirming' && !tags.length && (
          <div className="flex items-center justify-center py-12 gap-3 text-[#555]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Saving</span>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
