/*
 * Phase 3 TASK 1.68｜Insight Feature Output Model Foundation
 * - Insight Output Mapper
 *
 * 責任：把TASK1.67 Insight Context Mapper攤平出來的Insight Domain
 * 視圖（`{status, context, analysis, recommendation, metadata}`，
 * `mapRuntimeContextToInsightDomain()`的回傳值）轉換成
 * `insight_output_model.js`定義的穩定Insight Domain Output格式，
 * 並用`validateInsightOutput()`驗證輸出形狀——「保持Feature與
 * Runtime Result格式隔離」的具體落地：Insight Feature（TASK1.66）
 * 對外呈現的最終格式由這一層決定，即使Runtime內部的
 * result/context/analysis/recommendation巢狀方式未來演進，只要
 * Context Mapper（TASK1.67）跟這一層知道怎麼轉換，Insight Domain
 * Output的形狀就可以保持不變。
 *
 * 架構位置（規格原文）：
 *
 *   Insight Feature
 *     ↓
 *   Insight Context Mapper（TASK1.67）
 *     ↓
 *   Insight Output Mapper（這裡）
 *     ↓
 *   Insight Domain Output
 *
 * 這個架構位置描述的是Output Mapper在整條鏈路裡「概念上」的合法
 * 定位——跟TASK1.63 Contract Layer/TASK1.67 Insight Context
 * Layer的架構位置圖同樣的性質：這個檔案目前**沒有**透過import被
 * 實際串接進`insight_capability.js`（TASK1.66）或
 * `insight_context_mapper.js`（TASK1.67）的原始碼。這裡是獨立、
 * 可驗證的轉換工具，用測試直接呼叫Insight Feature Capability的
 * 真實輸出、經過Insight Context Mapper攤平、再餵給這裡的Output
 * Mapper，證明「Insight Feature事實上可以產生穩定的Insight
 * Domain Output」，而不是把既有、已通過測試的層重構成import這個
 * 目錄。
 *
 * 明確要求：
 * - deterministic mapping：同樣的輸入，任何時候呼叫都得到完全
 *   相同的輸出，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只做結構性重新排列跟形狀驗證，完全不解讀
 *   `context`/`analysis`/`recommendation`各自內部的業務內容
 * - no AI decision：不做任何推論、分類、摘要、建議
 */
import { validateInsightOutput } from './insight_output_model.js';

/**
 * @returns {{
 *   mapToInsightOutput: (insightDomainView:object) => {ok:true, output:{status:*, context:*, analysis:*, recommendation:*, metadata:*}}|{ok:false, reason:string, field?:string}
 * }}
 */
export function createInsightOutputMapper() {
  /**
   * @param {object} insightDomainView - TASK1.67
   *   `mapRuntimeContextToInsightDomain()`回傳的Insight Domain
   *   視圖（{status, context, analysis, recommendation, metadata}）
   * @returns {{ok:true, output:{status:*, context:*, analysis:*, recommendation:*, metadata:*}}|{ok:false, reason:string, field?:string}}
   */
  function mapToInsightOutput(insightDomainView) {
    insightDomainView = insightDomainView && typeof insightDomainView === 'object' ? insightDomainView : {};
    const { status, context, analysis, recommendation, metadata } = insightDomainView;

    const output = {
      status: status !== undefined ? status : null,
      context: context !== undefined ? context : null,
      analysis: analysis !== undefined ? analysis : null,
      recommendation: recommendation !== undefined ? recommendation : null,
      metadata: metadata !== undefined ? metadata : null,
    };

    const validation = validateInsightOutput(output);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, field: validation.field };
    }

    return { ok: true, output };
  }

  return { mapToInsightOutput };
}
