# StockMind Hybrid Backend — CLAUDE.md

## Project Overview

StockMind is an RFID-based warehouse inventory system for tracking textbooks for AIEC operations.

- **Web app**: Next.js 15, deployed on Vercel at `https://stockmind-hybrid-backend.vercel.app`
- **Database**: Self-hosted Supabase at `https://api.robokorda.duckdns.org`
- **Mobile native app**: Syncs to the web app via `/api/sync/push` and `/api/sync/pull`
- **Credentials**: Always use `.env.local` — it has the latest JWT keys and service role key

## DB Schema Note

The tables (`book_copies`, `books_master`, `book_boxes`, `sales`, etc.) are accessed without an explicit schema prefix, which means they are currently in `public` or the PostgREST search path resolves them. Before adding a `db: { schema: 'stockmind' }` to the Supabase clients, verify the actual schema name on the server via:

```bash
docker exec supabase-db psql -U postgres -c \
  "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'book%';"
```

---

# Shared Self-Hosted Supabase VPS — Database Rules & Conventions

> **MANDATORY** before writing any SQL migration, schema change, PostgREST config, or server-level command.
> This server hosts **multiple projects simultaneously** on a single PostgreSQL instance. A wrong command in one project's migration can instantly break all other projects.

## 1. Server Overview

| Item | Value |
| --- | --- |
| Server | Contabo VPS — `root@vmi3263043` — `178.238.227.229` |
| OS | Ubuntu 24.04 LTS |
| PostgreSQL | 15.8 — Docker container `supabase-db` |
| PostgREST | v14.8 — Docker container `supabase-rest` |
| Kong API Gateway | Docker container `supabase-kong`, host port `8000` |
| Self-hosted API URL | `https://api.robokorda.duckdns.org` |
| Docker Compose | `/root/supabase/docker/docker-compose.yml` |
| Docker Compose env | `/root/supabase/docker/.env` |

All projects on this server share **one PostgreSQL instance**, **one PostgREST process**, **one Kong gateway**, and **one `authenticator` PostgreSQL role**. There is no isolation between projects at the infrastructure level.

## 2. Registered Projects and Their Schemas

| Schema | Project | Status |
| --- | --- | --- |
| `public` | Supabase internal (auth helpers, extensions) | System — do not create tables here |
| `storage` | Supabase Storage service | System — do not modify |
| `graphql_public` | Supabase GraphQL | System — do not modify |
| `robocore` | RoboCore school management system | Active |
| `robokorda` | Robokorda website / Africa platform | Active |
| `aura` | Aura project | Active |
| `smartschools` | SmartSchools project | Active |
| `azim_motors` | Azim Motors workshop management | Active |

Canonical `pgrst.db_schemas` value:

```
public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors
```

If you add a new schema, append it — **never replace this list with only your schema.**

## 3. The Golden Rules

### Rule 1: Every project gets its own schema — never touch `public`

```sql
-- CORRECT
CREATE SCHEMA your_project;
CREATE TABLE your_project.users (...);

-- WRONG
CREATE TABLE public.users (...);
```

### Rule 2: NEVER use bare `ALTER ROLE authenticator SET pgrst.db_schemas`

The `authenticator` role is **shared by every project**. Use the additive DO block:

```sql
DO $$
DECLARE
  v_current text;
  v_schema  text := 'your_new_schema';
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
```

### Rule 3: NEVER use bare `ALTER ROLE authenticator SET search_path`

Only set `search_path` on your own application roles, never on `authenticator`, `anon`, or `authenticated`.

### Rule 4: PostgREST DB config overrides env vars — always

`ALTER ROLE authenticator SET "pgrst.db_schemas"` in the DB catalog overrides `PGRST_DB_SCHEMAS` in docker-compose. Container restarts do NOT fix this. Only another `ALTER ROLE` or `RESET` fixes it.

**To diagnose:**
```bash
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"
```

### Rule 5: Schema names must be unique across the entire server

Check before creating:
```bash
docker exec supabase-db psql -U postgres -c \
  "SELECT nspname FROM pg_catalog.pg_namespace ORDER BY nspname;"
```

### Rule 6: Grant only to your schema — never re-grant on system schemas

```sql
GRANT USAGE ON SCHEMA your_schema TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA your_schema TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA your_schema TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA your_schema TO authenticated;
```

### Rule 7: RLS must be enabled on every table

```sql
ALTER TABLE your_schema.your_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access"
  ON your_schema.your_table FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### Rule 8: Functions must specify their schema explicitly

```sql
CREATE FUNCTION your_schema.calculate_total(...) ...;
```

### Rule 9: Never run `docker compose down -v` on this server

The `-v` flag destroys all Docker named volumes (all project data). There is no confirmation prompt.

### Rule 10: Never run DDL on other projects' schemas

Do not `ALTER`, `DROP`, `TRUNCATE`, or `INSERT` into tables belonging to another project.

## 4. Supabase Client Configuration

Always specify `db.schema` when creating the client:

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'your_schema' },
})
```

## 5. Quick Diagnostic Commands (via SSH to `root@178.238.227.229`)

```bash
# What schemas does PostgREST serve?
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"

# List all schemas
docker exec supabase-db psql -U postgres -c \
  "SELECT nspname FROM pg_namespace ORDER BY nspname;"

# PostgREST logs
docker logs --tail 50 supabase-rest

# Check containers
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## 6. Common Errors

| Error | Meaning | Fix |
| --- | --- | --- |
| `PGRST106: Invalid schema` | Schema not in `pgrst.db_schemas` on authenticator role | Run additive DO block from Rule 2 |
| `PGRST205: Could not find table 'public.name'` | Client defaults to `public` but table is in custom schema | Add `db: { schema: 'your_schema' }` to client |
| `TypeError: fetch failed` | Server can't reach Supabase URL (network/SSL issue) | Check if VPS is reachable; check DuckDNS resolution |
| `403 Forbidden` | RLS policy blocking the request | Add appropriate RLS policy |
