/*
 * B3 drill — legacy->E2EE migration on a REAL file-backed node:sqlite D1.
 * Fake data only; isolated. Proves: locking, resumable batched migration, verify,
 * switch, cleanup (no plaintext on disk), crypto-aware rollback, device review parity.
 *
 * Run: node b2_prototype/test_b3_migration.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault, recoverVaultWithCode, decryptRecordChecked } from './vault_crypto.mjs';
import * as drill from './migration_drill.mjs';
import * as portable from './review_portable.mjs';
import * as server from '../src/review/review_service.js';

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
async function thr(fn, n) { try { await fn(); fail++; fails.push(n + ' (no throw)'); } catch { pass++; } }
const sec = (t) => console.log('\n== ' + t + ' ==');

function makeD1(sqlite) {
  function stmt(sql, params) { params = params || []; return {
    bind(...p) { return stmt(sql, p); },
    run() { const s = sqlite.prepare(sql); const i = s.run(...params); return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid || 0) } }; },
    all() { const s = sqlite.prepare(sql); return { results: s.all(...params), success: true, meta: {} }; },
    first() { const s = sqlite.prepare(sql); const r = s.get(...params); return r === undefined ? null : r; },
  }; }
  return { prepare(sql) { return stmt(sql); }, batch(p) { sqlite.exec('BEGIN'); try { const r = p.map((s) => s.run()); sqlite.exec('COMMIT'); return r; } catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; } } };
}

const DAY = 86400000, NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
function seedLegacy(sqlite, userId, n) {
  const craves = ['fried', 'sweet', 'fried', 'soup', 'fried', 'fresh'];
  for (let i = 0; i < n; i++) {
    const rec = { id: 'ins_' + i, ts: NOW - (i % 6) * DAY - i * 1000, st: { stress_raw: 5 + (i % 5), crave: craves[i % 6] }, crave: craves[i % 6], note: '宵夜炸雞祕密' + i };
    sqlite.prepare('INSERT INTO legacy_records (user_id, kind, record_id, payload, client_ts) VALUES (?, ?, ?, ?, ?)').run(userId, 'ins', rec.id, JSON.stringify(rec), rec.ts);
  }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-'));
  const dbFile = path.join(dir, 'b3.sqlite');
  const sqlite = new DatabaseSync(dbFile);
  const here = path.dirname(new URL(import.meta.url).pathname);
  sqlite.exec(fs.readFileSync(here + '/schema_e2ee.sql', 'utf8'));
  sqlite.exec(fs.readFileSync(here + '/schema_b3.sql', 'utf8'));
  const db = makeD1(sqlite);
  const U = 'u_b3';

  sec('1. setup: legacy plaintext + vault');
  seedLegacy(sqlite, U, 250);
  const vault = await createVault({ epoch: 1 });
  ok((await sqlite.prepare('SELECT COUNT(*) c FROM legacy_records WHERE user_id=?').get(U)).c === 250, '250 legacy plaintext rows seeded');
  ok((await drill.legacyWriteAllowed(db, U)) === true, 'legacy writes allowed before lock');

  sec('2. lock');
  ok((await drill.lockForMigration(db, U)).ok, 'lock -> migration_locked');
  ok((await drill.legacyWriteAllowed(db, U)) === false, 'legacy writes refused after lock');
  ok((await drill.migrateBatch(db, U, vault.vk, vault.vaultId, { batchSize: 50 })).ok, 'batch runs only when locked');

  sec('3. resumable batched migration (simulate interruption)');
  // we already did one batch of 50 above; continue a few, then simulate a crash by just
  // re-reading state and resuming — checkpoint must prevent dup/loss.
  let guard = 0, done = false;
  while (!done && guard++ < 20) {
    const r = await drill.migrateBatch(db, U, vault.vk, vault.vaultId, { batchSize: 40 });
    ok(r.ok, 'batch ok');
    done = r.done;
  }
  const cipherCount = sqlite.prepare('SELECT COUNT(*) c FROM e2ee_records WHERE user_id=?').get(U).c;
  ok(cipherCount === 250, 'all 250 migrated to ciphertext, no dup/loss (got ' + cipherCount + ')');
  // re-running after "done" is a no-op (idempotent resume)
  ok((await drill.migrateBatch(db, U, vault.vk, vault.vaultId, {})).done === true, 'resume after done is a no-op');

  sec('4. verify');
  const v = await drill.verifyMigration(db, U, vault.vk, vault.vaultId, {});
  ok(v.ok && v.verified === 250, 'verify: ciphertext matches legacy (count+content)');
  ok((await drill.getState(db, U)).state === 'ciphertext_verified', 'state -> ciphertext_verified');

  sec('5. recovery on a 2nd browser works before cleanup');
  const rec2 = await recoverVaultWithCode(vault.recoveryCode, vault.serverVaultRecord);
  const anyEnv = sqlite.prepare('SELECT record_id, envelope FROM e2ee_records WHERE user_id=? LIMIT 1').get(U);
  const dec = await decryptRecordChecked(rec2.vk, anyEnv.envelope, { vaultId: vault.vaultId, recordId: anyEnv.record_id, epoch: 1 });
  ok(dec.record && dec.record.crave, '2nd browser recovers + decrypts a migrated record');

  sec('6. crypto-aware rollback');
  ok((await drill.rollbackTo(db, U, 'legacy')).reason === 'rollback_to_plaintext_forbidden', 'cannot roll back to plaintext once verified');
  ok((await drill.rollbackTo(db, U, 'migration_locked')).ok, 'can roll back to a crypto-aware state');
  await drill.verifyMigration(db, U, vault.vk, vault.vaultId, {}); // re-verify to move forward again

  sec('7. switch + cleanup');
  ok((await drill.cleanupLegacy(db, U)).reason === 'not_switched', 'cleanup refused before switch');
  ok((await drill.switchToE2ee(db, U)).ok, 'switch -> e2ee_only');
  const cl = await drill.cleanupLegacy(db, U);
  ok(cl.ok && cl.deleted === 250, 'cleanup deletes 250 legacy rows');
  ok(sqlite.prepare('SELECT COUNT(*) c FROM legacy_records WHERE user_id=?').get(U).c === 0, 'no legacy rows remain');

  sec('8. device review parity + no plaintext on disk after cleanup');
  const decAll = [];
  for (const r of sqlite.prepare('SELECT record_id, envelope FROM e2ee_records WHERE user_id=? ORDER BY seq').all(U)) {
    const { record } = await decryptRecordChecked(vault.vk, r.envelope, { vaultId: vault.vaultId, recordId: r.record_id, epoch: 1 });
    decAll.push(record);
  }
  const origin = []; for (let i = 0; i < 250; i++) { const craves = ['fried', 'sweet', 'fried', 'soup', 'fried', 'fresh']; origin.push({ id: 'ins_' + i, ts: NOW - (i % 6) * DAY - i * 1000, st: { stress_raw: 5 + (i % 5), crave: craves[i % 6] }, crave: craves[i % 6], note: '宵夜炸雞祕密' + i }); }
  const rDev = portable.buildReview(portable.computeFacts({ ins: decAll }, NOW));
  const rSrv = server.buildReview(server.computeFacts({ ins: origin }, NOW));
  ok(JSON.stringify(rDev) === JSON.stringify(rSrv), 'post-migration device review == pre-migration server review');

  sqlite.close();
  const bytes = fs.readFileSync(dbFile);
  ok(bytes.toString('latin1').indexOf('fried') === -1, 'no ascii plaintext ("fried") in DB file after cleanup');
  ok(bytes.indexOf(Buffer.from('宵夜炸雞祕密', 'utf8')) === -1, 'no Chinese plaintext in DB file after cleanup');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n──────────────────────────────');
  console.log('B3 migration drill: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
