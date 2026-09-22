/*
 * Phase 1 TASK 1.13A｜Cookie Session 設計 - Cookie 解析與組裝
 *
 * 純函式，不依賴 DOM 的 document.cookie（Worker 環境沒有 document），
 * 直接處理 HTTP 的 Cookie / Set-Cookie 標頭字串。
 */
import { COOKIE_DEFAULTS } from './constants.js';

/**
 * 解析請求的 Cookie 標頭字串成 {name: value} 物件
 * @param {string|null} cookieHeader 例如 "a=1; b=2"
 */
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  });
  return out;
}

/**
 * 組出一個 Set-Cookie 標頭字串。
 * @param {string} name
 * @param {string} value
 * @param {object} [opts] {maxAgeSeconds, path, httpOnly, secure, sameSite}
 *   未提供的欄位一律套用 COOKIE_DEFAULTS（見 constants.js），本機 http 開發時
 *   呼叫端需明確傳入 {secure:false}，不會自動偵測協定（Worker fetch handler
 *   本身無法可靠得知這點，交由呼叫端根據環境決定，避免誤判）
 */
export function serializeCookie(name, value, opts) {
  const o = Object.assign({}, COOKIE_DEFAULTS, opts || {});
  const parts = [name + '=' + encodeURIComponent(value)];
  if (o.path) parts.push('Path=' + o.path);
  if (typeof o.maxAgeSeconds === 'number') parts.push('Max-Age=' + Math.floor(o.maxAgeSeconds));
  if (o.httpOnly) parts.push('HttpOnly');
  if (o.secure) parts.push('Secure');
  if (o.sameSite) parts.push('SameSite=' + o.sameSite);
  return parts.join('; ');
}

/**
 * 組出一個「立即過期、清除 cookie」用的 Set-Cookie 字串（登出時使用）
 */
export function serializeExpiredCookie(name, opts) {
  return serializeCookie(name, '', Object.assign({}, opts, { maxAgeSeconds: 0 }));
}
