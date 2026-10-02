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
```

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
