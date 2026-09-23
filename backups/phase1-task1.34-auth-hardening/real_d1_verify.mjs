/*
 * Phase 1 TASK 1.34｜真實 Local D1 端對端驗證
 *
 * 跟TASK1.29～1.33的 real_d1_verify.mjs 同樣手法：用 Node 22 內建的
 * node:sqlite 直接打開 wrangler 本機 D1 狀態實際使用的 SQLite 檔案，
 * 包成符合 src/db/query.js 期待的 D1 binding 介面，透過真正的
 * src/db/index.js 的 createDb(env) 組出真正的 db 物件，直接呼叫
 * TASK1.34新增的三個service（session_cleanup_service/
 * session_management_service/audit_log_service），驗證它們能對「真的」
 * 本機D1完成完整的「建立 → 稽核紀錄寫入 → 清理」流程。
 *
 * 流程：
 * 1. 執行前：確認 users/sessions/auth_audit_logs 都是 0
 * 2. 直接寫入一筆測試user + 兩筆session（一筆active、一筆expired）
 * 3. 透過 audit_log_service.recordAuthEvent() 寫入一筆guest_login稽核紀錄
 *    → 確認 auth_audit_logs 新增1筆
 * 4. 透過 session_management_service 驗證：
 *    - listUserSessions() 正確列出2筆，isActive分別為true/false
 *    - revokeSessionById() 成功撤銷active那一筆
 * 5. 透過 session_cleanup_service.cleanupExpiredSessions() 清理過期session
 *    → 確認只有expired那一筆被刪除，剛撤銷的（但尚未過期）那一筆還在
 * 6. 清理：DELETE 掉這次測試建立的所有資料（含audit log）
 * 7. 執行後：再次確認 users/sessions/auth_audit_logs 都回到 0
 *
 * 完全不透過 worker.js／真正的Router（這三個service本次刻意維持
 * dormant，沒有被任何route呼叫），直接測試service層對真實D1的行為。
 */
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../../src/db/index.js';
import { findExpiredSessions, cleanupExpiredSessions } from '../../src/services/session_cleanup_service.js';
import { listUserSessions, revokeSessionById } from '../../src/services/session_management_service.js';
import { recordAuthEvent, listAuthEventsForUser } from '../../src/services/audit_log_service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

function findLocalD1File() {
  const dir = path.join(repoRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length !== 1) {
    throw new Error(`預期只有一個 D1 sqlite 檔案，實際找到 ${files.length} 個: ${files.join(', ')}`);
  }
  return path.join(dir, files[0]);
}

function createRealD1Binding(sqlitePath) {
  const conn = new DatabaseSync(sqlitePath);

  function makeStatement(sql, boundParams) {
    return {
      bind(...params) { return makeStatement(sql, params); },
      async run() {
        const stmt = conn.prepare(sql);
        const info = stmt.run(...(boundParams || []));
        return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
      },
      async all() {
        const stmt = conn.prepare(sql);
        const results = stmt.all(...(boundParams || []));
        return { results, success: true };
      },
      async first() {
        const stmt = conn.prepare(sql);
        const row = stmt.get(...(boundParams || []));
        return row === undefined ? null : row;
      },
    };
  }

  return {
    prepare(sql) { return makeStatement(sql, []); },
    async batch(statements) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
    __raw: conn,
  };
}

function countRows(conn, table) {
  const row = conn.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
  return row.c;
}

async function main() {
  console.log('=== TASK1.34 真實 Local D1 端對端驗證（Session Cleanup/Management + Audit Log，直接對真實D1）===\n');

  const d1File = findLocalD1File();
  console.log('D1 sqlite 檔案:', d1File);

  const d1Binding = createRealD1Binding(d1File);
  const conn = d1Binding.__raw;

  const usersBefore = countRows(conn, 'users');
  const sessionsBefore = countRows(conn, 'sessions');
  const auditLogsBefore = countRows(conn, 'auth_audit_logs');
  console.log(`執行前： users=${usersBefore}, sessions=${sessionsBefore}, auth_audit_logs=${auditLogsBefore}`);
  assert.strictEqual(usersBefore, 0, '執行前 users 應為 0');
  assert.strictEqual(sessionsBefore, 0, '執行前 sessions 應為 0');
  assert.strictEqual(auditLogsBefore, 0, '執行前 auth_audit_logs 應為 0');

  const db = createDb({ DIET_COACH_DB: d1Binding });

  console.log('\n--- 步驟1：建立測試user + 兩筆session（一筆active、一筆expired）---');
  const userId = 'test-user-task1.34-hardening';
  const now = new Date();
  const past = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 40); // 40天前，早就過期
  const nowIso = now.toISOString();

  await db.users.insert({
    id: userId,
    auth_provider: 'google',
    auth_provider_id: 'g-task1.34-real-d1',
    display_name: 'TASK1.34 Real D1 Verify User',
    is_guest: false,
    status: 'active',
    legacy_sync_code: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const activeSessionId = 'session-task1.34-active';
  const expiredSessionId = 'session-task1.34-expired';
  await db.sessions.insert({
    id: activeSessionId,
    user_id: userId,
    created_at: nowIso,
    expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    user_agent: 'real-d1-verify-agent',
    ip_hash: 'real-d1-verify-ip-hash',
  });
  await db.sessions.insert({
    id: expiredSessionId,
    user_id: userId,
    created_at: past.toISOString(),
    expires_at: new Date(past.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(), // 早就過期
    user_agent: 'real-d1-verify-agent-old',
    ip_hash: 'real-d1-verify-ip-hash-old',
  });

  const usersAfterSetup = countRows(conn, 'users');
  const sessionsAfterSetup = countRows(conn, 'sessions');
  console.log(`建立後： users=${usersAfterSetup}, sessions=${sessionsAfterSetup}`);
  assert.strictEqual(usersAfterSetup, 1);
  assert.strictEqual(sessionsAfterSetup, 2);

  console.log('\n--- 步驟2：audit_log_service.recordAuthEvent() 寫入一筆guest_login稽核紀錄 ---');
  const auditResult = await recordAuthEvent(db, { user_id: userId, event_type: 'guest_login', ip_hash: 'real-d1-verify-ip-hash' }, { now: nowIso });
  assert.strictEqual(auditResult.ok, true, 'recordAuthEvent應該成功寫入');
  const auditLogsAfterInsert = countRows(conn, 'auth_audit_logs');
  console.log(`audit log寫入後： auth_audit_logs=${auditLogsAfterInsert}`);
  assert.strictEqual(auditLogsAfterInsert, 1);

  const listResult = await listAuthEventsForUser(db, userId);
  assert.strictEqual(listResult.ok, true);
  assert.strictEqual(listResult.logs.length, 1);
  assert.strictEqual(listResult.logs[0].event_type, 'guest_login');
  console.log('listAuthEventsForUser()正確查回剛寫入的那一筆');

  console.log('\n--- 步驟3：session_management_service驗證 listUserSessions()/revokeSessionById() ---');
  const sessionsListResult = await listUserSessions(db, userId, { now: nowIso });
  assert.strictEqual(sessionsListResult.ok, true);
  assert.strictEqual(sessionsListResult.sessions.length, 2);
  const byId = Object.fromEntries(sessionsListResult.sessions.map((s) => [s.id, s]));
  assert.strictEqual(byId[activeSessionId].isActive, true);
  assert.strictEqual(byId[expiredSessionId].isActive, false);
  console.log('listUserSessions()正確標記active/expired session的isActive狀態');

  const revokeResult = await revokeSessionById(db, activeSessionId, { now: nowIso, ownerUserId: userId });
  assert.strictEqual(revokeResult.ok, true);
  const revokedRow = conn.prepare('SELECT * FROM sessions WHERE id = ?').get(activeSessionId);
  assert.ok(revokedRow.revoked_at, 'active session應該已經被撤銷');
  console.log('revokeSessionById()成功撤銷剛才那筆active session');

  console.log('\n--- 步驟4：session_cleanup_service.cleanupExpiredSessions() 清理過期session ---');
  const cleanupResult = await cleanupExpiredSessions(db, { now: nowIso });
  assert.strictEqual(cleanupResult.ok, true, 'cleanup應該成功');
  assert.strictEqual(cleanupResult.deletedCount, 1, '應該只清掉真正過期的那1筆');
  assert.deepStrictEqual(cleanupResult.deletedSessionIds, [expiredSessionId]);
  console.log('cleanupExpiredSessions()成功清掉過期session，deletedCount =', cleanupResult.deletedCount);

  const sessionsAfterCleanup = countRows(conn, 'sessions');
  console.log(`cleanup後： sessions=${sessionsAfterCleanup}（預期1，剛才撤銷但尚未過期的那筆還在）`);
  assert.strictEqual(sessionsAfterCleanup, 1, '被撤銷但尚未過期的session不應該被cleanup清除——這兩者是不同的生命週期事件');

  const remainingSession = conn.prepare('SELECT * FROM sessions WHERE id = ?').get(activeSessionId);
  assert.ok(remainingSession, '剛才撤銷的那筆session仍應該存在（只是revoked_at有值，不是被刪除）');

  console.log('\n--- 步驟5：確認findExpiredSessions()現在找不到任何過期session了 ---');
  const findAfterCleanup = await findExpiredSessions(db, { now: nowIso });
  assert.strictEqual(findAfterCleanup.results.length, 0);

  console.log('\n=== 清理測試資料 ===');
  conn.prepare('DELETE FROM auth_audit_logs WHERE user_id = ?').run(userId);
  conn.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  conn.prepare('DELETE FROM users WHERE id = ?').run(userId);

  const usersFinal = countRows(conn, 'users');
  const sessionsFinal = countRows(conn, 'sessions');
  const auditLogsFinal = countRows(conn, 'auth_audit_logs');
  console.log(`清理後： users=${usersFinal}, sessions=${sessionsFinal}, auth_audit_logs=${auditLogsFinal}`);
  assert.strictEqual(usersFinal, 0, '清理後 users 應回到 0');
  assert.strictEqual(sessionsFinal, 0, '清理後 sessions 應回到 0');
  assert.strictEqual(auditLogsFinal, 0, '清理後 auth_audit_logs 應回到 0');

  conn.close();

  console.log('\n✅✅✅ 真實 Local D1 端對端驗證全數通過（audit log寫入正確、session管理正確標記active/expired、cleanup精準只清過期session不動active/revoked-but-not-expired），測試資料已清理乾淨。');
}

main().catch((e) => {
  console.error('❌ 驗證失敗:', e);
  process.exitCode = 1;
});
