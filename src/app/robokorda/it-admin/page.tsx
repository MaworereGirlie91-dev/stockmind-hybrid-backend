'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

type AccountRow = {
  id: string;
  email: string;
  is_it_admin: boolean;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
};

type ResetRequestRow = {
  id: string;
  email: string;
  phone: string;
  status: 'pending' | 'completed';
  notify_status: 'pending' | 'sent' | 'failed';
  notify_error: string | null;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
};

function toLocalDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function ItAdminPage() {
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerSecret, setRegisterSecret] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountPasswords, setAccountPasswords] = useState<Record<string, string>>({});
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const [requests, setRequests] = useState<ResetRequestRow[]>([]);
  const [requestPasswords, setRequestPasswords] = useState<Record<string, string>>({});
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});

  const [loadingData, setLoadingData] = useState(true);

  const pendingRequests = useMemo(
    () => requests.filter((item) => item.status === 'pending'),
    [requests]
  );

  const loadData = async (options?: { skipStartState?: boolean }) => {
    if (!options?.skipStartState) {
      setLoadingData(true);
    }
    setAuthError('');

    const [accountsRes, requestsRes] = await Promise.all([
      fetch('/api/it-admin/accounts', { cache: 'no-store' }),
      fetch('/api/it-admin/reset-requests', { cache: 'no-store' }),
    ]);

    if (accountsRes.status === 401 || accountsRes.status === 403) {
      setAccounts([]);
      setRequests([]);
      setLoadingData(false);
      return;
    }

    if (!accountsRes.ok || !requestsRes.ok) {
      const accountErr = await accountsRes.json().catch(() => ({}));
      setAuthError(accountErr.error ?? 'Unable to load IT admin data.');
      setLoadingData(false);
      return;
    }

    const accountJson = (await accountsRes.json()) as { items: AccountRow[] };
    const requestJson = (await requestsRes.json()) as { items: ResetRequestRow[] };
    setAccounts(accountJson.items ?? []);
    setRequests(requestJson.items ?? []);
    setLoadingData(false);
  };

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void loadData({ skipStartState: true });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();
    setRegisterLoading(true);
    setAuthMessage('');
    setAuthError('');

    const res = await fetch('/api/it-admin/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: registerEmail,
        password: registerPassword,
        secret_key: registerSecret,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setRegisterLoading(false);

    if (!res.ok) {
      setAuthError(json.error ?? 'Unable to create IT admin account.');
      return;
    }

    setRegisterEmail('');
    setRegisterPassword('');
    setRegisterSecret('');
    setAuthMessage('IT admin account created and signed in.');
    await loadData();
  };

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setAuthMessage('');
    setAuthError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginEmail,
        password: loginPassword,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setLoginLoading(false);

    if (!res.ok) {
      setAuthError(json.error ?? 'Login failed.');
      return;
    }

    setLoginPassword('');
    setAuthMessage('Signed in. Loading IT admin data...');
    await loadData();
  };

  const onLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAccounts([]);
    setRequests([]);
    setAuthMessage('Signed out.');
  };

  const onCreateAccount = async (event: FormEvent) => {
    event.preventDefault();
    setCreateLoading(true);
    setAuthMessage('');
    setAuthError('');

    const res = await fetch('/api/it-admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createEmail,
        password: createPassword,
        it_admin: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setCreateLoading(false);

    if (!res.ok) {
      setAuthError(json.error ?? 'Unable to create account.');
      return;
    }

    setCreateEmail('');
    setCreatePassword('');
    setAuthMessage('Account created.');
    await loadData();
  };

  const onChangePassword = async (accountId: string) => {
    const nextPassword = (accountPasswords[accountId] ?? '').trim();
    if (!nextPassword) {
      setAuthError('Enter a new password for the selected account.');
      return;
    }

    setAuthError('');
    const res = await fetch(`/api/it-admin/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: nextPassword }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAuthError(json.error ?? 'Unable to change password.');
      return;
    }

    setAccountPasswords((previous) => ({ ...previous, [accountId]: '' }));
    setAuthMessage('Password updated.');
  };

  const onDeleteAccount = async (accountId: string, email: string) => {
    const confirmed = window.confirm(`Delete account ${email}?`);
    if (!confirmed) {
      return;
    }

    setAuthError('');
    const res = await fetch(`/api/it-admin/accounts/${accountId}`, {
      method: 'DELETE',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAuthError(json.error ?? 'Unable to delete account.');
      return;
    }

    setAuthMessage('Account deleted.');
    await loadData();
  };

  const onResolveRequest = async (requestId: string) => {
    const nextPassword = (requestPasswords[requestId] ?? '').trim();
    if (!nextPassword) {
      setAuthError('Enter a new password to resolve the reset request.');
      return;
    }

    const res = await fetch(`/api/it-admin/reset-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_password: nextPassword,
        notes: requestNotes[requestId] ?? '',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAuthError(json.error ?? 'Unable to complete reset request.');
      return;
    }

    setRequestPasswords((previous) => ({ ...previous, [requestId]: '' }));
    setRequestNotes((previous) => ({ ...previous, [requestId]: '' }));
    setAuthMessage('Reset request completed and password assigned.');
    await loadData();
  };

  return (
    <div className="min-h-screen bg-white text-[#1f2937]">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="rk-surface rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl border border-[#f3c6cc] bg-white p-1.5 relative overflow-hidden">
                <Image src="/aiec-logo.png" alt="AIEC" fill className="object-contain p-1.5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#1f2937]">IT Admin Control</h1>
                <p className="text-sm text-[#6b7280]">
                  Secret route for account registration, user lifecycle, and password reset assignment.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void loadData()}
                className="rk-input px-3 py-2 text-xs font-semibold text-[#9f1027]"
                type="button"
              >
                Refresh
              </button>
              <button
                onClick={onLogout}
                className="rk-input px-3 py-2 text-xs font-semibold text-[#9f1027]"
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-[#9f1027]">
            Lost secret key policy: if `IT_ADMIN_SECRET_KEY` is lost, the deployment must be
            reconfigured manually.
          </p>

          {authMessage && (
            <div className="mt-3 rounded-lg border border-[#f3c6cc] bg-[#fff0f2] px-3 py-2 text-sm text-[#9f1027]">
              {authMessage}
            </div>
          )}
          {authError && (
            <div className="mt-3 rounded-lg border border-[#f3c6cc] bg-[#ffe8ec] px-3 py-2 text-sm text-[#c8102e]">
              {authError}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form onSubmit={onRegister} className="rk-surface rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[#1f2937]">Register IT Admin</h2>
            <p className="text-xs text-[#6b7280]">
              Requires email, password, and the environment secret key.
            </p>
            <input
              className="rk-input w-full px-3 py-2 text-sm"
              placeholder="IT admin email"
              type="email"
              value={registerEmail}
              onChange={(event) => setRegisterEmail(event.target.value)}
              required
            />
            <input
              className="rk-input w-full px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={registerPassword}
              onChange={(event) => setRegisterPassword(event.target.value)}
              required
            />
            <input
              className="rk-input w-full px-3 py-2 text-sm"
              placeholder="Secret key"
              type="password"
              value={registerSecret}
              onChange={(event) => setRegisterSecret(event.target.value)}
              required
            />
            <button
              type="submit"
              disabled={registerLoading}
              className="rk-button-primary px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {registerLoading ? 'Creating...' : 'Create IT admin'}
            </button>
          </form>

          <form onSubmit={onLogin} className="rk-surface rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[#1f2937]">IT Admin Sign In</h2>
            <p className="text-xs text-[#6b7280]">
              Sign in to manage accounts and complete reset requests.
            </p>
            <input
              className="rk-input w-full px-3 py-2 text-sm"
              placeholder="Email or username"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              required
            />
            <input
              className="rk-input w-full px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
            <button
              type="submit"
              disabled={loginLoading}
              className="rk-button-primary px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {loginLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>

        <section className="rk-surface rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-[#1f2937]">Account Management</h2>
            <span className="text-xs text-[#6b7280]">
              {loadingData ? 'Loading...' : `${accounts.length} active accounts`}
            </span>
          </div>

          <form onSubmit={onCreateAccount} className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              className="rk-input px-3 py-2 text-sm"
              placeholder="New account email"
              type="email"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
              required
            />
            <input
              className="rk-input px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              required
            />
            <button
              type="submit"
              disabled={createLoading}
              className="rk-button-primary px-4 py-2 rounded-lg text-sm font-semibold"
            >
              {createLoading ? 'Creating...' : 'Register account'}
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[#6b7280] border-b border-[#f3c6cc]">
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Created</th>
                  <th className="py-2 pr-2">Password</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-[#ffe5e8] align-top">
                    <td className="py-3 pr-2">
                      <div className="font-medium text-[#1f2937]">{account.email}</div>
                      <div className="text-xs text-[#6b7280]">
                        Created by {account.created_by ?? 'system'}
                      </div>
                    </td>
                    <td className="py-3 pr-2">
                      <span className="text-xs rounded-full border border-[#f3c6cc] bg-[#fff0f2] px-2 py-1 text-[#9f1027]">
                        {account.is_it_admin ? 'IT Admin' : 'Account'}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-[#6b7280] text-xs">{toLocalDate(account.created_at)}</td>
                    <td className="py-3 pr-2">
                      <input
                        className="rk-input px-2 py-1.5 text-xs min-w-[180px]"
                        placeholder="New password"
                        type="password"
                        value={accountPasswords[account.id] ?? ''}
                        onChange={(event) =>
                          setAccountPasswords((previous) => ({
                            ...previous,
                            [account.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td className="py-3 space-x-2">
                      <button
                        onClick={() => void onChangePassword(account.id)}
                        type="button"
                        className="rk-input px-2.5 py-1.5 text-xs font-semibold text-[#9f1027]"
                      >
                        Change password
                      </button>
                      <button
                        onClick={() => void onDeleteAccount(account.id, account.email)}
                        type="button"
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[#f3c6cc] bg-[#ffe8ec] text-[#c8102e] hover:bg-[#ffdfe5]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td className="py-5 text-sm text-[#6b7280]" colSpan={5}>
                      Sign in as IT admin to view and manage accounts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rk-surface rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-[#1f2937]">Password Reset Requests</h2>
            <span className="text-xs text-[#6b7280]">{pendingRequests.length} pending</span>
          </div>

          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-[#f3c6cc] bg-white p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-[#1f2937]">{request.email}</div>
                    <div className="text-xs text-[#6b7280]">
                      Phone: {request.phone} - Requested: {toLocalDate(request.requested_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded-full border border-[#f3c6cc] px-2 py-1 text-[#9f1027] bg-[#fff0f2]">
                      {request.status}
                    </span>
                    <span className="text-xs rounded-full border border-[#f3c6cc] px-2 py-1 text-[#9f1027] bg-[#fff0f2]">
                      mail: {request.notify_status}
                    </span>
                  </div>
                </div>

                {request.notify_error && (
                  <div className="text-xs text-[#c8102e] bg-[#ffe8ec] border border-[#f3c6cc] rounded-lg px-2 py-1.5">
                    {request.notify_error}
                  </div>
                )}

                {request.status === 'pending' ? (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      className="rk-input px-3 py-2 text-sm"
                      placeholder="Assign new password"
                      type="password"
                      value={requestPasswords[request.id] ?? ''}
                      onChange={(event) =>
                        setRequestPasswords((previous) => ({
                          ...previous,
                          [request.id]: event.target.value,
                        }))
                      }
                    />
                    <input
                      className="rk-input px-3 py-2 text-sm"
                      placeholder="Optional note"
                      value={requestNotes[request.id] ?? ''}
                      onChange={(event) =>
                        setRequestNotes((previous) => ({
                          ...previous,
                          [request.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => void onResolveRequest(request.id)}
                      className="rk-button-primary px-3 py-2 rounded-lg text-sm font-semibold"
                    >
                      Assign Password
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-[#6b7280]">
                    Resolved at {toLocalDate(request.resolved_at)} by {request.resolved_by ?? '-'}
                    {request.resolution_notes ? ` - ${request.resolution_notes}` : ''}
                  </div>
                )}
              </div>
            ))}
            {requests.length === 0 && (
              <div className="text-sm text-[#6b7280]">No reset requests yet.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
