-- ============================================================
-- 20260318_hybrid_sync_upgrade.sql
-- Incremental migration for offline sync metadata + soft-delete aware RLS
-- ============================================================

create extension if not exists "uuid-ossp";

alter table books_master add column if not exists updated_at timestamptz not null default now();
alter table books_master add column if not exists deleted_at timestamptz;
alter table books_master add column if not exists last_synced_at timestamptz;
alter table books_master add column if not exists last_modified_by text;
alter table books_master add column if not exists device_id text;
alter table books_master add column if not exists row_version bigint not null default 1;

alter table book_copies add column if not exists deleted_at timestamptz;
alter table book_copies add column if not exists last_synced_at timestamptz;
alter table book_copies add column if not exists last_modified_by text;
alter table book_copies add column if not exists device_id text;
alter table book_copies add column if not exists row_version bigint not null default 1;

alter table sales add column if not exists updated_at timestamptz not null default now();
alter table sales add column if not exists deleted_at timestamptz;
alter table sales add column if not exists last_synced_at timestamptz;
alter table sales add column if not exists last_modified_by text;
alter table sales add column if not exists device_id text;
alter table sales add column if not exists row_version bigint not null default 1;

create index if not exists idx_books_master_updated_at on books_master(updated_at desc);
create index if not exists idx_books_master_deleted_at on books_master(deleted_at);
create index if not exists idx_book_copies_updated_at on book_copies(updated_at desc);
create index if not exists idx_book_copies_deleted_at on book_copies(deleted_at);
create index if not exists idx_sales_updated_at on sales(updated_at desc);
create index if not exists idx_sales_deleted_at on sales(deleted_at);

create or replace function stockmind_set_sync_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at is null or new.updated_at <= old.updated_at then
      new.updated_at = now();
    end if;
    if new.row_version is null or new.row_version <= old.row_version then
      new.row_version = old.row_version + 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists books_master_sync_fields on books_master;
create trigger books_master_sync_fields
  before update on books_master
  for each row execute function stockmind_set_sync_fields();

drop trigger if exists book_copies_sync_fields on book_copies;
create trigger book_copies_sync_fields
  before update on book_copies
  for each row execute function stockmind_set_sync_fields();

drop trigger if exists sales_sync_fields on sales;
create trigger sales_sync_fields
  before update on sales
  for each row execute function stockmind_set_sync_fields();

alter table books_master enable row level security;
alter table book_copies enable row level security;
alter table sales enable row level security;

grant usage on schema public to anon, authenticated, service_role;

revoke all on table books_master from anon, authenticated;
revoke all on table book_copies from anon, authenticated;
revoke all on table sales from anon, authenticated;

grant select, insert on table books_master to anon, authenticated;
grant select, insert on table book_copies to anon, authenticated;
grant select on table sales to anon, authenticated;

grant all privileges on table books_master to service_role;
grant all privileges on table book_copies to service_role;
grant all privileges on table sales to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;

drop policy if exists "allow_select_books_master" on books_master;
drop policy if exists "allow_insert_books_master" on books_master;
drop policy if exists "allow_update_books_master" on books_master;
drop policy if exists "allow_delete_books_master" on books_master;
drop policy if exists "books_select_active" on books_master;
drop policy if exists "books_insert_authenticated" on books_master;
drop policy if exists "books_update_authenticated" on books_master;
drop policy if exists "books_delete_authenticated" on books_master;
drop policy if exists "books_insert_legacy" on books_master;
drop policy if exists "books_update_legacy" on books_master;
drop policy if exists "books_delete_legacy" on books_master;

create policy "books_select_active"
  on books_master
  for select
  to anon, authenticated
  using (deleted_at is null);

create policy "books_insert_legacy"
  on books_master
  for insert
  to anon, authenticated
  with check (deleted_at is null);

drop policy if exists "allow_select_book_copies" on book_copies;
drop policy if exists "allow_insert_book_copies" on book_copies;
drop policy if exists "allow_update_book_copies" on book_copies;
drop policy if exists "allow_delete_book_copies" on book_copies;
drop policy if exists "copies_select_active" on book_copies;
drop policy if exists "copies_insert_authenticated" on book_copies;
drop policy if exists "copies_update_authenticated" on book_copies;
drop policy if exists "copies_delete_authenticated" on book_copies;
drop policy if exists "copies_insert_legacy" on book_copies;
drop policy if exists "copies_update_legacy" on book_copies;
drop policy if exists "copies_delete_legacy" on book_copies;

create policy "copies_select_active"
  on book_copies
  for select
  to anon, authenticated
  using (deleted_at is null);

create policy "copies_insert_legacy"
  on book_copies
  for insert
  to anon, authenticated
  with check (deleted_at is null);

drop policy if exists "allow_select_sales" on sales;
drop policy if exists "allow_insert_sales" on sales;
drop policy if exists "allow_update_sales" on sales;
drop policy if exists "allow_delete_sales" on sales;
drop policy if exists "sales_select_active" on sales;
drop policy if exists "sales_insert_authenticated" on sales;
drop policy if exists "sales_update_authenticated" on sales;
drop policy if exists "sales_delete_authenticated" on sales;
drop policy if exists "sales_insert_legacy" on sales;
drop policy if exists "sales_update_legacy" on sales;
drop policy if exists "sales_delete_legacy" on sales;

create policy "sales_select_active"
  on sales
  for select
  to anon, authenticated
  using (deleted_at is null);
