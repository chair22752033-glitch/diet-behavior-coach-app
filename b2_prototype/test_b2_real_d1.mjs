/*
 * B2 continuation — ciphertext flow over a REAL file-backed D1 (node:sqlite),
 * driven through the project's actual DB layer (src/db/query.js + transaction.js).
 *
 * Addresses GPT's biggest correction ("fake server/memory DB != real Worker/D1/KV"):
 *   - persists encrypted records into a real .sqlite FILE and then scans the raw file
 *     bytes to prove no private plaintext is on disk;
 *   - exercises CAS / idempotency / validation on the real DB;
 *   - device-side decrypt + review against the real round-trip;
 *   - error paths return reason codes and leak no plaintext (incl. thrown errors/console).
 *
 * Run: node b2_prototype/test_b2_real_d1.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault, recoverVaultWithCode, encryptRecord, decryptRecordChecked } from './vault_crypto.mjs';
import * as storeMod from './e2ee_sync_store.mjs';
import * as portable from './review_portable.mjs';
import * as server from '../src/review/review_service.js';

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
async function thr(fn, n) { try { await fn(); fail++; fails.push(n + ' (no throw)'); console.log('  ✗ ' + n + ' (no throw)'); } catch { pass++; } }
const sec = (t) => console.log('\n== ' + t + ' ==');

// real-D1 adapter over node:sqlite, shaped for src/db/query.js + transaction.js
function makeD1(sqlite) {
  function stmt(sql, params) {
    params = params || [];
    return {
      bind(...p) { return stmt(sql, p); },
      run() { const s = sqlite.prepare(sql); const i = s.run(...params); return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid || 0) } }; },
      all() { const s = sqlite.prepare(sql); return { results: s.all(...params), success: true, meta: {} }; },
      first() { const s = sqlite.prepare(sql); const r = s.get(...params); return r === undefined ? null : r; },
    };
  }
  return {
    prepare(sql) { return stmt(sql); },
    batch(prepared) { sqlite.exec('BEGIN'); try { const r = prepared.map((st) => st.run()); sqlite.exec('COMMIT'); return r; } catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; } },
  };
}

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
function fakeIns(n) {
  const craves = ['fried', 'sweet', 'fried', 'soup', 'fried', 'fresh'];
  const stress = [7, 8, 6, 5, 9, 4];
  const out = [];
  for (let i = 0; i < n; i++) out.push({
    id: 'ins_' + i, ts: NOW - (i % 6) * DAY - i * 1000,
    st: { energy: 3, stress_raw: stress[i % 6], crave: craves[i % 6] },
    beh: 'note-' + i, crave: craves[i % 6], note: '宵夜炸雞祕密' + i, // Chinese plaintext marker
  });
  return out;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-reald1-'));
  const dbFile = path.join(dir, 'e2ee.sqlite');
  const sqlite = new DatabaseSync(dbFile);
  sqlite.exec(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'schema_e2ee.sql'), 'utf8'));
  const db = makeD1(sqlite);
  const USER = 'u_real_1';

  sec('1. vault + ciphertext records into REAL D1');
  const vault = await createVault({ epoch: 1 });
  ok((await storeMod.putVault(db, USER, vault.serverVaultRecord)).ok, 'putVault into real D1');
  ok((await storeMod.cryptoMode(db, USER)) === 'e2ee_only', 'crypto_mode persisted = e2ee_only');
  ok((await storeMod.putVault(db, USER, vault.serverVaultRecord)).reason === 'vault_exists', 'single-vault enforced on real D1');

  const ins = fakeIns(12);
  for (const rec of ins) {
    const rev = 'r1-' + rec.id;
    const env = await encryptRecord(vault.vk, rec, { vaultId: vault.vaultId, recordId: rec.id, revisionId: rev, epoch: 1 });
    ok((await storeMod.putRecord(db, USER, { kind: 'ins', recordId: rec.id, baseRevision: null, revisionId: rev, envelope: env })).ok, 'store ciphertext ' + rec.id);
  }
  const revEnv = await encryptRecord(vault.vk, { summary: { text: 'x' } }, { vaultId: vault.vaultId, recordId: 'rk1', revisionId: 'r1', epoch: 1, use: 'review' });
  await storeMod.putRecord(db, USER, { kind: 'review', recordId: 'rk1', baseRevision: null, revisionId: 'r1', envelope: revEnv });
  const hiEnv = await encryptRecord(vault.vk, { input_snapshot: { q1: '宵夜' }, output_snapshot: { r: 'y' } }, { vaultId: vault.vaultId, recordId: 'hi1', revisionId: 'r1', epoch: 1, use: 'health_insight' });
  await storeMod.putRecord(db, USER, { kind: 'health_insight', recordId: 'hi1', baseRevision: null, revisionId: 'r1', envelope: hiEnv });

  const listed = await storeMod.listEnvelopes(db, USER, 'ins');
  ok(listed.ok && listed.rows.length === 12, 'real D1 holds 12 ins ciphertext rows');

  sec('2. CAS / idempotency / validation on real D1');
  const e2 = await encryptRecord(vault.vk, ins[0], { vaultId: vault.vaultId, recordId: 'ins_0', revisionId: 'r2', epoch: 1 });
  ok((await storeMod.putRecord(db, USER, { kind: 'ins', recordId: 'ins_0', baseRevision: 'WRONG', revisionId: 'r2', envelope: e2 })).reason === 'conflict', 'stale baseRevision rejected');
  ok((await storeMod.putRecord(db, USER, { kind: 'ins', recordId: 'ins_0', baseRevision: 'r1-ins_0', revisionId: 'r2', envelope: e2 })).ok, 'correct baseRevision updates');
  ok((await storeMod.putRecord(db, USER, { kind: 'ins', recordId: 'ins_0', baseRevision: 'r1-ins_0', revisionId: 'r2', envelope: e2 })).idempotent === true, 'idempotent replay');
  ok((await storeMod.putRecord(db, USER, { kind: 'ins', recordId: 'px', baseRevision: null, revisionId: 'r1', envelope: '{"crave":"fried"}' })).reason === 'not_ciphertext', 'plaintext payload refused by real store');

  sec('3. device decrypt + review == production (over real D1 round-trip)');
  const decrypted = [];
  for (const r of (await storeMod.listEnvelopes(db, USER, 'ins')).rows) {
    const { record } = await decryptRecordChecked(vault.vk, r.envelope, { vaultId: vault.vaultId, recordId: r.recordId, epoch: 1 });
    decrypted.push(record);
  }
  // ins_0 now has rev r2 (same content as ins[0]) -> dedup by id gives same 12 records
  const byId = {}; decrypted.forEach((r) => { byId[r.id] = r; });
  const docDevice = { ins: Object.keys(byId).map((k) => byId[k]) };
  const rDev = portable.buildReview(portable.computeFacts(docDevice, NOW));
  const rSrv = server.buildReview(server.computeFacts({ ins }, NOW));
  ok(JSON.stringify(rDev) === JSON.stringify(rSrv), 'device review == production review (real D1)');

  sec('4. recovery code on a fresh client restores VK, reads real D1');
  const vrow = (await storeMod.getVault(db, USER)).vault;
  const rec2 = await recoverVaultWithCode(vault.recoveryCode, {
    vault_id: vrow.vault_id, epoch: vrow.epoch, recovery_salt: vrow.recovery_salt, wrapped_vk_recovery: vrow.wrapped_vk_recovery,
  });
  ok(Buffer.from(rec2.vk).equals(Buffer.from(vault.vk)), 'recovery restores VK from real D1 vault row');

  // close DB so the file is fully flushed before scanning
  sqlite.close();

  sec('5. NO private plaintext in the real .sqlite FILE');
  const bytes = fs.readFileSync(dbFile);
  const latin = bytes.toString('latin1');
  const asciiProbes = ['fried', 'sweet', 'soup', 'fresh', 'energy', 'stress_raw', 'note-0', 'input_snapshot', '"q1"'];
  for (const p of asciiProbes) ok(latin.indexOf(p) === -1, 'file has no ascii "' + p + '"');
  // Chinese plaintext markers (UTF-8 bytes) must be absent too
  for (const p of ['宵夜炸雞祕密', '宵夜']) ok(bytes.indexOf(Buffer.from(p, 'utf8')) === -1, 'file has no UTF-8 "' + p + '"');
  // but the ciphertext envelopes ARE present (sanity: we scanned the right file)
  ok(latin.split('.').length > 20, 'file does contain JWE-shaped ciphertext');

  sec('6. stored rows are ciphertext-shaped (re-open, SELECT)');
  const s2 = new DatabaseSync(dbFile);
  const rows = s2.prepare('SELECT envelope FROM e2ee_records').all();
  const jweRe = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  ok(rows.length === 14 && rows.every((r) => jweRe.test(r.envelope)), 'every stored envelope is a compact JWE');
  s2.close();

  sec('7. error paths leak no plaintext (thrown errors / console)');
  const logs = [];
  const origErr = console.error, origLog = console.log;
  console.error = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' '));
  let thrownMsg = '';
  try { await decryptRecordChecked((await createVault()).vk, (await storeMod.listEnvelopes(makeD1(new DatabaseSync(dbFile)), USER, 'ins')).rows[0].envelope, { vaultId: vault.vaultId, recordId: 'ins_0', epoch: 1 }); }
  catch (e) { thrownMsg = String(e && e.message || e); }
  console.error = origErr; console.log = origLog;
  ok(thrownMsg.length > 0, 'wrong-key decrypt throws');
  ok(thrownMsg.indexOf('fried') === -1 && thrownMsg.indexOf('宵夜') === -1, 'thrown error carries no plaintext');
  ok(logs.join('|').indexOf('fried') === -1 && logs.join('|').indexOf('宵夜') === -1, 'no plaintext logged during error');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n──────────────────────────────');
  console.log('B2 real-D1: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
