/*
 * Phase 6 TASK 1.111｜Health Insight Feature Foundation
 * Implementation
 * - Health Insight Result Mapper
 *
 * 責任：把Capability Orchestrator（TASK1.78，完全不修改）回傳的
 * Unified Capability Result（`{analysis, recommendation,
 * decision?}`），轉換成TASK1.108 Health Insight Output Boundary
 * Definition定義的四類使用者可見輸出——`healthObservation`/
 * `behaviorPattern`/`recommendation`/`progressTrend`，外加一個
 * `decision`欄位（TASK1.111規格要求的"future decision
 * placeholder"）。這個檔案本身**不**呼叫AI、**不**產生任何自然
 * 語言、**不**計算任何新的分數/信心值——單純是Health Insight
 * Feature專屬的Product-Specific呈現轉換層。
 *
 * 對照TASK1.108第4節Output Responsibility Mapping已確認的分工：
 * Capability Layer產出結構化中繼資料（analysis
 * result/recommendation result）、Feature
 * Layer（這裡）做"Health Insight特定"的二次轉換（決定哪些
 * insight呈現為Health Observation、哪些呈現為Progress
 * Trend），Product Layer（未來，本次任務不建立）再做最終的
 * user-facing呈現跟措辭。這個mapper只做到Feature
 * Layer這一段——結構化的欄位重新分類，**不**做任何文字措辭轉換
 * （例如不會把`{type:'activity_count', value:3}`轉換成"這週
 * 記錄了3次活動"這類自然語言句子，延續TASK1.108第2節C
 * "本次任務不定義具體的轉換/措辭邏輯"的既定結論）。
 *
 * 成功：
 * {
 *   ok: true,
 *   feature: 'health_insight',
 *   data: {
 *     healthObservation: Array<{type:string, value:*}>,
 *     behaviorPattern: Array,
 *     recommendation: Array<{type:string, value:*}>,
 *     progressTrend: object,
 *     decision: null,
 *   },
 * }
 *
 * 失敗：
 * {
 *   ok: false,
 *   feature: 'health_insight',
 *   reason,
 *   field?,
 *   stage?,
 * }
 *
 * ## 四類輸出欄位的對應規則（逐一說明）
 *
 * ### healthObservation（延續TASK1.108第2節A）
 *
 * 來源：`capabilityResult.analysis.insights`（Analysis
 * Capability既有輸出，`{type, value, source}`陣列）。轉換規則：
 * 保留`type`/`value`，**捨棄**`source`欄位——延續TASK1.108第2節
 * A"What Remains Internal"明確列出的結論："insight物件裡的
 * `source`欄位...這些是系統內部用來確認資料完整性/串接正確性的
 * 欄位，對使用者的健康理解沒有直接幫助"。同樣捨棄Analysis
 * Capability整體回傳的`status`欄位（例如`'analysis_ready'`），
 * 理由相同。
 *
 * ### behaviorPattern（延續TASK1.108第2節B）
 *
 * 固定回傳空陣列`[]`——延續TASK1.108第2節B"Future Extension
 * Possibility"明確記錄的結論："Behavior Pattern目前不屬於V1
 * 範圍...要真正產生Behavior Pattern這類輸出，需要新增Analysis
 * Runner的模組"。本次任務**沒有**、也**不應該**新增任何跨時間
 * 模式偵測邏輯（那會是重新實作Analysis
 * Capability的職責，違反TASK1.111"Do NOT move capability logic
 * into Feature"的明確規則）。這裡回傳空陣列只是**確認這個輸出
 * 類別的形狀存在**，不是假裝已經有真實的Behavior
 * Pattern資料——延續TASK1.108"這是規劃層級的類別確認，不是V1會
 * 實際產生的輸出"既定結論。
 *
 * ### recommendation（延續TASK1.108第2節C）
 *
 * 來源：`capabilityResult.recommendation.recommendations`
 * （Recommendation Capability既有輸出，`{type, value,
 * source}`陣列）。轉換規則跟healthObservation完全一致：保留
 * `type`/`value`，捨棄`source`。延續TASK1.108第2節C"本次任務不
 * 定義具體的轉換/措辭邏輯"的既定結論，這裡**不**把
 * `{type:'insight_count', value:6}`轉換成"根據你這週6筆記錄，
 * 建議..."這類自然語言句子，只做結構化的欄位重新分類。
 *
 * ### progressTrend（延續TASK1.108第2節D）
 *
 * 固定回傳空物件`{}`——延續TASK1.108第2節D"Current V1
 * Boundary"確認的結論："V1只有weight trend"，但weight
 * trend需要**跨時間**的weight資料序列（延續TASK1.107第2節D
 * Measurement Data規劃），這需要一個**新的**Analysis模組讀取
 * 歷史weight記錄——這個Feature Foundation階段**沒有**接上任何
 * 歷史資料來源（Capability Orchestrator呼叫鏈完全不知道
 * database/history的存在），所以這裡同樣只確認輸出類別的形狀
 * 存在，不假裝已經有真實的Progress Trend資料。
 *
 * ### decision（TASK1.111規格要求的"future decision
 * placeholder"）
 *
 * 固定回傳`null`——延續Decision Capability（TASK1.83）既有的
 * `decision: null`佔位設計，即使`capabilityResult.decision`存在
 * （Capability Orchestrator有注入`decisionCapability`依賴時），
 * 這裡讀取的也是Decision Capability既有回傳的
 * `result.decision`欄位，該欄位本身在TASK1.83~1.87建立以來就
 * 一直是`null`（真正的決策邏輯明確留給未來任務，這是TASK1.83
 * 建立時就確立的邊界，本次任務沒有改變它，也沒有注入
 * decisionCapability給Capability Orchestrator）。
 *
 * 明確要求：
 * - structured data only：不產生任何自然語言、不產生任何建議文字
 * - no scoring：不計算任何新的分數/信心值
 * - no capability internal structure exposure：不暴露
 *   `capability:'orchestration'`這類Capability層內部標籤（延續
 *   TASK1.108第3節Internal Only "capability internal
 *   structure"明確禁止項目）
 * - no runtime metadata exposure：不暴露`status`/`metadata`這類
 *   Capability整體回傳欄位（延續TASK1.108第3節Internal Only
 *   "runtime metadata"明確禁止項目）
 * - deterministic：不讀取 Date.now()/Math.random()/任何外部
 *   狀態，同樣的輸入永遠得到完全相同的輸出
 */

const FEATURE_NAME = 'health_insight';

/**
 * 把單一個Analysis/Recommendation Result item（`{type, value,
 * source}`）轉換成Health Insight呈現用的`{type, value}`，捨棄
 * `source`欄位。不是合法物件時安全地回傳`null`（由呼叫端過濾）。
 *
 * @param {*} item
 * @returns {{type:*, value:*}|null}
 */
function mapResultItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }
  return { type: item.type !== undefined ? item.type : null, value: item.value !== undefined ? item.value : null };
}

/**
 * @param {*} items
 * @returns {Array<{type:*, value:*}>}
 */
function mapResultItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  const mapped = [];
  for (const item of items) {
    const result = mapResultItem(item);
    if (result) {
      mapped.push(result);
    }
  }
  return mapped;
}

/**
 * @returns {{
 *   mapSuccessResult: (capabilityResult:object) => {ok:true, feature:'health_insight', data:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:null}},
 *   mapFailureResult: (reason:string, field?:string, stage?:string) => {ok:false, feature:'health_insight', reason:string, field?:string, stage?:string}
 * }}
 */
export function createHealthInsightResultMapper() {
  /**
   * @param {object} capabilityResult - Capability
   *   Orchestrator（TASK1.78）requestCapabilityFlow()成功時回傳的
   *   `result`欄位（{analysis, recommendation, decision?}）
   * @returns {{ok:true, feature:'health_insight', data:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:null}}}
   */
  function mapSuccessResult(capabilityResult) {
    capabilityResult = capabilityResult && typeof capabilityResult === 'object' ? capabilityResult : {};
    const analysis = capabilityResult.analysis && typeof capabilityResult.analysis === 'object' ? capabilityResult.analysis : {};
    const recommendation = capabilityResult.recommendation && typeof capabilityResult.recommendation === 'object' ? capabilityResult.recommendation : {};
    const decisionResult = capabilityResult.decision && typeof capabilityResult.decision === 'object' ? capabilityResult.decision : null;

    return {
      ok: true,
      feature: FEATURE_NAME,
      data: {
        healthObservation: mapResultItems(analysis.insights),
        behaviorPattern: [],
        recommendation: mapResultItems(recommendation.recommendations),
        progressTrend: {},
        decision: decisionResult && decisionResult.decision !== undefined ? decisionResult.decision : null,
      },
    };
  }

  /**
   * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
   *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
   * @param {string} [field] - 選填，轉發自Capability Orchestrator/
   *   Analysis Capability/Recommendation Capability的field
   * @param {string} [stage] - 選填，轉發自Capability
   *   Orchestrator的stage（'analysis'|'recommendation'|'decision'）
   *   或Health Insight Feature自己標記的
   *   'request'|'capability'|'mapping'|'runtime'
   * @returns {{ok:false, feature:'health_insight', reason:string, field?:string, stage?:string}}
   */
  function mapFailureResult(reason, field, stage) {
    const failure = {
      ok: false,
      feature: FEATURE_NAME,
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

  return { mapSuccessResult, mapFailureResult };
}
