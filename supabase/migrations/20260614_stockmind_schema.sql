-- ============================================================
-- 20260614_stockmind_schema.sql
-- Full StockMind schema — run on shared Supabase VPS
-- Follows SHARED_DB_RULES: own schema, additive pgrst DO block
-- ============================================================

-- ── Step 1: Schema ─────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS stockmind;

-- ── Step 2: Extensions ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Step 3: Tables ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stockmind.books_master (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            text        NOT NULL,
  isbn             text,
  category         text,
  author           text,
  publisher        text,
  edition          text,
  list_price       numeric(10,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint      NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stockmind.inventory_categories (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS stockmind.inventory_locations (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_type text        NOT NULL DEFAULT 'shelf'
                            CHECK (location_type IN ('warehouse','stock_room','shelf')),
  name          text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE IF NOT EXISTS stockmind.app_accounts (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  password_salt text        NOT NULL,
  is_it_admin   boolean     NOT NULL DEFAULT false,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  created_by    text
);

CREATE TABLE IF NOT EXISTS stockmind.password_reset_requests (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               text        NOT NULL,
  phone               text        NOT NULL,
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','completed')),
  notify_status       text        NOT NULL DEFAULT 'pending'
                                  CHECK (notify_status IN ('pending','sent','failed')),
  notify_error        text,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  requested_device_id text,
  requested_from_ip   text,
  resolved_at         timestamptz,
  resolved_by         text,
  resolution_notes    text
);

CREATE TABLE IF NOT EXISTS stockmind.book_copies (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id          uuid        REFERENCES stockmind.books_master(id) ON DELETE CASCADE,
  epc_tag          text        NOT NULL UNIQUE,
  location         text,
  location_type    text        CHECK (location_type IN ('warehouse','stock_room','shelf')),
  location_name    text,
  status           text        NOT NULL DEFAULT 'in_stock'
                               CHECK (status IN ('in_stock','checked_out','lost')),
  date_added       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint      NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stockmind.book_boxes (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id          uuid        REFERENCES stockmind.books_master(id) ON DELETE CASCADE,
  epc_tag          text        NOT NULL UNIQUE,
  quantity         integer     NOT NULL CHECK (quantity > 0),
  location         text,
  location_type    text        CHECK (location_type IN ('warehouse','stock_room','shelf')),
  location_name    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint      NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stockmind.sales (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  copy_id          uuid        REFERENCES stockmind.book_copies(id) ON DELETE SET NULL,
  book_id          uuid        REFERENCES stockmind.books_master(id) ON DELETE SET NULL,
  epc_tag          text        NOT NULL,
  title            text        NOT NULL,
  isbn             text,
  category         text,
  location         text,
  location_type    text        CHECK (location_type IN ('warehouse','stock_room','shelf')),
  location_name    text,
  price_paid       numeric(10,2) NOT NULL DEFAULT 0,
  sold_at          timestamptz NOT NULL DEFAULT now(),
  notes            text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  last_synced_at   timestamptz,
  last_modified_by text,
  device_id        text,
  row_version      bigint      NOT NULL DEFAULT 1
);

-- ── Step 4: Indexes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bm_updated_at   ON stockmind.books_master(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bm_deleted_at   ON stockmind.books_master(deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_active_name
  ON stockmind.inventory_categories(lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cat_name        ON stockmind.inventory_categories(name);
CREATE INDEX IF NOT EXISTS idx_cat_deleted_at  ON stockmind.inventory_categories(deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_loc_active_type_name
  ON stockmind.inventory_locations(lower(location_type), lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loc_name        ON stockmind.inventory_locations(name);
CREATE INDEX IF NOT EXISTS idx_loc_type        ON stockmind.inventory_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_loc_deleted_at  ON stockmind.inventory_locations(deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_acct_active_email
  ON stockmind.app_accounts(lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_acct_deleted_at ON stockmind.app_accounts(deleted_at);

CREATE INDEX IF NOT EXISTS idx_prr_status
  ON stockmind.password_reset_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_email
  ON stockmind.password_reset_requests(lower(email));

CREATE INDEX IF NOT EXISTS idx_bc_epc        ON stockmind.book_copies(epc_tag);
CREATE INDEX IF NOT EXISTS idx_bc_book_id    ON stockmind.book_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_bc_updated_at ON stockmind.book_copies(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bc_deleted_at ON stockmind.book_copies(deleted_at);

CREATE INDEX IF NOT EXISTS idx_bb_epc        ON stockmind.book_boxes(epc_tag);
CREATE INDEX IF NOT EXISTS idx_bb_book_id    ON stockmind.book_boxes(book_id);
CREATE INDEX IF NOT EXISTS idx_bb_updated_at ON stockmind.book_boxes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bb_deleted_at ON stockmind.book_boxes(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at   ON stockmind.sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_book_id   ON stockmind.sales(book_id);
CREATE INDEX IF NOT EXISTS idx_sales_epc       ON stockmind.sales(epc_tag);
CREATE INDEX IF NOT EXISTS idx_sales_updated   ON stockmind.sales(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_deleted   ON stockmind.sales(deleted_at);

-- ── Step 5: Functions (scoped to stockmind schema) ────────

CREATE OR REPLACE FUNCTION stockmind.set_sync_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.updated_at IS NULL OR NEW.updated_at <= OLD.updated_at THEN
      NEW.updated_at = now();
    END IF;
    IF NEW.row_version IS NULL OR NEW.row_version <= OLD.row_version THEN
      NEW.row_version = OLD.row_version + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION stockmind.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.updated_at IS NULL OR NEW.updated_at <= OLD.updated_at THEN
      NEW.updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Step 6: Triggers ───────────────────────────────────────

DROP TRIGGER IF EXISTS books_master_sync_fields ON stockmind.books_master;
CREATE TRIGGER books_master_sync_fields
  BEFORE UPDATE ON stockmind.books_master
  FOR EACH ROW EXECUTE FUNCTION stockmind.set_sync_fields();

DROP TRIGGER IF EXISTS book_copies_sync_fields ON stockmind.book_copies;
CREATE TRIGGER book_copies_sync_fields
  BEFORE UPDATE ON stockmind.book_copies
  FOR EACH ROW EXECUTE FUNCTION stockmind.set_sync_fields();

DROP TRIGGER IF EXISTS book_boxes_sync_fields ON stockmind.book_boxes;
CREATE TRIGGER book_boxes_sync_fields
  BEFORE UPDATE ON stockmind.book_boxes
  FOR EACH ROW EXECUTE FUNCTION stockmind.set_sync_fields();

DROP TRIGGER IF EXISTS sales_sync_fields ON stockmind.sales;
CREATE TRIGGER sales_sync_fields
  BEFORE UPDATE ON stockmind.sales
  FOR EACH ROW EXECUTE FUNCTION stockmind.set_sync_fields();

DROP TRIGGER IF EXISTS inventory_categories_touch ON stockmind.inventory_categories;
CREATE TRIGGER inventory_categories_touch
  BEFORE UPDATE ON stockmind.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION stockmind.touch_updated_at();

DROP TRIGGER IF EXISTS inventory_locations_touch ON stockmind.inventory_locations;
CREATE TRIGGER inventory_locations_touch
  BEFORE UPDATE ON stockmind.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION stockmind.touch_updated_at();

DROP TRIGGER IF EXISTS app_accounts_touch ON stockmind.app_accounts;
CREATE TRIGGER app_accounts_touch
  BEFORE UPDATE ON stockmind.app_accounts
  FOR EACH ROW EXECUTE FUNCTION stockmind.touch_updated_at();

-- ── Step 7: RLS ────────────────────────────────────────────

ALTER TABLE stockmind.books_master            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.book_copies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.book_boxes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.sales                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.inventory_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.inventory_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.app_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockmind.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- service_role bypass policies
DROP POLICY IF EXISTS "sm_bm_srole"   ON stockmind.books_master;
CREATE POLICY "sm_bm_srole" ON stockmind.books_master
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_bc_srole"   ON stockmind.book_copies;
CREATE POLICY "sm_bc_srole" ON stockmind.book_copies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_bb_srole"   ON stockmind.book_boxes;
CREATE POLICY "sm_bb_srole" ON stockmind.book_boxes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_sales_srole" ON stockmind.sales;
CREATE POLICY "sm_sales_srole" ON stockmind.sales
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_cat_srole"  ON stockmind.inventory_categories;
CREATE POLICY "sm_cat_srole" ON stockmind.inventory_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_loc_srole"  ON stockmind.inventory_locations;
CREATE POLICY "sm_loc_srole" ON stockmind.inventory_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_acct_srole" ON stockmind.app_accounts;
CREATE POLICY "sm_acct_srole" ON stockmind.app_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sm_prr_srole"  ON stockmind.password_reset_requests;
CREATE POLICY "sm_prr_srole" ON stockmind.password_reset_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon/authenticated read-only policies (soft-delete aware)
DROP POLICY IF EXISTS "sm_bm_select"   ON stockmind.books_master;
CREATE POLICY "sm_bm_select" ON stockmind.books_master
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_bm_insert"   ON stockmind.books_master;
CREATE POLICY "sm_bm_insert" ON stockmind.books_master
  FOR INSERT TO anon, authenticated WITH CHECK (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_bc_select"   ON stockmind.book_copies;
CREATE POLICY "sm_bc_select" ON stockmind.book_copies
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_bc_insert"   ON stockmind.book_copies;
CREATE POLICY "sm_bc_insert" ON stockmind.book_copies
  FOR INSERT TO anon, authenticated WITH CHECK (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_bb_select"   ON stockmind.book_boxes;
CREATE POLICY "sm_bb_select" ON stockmind.book_boxes
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_bb_insert"   ON stockmind.book_boxes;
CREATE POLICY "sm_bb_insert" ON stockmind.book_boxes
  FOR INSERT TO anon, authenticated WITH CHECK (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_sales_select" ON stockmind.sales;
CREATE POLICY "sm_sales_select" ON stockmind.sales
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_cat_select"  ON stockmind.inventory_categories;
CREATE POLICY "sm_cat_select" ON stockmind.inventory_categories
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "sm_loc_select"  ON stockmind.inventory_locations;
CREATE POLICY "sm_loc_select" ON stockmind.inventory_locations
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

-- ── Step 8: Grants ─────────────────────────────────────────

GRANT USAGE ON SCHEMA stockmind TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA stockmind TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA stockmind TO service_role;
GRANT SELECT, INSERT ON stockmind.books_master         TO anon, authenticated;
GRANT SELECT, INSERT ON stockmind.book_copies          TO anon, authenticated;
GRANT SELECT, INSERT ON stockmind.book_boxes           TO anon, authenticated;
GRANT SELECT          ON stockmind.sales               TO anon, authenticated;
GRANT SELECT          ON stockmind.inventory_categories TO anon, authenticated;
GRANT SELECT          ON stockmind.inventory_locations  TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA stockmind GRANT ALL      ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA stockmind GRANT SELECT   ON TABLES TO anon, authenticated;

-- ── Step 9: Add stockmind to PostgREST schema list ────────
-- Safe additive pattern — NEVER replaces existing schemas

DO $$
DECLARE
  v_current text;
  v_schema  text := 'stockmind';
BEGIN
  SELECT split_part(cfg, '=', 2) INTO v_current
  FROM pg_roles, unnest(rolconfig) AS cfg
  WHERE rolname = 'authenticator'
    AND cfg LIKE 'pgrst.db_schemas=%';

  IF v_current IS NULL OR v_current = '' THEN
    v_current := 'public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors';
  END IF;

  IF position(v_schema IN v_current) = 0 THEN
    EXECUTE format(
      'ALTER ROLE authenticator SET "pgrst.db_schemas" TO %L',
      v_current || ',' || v_schema
    );
    RAISE NOTICE 'pgrst.db_schemas updated to: %', v_current || ',' || v_schema;
    NOTIFY pgrst;
  ELSE
    RAISE NOTICE 'Schema % already in pgrst.db_schemas — no change needed', v_schema;
  END IF;
END $$;

-- ── Step 10: Realtime publication ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'stockmind' AND tablename = 'books_master')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE stockmind.books_master; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'stockmind' AND tablename = 'book_copies')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE stockmind.book_copies; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'stockmind' AND tablename = 'book_boxes')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE stockmind.book_boxes; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'stockmind' AND tablename = 'sales')
  THEN ALTER PUBLICATION supabase_realtime ADD TABLE stockmind.sales; END IF;
END $$;
