/*
 * Phase 1 TASK 1.21｜Auth Routes
 * （TASK1.29 起 POST /auth/guest 正式上線，TASK1.30 起 GET /auth/me、
 * POST /auth/logout 正式上線，TASK1.31 起 POST /auth/provider/upgrade
 * 正式上線，TASK1.32 起 POST /auth/provider 正式上線，TASK1.33 起
 * GET /auth/google/callback 正式上線）
 *
 * 建立 method+path → controller 的 mapping。
 * handler 從 Router 補好的 context（{req, db, env, services, params}）取出
 * TASK1.20 controller 需要的參數，呼叫後直接把 controller 回傳的
 * { ok, data/reason, status } 原樣交回給 Router 做 Response 轉換——
 * 這裡完全不直接呼叫 db.users/db.sessions，一律委派給 controller。
 *
 * req 是「已經解析好的請求描述物件」（method/pathname 之外還可能帶
 * payload/cookieHeader/query/options）——worker.js 對這六條已上線的路由
 * 都會把真正的 HTTP body/Cookie 標頭/query string解析好傳進來。
 *
 * TASK1.32：POST /auth/provider 正式上線，但這裡收到的 payload 是
 * 「已經確認好的 provider identity」（provider/providerId/email/
 * displayName），完全不接 Google OAuth callback、不執行 Authorization
 * Code Flow、不呼叫任何 Google API——那些是真正要接上 Google 登入時
 * 才會做的事，當時刻意排除在外。
 *
 * TASK1.33：GET /auth/google/callback 正式接上前一個任務刻意排除的
 * Google OAuth callback，串接 TASK1.17 的 oauth provider 基礎架構
 * （createGoogleProvider/exchangeCode/getUserProfile/validateOAuthState）
 * 跟 provider_mapping，完成 Authorization Code → Identity → Session
 * 整條流程。googleProvider 物件在這一層（route層）從 ctx.env 讀取
 * GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI 建立——
 * controller/service 本身完全看不到 env，也不會、不能寫死任何機密值；
 * 缺少任一個環境變數時 getGoogleProviderFromEnv() 回傳 null，controller
 * 會安全短路回傳 oauth_not_configured，不會嘗試呼叫任何 Google 端點。
 *
 * TASK1.29/1.30/1.31/1.32 已上線的五條路由都：
 * 1. 掛上 TASK1.28 對應的 contract validation middleware。
 * 2. controller 成功時，若 data.cookie 是字串，就把它實際附加到 HTTP
 *    回應的 Set-Cookie 標頭上（controller 本身刻意跟傳輸協定無關，只把
 *    cookie 字串放在 data 裡，「幫它變成真正的 Set-Cookie header」是
 *    路由層的責任）——guest login/provider login/身份升級 用它設定新
 *    session的cookie，logout 用它送出「清除cookie」的Set-Cookie
 *    （Max-Age=0）。GET /auth/me 是純讀取，controller 回傳值裡沒有
 *    cookie 欄位，withSetCookie() 自然不會產生任何 Set-Cookie，不會
 *    意外建立新session。
 *
 * TASK1.33 新增的 GET /auth/google/callback 是唯一的例外：它不回JSON，
 * 一律用302 redirect把瀏覽器導回首頁（見 buildGoogleCallbackResponse()），
 * 因為這是「瀏覽器導向流程」的最後一步，不是給前端fetch()呼叫的API。
 */
import {
  loginGuestController,
  loginProviderController,
  logoutController,
  currentUserController,
  upgradeGuestController,
  googleOAuthCallbackController,
} from '../controllers/auth_controller.js';
import { createContractValidationMiddleware } from '../middleware/validator.js';
import {
  loginGuestContract,
  loginProviderContract,
  logoutContract,
  currentUserContract,
  upgradeProviderContract,
  googleCallbackContract,
} from '../contracts/auth_contract.js';
import { createGoogleProvider } from '../oauth/google.js';
import { serializeExpiredCookie } from '../auth/cookie.js';
import { OAUTH_STATE_COOKIE_NAME } from '../services/auth_application_service.js';

function withSetCookie(result) {
  if (result && result.ok && result.data && typeof result.data.cookie === 'string') {
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': result.data.cookie,
      },
    });
  }
  return result;
}

// TASK1.33：GET /auth/google/callback 這條路由不像其他五條回JSON，它是
// 瀏覽器導向流程的最後一步，成功/失敗都要用302 redirect把使用者導回
// 應用程式（成功→首頁+新session cookie，失敗→首頁+安全的錯誤代碼，不含
// 任何token/機密資訊）。oauth_state cookie無論成功失敗都是一次性、用完
// 即清除，避免同一組state被重放。
function buildGoogleCallbackResponse(result) {
  const headers = new Headers();
  const ok = !!(result && result.ok);
  headers.set('Location', ok ? '/' : '/?oauth_error=' + encodeURIComponent((result && result.reason) || 'oauth_failed'));
  if (ok && result.data && typeof result.data.cookie === 'string') {
    headers.append('Set-Cookie', result.data.cookie);
  }
  headers.append('Set-Cookie', serializeExpiredCookie(OAUTH_STATE_COOKIE_NAME));
  return new Response(null, { status: 302, headers });
}

function getGoogleProviderFromEnv(env) {
  env = env || {};
  const config = {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
  };
  if (!config.client_id || !config.client_secret || !config.redirect_uri) {
    // 這個環境還沒有設定Google OAuth secret（例如本機開發/測試/正式環境
    // 尚未申請憑證），安全地回傳null，讓controller/service那一層以
    // oauth_not_configured安全短路，不會嘗試呼叫createGoogleProvider()
    // 而拋出例外。
    return null;
  }
  return createGoogleProvider(config);
}

export function registerAuthRoutes(router) {
  router.add(
    'POST',
    '/auth/guest',
    async (ctx) => {
      const req = ctx.req || {};
      const result = await loginGuestController(ctx.db, req.payload, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(loginGuestContract)] }
  );

  router.add(
    'POST',
    '/auth/provider',
    async (ctx) => {
      const req = ctx.req || {};
      const result = await loginProviderController(ctx.db, req.payload, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(loginProviderContract)] }
  );

  router.add(
    'POST',
    '/auth/logout',
    async (ctx) => {
      const req = ctx.req || {};
      const result = await logoutController(ctx.db, req.cookieHeader, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(logoutContract)] }
  );

  router.add(
    'GET',
    '/auth/me',
    async (ctx) => {
      const req = ctx.req || {};
      // 純讀取：currentUserController → getCurrentUser() →
      // validateSessionWithIdentity() 全程只查詢，不建立/更新任何
      // session 或 user 資料。回傳值不含cookie欄位，withSetCookie()
      // 原樣透傳，不會產生Set-Cookie。
      return currentUserController(ctx.db, req.cookieHeader, req.options);
    },
    { middlewares: [createContractValidationMiddleware(currentUserContract)] }
  );

  router.add(
    'POST',
    '/auth/provider/upgrade',
    async (ctx) => {
      const req = ctx.req || {};
      // 注意：guestUserId不是從payload來的，是upgradeGuestController內部
      // 用cookieHeader解析出「目前登入的是誰」——這裡只負責把兩個原始
      // 輸入原樣轉交，不做任何身份判斷。
      const result = await upgradeGuestController(ctx.db, req.cookieHeader, req.payload, req.options);
      return withSetCookie(result);
    },
    { middlewares: [createContractValidationMiddleware(upgradeProviderContract)] }
  );

  router.add(
    'GET',
    '/auth/google/callback',
    async (ctx) => {
      const req = ctx.req || {};
      const googleProvider = getGoogleProviderFromEnv(ctx.env);
      const query = req.query || {};
      const result = await googleOAuthCallbackController(
        ctx.db,
        { code: query.code, state: query.state, cookieHeader: req.cookieHeader },
        googleProvider,
        req.options
      );
      return buildGoogleCallbackResponse(result);
    },
    { middlewares: [createContractValidationMiddleware(googleCallbackContract, (c) => c && c.req && c.req.query)] }
  );
}
