/*
 * Phase 1 TASK 1.39｜D1 Verification（Architecture Review — 純確認，無寫入）
 *
 * 跟TASK1.29～1.38的 real_d1_verify.mjs 不同：本次任務完全不建立任何
 * 新功能、不透過worker.js/真實API寫入任何一筆資料（架構審查測試套件
 * 對真實本機D1一律只用EXPLAIN/PRAGMA做零副作用的schema檢查，見
 * test_architecture_review.mjs的「I. migration check」章節），所以這裡
 * 不需要「建立→驗證→清理」的完整流程，只需要單純確認 local 跟 remote
 * D1 從頭到尾都維持在乾淨狀態（users=0, sessions=0, 五大domain tables=0,
 * auth_audit_logs=0），佐證本次審查對正式資料零污染。
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

const TABLES = [
  'users', 'sessions',
  'exploration_records', 'food_events', 'emotion_records', 'behavior_patterns', 'ai_reports',
  'auth_audit_logs',
];

function findLocalD1File() {
  const dir = path.join(repoRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length !== 1) {
    throw new Error(`預期只有一個 D1 sqlite 檔案，實際找到 ${files.length} 個: ${files.join(', ')}`);
  }
  return path.join(dir, files[0]);
}

function main() {
  console.log('=== TASK1.39 D1 Verification（純確認，本次審查沒有任何寫入操作）===\n');

  const d1File = findLocalD1File();
  console.log('Local D1 sqlite 檔案:', d1File);
  const conn = new DatabaseSync(d1File);

  let allZero = true;
  for (const t of TABLES) {
    const row = conn.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
    console.log(`Local ${t} = ${row.c}`);
    if (row.c !== 0) allZero = false;
  }
  conn.close();

  if (!allZero) {
    console.error('\n❌ Local D1 有非0的資料表，這不應該發生（本次任務完全沒有寫入操作）');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅ Local D1 全數確認為 0，本次架構審查對正式/本機資料零污染。');
  console.log('\nRemote D1 請另外執行以下指令確認（需要網路連線 wrangler，不在此腳本內自動執行）：');
  console.log('  npx wrangler d1 execute diet-coach-db --remote --command "SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM sessions) as sessions, (SELECT COUNT(*) FROM exploration_records) as exploration_records, (SELECT COUNT(*) FROM food_events) as food_events, (SELECT COUNT(*) FROM emotion_records) as emotion_records, (SELECT COUNT(*) FROM behavior_patterns) as behavior_patterns, (SELECT COUNT(*) FROM ai_reports) as ai_reports, (SELECT COUNT(*) FROM auth_audit_logs) as auth_audit_logs"');
}

main();
