/*
 * Phase 1 TASK 1.19｜Authentication Application Service Layer 單元測試
 * 純記憶體，未連線任何資料庫，未寫入任何真實使用者資料。
 *
 * 涵蓋 src/services/auth_application_service.js 的五個函式：
 * createGuestLogin/loginWithProvider/upgradeGuestLogin（重新匯出自TASK1.18/1.18.1）
 * + logout()/getCurrentUser()（TASK1.19新增，組合既有的session層函式）
 */
import assert from 'assert';
import {
  createGuestLogin,
  loginWithProvider,
  upgradeGuestLogin,
  logout,
  getCurrentUser,
} from '../../src/services/auth_application_service.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

function makeMockDb(opts) {
  opts = opts || {};
  const users = new Map((opts.users || []).map((u) => [u.id, Object.assign({}, u)]));
  const sessions = new Map((opts.sessions || []).map((s) => [s.id, Object.assign({ revoked_at: null }, s)]));
  const calls = [];

  return {
    calls,
    users: {
      async insert(u) {
        calls.push({ type: 'users.insert', u });
        if (opts.failOn === 'users.insert') return { ok: false, error: 'simulated_users_insert_failure' };
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
        if (opts.failOn === 'sessions.insert') return { ok: false, error: 'simulated_sessions_insert_failure' };
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

function cookieToken(cookieStr) {
  const m = cookieStr.match(new RegExp(SESSION_COOKIE_NAME + '=([^;]+)'));
  return m ? m[1] : null;
}

// ---- 1 & 2. Guest login 成功 / Guest session 建立成功 ----
async function test1_2_guestLoginAndSession() {
  const db = makeMockDb();
  const result = await createGuestLogin(db, { metadata: { now: '2026-01-01T00:00:00.000Z' } });

  record('1. Guest login 成功回傳 {ok:true, user, session}', result.ok === true && !!result.user && !!result.session);
  record('1. Guest user 符合規則（is_guest=true, auth_provider=null, status=active）', result.user.is_guest === true && result.user.auth_provider === null && result.user.status === 'active');
  record('2. Guest session 確實建立並回傳cookie', typeof result.cookie === 'string' && result.cookie.indexOf(SESSION_COOKIE_NAME + '=') === 0);
  record('2. Session 確實寫入D1且user_id正確關聯', db._sessions.get(cookieToken(result.cookie)).user_id === result.user.id);

  // guest建立失敗時不可建立session
  const dbFail = makeMockDb({ failOn: 'users.insert' });
  const failResult = await createGuestLogin(dbFail);
  record('Guest建立失敗時不會留下半完成狀態（不建立session）', failResult.ok === false && !dbFail.calls.some((c) => c.type === 'sessions.insert'));
}

// ---- 3. Provider login 找到既有 user ----
async function test3_providerLoginExistingUser() {
  const db = makeMockDb({ users: [{ id: 'u-existing', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-existing', status: 'active', display_name: '既有使用者' }] });
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-existing' }, { now: '2026-03-01T00:00:00.000Z' });

  record('3. Provider login 找到既有user並成功登入', result.ok === true && result.user.id === 'u-existing');
  record('3. 找到既有user時created標記為false', result.created === false);
  record('3. 既有user登入時正確更新last_login_at', db._users.get('u-existing').last_login_at === '2026-03-01T00:00:00.000Z');
}

// ---- 4. Provider login 建立新 user ----
async function test4_providerLoginNewUser() {
  const db = makeMockDb();
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-brand-new', display_name: '全新使用者' });

  record('4. Provider login 對全新identity建立新user', result.ok === true && result.created === true);
  record('4. 新user為正式會員（is_guest=false）而非訪客', result.user.is_guest === false);
  record('4. 新user的display_name正確帶入', result.user.display_name === '全新使用者');
  record('4. 新user第一次登入不會呼叫touchLogin', !db.calls.some((c) => c.type === 'users.touchLogin'));
}

// ---- 5. Suspended user login 被拒絕 ----
async function test5_suspendedUserLoginRejected() {
  const db = makeMockDb({ users: [{ id: 'u-suspended', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-suspended', status: 'suspended' }] });
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-suspended' });

  record('5. Suspended user login 被拒絕', result.ok === false && result.reason === 'user_suspended');
  record('5. Suspended user 被拒絕時完全沒有建立session', !db.calls.some((c) => c.type === 'sessions.insert'));
}

// ---- 6. Deleted user login 被拒絕 ----
async function test6_deletedUserLoginRejected() {
  const db = makeMockDb({ users: [{ id: 'u-deleted', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-deleted', status: 'deleted' }] });
  const result = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-deleted' });

  record('6. Deleted user login 被拒絕', result.ok === false && result.reason === 'user_deleted');
  record('6. Deleted user 被拒絕時完全沒有建立session', !db.calls.some((c) => c.type === 'sessions.insert'));
}

// ---- 7 & 8. Guest upgrade 保留user_id / revoke舊session ----
async function test7_8_guestUpgrade() {
  const db = makeMockDb();
  const guestResult = await createGuestLogin(db, { metadata: { now: '2026-01-01T00:00:00.000Z' }, sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  const guestUserId = guestResult.user.id;
  const oldToken = cookieToken(guestResult.cookie);

  const upgradeResult = await upgradeGuestLogin(db, guestUserId, { auth_provider: 'google', auth_provider_id: 'g-upgrade' }, { now: '2026-01-02T00:00:00.000Z', sessionOpts: { now: '2026-01-02T00:00:00.000Z' } });

  record('7. Guest upgrade 成功', upgradeResult.ok === true);
  record('7. Guest upgrade 保留原user_id（升級前後完全相同）', upgradeResult.user.id === guestUserId);
  record('7. 升級後is_guest變為0、auth_provider正確', upgradeResult.user.is_guest === 0 && upgradeResult.user.auth_provider === 'google');
  record('7. 整個資料庫仍然只有1個user（未建立新user）', db._users.size === 1);

  record('8. 升級後訪客時期的舊session已被撤銷', db._sessions.get(oldToken).revoked_at !== null);
  const newToken = cookieToken(upgradeResult.cookie);
  record('8. 升級後產生新session且與舊session不同', newToken !== oldToken && db._sessions.get(newToken).revoked_at === null);
}

// ---- 9. Provider duplicate 被拒絕 ----
async function test9_providerDuplicateRejected() {
  const db = makeMockDb({ users: [{ id: 'u-taken', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-taken', status: 'active' }] });
  const guestResult = await createGuestLogin(db, { metadata: { now: '2026-01-01T00:00:00.000Z' } });

  const result = await upgradeGuestLogin(db, guestResult.user.id, { auth_provider: 'google', auth_provider_id: 'g-taken' });
  record('9. Provider已被其他user綁定時，upgrade被拒絕', result.ok === false && result.reason === 'provider_already_linked');
  record('9. 被拒絕後資料庫仍然只有原本的2個user（訪客+既有provider user），沒有產生錯誤的綁定', db._users.size === 2 && db._users.get(guestResult.user.id).auth_provider === null);

  // 同一組provider identity透過loginWithProvider重複登入也不會建立第二個user
  const first = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-no-dup-app' });
  const second = await loginWithProvider(db, { auth_provider: 'google', auth_provider_id: 'g-no-dup-app' });
  record('9. 同一組provider identity兩次登入回傳相同user_id（不重複建立）', first.user.id === second.user.id);
  record('9. 只呼叫了1次users.insert來建立這組provider identity', db.calls.filter((c) => c.type === 'users.insert' && c.u.auth_provider_id === 'g-no-dup-app').length === 1);
}

// ---- 10. Logout 成功 ----
async function test10_logoutSuccess() {
  const db = makeMockDb();
  const loginResult = await createGuestLogin(db, { sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  const token = cookieToken(loginResult.cookie);

  const logoutResult = await logout(db, loginResult.cookie, { now: '2026-01-01T02:00:00.000Z' });
  record('10. Logout 成功並回傳ok:true', logoutResult.ok === true);
  record('10. Logout 回傳清除用的cookie（Max-Age=0）', /Max-Age=0/.test(logoutResult.cookie));
  record('10. Logout 前session確實是有效的（wasValid=true）', logoutResult.wasValid === true);
  record('10. Logout 後該session已在D1標記為撤銷', db._sessions.get(token).revoked_at === '2026-01-01T02:00:00.000Z');

  // 登出後用同一個cookie應該無法再取得目前使用者
  const afterLogout = await getCurrentUser(db, loginResult.cookie, { now: '2026-01-01T03:00:00.000Z' });
  record('10. Logout 後用同一個cookie呼叫getCurrentUser應被拒絕', afterLogout.ok === false && afterLogout.reason === 'revoked');

  // 對沒有cookie的請求登出也要優雅處理（不報錯）
  const noCookieLogout = await logout(db, null);
  record('10. 對沒有cookie的請求登出，優雅處理且wasValid=false', noCookieLogout.ok === true && noCookieLogout.wasValid === false);
}

// ---- 11. Invalid cookie 拒絕 ----
async function test11_invalidCookieRejected() {
  const db = makeMockDb();

  const noCookieResult = await getCurrentUser(db, null);
  record('11. 沒有cookie時getCurrentUser拒絕，reason=no_cookie', noCookieResult.ok === false && noCookieResult.reason === 'no_cookie');

  const wrongTokenResult = await getCurrentUser(db, SESSION_COOKIE_NAME + '=this-token-does-not-exist-anywhere');
  record('11. cookie帶著不存在的token時拒絕，reason=not_found', wrongTokenResult.ok === false && wrongTokenResult.reason === 'not_found');

  const malformedResult = await getCurrentUser(db, 'completely_unrelated_cookie=xyz');
  record('11. cookie完全不含session名稱時拒絕，reason=no_cookie', malformedResult.ok === false && malformedResult.reason === 'no_cookie');
}

// ---- 12. Session expired 拒絕 ----
async function test12_sessionExpiredRejected() {
  const db = makeMockDb();
  const loginResult = await createGuestLogin(db, { sessionOpts: { now: '2026-01-01T00:00:00.000Z', ttlSeconds: 3600 } });

  // 在有效期內應該正常
  const stillValid = await getCurrentUser(db, loginResult.cookie, { now: '2026-01-01T00:30:00.000Z' });
  record('12. 有效期內getCurrentUser正常回傳user', stillValid.ok === true && stillValid.user.id === loginResult.user.id);

  // 超過有效期後應該被拒絕
  const expiredResult = await getCurrentUser(db, loginResult.cookie, { now: '2026-01-01T02:00:00.000Z' });
  record('12. 超過有效期後getCurrentUser拒絕，reason=expired', expiredResult.ok === false && expiredResult.reason === 'expired');
}

// ---- 額外：getCurrentUser 對 suspended/deleted 使用者也要拒絕（session本身合法但user狀態不允許）----
async function testExtra_getCurrentUserRejectsInactiveStatus() {
  const db = makeMockDb();
  const loginResult = await createGuestLogin(db, { sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  db._users.get(loginResult.user.id).status = 'suspended';

  const result = await getCurrentUser(db, loginResult.cookie, { now: '2026-01-01T00:10:00.000Z' });
  record('額外：session本身有效但user被停權時，getCurrentUser拒絕', result.ok === false && result.reason === 'user_suspended');
}

async function main() {
  await test1_2_guestLoginAndSession();
  await test3_providerLoginExistingUser();
  await test4_providerLoginNewUser();
  await test5_suspendedUserLoginRejected();
  await test6_deletedUserLoginRejected();
  await test7_8_guestUpgrade();
  await test9_providerDuplicateRejected();
  await test10_logoutSuccess();
  await test11_invalidCookieRejected();
  await test12_sessionExpiredRejected();
  await testExtra_getCurrentUserRejectsInactiveStatus();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未建立任何真實使用者session）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
