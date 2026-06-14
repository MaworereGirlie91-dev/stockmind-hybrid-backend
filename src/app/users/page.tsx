'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import {
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  ShoppingCart,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';

import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: 'admin' | 'sales';
  is_active: boolean;
  must_change_password: boolean;
  avatar_url: string | null;
  created_at: string;
}

function RoleBadge({ role }: { role: string }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fff0f2] text-[#c8102e] border border-[#f3c6cc]">
      <Shield size={9} /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
      <ShoppingCart size={9} /> Sales
    </span>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [role, setRole] = useState<'admin' | 'sales'>('sales');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ generatedPassword: string } | null>(null);

  const generatedPw = idNumber.replace(/[\s\-]/g, '').toLowerCase();

  const validate = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email is required.';
    if (!displayName.trim()) return 'Display name is required.';
    if (!idNumber.trim()) return 'ID number is required.';
    if (generatedPw.length < 4) return 'ID number is too short.';
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, idNumber, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create user.');
      setResult({ generatedPassword: data.generatedPassword as string });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full border border-[#f3c6cc] rounded-xl px-3.5 py-2.5 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-[#c8102e] bg-white transition-colors';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3c6cc]">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-[#c8102e]" />
            <h2 className="text-base font-semibold text-[#1f2937]">Add New User</h2>
          </div>
          <button type="button" onClick={onClose} className="text-[#9ca3af] hover:text-[#374151] transition-colors">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check size={16} />
              <span className="font-semibold text-sm">User created successfully!</span>
            </div>
            <div className="bg-[#fffafa] border border-[#f3c6cc] rounded-xl p-4 space-y-2 text-sm">
              <div className="text-[#6b7280]">Share these credentials with the user:</div>
              <div><span className="text-[#9ca3af] text-xs">Username (email):</span><br /><span className="font-mono font-semibold text-[#1f2937]">{email}</span></div>
              <div><span className="text-[#9ca3af] text-xs">Temporary password:</span><br /><span className="font-mono font-semibold text-[#c8102e]">{result.generatedPassword}</span></div>
              <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                The user will be prompted to change their password on first login.
              </div>
            </div>
            <button type="button" onClick={onClose} className="rk-button-primary w-full py-2.5 rounded-xl text-sm font-semibold">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Email Address *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@aiec.ac.zw" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Full Name *</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b7280] block mb-1.5">National ID Number *</label>
              <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="63-123456A00" className={inputCls} />
              {idNumber && (
                <p className="text-[11px] text-[#6b7280] mt-1">
                  Generated password: <span className="font-mono text-[#c8102e] font-semibold">{generatedPw}</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-[#6b7280] block mb-1.5">Role *</label>
              <div className="flex gap-2">
                {(['admin', 'sales'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      role === r
                        ? 'bg-[#c8102e] text-white border-[#c8102e]'
                        : 'bg-white text-[#6b7280] border-[#f3c6cc] hover:border-[#c8102e] hover:text-[#9f1027]'
                    }`}
                  >
                    {r === 'admin' ? <Shield size={13} /> : <ShoppingCart size={13} />}
                    {r === 'admin' ? 'Administrator' : 'Sales Staff'}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={loading}
              className="rk-button-primary w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load users.');
      setUsers(data.accounts as UserRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleRole = async (user: UserRow) => {
    const newRole = user.role === 'admin' ? 'sales' : 'admin';
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (user: UserRow) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: user.role, isActive: !user.is_active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (user: UserRow) => {
    if (!window.confirm(`Remove ${user.display_name ?? user.email}? This cannot be undone.`)) return;
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setBusyId(null);
    }
  };

  const activeUsers = users.filter((u) => u.is_active);
  const inactiveUsers = users.filter((u) => !u.is_active);

  const UserCard = ({ user }: { user: UserRow }) => {
    const busy = busyId === user.id;
    const initials = (user.display_name ?? user.username ?? 'U')
      .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
      <div className={`border rounded-2xl p-4 flex items-center gap-3 transition-opacity ${
        user.is_active ? 'border-[#f3c6cc] bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
      }`}>
        <div className="w-10 h-10 rounded-full bg-[#c8102e] text-white flex items-center justify-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#1f2937] truncate">
              {user.display_name ?? user.username}
            </span>
            <RoleBadge role={user.role} />
            {user.must_change_password && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                Temp pw
              </span>
            )}
          </div>
          <div className="text-xs text-[#9ca3af] truncate">{user.email}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void toggleRole(user)}
            disabled={busy}
            title={`Switch to ${user.role === 'admin' ? 'Sales' : 'Admin'}`}
            className="p-1.5 rounded-lg border border-[#f3c6cc] text-[#6b7280] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors disabled:opacity-40"
          >
            {user.role === 'admin' ? <ShoppingCart size={13} /> : <Shield size={13} />}
          </button>
          <button
            type="button"
            onClick={() => void toggleActive(user)}
            disabled={busy}
            title={user.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded-lg border border-[#f3c6cc] text-[#6b7280] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors disabled:opacity-40"
          >
            {user.is_active ? <UserMinus size={13} /> : <UserCheck size={13} />}
          </button>
          <button
            type="button"
            onClick={() => void deleteUser(user)}
            disabled={busy}
            title="Remove user"
            className="p-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6 pb-24 sm:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fff0f2] border border-[#f3c6cc] flex items-center justify-center">
              <Users size={16} className="text-[#c8102e]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1f2937]">Users</h1>
              <p className="text-sm text-[#6b7280]">{activeUsers.length} active account{activeUsers.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="p-2 rounded-xl border border-[#f3c6cc] text-[#9f1027] hover:bg-[#fff0f2] transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rk-button-primary flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <Plus size={14} />
              Add User
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#c8102e]" />
          </div>
        ) : (
          <>
            {activeUsers.length === 0 && inactiveUsers.length === 0 ? (
              <div className="text-center py-20 text-[#9ca3af] text-sm">
                No users yet. Add one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {activeUsers.map((u) => <UserCard key={u.id} user={u} />)}
              </div>
            )}

            {inactiveUsers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">Deactivated</p>
                <div className="space-y-2">
                  {inactiveUsers.map((u) => <UserCard key={u.id} user={u} />)}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}
