alter table inventory_locations
  add column if not exists location_type text;

update inventory_locations
set location_type = 'shelf'
where coalesce(trim(location_type), '') = '';

update inventory_locations
set location_type = 'warehouse',
    name = nullif(trim(split_part(name, ':', 2)), '')
where coalesce(trim(name), '') <> ''
  and lower(trim(split_part(name, ':', 1))) = 'warehouse'
  and coalesce(trim(split_part(name, ':', 2)), '') <> '';

update inventory_locations
set location_type = 'stock_room',
    name = nullif(trim(split_part(name, ':', 2)), '')
where coalesce(trim(name), '') <> ''
  and lower(trim(split_part(name, ':', 1))) in ('stock room', 'stock_room')
  and coalesce(trim(split_part(name, ':', 2)), '') <> '';

update inventory_locations
set location_type = 'shelf',
    name = nullif(trim(split_part(name, ':', 2)), '')
where coalesce(trim(name), '') <> ''
  and lower(trim(split_part(name, ':', 1))) = 'shelf'
  and coalesce(trim(split_part(name, ':', 2)), '') <> '';

alter table inventory_locations
  alter column location_type set default 'shelf';

alter table inventory_locations
  alter column location_type set not null;

drop index if exists ux_inventory_locations_active_name;

create unique index if not exists ux_inventory_locations_active_type_name
  on inventory_locations(lower(location_type), lower(name))
  where deleted_at is null;

create index if not exists idx_inventory_locations_type
  on inventory_locations(location_type);

alter table book_copies
  add column if not exists location_type text,
  add column if not exists location_name text;

update book_copies
set location_name = nullif(trim(location), '')
where coalesce(trim(location_name), '') = ''
  and coalesce(trim(location), '') <> '';

update book_copies
set location_type = 'warehouse',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) = 'warehouse';

update book_copies
set location_type = 'stock_room',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) in ('stock room', 'stock_room');

update book_copies
set location_type = 'shelf',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) = 'shelf';

update book_copies
set location_type = 'shelf'
where coalesce(trim(location_type), '') = ''
  and coalesce(trim(location_name), '') <> '';

update book_copies
set location = concat(
  case location_type
    when 'warehouse' then 'Warehouse'
    when 'stock_room' then 'Stock Room'
    else 'Shelf'
  end,
  ': ',
  location_name
)
where coalesce(trim(location), '') = ''
  and coalesce(trim(location_name), '') <> '';

alter table book_boxes
  add column if not exists location_type text,
  add column if not exists location_name text;

update book_boxes
set location_name = nullif(trim(location), '')
where coalesce(trim(location_name), '') = ''
  and coalesce(trim(location), '') <> '';

update book_boxes
set location_type = 'warehouse',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) = 'warehouse';

update book_boxes
set location_type = 'stock_room',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) in ('stock room', 'stock_room');

update book_boxes
set location_type = 'shelf',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) = 'shelf';

update book_boxes
set location_type = 'shelf'
where coalesce(trim(location_type), '') = ''
  and coalesce(trim(location_name), '') <> '';

update book_boxes
set location = concat(
  case location_type
    when 'warehouse' then 'Warehouse'
    when 'stock_room' then 'Stock Room'
    else 'Shelf'
  end,
  ': ',
  location_name
)
where coalesce(trim(location), '') = ''
  and coalesce(trim(location_name), '') <> '';

alter table sales
  add column if not exists location_type text,
  add column if not exists location_name text;

update sales
set location_name = nullif(trim(location), '')
where coalesce(trim(location_name), '') = ''
  and coalesce(trim(location), '') <> '';

update sales
set location_type = 'warehouse',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) = 'warehouse';

update sales
set location_type = 'stock_room',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) in ('stock room', 'stock_room');

update sales
set location_type = 'shelf',
    location_name = nullif(trim(split_part(location, ':', 2)), '')
where coalesce(trim(location), '') <> ''
  and lower(trim(split_part(location, ':', 1))) = 'shelf';

update sales
set location_type = 'shelf'
where coalesce(trim(location_type), '') = ''
  and coalesce(trim(location_name), '') <> '';

update sales
set location = concat(
  case location_type
    when 'warehouse' then 'Warehouse'
    when 'stock_room' then 'Stock Room'
    else 'Shelf'
  end,
  ': ',
  location_name
)
where coalesce(trim(location), '') = ''
  and coalesce(trim(location_name), '') <> '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'book_copies_location_type_check'
  ) then
    alter table book_copies
      add constraint book_copies_location_type_check
      check (location_type in ('warehouse', 'stock_room', 'shelf'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'book_boxes_location_type_check'
  ) then
    alter table book_boxes
      add constraint book_boxes_location_type_check
      check (location_type in ('warehouse', 'stock_room', 'shelf'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_location_type_check'
  ) then
    alter table sales
      add constraint sales_location_type_check
      check (location_type in ('warehouse', 'stock_room', 'shelf'));
  end if;
end $$;
