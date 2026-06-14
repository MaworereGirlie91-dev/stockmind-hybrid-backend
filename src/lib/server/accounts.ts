import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

import { createAdminClient } from '@/lib/server/supabase-admin';
import { isUuid, normalizeRequiredText } from '@/lib/server/validation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export interface AppAccount {
  id: string;
  email: string;
  is_it_admin: boolean;
  is_active: boolean;
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

function derivePasswordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function normalizePassword(value: unknown): string | null {
  const normalized = normalizeRequiredText(value, PASSWORD_MAX_LENGTH);
  if (!normalized) {
    return null;
  }
  if (normalized.length < PASSWORD_MIN_LENGTH) {
    return null;
  }
  return normalized;
}

export function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeRequiredText(value, 180);
  if (!normalized) {
    return null;
  }
  const lowered = normalized.toLowerCase();
  if (!EMAIL_PATTERN.test(lowered)) {
    return null;
  }
  return lowered;
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

  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function findAccountByEmail(email: string): Promise<AppAccountWithSecret | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select(
      'id, email, password_hash, password_salt, is_it_admin, is_active, created_at, updated_at, deleted_at, created_by'
    )
    .eq('email', normalizedEmail)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  return data as AppAccountWithSecret;
}

export async function authenticateAccount(
  loginIdentifier: string,
  password: string
): Promise<AppAccountWithSecret | null> {
  const normalizedPassword = normalizePassword(password);
  if (!normalizedPassword) {
    return null;
  }

  const account = await findAccountByEmail(loginIdentifier);
  if (!account || account.deleted_at || !account.is_active) {
    return null;
  }

  const valid = verifyPassword(normalizedPassword, account.password_salt, account.password_hash);
  if (!valid) {
    return null;
  }

  return account;
}

export async function listAccounts(): Promise<AppAccount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select('id, email, is_it_admin, is_active, created_at, updated_at, deleted_at, created_by')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AppAccount[];
}

export async function createAccount(input: {
  email: unknown;
  password: unknown;
  createdBy: string;
  itAdmin?: boolean;
}): Promise<AppAccount> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    throw new Error('A valid email address is required.');
  }

  const normalizedPassword = normalizePassword(input.password);
  if (!normalizedPassword) {
    throw new Error('Password must be at least 8 characters.');
  }

  const { hash, salt } = hashPassword(normalizedPassword);
  const now = new Date().toISOString();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('app_accounts')
    .insert({
      email: normalizedEmail,
      password_hash: hash,
      password_salt: salt,
      is_it_admin: input.itAdmin ?? false,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      created_by: input.createdBy,
    })
    .select('id, email, is_it_admin, is_active, created_at, updated_at, deleted_at, created_by')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('An account with this email already exists.');
    }
    throw new Error(error.message);
  }

  return data as AppAccount;
}

export async function changeAccountPassword(input: {
  accountId: string;
  newPassword: unknown;
}): Promise<void> {
  if (!isUuid(input.accountId)) {
    throw new Error('Invalid account id.');
  }

  const normalizedPassword = normalizePassword(input.newPassword);
  if (!normalizedPassword) {
    throw new Error('Password must be at least 8 characters.');
  }

  const { hash, salt } = hashPassword(normalizedPassword);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('app_accounts')
    .update({
      password_hash: hash,
      password_salt: salt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.accountId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAccount(accountId: string): Promise<void> {
  if (!isUuid(accountId)) {
    throw new Error('Invalid account id.');
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('app_accounts')
    .update({
      deleted_at: now,
      is_active: false,
      updated_at: now,
    })
    .eq('id', accountId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createPasswordResetRequest(input: {
  email: unknown;
  phone: unknown;
  deviceId?: string | null;
  ip?: string | null;
}): Promise<PasswordResetRequestRecord> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    throw new Error('A valid registered email is required.');
  }

  const phone = normalizeRequiredText(input.phone, 48);
  if (!phone) {
    throw new Error('Phone number is required.');
  }

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
    .select(
      'id, email, phone, status, notify_status, notify_error, requested_at, requested_device_id, requested_from_ip, resolved_at, resolved_by, resolution_notes'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PasswordResetRequestRecord;
}

export async function markPasswordResetNotification(input: {
  requestId: string;
  sent: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  if (!isUuid(input.requestId)) {
    throw new Error('Invalid password reset request id.');
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('password_reset_requests')
    .update({
      notify_status: input.sent ? 'sent' : 'failed',
      notify_error: input.sent ? null : input.errorMessage?.slice(0, 500) ?? 'Notification failed.',
    })
    .eq('id', input.requestId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listPasswordResetRequests(limit = 100): Promise<PasswordResetRequestRecord[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('password_reset_requests')
    .select(
      'id, email, phone, status, notify_status, notify_error, requested_at, requested_device_id, requested_from_ip, resolved_at, resolved_by, resolution_notes'
    )
    .order('requested_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PasswordResetRequestRecord[];
}

export async function resolvePasswordResetRequest(input: {
  requestId: string;
  resolver: string;
  notes?: string | null;
}): Promise<void> {
  if (!isUuid(input.requestId)) {
    throw new Error('Invalid password reset request id.');
  }

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

  if (error) {
    throw new Error(error.message);
  }
}

