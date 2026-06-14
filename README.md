# StockMind

StockMind is an RFID inventory platform with a web dashboard and a new offline-first Flutter Android app.

- Web: Next.js + React + TypeScript + Tailwind
- Cloud: Supabase (Postgres + Realtime)
- Mobile: Flutter + SQLite local database
- Sync middleware: Next.js API sync routes + optional MySQL mirror

## Why SQLite on mobile (and not on-device MySQL)
Direct MySQL inside Android is operationally weak (security, connection handling, schema migration complexity, battery/network behavior).  
This implementation uses **SQLite on-device** for safe offline-first mobile behavior, while preserving **MySQL** as a server-side mirror in the sync middleware.

This keeps the dual-database business requirement intact:
- Supabase = source of truth
- MySQL = secondary synchronized mirror

## Architecture
See [Architecture Notes](docs/architecture.md).

## Current modules
### Web (existing flows preserved)
- Authentication
- Secret IT admin page (`/robokorda/it-admin`) for account lifecycle + reset assignment
- Dashboard
- Inventory management (`/inventory`)
- Single add
- Bulk add
- Sales
- Stock count
- Reports
- Settings (DB-backed category/location administration)
- CSV-assisted scan/add title selection

### Flutter mobile (new)
- Authentication
- Forgot-password request form (email + phone)
- Inventory list
- RFID/manual scan add
- Sales
- Stock count
- Reports summary
- Sync status chip: `offline`, `pending sync`, `synced`, `conflict`, `sync failed`

## Sync model
Conflict strategy is **server-authoritative last-write-wins** using `updated_at` and `row_version`.

### Push (mobile -> cloud)
1. Mobile write commits to SQLite first.
2. Operation is queued in `sync_queue`.
3. Sync API (`/api/sync/push`) validates token and applies operation to Supabase.
4. Row is mirrored to MySQL when configured.
5. API returns `acknowledged`, `conflicts`, and `failed` arrays.

### Pull (cloud -> mobile)
1. Mobile sends per-table checkpoints to `/api/sync/pull`.
2. API returns rows where `updated_at > checkpoint`.
3. Mobile upserts rows into SQLite and advances checkpoints.

## Security hardening included
- Removed insecure auth fallbacks (`admin/admin` and default secrets).
- Mandatory env-based auth secret and credentials.
- IT admin registration requires `IT_ADMIN_SECRET_KEY` (never hardcoded).
- IT admin account actions are restricted to IT-admin sessions only.
- In-memory rate limiting on web and mobile login endpoints.
- Token-based mobile auth endpoint.
- Sync endpoints protected by Bearer token or shared sync token.
- Sync push/pull payload validation with bounded request sizes.
- `Cache-Control: no-store` on auth responses.
- No hardcoded web/mobile secrets in source.
- Android legacy wrapper URL moved to build config field.

## Database changes
Updated Supabase SQL adds sync metadata and soft-delete support:
- `updated_at`
- `deleted_at`
- `last_synced_at`
- `last_modified_by`
- `device_id`
- `row_version`
- `inventory_categories` table (managed categories)
- `inventory_locations` table (managed shelf/location dictionary)
- `books_master` metadata extensions: `author`, `publisher`, `edition`, `list_price`
- `app_accounts` table for unified web/mobile credentials
- `password_reset_requests` table for mobile reset workflow + audit trail

Files:
- `supabase/schema.sql`
- `supabase/rls.sql`
- `supabase/migrations/20260318_hybrid_sync_upgrade.sql`
- `supabase/migrations/20260324_inventory_admin_extensions.sql`
- `supabase/migrations/20260323_auth_admin_controls.sql`

MySQL mirror schema:
- `mysql/schema.sql`

## New API surfaces (additive)
- Mobile auth extension:
  - `POST /api/mobile/auth/request-reset`
- IT admin auth/account APIs:
  - `POST /api/it-admin/register`
  - `GET/POST /api/it-admin/accounts`
  - `PATCH/DELETE /api/it-admin/accounts/:id`
  - `GET /api/it-admin/reset-requests`
  - `PATCH /api/it-admin/reset-requests/:id`
- Reference data admin APIs:
  - `GET/POST /api/reference/categories`
  - `PATCH/DELETE /api/reference/categories/:id`
  - `GET/POST /api/reference/locations`
  - `PATCH/DELETE /api/reference/locations/:id`
- Inventory management APIs:
  - `GET /api/inventory`
  - `PATCH/DELETE /api/inventory/copies/:id`
  - `PATCH/DELETE /api/inventory/titles/:id`
- CSV export APIs:
  - `GET /api/reports/sales-csv`
  - `GET /api/reports/inventory-csv`

All new `/api/*` routes are admin-protected by existing session middleware, except already-public auth/mobile/sync routes.

## Environment variables
### Root `.env.local` (web + sync middleware)
Use `.env.example` as template.

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `LOGIN_SECRET`
- `SYNC_API_TOKEN`
- `IT_ADMIN_SECRET_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Optional:
- `SESSION_TTL_SECONDS`
- `MYSQL_URL`
- `SMTP_SECURE`
- `PASSWORD_RESET_NOTIFY_TO` (defaults to `takundanyamandi@gmail.com`)

### Mobile `.env`
Use `mobile/.env.example` as template.

Required:
- `SYNC_BASE_URL` (Next.js server base URL, e.g. `http://10.0.2.2:3000` for emulator)

Optional:
- `SYNC_API_TOKEN` (if using shared-token auth mode)

## Setup guide
## 1) Supabase
1. Create project in Supabase.
2. Run `supabase/schema.sql`.
3. Run `supabase/rls.sql`.
4. If upgrading existing DB, run `supabase/migrations/20260318_hybrid_sync_upgrade.sql`.
5. Run `supabase/migrations/20260324_inventory_admin_extensions.sql`.
6. Run `supabase/migrations/20260323_auth_admin_controls.sql`.
6. RLS and grants are least-privilege:
   - `books_master`: anon/authenticated = `SELECT, INSERT`
   - `book_copies`: anon/authenticated = `SELECT, INSERT`
   - `sales`: anon/authenticated = `SELECT` only
   - all write/sync middleware runs through service-role server routes

## 2) MySQL mirror (optional but recommended for dual-db requirement)
1. Create MySQL database.
2. Run `mysql/schema.sql`.
3. Set `MYSQL_URL` in root env.

## 3) Web app
```bash
npm install
npm run dev
```
Default URL: `http://localhost:3000`

Production launch:
```bash
npm run build
npm run start
```

Key web pages:
- `/` dashboard with quick actions, summaries, insights, and export links
- `/inventory` full inventory management (search/filter/edit/rescan/safe delete)
- `/settings` category and shelf/location administration
- `/reports` sales + inventory reporting and CSV export
- `/robokorda/it-admin` secure IT admin route (register IT admin, register/delete accounts, assign passwords)

## 4) Flutter mobile app
```bash
cd mobile
flutter pub get
flutter run
```

## Legacy Android WebView wrapper
The folder `android-app/` is retained for legacy compatibility only.
- URL is now configurable via `buildConfigField WEB_APP_URL` in `android-app/build.gradle`.
- Primary field app should be the Flutter app in `mobile/`.

## Runbook notes
- Offline mode: all mobile writes keep working in SQLite.
- Connectivity restored: app auto-syncs pending queue.
- Offline login works only after at least one successful online login for that account on the device.
- Forgot password from mobile sends an email notification to IT admin and stores an auditable reset request.
- Password reset is completed only in web IT admin page by assigning a new password.
- Conflicts: local records are marked `conflict` in sync status.
- Retry: sync failures retry with exponential backoff.
- Soft delete is default for administrative delete actions.
- Hard delete is available only with explicit `DELETE` confirmation and relation safety checks.

## Operational caveats
- Web dependency install may fail on unstable network; rerun `npm install` if needed.
- Flutter app has been statically analyzed (`flutter analyze`) with zero issues.
- Lost IT admin secret key rule: if `IT_ADMIN_SECRET_KEY` is forgotten, the deployment must be manually reconfigured with a new key and re-issued credentials.
