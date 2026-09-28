/*
 * Phase 6 TASK 1.121｜Gemini Configuration
 *
 * 延續 src/config/auth_config.js 已確立的既有慣例：集中讀取 env 裡
 * 跟 Gemini API 金鑰有關的機密值，原樣回傳，不快取、不記錄、不寫入
 * 任何地方——只有「讀取」這一件事。
 *
 * 重要（禁止事項）：
 * - 絕不硬編碼任何API金鑰、絕不commit任何機密值——這裡永遠只讀取
 *   env.GEMINI_API_KEY，本次任務也沒有在wrangler.toml寫入任何真正
 *   的金鑰值（機密值透過`wrangler secret put`之類的既有部署機制
 *   另外設定，不是這次程式碼異動的範圍）。
 * - 不 console.log、不組成錯誤訊息內容包含金鑰本身。
 * - 不建立任何HTTP呼叫（那是gemini_client.js的責任）。
 */

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{apiKey:string|null, configured:boolean}}
 */
export function getGeminiConfig(env) {
  if (!env) {
    throw new Error('getGeminiConfig(env)：env 不可為空');
  }

  const apiKey = typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.length > 0 ? env.GEMINI_API_KEY : null;

  return {
    apiKey,
    // 本次 wrangler.toml 尚未加入這個變數（不在本次任務範圍內），
    // 所以正常情況下這裡會是 false，延續 auth_config.js 已確立的
    // 既有慣例（有沒有「設定」不等於有沒有「呼叫」）。
    configured: !!apiKey,
  };
}
