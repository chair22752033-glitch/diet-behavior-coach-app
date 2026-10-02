-- C-stage prototype — consent-event store schema (ISOLATED; not applied to production).
-- Implements GPT's consent-doc §8: append-only consent events with document version +
-- immutable content hash, server time, source screen, action, optional order id.
-- Deliberately stores NO recovery code, key, token, food plaintext, or full IP.

-- Version registry: each document version pinned to the exact content shown (hash).
CREATE TABLE IF NOT EXISTS consent_documents (
  doc_type        TEXT NOT NULL,   -- terms | privacy | plan_confirmation | community | recording | marketing | vault_activation
  version         TEXT NOT NULL,
  content_sha256  TEXT NOT NULL,   -- hash of the exact text presented to users for this version
  effective_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (doc_type, version)
);

-- Append-only event log. Corrections / withdrawals ADD a new row; rows are never
-- updated or deleted (no "turn a past consent into never-consented").
CREATE TABLE IF NOT EXISTS consent_events (
  event_id            TEXT PRIMARY KEY,         -- uuid
  user_id             TEXT NOT NULL,            -- internal account id (never Google token)
  purpose             TEXT NOT NULL,            -- what this choice is for
  doc_type            TEXT NOT NULL,
  doc_version         TEXT NOT NULL,
  doc_content_sha256  TEXT NOT NULL,            -- snapshot of the hash at event time
  action              TEXT NOT NULL,            -- granted | declined | withdrawn
  source_screen       TEXT NOT NULL,            -- e.g. first_login | purchase_confirm | settings
  order_id            TEXT,                     -- nullable; set for purchase-linked consents
  server_time         TEXT NOT NULL DEFAULT (datetime('now')),
  seq                 INTEGER NOT NULL          -- monotonic per account, for stable ordering
);

CREATE INDEX IF NOT EXISTS idx_consent_user_purpose ON consent_events (user_id, purpose, seq);
