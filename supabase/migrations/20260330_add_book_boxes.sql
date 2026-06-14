create table if not exists book_boxes (
  id               uuid primary key default uuid_generate_v4(),
  book_id          uuid references books_master(id) on delete cascade,
  epc_tag          text not null unique,
  quantity         integer not null check (quantity > 0),
  location         text,
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

create index if not exists idx_book_boxes_epc on book_boxes(epc_tag);
create index if not exists idx_book_boxes_book_id on book_boxes(book_id);
create index if not exists idx_book_boxes_updated_at on book_boxes(updated_at desc);
create index if not exists idx_book_boxes_deleted_at on book_boxes(deleted_at);

alter table book_boxes enable row level security;

grant select, insert on table book_boxes to anon, authenticated;
grant all privileges on table book_boxes to service_role;

drop trigger if exists book_boxes_sync_fields on book_boxes;
create trigger book_boxes_sync_fields
  before update on book_boxes
  for each row execute function stockmind_set_sync_fields();

drop policy if exists "boxes_select_active" on book_boxes;
drop policy if exists "boxes_insert_legacy" on book_boxes;

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'book_boxes'
  ) then
    alter publication supabase_realtime add table book_boxes;
  end if;
end $$;
