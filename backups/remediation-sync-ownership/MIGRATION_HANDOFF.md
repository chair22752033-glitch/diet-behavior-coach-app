# Migration 0008 — Verified Handoff (run this, then paste output)

All facts below were read first-hand from the live project on 2026-09-30. Nothing here writes to
production; the one write step is yours to run.

## The migration
- **Path:** `migrations/0008_phase8_sync_ownership.sql`
- **SHA256:** `57f2d702932f9da2923b7de35a42e6f83e8f81bd8eaa9a4801f04d29c1d03d01`
- **Additive-only (verified):** contains only `CREATE TABLE IF NOT EXISTS` (sync_records, sync_meta)
  and `CREATE INDEX IF NOT EXISTS`. The only `DROP` text is inside a rollback comment, not a statement.
  No INSERT/UPDATE/DELETE/ALTER/TRUNCATE. Existing tables and rows are untouched.
- **Tables created:** `sync_records(user_id,kind,record_id,payload,client_ts,updated_at)` PK
  `(user_id,kind,record_id)` + index `idx_sync_records_user_kind`; `sync_meta(user_id,kind,scalars,version,updated_at)` PK `(user_id,kind)`.

## Target database (from wrangler.toml)
- **name:** `diet-coach-db`   **id:** `9560446f-5d56-45e4-b605-ddec5cdf909f`

## Migration tracking state (verified read-only)
`npx wrangler d1 migrations list diet-coach-db --remote` → **only `0008_phase8_sync_ownership.sql` is pending.**
That means 0001–0007 are already recorded as applied, so a tracked apply will run **only 0008** and
record it — no historical replay, no seed (0002) re-insert.

## Recovery point (recorded, NOT restored)
- **D1 bookmark before migration:** `0000006f-00000000-000050f6-2809931818f4831f04ff6c660873f121`
- **Active Worker version (deploy rollback target):** `62cf281f-58e9-469b-898b-4a9c8dda155f`

## RECOMMENDED apply route (ONE route — tracked, applies only 0008)
Run from the repo root, on a machine with your Cloudflare login:
```bash
npx wrangler d1 migrations apply diet-coach-db --remote
```
This applies only the pending `0008` and updates the `d1_migrations` tracking table automatically —
no manual reconciliation needed. (Do NOT also run `d1 execute --file` for the same migration; that
would apply the SQL again without touching tracking. Pick this one route only.)

## Read-only verification (run after applying; paste the output back)
```bash
# 1) tracking now shows nothing pending
npx wrangler d1 migrations list diet-coach-db --remote

# 2) both tables exist
npx wrangler d1 execute diet-coach-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sync_records','sync_meta') ORDER BY name;"

# 3) columns + primary keys are as designed
npx wrangler d1 execute diet-coach-db --remote --command="PRAGMA table_info(sync_records);"
npx wrangler d1 execute diet-coach-db --remote --command="PRAGMA table_info(sync_meta);"

# 4) index exists
npx wrangler d1 execute diet-coach-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_records_user_kind';"
```
Expected: (1) "No migrations to apply"; (2) lists `sync_meta`, `sync_records`; (3) sync_records has
`user_id,kind,record_id,payload,client_ts,updated_at` with pk on user_id/kind/record_id, sync_meta
has `user_id,kind,scalars,version,updated_at` pk user_id/kind; (4) lists the index.

## After you paste successful output
I will (no further approval needed for these, they are my steps):
1. Re-verify the schema read-only myself.
2. `npx wrangler deploy` the tested commit.
3. Record the new active version + traffic %.
4. Verify live: assets 200; `/api/sync` + `/api/qlive` unauthenticated → 401; `/auth/provider` → 403;
   home + `/auth/google/start` reachable. (Signed-in flows depend on the Google OAuth redirect fix — see below.)

## BLOCKER for signed-in flows: Google OAuth `redirect_uri_mismatch`
Your login attempt returned `400 redirect_uri_mismatch`. The worker sends `env.GOOGLE_REDIRECT_URI`
verbatim; Google rejects it because it is not an exact match in the OAuth client's Authorized redirect
URIs. Fix (config, not code):
1. Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID →
   **Authorized redirect URIs** → add exactly (no trailing slash, https):
   `https://balance-diet.chair22752033.workers.dev/auth/google/callback`
   (optional Authorized JavaScript origin: `https://balance-diet.chair22752033.workers.dev`)
2. Make the worker secret match that exact string:
   `npx wrangler secret put GOOGLE_REDIRECT_URI`  → paste `https://balance-diet.chair22752033.workers.dev/auth/google/callback`
3. Wait a few minutes for Google to propagate, then retry login.
Until this matches, no one can sign in, and (because sync now requires a session) cross-device sync
cannot be exercised. The migration + deploy can still proceed; signed-in verification stays pending
on this fix.
