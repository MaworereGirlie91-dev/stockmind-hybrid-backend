import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid, normalizeRequiredText } from '@/lib/server/validation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;

export type AppRole = 'admin' | 'sales';

export interface AppAccount {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: AppRole;
  is_it_admin: boolean;
  is_active: boolean;
  must_change_password: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
}

export interface PasswordResetRequestRecord {
  id: string;
  email: string;
  phone: string;
  status: 'pending' | 'completed';
  notify_status: 'pending' | 'sent' | 'failed';
  notify_error: string | null;
  requested_at: string;
  requested_device_id: string | null;
  requested_from_ip: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

interface AppAccountWithSecret extends AppAccount {
  password_hash: string;
  password_salt: string;
}

interface PasswordHashResult {
  hash: string;
  salt: string;
}

const ACCOUNT_FIELDS =
  'id, email, username, display_name, role, is_it_admin, is_active, must_change_password, avatar_url, created_at, updated_at, deleted_at, created_by';

const ACCOUNT_WITH_SECRET_FIELDS = `${ACCOUNT_FIELDS}, password_hash, password_salt`;

function derivePasswordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function normalizePassword(value: unknown): string | null {
  const normalized = normalizeRequiredText(value, PASSWORD_MAX_LENGTH);
  if (!normalized) return null;
  if (normalized.length < PASSWORD_MIN_LENGTH) return null;
  return normalized;
}

export function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeRequiredText(value, 180);
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (!EMAIL_PATTERN.test(lowered)) return null;
  return lowered;
}

export function normalizeUsername(value: unknown): string | null {
  const normalized = normalizeRequiredText(value, 60);
  if (!normalized) return null;
  if (normalized.length < 2) return null;
  return normalized.toLowerCase().trim();
}

/** Strip hyphens, spaces, etc. from an ID number and lowercase it for the initial password. */
export function idNumberToPassword(idNumber: string): string {
  return idNumber.replace(/[\s\-]/g, '').toLowerCase();
}

function hashPassword(password: string): PasswordHashResult {
  const salt = randomBytes(16).toString('hex');
  const hash = derivePasswordHash(password, salt);
  return { hash, salt };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const computed = derivePasswordHash(password, salt);
  const left = Buffer.from(computed, 'hex');
  const right = Buffer.from(expectedHash, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function castAccount(data: unknown): AppAccount {
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    email: row.email as string,
    username: (row.username as string | null) ?? (row.email as string),
    display_name: (row.display_name as string | null) ?? null,
    role: (row.role as string) === 'sales' ? 'sales' : 'admin',
    is_it_admin: Boolean(row.is_it_admin),
    is_active: Boolean(row.is_active),
    must_change_password: Boolean(row.must_change_password),
    avatar_url: (row.avatar_url as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
  };
}

export async function findAccountByEmail(email: string): Promise<AppAccountWithSecret | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select(ACCOUNT_WITH_SECRET_FIELDS)
    .eq('email', normalizedEmail)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return castAccount(data) as AppAccountWithSecret;
}

export async function findAccountByUsername(username: string): Promise<AppAccountWithSecret | null> {
  const normalized = username.toLowerCase().trim();
  if (!normalized) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select(ACCOUNT_WITH_SECRET_FIELDS)
    .ilike('username', normalized)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return castAccount(data) as AppAccountWithSecret;
}

export async function findAccountById(id: string): Promise<AppAccount | null> {
  if (!isUuid(id)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select(ACCOUNT_FIELDS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return castAccount(data);
}

/** Authenticate by username or email. */
export async function authenticateAccount(
  loginIdentifier: string,
  password: string
): Promise<AppAccountWithSecret | null> {
  const normalizedPassword = normalizePassword(password);
  if (!normalizedPassword) return null;

  // Try username first, then email
  let account = await findAccountByUsername(loginIdentifier);
  if (!account) account = await findAccountByEmail(loginIdentifier);
  if (!account || account.deleted_at || !account.is_active) return null;

  // Gracefully skip accounts that were manually inserted without a password hash
  if (!account.password_salt || !account.password_hash) return null;

  const valid = verifyPassword(normalizedPassword, account.password_salt, account.password_hash);
  if (!valid) return null;
  return account;
}

/** Find an account by email that has a missing password hash (manually inserted / broken). */
export async function findBrokenAccountByEmail(email: string): Promise<AppAccount | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select(ACCOUNT_FIELDS)
    .eq('email', normalizedEmail)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const hasSalt = typeof row.password_salt === 'string' && row.password_salt.length > 0;
  const hasHash = typeof row.password_hash === 'string' && row.password_hash.length > 0;
  if (hasSalt && hasHash) return null; // Not broken
  return castAccount(data);
}

/** Set a new password on an account directly (no current-password check). Used for account repair. */
export async function forceSetPassword(accountId: string, newPassword: unknown): Promise<void> {
  if (!isUuid(accountId)) throw new Error('Invalid account id.');

  const normalizedPassword = normalizePassword(newPassword);
  if (!normalizedPassword) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);

  const { hash, salt } = hashPassword(normalizedPassword);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('app_accounts')
    .update({ password_hash: hash, password_salt: salt, must_change_password: false, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
}

export async function listAccounts(): Promise<AppAccount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select(ACCOUNT_FIELDS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(castAccount);
}

export async function createAccount(input: {
  email: unknown;
  password: unknown;
  createdBy: string;
  role?: AppRole;
  username?: string;
  displayName?: string;
  mustChangePassword?: boolean;
}): Promise<AppAccount> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) throw new Error('A valid email address is required.');

  const normalizedPassword = normalizePassword(input.password);
  if (!normalizedPassword) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);

  const username = (input.username ?? normalizedEmail).toLowerCase().trim();
  if (username.length < 2) throw new Error('Username is too short.');

  const { hash, salt } = hashPassword(normalizedPassword);
  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const role: AppRole = input.role ?? 'admin';

  const { data, error } = await supabase
    .from('app_accounts')
    .insert({
      email: normalizedEmail,
      username,
      display_name: input.displayName ?? null,
      password_hash: hash,
      password_salt: salt,
      role,
      is_it_admin: role === 'admin',
      is_active: true,
      must_change_password: input.mustChangePassword ?? false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      created_by: input.createdBy,
    })
    .select(ACCOUNT_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('An account with this email or username already exists.');
    throw new Error(error.message);
  }

  return castAccount(data);
}

export async function updateProfile(input: {
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  username?: string;
}): Promise<AppAccount> {
  if (!isUuid(input.accountId)) throw new Error('Invalid account id.');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.displayName !== undefined) updates.display_name = input.displayName?.trim() || null;
  if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl || null;
  if (input.username !== undefined) {
    const u = normalizeUsername(input.username);
    if (!u) throw new Error('Username must be at least 2 characters.');
    updates.username = u;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .update(updates)
    .eq('id', input.accountId)
    .is('deleted_at', null)
    .select(ACCOUNT_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('That username is already taken.');
    throw new Error(error.message);
  }
  return castAccount(data);
}

export async function changeAccountPassword(input: {
  accountId: string;
  newPassword: unknown;
  clearMustChange?: boolean;
}): Promise<void> {
  if (!isUuid(input.accountId)) throw new Error('Invalid account id.');

  const normalizedPassword = normalizePassword(input.newPassword);
  if (!normalizedPassword) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);

  const { hash, salt } = hashPassword(normalizedPassword);
  const supabase = createAdminClient();
  const updates: Record<string, unknown> = {
    password_hash: hash,
    password_salt: salt,
    updated_at: new Date().toISOString(),
  };
  if (input.clearMustChange) updates.must_change_password = false;

  const { error } = await supabase
    .from('app_accounts')
    .update(updates)
    .eq('id', input.accountId)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
}

export async function updateAccountRole(input: {
  accountId: string;
  role: AppRole;
  isActive?: boolean;
}): Promise<AppAccount> {
  if (!isUuid(input.accountId)) throw new Error('Invalid account id.');

  const updates: Record<string, unknown> = {
    role: input.role,
    is_it_admin: input.role === 'admin',
    updated_at: new Date().toISOString(),
  };
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .update(updates)
    .eq('id', input.accountId)
    .is('deleted_at', null)
    .select(ACCOUNT_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return castAccount(data);
}

export async function deleteAccount(accountId: string): Promise<void> {
  if (!isUuid(accountId)) throw new Error('Invalid account id.');

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('app_accounts')
    .update({ deleted_at: now, is_active: false, updated_at: now })
    .eq('id', accountId)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
}

export async function createPasswordResetRequest(input: {
  email: unknown;
  phone: unknown;
  deviceId?: string | null;
  ip?: string | null;
}): Promise<PasswordResetRequestRecord> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) throw new Error('A valid registered email is required.');

  const phone = normalizeRequiredText(input.phone, 48);
  if (!phone) throw new Error('Phone number is required.');

  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('password_reset_requests')
    .insert({
      email: normalizedEmail,
      phone,
      status: 'pending',
      notify_status: 'pending',
      notify_error: null,
      requested_at: now,
      requested_device_id: input.deviceId ?? null,
      requested_from_ip: input.ip ?? null,
      resolved_at: null,
      resolved_by: null,
      resolution_notes: null,
    })
    .select('id, email, phone, status, notify_status, notify_error, requested_at, requested_device_id, requested_from_ip, resolved_at, resolved_by, resolution_notes')
    .single();

  if (error) throw new Error(error.message);
  return data as PasswordResetRequestRecord;
}

export async function markPasswordResetNotification(input: {
  requestId: string;
  sent: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  if (!isUuid(input.requestId)) throw new Error('Invalid password reset request id.');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('password_reset_requests')
    .update({
      notify_status: input.sent ? 'sent' : 'failed',
      notify_error: input.sent ? null : input.errorMessage?.slice(0, 500) ?? 'Notification failed.',
    })
    .eq('id', input.requestId);

  if (error) throw new Error(error.message);
}

export async function listPasswordResetRequests(limit = 100): Promise<PasswordResetRequestRecord[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('password_reset_requests')
    .select('id, email, phone, status, notify_status, notify_error, requested_at, requested_device_id, requested_from_ip, resolved_at, resolved_by, resolution_notes')
    .order('requested_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(error.message);
  return (data ?? []) as PasswordResetRequestRecord[];
}

export async function resolvePasswordResetRequest(input: {
  requestId: string;
  resolver: string;
  notes?: string | null;
}): Promise<void> {
  if (!isUuid(input.requestId)) throw new Error('Invalid password reset request id.');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('password_reset_requests')
    .update({
      status: 'completed',
      resolved_at: new Date().toISOString(),
      resolved_by: input.resolver,
      resolution_notes: input.notes?.slice(0, 400) ?? null,
    })
    .eq('id', input.requestId);

  if (error) throw new Error(error.message);
}
