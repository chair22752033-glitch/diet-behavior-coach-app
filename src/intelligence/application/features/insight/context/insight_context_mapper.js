/*
 * Phase 3 TASK 1.67｜Insight Feature Context Integration Foundation
 * - Insight Context Mapper
 *
 * 責任：把Runtime Context（Facade/Application Service/Use Case/
 * Capability/Workflow/Insight Feature Capability一路pass-through、
 * 從沒被任何一層打開來看過內容的`{context, analysis,
 * recommendation}`物件——`context`本身是TASK1.42
 * `insight_context_contract.js`定義的InsightContext形狀
 * `{user, nutritionContext, behaviorContext, emotionContext,
 * activityContext, reportContext, metadata}`，`analysis`/
 * `recommendation`分別是TASK1.43/1.44 Analysis/Recommendation
 * Runner的輸出）映射成Insight Domain可以直接使用的扁平格式，
 * 「保持Domain與Runtime Context解耦」——如果未來Runtime內部怎麼
 * 巢狀（例如Facade決定把三者收斂進`result`這個中繼容器）改變，
 * Insight Domain只需要這個檔案知道怎麼轉換，不需要到處修改。
 *
 * 這個檔案是Phase 3第一個**真正打開**`result`物件、讀取
 * `context`/`analysis`/`recommendation`欄位值的層——在此之前
 * TASK1.60~1.66每一層的result builder都只是把`result`當作不透明
 * 物件原封不動往上傳（`const {status, result, metadata} = data`，
 * 從來沒有解構`result`內部）。這裡刻意打開它，但仍然只做「結構性
 * 重新排列」，不做任何推論、分類、摘要、建議、計分——跟
 * src/intelligence/facade/facade_result_builder.js當初把
 * Service回傳的`context`/`analysis`/`recommendation`三個欄位收斂
 * 進`result`是同一種「重新包裝，不重新解讀」的邊界決策，只是方向
 * 相反（這裡是攤平，不是收斂）。
 *
 * 明確要求：
 * - deterministic mapping：同樣的輸入，任何時候呼叫都得到完全相同
 *   的輸出，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只做結構性重新排列（把`result.context`/
 *   `result.analysis`/`result.recommendation`攤平成頂層欄位），
 *   完全不解讀`context`/`analysis`/`recommendation`各自內部的
 *   業務內容（不讀取`context.nutritionContext.items`這類更深的
 *   欄位，不對`analysis`/`recommendation`的內容做任何分支判斷）
 * - no AI decision：不做任何推論、分類、摘要、建議
 *
 * 這個檔案目前**沒有被** insight_capability.js（TASK1.66）import
 * ——維持TASK1.55 Governance Layer/TASK1.63 Contract Layer同樣的
 * 邊界決策（「建立但不改變既有已測試層的execution behavior」）：
 * `insight_capability.js`唯一的相對路徑import維持是
 * `./insight_result_mapper.js`不變。這裡是獨立、可驗證的映射
 * 工具，用測試直接呼叫`insight_capability.js`的真實輸出、把它
 * 餵給這裡的mapper，證明「Insight Feature事實上可以消費Runtime
 * Context」，而不是把既有、已通過測試的insight_capability.js
 * 重構成import這個目錄。
 */

/**
 * @returns {{
 *   mapRuntimeContextToInsightDomain: (workflowData:object) => {status:*, context:*, analysis:*, recommendation:*, metadata:*}
 * }}
 */
export function createInsightContextMapper() {
  /**
   * 把Insight Feature Capability（TASK1.66）`requestInsight()`成功
   * 時回傳的`data`欄位（{status, result:{context, analysis,
   * recommendation}, metadata}，`result`一路都是不透明pass-through）
   * 攤平成Insight Domain可以直接讀取的扁平格式——`context`/
   * `analysis`/`recommendation`不再需要透過`result`這個中繼容器，
   * 直接是頂層欄位。
   *
   * @param {object} workflowData - {status, result, metadata}形狀的
   *   物件（Insight Feature Capability/Workflow/Capability/Use
   *   Case/Application Service/Facade任何一層成功時回傳的`data`欄位
   *   都符合這個形狀）
   * @returns {{status:*, context:*, analysis:*, recommendation:*, metadata:*}}
   */
  function mapRuntimeContextToInsightDomain(workflowData) {
    workflowData = workflowData && typeof workflowData === 'object' ? workflowData : {};
    const { status, result, metadata } = workflowData;
    const runtimeResult = result && typeof result === 'object' && !Array.isArray(result) ? result : {};

    return {
      status: status !== undefined ? status : null,
      context: Object.prototype.hasOwnProperty.call(runtimeResult, 'context') ? runtimeResult.context : null,
      analysis: Object.prototype.hasOwnProperty.call(runtimeResult, 'analysis') ? runtimeResult.analysis : null,
      recommendation: Object.prototype.hasOwnProperty.call(runtimeResult, 'recommendation') ? runtimeResult.recommendation : null,
      metadata: metadata !== undefined ? metadata : null,
    };
  }

  return { mapRuntimeContextToInsightDomain };
}
