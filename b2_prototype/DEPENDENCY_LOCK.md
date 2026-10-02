# B2 prototype — dependency lock & integrity

Prototype-only. jose is a **dev/test dependency** for the sandbox; it is **not** a worker
runtime dependency and is **not** recorded in the project `package.json` (installed with
`--no-save`). For B3/B4 the shipped client loads a pinned jose browser build from the
site's own static assets (`public/`), never from a CDN.

## Pinned version
- **jose @ 6.2.12** (npm `latest` as of 2026-10-02; v6.x is the actively security-maintained line — v5.x was dropped per GPT's review).
- Node test entry: `node_modules/jose/dist/webapi/index.js` (v6 is a single Web Crypto build; same file used for Node and the in-browser check via import map).

## Integrity (verify before trusting a fetched copy)
- npm registry tarball integrity: `sha512-9NiFmJEex0sy2Dk58j2UGBSHgUs2ypF9eZSu4L6vjOX3Dp96Sw1F3uL+H+D1sx02jZZdzUT0HgvCy59CuvXcWw==`
- npm registry shasum: `65663e146edd010b98ece83f81737d3aa95fd0d7`
- local `dist/webapi/index.js` sha256: `f198638529597ab18dc3d2799f362106121f90cf0b0c43e75c3dffa5cc6b8590`

## Install (reproduce)
```bash
npm install jose@6.2.12 --no-save
```

## Suites run against this version (all green)
- `test_b2.mjs` — 57/0
- `test_review_port.mjs` — 12/0
- `run_browser_check.mjs` (Chromium) — 12/0
- `run_idb_check.mjs` (Chromium persistent profile) — 9/0

## B3/B4 to-do on dependency
- When bundling jose into `public/`, record the exact file sha256 shipped and pin it; add
  a Subresource-Integrity or build-time hash check so a swapped asset is detectable.
- Re-check jose's security advisories at ship time; re-pin if a patch lands.
