# StockMind Mobile (Flutter Android)

Offline-first Android app for field inventory operations.

## Stack
- Flutter
- SQLite (`sqflite`) local store
- Connectivity-triggered sync
- Sync API integration with Next.js backend

## Modules
- Login
- Inventory
- RFID/manual scan add (single + bulk)
- Sales
- Stock count
- Reports summary

## Local-first behavior
- Writes always commit to SQLite first.
- Each write creates a queue record in `sync_queue`.
- Sync service pushes queued operations to `/api/sync/push`.
- Sync service pulls incremental deltas from `/api/sync/pull`.
- Conflict policy: server-authoritative last-write-wins by `updated_at` + `row_version`.

## Setup
1. Copy `.env.example` to `.env`.
2. Set `SYNC_BASE_URL` to your web server URL.
3. Optional: set `SYNC_API_TOKEN` when using token-auth mode.
4. Run:
   ```bash
   flutter pub get
   flutter run
   ```

## Notes
- Package id: `com.robokorda.stockmindmobile`
- The app works offline and displays sync health states (`offline`, `pending sync`, `synced`, `conflict`, `sync failed`).
