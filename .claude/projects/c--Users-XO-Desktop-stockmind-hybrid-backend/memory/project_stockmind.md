---
name: project-stockmind-overview
description: StockMind hybrid backend project overview — architecture, deployment, DB schema rules
metadata:
  type: project
---

StockMind is a Next.js 15 RFID inventory system for AIEC book tracking, deployed on Vercel at `https://stockmind-hybrid-backend.vercel.app`. The database is a self-hosted Supabase on a shared Contabo VPS at `https://api.robokorda.duckdns.org` (SSH: `root@178.238.227.229`).

**Why:** Multiple projects share the same PostgreSQL instance — always use the additive schema pattern from SHARED_DB_RULES before touching DB config. See [[shared-db-rules]].

**How to apply:** Use `.env.local` credentials (not any older `.env`) — those are always the up-to-date JWT and service role keys.

Key tables: `book_copies`, `books_master`, `book_boxes`, `sales` — currently accessed without explicit schema prefix. Tables may be in `public` or a custom schema; verify before adding `db: { schema: '…' }` to clients.

Mobile native app syncs to Vercel via `/api/sync/push` and `/api/sync/pull`. Token in `mobile/.env` as `SYNC_API_TOKEN`.

"TypeError: fetch failed" on the dashboard = Supabase server unreachable from Vercel (network/SSL/DuckDNS issue), not a code bug.
