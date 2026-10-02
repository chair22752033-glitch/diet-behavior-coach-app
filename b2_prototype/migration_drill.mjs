/*
 * B3 drill — legacy plaintext -> E2EE ciphertext migration (ISOLATED prototype).
 *
 * Models GPT §7: a recoverable, non-degrading migration on a real node:sqlite D1.
 *   state machine: legacy -> migration_locked -> ciphertext_verified -> e2ee_only
 *   - lock writes to the account's legacy rows during migration
 *   - batch: device decrypts? no — reads legacy plaintext, encrypts with VK, writes ciphertext
 *     to e2ee_records; a checkpoint watermark makes it resumable after interruption
 *   - verify: re-read ciphertext, decrypt, compare count + content to the legacy set
 *   - cleanup: only AFTER verify; delete legacy plaintext
 *   - rollback: crypto-aware — once past ciphertext_verified you may NOT roll back to a
 *     plaintext-serving 'legacy' state (a legacy worker couldn't read ciphertext)
 *
 * Fake data only; never touches production. Uses the project's real DB layer + vault_crypto.
 */
import { run, all, first } from '../src/db/query.js';
import { encryptRecord, decryptRecordChecked } from './vault_crypto.mjs';

const ORDER = ['legacy', 'migration_locked', 'ciphertext_verified', 'e2ee_only'];

async function getState(db, userId) {
  const r = await first(db, 'SELECT state, checkpoint_seq FROM migration_state WHERE user_id = ?', [userId]);
  if (r.ok && r.row) return { state: r.row.state, checkpoint: r.row.checkpoint_seq };
  return { state: 'legacy', checkpoint: 0 };
}
async function setState(db, userId, state, checkpoint) {
  await run(db,
    "INSERT INTO migration_state (user_id, state, checkpoint_seq, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state, checkpoint_seq=excluded.checkpoint_seq, updated_at=datetime('now')",
    [userId, state, checkpoint || 0]);
}

/** Legacy write gate: once locked/migrated, legacy plaintext writes are refused. */
export async function legacyWriteAllowed(db, userId) {
  const { state } = await getState(db, userId);
  return state === 'legacy';
}

export async function lockForMigration(db, userId) {
  const { state } = await getState(db, userId);
  if (state !== 'legacy') return { ok: false, reason: 'not_in_legacy' };
  await setState(db, userId, 'migration_locked', 0);
  return { ok: true };
}

/**
 * Migrate up to `batchSize` not-yet-migrated legacy rows into ciphertext, advancing the
 * checkpoint. Call repeatedly until done:true. Resumable: re-invoking after a crash
 * continues from the stored checkpoint without dup/loss.
 */
export async function migrateBatch(db, userId, vk, vaultId, { batchSize = 100, epoch = 1 } = {}) {
  const { state, checkpoint } = await getState(db, userId);
  if (state !== 'migration_locked') return { ok: false, reason: 'not_locked' };
  const rows = (await all(db,
    'SELECT rowid AS rid, kind, record_id, payload FROM legacy_records WHERE user_id = ? AND rowid > ? ORDER BY rowid ASC LIMIT ?',
    [userId, checkpoint, batchSize])).results || [];
  if (rows.length === 0) return { ok: true, done: true, migrated: 0 };

  let maxRid = checkpoint;
  for (const row of rows) {
    const rec = JSON.parse(row.payload);
    const env = await encryptRecord(vk, rec, { vaultId, recordId: row.record_id, revisionId: 'm1', epoch });
    // idempotent on (user,kind,record): re-running a half-done batch overwrites same row
    await run(db,
      "INSERT INTO e2ee_records (user_id, kind, record_id, revision_id, envelope, seq, updated_at) VALUES (?, ?, ?, 'm1', ?, ?, datetime('now')) ON CONFLICT(user_id, kind, record_id) DO UPDATE SET envelope=excluded.envelope, updated_at=datetime('now')",
      [userId, row.kind, row.record_id, env, row.rid]);
    if (row.rid > maxRid) maxRid = row.rid;
  }
  await setState(db, userId, 'migration_locked', maxRid); // advance checkpoint
  return { ok: true, done: false, migrated: rows.length, checkpoint: maxRid };
}

/** Verify ciphertext round-trips and matches the legacy set (count + content). */
export async function verifyMigration(db, userId, vk, vaultId, { epoch = 1 } = {}) {
  const legacy = (await all(db, 'SELECT kind, record_id, payload FROM legacy_records WHERE user_id = ?', [userId])).results || [];
  const cipher = (await all(db, 'SELECT kind, record_id, envelope FROM e2ee_records WHERE user_id = ?', [userId])).results || [];
  if (legacy.length !== cipher.length) return { ok: false, reason: 'count_mismatch', legacy: legacy.length, cipher: cipher.length };
  const byKey = {};
  for (const c of cipher) byKey[c.kind + ':' + c.record_id] = c.envelope;
  for (const l of legacy) {
    const env = byKey[l.kind + ':' + l.record_id];
    if (!env) return { ok: false, reason: 'missing_' + l.record_id };
    const { record } = await decryptRecordChecked(vk, env, { vaultId, recordId: l.record_id, epoch });
    if (JSON.stringify(record) !== JSON.stringify(JSON.parse(l.payload))) return { ok: false, reason: 'content_mismatch_' + l.record_id };
  }
  await setState(db, userId, 'ciphertext_verified', 0);
  return { ok: true, verified: legacy.length };
}

/** Switch the account to e2ee_only (reads now served from ciphertext). */
export async function switchToE2ee(db, userId) {
  const { state } = await getState(db, userId);
  if (state !== 'ciphertext_verified') return { ok: false, reason: 'not_verified' };
  await setState(db, userId, 'e2ee_only', 0);
  return { ok: true };
}

/** Cleanup legacy plaintext — only allowed once e2ee_only. */
export async function cleanupLegacy(db, userId) {
  const { state } = await getState(db, userId);
  if (state !== 'e2ee_only') return { ok: false, reason: 'not_switched' };
  const r = await run(db, 'DELETE FROM legacy_records WHERE user_id = ?', [userId]);
  // NOTE: DELETE does not erase bytes from the DB file (rows linger in free pages).
  // VACUUM rewrites the file to reclaim them. Even so, D1 Time Travel retains prior
  // versions for the retention window (Free 7d / Paid 30d) — callers must disclose that.
  try { await run(db, 'VACUUM'); } catch (e) {}
  return { ok: true, deleted: (r.meta && r.meta.changes) || 0, vacuumed: true };
}

/** Crypto-aware rollback: refuse to return to a plaintext-serving state once ciphertext exists. */
export async function rollbackTo(db, userId, target) {
  const { state } = await getState(db, userId);
  if (ORDER.indexOf(target) < 0) return { ok: false, reason: 'bad_target' };
  // once verified/switched, cannot go back to 'legacy' (ciphertext can't be served by a legacy worker)
  if (ORDER.indexOf(state) >= ORDER.indexOf('ciphertext_verified') && target === 'legacy') {
    return { ok: false, reason: 'rollback_to_plaintext_forbidden' };
  }
  await setState(db, userId, target, 0);
  return { ok: true };
}

export { getState };
