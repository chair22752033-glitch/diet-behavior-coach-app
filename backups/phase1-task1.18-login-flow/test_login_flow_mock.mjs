/*
 * Phase 1 TASK 1.18｜Login Flow Service 單元測試（純記憶體，未連線任何資料庫）
 *
 * 涵蓋 src/services/auth_service.js（createGuestLogin/loginWithProvider/
 * upgradeGuestLogin）、src/identity/login_identity.js、src/auth/login_session.js，
 * 完全用假的 D1 binding，完全不寫入任何真實使用者資料。
 */
import assert from 'assert';
import { createGuestLogin, loginWithProvider, upgradeGuestLogin } from '../../src/services/auth_service.js';
import { resolveLoginIdentity } from '../../src/identity/login_identity.js';
import { loginSession, logoutSession } from '../../src/auth/login_session.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

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

// ---- Guest Flow ----
async function testGuestFlow() {
  const db = makeMockDb();
  const result = await createGuestLogin(db, { metadata: { now: '2026-01-01T00:00:00.000Z' }, sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });

  record('Guest: createGuestLogin 成功並回傳 {user, session, cookie}', result.ok === true && !!result.user && !!result.session && typeof result.cookie === 'string');
  record('Guest: 建立的user是訪客（is_guest=true, auth_provider=null）', result.user.is_guest === true && result.user.auth_provider === null);
  record('Guest: user status為active', result.user.status === 'active');
  record('Guest: cookie包含正確的cookie名稱', result.cookie.indexOf(SESSION_COOKIE_NAME + '=') === 0);
  record('Guest: cookie帶有HttpOnly/Secure/SameSite安全旗標', /HttpOnly/.test(result.cookie) && /Secure/.test(result.cookie) && /SameSite=Lax/.test(result.cookie));

  const token = cookieToken(result.cookie);
  record('Guest: session確實寫入D1且user_id正確關聯', db._sessions.get(token).user_id === result.user.id);

  // 失敗路徑：guest user建立失敗時，不應該繼續嘗試建立session
  const dbFail = makeMockDb({ failOn: 'users.insert' });
  const failResult = await createGuestLogin(dbFail);
  record('Guest: guest建立失敗時createGuestLogin正確回傳ok:false', failResult.ok === false);
  record('Guest: guest建立失敗時完全沒有嘗試建立session', !dbFail.calls.some((c) => c.type === 'sessions.insert'));
}

// ---- Provider Flow（第一次登入：建立新使用者）----
async function testProviderFlowNewUser() {
  const db = makeMockDb();
  const identity = { auth_provider: 'google', auth_provider_id: 'g-first-time-user', email: 'first@example.com', display_name: '第一次登入的使用者' };

  const result = await loginWithProvider(db, identity, { now: '2026-01-01T00:00:00.000Z', sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });

  record('Provider(新使用者): loginWithProvider成功', result.ok === true);
  record('Provider(新使用者): created標記為true', result.created === true);
  record('Provider(新使用者): 建立的user是正式會員(is_guest=false)', result.user.is_guest === false);
  record('Provider(新使用者): auth_provider/auth_provider_id正確', result.user.auth_provider === 'google' && result.user.auth_provider_id === 'g-first-time-user');
  record('Provider(新使用者): display_name正確帶入', result.user.display_name === '第一次登入的使用者');
  record('Provider(新使用者): 正確回傳session與cookie', !!result.session && result.cookie.indexOf(SESSION_COOKIE_NAME + '=') === 0);
  record('Provider(新使用者): 新使用者第一次登入不應呼叫touchLogin（尚未存在過，沒有「上次登入」可更新）', !db.calls.some((c) => c.type === 'users.touchLogin'));
}

// ---- Provider Flow（再次登入：既有使用者，防重複建立）----
async function testProviderFlowExistingUser() {
  const db = makeMockDb();
  const identity = { auth_provider: 'google', auth_provider_id: 'g-repeat-user', display_name: 'X' };

  const first = await loginWithProvider(db, identity, { now: '2026-01-01T00:00:00.000Z' });
  const second = await loginWithProvider(db, identity, { now: '2026-02-01T00:00:00.000Z' });

  record('Provider(再次登入): 兩次登入回傳完全相同的user_id（不會建立第二個帳號）', first.user.id === second.user.id);
  record('Provider(再次登入): 第二次登入created標記為false', second.created === false);
  record('Provider(再次登入): 資料庫裡只有1個user（禁止重複建立）', db._users.size === 1);
  record('Provider(再次登入): 第二次登入正確更新last_login_at', db._users.get(first.user.id).last_login_at === '2026-02-01T00:00:00.000Z');
  record('Provider(再次登入): 每次登入都建立了獨立的新session（總共2筆）', db._sessions.size === 2);
}

// ---- Provider Flow 錯誤情境 ----
async function testProviderFlowInvalid() {
  const db = makeMockDb();

  const r1 = await loginWithProvider(db, { auth_provider: 'google' }, {}); // 缺 auth_provider_id
  record('Provider(錯誤): 缺少auth_provider_id時拒絕', r1.ok === false && r1.reason === 'invalid_identity');

  const r2 = await loginWithProvider(db, null, {});
  record('Provider(錯誤): identity為null時安全拒絕而非拋例外', r2.ok === false && r2.reason === 'invalid_identity');

  record('Provider(錯誤): 兩次無效呼叫都沒有建立任何user', db._users.size === 0);
}

// ---- Upgrade Flow ----
async function testUpgradeFlow() {
  const db = makeMockDb();

  // 先用guest flow建立一個訪客，並讓他累積一些「歷史活動」（用一筆舊session模擬）
  const guestResult = await createGuestLogin(db, { metadata: { now: '2026-01-01T00:00:00.000Z' }, sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  const guestUserId = guestResult.user.id;
  const oldSessionToken = cookieToken(guestResult.cookie);

  record('Upgrade: 升級前，訪客的舊session尚未被撤銷', db._sessions.get(oldSessionToken).revoked_at === null);

  const upgradeResult = await upgradeGuestLogin(db, guestUserId, { auth_provider: 'google', auth_provider_id: 'g-upgrade-user' }, { now: '2026-01-02T00:00:00.000Z', sessionOpts: { now: '2026-01-02T00:00:00.000Z' } });

  record('Upgrade: upgradeGuestLogin成功', upgradeResult.ok === true);
  record('Upgrade: user_id升級前後完全相同', upgradeResult.user.id === guestUserId);
  record('Upgrade: 升級後is_guest變為0（已非訪客）', upgradeResult.user.is_guest === 0);
  record('Upgrade: 升級後auth_provider/auth_provider_id正確', upgradeResult.user.auth_provider === 'google' && upgradeResult.user.auth_provider_id === 'g-upgrade-user');
  record('Upgrade: 升級後正確產生新session與cookie', !!upgradeResult.session && upgradeResult.cookie.indexOf(SESSION_COOKIE_NAME + '=') === 0);

  record('Upgrade: 升級後，訪客時期的舊session已被撤銷（session關聯規則）', db._sessions.get(oldSessionToken).revoked_at !== null);
  const newSessionToken = cookieToken(upgradeResult.cookie);
  record('Upgrade: 新session與舊session是不同的token', newSessionToken !== oldSessionToken);
  record('Upgrade: 新session未被撤銷，可正常使用', db._sessions.get(newSessionToken).revoked_at === null);
  record('Upgrade: 整個資料庫仍然只有1個user（沒有另外建立新帳號）', db._users.size === 1);
}

// ---- Upgrade Flow 錯誤情境（沿用TASK1.14既有規則）----
async function testUpgradeFlowInvalid() {
  const db = makeMockDb({ users: [{ id: 'already-a-member', is_guest: 0, auth_provider: 'google', auth_provider_id: 'existing-id', status: 'active' }] });

  const r1 = await upgradeGuestLogin(db, 'already-a-member', { auth_provider: 'google', auth_provider_id: 'another-id' });
  record('Upgrade(錯誤): 已經是正式會員時拒絕升級（reason=not_guest）', r1.ok === false && r1.reason === 'not_guest');

  const r2 = await upgradeGuestLogin(db, 'no-such-guest', { auth_provider: 'google', auth_provider_id: 'x' });
  record('Upgrade(錯誤): 不存在的guestUserId拒絕（reason=user_not_found）', r2.ok === false && r2.reason === 'user_not_found');

  const r3 = await upgradeGuestLogin(db, 'already-a-member', { auth_provider: 'google' }); // 缺 auth_provider_id
  record('Upgrade(錯誤): providerIdentity不完整時拒絕（reason=invalid_identity）', r3.ok === false && r3.reason === 'invalid_identity');
}

// ---- login_identity.resolveLoginIdentity 直接單元測試 ----
async function testResolveLoginIdentityDirect() {
  const db = makeMockDb();
  const r1 = await resolveLoginIdentity(db, { auth_provider: 'google', auth_provider_id: 'direct-1' });
  record('resolveLoginIdentity: 第一次呼叫建立新user，created=true', r1.ok === true && r1.created === true);

  const r2 = await resolveLoginIdentity(db, { auth_provider: 'google', auth_provider_id: 'direct-1' });
  record('resolveLoginIdentity: 第二次呼叫回傳既有user，created=false，id相同', r2.ok === true && r2.created === false && r2.user.id === r1.user.id);

  const r3 = await resolveLoginIdentity(db, {});
  record('resolveLoginIdentity: 空物件安全拒絕', r3.ok === false && r3.reason === 'invalid_identity');
}

// ---- login_session.loginSession / logoutSession 直接單元測試 ----
async function testLoginSessionDirect() {
  const db = makeMockDb({ users: [{ id: 'direct-session-user', status: 'active' }] });

  const noUserResult = await loginSession(db, null);
  record('loginSession: user為null時安全拒絕', noUserResult.ok === false && noUserResult.error === 'missing_user');

  const loginResult = await loginSession(db, { id: 'direct-session-user' }, { sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  record('loginSession: 成功建立session並回傳cookie', loginResult.ok === true && typeof loginResult.cookie === 'string');

  const logoutResult = await logoutSession(db, loginResult.cookie, { now: '2026-01-01T01:00:00.000Z' });
  record('logoutSession: 成功登出並回傳清除用的cookie（Max-Age=0）', logoutResult.ok === true && /Max-Age=0/.test(logoutResult.cookie));

  const token = cookieToken(loginResult.cookie);
  record('logoutSession: 登出後該session已被標記為撤銷', db._sessions.get(token).revoked_at === '2026-01-01T01:00:00.000Z');

  const logoutNoCookie = await logoutSession(db, null);
  record('logoutSession: 沒有cookie時優雅處理不報錯', logoutNoCookie.ok === true);
}

async function main() {
  await testGuestFlow();
  await testProviderFlowNewUser();
  await testProviderFlowExistingUser();
  await testProviderFlowInvalid();
  await testUpgradeFlow();
  await testUpgradeFlowInvalid();
  await testResolveLoginIdentityDirect();
  await testLoginSessionDirect();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未寫入任何真實使用者資料）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
