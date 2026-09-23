/*
 * Phase 1 TASK 1.13B｜User Identity 基礎架構單元測試（純記憶體，未連線任何資料庫）
 *
 * 涵蓋 src/identity/{status,provider,guest,upgrade,session_rules}.js
 */
import assert from 'assert';
import { USER_STATUS, isValidStatus, isActiveStatus, canLogIn } from '../../src/identity/status.js';
import { SUPPORTED_PROVIDERS, isSupportedProvider, isValidProviderPair } from '../../src/identity/provider.js';
import { createGuestUser, isGuestUser } from '../../src/identity/guest.js';
import { upgradeGuestToProvider } from '../../src/identity/upgrade.js';
import { validateSessionWithIdentity } from '../../src/identity/session_rules.js';

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
      async getById(id) { calls.push({ type: 'sessions.getById', id }); return { ok: true, row: sessions.get(id) || null }; },
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

function testStatusModule() {
  record('USER_STATUS 三種狀態齊全', USER_STATUS.ACTIVE === 'active' && USER_STATUS.SUSPENDED === 'suspended' && USER_STATUS.DELETED === 'deleted');
  record('isValidStatus 接受合法值', isValidStatus('active') && isValidStatus('suspended') && isValidStatus('deleted'));
  record('isValidStatus 拒絕不合法值', !isValidStatus('banned') && !isValidStatus('') && !isValidStatus(undefined));
  record('isActiveStatus 只有active為true', isActiveStatus('active') && !isActiveStatus('suspended') && !isActiveStatus('deleted'));

  const activeUser = { status: 'active' };
  const suspendedUser = { status: 'suspended' };
  const deletedUser = { status: 'deleted' };
  record('canLogIn active使用者允許', canLogIn(activeUser).allowed === true);
  record('canLogIn suspended使用者拒絕且reason正確', canLogIn(suspendedUser).allowed === false && canLogIn(suspendedUser).reason === 'user_suspended');
  record('canLogIn deleted使用者拒絕且reason正確', canLogIn(deletedUser).allowed === false && canLogIn(deletedUser).reason === 'user_deleted');
  record('canLogIn(null) 不拋例外且拒絕', canLogIn(null).allowed === false && canLogIn(null).reason === 'user_not_found');
}

function testProviderModule() {
  record('SUPPORTED_PROVIDERS 目前只有google（guest不算provider）', SUPPORTED_PROVIDERS.indexOf('google') >= 0 && SUPPORTED_PROVIDERS.indexOf('guest') === -1);
  record('isSupportedProvider 接受google', isSupportedProvider('google') === true);
  record('isSupportedProvider 拒絕未知provider', isSupportedProvider('facebook') === false);

  record('isValidProviderPair 兩者皆空時合法（訪客）', isValidProviderPair(null, null) === true);
  record('isValidProviderPair 兩者皆有值時合法', isValidProviderPair('google', 'g-123') === true);
  record('isValidProviderPair 只有provider沒有providerId時不合法', isValidProviderPair('google', null) === false);
  record('isValidProviderPair 只有providerId沒有provider時不合法', isValidProviderPair(null, 'g-123') === false);
  record('isValidProviderPair 空字串視為「沒有值」', isValidProviderPair('', '') === true);
}

function testGuestModule() {
  const g1 = createGuestUser({ now: '2026-01-01T00:00:00.000Z' });
  record('createGuestUser 自動產生id', typeof g1.id === 'string' && g1.id.length > 0);
  record('createGuestUser auth_provider/auth_provider_id皆為null', g1.auth_provider === null && g1.auth_provider_id === null);
  record('createGuestUser is_guest為true', g1.is_guest === true);
  record('createGuestUser status預設為active', g1.status === 'active');
  record('createGuestUser created_at/updated_at使用指定的now', g1.created_at === '2026-01-01T00:00:00.000Z' && g1.updated_at === '2026-01-01T00:00:00.000Z');

  const g2 = createGuestUser({ id: 'custom-id', legacySyncCode: 'sync:4741' });
  record('createGuestUser 可指定id（供legacy import使用）', g2.id === 'custom-id');
  record('createGuestUser 可帶入legacySyncCode', g2.legacy_sync_code === 'sync:4741');

  record('isGuestUser 正確判斷訪客', isGuestUser(g1) === true);
  const upgradedUser = { is_guest: 0, auth_provider: 'google' };
  record('isGuestUser 正確判斷非訪客（已升級）', isGuestUser(upgradedUser) === false);
  record('isGuestUser(null) 不拋例外', isGuestUser(null) === false);
}

async function testUpgradeModule() {
  // 成功案例
  const db1 = makeMockDb({
    users: [{ id: 'u1', is_guest: 1, auth_provider: null, auth_provider_id: null, status: 'active' }],
    sessions: [{ id: 's1', user_id: 'u1' }, { id: 's2', user_id: 'u1' }, { id: 's3', user_id: 'other-user' }],
  });
  const r1 = await upgradeGuestToProvider(db1, 'u1', 'google', 'g-123', { now: '2026-01-01T00:00:00.000Z' });
  record('upgradeGuestToProvider 成功案例回傳ok:true', r1.ok === true);
  record('upgradeGuestToProvider 更新後user的auth_provider/is_guest正確', db1._users.get('u1').auth_provider === 'google' && db1._users.get('u1').is_guest === 0);
  record('upgradeGuestToProvider 撤銷了該user的所有session（session關聯規則）', db1._sessions.get('s1').revoked_at === '2026-01-01T00:00:00.000Z' && db1._sessions.get('s2').revoked_at === '2026-01-01T00:00:00.000Z');
  record('upgradeGuestToProvider 不影響其他user的session', db1._sessions.get('s3').revoked_at === null);

  // 使用者不存在
  const db2 = makeMockDb({});
  const r2 = await upgradeGuestToProvider(db2, 'no-such-user', 'google', 'g-999');
  record('upgradeGuestToProvider 使用者不存在時回傳reason=user_not_found', r2.ok === false && r2.reason === 'user_not_found');

  // 已經不是訪客（已有provider）
  const db3 = makeMockDb({ users: [{ id: 'u2', is_guest: 0, auth_provider: 'google', auth_provider_id: 'existing' }] });
  const r3 = await upgradeGuestToProvider(db3, 'u2', 'google', 'g-456');
  record('upgradeGuestToProvider 已非訪客時回傳reason=not_guest', r3.ok === false && r3.reason === 'not_guest');

  // provider已被別人綁定
  // 注意（TASK1.18.1）：u3 補上 status:'active'——真實的訪客一律由 createGuestUser()
  // 產生，status 必定有值（預設'active'），這裡明確補上以符合真實資料形狀，
  // 才能正確測試「provider_already_linked」而不是被新加入的 status 檢查擋下。
  const db4 = makeMockDb({
    users: [
      { id: 'u3', is_guest: 1, auth_provider: null, auth_provider_id: null, status: 'active' },
      { id: 'u4', is_guest: 0, auth_provider: 'google', auth_provider_id: 'g-taken' },
    ],
  });
  const r4 = await upgradeGuestToProvider(db4, 'u3', 'google', 'g-taken');
  record('upgradeGuestToProvider provider已被別人綁定時回傳reason=provider_already_linked', r4.ok === false && r4.reason === 'provider_already_linked');

  // 不支援的provider
  const db5 = makeMockDb({ users: [{ id: 'u5', is_guest: 1, auth_provider: null, auth_provider_id: null }] });
  const r5 = await upgradeGuestToProvider(db5, 'u5', 'facebook', 'fb-123');
  record('upgradeGuestToProvider 不支援的provider回傳reason=invalid_provider', r5.ok === false && r5.reason === 'invalid_provider');

  // provider/providerId缺一
  const db6 = makeMockDb({ users: [{ id: 'u6', is_guest: 1, auth_provider: null, auth_provider_id: null }] });
  const r6 = await upgradeGuestToProvider(db6, 'u6', 'google', null);
  record('upgradeGuestToProvider providerId缺漏時回傳reason=invalid_provider', r6.ok === false && r6.reason === 'invalid_provider');
}

async function testSessionRulesModule() {
  const activeUser = { id: 'u1', status: 'active' };
  const suspendedUser = { id: 'u2', status: 'suspended' };
  const validSession = { id: 'tok1', user_id: 'u1', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null };
  const suspendedUserSession = { id: 'tok2', user_id: 'u2', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null };

  const db1 = makeMockDb({ users: [activeUser], sessions: [validSession] });
  const r1 = await validateSessionWithIdentity(db1, 'dbc_sid=tok1', { now: '2026-01-01T00:00:00.000Z' });
  record('validateSessionWithIdentity active使用者的有效session通過', r1.ok === true && r1.userId === 'u1');

  const db2 = makeMockDb({ users: [suspendedUser], sessions: [suspendedUserSession] });
  const r2 = await validateSessionWithIdentity(db2, 'dbc_sid=tok2', { now: '2026-01-01T00:00:00.000Z' });
  record('validateSessionWithIdentity session本身有效但使用者被停權時拒絕', r2.ok === false && r2.reason === 'user_suspended');

  const db3 = makeMockDb({ users: [activeUser], sessions: [validSession] });
  const r3 = await validateSessionWithIdentity(db3, null);
  record('validateSessionWithIdentity 沒有cookie時直接透傳session層的reason', r3.ok === false && r3.reason === 'no_cookie');

  // session存在指向的user卻不存在（理論上因為FK CASCADE不該發生，但仍要優雅處理）
  const orphanSession = { id: 'tok3', user_id: 'ghost-user', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null };
  const db4 = makeMockDb({ users: [], sessions: [orphanSession] });
  const r4 = await validateSessionWithIdentity(db4, 'dbc_sid=tok3');
  record('validateSessionWithIdentity session指向不存在的user時安全拒絕', r4.ok === false && r4.reason === 'user_not_found');
}

async function main() {
  testStatusModule();
  testProviderModule();
  testGuestModule();
  await testUpgradeModule();
  await testSessionRulesModule();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未建立OAuth或登入頁面）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
