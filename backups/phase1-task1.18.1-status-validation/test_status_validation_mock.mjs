/*
 * Phase 1 TASK 1.18.1｜Login Flow Identity Status Validation 修正 - 單元測試
 * 純記憶體，未連線任何資料庫，未寫入任何真實使用者資料。
 *
 * 專門驗證 TASK1.18 code review 發現的缺口已修正：
 * - loginWithProvider() 對既有使用者不再略過 status 檢查
 * - upgradeGuestLogin() 對訪客不再略過 status 檢查
 */
import assert from 'assert';
import { createGuestLogin, loginWithProvider, upgradeGuestLogin } from '../../src/services/auth_service.js';
import { resolveLoginIdentity } from '../../src/identity/login_identity.js';
import { upgradeGuestToProvider } from '../../src/identity/upgrade.js';

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

function makeMockDb(opts) {
  opts = opts || {};
  const users = new Map((opts.users || []).map((u) => [u.id, Object.assign({}, u)]));
  const sessions = new Map();
  const calls = [];

  return {
    calls,
    users: {
      async insert(u) {
        calls.push({ type: 'users.insert', u });
        users.set(u.id, Object.assign({}, u));
        return { ok: true, meta: {} };
      },
      async getById(id) {
        calls.push({ type: 'users.getById', id });
        return { ok: true, row: users.get(id) || null };
      },
      async getByProvider(provider, providerId) {
        calls.push({ type: 'users.getByProvider', provider, providerId });
        for (const u of users.values()) if (u.auth_provider === provider && u.auth_provider_id === providerId) return { ok: true, row: u };
        return { ok: true, row: null };
      },
      async touchLogin(id, lastLoginAt) {
        calls.push({ type: 'users.touchLogin', id, lastLoginAt });
        const u = users.get(id);
        if (u) u.last_login_at = lastLoginAt;
        return { ok: true, meta: {} };
      },
      async upgradeToProvider(id, provider, providerId, updatedAt) {
        calls.push({ type: 'users.upgradeToProvider', id, provider, providerId });
        const u = users.get(id);
        if (u) { u.auth_provider = provider; u.auth_provider_id = providerId; u.is_guest = 0; u.updated_at = updatedAt; }
        return { ok: true, meta: {} };
      },
    },
    sessions: {
      async insert(s) {
        calls.push({ type: 'sessions.insert', s });
        sessions.set(s.id, Object.assign({ revoked_at: null }, s));
        return { ok: true, meta: {} };
      },
      async getById(id) {
        calls.push({ type: 'sessions.getById', id });
        return { ok: true, row: sessions.get(id) || null };
      },
      async revoke(id, revokedAt) {
        calls.push({ type: 'sessions.revoke', id });
        const s = sessions.get(id);
        if (s) s.revoked_at = revokedAt;
        return { ok: true, meta: {} };
      },
      async revokeAllForUser(userId, revokedAt) {
        calls.push({ type: 'sessions.revokeAllForUser', userId });
        let n = 0;
        for (const s of sessions.values()) if (s.user_id === userId && !s.revoked_at) { s.revoked_at = revokedAt; n++; }
        return { ok: true, meta: { changes: n } };
      },
    },
    _users: users,
    _sessions: sessions,
  };
}

// ---- 1. active user login PASS ----
async function test1_activeUserLoginPass() {
  const db = makeMockDb({ users: [{ id: 'u-active', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-active', status: 'active' }] });
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-active' });
  record('1. active user 透過 loginWithProvider 成功登入', result.ok === true);
  record('1. active user 正確取得session與cookie', !!result.session && typeof result.cookie === 'string');
}

// ---- 2. suspended user login FAIL ----
async function test2_suspendedUserLoginFail() {
  const db = makeMockDb({ users: [{ id: 'u-suspended', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-suspended', status: 'suspended' }] });
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-suspended' });
  record('2. suspended user 登入被拒絕', result.ok === false);
  record('2. suspended user 拒絕原因正確為 user_suspended', result.reason === 'user_suspended');
}

// ---- 3. deleted user login FAIL ----
async function test3_deletedUserLoginFail() {
  const db = makeMockDb({ users: [{ id: 'u-deleted', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-deleted', status: 'deleted' }] });
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-deleted' });
  record('3. deleted user 登入被拒絕', result.ok === false);
  record('3. deleted user 拒絕原因正確為 user_deleted', result.reason === 'user_deleted');
}

// ---- 4. suspended guest upgrade FAIL ----
async function test4_suspendedGuestUpgradeFail() {
  const db = makeMockDb({ users: [{ id: 'guest-suspended', is_guest: 1, auth_provider: null, auth_provider_id: null, status: 'suspended' }] });
  const result = await upgradeGuestLogin(db, 'guest-suspended', { auth_provider: 'google', auth_provider_id: 'g-new-1' });
  record('4. suspended guest 升級被拒絕', result.ok === false);
  record('4. suspended guest 拒絕原因正確為 user_suspended', result.reason === 'user_suspended');
  record('4. suspended guest 升級失敗後，users表未被實際修改（auth_provider仍為null）', db._users.get('guest-suspended').auth_provider === null);
}

// ---- 5. deleted guest upgrade FAIL ----
async function test5_deletedGuestUpgradeFail() {
  const db = makeMockDb({ users: [{ id: 'guest-deleted', is_guest: 1, auth_provider: null, auth_provider_id: null, status: 'deleted' }] });
  const result = await upgradeGuestLogin(db, 'guest-deleted', { auth_provider: 'google', auth_provider_id: 'g-new-2' });
  record('5. deleted guest 升級被拒絕', result.ok === false);
  record('5. deleted guest 拒絕原因正確為 user_deleted', result.reason === 'user_deleted');
}

// ---- 6. session 不會建立 ----
async function test6_noSessionCreatedOnRejection() {
  const db = makeMockDb({
    users: [
      { id: 'u-suspended-2', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-suspended-2', status: 'suspended' },
      { id: 'guest-deleted-2', is_guest: 1, auth_provider: null, auth_provider_id: null, status: 'deleted' },
    ],
  });

  await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-suspended-2' });
  await upgradeGuestLogin(db, 'guest-deleted-2', { auth_provider: 'google', auth_provider_id: 'g-new-3' });

  record('6. 兩種被拒絕的情境皆完全沒有呼叫 sessions.insert（不會建立任何session）', !db.calls.some((c) => c.type === 'sessions.insert'));
  record('6. 資料庫裡完全沒有任何session被建立', db._sessions.size === 0);
  record('6. suspended user 也沒有被觸發 touchLogin（在resolveLoginIdentity就被擋下，不會走到後續步驟）', !db.calls.some((c) => c.type === 'users.touchLogin'));
}

// ---- 7. provider identity 不重複建立 ----
async function test7_noDuplicateProviderUser() {
  const db = makeMockDb();

  // 先用同一組provider identity成功登入一次（建立新user）
  const first = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-no-dup' }, { now: '2026-01-01T00:00:00.000Z' });
  record('7. 第一次登入成功建立新user', first.ok === true && first.created === true);

  // 之後這個user被停權
  const userId = first.user.id;
  db._users.get(userId).status = 'suspended';

  // 再次用同一組provider identity登入，應該被status擋下，但「不會」因為擋下而誤觸發建立第二個重複user
  const second = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-no-dup' }, { now: '2026-02-01T00:00:00.000Z' });
  record('7. 停權後再次登入被拒絕', second.ok === false && second.reason === 'user_suspended');
  record('7. 資料庫裡仍然只有1個user（沒有因為第二次呼叫而重複建立）', db._users.size === 1);
  record('7. 沒有任何一次insert是重複建立同一組provider identity', db.calls.filter((c) => c.type === 'users.insert').length === 1);
}

// ---- 8. 原有 TASK1.18 測試全部 PASS（在本檔案內額外驗證關鍵正向流程仍正常）----
async function test8_originalFlowsStillWork() {
  const db = makeMockDb();

  const guestResult = await createGuestLogin(db, { metadata: { now: '2026-01-01T00:00:00.000Z' } });
  record('8. createGuestLogin（正向流程）依然正常運作', guestResult.ok === true && guestResult.user.status === 'active');

  const providerResult = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-still-works' });
  record('8. loginWithProvider（正向流程，全新使用者）依然正常運作', providerResult.ok === true && providerResult.created === true);

  const upgradeResult = await upgradeGuestLogin(db, guestResult.user.id, { auth_provider: 'google', auth_provider_id: 'g-upgrade-still-works' });
  record('8. upgradeGuestLogin（正向流程，active訪客）依然正常運作，user_id不變', upgradeResult.ok === true && upgradeResult.user.id === guestResult.user.id);

  // resolveLoginIdentity / upgradeGuestToProvider 直接呼叫也一併確認
  const directResolve = await resolveLoginIdentity(db, { auth_provider: 'google', auth_provider_id: 'g-still-works' });
  record('8. resolveLoginIdentity 對active既有使用者直接呼叫依然正常', directResolve.ok === true && directResolve.created === false);
}

async function main() {
  await test1_activeUserLoginPass();
  await test2_suspendedUserLoginFail();
  await test3_deletedUserLoginFail();
  await test4_suspendedGuestUpgradeFail();
  await test5_deletedGuestUpgradeFail();
  await test6_noSessionCreatedOnRejection();
  await test7_noDuplicateProviderUser();
  await test8_originalFlowsStillWork();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未寫入任何真實使用者資料）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
