-- ============================================================
-- 20260614_accounts_v2.sql
-- Extends app_accounts with user profiles + roles
-- ============================================================

-- Add profile & role columns (all IF NOT EXISTS — safe to re-run)
ALTER TABLE stockmind.app_accounts
  ADD COLUMN IF NOT EXISTS username          text,
  ADD COLUMN IF NOT EXISTS display_name      text,
  ADD COLUMN IF NOT EXISTS role              text NOT NULL DEFAULT 'admin'
                                             CHECK (role IN ('admin', 'sales')),
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url        text;

-- Backfill: username defaults to email for existing rows
UPDATE stockmind.app_accounts
  SET username = email
  WHERE username IS NULL;

-- Make username required now that it's populated
ALTER TABLE stockmind.app_accounts
  ALTER COLUMN username SET NOT NULL;

-- Unique index on lowercase username (active accounts only)
CREATE UNIQUE INDEX IF NOT EXISTS app_accounts_username_lower_idx
  ON stockmind.app_accounts (lower(username))
  WHERE deleted_at IS NULL;

-- Index on email for lookups
CREATE INDEX IF NOT EXISTS app_accounts_email_lower_idx
  ON stockmind.app_accounts (lower(email))
  WHERE deleted_at IS NULL;

-- Supabase storage bucket for avatars (RLS-bypassed via service role in app)
-- Run this separately in Supabase dashboard Storage tab if it doesn't auto-create:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('stockmind-avatars', 'stockmind-avatars', true)
-- ON CONFLICT (id) DO NOTHING;
