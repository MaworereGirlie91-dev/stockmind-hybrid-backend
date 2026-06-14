'use client';

export const dynamic = 'force-dynamic';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Eye, EyeOff, KeyRound, Loader2, Save, ShieldAlert, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';

interface MeData {
  id: string | null;
  username: string;
  email: string;
  displayName: string | null;
  role: 'admin' | 'sales';
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      role === 'admin' ? 'bg-[#fff0f2] text-[#c8102e] border border-[#f3c6cc]' : 'bg-blue-50 text-blue-700 border border-blue-200'
    }`}>
      {role === 'admin' ? 'Administrator' : 'Sales Staff'}
    </span>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);

  // First-account setup (env-var admin bootstrap)
  const [setupEmail, setSetupEmail] = useState('');
  const [setupDisplayName, setSetupDisplayName] = useState('');
  const [setupPw, setSetupPw] = useState('');
  const [setupConfirmPw, setSetupConfirmPw] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupErr, setSetupErr] = useState('');
  const [showSetupPw, setShowSetupPw] = useState(false);

  // Profile form
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwOk, setPwOk] = useState(false);
  const [pwErr, setPwErr] = useState('');

  // Avatar
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarErr, setAvatarErr] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: MeData) => {
        setMe(data);
        setDisplayName(data.displayName ?? '');
        setUsername(data.username ?? '');
        setAvatarUrl(data.avatarUrl);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveErr('');
    setSaveOk(false);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() || null, username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save.');
      setSaveOk(true);
      window.dispatchEvent(new CustomEvent('stockmind:user-updated'));
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwSaving(true);
    setPwErr('');
    setPwOk(false);
    try {
      if (newPw !== confirmPw) throw new Error('Passwords do not match.');
      if (newPw.length < 6) throw new Error('Password must be at least 6 characters.');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw, confirmPassword: confirmPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to change password.');
      setPwOk(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => setPwOk(false), 3000);
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleAvatarChange = async (file: File) => {
    setAvatarUploading(true);
    setAvatarErr('');
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch('/api/auth/profile', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed.');
      setAvatarUrl(data.url as string);
      window.dispatchEvent(new CustomEvent('stockmind:user-updated'));
    } catch (e) {
      setAvatarErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSetupAccount = async () => {
    setSetupErr('');
    if (setupPw !== setupConfirmPw) { setSetupErr('Passwords do not match.'); return; }
    if (setupPw.length < 6) { setSetupErr('Password must be at least 6 characters.'); return; }
    setSetupSaving(true);
    try {
      const res = await fetch('/api/auth/create-first-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: setupEmail, password: setupPw, displayName: setupDisplayName || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create account.');
      router.refresh();
      window.location.reload();
    } catch (e) {
      setSetupErr(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setSetupSaving(false);
    }
  };

  const initials = (me?.displayName ?? me?.username ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const inputCls = 'w-full border border-[#f3c6cc] rounded-xl px-3.5 py-2.5 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-[#c8102e] bg-white transition-colors';

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6 pb-24 sm:pb-8">

        {/* First-login banner */}
        {me?.mustChangePassword && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
            <KeyRound size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-amber-800">Please update your credentials</div>
              <div className="text-xs text-amber-700 mt-0.5">
                Your account was set up with a temporary password. Update it below before continuing.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#c8102e]" />
          </div>
        ) : (
          <>
            {/* Env-var admin — no DB account yet */}
            {me?.id === null && (
              <div className="rk-surface rounded-2xl p-6 space-y-4 border border-amber-200 bg-amber-50">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-amber-800">You&apos;re using the system admin credentials</div>
                    <div className="text-xs text-amber-700 mt-0.5">
                      These are the built-in credentials from the server config. If you already created your personal account, sign out and log in with your email and password instead.
                    </div>
                  </div>
                </div>

                {/* Sign out shortcut — primary action if account already exists */}
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    router.push('/login');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                >
                  Sign out &amp; use my email account
                </button>

                <div className="flex items-center gap-3 text-xs text-amber-600">
                  <div className="flex-1 border-t border-amber-200" />
                  <span>or create your first account below</span>
                  <div className="flex-1 border-t border-amber-200" />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Your Email</label>
                    <input
                      type="email"
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Display Name (optional)</label>
                    <input
                      type="text"
                      value={setupDisplayName}
                      onChange={(e) => setSetupDisplayName(e.target.value)}
                      placeholder="Your full name"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showSetupPw ? 'text' : 'password'}
                        value={setupPw}
                        onChange={(e) => setSetupPw(e.target.value)}
                        placeholder="Min. 6 characters"
                        autoComplete="new-password"
                        className={`${inputCls} pr-10`}
                      />
                      <button type="button" onClick={() => setShowSetupPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" tabIndex={-1}>
                        {showSetupPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Confirm Password</label>
                    <input
                      type={showSetupPw ? 'text' : 'password'}
                      value={setupConfirmPw}
                      onChange={(e) => setSetupConfirmPw(e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      className={inputCls}
                    />
                    {setupPw && setupConfirmPw && setupPw !== setupConfirmPw && (
                      <p className="text-[11px] text-red-500 mt-1">Passwords do not match.</p>
                    )}
                  </div>

                  {setupErr && (
                    <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{setupErr}</div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSetupAccount()}
                    disabled={setupSaving || !setupEmail || !setupPw || !setupConfirmPw}
                    className="rk-button-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 w-full justify-center"
                  >
                    {setupSaving ? <Loader2 size={14} className="animate-spin" /> : <User size={14} />}
                    {setupSaving ? 'Creating…' : 'Create My Account'}
                  </button>
                </div>
              </div>
            )}

            {/* Avatar + identity */}
            <div className="rk-surface rounded-2xl p-6">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Avatar"
                      width={72}
                      height={72}
                      className="w-18 h-18 rounded-full object-cover border-2 border-[#f3c6cc]"
                    />
                  ) : (
                    <div className="w-[72px] h-[72px] rounded-full bg-[#c8102e] text-white flex items-center justify-center text-2xl font-bold border-2 border-[#f3c6cc]">
                      {initials}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#c8102e] text-white flex items-center justify-center border-2 border-white hover:bg-[#9f1027] transition-colors disabled:opacity-50"
                    title="Change photo"
                  >
                    {avatarUploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAvatarChange(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div>
                  <div className="text-lg font-bold text-[#1f2937]">
                    {me?.displayName ?? me?.username}
                  </div>
                  <div className="text-sm text-[#6b7280]">{me?.email}</div>
                  <div className="mt-1.5">
                    <RoleBadge role={me?.role ?? 'sales'} />
                  </div>
                </div>
              </div>

              {avatarErr && (
                <div className="mt-3 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {avatarErr}
                </div>
              )}
            </div>

            {/* Profile details — only for DB accounts */}
            {me?.id && <div className="rk-surface rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <User size={15} className="text-[#c8102e]" />
                <h2 className="text-base font-semibold text-[#1f2937]">Profile Details</h2>
              </div>

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your full name"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="username"
                  className={inputCls}
                />
                <p className="text-[11px] text-[#9ca3af] mt-1">Used to sign in. Lowercase only.</p>
              </div>

              {saveErr && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {saveErr}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={saving}
                className="rk-button-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saveOk ? <Check size={14} /> : <Save size={14} />}
                {saving ? 'Saving…' : saveOk ? 'Saved!' : 'Save Changes'}
              </button>
            </div>}

            {/* Change password — only for DB accounts */}
            {me?.id && <div className="rk-surface rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={15} className="text-[#c8102e]" />
                <h2 className="text-base font-semibold text-[#1f2937]">Change Password</h2>
              </div>

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#9f1027]"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">New Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Confirm New Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className={inputCls}
                />
                {newPw && confirmPw && newPw !== confirmPw && (
                  <p className="text-[11px] text-red-500 mt-1">Passwords do not match.</p>
                )}
              </div>

              {pwErr && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {pwErr}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleChangePassword()}
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="rk-button-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {pwSaving ? <Loader2 size={14} className="animate-spin" /> : pwOk ? <Check size={14} /> : <KeyRound size={14} />}
                {pwSaving ? 'Updating…' : pwOk ? 'Password Updated!' : 'Update Password'}
              </button>
            </div>}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
