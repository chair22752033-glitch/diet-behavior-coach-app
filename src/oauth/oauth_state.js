/*
 * Phase 1 TASK 1.17｜OAuth State 防護（CSRF）
 *
 * 標準 OAuth Authorization Code Flow 的 CSRF 防護機制：發起授權請求前產生一個
 * 隨機 state，跟著授權連結一起送到 Google；Google 導回時會原樣帶回這個
 * state，呼叫端要比對「導回的state」跟「當初自己產生的state」是否一致，
 * 不一致就代表這個回呼可能不是自己發起的請求（CSRF攻擊）。
 *
 * 本次刻意只建立「純函式」：不接 Cookie、不接 Session、不做任何儲存——
 * state 要存在哪裡（cookie/session/KV）是未來 TASK1.18 真正串起登入流程時
 * 才需要決定的事，這裡只提供「產生」與「驗證」兩個函式。
 *
 * 隨機性沿用 TASK1.13A 的 generateOpaqueToken()（Web Crypto
 * crypto.getRandomValues()，256-bit），不重新實作亂數產生邏輯。
 */
import { generateOpaqueToken } from '../auth/token.js';
import { OAUTH_STATE_TTL_SECONDS } from './constants.js';

/**
 * 產生一個新的 OAuth state。
 * @param {object} [opts] - {ttlSeconds, now}
 * @returns {{state:string, expiresAt:string}}
 */
export function createOAuthState(opts) {
  opts = opts || {};
  const now = opts.now ? new Date(opts.now) : new Date();
  const ttlSeconds = typeof opts.ttlSeconds === 'number' ? opts.ttlSeconds : OAUTH_STATE_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  return { state: generateOpaqueToken(), expiresAt };
}

/** 常數時間字串比較，避免用一般的 === 比較時可能洩漏時序資訊（timing side-channel） */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 驗證從 OAuth 回呼拿到的 state，是否與當初 createOAuthState() 產生、
 * 由呼叫端自行保存下來的紀錄相符，且尚未過期。
 *
 * @param {string} candidateState - 回呼 URL 上帶回來的 state 參數
 * @param {{state:string, expiresAt:string}} expectedStateRecord - 當初 createOAuthState() 的回傳值
 * @param {object} [opts] - {now}
 * @returns {{ok:boolean, reason?:string}} reason: 'missing_state' | 'state_mismatch' | 'state_expired'
 */
export function validateOAuthState(candidateState, expectedStateRecord, opts) {
  opts = opts || {};
  const now = opts.now ? new Date(opts.now) : new Date();

  if (!candidateState || !expectedStateRecord || !expectedStateRecord.state) {
    return { ok: false, reason: 'missing_state' };
  }
  if (!constantTimeEqual(candidateState, expectedStateRecord.state)) {
    return { ok: false, reason: 'state_mismatch' };
  }
  if (new Date(expectedStateRecord.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: 'state_expired' };
  }
  return { ok: true };
}
