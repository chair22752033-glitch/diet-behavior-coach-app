# B2 prototype (isolated)

Isolated encryption试作 for phase B2. **Not wired to production.** See `../report_B2_prototype.md`.

## Run
```bash
npm install jose@6.2.12 --no-save       # dev-only; not a worker dependency (see DEPENDENCY_LOCK.md)
node b2_prototype/test_b2.mjs           # Node core acceptance (57 checks)
node b2_prototype/test_review_port.mjs  # review edge cases vs production algo (12 checks)
node b2_prototype/run_browser_check.mjs # real-Chromium crypto round-trip (12 checks)
node b2_prototype/run_idb_check.mjs     # Chromium persistent profile: IndexedDB restart + A->B switch (9 checks)
node b2_prototype/test_b2_real_d1.mjs   # ciphertext over a REAL file-backed node:sqlite D1 + no-plaintext file scan (38 checks)
node b2_prototype/test_b3_migration.mjs # B3 drill: legacy plaintext -> E2EE migration, resume/verify/cleanup/rollback (25 checks)
node b2_prototype/test_b4_key_rotation.mjs # key rotation/revocation: change recovery code, rotate VK on compromise (9 checks)
node b2_prototype/test_b5_kv.mjs         # encrypt QUEST live state before KV put; no plaintext in KV (10 checks)
```

## B4/B5 (key rotation + KV ciphertext)
- `test_b4_key_rotation.mjs` (9/0): change recovery code (same VK; old code stops working),
  rotate VK on compromise (new epoch, re-encrypt, old VK locked out of new-epoch data),
  revocation semantics. Helpers `rewrapVaultWithNewRecovery` / `rotateVaultKey` in vault_crypto.
- `test_b5_kv.mjs` (10/0): encrypt the qlive blob (4th private store) before KV put; KV holds
  only ciphertext; get+decrypt round-trip; wrong-key/tamper/wrong-purpose rejected.

## B3 migration drill
`migration_drill.mjs` + `schema_b3.sql` + `test_b3_migration.mjs` simulate GPT §7 on a real
file-backed D1 with fake data: legacy → migration_locked → ciphertext_verified → e2ee_only,
with resumable batching (checkpoint), verify (count+content), crypto-aware rollback (can't
return to plaintext once verified), and cleanup. Finding: `DELETE` does not erase bytes from
the SQLite file — `VACUUM` is required; and D1 Time Travel still retains prior versions for
the retention window (Free 7d / Paid 30d), which must be disclosed. Not production; no real data.

## Files
- `vault_crypto.mjs` — crypto core (jose JWE A256KW/A256GCM + native Web Crypto). Runs in Node and browser.
- `review_portable.mjs` — device-side port of `src/review/review_service.js` (verified equal on sampled inputs incl. edge cases).
- `fake_e2ee_server.mjs` — ciphertext-only fake server/DB (holds no decryption key).
- `test_b2.mjs` / `test_review_port.mjs` — Node suites.
- `browser/index.html` + `run_browser_check.mjs` — runs the same `vault_crypto.mjs` in Chromium.
- `browser/idb_test.html` + `run_idb_check.mjs` — IndexedDB persistence across real browser restart + account switch.
- `DEPENDENCY_LOCK.md` — jose version pin + integrity.

## Scope
Synthetic data only. No production code/schema/data/deploy changes.
