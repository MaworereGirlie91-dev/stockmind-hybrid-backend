'use client';

export const dynamic = 'force-dynamic';

import type { FormEvent } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.mustChangePassword) {
        window.location.assign('/profile');
      } else if (data.role === 'sales') {
        window.location.assign('/sales');
      } else {
        window.location.assign('/statistics');
      }
      return;
    }

    const data = await res.json().catch(() => ({}));
    setError(data.error ?? 'Invalid credentials.');
    setLoading(false);
  };

  const inputClass =
    'rk-input w-full px-4 py-2.5 text-sm placeholder-[#9ca3af] text-[#1f2937]';

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm flex-1 flex flex-col justify-center">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 relative rounded-2xl overflow-hidden border border-[#f3c6cc] bg-white mb-3 shadow-sm">
            <Image src="/aiec-logo.png" alt="AIEC" fill className="object-contain p-1.5" />
          </div>
          <h1 className="text-xl font-bold text-[#1f2937]">StockMind</h1>
          <p className="text-xs text-[#6b7280] mt-1">RFID Inventory Management</p>
        </div>

        <div className="rk-surface rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#1f2937] mb-4">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs text-[#6b7280] font-medium block mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="text-xs text-[#6b7280] font-medium block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`${inputClass} pr-10`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#9f1027] transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[#c8102e] text-xs px-3 py-2 rounded-lg bg-[#ffe8ec] border border-[#f3c6cc]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rk-button-primary w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      <div className="pb-6 text-center">
        <p className="text-[11px] text-[#9ca3af]">StockMind · AIEC Operations</p>
      </div>
    </div>
  );
}
