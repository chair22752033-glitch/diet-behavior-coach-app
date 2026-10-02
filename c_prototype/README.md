# C-stage prototype — consent events (isolated)

Isolated groundwork for C3/C4 (consent recording). **Not wired to production.** Implements
GPT's consent-doc §8. Synthetic data only; no production code/schema/data/deploy changes.

## Run
```bash
node c_prototype/test_consent.mjs            # consent store, real node:sqlite D1 (25 checks)
node c_prototype/test_consent_api.mjs        # consent API over real D1, fetch-style (14 checks)
node c_prototype/run_consent_page_check.mjs  # shell page + API end-to-end in real Chromium (6 checks)
```

## Files
- `consent_schema.sql` — `consent_documents` (version→content hash registry) + append-only `consent_events`.
- `consent_store.mjs` — register doc version, record consent (append-only), getLatest / history, `hasActiveConsent` (server-authoritative), `sha256Hex`. Uses the project's real DB layer.
- `consent_api.mjs` — isolated fetch-style handler (GET documents / GET document / POST consent / GET status). Documents + userId are injected; **NOT mounted in src/worker.js**. Production must replace the header-based userId with the real session lookup.
- `documents/` — draft legal-doc SKELETONS (terms, privacy) with 【待定】 fields + honest privacy clause, pinned by content hash via `manifest.json`. Draft only; legal finalizes.
- `load_documents.mjs` — node-only loader (reads documents + computes hashes).
- `browser/consent_page.html` — shell document page: lists docs, shows content + hash + consent checkbox, posts to the API.
- `test_consent.mjs` — store proofs: append-only, version+hash immutability, version-bump invalidation, withdraw/decline, failed-record-never-enables, content-change detection, order linkage, unique event ids, no sensitive data/columns.
- `test_consent_api.mjs` — API proofs incl. served hash == recorded hash (provable what was agreed to), auth/validation, append-only via API.
- `run_consent_page_check.mjs` — real Chromium e2e: page → API → event persisted in real DB.

## Design guarantees (GPT §8)
- Append-only: corrections/withdrawals add rows; a past consent is never rewritten.
- Each event pins the exact document version + content hash shown.
- Server is the authority; a failed record never enables the gated feature.
- Structurally stores NO recovery code / key / token / food plaintext / full IP (no columns for them).

## Not yet (needs owner + legal before wiring to production)
- Real document CONTENT (terms/privacy) — legal must finalize; registry only pins hashes.
- Route/UI wiring into the live worker — after C1 pricing + C2 legal are done.
