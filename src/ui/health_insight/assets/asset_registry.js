/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Asset Registry（未來插畫資產整合邊界）
 *
 * 責任：定義Health Insight未來需要的「手繪插畫感」視覺資產
 * 有哪些語意化的插槽（slot），並提供一個**佔位符**產生器，讓
 * 元件現在就可以正確排版、正確測試，之後只要在這個檔案裡把
 * 佔位符換成真正的插畫檔案路徑，**不需要修改任何一個元件檔案
 * 本身**。
 *
 * ## 明確要求（規格原文）
 *
 * - ❌ 本次任務不產生任何最終插畫資產（"Do NOT generate final
 *   illustration assets"）
 * - ❌ 本次任務不做任何圖片生成（"Image generation"明確列在
 *   Forbidden清單）
 * - ✅ 只準備資產目錄結構跟語意化插槽定義，讓未來的視覺資產可以
 *   被輕鬆替換（"Prepare the UI architecture and asset
 *   boundary so future visual assets can be replaced easily"）
 *
 * ## 邊界設計原則
 *
 * 每一個插槽用**語意**命名（例如`greeting`/`observation`），
 * 不是用檔名命名——元件呼叫`getAssetPlaceholder('greeting')`，
 * 完全不知道最終會拿到emoji佔位符還是真正的SVG/PNG檔案路徑。
 * 未來替換真正的插畫時，只需要修改
 * `ASSET_REGISTRY`裡對應插槽的`placeholder`欄位（或未來新增一個
 * `getAssetUrl()`函式改讀真正的檔案路徑），元件程式碼**完全
 * 不需要改動**。
 */

/**
 * 所有Health Insight未來需要的插畫語意插槽——每個插槽有：
 * - `description`：這個插畫未來要傳達的情境/情緒
 * - `placeholder`：目前使用的佔位符（emoji，純文字，不是任何
 *   圖片檔案），只在文字/測試環境下也能正確顯示
 */
export const ASSET_REGISTRY = {
  greeting: { description: '陪伴角色的問候插畫（例如手繪風格的小夥伴角色），用在Dashboard開頭', placeholder: '🌱' },
  observation: { description: '觀察情境插畫，用在Health Observation Card', placeholder: '🔍' },
  recommendation: { description: '建議情境插畫，用在Recommendation Card', placeholder: '🌤️' },
  behaviorPatternPlaceholder: { description: '行為模式功能預留區的插畫（V1尚未產生真實內容）', placeholder: '🧩' },
  progressPlaceholder: { description: '進度追蹤功能預留區的插畫（V1尚未產生真實內容）', placeholder: '🌾' },
  questionCard: { description: '引導式問題卡片的插畫', placeholder: '💬' },
  errorGentle: { description: '溫和的錯誤/暫時無法使用情境插畫，刻意不用警示圖示', placeholder: '🍂' },
};

const ASSET_KEYS = Object.freeze(Object.keys(ASSET_REGISTRY));

/**
 * @returns {string[]} 目前註冊的所有插槽名稱（唯讀）
 */
export function listAssetKeys() {
  return [...ASSET_KEYS];
}

/**
 * 讀取某個插槽目前的佔位符——找不到對應插槽時安全回傳空字串，
 * 不拋出例外（延續整個系列"缺席不是例外"的既有慣例）。
 *
 * @param {string} key
 * @returns {string}
 */
export function getAssetPlaceholder(key) {
  const entry = ASSET_REGISTRY[key];
  return entry && typeof entry.placeholder === 'string' ? entry.placeholder : '';
}

/**
 * 讀取某個插槽的說明文字——用於文件/設計討論，不是給使用者
 * 看的內容。
 *
 * @param {string} key
 * @returns {string}
 */
export function getAssetDescription(key) {
  const entry = ASSET_REGISTRY[key];
  return entry && typeof entry.description === 'string' ? entry.description : '';
}
