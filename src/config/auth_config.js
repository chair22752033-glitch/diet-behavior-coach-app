/*
 * Phase 1 TASK 1.23｜Auth Configuration
 *
 * 集中整理跟登入/OAuth/Session相關的設定值，供未來需要的層（例如真正
 * 接上 Google OAuth 時）統一從這裡讀取，而不是各自散落地寫
 * `env.GOOGLE_CLIENT_ID` 之類的程式碼。
 *
 * 重要（禁止事項）：
 * - 只「讀取」env 裡已存在的機密值並原樣回傳，絕不寫入/快取/記錄到別的
 *   地方（不 console.log、不寫入 D1/KV、不組成錯誤訊息內容）。
 * - 不建立任何 OAuth 流程（不 import src/oauth/ 底下任何檔案）、
 *   不呼叫 Google 的任何端點。
 * - Cookie 的預設值直接沿用 TASK1.13A 的 src/auth/constants.js，
 *   不重複定義一份新的數字造成兩處要同步維護。
 */
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, COOKIE_DEFAULTS } from '../auth/constants.js';

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{
 *   google: {clientId:string|null, clientSecret:string|null, redirectUri:string|null, configured:boolean},
 *   cookie: {name:string, ttl:number, secure:boolean, sameSite:string}
 * }}
 */
export function getAuthConfig(env) {
  if (!env) {
    throw new Error('getAuthConfig(env)：env 不可為空');
  }

  const clientId = env.GOOGLE_CLIENT_ID || null;
  const clientSecret = env.GOOGLE_CLIENT_SECRET || null;
  const redirectUri = env.GOOGLE_REDIRECT_URI || null;

  return {
    google: {
      clientId,
      clientSecret,
      redirectUri,
      // 三個值都齊全才視為「已設定」；本次 wrangler.toml 尚未加入這些
      // 變數（不在本次任務範圍內），所以正常情況下這裡會是 false。
      configured: !!(clientId && clientSecret && redirectUri),
    },
    cookie: {
      name: SESSION_COOKIE_NAME,
      ttl: SESSION_TTL_SECONDS,
      secure: COOKIE_DEFAULTS.secure,
      sameSite: COOKIE_DEFAULTS.sameSite,
    },
  };
}
