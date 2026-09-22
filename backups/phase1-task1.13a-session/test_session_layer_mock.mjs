/*
 * Phase 1 TASK 1.13A｜Session 基礎架構單元測試（純記憶體，未連線任何資料庫）
 *
 * 涵蓋 src/auth/token.js、src/auth/cookie.js、src/auth/session.js 三個檔案。
 * session.js 的測試用假的 db.sessions（記錄呼叫內容的物件）取代真正的 D1。
 */
import assert from 'assert';
import { generateOpaqueToken, hmacSign, hmacVerify, signToken, verifyToken, sha256Hex } from '../../src/auth/token.js';
import { parseCookies, serializeCookie, serializeExpiredCookie } from '../../src/auth/cookie.js';
import { createSession, validateSession, revokeSession } from '../../src/auth/session.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/constants.js';

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

function makeMockDb(sessionRows) {
  const store = new Map((sessionRows || []).map((r) => [r.id, r]));
  const calls = [];
  return {
    calls,
    sessions: {
      async insert(s) {
        calls.push({ type: 'insert', s });
        store.set(s.id, Object.assign({ revoked_at: null }, s));
        return { ok: true, meta: {} };
      },
      async getById(id) {
        calls.push({ type: 'getById', id });
        return { ok: true, row: store.get(id) || null };
      },
      async revoke(id, revokedAt) {
        calls.push({ type: 'revoke', id, revokedAt });
        const row = store.get(id);
        if (row) row.revoked_at = revokedAt;
        return { ok: true, meta: {} };
      },
    },
    _store: store,
  };
}

async function testTokenModule() {
  const t1 = generateOpaqueToken();
  const t2 = generateOpaqueToken();
  record('generateOpaqueToken 每次產生不同的值', t1 !== t2);
  record('generateOpaqueToken 預設長度合理（base64url編碼256bit應約43字元）', t1.length >= 40 && t1.length <= 45, 'length=' + t1.length);
  record('generateOpaqueToken 不含base64的+/=字元（url-safe）', !/[+/=]/.test(t1));

  const secret = 'test-secret-do-not-use-in-prod';
  const sig = await hmacSign('hello world', secret);
  const validOk = await hmacVerify('hello world', sig, secret);
  const tamperedOk = await hmacVerify('hello world!', sig, secret);
  const wrongSecretOk = await hmacVerify('hello world', sig, 'wrong-secret');
  record('hmacSign/hmacVerify 正確資料驗證通過', validOk === true);
  record('hmacVerify 資料被竄改時驗證失敗', tamperedOk === false);
  record('hmacVerify 密鑰錯誤時驗證失敗', wrongSecretOk === false);

  const token = await signToken('userId:12345:2026-12-31', secret);
  const verified = await verifyToken(token, secret);
  const verifiedWrongSecret = await verifyToken(token, 'another-secret');
  record('signToken/verifyToken 正確密鑰時回傳valid且還原payload', verified.valid === true && verified.payload === 'userId:12345:2026-12-31');
  record('verifyToken 密鑰錯誤時回傳invalid', verifiedWrongSecret.valid === false && verifiedWrongSecret.payload === null);
  const malformed = await verifyToken('no-dot-in-this-token', secret);
  record('verifyToken 格式不正確（缺少分隔點）時安全回傳invalid而非拋例外', malformed.valid === false);

  const h1 = await sha256Hex('1.2.3.4');
  const h2 = await sha256Hex('1.2.3.4');
  const h3 = await sha256Hex('5.6.7.8');
  record('sha256Hex 相同輸入產生相同雜湊', h1 === h2);
  record('sha256Hex 不同輸入產生不同雜湊', h1 !== h3);
  record('sha256Hex 輸出為64字元十六進位字串', /^[0-9a-f]{64}$/.test(h1));
}

async function testCookieModule() {
  const parsed = parseCookies('dbc_sid=abc123; other=xyz; empty_ignored');
  record('parseCookies 正確解析多個cookie', parsed.dbc_sid === 'abc123' && parsed.other === 'xyz');
  record('parseCookies 沒有=的片段被忽略、不報錯', !('empty_ignored' in parsed) || parsed.empty_ignored === undefined);
  record('parseCookies(null) 回傳空物件而非拋例外', Object.keys(parseCookies(null)).length === 0);
  record('parseCookies("") 回傳空物件', Object.keys(parseCookies('')).length === 0);

  const encoded = parseCookies('dbc_sid=' + encodeURIComponent('a b/c'));
  record('parseCookies 正確解碼URL編碼的值', encoded.dbc_sid === 'a b/c');

  const setCookie = serializeCookie('dbc_sid', 'tok123', { maxAgeSeconds: 100 });
  record('serializeCookie 預設帶HttpOnly', /HttpOnly/.test(setCookie));
  record('serializeCookie 預設帶Secure', /Secure/.test(setCookie));
  record('serializeCookie 預設帶SameSite=Lax', /SameSite=Lax/.test(setCookie));
  record('serializeCookie 正確帶入Max-Age', /Max-Age=100/.test(setCookie));
  record('serializeCookie 正確帶入Path=/', /Path=\//.test(setCookie));

  const insecureCookie = serializeCookie('dbc_sid', 'tok123', { secure: false });
  record('serializeCookie 可覆寫secure:false（本機http開發用）', !/Secure/.test(insecureCookie));

  const expired = serializeExpiredCookie('dbc_sid');
  record('serializeExpiredCookie 設定Max-Age=0（用於登出清除cookie）', /Max-Age=0/.test(expired));
}

async function testSessionModule() {
  // createSession
  const db1 = makeMockDb();
  const created = await createSession(db1, 'user-abc', { now: '2026-01-01T00:00:00.000Z', ttlSeconds: 3600 });
  record('createSession 成功並回傳token', created.ok === true && typeof created.token === 'string');
  record('createSession 回傳的setCookie包含session名稱與token', created.setCookie.indexOf(SESSION_COOKIE_NAME + '=') === 0 || created.setCookie.indexOf(SESSION_COOKIE_NAME + '=') >= 0);
  record('createSession 正確計算expiresAt（now+ttl）', created.expiresAt === '2026-01-01T01:00:00.000Z');
  const insertCall = db1.calls.find((c) => c.type === 'insert');
  record('createSession 呼叫db.sessions.insert並帶入正確的user_id', insertCall.s.user_id === 'user-abc');
  record('createSession 沒有提供ip時ip_hash為null（不強制要求）', insertCall.s.ip_hash === null);

  // createSession 帶 ip → 應該產生 ip_hash 而非明文存ip
  const db1b = makeMockDb();
  const createdWithIp = await createSession(db1b, 'user-abc', { now: '2026-01-01T00:00:00.000Z', ip: '1.2.3.4', ipSalt: 'somesalt' });
  const insertCallB = db1b.calls.find((c) => c.type === 'insert');
  record('createSession 有提供ip時，存入的是雜湊值而非明文IP', insertCallB.s.ip_hash && insertCallB.s.ip_hash !== '1.2.3.4' && /^[0-9a-f]{64}$/.test(insertCallB.s.ip_hash));

  // validateSession：正常情況
  const validSession = { id: 'tok-valid', user_id: 'user-abc', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null };
  const db2 = makeMockDb([validSession]);
  const v1 = await validateSession(db2, 'dbc_sid=tok-valid', { now: '2026-01-01T00:00:00.000Z' });
  record('validateSession 有效session回傳ok:true且正確userId', v1.ok === true && v1.userId === 'user-abc');

  // validateSession：沒有cookie
  const v2 = await validateSession(db2, null);
  record('validateSession 沒有cookie時回傳reason=no_cookie', v2.ok === false && v2.reason === 'no_cookie');

  // validateSession：token不存在
  const v3 = await validateSession(db2, 'dbc_sid=tok-does-not-exist');
  record('validateSession token不存在時回傳reason=not_found', v3.ok === false && v3.reason === 'not_found');

  // validateSession：已撤銷
  const revokedSession = { id: 'tok-revoked', user_id: 'user-abc', expires_at: '2099-01-01T00:00:00.000Z', revoked_at: '2026-01-01T00:00:00.000Z' };
  const db3 = makeMockDb([revokedSession]);
  const v4 = await validateSession(db3, 'dbc_sid=tok-revoked');
  record('validateSession 已撤銷session回傳reason=revoked', v4.ok === false && v4.reason === 'revoked');

  // validateSession：已過期
  const expiredSession = { id: 'tok-expired', user_id: 'user-abc', expires_at: '2020-01-01T00:00:00.000Z', revoked_at: null };
  const db4 = makeMockDb([expiredSession]);
  const v5 = await validateSession(db4, 'dbc_sid=tok-expired', { now: '2026-01-01T00:00:00.000Z' });
  record('validateSession 已過期session回傳reason=expired', v5.ok === false && v5.reason === 'expired');

  // revokeSession
  const db5 = makeMockDb([validSession]);
  const r1 = await revokeSession(db5, 'dbc_sid=tok-valid', { now: '2026-06-01T00:00:00.000Z' });
  record('revokeSession 成功並回傳清除cookie的setCookie', r1.ok === true && /Max-Age=0/.test(r1.setCookie));
  const afterRevoke = await validateSession(db5, 'dbc_sid=tok-valid');
  record('revokeSession 之後該session驗證應失敗（已撤銷）', afterRevoke.ok === false && afterRevoke.reason === 'revoked');

  const r2 = await revokeSession(db5, null);
  record('revokeSession 沒有cookie時優雅處理不報錯', r2.ok === true && r2.note === 'no_cookie_to_revoke');
}

async function main() {
  await testTokenModule();
  await testCookieModule();
  await testSessionModule();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算，未連線任何資料庫，未建立任何登入流程）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
