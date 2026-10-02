-- B2 continuation: real D1 schema for the E2EE path (ISOLATED prototype).
-- Mirrors how production sync would store records under E2EE: payload becomes an
-- opaque ciphertext envelope; the server keeps only ownership/revision/sequence.
-- Not applied to production; used only by b2_prototype tests against a real
-- node:sqlite database file.

CREATE TABLE IF NOT EXISTS e2ee_vaults (
  user_id             TEXT PRIMARY KEY,
  vault_id            TEXT NOT NULL,
  epoch               INTEGER NOT NULL DEFAULT 1,
  recovery_salt       TEXT NOT NULL,
  wrapped_vk_recovery TEXT NOT NULL,   -- JWE: VK wrapped by recovery key (server cannot unwrap)
  format              TEXT NOT NULL,
  crypto_mode         TEXT NOT NULL DEFAULT 'e2ee_only',
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS e2ee_records (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,           -- ins | quest | review | health_insight
  record_id   TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  envelope    TEXT NOT NULL,           -- compact JWE ciphertext ONLY (no plaintext)
  seq         INTEGER NOT NULL,        -- server-assigned ordering (never a plaintext ts)
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_e2ee_records_owner_seq ON e2ee_records (user_id, seq);
