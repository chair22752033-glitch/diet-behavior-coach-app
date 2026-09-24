/*
 * Phase 3 TASK 1.68｜Insight Feature Output Model Foundation
 * - Insight Output Model
 *
 * 定義Insight Domain專屬的Output穩定形狀規格——這是Insight Feature
 * （TASK1.66）跟未來呼叫端之間的最終輸出合約，不是HTTP route的
 * {request,response}契約（那是src/contracts/*.js的責任），也跟
 * TASK1.63 src/intelligence/application/contracts/
 * application_response_contract.js（Application Service/Use
 * Case/Capability/Workflow/Insight Feature共用的、`result`巢狀
 * 容器格式的response contract）是不同層次的東西：這裡描述的是
 * TASK1.67 Insight Context Mapper攤平出來的Insight Domain視圖，
 * 再經過本層轉換之後，最終要穩定對外呈現的Insight Domain Output
 * 形狀。
 *
 * InsightOutput 結構：
 * {
 *   status,          // 原樣來自Runtime（Intelligence Service成功
 *                     // 時固定為"intelligence_ready"），不解讀內容
 *   context,          // TASK1.42 InsightContext形狀
 *                     // {user, nutritionContext, behaviorContext,
 *                     // emotionContext, activityContext,
 *                     // reportContext, metadata}，原樣保留
 *   analysis,          // TASK1.43 Analysis Runner的輸出，原樣保留
 *   recommendation,     // TASK1.44 Recommendation Runner的輸出，
 *                     // 原樣保留
 *   metadata,           // Insight Feature層級的中繼資料，原樣保留
 * }
 *
 * 明確要求（規格原文）：
 * - deterministic structure：欄位清單固定，不因輸入內容而增減欄位
 * - no AI interpretation：不做任何推論、分類、摘要
 * - no scoring：不計算任何新的分數/信心值
 * - no recommendation：不產生任何建議（`recommendation`欄位本身是
 *   原樣保留Recommendation Runner既有的輸出，這一層完全不新增或
 *   修改建議內容）
 * - no prompt generation：不組裝任何字串樣板/prompt
 */

export const InsightOutputModel = {
  name: 'InsightOutput',
  fields: {
    status: 'any',
    context: 'any',
    analysis: 'any',
    recommendation: 'any',
    metadata: 'any',
  },
};

/**
 * 只驗證架構（五個欄位是否都存在），不驗證各欄位的內部業務內容——
 * 跟TASK1.63 application_response_contract.js的
 * validateApplicationResponseContract()同樣的「只驗證架構，不驗證
 * 細節」哲學。`status`/`context`/`analysis`/`recommendation`/
 * `metadata`允許任何型別的值（包含null），因為這一層完全不解讀
 * 它們的業務內容，只在乎「這個輸出物件是否具備Insight Domain
 * Output要求的完整欄位清單」。
 *
 * @param {*} output
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateInsightOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return { ok: false, reason: 'invalid_output' };
  }

  for (const field of Object.keys(InsightOutputModel.fields)) {
    if (!Object.prototype.hasOwnProperty.call(output, field)) {
      return { ok: false, reason: 'missing_field', field };
    }
  }

  return { ok: true };
}
