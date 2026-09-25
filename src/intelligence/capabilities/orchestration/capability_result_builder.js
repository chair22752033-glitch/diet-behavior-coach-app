/*
 * Phase 4 TASK 1.78｜Intelligence Capability Orchestration Foundation
 * （TASK1.86後更新：新增選填的decisionResult參數）
 * - Capability Orchestrator Result Builder
 *
 * 定義 Capability Orchestrator 對外的穩定回傳格式：
 *
 * 成功（沒有decisionCapability依賴時，TASK1.78既有行為，完全不變）：
 * {
 *   ok: true,
 *   capability: 'orchestration',
 *   result: {
 *     analysis: { status, insights, metadata },
 *     recommendation: { status, recommendations, metadata },
 *   },
 * }
 *
 * 成功（TASK1.86新增：有decisionCapability依賴時，額外多一個
 * decision欄位）：
 * {
 *   ok: true,
 *   capability: 'orchestration',
 *   result: {
 *     analysis: { status, insights, metadata },
 *     recommendation: { status, recommendations, metadata },
 *     decision: { status, decision, metadata },
 *   },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   capability: 'orchestration',
 *   reason,
 *   field?,
 *   stage?,
 * }
 *
 * `result`欄位刻意用`{analysis, recommendation, decision?}`這種
 * nested形狀分別保留Analysis Capability（TASK1.76）、
 * Recommendation Capability（TASK1.77）、Decision
 * Capability（TASK1.83）各自原本產生的Result，不重新拆開、合併、
 * 或改寫成新的欄位名稱——理由跟TASK1.76/1.77/1.83的result builder
 * 同一種哲學：Orchestrator的責任是「接收intelligence capability
 * request、呼叫Analysis Capability、把Analysis Result傳遞給
 * Recommendation Capability（、再視情況把Recommendation Result
 * 傳遞給Decision Capability）、回傳Unified Capability
 * Result」，Unified Capability Result就是這幾段既有Result的
 * 組合，不需要、也不應該在這裡發明新的合併語意。
 *
 * `decision`欄位是**選填**的（TASK1.86新增，依照TASK1.85
 * Integration Architecture Plan記錄的設計圖落地）——
 * `buildSuccessResult()`第三個參數`decisionResult`只在呼叫端
 * 明確傳入（非`undefined`）時才會被組進`result.decision`；沒有
 * 傳入時（呼叫端只傳兩個參數，等同於`decisionResult ===
 * undefined`），`result`物件裡**完全不會出現**`decision`這個
 * key（不是`decision: undefined`，而是這個key根本不存在）——這
 * 是Backward Compatibility的關鍵：既有呼叫端（例如TASK1.78~1.85
 * 各自的測試套件）呼叫`buildSuccessResult(analysisResult,
 * recommendationResult)`（只傳兩個參數）時，回傳的`result`物件
 * 依然恰好只有`analysis`/`recommendation`兩個key，
 * `Object.keys(result).sort()`依然回傳`['analysis',
 * 'recommendation']`，完全不受這次擴充影響。
 *
 * `stage`欄位（'analysis'|'recommendation'|'decision'）是
 * Orchestrator新增的失敗定位資訊，指出Unified Flow在哪一段失敗
 * ——TASK1.86新增了`'decision'`這個可能值，語意跟既有的
 * `'analysis'`/`'recommendation'`完全一致，繼續是`field`一樣的
 * 選填欄位，不影響既有的{ok,capability,reason,field?}失敗形狀
 * 相容性。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議文字
 * - no scoring：不計算任何新的分數/信心值
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部狀態，
 *   同樣的輸入永遠得到完全相同的輸出
 */

const CAPABILITY_NAME = 'orchestration';

/**
 * @returns {{
 *   buildSuccessResult: (analysisResult:object, recommendationResult:object, decisionResult?:object) => {ok:true, capability:'orchestration', result:{analysis:object, recommendation:object, decision?:object}},
 *   buildFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, capability:'orchestration', reason:string, field?:string, stage?:string}
 * }}
 */
export function createCapabilityOrchestratorResultBuilder() {
  /**
   * @param {object} analysisResult - Analysis Capability（TASK1.76）
   *   requestAnalysis()成功時回傳的`result`欄位
   *   （{status, insights, metadata}），這裡只是重新包裝，不修改
   *   任何欄位的值
   * @param {object} recommendationResult - Recommendation
   *   Capability（TASK1.77）requestRecommendation()成功時回傳的
   *   `result`欄位（{status, recommendations, metadata}），同樣
   *   原樣保留
   * @param {object} [decisionResult] - 選填。Decision
   *   Capability（TASK1.83）requestDecision()成功時回傳的`result`
   *   欄位（{status, decision, metadata}），同樣原樣保留。只有
   *   在呼叫端明確傳入（非undefined）時，回傳的result物件才會
   *   包含`decision`這個key——這是TASK1.86 Backward
   *   Compatibility的關鍵，見本檔案開頭說明。
   * @returns {{ok:true, capability:'orchestration', result:{analysis:object, recommendation:object, decision?:object}}}
   */
  function buildSuccessResult(analysisResult, recommendationResult, decisionResult) {
    const result = {
      analysis: analysisResult && typeof analysisResult === 'object' ? analysisResult : {},
      recommendation: recommendationResult && typeof recommendationResult === 'object' ? recommendationResult : {},
    };
    if (decisionResult !== undefined) {
      result.decision = decisionResult && typeof decisionResult === 'object' ? decisionResult : {};
    }
    return {
      ok: true,
      capability: CAPABILITY_NAME,
      result,
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，轉發自Analysis Capability/
   *   Recommendation Capability/Decision Capability的field
   * @param {string} [stage] - 選填，指出Unified Flow在哪一段失敗
   *   （'analysis'|'recommendation'|'decision'，TASK1.86新增
   *   'decision'這個可能值），驗證階段本身失敗時不提供（代表
   *   request形狀本身就不合法，尚未進入任何一段Capability）
   * @returns {{ok:false, capability:'orchestration', reason:string, field?:string, stage?:string}}
   */
  function buildFailureResult(reason, field, stage) {
    const failure = {
      ok: false,
      capability: CAPABILITY_NAME,
      reason: typeof reason === 'string' ? reason : 'unknown_error',
    };
    if (typeof field === 'string' && field.length > 0) {
      failure.field = field;
    }
    if (typeof stage === 'string' && stage.length > 0) {
      failure.stage = stage;
    }
    return failure;
  }

  return { buildSuccessResult, buildFailureResult };
}
