/*
 * Phase 1 TASK 1.14｜Guest Lifecycle 與資料歸屬流程 單元測試（純記憶體，未連線任何資料庫）
 *
 * 涵蓋 src/identity/lifecycle.js、guest_session_service.js、account_upgrade.js，
 * 以及「升級後歷史資料關聯仍存在」這條資料歸屬規則（docs/user-ownership-rules.md）。
 *
 * 全部使用假的 D1 binding（記錄呼叫內容的物件），完全不寫入任何真實或本機模擬的資料庫，
 * 也不建立任何真實使用者資料。
 */
import assert from 'assert';
import { createGuestIdentity } from '../../src/identity/lifecycle.js';
import { createGuestSession } from '../../src/identity/guest_session_service.js';
import { upgradeIdentity } from '../../src/identity/account_upgrade.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

/**
 * 假的 D1 db 物件，模擬 createDb(env) 的完整介面（users/sessions + 一個泛用的
 * food_events store，用來驗證「升級後歷史資料關聯仍存在」）。
 */
function makeMockDb(opts) {
  opts = opts || {};
  const users = new Map((opts.users || []).map((u) => [u.id, Object.assign({}, u)]));
  const sessions = new Map((opts.sessions || []).map((s) => [s.id, Object.assign({ revoked_at: null }, s)]));
  const foodEvents = new Map((opts.foodEvents || []).map((f) => [f.id, Object.assign({}, f)]));
  const calls = [];

  return {
    calls,
    users: {
      async insert(u) { calls.push({ type: 'users.insert', u }); users.set(u.id, Object.assign({}, u)); return { ok: true, meta: {} }; },
      async getById(id) { calls.push({ type: 'users.getById', id }); return { ok: true, row: users.get(id) || null }; },
      async getByProvider(provider, providerId) {
        calls.push({ type: 'users.getByProvider', provider, providerId });
        for (const u of users.values()) if (u.auth_provider === provider && u.auth_provider_id === providerId) return { ok: true, row: u };
        return { ok: true, row: null };
      },
      async upgradeToProvider(id, provider, providerId, updatedAt) {
        calls.push({ type: 'users.upgradeToProvider', id, provider, providerId });
        const u = users.get(id);
        if (u) { u.auth_provider = provider; u.auth_provider_id = providerId; u.is_guest = 0; u.updated_at = updatedAt; }
        return { ok: true, meta: {} };
      },
    },
    sessions: {
      async insert(s) { calls.push({ type: 'sessions.insert', s }); sessions.set(s.id, Object.assign({ revoked_at: null }, s)); return { ok: true, meta: {} }; },
      async getById(id) { calls.push({ type: 'sessions.getById', id }); return { ok: true, row: sessions.get(id) || null }; },
      async revokeAllForUser(userId, revokedAt) {
        calls.push({ type: 'sessions.revokeAllForUser', userId });
        let n = 0;
        for (const s of sessions.values()) if (s.user_id === userId && !s.revoked_at) { s.revoked_at = revokedAt; n++; }
        return { ok: true, meta: { changes: n } };
      },
    },
    // 泛用的業務資料表 mock，用來驗證「升級後歷史資料關聯仍存在」（資料歸屬規則）
    foodEvents: {
      async insert(f) { calls.push({ type: 'foodEvents.insert', f }); foodEvents.set(f.id, Object.assign({}, f)); return { ok: true, id: f.id }; },
      async listByUser(userId) {
        calls.push({ type: 'foodEvents.listByUser', userId });
        return { ok: true, results: Array.from(foodEvents.values()).filter((f) => f.user_id === userId) };
      },
    },
    _users: users,
    _sessions: sessions,
    _foodEvents: foodEvents,
  };
}

// ---- 測試 1：建立 guest user 成功 ----
async function test1_createGuestUserSuccess() {
  const db = makeMockDb();
  const result = await createGuestIdentity(db, { now: '2026-01-01T00:00:00.000Z' });

  record('1. createGuestIdentity 成功並回傳 user_id', result.ok === true && typeof result.user_id === 'string');
  record('1. 回傳的 guest user 物件符合規則：is_guest=true', result.user.is_guest === true);
  record('1. 回傳的 guest user 物件符合規則：auth_provider=null', result.user.auth_provider === null);
  record('1. 回傳的 guest user 物件符合規則：status=active', result.user.status === 'active');
  record('1. 確實呼叫了 db.users.insert（真的寫入D1，不只是記憶體物件）', db.calls.some((c) => c.type === 'users.insert' && c.u.id === result.user_id));
}

// ---- 測試 2：guest user 建立 session 成功 ----
async function test2_createGuestSessionSuccess() {
  const db = makeMockDb();
  const result = await createGuestSession(db, { metadata: { now: '2026-01-01T00:00:00.000Z' }, sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });

  record('2. createGuestSession 成功並回傳 {user, session}', result.ok === true && !!result.user && !!result.session);
  record('2. user 是新建立的訪客', result.user.is_guest === true);
  record('2. session 回傳的 setCookie 包含正確的cookie名稱', result.session.setCookie.indexOf(SESSION_COOKIE_NAME + '=') === 0);
  record('2. session 確實與該 guest user 綁定（db.sessions.insert的user_id正確）', db.calls.some((c) => c.type === 'sessions.insert' && c.s.user_id === result.user.id));
}

// ---- 測試 3：guest 升級 provider 後 user_id 不變 ----
async function test3_upgradeKeepsUserId() {
  const db = makeMockDb();
  const created = await createGuestIdentity(db, { now: '2026-01-01T00:00:00.000Z' });
  const originalUserId = created.user_id;

  const upgradeResult = await upgradeIdentity(db, originalUserId, 'google', 'g-12345', { now: '2026-02-01T00:00:00.000Z' });

  record('3. upgradeIdentity 成功', upgradeResult.ok === true);
  record('3. 升級後 userId 與升級前完全相同', upgradeResult.userId === originalUserId);
  record('3. D1裡該筆user的id沒有被改變（只有一筆，且id不變）', db._users.size === 1 && db._users.has(originalUserId));
  record('3. 升級後 is_guest 變為 0（已非訪客）', db._users.get(originalUserId).is_guest === 0);
  record('3. 升級後 auth_provider/auth_provider_id 正確寫入', db._users.get(originalUserId).auth_provider === 'google' && db._users.get(originalUserId).auth_provider_id === 'g-12345');
}

// ---- 測試 4：升級後歷史資料關聯仍存在 ----
async function test4_historicalDataStillLinkedAfterUpgrade() {
  const db = makeMockDb();
  const created = await createGuestIdentity(db, { now: '2026-01-01T00:00:00.000Z' });
  const userId = created.user_id;

  // 訪客時期建立的歷史資料（模擬 food_events）
  await db.foodEvents.insert({ id: 1, user_id: userId, description: '訪客時期的測試餐點A' });
  await db.foodEvents.insert({ id: 2, user_id: userId, description: '訪客時期的測試餐點B' });

  const beforeUpgrade = await db.foodEvents.listByUser(userId);
  record('4. 升級前可查到2筆歷史資料', beforeUpgrade.results.length === 2);

  await upgradeIdentity(db, userId, 'google', 'g-99999', { now: '2026-02-01T00:00:00.000Z' });

  const afterUpgrade = await db.foodEvents.listByUser(userId);
  record('4. 升級後仍可用同一個user_id查到全部2筆歷史資料', afterUpgrade.results.length === 2);
  record('4. 升級後歷史資料內容完全沒有被搬動或修改', afterUpgrade.results.some((r) => r.description === '訪客時期的測試餐點A') && afterUpgrade.results.some((r) => r.description === '訪客時期的測試餐點B'));
}

// ---- 測試 5：非 guest 不允許升級 ----
async function test5_nonGuestCannotUpgrade() {
  const db = makeMockDb({ users: [{ id: 'already-upgraded-user', is_guest: 0, auth_provider: 'google', auth_provider_id: 'existing-google-id' }] });
  const result = await upgradeIdentity(db, 'already-upgraded-user', 'google', 'another-google-id');

  record('5. 已經是正式會員時，upgradeIdentity 拒絕並回傳 reason=not_guest', result.ok === false && result.reason === 'not_guest');
}

// ---- 測試 6：錯誤 provider 被拒絕 ----
async function test6_invalidProviderRejected() {
  const db = makeMockDb();
  const created = await createGuestIdentity(db, { now: '2026-01-01T00:00:00.000Z' });

  const r1 = await upgradeIdentity(db, created.user_id, 'facebook', 'fb-123');
  record('6. 不支援的provider（facebook）被拒絕', r1.ok === false && r1.reason === 'invalid_provider');

  const r2 = await upgradeIdentity(db, created.user_id, 'google', null);
  record('6. 缺少providerId時被拒絕', r2.ok === false && r2.reason === 'invalid_provider');

  const r3 = await upgradeIdentity(db, created.user_id, '', '');
  record('6. provider為空字串時被拒絕', r3.ok === false && r3.reason === 'invalid_provider');
}

// ---- 測試 7：session revoke 規則正常 ----
async function test7_sessionRevokeRuleWorks() {
  const db = makeMockDb();
  const sessionResult = await createGuestSession(db, { metadata: { now: '2026-01-01T00:00:00.000Z' }, sessionOpts: { now: '2026-01-01T00:00:00.000Z', ttlSeconds: 3600 } });
  const userId = sessionResult.user.id;
  const token = sessionResult.session.token;

  record('7. 升級前，session尚未被撤銷', db._sessions.get(token).revoked_at === null);

  await upgradeIdentity(db, userId, 'google', 'g-55555', { now: '2026-01-01T00:30:00.000Z' });

  record('7. 升級後，該使用者的舊session被撤銷（session關聯規則生效）', db._sessions.get(token).revoked_at === '2026-01-01T00:30:00.000Z');
  record('7. revokeAllForUser 確實被呼叫且對象是正確的userId', db.calls.some((c) => c.type === 'sessions.revokeAllForUser' && c.userId === userId));
}

async function main() {
  await test1_createGuestUserSuccess();
  await test2_createGuestSessionSuccess();
  await test3_upgradeKeepsUserId();
  await test4_historicalDataStillLinkedAfterUpgrade();
  await test5_nonGuestCannotUpgrade();
  await test6_invalidProviderRejected();
  await test7_sessionRevokeRuleWorks();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未寫入任何真實使用者資料）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
