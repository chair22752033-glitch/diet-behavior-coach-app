/*
 * Phase B（E2EE 第 3 步）｜Ciphertext record store (production).
 *
 * Stores ONLY opaque JWE ciphertext, separate from the plaintext sync_records table.
 * Validates ownership / kind / JWE shape / size / revision (CAS); server-assigned seq
 * ordering; holds no key, never decrypts. Uses RAW D1 via src/db/query.js + transaction.js.
 *
 * This is additive: the existing plaintext /api/sync path is untouched. These records are
 * only written/read for accounts that have migrated (a later increment wires the app to it).
 */
import { all, first } from '../db/query.js';
import { batch } from '../db/transaction.js';

export const E2EE_KINDS = ['ins', 'quest', 'review', 'health_insight'];
const MAX_ENVELOPE_BYTES = 12000;

function isCompactJWE(s) {
  return typeof s === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

export async function putE2eeRecord(rawDb, userId, { kind, recordId, baseRevision = null, revisionId, envelope }) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_owner' };
  if (E2EE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad_kind' };
  if (typeof recordId !== 'string' || recordId.length < 1 || recordId.length > 128) return { ok: false, reason: 'bad_record_id' };
  if (!isCompactJWE(envelope)) return { ok: false, reason: 'not_ciphertext' };
  if (envelope.length > MAX_ENVELOPE_BYTES) return { ok: false, reason: 'too_large' };
  if (typeof revisionId !== 'string' || !revisionId || revisionId.length > 128) return { ok: false, reason: 'bad_revision' };

  const curRes = await first(rawDb, 'SELECT revision_id, seq FROM e2ee_records WHERE user_id = ? AND kind = ? AND record_id = ?', [userId, kind, recordId]);
  if (!curRes.ok) return { ok: false, reason: curRes.error || 'read_failed' };
  const cur = curRes.row;
  if (cur) {
    if (cur.revision_id === revisionId) return { ok: true, idempotent: true };
    if (baseRevision !== cur.revision_id) return { ok: false, reason: 'conflict', currentRevision: cur.revision_id };
  } else if (baseRevision !== null) {
    return { ok: false, reason: 'conflict', currentRevision: null };
  }

  let seq = cur ? cur.seq : null;
  if (seq == null) {
    const mx = await first(rawDb, 'SELECT COALESCE(MAX(seq),0) AS m FROM e2ee_records WHERE user_id = ?', [userId]);
    seq = ((mx.ok && mx.row ? mx.row.m : 0) || 0) + 1;
  }
  const res = await batch(rawDb, [{
    sql: "INSERT INTO e2ee_records (user_id, kind, record_id, revision_id, envelope, seq, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id, kind, record_id) DO UPDATE SET revision_id=excluded.revision_id, envelope=excluded.envelope, updated_at=datetime('now')",
    params: [userId, kind, recordId, revisionId, envelope, seq],
  }]);
  return res.ok ? { ok: true, idempotent: false } : { ok: false, reason: res.error || 'write_failed' };
}

export async function listE2eeEnvelopes(rawDb, userId, kind) {
  const sql = kind
    ? 'SELECT kind, record_id, revision_id, envelope, seq FROM e2ee_records WHERE user_id = ? AND kind = ? ORDER BY seq ASC'
    : 'SELECT kind, record_id, revision_id, envelope, seq FROM e2ee_records WHERE user_id = ? ORDER BY seq ASC';
  const r = await all(rawDb, sql, kind ? [userId, kind] : [userId]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed', rows: [] };
  return { ok: true, rows: (r.results || []).map((x) => ({ kind: x.kind, recordId: x.record_id, revisionId: x.revision_id, envelope: x.envelope, seq: x.seq })) };
}
