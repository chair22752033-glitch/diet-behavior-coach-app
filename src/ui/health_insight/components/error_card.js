/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構，見下方"TASK1.115更新"區塊）
 * - Error Card（Error Presentation）
 *
 * 責任：把Health Insight Integration（TASK1.112）既有的結構化
 * 失敗結果`{ok:false, boundary, reason, field?, stage?}`，轉換
 * 成使用者看得懂、不帶技術細節的錯誤卡片——延續TASK1.113第8節
 * Error Experience Boundary已經規劃的四類使用者可見錯誤分類
 * （Missing data/Invalid input/Unavailable
 * intelligence/Temporary failure）跟"User Message跟Internal
 * Error Detail分離"原則，這裡是這個原則第一次真正落地成程式碼。
 *
 * ## 明確要求（規格原文）
 *
 * - ✅ Separate: User message from Internal error details
 * - ❌ Never expose: stack trace、runtime exception、internal
 *   capability information
 *
 * `createErrorCard()`回傳的HTML字串**只包含**分類後的友善
 * 訊息文字，**不包含**原始的`reason`字串、`field`、`stage`，
 * 也不包含任何例外物件——呼叫端如果需要記錄原始錯誤細節做
 * 除錯，應該另外處理（例如記錄在開發者console，不是這個函式
 * 回傳的HTML裡），這個函式的回傳值本身就是"對外安全"的。
 *
 * ## TASK1.115更新：視覺重構
 *
 * emoji圖示（🍂）換成真正的插畫
 * （`companion-apologetic.webp`，角色溫柔低頭、表示暫時遇到
 * 小狀況——這是使用者提供的參考圖裡明確標註"抱歉"情境的表情，
 * `DESIGN_SPECIFICATION.md`第5節原本標註這是"參考圖沒有直接
 * 範例、需要另外設計"的資產，本次任務收到使用者提供的第二批
 * 參考圖後補齊）。顏色從`caution`（原本偏赭石橘）微調成更
 * 貼近參考圖角色臉頰暖色調的霧玫瑰色（見
 * `design_tokens.js`的`COLOR_TOKENS.caution`調整說明）。
 */
import { escapeHtml } from './html_utils.js';
import { createIllustration } from './illustration.js';

/**
 * 已知reason字串 → 使用者可見錯誤分類的對照表——延續
 * TASK1.99~1.113已經確認的既有reason命名（Product
 * Entry/Contract/Adapter/Execution/Health Insight
 * Feature/Capability各自既有的失敗reason）。找不到對應時安全
 * 分類成"temporary_failure"（延續"無法辨識的失敗，用最保守/
 * 最不指責使用者的分類處理"原則）。
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
 * 四類使用者可見錯誤分類各自的訊息內容——延續"低壓力、不指責
 * 使用者、不使用刺眼警示色"的拙趣設計原則。
 */
const CATEGORY_MESSAGES = {
  missing_data: { title: '資料還沒填完整', body: '請確認需要的資訊都已經填寫囉' },
  invalid_input: { title: '這筆資料看起來不太對', body: '麻煩再檢查一下剛剛輸入的內容' },
  unavailable_intelligence: { title: '我這邊暫時休息一下', body: '智慧分析功能現在還沒準備好，等一下再試試看' },
  temporary_failure: { title: '好像出了一點小狀況', body: '不是你的問題，稍後再試一次應該就可以了' },
};

/**
 * @param {string} reason
 * @returns {'missing_data'|'invalid_input'|'unavailable_intelligence'|'temporary_failure'}
 */
export function classifyErrorReason(reason) {
  if (typeof reason === 'string' && REASON_CATEGORY_MAP[reason]) {
    return REASON_CATEGORY_MAP[reason];
  }
  return 'temporary_failure';
}

/**
 * 把Health Insight Integration既有的失敗結果轉換成使用者可見的
 * 錯誤卡片HTML——只讀取`failureResult.reason`來分類，**不**把
 * `reason`/`field`/`stage`本身、也不把任何例外物件放進回傳的
 * HTML字串裡。
 *
 * @param {{reason?:string}|string} failureResultOrReason - 可以直接傳Health Insight Integration既有的失敗結果物件，也可以直接傳reason字串
 * @returns {string}
 */
export function createErrorCard(failureResultOrReason) {
  const reason = failureResultOrReason && typeof failureResultOrReason === 'object'
    ? failureResultOrReason.reason
    : failureResultOrReason;
  const category = classifyErrorReason(reason);
  const { title, body } = CATEGORY_MESSAGES[category];

  return [
    `<div class="hi-card hi-error-card hi-error-${escapeHtml(category)}">`,
    createIllustration('errorGentle'),
    '  <div class="hi-card-body">',
    `    <div class="hi-card-label">${escapeHtml(title)}</div>`,
    `    <div class="hi-card-explanation">${escapeHtml(body)}</div>`,
    '  </div>',
    '</div>',
  ].join('\n');
}
