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

  const handleEpc = useCallback(
    async (scannedEpc: string) => {
      const trimmed = scannedEpc.trim();
      if (!trimmed) {
        return;
      }
      setEpc(trimmed);
      setError('');
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

      if (data) {
        setExistingCopy(data as BookCopyWithMaster);
        setPhase('already_exists');
      } else {
        setExistingCopy(null);
        setPhase('new_tag');
      }
    },
    [supabase]
  );

  useEffect(() => {
    window.onRFIDScan = handleEpc;
  }, [handleEpc]);

  useEffect(() => {
    const channel = supabase
      .channel('rfid-scan')
      .on('broadcast', { event: 'epc_scanned' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const incoming = typeof payload?.epc === 'string' ? payload.epc : '';
        if (!incoming) {
          return;
        }
        setHandheldConnected(true);
        setLastHandheldFlash(true);
        setTimeout(() => setLastHandheldFlash(false), 1200);
        const current = phaseRef.current;
        if (current === 'waiting' || current === 'saved' || current === 'error') {
          void handleEpc(incoming);
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

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Book title is required.');
      return;
    }

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
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Single Add</h1>
            <p className="text-sm text-[#555] mt-0.5">Scan one RFID tag and register it to a title.</p>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-500 shrink-0 ${
              lastHandheldFlash
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                : handheldConnected
                  ? 'border-blue-500/30 bg-blue-500/5 text-blue-400'
                  : 'border-[#2a2a2a] bg-[#111] text-[#444]'
            }`}
          >
            {lastHandheldFlash ? (
              <Smartphone size={12} className="animate-bounce" />
            ) : handheldConnected ? (
              <Wifi size={12} />
            ) : (
              <Wifi size={12} className="opacity-40" />
            )}
            {lastHandheldFlash ? 'EPC received' : handheldConnected ? 'Handheld ready' : 'Listening'}
          </div>
        </div>

        <div
          className={`border rounded-xl p-6 mb-6 transition-colors ${
            phase === 'waiting'
              ? 'border-[#2a2a2a] bg-[#161616]'
              : phase === 'already_exists'
                ? 'border-amber-500/30 bg-amber-500/5'
                : phase === 'saved'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : phase === 'error'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-blue-500/30 bg-blue-500/5'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            {phase === 'waiting' && <Radio size={18} className="text-[#555] scan-pulse" />}
            {phase === 'checking' && <Loader2 size={18} className="text-blue-400 animate-spin" />}
            {phase === 'already_exists' && <CheckCircle2 size={18} className="text-amber-400" />}
            {phase === 'new_tag' && <Scan size={18} className="text-white" />}
            {phase === 'saving' && <Loader2 size={18} className="text-white animate-spin" />}
            {phase === 'saved' && <CheckCircle2 size={18} className="text-emerald-400" />}
            {phase === 'error' && <XCircle size={18} className="text-red-400" />}
            <div>
              <div className="text-sm font-medium text-white">
                {phase === 'waiting' && 'Waiting for scan'}
                {phase === 'checking' && 'Checking database'}
                {phase === 'already_exists' && 'Tag already registered'}
                {phase === 'new_tag' && 'New tag detected'}
                {phase === 'saving' && 'Saving'}
                {phase === 'saved' && 'Successfully saved'}
                {phase === 'error' && 'Error'}
              </div>
              {epc && <code className="text-xs text-[#666] font-mono">{epc}</code>}
            </div>
          </div>

          {phase === 'already_exists' && existingCopy && (
            <div className="space-y-2 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[#555] text-xs">Title</span>
                  <div className="text-white font-medium">{existingCopy.books_master?.title}</div>
                </div>
                <div>
                  <span className="text-[#555] text-xs">Status</span>
                  <div className="mt-0.5">
                    <StatusBadge status={existingCopy.status} />
                  </div>
                </div>
                <div>
                  <span className="text-[#555] text-xs">ISBN</span>
                  <div className="text-[#888] font-mono text-xs">{existingCopy.books_master?.isbn ?? '-'}</div>
                </div>
                <div>
                  <span className="text-[#555] text-xs">Location</span>
                  <div className="text-[#888]">{existingCopy.location ?? '-'}</div>
                </div>
              </div>
              <button
                onClick={reset}
                className="mt-4 w-full py-2 rounded-lg border border-[#2a2a2a] text-sm text-[#888] hover:text-white hover:border-[#3a3a3a] transition-colors"
              >
                Scan another tag
              </button>
            </div>
          )}

          {phase === 'saved' && (
            <div className="mt-4">
              <button
                onClick={reset}
                className="w-full py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-[#e6e6e6] transition-colors"
              >
                Scan another tag
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-sm">
            {error}
          </div>
        )}

        {phase === 'new_tag' && (
          <div className="border border-[#2a2a2a] rounded-xl p-6 bg-[#161616] slide-in">
            <h2 className="text-sm font-semibold text-white mb-4">Register New Tag</h2>
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
                      location_type: event.target.value as FormData['location_type'],
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

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-[#e6e6e6] transition-colors"
                >
                  Save to Inventory
                </button>
                <button
                  onClick={reset}
                  className="px-4 py-2.5 rounded-lg border border-[#2a2a2a] text-sm text-[#888] hover:text-white hover:border-[#3a3a3a] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {(phase === 'waiting' || phase === 'error') && (
          <div className="border border-[#2a2a2a] rounded-xl p-5 bg-[#161616] mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-[#555] font-medium uppercase tracking-wider">Keyboard Wedge / Manual Entry</div>
              <div className="flex items-center gap-1.5 text-[10px] text-blue-400">
                <Smartphone size={10} />
                <span>Or scan from handheld app and EPC appears automatically</span>
              </div>
            </div>
            <input
              ref={wedgeInputRef}
              type="text"
              autoComplete="off"
              placeholder="Tap here, then pull trigger on handheld (USB or BT)"
              className="w-full bg-[#0d0d0d] border border-emerald-500/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-emerald-500/60 font-mono caret-emerald-400"
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }
                const value = (event.target as HTMLInputElement).value.trim();
                if (value) {
                  void handleEpc(value);
                  (event.target as HTMLInputElement).value = '';
                }
                event.preventDefault();
              }}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
