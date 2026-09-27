/*
 * Phase 5 TASK 1.102｜Product Operational Boundary Minimal
 * Implementation
 * - Product Operational Metadata Builder
 *
 * 責任：把`product_operational.js`裡觀察到的執行狀態，組裝成
 * 安全的Observation Metadata物件——延續系列既有"每一層自己的
 * builder只負責組裝資料形狀，不做任何業務判斷"的分工慣例，但
 * 跟`product_execution_result_builder.js`（TASK1.101）等既有
 * builder不同：這裡組裝的**不是**要回傳給呼叫端的執行結果
 * （Operational Boundary本身不改變執行結果，原樣透傳），而是
 * 要透過選填的`observer`依賴往外送出的**觀察用中繼資料**——
 * 檔名維持`_result_builder.js`只是延續系列命名慣例，內容是
 * Metadata Builder。
 *
 * 這個檔案本身：
 * - ❌ 不呼叫Intelligence Feature
 * - ❌ 不呼叫observer（那是`product_operational.js`的職責）
 * - ❌ 不讀取Date.now()/Math.random()/任何非deterministic來源
 * - ✅ 只負責把已經決定好的資料，組裝成固定形狀的Metadata物件
 *
 * 嚴格對應TASK1.96 PHASE5_OPERATIONAL_BOUNDARY_PLAN.md規劃的
 * Allowed Metadata清單——組裝出來的物件**只可能**包含
 * `phase`/`ok`/`reason`/`stage`/`version`/`durationMs`/
 * `resultCounts`七個欄位，絕對不包含`userId`、任何Insight
 * Context內容、Analysis/Recommendation的實際insight/
 * recommendation內容、`field`（Allowed Metadata清單明確沒有
 * 列出這個欄位）。
 */

/**
 * @returns {{
 *   buildStartedMetadata: () => {phase:'started'},
 *   buildCompletedMetadata: (info:{version?:string, resultCounts?:object, durationMs?:number}) => {phase:'completed', ok:true, version?:string, resultCounts?:object, durationMs?:number},
 *   buildFailedMetadata: (info:{reason:string, stage?:string, durationMs?:number}) => {phase:'failed', ok:false, reason:string, stage?:string, durationMs?:number}
 * }}
 */
export function createProductOperationalResultBuilder() {
  /**
   * `request received`階段的觀察事件——延續TASK1.96 Lifecycle
   * Visibility"記錄有一次執行請求進來了這件事本身是安全的"，
   * 這個階段還不知道成功/失敗，因此**不**帶`ok`欄位。
   *
   * @returns {{phase:'started'}}
   */
  function buildStartedMetadata() {
    return { phase: 'started' };
  }

  /**
   * `execution completed`階段的觀察事件——只包含Allowed
   * Metadata清單裡的`version`/`resultCounts`/`durationMs`，
   * 全部選填，沒有提供時不會出現在回傳物件裡（延續既有
   * builder"沒有值就不加欄位"的慣例）。
   *
   * @param {{version?:string, resultCounts?:object, durationMs?:number}} info
   * @returns {{phase:'completed', ok:true, version?:string, resultCounts?:object, durationMs?:number}}
   */
  function buildCompletedMetadata(info) {
    info = info || {};
    const metadata = { phase: 'completed', ok: true };
    if (typeof info.version === 'string' && info.version.length > 0) {
      metadata.version = info.version;
    }
    if (info.resultCounts && typeof info.resultCounts === 'object' && !Array.isArray(info.resultCounts)) {
      metadata.resultCounts = info.resultCounts;
    }
    if (typeof info.durationMs === 'number' && Number.isFinite(info.durationMs)) {
      metadata.durationMs = info.durationMs;
    }
    return metadata;
  }

  /**
   * `execution failed`階段的觀察事件——只包含Allowed
   * Metadata清單裡既有的、有限集合的`reason`/`stage`列舉值，
   * 跟`durationMs`，明確**不**包含`field`（Allowed
   * Metadata清單沒有列出這個欄位）。
   *
   * @param {{reason:string, stage?:string, durationMs?:number}} info
   * @returns {{phase:'failed', ok:false, reason:string, stage?:string, durationMs?:number}}
   */
  function buildFailedMetadata(info) {
    info = info || {};
    const metadata = {
      phase: 'failed',
      ok: false,
      reason: typeof info.reason === 'string' && info.reason.length > 0 ? info.reason : 'unknown_error',
    };
    if (typeof info.stage === 'string' && info.stage.length > 0) {
      metadata.stage = info.stage;
    }
    if (typeof info.durationMs === 'number' && Number.isFinite(info.durationMs)) {
      metadata.durationMs = info.durationMs;
    }
    return metadata;
  }

  return { buildStartedMetadata, buildCompletedMetadata, buildFailedMetadata };
}
