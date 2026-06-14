'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BookCopyWithMaster } from '@/types';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  ShoppingCart, Search, CheckCircle2, ChevronDown,
  DollarSign, BookOpen, AlertCircle, RefreshCw, X,
} from 'lucide-react';

interface SaleItem {
  copy: BookCopyWithMaster;
  price: string;
}

export default function SalesPage() {
  const supabase = createClient();

  const [inStockCopies, setInStockCopies] = useState<BookCopyWithMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCopyId, setSelectedCopyId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchStock = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('book_copies')
      .select('*, books_master(*)')
      .eq('status', 'in_stock')
      .order('date_added', { ascending: false })
      .limit(1000);
    if (error) { console.error(error); }
    setInStockCopies((data ?? []) as BookCopyWithMaster[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  const q = search.toLowerCase();
  const filteredOptions = inStockCopies.filter((c) => {
    if (!q) return true;
    return (
      c.books_master?.title?.toLowerCase().includes(q) ||
      (c.books_master?.isbn ?? '').toLowerCase().includes(q) ||
      c.epc_tag.toLowerCase().includes(q) ||
      (c.books_master?.category ?? '').toLowerCase().includes(q)
    );
  });

  const selectedCopy = inStockCopies.find((c) => c.id === selectedCopyId) ?? null;

  const handleAddToCart = () => {
    if (!selectedCopy) return;
    if (!unitPrice || isNaN(Number(unitPrice)) || Number(unitPrice) < 0) {
      setError('Please enter a valid price.');
      return;
    }
    if (cart.some((item) => item.copy.id === selectedCopy.id)) {
      setError('This copy is already in the cart.');
      return;
    }
    setCart((prev) => [...prev, { copy: selectedCopy, price: unitPrice }]);
    setSelectedCopyId('');
    setUnitPrice('');
    setError('');
  };

  const removeFromCart = (copyId: string) => {
    setCart((prev) => prev.filter((item) => item.copy.id !== copyId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + Number(item.price), 0);

  const handleSell = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes.trim() || null,
          items: cart.map((item) => ({
            copy_id: item.copy.id,
            price_paid: Number(item.price),
            notes: notes.trim() || null,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to record sale. Try again.');
      }
      setSuccessCount(cart.length);
      setCart([]);
      setNotes('');
      await fetchStock();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record sale. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#1f2937] flex items-center gap-2">
              <ShoppingCart size={20} className="text-[#c8102e]" />
              Record a Sale
            </h1>
            <p className="text-xs text-[#6b7280] mt-1">Select books, set prices and complete the sale.</p>
          </div>
          <button
            type="button"
            onClick={fetchStock}
            className="p-1.5 rounded-lg border border-[#f3c6cc] text-[#6b7280] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors"
            title="Refresh stock"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Success banner */}
        {successCount !== null && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm fade-in">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Sale recorded! <strong>{successCount}</strong> {successCount === 1 ? 'copy' : 'copies'} marked as sold.</span>
            <button type="button" className="ml-auto" onClick={() => setSuccessCount(null)}><X size={14} /></button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
            <button type="button" className="ml-auto" onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Add to cart form */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rk-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#1f2937] flex items-center gap-2">
                <BookOpen size={14} className="text-[#c8102e]" />
                Add Book to Sale
              </h2>

              {/* Search filter */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                <input
                  type="text"
                  placeholder="Filter by title, ISBN, EPC, category…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSelectedCopyId(''); }}
                  className="rk-input w-full pl-9 pr-4 py-2 text-sm placeholder-[#9ca3af] focus:outline-none"
                />
              </div>

              {/* Book dropdown */}
              <div className="relative">
                <select
                  value={selectedCopyId}
                  onChange={(e) => setSelectedCopyId(e.target.value)}
                  className="rk-input w-full appearance-none pl-3 pr-8 py-2 text-sm cursor-pointer disabled:opacity-50 focus:outline-none"
                  disabled={loading}
                >
                  <option value="">
                    {loading ? 'Loading in-stock books…' : `— Select a book (${filteredOptions.length} available) —`}
                  </option>
                  {filteredOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.books_master?.title ?? 'Unknown'}{c.books_master?.isbn ? ` · ISBN ${c.books_master.isbn}` : ''} · EPC {c.epc_tag}{c.location ? ` · ${c.location}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
              </div>

              {/* Selected book preview */}
              {selectedCopy && (
                <div className="px-4 py-3 rounded-lg bg-[#fff5f6] border border-[#f3c6cc] space-y-1">
                  <div className="text-[#1f2937] text-sm font-medium">{selectedCopy.books_master?.title}</div>
                  <div className="flex flex-wrap gap-3 text-xs text-[#6b7280]">
                    {selectedCopy.books_master?.isbn && <span>ISBN: {selectedCopy.books_master.isbn}</span>}
                    {selectedCopy.books_master?.category && <span>Category: {selectedCopy.books_master.category}</span>}
                    {selectedCopy.location && <span>Location: {selectedCopy.location}</span>}
                    <span className="font-mono text-[#9ca3af]">EPC: {selectedCopy.epc_tag}</span>
                  </div>
                </div>
              )}

              {/* Price */}
              <div className="relative">
                <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Price paid (e.g. 12.50)"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="rk-input w-full pl-9 pr-4 py-2 text-sm placeholder-[#9ca3af] focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!selectedCopy || !unitPrice}
                className="rk-button-primary w-full py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add to Cart
              </button>
            </div>

            {/* Notes */}
            <div className="rk-card p-5">
              <label className="text-xs text-[#6b7280] font-medium block mb-2">Sale Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Customer name, reference, notes…"
                rows={2}
                className="rk-input w-full px-3 py-2 text-sm placeholder-[#9ca3af] focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Right: Cart */}
          <div className="space-y-4">
            <div className="rk-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#1f2937] flex items-center gap-2">
                <ShoppingCart size={14} className="text-[#c8102e]" />
                Cart
                {cart.length > 0 && (
                  <span className="ml-auto text-xs bg-[#fff0f2] text-[#9f1027] border border-[#f3c6cc] px-2 py-0.5 rounded-full font-medium">
                    {cart.length} {cart.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </h2>

              {cart.length === 0 ? (
                <div className="text-[#9ca3af] text-xs py-4 text-center">No items in cart yet.</div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.copy.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#fff5f6] border border-[#f3c6cc]">
                      <div className="flex-1 min-w-0">
                        <div className="text-[#1f2937] text-xs font-medium truncate">{item.copy.books_master?.title ?? 'Unknown'}</div>
                        <div className="text-[#9ca3af] text-[10px] font-mono truncate">{item.copy.epc_tag}</div>
                      </div>
                      <span className="text-emerald-600 text-xs font-bold shrink-0">${Number(item.price).toFixed(2)}</span>
                      <button type="button" onClick={() => removeFromCart(item.copy.id)} className="text-[#9ca3af] hover:text-red-500 transition-colors shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#fff0f2] border border-[#f3c6cc] mt-2">
                    <span className="text-xs text-[#6b7280] font-medium">Total</span>
                    <span className="text-[#1f2937] text-sm font-bold">${cartTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSell}
                disabled={cart.length === 0 || submitting}
                className="rk-button-primary w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    Complete Sale
                  </>
                )}
              </button>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="w-full py-2 rounded-xl text-xs text-[#9ca3af] hover:text-red-500 transition-colors"
                >
                  Clear cart
                </button>
              )}
            </div>

            {/* Stats hint */}
            <div className="rk-card p-4 space-y-1">
              <div className="text-xs text-[#6b7280] font-medium">Available in Stock</div>
              <div className="text-2xl font-bold text-[#1f2937]">
                {loading ? (
                  <span className="inline-block w-12 h-7 bg-[#f3c6cc] rounded animate-pulse" />
                ) : (
                  inStockCopies.length.toLocaleString()
                )}
              </div>
              <div className="text-[10px] text-[#9ca3af]">copies currently in stock</div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
