/*
 * B2 acceptance suite (ISOLATED prototype; synthetic data only).
 *
 * Proves GPT's §9 B2 completion conditions:
 *   - new-account keys, recovery code, trusted device, ciphertext sync, device-side review
 *   - two devices/browsers can recover; wrong code does NOT wipe
 *   - packets & DB contain no test private plaintext
 *   - device review result matches the production server algorithm exactly
 * Plus integrity cases: tamper, cross-record substitution, wrong vault/version/purpose,
 * revision CAS, single-vault constraint, and a 1,000-record scale pass.
 *
 * Run: node b2_prototype/test_b2.mjs
 */
import {
  createVault, recoverVaultWithCode, trustDevice, unlockWithDevice,
  encryptRecord, decryptRecordChecked, FORMAT_VERSION
} from './vault_crypto.mjs';
import { FakeE2EEServer } from './fake_e2ee_server.mjs';
import * as portable from './review_portable.mjs';
import * as server from '../src/review/review_service.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  ✗ ' + name); } }
async function throws(fn, name) {
  try { await fn(); fail++; fails.push(name + ' (expected throw)'); console.log('  ✗ ' + name + ' (no throw)'); }
  catch (e) { pass++; }
}
function section(t) { console.log('\n== ' + t + ' =='); }

/* ---- synthetic fake data (NOT real user content) ---- */
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0); // fixed for determinism
function fakeIns(n, { craves = ['fried', 'sweet', 'fried', 'soup', 'fried', 'fresh'], stress = [7, 8, 6, 5, 9, 4] } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'ins_' + i,
      ts: NOW - (i % 6) * DAY - i * 1000, // spread across ~6 distinct local dates
      st: { energy: 3, sleep: 2, stress: 2, stress_raw: stress[i % stress.length], social: 1, move: 1, crave: craves[i % craves.length] },
      beh: 'note-' + i,
      crave: craves[i % craves.length]
    });
  }
  return out;
}

async function main() {
  const srv = new FakeE2EEServer();
  const USER = 'u_test_1';

  /* ===== 1. Activation + ciphertext sync (device A) ===== */
  section('1. vault activation + ciphertext sync (device A)');
  const vault = await createVault({ epoch: 1 });
  ok(vault.vk.length === 32, 'VK is 256-bit');
  ok(/^[0-9A-HJ-NP-Z-]+$/.test(vault.recoveryCode), 'recovery code is copyable string');
  ok(srv.putVaultRecord(USER, vault.serverVaultRecord).ok, 'server stores recovery-wrapped vault');
  ok(srv.cryptoMode(USER) === 'e2ee_only', 'account marked e2ee');

  const ins = fakeIns(12);
  const envByRid = {};
  for (const rec of ins) {
    const rev = 'r1-' + rec.id;
    const env = await encryptRecord(vault.vk, rec, { vaultId: vault.vaultId, recordId: rec.id, revisionId: rev, epoch: 1 });
    envByRid[rec.id] = env;
    const r = srv.putRecord(USER, { kind: 'ins', recordId: rec.id, baseRevision: null, revisionId: rev, envelope: env });
    ok(r.ok, 'server accepts ciphertext ' + rec.id);
  }
  ok(srv.listEnvelopes(USER, 'ins').length === 12, 'server holds 12 ciphertext records');

  /* ===== 2. No plaintext leaks into anything the server stores ===== */
  section('2. no private plaintext in server storage');
  const dump = srv.dumpAll();
  const leakProbes = ['fried', 'sweet', 'soup', 'fresh', 'energy', 'stress_raw', 'note-0', '炸物', String(NOW)];
  for (const p of leakProbes) ok(dump.indexOf(p) === -1, 'server dump has no "' + p + '"');
  // and the envelope itself is opaque
  ok(envByRid['ins_0'].split('.').length === 5, 'record envelope is a compact JWE');
  ok(envByRid['ins_0'].indexOf('fried') === -1, 'envelope body not plaintext');

  /* ===== 3. device-side review == production server algorithm (byte equality) ===== */
  section('3. device-side review matches production algorithm');
  // device pulls ciphertext, decrypts locally, rebuilds doc
  const pulled = srv.listEnvelopes(USER, 'ins');
  const decryptedIns = [];
  for (const e of pulled) {
    const { record } = await decryptRecordChecked(vault.vk, e.envelope, { vaultId: vault.vaultId, recordId: e.recordId, epoch: 1 });
    decryptedIns.push(record);
  }
  ok(decryptedIns.length === 12, 'device decrypted all records');
  const docDevice = { ins: decryptedIns };
  const docServerEquiv = { ins: ins }; // what a plaintext server WOULD have seen

  const factsDevice = portable.computeFacts(docDevice, NOW);
  const factsServer = server.computeFacts(docServerEquiv, NOW);
  ok(JSON.stringify(factsDevice) === JSON.stringify(factsServer), 'computeFacts identical (device vs server)');

  const reviewDevice = portable.buildReview(factsDevice);
  const reviewServer = server.buildReview(factsServer);
  ok(JSON.stringify(reviewDevice) === JSON.stringify(reviewServer), 'buildReview identical (device vs server)');
  ok(portable.reportKey(factsDevice) === server.reportKey(factsServer), 'reportKey identical');
  ok(reviewDevice.kind === 'personalized', 'review is personalized with enough data');

  /* ===== 4. recover on a second browser via recovery code ===== */
  section('4. second browser recovers via recovery code');
  const vaultRec = srv.getVaultRecord(USER).vault;
  const recovered = await recoverVaultWithCode(vault.recoveryCode, vaultRec);
  ok(Buffer.from(recovered.vk).equals(Buffer.from(vault.vk)), 'recovered VK equals original VK');
  // browser B decrypts + reviews -> same result, without ever having device A's key
  const insB = [];
  for (const e of srv.listEnvelopes(USER, 'ins')) {
    const { record } = await decryptRecordChecked(recovered.vk, e.envelope, { vaultId: recovered.vaultId, recordId: e.recordId, epoch: 1 });
    insB.push(record);
  }
  const reviewB = portable.buildReview(portable.computeFacts({ ins: insB }, NOW));
  ok(JSON.stringify(reviewB) === JSON.stringify(reviewDevice), 'browser B review identical');

  /* ===== 5. wrong recovery code throws and does NOT wipe ===== */
  section('5. wrong recovery code fails safe (no wipe)');
  const before = srv.listEnvelopes(USER, 'ins').length;
  await throws(() => recoverVaultWithCode('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ', vaultRec),
    'wrong recovery code is rejected');
  ok(srv.listEnvelopes(USER, 'ins').length === before, 'ciphertext intact after wrong code');

  /* ===== 6. trusted device: non-extractable, device-scoped ===== */
  section('6. trusted device key is non-extractable and device-scoped');
  const devA = await trustDevice(vault.vk, { vaultId: vault.vaultId, epoch: 1 });
  srv.putDeviceWrap(USER, 'deviceA', devA.wrappedVkByDevice);
  const unlockedA = await unlockWithDevice(devA.deviceKey, devA.wrappedVkByDevice, { vaultId: vault.vaultId, epoch: 1 });
  ok(Buffer.from(unlockedA).equals(Buffer.from(vault.vk)), 'trusted device unlocks VK without recovery code');
  await throws(() => globalThis.crypto.subtle.exportKey('raw', devA.deviceKey), 'device key is non-extractable (export throws)');
  // a different device's key cannot unlock device A's wrap
  const devB = await trustDevice(vault.vk, { vaultId: vault.vaultId, epoch: 1 });
  await throws(() => unlockWithDevice(devB.deviceKey, devA.wrappedVkByDevice, { vaultId: vault.vaultId, epoch: 1 }),
    'device B key cannot unlock device A wrap');

  /* ===== 7. integrity: tamper, cross-record swap, wrong context ===== */
  section('7. integrity / authenticated-encryption checks');
  // tamper one char in the ciphertext body
  const good = envByRid['ins_1'];
  const segs = good.split('.');
  segs[3] = segs[3].slice(0, -2) + (segs[3].slice(-2) === 'AA' ? 'BB' : 'AA');
  await throws(() => decryptRecordChecked(vault.vk, segs.join('.'), { vaultId: vault.vaultId, recordId: 'ins_1', epoch: 1 }),
    'tampered ciphertext rejected');
  // cross-record substitution: feed ins_0's envelope but claim it's ins_5
  await throws(() => decryptRecordChecked(vault.vk, envByRid['ins_0'], { vaultId: vault.vaultId, recordId: 'ins_5', epoch: 1 }),
    'cross-record substitution rejected (rid mismatch)');
  // wrong vault id
  await throws(() => decryptRecordChecked(vault.vk, envByRid['ins_0'], { vaultId: 'v_other', recordId: 'ins_0', epoch: 1 }),
    'wrong vault_id rejected');
  // wrong epoch
  await throws(() => decryptRecordChecked(vault.vk, envByRid['ins_0'], { vaultId: vault.vaultId, recordId: 'ins_0', epoch: 2 }),
    'wrong epoch rejected');
  // purpose confusion: a record envelope must not verify as a vault-wrap purpose
  await throws(() => decryptRecordChecked(vault.vk, envByRid['ins_0'], { vaultId: vault.vaultId, recordId: 'ins_0', epoch: 1, use: 'device-wrap' }),
    'purpose (use) mismatch rejected');

  /* ===== 8. server-side revision CAS + single vault ===== */
  section('8. revision CAS + single-vault constraint');
  // stale baseRevision rejected
  const staleEnv = await encryptRecord(vault.vk, ins[0], { vaultId: vault.vaultId, recordId: 'ins_0', revisionId: 'r2-x', epoch: 1 });
  ok(srv.putRecord(USER, { kind: 'ins', recordId: 'ins_0', baseRevision: 'WRONG', revisionId: 'r2-x', envelope: staleEnv }).reason === 'conflict',
    'stale baseRevision rejected (CAS)');
  // correct baseRevision updates
  ok(srv.putRecord(USER, { kind: 'ins', recordId: 'ins_0', baseRevision: 'r1-ins_0', revisionId: 'r2-x', envelope: staleEnv }).ok,
    'correct baseRevision updates');
  // idempotent replay of same revision
  ok(srv.putRecord(USER, { kind: 'ins', recordId: 'ins_0', baseRevision: 'r1-ins_0', revisionId: 'r2-x', envelope: staleEnv }).idempotent === true,
    'idempotent replay of same revision');
  // plaintext payload refused by server
  ok(srv.putRecord(USER, { kind: 'ins', recordId: 'ins_9', baseRevision: null, revisionId: 'r1', envelope: '{"crave":"fried"}' }).reason === 'not_ciphertext',
    'server refuses plaintext payload');
  // single vault
  ok(srv.putVaultRecord(USER, vault.serverVaultRecord).reason === 'vault_exists', 'second vault activation refused');

  /* ===== 9. the other 3 private stores use the same envelope (review / health_insight) ===== */
  section('9. review + health_insight stores also encrypted (B1 4-store finding)');
  const reviewPayload = reviewDevice; // device-computed review, cached as ciphertext (GPT §4)
  const revEnv = await encryptRecord(vault.vk, reviewPayload, { vaultId: vault.vaultId, recordId: 'rk1', revisionId: 'r1', epoch: 1, use: 'review' });
  ok(srv.putRecord(USER, { kind: 'review', recordId: 'rk1', baseRevision: null, revisionId: 'r1', envelope: revEnv }).ok, 'review cached as ciphertext');
  const hiEnv = await encryptRecord(vault.vk, { input_snapshot: { q1: 'x' }, output_snapshot: { r: 'y' } },
    { vaultId: vault.vaultId, recordId: 'hi1', revisionId: 'r1', epoch: 1, use: 'health_insight' });
  ok(srv.putRecord(USER, { kind: 'health_insight', recordId: 'hi1', baseRevision: null, revisionId: 'r1', envelope: hiEnv }).ok, 'health_insight stored as ciphertext');
  const dump2 = srv.dumpAll();
  ok(dump2.indexOf('input_snapshot') === -1 && dump2.indexOf('"q1"') === -1, 'health_insight plaintext not in server dump');
  // round-trip review cache + purpose binding
  const { record: revBack } = await decryptRecordChecked(vault.vk, revEnv, { vaultId: vault.vaultId, recordId: 'rk1', epoch: 1, use: 'review' });
  ok(JSON.stringify(revBack) === JSON.stringify(reviewPayload), 'review cache round-trips');

  /* ===== 10. scale: 1,000 synthetic records ===== */
  section('10. scale pass (1,000 records)');
  const USER2 = 'u_scale';
  const bigVault = await createVault({ epoch: 1 });
  srv.putVaultRecord(USER2, bigVault.serverVaultRecord);
  const big = fakeIns(1000);
  const t0 = Date.now();
  for (const rec of big) {
    const env = await encryptRecord(bigVault.vk, rec, { vaultId: bigVault.vaultId, recordId: rec.id, revisionId: 'r1', epoch: 1 });
    srv.putRecord(USER2, { kind: 'ins', recordId: rec.id, baseRevision: null, revisionId: 'r1', envelope: env });
  }
  const encMs = Date.now() - t0;
  const t1 = Date.now();
  const decBig = [];
  for (const e of srv.listEnvelopes(USER2, 'ins')) {
    const { record } = await decryptRecordChecked(bigVault.vk, e.envelope, { vaultId: bigVault.vaultId, recordId: e.recordId, epoch: 1 });
    decBig.push(record);
  }
  const decMs = Date.now() - t1;
  ok(decBig.length === 1000, '1,000 records round-tripped');
  const rBig = portable.buildReview(portable.computeFacts({ ins: decBig }, NOW));
  const rBigServer = server.buildReview(server.computeFacts({ ins: big }, NOW));
  ok(JSON.stringify(rBig) === JSON.stringify(rBigServer), '1,000-record review matches server');
  ok(srv.dumpAll().indexOf('note-500') === -1, 'no plaintext in 1,000-record server dump');
  console.log('  (encrypt 1000: ' + encMs + 'ms, decrypt 1000: ' + decMs + 'ms)');

  /* ---- summary ---- */
  console.log('\n──────────────────────────────');
  console.log('B2 acceptance: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('format version: ' + FORMAT_VERSION);
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
