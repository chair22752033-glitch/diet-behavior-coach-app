# Sync Ownership — Migration, Rollout & Recovery (staged, NOT applied)

Follow-up remediation 2026-09-30. These steps are **prepared for review**; nothing here has been
applied to production and no release has been made under this task.

## What changed (code, already committed on the branch)
- `src/sync/sync_store.js` — session-owned, transactional D1 sync store (per-record upsert).
- `src/worker.js` — `/api/sync` + `/api/qlive` intercepted in `fetch()`, gated by the verified
  session (`getCurrentUser`); owner is `ctx`-resolved `userId`, never a client code/id. Legacy
  anonymous short-code KV handlers fail closed (HTTP 410). Client sync is session-gated (`SYNC_ON`),
  records carry a stable `id`.
- Staged migration: `backups/remediation-sync-ownership/0008_phase8_sync_ownership.sql`
  (kept OUT of `migrations/` so the existing "exactly 7 migrations" regression gates stay green
  and unweakened; move it in at rollout — see below).

## Additive migration (0008)
Creates two NEW tables only (no change to existing tables, no data deletion):
- `sync_records(user_id, kind, record_id, payload, client_ts, updated_at)` PK `(user_id,kind,record_id)`
- `sync_meta(user_id, kind, scalars, version, updated_at)` PK `(user_id,kind)`

## Rollout steps (only when a release is authorized)
1. Move the staged migration into the live directory and update the migration-count gates:
   ```
   git mv backups/remediation-sync-ownership/0008_phase8_sync_ownership.sql migrations/0008_phase8_sync_ownership.sql
   ```
   Then update the "migrations/ 共7個 .sql" / "恰好7個" assertions in the 1.111–1.127 suites to 8
   (same fix-forward the project already did 6→7 for TASK1.120). Re-run the suites.
2. Apply the migration to D1 (does not touch existing rows):
   ```
   npx wrangler d1 migrations apply diet-coach-db          # remote
   npx wrangler d1 execute diet-coach-db --file=migrations/0008_phase8_sync_ownership.sql   # or explicit
   ```
3. Record the current active version as the rollback target BEFORE deploying:
   ```
   npx wrangler deployments list        # note the current active Version ID
   ```
4. Deploy:
   ```
   npx wrangler deploy
   ```
5. Rollback if needed (code only; does not drop the new tables or touch user data):
   ```
   npx wrangler rollback <previous-active-version-id>
   ```
   To also remove the tables (only if fully reverting): `DROP TABLE IF EXISTS sync_records; DROP TABLE IF EXISTS sync_meta;`

## Non-destructive legacy data recovery (no auto-claim)
The old model stored data under `KV sync:<user-chosen-code>`. A short code does NOT prove ownership,
so it is **never auto-assigned** to an account. Users lose nothing:
- **Local data is untouched** — every device keeps its `localStorage['diet_app_v1']`.
- **On first login**, the client pushes local data to the user's own session-owned D1 record
  (`cloudPush` on load / on save), so a returning user re-establishes their history under their
  account automatically, without any code.
- Old `KV sync:*` blobs are left to expire naturally; they are unreachable via the app (410) and can
  be exported manually by an operator if ever needed. There is **no** automatic import that would
  bind an anonymous code to an account.

## Behavior change to communicate
Cross-device cloud sync now requires signing in (same Google account on both devices). Anonymous use
remains fully functional **locally**; it just does not sync to the cloud. This is the security intent
(ownership by verified session, not by a guessable shared code).

## Delete semantics (explicit)
The product only appends records; there is no delete/tombstone sync. Omitting a previously-synced
record does NOT delete it on the server. If deletion sync is ever required, add a `deleted_at`
column + explicit tombstone rules — until then, deletes do not propagate (stated, not implied).

## Fixtures / how to reproduce
- Executable fixtures + real SQL: `backups/remediation-sync-ownership/test_sync_ownership_boundary.mjs`
  (drives the real Worker `fetch()` against a `node:sqlite` D1 + fake KV + real guest sessions).
- Client behavior: `backups/remediation-auth-sync/test_auth_sync_integrity.mjs`.
```
node backups/remediation-sync-ownership/test_sync_ownership_boundary.mjs
node backups/remediation-auth-sync/test_auth_sync_integrity.mjs
PHASE1_REVIEW_NESTED=1 node backups/phase7-task1.127-app-experience/test_app_experience_layer.mjs
```
