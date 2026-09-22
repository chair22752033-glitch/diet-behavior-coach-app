/*
 * Phase 1 TASK 1.17｜Authorization Code Exchange
 *
 * 封裝標準 OAuth2「authorization code → access token」的交換流程
 * （POST 到 provider 的 token endpoint），provider 無關（google.js 呼叫它時
 * 傳入 Google 的 tokenEndpoint，未來 Apple/Facebook/Line 也能重用同一套邏輯，
 * 因為這是 OAuth2 標準流程，不是 Google 專屬的東西）。
 *
 * 重要限制（已遵守）：
 * - 不保存 token：這裡只回傳解析後的結果，不寫入任何變數以外的地方，
 *   呼叫端要不要保存、保存去哪裡，完全不是這個檔案的責任
 * - 不寫 D1、不寫 KV：完全沒有 import 任何 db 或 KV 相關模組
 * - 錯誤安全回傳：任何失敗情況（缺參數、HTTP錯誤、網路例外、回應格式不對）
 *   一律回傳 {ok:false, error}，不會拋出未捕捉的例外
 *
 * 可測試性：fetch 實作可透過 opts.fetchImpl 注入（測試時用假的fetch，
 * 完全不會真的對 Google 發送任何請求，符合「不執行真實Google OAuth登入」）。
 */

/**
 * @param {{tokenEndpoint:string}} providerConfig - 至少要有 tokenEndpoint
 * @param {string} code - authorization code
 * @param {{client_id:string, client_secret:string, redirect_uri:string}} credentials - 由外部注入，不可寫死
 * @param {object} [opts] - {fetchImpl}
 * @returns {Promise<{ok:boolean, accessToken?:string, tokenType?:string, expiresIn?:number, idToken?:string, scope?:string, error?:string, status?:number}>}
 */
export async function exchangeAuthorizationCode(providerConfig, code, credentials, opts) {
  opts = opts || {};
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

  if (!providerConfig || !providerConfig.tokenEndpoint) {
    return { ok: false, error: 'missing_token_endpoint' };
  }
  if (!code || typeof code !== 'string') {
    return { ok: false, error: 'missing_code' };
  }
  if (!credentials || !credentials.client_id || !credentials.client_secret || !credentials.redirect_uri) {
    return { ok: false, error: 'missing_credentials' };
  }
  if (!fetchImpl) {
    return { ok: false, error: 'no_fetch_implementation_available' };
  }

  const body = new URLSearchParams({
    code,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    redirect_uri: credentials.redirect_uri,
    grant_type: 'authorization_code',
  });

  try {
    const res = await fetchImpl(providerConfig.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      let detail = null;
      try { detail = await res.json(); } catch (e) { /* 回應不是JSON就算了，detail保持null */ }
      return { ok: false, error: 'token_endpoint_error', status: res.status, detail };
    }

    const json = await res.json();
    if (!json || !json.access_token) {
      return { ok: false, error: 'missing_access_token_in_response' };
    }

    return {
      ok: true,
      accessToken: json.access_token,
      tokenType: json.token_type || 'Bearer',
      expiresIn: typeof json.expires_in === 'number' ? json.expires_in : null,
      idToken: json.id_token || null,
      scope: json.scope || null,
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
