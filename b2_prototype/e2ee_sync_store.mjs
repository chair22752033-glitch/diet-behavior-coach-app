/*
 * B2 continuation — E2EE sync store over a REAL D1 (ISOLATED prototype).
 *
 * Unlike fake_e2ee_server.mjs (in-memory), this uses the project's actual DB access
 * layer (src/db/query.js + src/db/transaction.js) so it runs against a real
 * node:sqlite database — the same adapter the project's real-worker-boundary tests use.
 * This lets B2 prove "no plaintext in the real DB file", not just in a JS object.
 *
 * Contract matches GPT §4: payload is an opaque ciphertext envelope; the store
 * validates ownership, kind, size, JWE shape, and revision (CAS). It holds no key and
 * never decrypts. Record order is a server-assigned seq, never a plaintext timestamp.
 */
import { run, all, first } from '../src/db/query.js';
import { batch } from '../src/db/transaction.js';

export const RECORD_KINDS = ['ins', 'quest', 'review', 'health_insight'];
const MAX_ENVELOPE_BYTES = 12000;

function isCompactJWE(s) {
  return typeof s === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

export async function putVault(db, userId, v) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_owner' };
  const ex = await first(db, 'SELECT user_id FROM e2ee_vaults WHERE user_id = ?', [userId]);
  if (ex.ok && ex.row) return { ok: false, reason: 'vault_exists' };
  const r = await run(db,
    'INSERT INTO e2ee_vaults (user_id, vault_id, epoch, recovery_salt, wrapped_vk_recovery, format, crypto_mode) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, v.vault_id, v.epoch, v.recovery_salt, v.wrapped_vk_recovery, v.format, 'e2ee_only']);
  return r.ok ? { ok: true } : { ok: false, reason: r.error || 'insert_failed' };
}

export async function getVault(db, userId) {
  const r = await first(db, 'SELECT * FROM e2ee_vaults WHERE user_id = ?', [userId]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed' };
  return r.row ? { ok: true, vault: r.row } : { ok: false, reason: 'no_vault' };
}

export async function cryptoMode(db, userId) {
  const r = await first(db, 'SELECT crypto_mode FROM e2ee_vaults WHERE user_id = ?', [userId]);
  return (r.ok && r.row) ? r.row.crypto_mode : 'legacy';
}

export async function putRecord(db, userId, { kind, recordId, baseRevision = null, revisionId, envelope }) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_owner' };
  if (!RECORD_KINDS.includes(kind)) return { ok: false, reason: 'bad_kind' };
  if (typeof recordId !== 'string' || recordId.length < 1 || recordId.length > 128) return { ok: false, reason: 'bad_record_id' };
  if (!isCompactJWE(envelope)) return { ok: false, reason: 'not_ciphertext' };
  if (envelope.length > MAX_ENVELOPE_BYTES) return { ok: false, reason: 'too_large' };
  if (typeof revisionId !== 'string' || !revisionId) return { ok: false, reason: 'bad_revision' };

  const curRes = await first(db, 'SELECT revision_id, seq FROM e2ee_records WHERE user_id = ? AND kind = ? AND record_id = ?', [userId, kind, recordId]);
  if (!curRes.ok) return { ok: false, reason: curRes.error || 'read_failed' };
  const cur = curRes.row;
  if (cur) {
    if (cur.revision_id === revisionId) return { ok: true, idempotent: true };
    if (baseRevision !== cur.revision_id) return { ok: false, reason: 'conflict', currentRevision: cur.revision_id };
  } else {
    if (baseRevision !== null) return { ok: false, reason: 'conflict', currentRevision: null };
  }

  let seq = cur ? cur.seq : null;
  if (seq == null) {
    const mx = await first(db, 'SELECT COALESCE(MAX(seq),0) AS m FROM e2ee_records WHERE user_id = ?', [userId]);
    seq = ((mx.ok && mx.row ? mx.row.m : 0) || 0) + 1;
  }
  const res = await batch(db, [{
    sql: "INSERT INTO e2ee_records (user_id, kind, record_id, revision_id, envelope, seq, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id, kind, record_id) DO UPDATE SET revision_id=excluded.revision_id, envelope=excluded.envelope, updated_at=datetime('now')",
    params: [userId, kind, recordId, revisionId, envelope, seq],
  }]);
  return res.ok ? { ok: true, idempotent: false } : { ok: false, reason: res.error || 'write_failed' };
}

export async function listEnvelopes(db, userId, kind) {
  const sql = kind
    ? 'SELECT kind, record_id, revision_id, envelope, seq FROM e2ee_records WHERE user_id = ? AND kind = ? ORDER BY seq ASC'
    : 'SELECT kind, record_id, revision_id, envelope, seq FROM e2ee_records WHERE user_id = ? ORDER BY seq ASC';
  const params = kind ? [userId, kind] : [userId];
  const r = await all(db, sql, params);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed', rows: [] };
  return { ok: true, rows: (r.results || []).map((x) => ({ kind: x.kind, recordId: x.record_id, revisionId: x.revision_id, envelope: x.envelope, seq: x.seq })) };
}
