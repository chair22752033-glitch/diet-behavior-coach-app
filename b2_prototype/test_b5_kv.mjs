/*
 * B5 step — encrypt QUEST live state before storing in KV (ISOLATED prototype).
 * The 4th private store (qlive, KV, 1h TTL) must also be ciphertext. This proves the
 * encrypt-before-put / get-then-decrypt flow and that KV holds no plaintext.
 *
 * Run: node b2_prototype/test_b5_kv.mjs
 */
import { createVault, encryptRecord, decryptRecordChecked } from './vault_crypto.mjs';

// fake KV (same shape as the worker's SYNC_KV usage)
function makeKV() { const m = new Map(); return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }, _dump() { return Array.from(m.values()).join('\u0001'); } }; }

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
async function thr(fn, n) { try { await fn(); fail++; fails.push(n + ' (no throw)'); } catch { pass++; } };
const sec = (t) => console.log('\n== ' + t + ' ==');

async function main() {
  const kv = makeKV();
  const v = await createVault({ epoch: 1 });
  const userId = 'u_kv';
  const key = 'qlive:u:' + userId;

  sec('1. encrypt qlive before KV put');
  const live = { quest: { active: true, step: 3, note: '宵夜想吃炸雞', crave: 'fried' }, ts: 1759400000000 };
  // qlive is a single owner-scoped blob; use a stable record id for the vault binding
  const env = await encryptRecord(v.vk, live, { vaultId: v.vaultId, recordId: 'qlive', revisionId: 'q1', epoch: 1, use: 'qlive' });
  await kv.put(key, env, { expirationTtl: 3600 });
  ok((await kv.get(key)).split('.').length === 5, 'KV stores a compact JWE (not plaintext)');

  sec('2. KV holds no plaintext');
  const dump = kv._dump();
  for (const p of ['fried', 'quest', 'step', '宵夜想吃炸雞', String(live.ts)]) ok(dump.indexOf(p) === -1, 'KV has no "' + p + '"');

  sec('3. get + decrypt round-trip');
  const got = await kv.get(key);
  const { record } = await decryptRecordChecked(v.vk, got, { vaultId: v.vaultId, recordId: 'qlive', epoch: 1, use: 'qlive' });
  ok(JSON.stringify(record) === JSON.stringify(live), 'decrypted qlive equals original');

  sec('4. integrity: wrong key / tamper / wrong purpose rejected');
  const other = await createVault({ epoch: 1 });
  await thr(() => decryptRecordChecked(other.vk, got, { vaultId: v.vaultId, recordId: 'qlive', epoch: 1, use: 'qlive' }), 'wrong key rejected');
  const segs = got.split('.'); segs[3] = segs[3].slice(0, -2) + (segs[3].slice(-2) === 'AA' ? 'BB' : 'AA');
  await thr(() => decryptRecordChecked(v.vk, segs.join('.'), { vaultId: v.vaultId, recordId: 'qlive', epoch: 1, use: 'qlive' }), 'tampered qlive rejected');
  await thr(() => decryptRecordChecked(v.vk, got, { vaultId: v.vaultId, recordId: 'qlive', epoch: 1, use: 'record' }), 'wrong purpose (use) rejected');

  console.log('\n──────────────────────────────');
  console.log('B5 KV ciphertext: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
