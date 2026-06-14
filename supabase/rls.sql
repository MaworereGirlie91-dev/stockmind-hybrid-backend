-- ============================================================
-- StockMind - Transitional RLS Policies
--
-- This keeps existing web scanner behavior operational while introducing
-- sync metadata and soft-delete aware visibility.
--
-- Read path: only active rows (deleted_at is null)
-- Write path: anon + authenticated (legacy compatibility)
-- Service role remains the preferred write channel for production sync.
-- ============================================================

alter table books_master enable row level security;
alter table book_copies enable row level security;
alter table book_boxes enable row level security;
alter table sales enable row level security;
alter table app_accounts enable row level security;
alter table password_reset_requests enable row level security;

-- Explicit grants for Supabase API roles (table privileges + RLS policies).
grant usage on schema public to anon, authenticated, service_role;

revoke all on table books_master from anon, authenticated;
revoke all on table book_copies from anon, authenticated;
revoke all on table book_boxes from anon, authenticated;
revoke all on table sales from anon, authenticated;
revoke all on table inventory_categories from anon, authenticated;
revoke all on table inventory_locations from anon, authenticated;
revoke all on table app_accounts from anon, authenticated;
revoke all on table password_reset_requests from anon, authenticated;

grant select, insert on table books_master to anon, authenticated;
grant select, insert on table book_copies to anon, authenticated;
grant select, insert on table book_boxes to anon, authenticated;
grant select on table sales to anon, authenticated;
grant select on table inventory_categories to anon, authenticated;
grant select on table inventory_locations to anon, authenticated;

grant all privileges on table books_master to service_role;
grant all privileges on table book_copies to service_role;
grant all privileges on table book_boxes to service_role;
grant all privileges on table sales to service_role;
grant all privileges on table inventory_categories to service_role;
grant all privileges on table inventory_locations to service_role;
grant all privileges on table app_accounts to service_role;
grant all privileges on table password_reset_requests to service_role;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- Drop existing policies to keep script idempotent.
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

drop policy if exists "allow_select_book_boxes" on book_boxes;
drop policy if exists "allow_insert_book_boxes" on book_boxes;
drop policy if exists "allow_update_book_boxes" on book_boxes;
drop policy if exists "allow_delete_book_boxes" on book_boxes;
drop policy if exists "boxes_select_active" on book_boxes;
drop policy if exists "boxes_insert_authenticated" on book_boxes;
drop policy if exists "boxes_update_authenticated" on book_boxes;
drop policy if exists "boxes_delete_authenticated" on book_boxes;
drop policy if exists "boxes_insert_legacy" on book_boxes;
drop policy if exists "boxes_update_legacy" on book_boxes;
drop policy if exists "boxes_delete_legacy" on book_boxes;

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
drop policy if exists "app_accounts_service_role_only" on app_accounts;
drop policy if exists "password_reset_requests_service_role_only" on password_reset_requests;

-- books_master
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

-- book_copies
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

-- book_boxes
create policy "boxes_select_active"
  on book_boxes
  for select
  to anon, authenticated
  using (deleted_at is null);

create policy "boxes_insert_legacy"
  on book_boxes
  for insert
  to anon, authenticated
  with check (deleted_at is null);

-- sales
create policy "sales_select_active"
  on sales
  for select
  to anon, authenticated
  using (deleted_at is null);

create policy "app_accounts_service_role_only"
  on app_accounts
  for all
  to service_role
  using (true)
  with check (true);

create policy "password_reset_requests_service_role_only"
  on password_reset_requests
  for all
  to service_role
  using (true)
  with check (true);
