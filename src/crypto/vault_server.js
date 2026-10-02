/*
 * Phase B（E2EE 第 1 步）｜Vault server store (production).
 *
 * Server-side storage of the encryption vault record. The server holds ONLY the
 * recovery-wrapped VK + salt — it has no key material that can decrypt content.
 * One vault per account (no silent overwrite). Uses RAW D1 via src/db/query.js.
 */
import { run, first } from '../db/query.js';

const B64_RE = /^[A-Za-z0-9+/]+=*$/;

function validVaultInput(v) {
  if (!v || typeof v !== 'object') return 'invalid_body';
  if (typeof v.vaultId !== 'string' || v.vaultId.length < 3 || v.vaultId.length > 80) return 'bad_vault_id';
  if (typeof v.recoverySalt !== 'string' || !B64_RE.test(v.recoverySalt) || v.recoverySalt.length > 128) return 'bad_salt';
  if (typeof v.wrappedVkRecovery !== 'string' || !B64_RE.test(v.wrappedVkRecovery) || v.wrappedVkRecovery.length > 2048) return 'bad_wrapped_vk';
  if (typeof v.format !== 'string' || v.format.length > 64) return 'bad_format';
  const epoch = Number(v.epoch);
  if (!Number.isInteger(epoch) || epoch < 1 || epoch > 1000000) return 'bad_epoch';
  return null;
}

export async function putVault(rawDb, userId, v) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  const bad = validVaultInput(v);
  if (bad) return { ok: false, reason: bad };
  const ex = await first(rawDb, 'SELECT user_id FROM e2ee_vaults WHERE user_id = ?', [userId]);
  if (ex.ok && ex.row) return { ok: false, reason: 'vault_exists' };
  const r = await run(rawDb,
    'INSERT INTO e2ee_vaults (user_id, vault_id, epoch, recovery_salt, wrapped_vk_recovery, format) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, v.vaultId, Number(v.epoch), v.recoverySalt, v.wrappedVkRecovery, v.format]);
  return r.ok ? { ok: true } : { ok: false, reason: r.error || 'insert_failed' };
}

export async function getVault(rawDb, userId) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  const r = await first(rawDb, 'SELECT vault_id, epoch, recovery_salt, wrapped_vk_recovery, format, crypto_mode FROM e2ee_vaults WHERE user_id = ?', [userId]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed' };
  if (!r.row) return { ok: true, exists: false };
  return {
    ok: true, exists: true,
    vault: {
      vault_id: r.row.vault_id, epoch: r.row.epoch, recovery_salt: r.row.recovery_salt,
      wrapped_vk_recovery: r.row.wrapped_vk_recovery, format: r.row.format, crypto_mode: r.row.crypto_mode,
    },
  };
}
