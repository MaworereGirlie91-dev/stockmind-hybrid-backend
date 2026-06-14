-- ============================================================
-- 20260323_auth_admin_controls.sql
-- Account management + password reset workflow for IT admin.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists app_accounts (
  id            uuid primary key default uuid_generate_v4(),
  email         text not null,
  password_hash text not null,
  password_salt text not null,
  is_it_admin   boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    text
);

create unique index if not exists ux_app_accounts_active_email
  on app_accounts (lower(email))
  where deleted_at is null;
create index if not exists idx_app_accounts_deleted_at on app_accounts(deleted_at);

create table if not exists password_reset_requests (
  id                  uuid primary key default uuid_generate_v4(),
  email               text not null,
  phone               text not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'completed')),
  notify_status       text not null default 'pending'
                      check (notify_status in ('pending', 'sent', 'failed')),
  notify_error        text,
  requested_at        timestamptz not null default now(),
  requested_device_id text,
  requested_from_ip   text,
  resolved_at         timestamptz,
  resolved_by         text,
  resolution_notes    text
);

create index if not exists idx_password_reset_requests_status
  on password_reset_requests(status, requested_at desc);
create index if not exists idx_password_reset_requests_email
  on password_reset_requests(lower(email));

grant all privileges on table app_accounts to service_role;
grant all privileges on table password_reset_requests to service_role;
revoke all on table app_accounts from anon, authenticated;
revoke all on table password_reset_requests from anon, authenticated;

alter table app_accounts enable row level security;
alter table password_reset_requests enable row level security;

drop policy if exists "app_accounts_service_role_only" on app_accounts;
create policy "app_accounts_service_role_only"
  on app_accounts
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "password_reset_requests_service_role_only" on password_reset_requests;
create policy "password_reset_requests_service_role_only"
  on password_reset_requests
  for all
  to service_role
  using (true)
  with check (true);

