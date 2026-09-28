/*
 * Phase 6 TASK 1.121｜AI Provider Boundary - Provider Contract
 *
 * 責任：定義一個跟「目前用的是哪個AI供應商」完全無關的穩定介面
 * （AI Provider Interface），讓Gemini只是眾多可能實作之一——未來
 * 如果要換成別的供應商，只需要新增一個符合這個介面的新
 * provider，Enhancement Service（`../gemini/gemini_enhancer.js`）
 * 完全不需要跟著改。
 *
 *   任何AI供應商（Gemini/未來的其他供應商）
 *     ↓ 實作
 *   AI Provider Interface（這裡）
 *     ↓ 被呼叫
 *   Enhancement Service → Product Layer
 *
 * ## Provider Interface（規格原文）
 *
 * 一個合法的AI Provider必須提供：
 * - `name`：非空字串，供debug/未來多provider選擇時識別用
 * - `requestEnhancement(input)`：接受一個經過Input Boundary過濾
 *   後的安全物件，回傳`Promise<{ok:true, explanation:string} |
 *   {ok:false, reason:string}>`——**永遠不拋出例外**是Provider
 *   實作自己的責任（Gemini實作見`../gemini/gemini_provider.js`）。
 *
 * 這個檔案本身不實作任何真正的AI呼叫，只提供「這是不是一個合法
 * Provider」的結構檢查，供Enhancement Service在使用外部注入的
 * provider之前先做防禦性檢查（拒絕格式不符的provider，而不是讓
 * 呼叫時才爆炸）。
 */

/**
 * @param {*} provider
 * @returns {boolean}
 */
export function isValidAiProvider(provider) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return false;
  if (typeof provider.name !== 'string' || provider.name.length === 0) return false;
  if (typeof provider.requestEnhancement !== 'function') return false;
  return true;
}
