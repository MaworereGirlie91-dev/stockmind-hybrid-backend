-- ============================================================
-- 20260323_inventory_admin_extensions.sql
-- Additive schema extension for categories, locations, and
-- richer title metadata.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- Title metadata extensions (backward compatible)
-- ------------------------------------------------------------
alter table books_master add column if not exists author text;
alter table books_master add column if not exists publisher text;
alter table books_master add column if not exists edition text;
alter table books_master add column if not exists list_price numeric(10,2);

-- ------------------------------------------------------------
-- Managed category/location dictionaries
-- ------------------------------------------------------------
create table if not exists inventory_categories (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists inventory_locations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists ux_inventory_categories_active_name
  on inventory_categories (lower(name))
  where deleted_at is null;

create unique index if not exists ux_inventory_locations_active_name
  on inventory_locations (lower(name))
  where deleted_at is null;

create index if not exists idx_inventory_categories_name
  on inventory_categories (name);

create index if not exists idx_inventory_categories_deleted_at
  on inventory_categories (deleted_at);

create index if not exists idx_inventory_locations_name
  on inventory_locations (name);

create index if not exists idx_inventory_locations_deleted_at
  on inventory_locations (deleted_at);

grant select on table inventory_categories to anon, authenticated;
grant select on table inventory_locations to anon, authenticated;
grant all privileges on table inventory_categories to service_role;
grant all privileges on table inventory_locations to service_role;

-- ------------------------------------------------------------
-- updated_at auto-maintenance for reference tables
-- ------------------------------------------------------------
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

drop trigger if exists inventory_categories_touch_updated_at on inventory_categories;
create trigger inventory_categories_touch_updated_at
  before update on inventory_categories
  for each row execute function stockmind_touch_updated_at();

drop trigger if exists inventory_locations_touch_updated_at on inventory_locations;
create trigger inventory_locations_touch_updated_at
  before update on inventory_locations
  for each row execute function stockmind_touch_updated_at();

-- ------------------------------------------------------------
-- Backfill dictionaries from existing data
-- ------------------------------------------------------------
-- Upsert by unique active-name index using lower(name) conflict target:
-- PostgreSQL cannot directly reference partial indexes in ON CONFLICT
-- without naming a matching unique constraint. We therefore dedupe with
-- NOT EXISTS to stay idempotent.
insert into inventory_categories (name)
select src.name
from (
  select distinct trim(category) as name
  from books_master
  where category is not null and trim(category) <> ''
) src
where not exists (
  select 1
  from inventory_categories c
  where c.deleted_at is null and lower(c.name) = lower(src.name)
);

insert into inventory_locations (name)
select src.name
from (
  select distinct trim(location) as name
  from book_copies
  where location is not null and trim(location) <> ''
) src
where not exists (
  select 1
  from inventory_locations l
  where l.deleted_at is null and lower(l.name) = lower(src.name)
);
