/*
 * Phase 1 TASK 1.17｜OAuth Provider Abstraction
 *
 * 定義所有 OAuth provider（Google、未來的 Apple/Facebook/Line...）都要遵守的
 * 通用介面形狀，讓呼叫端可以用同一套程式碼處理不同 provider，不需要為每個
 * provider 寫一套不同的呼叫方式。
 *
 * 本次只實作 Google（見 google.js），這裡只負責「定義規則、驗證形狀」。
 */

const REQUIRED_METHODS = Object.freeze(['getAuthorizationUrl', 'exchangeCode', 'getUserProfile']);

/**
 * 建立一個符合介面的 provider 物件。任何一個必要方法缺漏都會立刻拋出錯誤，
 * 不會讓一個「長得不完整」的 provider 物件流到呼叫端才在使用時才爆炸。
 *
 * @param {string} providerName - 例如 'google'
 * @param {object} methods - { getAuthorizationUrl(state, opts), exchangeCode(code, opts), getUserProfile(accessToken, opts) }
 * @returns {object} 凍結（不可變）的 provider 物件：{ providerName, ...methods }
 */
export function createOAuthProvider(providerName, methods) {
  if (!providerName || typeof providerName !== 'string') {
    throw new Error('createOAuthProvider 需要非空字串的 providerName');
  }
  methods = methods || {};
  for (const name of REQUIRED_METHODS) {
    if (typeof methods[name] !== 'function') {
      throw new Error('createOAuthProvider("' + providerName + '") 缺少必要方法: ' + name);
    }
  }
  return Object.freeze(Object.assign({ providerName }, methods));
}

/**
 * 檢查一個物件是否符合 OAuth provider 的介面形狀（不執行任何方法，只檢查存在性）。
 * @returns {boolean}
 */
export function isValidOAuthProvider(provider) {
  if (!provider || typeof provider !== 'object') return false;
  if (typeof provider.providerName !== 'string' || !provider.providerName) return false;
  return REQUIRED_METHODS.every((name) => typeof provider[name] === 'function');
}

export { REQUIRED_METHODS as OAUTH_PROVIDER_REQUIRED_METHODS };

// 目前已知、未來規劃支援的 provider 名稱（本次只實作 google，其餘尚未建立對應模組）
export const KNOWN_OAUTH_PROVIDER_NAMES = Object.freeze(['google', 'apple', 'facebook', 'line']);
export const IMPLEMENTED_OAUTH_PROVIDER_NAMES = Object.freeze(['google']);
