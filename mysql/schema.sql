-- ============================================================
-- StockMind MySQL Mirror Schema
-- Used by sync middleware as a secondary database layer.
-- ============================================================

create table if not exists sync_books_master (
  id varchar(36) primary key,
  title text not null,
  isbn varchar(64) null,
  category varchar(255) null,
  author varchar(255) null,
  publisher varchar(255) null,
  edition varchar(255) null,
  list_price decimal(10, 2) null,
  created_at datetime(6) not null,
  updated_at datetime(6) not null,
  deleted_at datetime(6) null,
  last_synced_at datetime(6) null,
  last_modified_by varchar(255) null,
  device_id varchar(255) null,
  row_version bigint not null default 1,
  index idx_sync_books_master_updated_at (updated_at),
  index idx_sync_books_master_deleted_at (deleted_at)
);

create table if not exists sync_book_copies (
  id varchar(36) primary key,
  book_id varchar(36) not null,
  epc_tag varchar(255) not null unique,
  location varchar(255) null,
  location_type varchar(32) null,
  location_name varchar(255) null,
  status varchar(32) not null,
  date_added datetime(6) not null,
  updated_at datetime(6) not null,
  deleted_at datetime(6) null,
  last_synced_at datetime(6) null,
  last_modified_by varchar(255) null,
  device_id varchar(255) null,
  row_version bigint not null default 1,
  index idx_sync_book_copies_book_id (book_id),
  index idx_sync_book_copies_updated_at (updated_at),
  index idx_sync_book_copies_deleted_at (deleted_at)
);

create table if not exists sync_book_boxes (
  id varchar(36) primary key,
  book_id varchar(36) not null,
  epc_tag varchar(255) not null unique,
  quantity int not null,
  location varchar(255) null,
  location_type varchar(32) null,
  location_name varchar(255) null,
  created_at datetime(6) not null,
  updated_at datetime(6) not null,
  deleted_at datetime(6) null,
  last_synced_at datetime(6) null,
  last_modified_by varchar(255) null,
  device_id varchar(255) null,
  row_version bigint not null default 1,
  index idx_sync_book_boxes_book_id (book_id),
  index idx_sync_book_boxes_updated_at (updated_at),
  index idx_sync_book_boxes_deleted_at (deleted_at)
);

create table if not exists sync_sales (
  id varchar(36) primary key,
  copy_id varchar(36) null,
  book_id varchar(36) null,
  epc_tag varchar(255) not null,
  title text not null,
  isbn varchar(64) null,
  category varchar(255) null,
  location varchar(255) null,
  location_type varchar(32) null,
  location_name varchar(255) null,
  price_paid decimal(10, 2) not null default 0,
  sold_at datetime(6) not null,
  notes text null,
  updated_at datetime(6) not null,
  deleted_at datetime(6) null,
  last_synced_at datetime(6) null,
  last_modified_by varchar(255) null,
  device_id varchar(255) null,
  row_version bigint not null default 1,
  index idx_sync_sales_sold_at (sold_at),
  index idx_sync_sales_updated_at (updated_at),
  index idx_sync_sales_deleted_at (deleted_at)
);

create table if not exists sync_checkpoints (
  table_name varchar(64) primary key,
  last_checkpoint datetime(6) not null,
  updated_at datetime(6) not null
);
