# B2 prototype (isolated)

Isolated encryption试作 for phase B2. **Not wired to production.** See `../report_B2_prototype.md`.

## Run
```bash
npm install jose@5.9.6 --no-save      # dev-only; not a worker dependency
node b2_prototype/test_b2.mjs          # Node acceptance suite (57 checks)
node b2_prototype/run_browser_check.mjs # real-Chromium check (12 checks)
```

## Files
- `vault_crypto.mjs` — crypto core (jose JWE A256KW/A256GCM + native Web Crypto). Runs in Node and browser.
- `review_portable.mjs` — device-side port of `src/review/review_service.js` (verified byte-equal).
- `fake_e2ee_server.mjs` — ciphertext-only fake server/DB (holds no decryption key).
- `test_b2.mjs` — Node acceptance.
- `browser/index.html` + `run_browser_check.mjs` — runs the same `vault_crypto.mjs` in Chromium.

## Scope
Synthetic data only. No production code/schema/data/deploy changes.
