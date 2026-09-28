/*
 * Phase 6 TASK 1.117｜Health Insight Response Boundary Refinement
 * - Health Insight Response Builder
 *
 * 責任：把Health Insight Product Integration
 * （TASK1.112，完全沒有被修改）的成功/失敗結果，轉換成一個
 * 跟呈現方式完全無關的「穩定Product Response形狀」——這是
 * TASK1.116既有的"Controller直接產生HTML"職責第一次被拆開：
 *
 *   Controller
 *     ↓
 *   Health Insight Response Builder（這裡）
 *     ↓
 *   Structured Product Response（純資料，不含任何HTML字串）
 *     ↓
 *   UI Renderer（`src/ui/health_insight/render_product_response.js`）
 *     ↓
 *   HTML
 *
 * ## 為什麼要拆開（規格原文）
 *
 * 把"要不要用HTML呈現"從Controller/Product層抽掉，未來才可能：
 * - 讓其他前端（例如純JSON API消費者）直接使用這個結構化回應，
 *   不需要解析HTML
 * - 在User Identity/OAuth接上之後，把使用者身份綁到這個回應上
 *   （`User → Identity → Health Insight Response`），不需要碰
 *   HTML呈現層
 * - 在Gemini Enhancement Layer接上之後，插在這個結構化回應跟UI
 *   Renderer之間做加值處理（`Health Insight Result → Gemini
 *   Enhancement → User Presentation`），不需要碰Product
 *   Integration本身
 * - 讓Premium/membership permission檢查有一個明確可以掛勾的資料
 *   邊界，不需要在HTML字串裡做條件判斷
 *
 * 這個檔案本身**沒有**做以上任何一件事（本次任務明確禁止整合
 * Gemini/OAuth/Membership），單純是把邊界準備好。
 *
 * ## 明確要求（規格原文）
 *
 * 成功：`{ok:true, data:{healthObservation, behaviorPattern,
 * recommendation, progressTrend, decision}}`——`data`裡的五個欄位
 * 原樣延續TASK1.108/1.111/1.112既有的Health Insight Feature
 * Result Mapper輸出形狀（`healthObservation`/`behaviorPattern`/
 * `recommendation`固定是陣列，`progressTrend`固定是物件，
 * `decision`目前固定`null`），這裡只做防禦性的型別正規化（型別
 * 不符時安全退回空陣列/空物件/null），不重新計算/不重新解讀任何
 * 內容。
 *
 * 失敗：`{ok:false, error:{type:'friendly_error', category}}`——
 * `category`是四類使用者可見錯誤分類之一（`missing_data`/
 * `invalid_input`/`unavailable_intelligence`/`temporary_failure`），
 * 延續`src/ui/health_insight/components/error_card.js`
 * （TASK1.114）已經確立的既有分類規則跟訊息內容——這裡**刻意
 * 重複**同一份`reason → category`對照表，而不是import
 * `error_card.js`本身：Response Builder屬於"Controller/Product"
 * 這一側，UI Renderer/error_card.js屬於"呈現"這一側，兩者依賴
 * 方向如果反過來（Response Builder依賴UI元件），會讓"未來API
 * 使用者不需要載入UI模組就能拿到分類過的安全錯誤"這個目標無法
 * 成立。`error_card.js`本身完全沒有被重新實作，只在TASK1.117
 * 額外新增了4筆"分類名稱本身也能被正確識別"的identity
 * mapping，讓UI Renderer可以把這裡算出的`category`直接餵給既有
 * `renderHealthInsightDashboardError()`，不需要重新解讀。
 *
 * 不論成功或失敗，這裡**完全不會**外洩`stage`/`field`/
 * `boundary`/`capability`/原始`reason`字串/例外物件——延續
 * TASK1.113/1.114已確認的Error Experience Boundary既有原則，
 * 這裡是這個原則在「結構化資料」層級（不是HTML字串層級）的
 * 第一次落地。
 */

/**
 * 已知reason字串 → 使用者可見錯誤分類的對照表——刻意跟
 * `src/ui/health_insight/components/error_card.js`的
 * `REASON_CATEGORY_MAP`維持完全相同的內容（見上方檔案頭
 * "為什麼要重複"說明）。找不到對應時安全分類成
 * `temporary_failure`（延續既有"無法辨識的失敗，用最保守/最不
 * 指責使用者的分類處理"原則）。
 */
const REASON_CATEGORY_MAP = {
  // Missing data（缺少資料）
  invalid_request: 'missing_data',
  invalid_raw_input: 'missing_data',
  invalid_options: 'missing_data',
  invalid_options_type: 'missing_data',
  invalid_user_id: 'missing_data',
  invalid_context: 'missing_data',
  // Invalid input（無效輸入）
  missing_field: 'invalid_input',
  invalid_field_type: 'invalid_input',
  // Unavailable intelligence（智慧服務不可用）
  adapter_unavailable: 'unavailable_intelligence',
  intelligence_feature_unavailable: 'unavailable_intelligence',
  capability_orchestrator_unavailable: 'unavailable_intelligence',
  analysis_capability_unavailable: 'unavailable_intelligence',
  recommendation_capability_unavailable: 'unavailable_intelligence',
  analysis_runner_unavailable: 'unavailable_intelligence',
  recommendation_runner_unavailable: 'unavailable_intelligence',
  // Temporary failure（暫時性失敗）
  capability_execution_failed: 'temporary_failure',
  internal_error: 'temporary_failure',
  mapping_failed: 'temporary_failure',
  intelligence_invalid_result: 'temporary_failure',
  capability_invalid_result: 'temporary_failure',
  unknown_error: 'temporary_failure',
};

/**
 * @param {*} reason
 * @returns {'missing_data'|'invalid_input'|'unavailable_intelligence'|'temporary_failure'}
 */
export function classifyHealthInsightErrorReason(reason) {
  if (typeof reason === 'string' && REASON_CATEGORY_MAP[reason]) {
    return REASON_CATEGORY_MAP[reason];
  }
  return 'temporary_failure';
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toSafeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 把Health Insight Product Integration成功時的`result`
 * （`{healthObservation, behaviorPattern, recommendation,
 * progressTrend, decision}`）組裝成穩定的Product Response——
 * 純資料正規化，不重新計算/不重新解讀任何內容。
 *
 * @param {object} result
 * @returns {{ok:true, data:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:*}}}
 */
export function buildSuccessResponse(result) {
  const safeResult = toSafeObject(result);
  return {
    ok: true,
    data: {
      healthObservation: toSafeArray(safeResult.healthObservation),
      behaviorPattern: toSafeArray(safeResult.behaviorPattern),
      recommendation: toSafeArray(safeResult.recommendation),
      progressTrend: toSafeObject(safeResult.progressTrend),
      decision: safeResult.decision !== undefined ? safeResult.decision : null,
    },
  };
}

/**
 * 把Health Insight Product Integration失敗時的結果（`{ok:false,
 * boundary, reason, field?, stage?}`，或直接是reason字串）組裝成
 * 穩定的友善失敗Product Response——只讀取`reason`做分類，
 * **完全不**把`reason`/`field`/`stage`/`boundary`本身放進回傳
 * 物件裡。
 *
 * @param {{reason?:string}|string} failureResultOrReason
 * @returns {{ok:false, error:{type:'friendly_error', category:string}}}
 */
export function buildFailureResponse(failureResultOrReason) {
  const reason = failureResultOrReason && typeof failureResultOrReason === 'object'
    ? failureResultOrReason.reason
    : failureResultOrReason;
  return {
    ok: false,
    error: {
      type: 'friendly_error',
      category: classifyHealthInsightErrorReason(reason),
    },
  };
}

/**
 * @returns {{buildSuccessResponse: Function, buildFailureResponse: Function}}
 */
export function createHealthInsightResponseBuilder() {
  return { buildSuccessResponse, buildFailureResponse };
}
