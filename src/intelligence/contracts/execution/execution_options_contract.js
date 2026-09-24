/*
 * Phase 1 TASK 1.47｜Intelligence Execution Contract Layer Foundation
 * - Execution Options Contract
 *
 * 定義 Intelligence Service（TASK1.46）`getIntelligence(db, request)`
 * 的 `request.options` 支援欄位穩定形狀規格（規格原文範例）：
 *
 * {
 *   version,
 *   includeContext,
 *   includeAnalysis,
 *   includeRecommendation,
 * }
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：這裡只檢查「有提供的欄位型別對不對」，完全不
 *   讀取這些欄位的值去做任何判斷或分支（例如不會因為
 *   includeAnalysis===false就在這一層跳過什麼，那是更底層
 *   Orchestrator/Analysis Runner未來才可能做的事，這裡純粹是形狀驗證）
 * - no AI decision：不做任何推論、分類、摘要、建議
 *
 * 全部欄位皆為選填——沒有提供 `options` 或 `options` 裡沒有這些欄位
 * 都視為合法（沿用既有Orchestrator/Analysis Runner「options不提供時
 * 使用各自預設值」的慣例，見src/intelligence/analysis/analysis_runner.js/
 * src/intelligence/orchestration/intelligence_orchestrator.js），這裡
 * 不會因為缺少某個欄位就判定失敗；只有「提供了但型別不對」才會判定
 * 失敗。
 */

export const ExecutionOptionsContract = {
  name: 'ExecutionOptions',
  fields: {
    version: 'string',
    includeContext: 'boolean',
    includeAnalysis: 'boolean',
    includeRecommendation: 'boolean',
  },
};

/**
 * @param {*} options - 選填；undefined視為合法（等同於「沒有提供任何
 *   execution options」）
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateExecutionOptions(options) {
  if (options === undefined) {
    return { ok: true };
  }

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return { ok: false, reason: 'invalid_options' };
  }

  for (const [field, expectedType] of Object.entries(ExecutionOptionsContract.fields)) {
    if (!Object.prototype.hasOwnProperty.call(options, field)) {
      continue;
    }
    if (typeof options[field] !== expectedType) {
      return { ok: false, reason: 'invalid_field_type', field };
    }
  }

  return { ok: true };
}
