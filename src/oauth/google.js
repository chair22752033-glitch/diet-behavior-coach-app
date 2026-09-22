/*
 * Phase 1 TASK 1.17｜Google OAuth Provider
 *
 * 建立符合 src/oauth/provider.js 介面的 Google provider 物件。
 *
 * 禁止事項（已遵守）：
 * - 不寫死 client_id/client_secret：createGoogleProvider(config) 的 config
 *   一律由外部呼叫端注入，這個檔案裡沒有任何寫死的機密值
 * - 不寫死 token：getUserProfile() 需要呼叫端傳入 accessToken，
 *   這裡不會、也無法自己生出一個 token
 * - 不儲存使用者資料：getUserProfile() 只是把 Google 回傳的 profile 轉手
 *   回傳給呼叫端，不寫入任何變數以外的地方，更不會碰 D1 或 KV
 */
import { GOOGLE_AUTHORIZATION_ENDPOINT, GOOGLE_TOKEN_ENDPOINT, GOOGLE_USERINFO_ENDPOINT, GOOGLE_DEFAULT_SCOPE } from './constants.js';
import { createOAuthProvider } from './provider.js';
import { exchangeAuthorizationCode } from './token_exchange.js';

function assertValidGoogleConfig(config) {
  if (!config || !config.client_id || !config.client_secret || !config.redirect_uri) {
    throw new Error(
      'createGoogleProvider() 需要完整的 { client_id, client_secret, redirect_uri }，' +
      '且必須由外部（例如 Cloudflare Worker Secret）注入，不可以寫死在程式碼裡'
    );
  }
}

/**
 * @param {{client_id:string, client_secret:string, redirect_uri:string}} config - 由外部注入
 * @returns {object} 符合 src/oauth/provider.js 介面的 provider 物件
 */
export function createGoogleProvider(config) {
  assertValidGoogleConfig(config);

  function getAuthorizationUrl(state, opts) {
    opts = opts || {};
    if (!state || typeof state !== 'string') {
      throw new Error('getAuthorizationUrl(state) 需要先呼叫 createOAuthState() 產生 state 再傳入，避免CSRF');
    }
    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      response_type: 'code',
      scope: opts.scope || GOOGLE_DEFAULT_SCOPE,
      state,
      access_type: opts.accessType || 'online',
      prompt: opts.prompt || 'select_account',
    });
    return GOOGLE_AUTHORIZATION_ENDPOINT + '?' + params.toString();
  }

  async function exchangeCode(code, opts) {
    return exchangeAuthorizationCode({ tokenEndpoint: GOOGLE_TOKEN_ENDPOINT }, code, config, opts);
  }

  async function getUserProfile(accessToken, opts) {
    opts = opts || {};
    const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

    if (!accessToken || typeof accessToken !== 'string') {
      return { ok: false, error: 'missing_access_token' };
    }
    if (!fetchImpl) {
      return { ok: false, error: 'no_fetch_implementation_available' };
    }

    try {
      const res = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      if (!res.ok) {
        return { ok: false, error: 'userinfo_endpoint_error', status: res.status };
      }
      const raw = await res.json();
      return {
        ok: true,
        profile: {
          id: raw.id,
          email: raw.email || null,
          name: raw.name || null,
          picture: raw.picture || null,
        },
      };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  return createOAuthProvider('google', { getAuthorizationUrl, exchangeCode, getUserProfile });
}
