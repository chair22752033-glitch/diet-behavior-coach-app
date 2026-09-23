/*
 * Phase 1 TASK 1.27｜Request Context Middleware
 *
 * buildRequestContext(base) 幫每個請求補上 {requestId, timestamp, user,
 * db, env}——requestId/timestamp 是每次呼叫都重新產生的請求層級中繼資料
 * （供未來log/追蹤用，本次沒有任何地方讀取或記錄它），user 預設為
 * null（本次沒有任何route真的驗證身份，見 auth_middleware.js），
 * db/env 原樣從呼叫端傳入的 base 帶過去，不重新建立。
 *
 * 注意：這個檔案跟 src/adapters/context_builder.js（TASK1.22）的
 * createRequestContext(env, request) 是不同的東西——那個是「組裝一次
 * 請求要用到的 db/env/services」給 Worker Adapter 用，這個是「在
 * middleware pipeline 裡幫 ctx 補上請求層級的中繼資料」，兩者刻意用
 * 不同的函式名稱（buildRequestContext vs createRequestContext）避免
 * 混淆，也沒有互相依賴。
 */

function generateRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * @param {object} [base] - {user?, db?, env?}
 * @returns {{requestId:string, timestamp:string, user:object|null, db:object|undefined, env:object|undefined}}
 */
export function buildRequestContext(base) {
  base = base || {};
  return {
    requestId: generateRequestId(),
    timestamp: new Date().toISOString(),
    user: base.user || null,
    db: base.db,
    env: base.env,
  };
}
