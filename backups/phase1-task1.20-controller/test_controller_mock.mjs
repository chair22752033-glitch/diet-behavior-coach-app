/*
 * Phase 1 TASK 1.20｜API Controller Layer 單元測試
 * 純記憶體，未連線任何資料庫，未建立任何真實使用者 session。
 *
 * 涵蓋 src/controllers/{response,auth_controller,user_controller}.js
 */
import assert from 'assert';
import fs from 'fs';
import { success, failure } from '../../src/controllers/response.js';
import { loginGuestController, loginProviderController, logoutController, currentUserController } from '../../src/controllers/auth_controller.js';
import { getUserByIdController } from '../../src/controllers/user_controller.js';
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
        return { ok: true, meta: {} };
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

// ---- 6. response format 正確（先驗證最底層的格式函式）----
function test6_responseFormat() {
  const s = success({ foo: 'bar' });
  record('6. success() 回傳 {ok:true, data}', s.ok === true && s.data.foo === 'bar');

  const sEmpty = success();
  record('6. success() 不帶參數時 data 預設為空物件', sEmpty.ok === true && typeof sEmpty.data === 'object' && Object.keys(sEmpty.data).length === 0);

  const f = failure('some_reason', 404);
  record('6. failure() 回傳 {ok:false, reason, status}', f.ok === false && f.reason === 'some_reason' && f.status === 404);

  const fNoStatus = failure('another_reason');
  record('6. failure() 不帶status時，回傳物件不含status欄位', fNoStatus.ok === false && fNoStatus.reason === 'another_reason' && !('status' in fNoStatus));

  const fDefault = failure();
  record('6. failure() 不帶任何參數時reason有預設值，不會是undefined', typeof fDefault.reason === 'string' && fDefault.reason.length > 0);
}

// ---- 1. guest controller 成功 ----
async function test1_guestControllerSuccess() {
  const db = makeMockDb();
  const result = await loginGuestController(db, {}, { sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });

  record('1. loginGuestController 成功回傳 {ok:true, data}', result.ok === true && !!result.data);
  record('1. data 內含 user/session/cookie', !!result.data.user && !!result.data.session && typeof result.data.cookie === 'string');
  record('1. 建立的user符合guest規則', result.data.user.is_guest === true && result.data.user.auth_provider === null);
  record('1. cookie格式正確', result.data.cookie.indexOf(SESSION_COOKIE_NAME + '=') === 0);
}

// ---- 2. provider controller 成功 ----
// 注意：TASK1.32（Enable Provider Authentication API Route）正式啟用
// POST /auth/provider 時，把 loginProviderController 的外部payload欄位
// 命名從 {auth_provider, auth_provider_id, display_name} 改成跟TASK1.31
// upgrade端點一致的 {provider, providerId, displayName}（controller內部
// 才轉換成identity層慣用的snake_case）——這是TASK1.32明確的規格要求，
// 不是回歸，這裡的呼叫方式已同步更新。
async function test2_providerControllerSuccess() {
  const db = makeMockDb();
  const result = await loginProviderController(db, { provider: 'google', providerId: 'g-ctrl-test', displayName: 'Controller測試使用者' });

  record('2. loginProviderController 成功回傳 {ok:true, data}', result.ok === true);
  record('2. data 內含新建立的user與session', !!result.data.user && !!result.data.session);
  record('2. 新使用者created標記為true', result.data.created === true);
  record('2. display_name正確帶入', result.data.user.display_name === 'Controller測試使用者');

  // 再次呼叫同一組provider identity應該回傳既有使用者（不重複建立）
  const second = await loginProviderController(db, { provider: 'google', providerId: 'g-ctrl-test' });
  record('2. 重複呼叫同一組provider identity回傳既有user（created:false）', second.ok === true && second.data.created === false && second.data.user.id === result.data.user.id);
}

// ---- 3. logout controller ----
async function test3_logoutController() {
  const db = makeMockDb();
  const loginResult = await loginGuestController(db, {}, { sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  const cookie = loginResult.data.cookie;

  const logoutResult = await logoutController(db, cookie, { now: '2026-01-01T01:00:00.000Z' });
  record('3. logoutController 成功回傳 {ok:true, data}', logoutResult.ok === true);
  record('3. data 內含清除用的cookie（Max-Age=0）', /Max-Age=0/.test(logoutResult.data.cookie));
  record('3. data 內含wasValid=true（登出前session確實有效）', logoutResult.data.wasValid === true);
  record('3. 登出後該session已在D1標記撤銷', db._sessions.get(cookieToken(cookie)).revoked_at !== null);

  // 對沒有cookie的請求登出也要優雅處理
  const noCookieLogout = await logoutController(db, null);
  record('3. 對沒有cookie的請求登出仍回傳ok:true（優雅處理）', noCookieLogout.ok === true && noCookieLogout.data.wasValid === false);
}

// ---- 4. current user controller ----
async function test4_currentUserController() {
  const db = makeMockDb();
  const loginResult = await loginGuestController(db, {}, { sessionOpts: { now: '2026-01-01T00:00:00.000Z' } });
  const cookie = loginResult.data.cookie;

  const meResult = await currentUserController(db, cookie, { now: '2026-01-01T00:10:00.000Z' });
  record('4. currentUserController 成功回傳目前使用者', meResult.ok === true && meResult.data.user.id === loginResult.data.user.id);

  const noCookieResult = await currentUserController(db, null);
  record('4. 沒有cookie時currentUserController拒絕', noCookieResult.ok === false && noCookieResult.reason === 'no_cookie');

  // getUserByIdController（user_controller.js）也一併驗證
  const byIdResult = await getUserByIdController(db, { userId: loginResult.data.user.id });
  record('4. getUserByIdController 依userId正確查到使用者', byIdResult.ok === true && byIdResult.data.user.id === loginResult.data.user.id);
}

// ---- 5. application service error 傳遞 ----
async function test5_applicationServiceErrorPropagation() {
  const db = makeMockDb({ users: [{ id: 'u-suspended-ctrl', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-suspended-ctrl', status: 'suspended' }] });

  const suspendedResult = await loginProviderController(db, { provider: 'google', providerId: 'g-suspended-ctrl' });
  record('5. Application service的suspended拒絕正確傳遞到controller層', suspendedResult.ok === false && suspendedResult.reason === 'user_suspended');
  record('5. suspended情況下controller回傳status=401', suspendedResult.status === 401);

  const dbFail = makeMockDb({ failOn: 'users.insert' });
  const guestFailResult = await loginGuestController(dbFail, {});
  record('5. guest建立失敗時application service的錯誤正確傳遞到controller層', guestFailResult.ok === false && typeof guestFailResult.reason === 'string');
  record('5. guest建立失敗情況下controller回傳status=500', guestFailResult.status === 500);
}

// ---- 7. invalid payload 處理 ----
async function test7_invalidPayloadHandling() {
  const db = makeMockDb();

  const nullPayloadResult = await loginProviderController(db, null);
  record('7. loginProviderController對null payload安全拒絕', nullPayloadResult.ok === false && nullPayloadResult.reason === 'invalid_payload' && nullPayloadResult.status === 400);

  const emptyPayloadResult = await loginProviderController(db, {});
  record('7. loginProviderController對缺少必要欄位的payload安全拒絕（透過application層的invalid_identity）', emptyPayloadResult.ok === false);

  const stringPayloadResult = await loginProviderController(db, 'not-an-object');
  record('7. loginProviderController對非物件型別的payload安全拒絕而非拋例外', stringPayloadResult.ok === false && stringPayloadResult.reason === 'invalid_payload');

  const userCtrlInvalid = await getUserByIdController(db, {});
  record('7. getUserByIdController缺少userId時安全拒絕', userCtrlInvalid.ok === false && userCtrlInvalid.reason === 'invalid_payload');

  const userCtrlNull = await getUserByIdController(db, null);
  record('7. getUserByIdController對null payload安全拒絕而非拋例外', userCtrlNull.ok === false && userCtrlNull.status === 400);

  record('7. 全部異常輸入測試後，資料庫完全沒有任何user被建立', db._users.size === 0);
}

// ---- 8. controller 不直接操作 DB ----
function test8_controllerDoesNotTouchDbDirectly() {
  const files = ['../../src/controllers/response.js', '../../src/controllers/auth_controller.js', '../../src/controllers/user_controller.js'].map((p) => new URL(p, import.meta.url).pathname);

  const forbiddenPatterns = [
    /\bdb\.prepare\s*\(/,
    /\bdb\.run\s*\(/,
    /\bdb\.all\s*\(/,
    /\bdb\.first\s*\(/,
    /\bdb\.batch\s*\(/,
    /\bdb\.raw\b/,
    /from ['"]\.\.\/db\//,
    /from ['"]\.\.\/oauth\//,
    /from ['"]\.\.\/auth\/session\.js['"]/,
    /from ['"]\.\.\/identity\/session_rules\.js['"]/,
    /INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|SELECT .* FROM/i,
  ];

  let allClean = true;
  const violations = [];
  for (const filePath of files) {
    // 先去除 /* ... */ 區塊註解再掃描，避免像本檔案這種「用註解說明禁止事項」
    // 的文字（例如「❌ db.prepare()」這種說明性文字）被誤判成真的呼叫了它
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(codeOnly)) {
        allClean = false;
        violations.push(filePath.split('/').pop() + ' matched ' + pattern);
      }
    }
  }
  record('8. 原始碼掃描：controller層完全沒有SQL/db.prepare()/D1直接操作/OAuth流程/session邏輯的import或呼叫', allClean, violations.join('; '));
}

async function main() {
  test6_responseFormat();
  await test1_guestControllerSuccess();
  await test2_providerControllerSuccess();
  await test3_logoutController();
  await test4_currentUserController();
  await test5_applicationServiceErrorPropagation();
  await test7_invalidPayloadHandling();
  test8_controllerDoesNotTouchDbDirectly();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未建立任何真實使用者session）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
