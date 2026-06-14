-- ============================================================
-- StockMind - Core Schema + Sync Metadata
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- books_master
-- ------------------------------------------------------------
create table if not exists books_master (
  id               uuid primary key default uuid_generate_v4(),
  title            text not null,
  isbn             text,
  category         text,
  author           text,
  publisher        text,
  edition          text,
  list_price       numeric(10,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint not null default 1
);

alter table books_master add column if not exists updated_at timestamptz not null default now();
alter table books_master add column if not exists deleted_at timestamptz;
alter table books_master add column if not exists last_synced_at timestamptz;
alter table books_master add column if not exists last_modified_by text;
alter table books_master add column if not exists device_id text;
alter table books_master add column if not exists row_version bigint not null default 1;
alter table books_master add column if not exists author text;
alter table books_master add column if not exists publisher text;
alter table books_master add column if not exists edition text;
alter table books_master add column if not exists list_price numeric(10,2);

create index if not exists idx_books_master_updated_at on books_master(updated_at desc);
create index if not exists idx_books_master_deleted_at on books_master(deleted_at);

-- ------------------------------------------------------------
-- inventory_categories
-- ------------------------------------------------------------
create table if not exists inventory_categories (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create unique index if not exists ux_inventory_categories_active_name
  on inventory_categories(lower(name))
  where deleted_at is null;
create index if not exists idx_inventory_categories_name on inventory_categories(name);
create index if not exists idx_inventory_categories_deleted_at on inventory_categories(deleted_at);

-- ------------------------------------------------------------
-- inventory_locations
-- ------------------------------------------------------------
create table if not exists inventory_locations (
  id               uuid primary key default uuid_generate_v4(),
  location_type    text not null default 'shelf'
                   check (location_type in ('warehouse','stock_room','shelf')),
  name             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

alter table inventory_locations add column if not exists location_type text;

create unique index if not exists ux_inventory_locations_active_type_name
  on inventory_locations(lower(location_type), lower(name))
  where deleted_at is null;
create index if not exists idx_inventory_locations_name on inventory_locations(name);
create index if not exists idx_inventory_locations_type on inventory_locations(location_type);
create index if not exists idx_inventory_locations_deleted_at on inventory_locations(deleted_at);

-- ------------------------------------------------------------
-- app_accounts (IT admin + managed login accounts)
-- ------------------------------------------------------------
create table if not exists app_accounts (
  id               uuid primary key default uuid_generate_v4(),
  email            text not null,
  password_hash    text not null,
  password_salt    text not null,
  is_it_admin      boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       text
);

create unique index if not exists ux_app_accounts_active_email
  on app_accounts(lower(email))
  where deleted_at is null;
create index if not exists idx_app_accounts_deleted_at on app_accounts(deleted_at);

-- ------------------------------------------------------------
-- password_reset_requests
-- ------------------------------------------------------------
create table if not exists password_reset_requests (
  id                  uuid primary key default uuid_generate_v4(),
  email               text not null,
  phone               text not null,
  status              text not null default 'pending'
                      check (status in ('pending','completed')),
  notify_status       text not null default 'pending'
                      check (notify_status in ('pending','sent','failed')),
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

-- ------------------------------------------------------------
-- book_copies
-- ------------------------------------------------------------
create table if not exists book_copies (
  id               uuid primary key default uuid_generate_v4(),
  book_id          uuid references books_master(id) on delete cascade,
  epc_tag          text not null unique,
  location         text,
  location_type    text check (location_type in ('warehouse','stock_room','shelf')),
  location_name    text,
  status           text not null default 'in_stock'
                   check (status in ('in_stock','checked_out','lost')),
  date_added       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint not null default 1
);

alter table book_copies add column if not exists deleted_at timestamptz;
alter table book_copies add column if not exists last_synced_at timestamptz;
alter table book_copies add column if not exists last_modified_by text;
alter table book_copies add column if not exists device_id text;
alter table book_copies add column if not exists row_version bigint not null default 1;
alter table book_copies add column if not exists location_type text;
alter table book_copies add column if not exists location_name text;

create index if not exists idx_book_copies_epc on book_copies(epc_tag);
create index if not exists idx_book_copies_book_id on book_copies(book_id);
create index if not exists idx_book_copies_updated_at on book_copies(updated_at desc);
create index if not exists idx_book_copies_deleted_at on book_copies(deleted_at);

-- ------------------------------------------------------------
-- book_boxes
-- ------------------------------------------------------------
create table if not exists book_boxes (
  id               uuid primary key default uuid_generate_v4(),
  book_id          uuid references books_master(id) on delete cascade,
  epc_tag          text not null unique,
  quantity         integer not null check (quantity > 0),
  location         text,
  location_type    text check (location_type in ('warehouse','stock_room','shelf')),
  location_name    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint not null default 1
);

alter table book_boxes add column if not exists deleted_at timestamptz;
alter table book_boxes add column if not exists last_synced_at timestamptz;
alter table book_boxes add column if not exists last_modified_by text;
alter table book_boxes add column if not exists device_id text;
alter table book_boxes add column if not exists row_version bigint not null default 1;
alter table book_boxes add column if not exists location_type text;
alter table book_boxes add column if not exists location_name text;

create index if not exists idx_book_boxes_epc on book_boxes(epc_tag);
create index if not exists idx_book_boxes_book_id on book_boxes(book_id);
create index if not exists idx_book_boxes_updated_at on book_boxes(updated_at desc);
create index if not exists idx_book_boxes_deleted_at on book_boxes(deleted_at);

-- ------------------------------------------------------------
-- sales
-- ------------------------------------------------------------
create table if not exists sales (
  id               uuid primary key default uuid_generate_v4(),
  copy_id          uuid references book_copies(id) on delete set null,
  book_id          uuid references books_master(id) on delete set null,
  epc_tag          text not null,
  title            text not null,
  isbn             text,
  category         text,
  location         text,
  location_type    text check (location_type in ('warehouse','stock_room','shelf')),
  location_name    text,
  price_paid       numeric(10,2) not null default 0,
  sold_at          timestamptz not null default now(),
  notes            text,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint not null default 1
);

alter table sales add column if not exists updated_at timestamptz not null default now();
alter table sales add column if not exists deleted_at timestamptz;
alter table sales add column if not exists last_synced_at timestamptz;
alter table sales add column if not exists last_modified_by text;
alter table sales add column if not exists device_id text;
alter table sales add column if not exists row_version bigint not null default 1;
alter table sales add column if not exists location_type text;
alter table sales add column if not exists location_name text;

create index if not exists idx_sales_sold_at on sales(sold_at desc);
create index if not exists idx_sales_book_id on sales(book_id);
create index if not exists idx_sales_epc_tag on sales(epc_tag);
create index if not exists idx_sales_updated_at on sales(updated_at desc);
create index if not exists idx_sales_deleted_at on sales(deleted_at);

-- ------------------------------------------------------------
-- Generic trigger for updated_at + row_version
-- ------------------------------------------------------------
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

create or replace function stockmind_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at is null or new.updated_at <= old.updated_at then
      new.updated_at = now();
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

drop trigger if exists book_boxes_sync_fields on book_boxes;
create trigger book_boxes_sync_fields
  before update on book_boxes
  for each row execute function stockmind_set_sync_fields();

drop trigger if exists sales_sync_fields on sales;
create trigger sales_sync_fields
  before update on sales
  for each row execute function stockmind_set_sync_fields();

drop trigger if exists inventory_categories_touch_updated_at on inventory_categories;
create trigger inventory_categories_touch_updated_at
  before update on inventory_categories
  for each row execute function stockmind_touch_updated_at();

drop trigger if exists inventory_locations_touch_updated_at on inventory_locations;
create trigger inventory_locations_touch_updated_at
  before update on inventory_locations
  for each row execute function stockmind_touch_updated_at();

drop trigger if exists app_accounts_touch_updated_at on app_accounts;
create trigger app_accounts_touch_updated_at
  before update on app_accounts
  for each row execute function stockmind_touch_updated_at();

-- ------------------------------------------------------------
-- Realtime publication
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'books_master'
  ) then
    alter publication supabase_realtime add table books_master;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'book_copies'
  ) then
    alter publication supabase_realtime add table book_copies;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'book_boxes'
  ) then
    alter publication supabase_realtime add table book_boxes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table sales;
  end if;
end $$;
