/*
 * Phase 1 TASK 1.42｜Insight Context Integration Layer
 * - Insight Context Contract
 *
 * 定義 Insight Context 的穩定形狀規格——這是 Data Preparation Layer
 * （TASK1.41）跟 Insight Service（TASK1.40）之間的內部合約，不是HTTP
 * route的{request,response}契約（那是src/contracts/*.js的責任），也
 * 跟src/intelligence/contracts.js（InsightResponse/AnalysisResult/
 * RecommendationResult三個回傳值形狀）是不同層次的東西：這裡描述的是
 * 「Insight Service內部真正拿去餵給Analysis Engine之前」的資料形狀。
 *
 * 明確要求（規格原文）：
 * - deterministic structure：欄位清單固定，不因輸入內容而增減欄位
 * - no AI interpretation：不做任何推論、分類、摘要
 * - no scoring：不計算任何新的分數/信心值
 * - no recommendation：不產生任何建議
 * - no prompt generation：不組裝任何字串樣板/prompt
 *
 * InsightContext 結構：
 * {
 *   user,               // TASK1.41 data_normalizer.js 的白名單使用者欄位（或null）
 *   nutritionContext,    // 對應 dataPreparation 的 foodEvents {count, items}
 *   behaviorContext,      // 對應 dataPreparation 的 behaviors {count, items}
 *   emotionContext,        // 對應 dataPreparation 的 emotions {count, items}
 *   activityContext,         // 對應 dataPreparation 的 explorations {count, items}
 *   reportContext,             // 對應 dataPreparation 的 reports {count, items}
 *   metadata,                   // 純結構性統計摘要（見下方說明），不含任何解讀
 * }
 */

export const InsightContextContract = {
  name: 'InsightContext',
  fields: {
    user: 'object', // 允許 null
    nutritionContext: 'object',
    behaviorContext: 'object',
    emotionContext: 'object',
    activityContext: 'object',
    reportContext: 'object',
    metadata: 'object',
  },
};

// 每個 XxxContext 欄位（nutritionContext/behaviorContext/...）本身也是
// 固定形狀 {count, items}，沿用 TASK1.41 data_normalizer.js 已經建立的
// 慣例，這裡再度宣告一次供 validateInsightContext() 檢查用，不是重新
// 定義一套新規則。注意：items 刻意不用 typeof==='object' 檢查——
// typeof null 也是 'object'，會讓 items:null 誤判成合法，這裡用
// Array.isArray() 明確要求它必須是真正的陣列。
const CONTEXT_SECTION_KEYS = ['nutritionContext', 'behaviorContext', 'emotionContext', 'activityContext', 'reportContext'];

/**
 * 只驗證架構（欄位是否存在、typeof是否相符），不驗證欄位內容細節——
 * 跟 src/middleware/validator.js 的 validateBody() 同樣的「只驗證
 * 架構，不驗證細節」哲學。
 *
 * @param {*} context
 * @returns {{ok:boolean, reason?:string, field?:string}}
 */
export function validateInsightContext(context) {
  if (!context || typeof context !== 'object') {
    return { ok: false, reason: 'invalid_context' };
  }

  for (const field of Object.keys(InsightContextContract.fields)) {
    if (!Object.prototype.hasOwnProperty.call(context, field)) {
      return { ok: false, reason: 'missing_field', field };
    }
  }

  // user 允許是 null（訪客/找不到使用者時的合法值），但存在時必須是物件
  if (context.user !== null && typeof context.user !== 'object') {
    return { ok: false, reason: 'invalid_field_type', field: 'user' };
  }

  for (const sectionKey of CONTEXT_SECTION_KEYS) {
    const section = context[sectionKey];
    if (!section || typeof section !== 'object') {
      return { ok: false, reason: 'invalid_field_type', field: sectionKey };
    }
    if (typeof section.count !== 'number') {
      return { ok: false, reason: 'invalid_field_type', field: `${sectionKey}.count` };
    }
    if (!Array.isArray(section.items)) {
      return { ok: false, reason: 'invalid_field_type', field: `${sectionKey}.items` };
    }
  }

  if (!context.metadata || typeof context.metadata !== 'object') {
    return { ok: false, reason: 'invalid_field_type', field: 'metadata' };
  }

  return { ok: true };
}
