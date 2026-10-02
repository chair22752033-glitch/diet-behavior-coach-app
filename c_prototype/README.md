# C-stage prototype — consent events (isolated)

Isolated groundwork for C3/C4 (consent recording). **Not wired to production.** Implements
GPT's consent-doc §8. Synthetic data only; no production code/schema/data/deploy changes.

## Run
```bash
node c_prototype/test_consent.mjs   # real file-backed node:sqlite D1 (25 checks)
```

## Files
- `consent_schema.sql` — `consent_documents` (version→content hash registry) + append-only `consent_events`.
- `consent_store.mjs` — register doc version, record consent (append-only), getLatest / history, `hasActiveConsent` (server-authoritative), `sha256Hex`. Uses the project's real DB layer.
- `test_consent.mjs` — proves: append-only, version+hash immutability, version-bump invalidation, withdraw/decline, failed-record-never-enables, content-change detection, order linkage, unique event ids, no sensitive data/columns in the DB file.

## Design guarantees (GPT §8)
- Append-only: corrections/withdrawals add rows; a past consent is never rewritten.
- Each event pins the exact document version + content hash shown.
- Server is the authority; a failed record never enables the gated feature.
- Structurally stores NO recovery code / key / token / food plaintext / full IP (no columns for them).

## Not yet (needs owner + legal before wiring to production)
- Real document CONTENT (terms/privacy) — legal must finalize; registry only pins hashes.
- Route/UI wiring into the live worker — after C1 pricing + C2 legal are done.
