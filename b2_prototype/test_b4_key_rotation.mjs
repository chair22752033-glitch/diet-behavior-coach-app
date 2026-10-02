/*
 * B4 step — key rotation / revocation (ISOLATED prototype; synthetic data).
 * Covers GPT §5.6: change recovery code (same VK), and rotate VK on compromise
 * (new epoch, re-encrypt, old key can't read new-epoch data).
 *
 * Run: node b2_prototype/test_b4_key_rotation.mjs
 */
import {
  createVault, recoverVaultWithCode, rewrapVaultWithNewRecovery, rotateVaultKey,
  encryptRecord, decryptRecordChecked,
} from './vault_crypto.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
async function thr(fn, n) { try { await fn(); fail++; fails.push(n + ' (no throw)'); console.log('  ✗ ' + n + ' (no throw)'); } catch { pass++; } };
const sec = (t) => console.log('\n== ' + t + ' ==');
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));

async function main() {
  sec('1. change recovery code — same VK, old code stops working');
  const v = await createVault({ epoch: 1 });
  const rec = { id: 'ins_0', ts: 1759400000000, st: { crave: 'fried' }, crave: 'fried' };
  const env = await encryptRecord(v.vk, rec, { vaultId: v.vaultId, recordId: 'ins_0', revisionId: 'r1', epoch: 1 });

  const rot = await rewrapVaultWithNewRecovery(v.vk, { vaultId: v.vaultId, epoch: 1 });
  // new code recovers the SAME vk
  const r1 = await recoverVaultWithCode(rot.recoveryCode, rot.serverVaultRecord);
  ok(eq(r1.vk, v.vk), 'new recovery code recovers the same VK');
  // old code against the NEW server record fails (new salt/wrap)
  await thr(() => recoverVaultWithCode(v.recoveryCode, rot.serverVaultRecord), 'old recovery code no longer works after change');
  // existing record still decrypts (same VK)
  const d1 = await decryptRecordChecked(r1.vk, env, { vaultId: v.vaultId, recordId: 'ins_0', epoch: 1 });
  ok(d1.record.crave === 'fried', 'existing records still readable after recovery-code change');

  sec('2. rotate VK on compromise — new epoch, re-encrypt, old key locked out of new data');
  const v2 = await rotateVaultKey({ vaultId: v.vaultId, newEpoch: 2 });
  ok(!eq(v2.vk, v.vk) && v2.epoch === 2, 'rotation produced a new VK at epoch 2');
  // re-encrypt the existing record under the new VK/epoch
  const env2 = await encryptRecord(v2.vk, rec, { vaultId: v.vaultId, recordId: 'ins_0', revisionId: 'r2', epoch: 2 });
  const d2 = await decryptRecordChecked(v2.vk, env2, { vaultId: v.vaultId, recordId: 'ins_0', epoch: 2 });
  ok(d2.record.crave === 'fried', 'new VK decrypts re-encrypted record (epoch 2)');
  // old VK cannot read the new-epoch record
  await thr(() => decryptRecordChecked(v.vk, env2, { vaultId: v.vaultId, recordId: 'ins_0', epoch: 2 }), 'old VK cannot decrypt new-epoch record');
  // and asking for epoch 1 on a new-epoch envelope is rejected (epoch binding)
  await thr(() => decryptRecordChecked(v2.vk, env2, { vaultId: v.vaultId, recordId: 'ins_0', epoch: 1 }), 'epoch mismatch rejected on rotated record');
  // new recovery code recovers the new VK
  const r2 = await recoverVaultWithCode(v2.recoveryCode, v2.serverVaultRecord);
  ok(eq(r2.vk, v2.vk), 'post-rotation recovery code recovers the new VK');

  sec('3. revocation semantics — a device holding only the old VK is locked out of new data');
  // simulate: old device keeps v.vk; after rotation all new writes are epoch 2
  const newWrite = await encryptRecord(v2.vk, { id: 'ins_1', ts: 1759400001000, crave: 'sweet', st: { crave: 'sweet' } }, { vaultId: v.vaultId, recordId: 'ins_1', revisionId: 'r1', epoch: 2 });
  await thr(() => decryptRecordChecked(v.vk, newWrite, { vaultId: v.vaultId, recordId: 'ins_1', epoch: 2 }), 'revoked (old-VK) device cannot read post-rotation writes');

  console.log('\n──────────────────────────────');
  console.log('B4 key rotation: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
