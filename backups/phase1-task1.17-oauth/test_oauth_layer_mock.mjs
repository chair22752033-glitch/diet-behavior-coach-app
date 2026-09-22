/*
 * Phase 1 TASK 1.17｜Google OAuth Identity Provider 基礎整合 單元測試
 * 純記憶體運算 + 注入假fetch，完全不連線任何真實網路服務或資料庫，
 * 也不使用任何真實 Google 帳號資料（全部用明顯的假值）。
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGoogleProvider } from '../../src/oauth/google.js';
import { createOAuthProvider, isValidOAuthProvider, KNOWN_OAUTH_PROVIDER_NAMES, IMPLEMENTED_OAUTH_PROVIDER_NAMES } from '../../src/oauth/provider.js';
import { createOAuthState, validateOAuthState } from '../../src/oauth/oauth_state.js';
import { exchangeAuthorizationCode } from '../../src/oauth/token_exchange.js';
import { mapGoogleProfileToIdentity } from '../../src/identity/provider_mapping.js';
import { isSupportedProvider, isValidProviderPair, mapGoogleProfileToIdentity as reExportedMapper } from '../../src/identity/provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

// 明顯的假設定，非任何真實 Google 專案的憑證
const FAKE_CONFIG = {
  client_id: 'test-client-id.apps.googleusercontent.com',
  client_secret: 'FAKE_CLIENT_SECRET_FOR_TEST_ONLY',
  redirect_uri: 'https://example.com/oauth/callback',
};

// ---- 1. Google provider 設定產生正常 ----
function test1_googleProviderConfig() {
  const provider = createGoogleProvider(FAKE_CONFIG);
  record('1. createGoogleProvider 用完整假設定成功建立', !!provider && provider.providerName === 'google');
  record('1. provider 物件具備三個必要方法', typeof provider.getAuthorizationUrl === 'function' && typeof provider.exchangeCode === 'function' && typeof provider.getUserProfile === 'function');

  let threwMissingClientId = false;
  try { createGoogleProvider({ client_secret: 'x', redirect_uri: 'y' }); } catch (e) { threwMissingClientId = true; }
  record('1. 缺少client_id時拋出錯誤（不會靜默用假值頂替）', threwMissingClientId);

  let threwMissingSecret = false;
  try { createGoogleProvider({ client_id: 'x', redirect_uri: 'y' }); } catch (e) { threwMissingSecret = true; }
  record('1. 缺少client_secret時拋出錯誤', threwMissingSecret);

  let threwEmpty = false;
  try { createGoogleProvider(null); } catch (e) { threwEmpty = true; }
  record('1. config為null時拋出錯誤', threwEmpty);
}

// ---- 2. Authorization URL 正確 ----
function test2_authorizationUrl() {
  const provider = createGoogleProvider(FAKE_CONFIG);
  const { state } = createOAuthState({ now: '2026-01-01T00:00:00.000Z' });
  const url = provider.getAuthorizationUrl(state);
  const parsed = new URL(url);

  record('2. Authorization URL 指向Google正確的授權端點', parsed.origin + parsed.pathname === 'https://accounts.google.com/o/oauth2/v2/auth');
  record('2. Authorization URL 帶入正確的client_id', parsed.searchParams.get('client_id') === FAKE_CONFIG.client_id);
  record('2. Authorization URL 帶入正確的redirect_uri', parsed.searchParams.get('redirect_uri') === FAKE_CONFIG.redirect_uri);
  record('2. Authorization URL response_type為code', parsed.searchParams.get('response_type') === 'code');
  record('2. Authorization URL 帶入正確的state', parsed.searchParams.get('state') === state);
  record('2. Authorization URL 預設scope包含openid/email/profile', parsed.searchParams.get('scope').indexOf('email') >= 0 && parsed.searchParams.get('scope').indexOf('profile') >= 0);

  let threwNoState = false;
  try { provider.getAuthorizationUrl(); } catch (e) { threwNoState = true; }
  record('2. 未提供state時拋出錯誤（避免忘記做CSRF防護）', threwNoState);
}

// ---- 3. state 產生唯一 ----
function test3_stateUniqueness() {
  const s1 = createOAuthState();
  const s2 = createOAuthState();
  const s3 = createOAuthState();
  record('3. 連續三次createOAuthState產生的state各不相同', s1.state !== s2.state && s2.state !== s3.state && s1.state !== s3.state);
  record('3. state長度合理（256-bit隨機值的base64url編碼）', s1.state.length >= 40);
  record('3. 每次都正確計算expiresAt', typeof s1.expiresAt === 'string' && new Date(s1.expiresAt).getTime() > Date.now());
}

// ---- 4. state 驗證成功 ----
function test4_stateValidationSuccess() {
  const stateRecord = createOAuthState({ now: '2026-01-01T00:00:00.000Z', ttlSeconds: 600 });
  const result = validateOAuthState(stateRecord.state, stateRecord, { now: '2026-01-01T00:05:00.000Z' });
  record('4. 有效期內、值相符的state驗證成功', result.ok === true);
}

// ---- 5. state 過期失敗 ----
function test5_stateExpired() {
  const stateRecord = createOAuthState({ now: '2026-01-01T00:00:00.000Z', ttlSeconds: 600 });
  const result = validateOAuthState(stateRecord.state, stateRecord, { now: '2026-01-01T00:20:00.000Z' });
  record('5. 已過期的state驗證失敗且reason正確', result.ok === false && result.reason === 'state_expired');
}

// ---- 6. state 被竄改失敗 ----
function test6_stateTampered() {
  const stateRecord = createOAuthState({ now: '2026-01-01T00:00:00.000Z' });
  const tamperedResult = validateOAuthState('this-is-a-different-tampered-state-value', stateRecord, { now: '2026-01-01T00:01:00.000Z' });
  record('6. 被竄改（值不符）的state驗證失敗且reason正確', tamperedResult.ok === false && tamperedResult.reason === 'state_mismatch');

  const missingResult = validateOAuthState(null, stateRecord);
  record('6. candidateState為空時驗證失敗且reason正確', missingResult.ok === false && missingResult.reason === 'missing_state');

  const missingExpectedResult = validateOAuthState('some-state', null);
  record('6. 沒有預期紀錄（expectedStateRecord）時驗證失敗', missingExpectedResult.ok === false && missingExpectedResult.reason === 'missing_state');
}

// ---- 7. authorization code exchange 成功流程(mock) ----
async function test7_exchangeCodeSuccessMock() {
  const provider = createGoogleProvider(FAKE_CONFIG);
  let capturedUrl = null;
  let capturedBody = null;
  const fakeFetch = async (url, opts) => {
    capturedUrl = url;
    capturedBody = opts.body;
    return {
      ok: true,
      json: async () => ({ access_token: 'FAKE_ACCESS_TOKEN_FOR_TEST', token_type: 'Bearer', expires_in: 3600, id_token: 'FAKE_ID_TOKEN', scope: 'openid email profile' }),
    };
  };

  const result = await provider.exchangeCode('fake-authorization-code-from-google-redirect', { fetchImpl: fakeFetch });
  record('7. exchangeCode(mock)成功並回傳accessToken', result.ok === true && result.accessToken === 'FAKE_ACCESS_TOKEN_FOR_TEST');
  record('7. exchangeCode(mock)正確送到Google的token端點', capturedUrl === 'https://oauth2.googleapis.com/token');
  record('7. exchangeCode(mock)請求body帶入正確的code與client憑證', capturedBody.indexOf('fake-authorization-code-from-google-redirect') >= 0 && capturedBody.indexOf(encodeURIComponent(FAKE_CONFIG.client_id)) >= 0);
  record('7. exchangeCode(mock)正確解析expiresIn/tokenType', result.expiresIn === 3600 && result.tokenType === 'Bearer');
}

// ---- 8. token exchange 錯誤處理 ----
async function test8_tokenExchangeErrorHandling() {
  const r1 = await exchangeAuthorizationCode({ tokenEndpoint: 'https://example.com/token' }, null, FAKE_CONFIG);
  record('8. 缺少code時安全回傳ok:false', r1.ok === false && r1.error === 'missing_code');

  const r2 = await exchangeAuthorizationCode({ tokenEndpoint: 'https://example.com/token' }, 'some-code', {});
  record('8. 缺少credentials時安全回傳ok:false', r2.ok === false && r2.error === 'missing_credentials');

  const r3 = await exchangeAuthorizationCode(null, 'some-code', FAKE_CONFIG);
  record('8. 缺少providerConfig(tokenEndpoint)時安全回傳ok:false', r3.ok === false && r3.error === 'missing_token_endpoint');

  const httpErrorFetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
  const r4 = await exchangeAuthorizationCode({ tokenEndpoint: 'https://example.com/token' }, 'bad-code', FAKE_CONFIG, { fetchImpl: httpErrorFetch });
  record('8. token端點回傳HTTP錯誤時安全回傳ok:false且帶status', r4.ok === false && r4.error === 'token_endpoint_error' && r4.status === 400);

  const networkErrorFetch = async () => { throw new Error('模擬網路連線失敗'); };
  const r5 = await exchangeAuthorizationCode({ tokenEndpoint: 'https://example.com/token' }, 'some-code', FAKE_CONFIG, { fetchImpl: networkErrorFetch });
  record('8. 網路例外時安全回傳ok:false而非拋出未捕捉例外', r5.ok === false && r5.error === '模擬網路連線失敗');

  const missingTokenFetch = async () => ({ ok: true, json: async () => ({ token_type: 'Bearer' }) });
  const r6 = await exchangeAuthorizationCode({ tokenEndpoint: 'https://example.com/token' }, 'some-code', FAKE_CONFIG, { fetchImpl: missingTokenFetch });
  record('8. 回應缺少access_token欄位時安全回傳ok:false', r6.ok === false && r6.error === 'missing_access_token_in_response');
}

// ---- 9. Google profile mapping 正確 ----
function test9_googleProfileMapping() {
  const fakeProfile = { id: '1234567890', email: 'test.user@example.com', name: '測試使用者', picture: 'https://example.com/avatar.png' };
  const result = mapGoogleProfileToIdentity(fakeProfile);

  record('9. mapGoogleProfileToIdentity 成功轉換', result.ok === true);
  record('9. auth_provider正確為google', result.identity.auth_provider === 'google');
  record('9. auth_provider_id正確對應profile.id', result.identity.auth_provider_id === '1234567890');
  record('9. email正確對應', result.identity.email === 'test.user@example.com');
  record('9. display_name正確對應profile.name', result.identity.display_name === '測試使用者');

  const noEmailProfile = { id: '999', name: '無email使用者' };
  const noEmailResult = mapGoogleProfileToIdentity(noEmailProfile);
  record('9. 缺少email時仍能成功轉換，email為null', noEmailResult.ok === true && noEmailResult.identity.email === null);

  const missingIdResult = mapGoogleProfileToIdentity({ email: 'x@example.com' });
  record('9. 缺少id時安全回傳ok:false', missingIdResult.ok === false && missingIdResult.error === 'missing_provider_id');

  const invalidResult = mapGoogleProfileToIdentity(null);
  record('9. profile為null時安全回傳ok:false而非拋例外', invalidResult.ok === false && invalidResult.error === 'invalid_profile');

  record('9. src/identity/provider.js 正確重新匯出mapGoogleProfileToIdentity（同一個函式）', reExportedMapper === mapGoogleProfileToIdentity);
}

// ---- 10. provider identity 格式驗證 ----
function test10_providerIdentityFormatValidation() {
  const fakeProfile = { id: '555', email: 'x@example.com', name: 'X' };
  const mapped = mapGoogleProfileToIdentity(fakeProfile);

  record('10. mapping後的identity通過TASK1.13B的isValidProviderPair檢查（auth_provider+auth_provider_id同時存在）', isValidProviderPair(mapped.identity.auth_provider, mapped.identity.auth_provider_id) === true);

  const googleProviderObj = createGoogleProvider(FAKE_CONFIG);
  record('10. createGoogleProvider的回傳物件通過isValidOAuthProvider介面檢查', isValidOAuthProvider(googleProviderObj) === true);

  const incompleteProvider = { providerName: 'broken', getAuthorizationUrl: () => {} };
  record('10. 缺少方法的provider物件被isValidOAuthProvider正確判定為不合法', isValidOAuthProvider(incompleteProvider) === false);
  record('10. isValidOAuthProvider(null)不拋例外且回傳false', isValidOAuthProvider(null) === false);
}

// ---- 11. 不支援 provider 拒絕 ----
function test11_unsupportedProviderRejected() {
  record('11. isSupportedProvider對google回傳true（TASK1.13B既有規則未被破壞）', isSupportedProvider('google') === true);
  record('11. isSupportedProvider對facebook回傳false（尚未實作）', isSupportedProvider('facebook') === false);
  record('11. KNOWN_OAUTH_PROVIDER_NAMES包含未來規劃的4種provider', KNOWN_OAUTH_PROVIDER_NAMES.length === 4 && KNOWN_OAUTH_PROVIDER_NAMES.includes('apple'));
  record('11. IMPLEMENTED_OAUTH_PROVIDER_NAMES目前只有google（誠實反映本次只實作google）', IMPLEMENTED_OAUTH_PROVIDER_NAMES.length === 1 && IMPLEMENTED_OAUTH_PROVIDER_NAMES[0] === 'google');

  let threwForMissingMethod = false;
  try {
    createOAuthProvider('incomplete-provider', { getAuthorizationUrl: () => {}, exchangeCode: () => {} }); // 缺 getUserProfile
  } catch (e) { threwForMissingMethod = true; }
  record('11. createOAuthProvider對缺少方法的定義拋出錯誤（不會建立出殘缺的provider）', threwForMissingMethod);

  let threwForNoName = false;
  try { createOAuthProvider('', {}); } catch (e) { threwForNoName = true; }
  record('11. createOAuthProvider對空的providerName拋出錯誤', threwForNoName);
}

// ---- 12. secret 未寫入程式碼 ----
function test12_noHardcodedSecrets() {
  const filesToCheck = [
    '../../src/oauth/constants.js',
    '../../src/oauth/provider.js',
    '../../src/oauth/google.js',
    '../../src/oauth/oauth_state.js',
    '../../src/oauth/token_exchange.js',
    '../../src/identity/provider_mapping.js',
  ].map((p) => path.join(__dirname, p));

  const SUSPICIOUS_PATTERNS = [
    /client_secret\s*[:=]\s*['"][^'"]{5,}['"]/i, // 寫死的client_secret字串值
    /access_token\s*[:=]\s*['"][^'"]{10,}['"]/i, // 寫死的access_token字串值（排除變數名/物件key）
    /refresh_token\s*[:=]\s*['"][^'"]{10,}['"]/i,
    /GOCSPX-/i, // Google client secret的真實格式前綴
    /ya29\./i, // Google access token的真實格式前綴
  ];

  let allClean = true;
  const violations = [];
  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        allClean = false;
        violations.push(path.basename(filePath) + ' matched ' + pattern);
      }
    }
  }
  record('12. 原始碼掃描：src/oauth/與provider_mapping.js皆無寫死的client_secret/access_token/refresh_token/Google真實格式值', allClean, violations.join('; '));

  // 額外驗證：google.js 裡除了 config 參數引用外，沒有任何一組看起來像真實憑證的常數
  const googleJsContent = fs.readFileSync(path.join(__dirname, '../../src/oauth/google.js'), 'utf8');
  record('12. google.js 只透過 config.client_id/config.client_secret/config.redirect_uri 存取憑證（皆為函式參數引用，非常數）', /config\.client_id/.test(googleJsContent) && /config\.client_secret/.test(googleJsContent) && !/const\s+client_secret\s*=/.test(googleJsContent));
}

async function main() {
  test1_googleProviderConfig();
  test2_authorizationUrl();
  test3_stateUniqueness();
  test4_stateValidationSuccess();
  test5_stateExpired();
  test6_stateTampered();
  await test7_exchangeCodeSuccessMock();
  await test8_tokenExchangeErrorHandling();
  test9_googleProfileMapping();
  test10_providerIdentityFormatValidation();
  test11_unsupportedProviderRejected();
  test12_noHardcodedSecrets();

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }
  else console.log('✅✅✅ 全部通過（純記憶體運算+假fetch，未連線任何真實網路服務或資料庫）');
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
