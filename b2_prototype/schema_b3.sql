-- B3 drill schema (ISOLATED prototype). Simulates the legacy plaintext store + a
-- migration state machine. Used only by the B3 drill test against a real node:sqlite file.

-- Legacy plaintext records (simulates today's sync_records.payload = JSON plaintext).
CREATE TABLE IF NOT EXISTS legacy_records (
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  payload    TEXT NOT NULL,     -- PLAINTEXT JSON (what we are migrating away from)
  client_ts  INTEGER,
  PRIMARY KEY (user_id, kind, record_id)
);

-- Per-account migration state machine (GPT §7.1):
-- legacy -> migration_locked -> ciphertext_verified -> e2ee_only
CREATE TABLE IF NOT EXISTS migration_state (
  user_id        TEXT PRIMARY KEY,
  state          TEXT NOT NULL DEFAULT 'legacy',
  checkpoint_seq INTEGER NOT NULL DEFAULT 0,   -- last migrated rowid watermark (resume point)
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
