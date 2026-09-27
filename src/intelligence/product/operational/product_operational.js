/*
 * Phase 5 TASK 1.102｜Product Operational Boundary Minimal
 * Implementation
 * - Product Operational
 *
 * 責任：依照TASK1.96 Product Intelligence Operational Boundary
 * Architecture Planning規劃的方向，第一次把"Operational
 * Boundary"這個規劃概念落地成最小可運作的骨架——這是Phase 5
 * 系列**第四個**寫production code的任務（前三個是TASK1.99
 * Product Entry、TASK1.100 Product Adapter、TASK1.101 Product
 * Execution）。這個檔案本身**不**呼叫AI、**不**建立Prompt
 * Logic、**不**實作任何監控dashboard、**不**修改worker.js/
 * routes/controllers/Analysis Runner/Recommendation Runner/
 * Phase 2 Runtime Orchestrator/Phase 3 Application Pattern/
 * Phase 4 Capability Architecture——單純是Execution
 * Boundary跟Feature Intelligence Integration之間的**觀察層**：
 * 觀察執行生命週期事件、收集安全的運維中繼資料、避免收集敏感
 * 業務資料、提供選填的觀察擴充點、完全不改變執行行為。
 *
 * 架構位置（延續TASK1.96規劃的Flow）：
 *
 *   Product Entry（TASK1.99，完全不修改）
 *     ↓
 *   Product Adapter（TASK1.100，完全不修改）
 *     ↓
 *   Product Execution Boundary（TASK1.101，完全不修改）
 *     ↓（透過依賴注入拿到的intelligenceFeature介面呼叫，跟呼叫
 *        真正的Feature完全相同的方式）
 *   Product Operational Boundary（這裡）
 *     ↓（透過依賴注入拿到的intelligenceFeature介面）
 *   Feature Intelligence Integration（TASK1.79，完全不修改）
 *     ↓
 *   Capability Orchestrator / Analysis+Recommendation Capability（既有，完全不修改）
 *
 * 刻意的"透明代理"設計（延續TASK1.101 Execution Boundary已建立
 * 的模式）：Operational Boundary對外暴露跟Feature Intelligence
 * Integration/Execution Boundary完全相同的介面——
 * `requestIntelligence(request)`，而且**原樣**回傳（或原樣
 * 拋出）底層依賴的結果/例外，不新增、不修改、不吞掉任何東西。
 * 這代表Product Execution（TASK1.101）/Product Adapter
 * （TASK1.100）完全不需要修改任何程式碼，只要把原本注入的
 * `intelligenceFeature`依賴換成Operational Boundary包裝過的
 * 版本，就可以在任意位置插入這一層觀察邊界（延續Completion
 * Criteria要求的"Execution behavior unchanged"）。
 *
 * Product Operational只負責五件事（規格明確列出，不多不少）：
 * - 觀察執行生命週期事件（`request received`/`execution
 *   completed`/`execution failed`，透過選填的`observer`依賴，
 *   延續TASK1.96 Execution Observation規劃的Lifecycle
 *   Visibility）
 * - 收集安全的運維中繼資料（見下方Operational Metadata，只有
 *   `phase`/`ok`/`reason`/`stage`/`version`/`durationMs`/
 *   `resultCounts`七個可能欄位）
 * - 避免收集敏感業務資料（見下方Forbidden Metadata，絕對不
 *   包含userId、Insight Context內容、Analysis/Recommendation
 *   實際內容、任何隱藏的決策邏輯）
 * - 提供選填的觀察擴充點（`observer`依賴，延續TASK1.96 Future
 *   Monitoring Extension"選填依賴注入"原則——不提供時執行行為
 *   完全不受影響）
 * - 保持執行行為不變（Isolation原則：observer拋出例外時被
 *   吞掉、不影響原本的執行結果；底層`intelligenceFeature`回傳
 *   什麼/拋出什麼，Operational Boundary就原樣回傳/拋出什麼）
 *
 * ## Operational Metadata（延續TASK1.96規劃的Allowed/Hidden清單）
 *
 * **Allowed Metadata**（唯一允許出現在observer收到的物件裡）：
 * - `phase`：'started'|'completed'|'failed'（Operational
 *   Boundary自己的事件標籤，不是業務資料）
 * - `ok`：布林值（成功/失敗）
 * - `reason`/`stage`：既有的、有限集合的錯誤分類字串（延續
 *   TASK1.86/1.93/1.94/1.95已確認過的既有reason/stage清單）
 * - `version`：Analysis/Recommendation/Decision Result既有
 *   `metadata.version`欄位，純粹的格式版本標記
 * - `durationMs`：執行耗時（只有在依賴注入了`clock`時才會出現，
 *   對應規格"execution duration if available"）
 * - `resultCounts`：`{insights?, recommendations?}`這類陣列
 *   長度（結構性計數，不是內容）
 *
 * **Forbidden Metadata**（絕對不會出現）：
 * - ❌ `userId`／任何使用者身份識別資訊
 * - ❌ Insight Context的實際內容（`request.context`本身完全
 *   不會被讀取或傳給observer）
 * - ❌ Analysis/Recommendation的實際insight/recommendation
 *   內容（只計算陣列長度，不讀取陣列元素）
 * - ❌ 任何隱藏的決策邏輯／`field`欄位（Allowed Metadata清單
 *   沒有列出`field`，即使底層失敗結果帶了`field`，這裡也不會
 *   轉發）
 *
 * ## Isolation（隔離，延續TASK1.96明確承諾）
 *
 * - observer拋出例外時，這個例外會被完全吞掉，**不會**往外
 *   傳播、**不會**影響`requestIntelligence()`原本要回傳/拋出的
 *   結果——這是"可觀測性不能犧牲正確性"原則的具體實作。
 * - `clock`依賴讀取失敗（拋例外或回傳非數字）時，`durationMs`
 *   就簡單地不出現在metadata裡，同樣不影響執行結果。
 * - 底層`intelligenceFeature.requestIntelligence()`回傳的
 *   結果/拋出的例外，Operational Boundary**原封不動**傳遞——
 *   不重新包裝、不新增欄位、不吞掉例外（跟TASK1.101 Execution
 *   Boundary刻意把例外轉換成`execution failed`回傳值**不同**：
 *   Operational Boundary的職責是純觀察，不是失敗分類，因此
 *   底層拋例外時這裡選擇讓例外原樣往上傳播，只是先觀察一下
 *   再重新拋出）。
 *
 * 明確要求（Product Operational may call / must NOT call）：
 * - ✅ 只能呼叫依賴注入拿到的`intelligenceFeature`介面
 *   （`requestIntelligence()`）跟選填的`observer`/`clock`
 * - ❌ 不得繞過Feature Intelligence Integration直接呼叫
 *   Capability Orchestrator/Analysis Capability/Recommendation
 *   Capability（不import`src/intelligence/capabilities/`、
 *   `src/intelligence/analysis/`、
 *   `src/intelligence/recommendation/`、
 *   `src/intelligence/application/`底下任何實作檔案）
 * - ❌ 不得直接存取Database（不import`src/db/`）
 * - ❌ 不得直接存取Auth/Session（不import`src/auth/`、
 *   `src/oauth/`、`src/identity/`、`src/middleware/`）
 * - ❌ 不得知道HTTP是什麼
 * - ❌ 不得呼叫任何AI Provider/AI SDK、不得建立任何Prompt
 *   Logic、Decision Algorithm、Rule Engine、Scoring Logic
 * - ❌ 不得讀取Date.now()/Math.random()（deterministic，`clock`
 *   是選填依賴注入，不是內建的時間來源）
 *
 * 本次任務**沒有**把這個Product Operational接進
 * `src/bootstrap/application.js`，也**沒有**修改Product
 * Execution（TASK1.101）/Product Adapter（TASK1.100）任何
 * 程式碼——這是刻意的邊界決策，延續Phase 4/Phase 5系列一貫的
 * "建立但不改變既有execution behavior"模式。
 */
import { createProductOperationalResultBuilder } from './product_operational_result_builder.js';

/**
 * 從Feature Intelligence Integration成功結果的`data`欄位，安全
 * 抽取`metadata.version`——只讀取這一個純格式標記欄位，完全不
 * 讀取`insights`/`recommendations`陣列裡的實際內容。
 *
 * @param {*} data
 * @returns {string|undefined}
 */
function extractVersion(data) {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const candidates = [data.analysis, data.recommendation, data.decision];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && candidate.metadata && typeof candidate.metadata.version === 'string') {
      return candidate.metadata.version;
    }
  }
  return undefined;
}

/**
 * 從Feature Intelligence Integration成功結果的`data`欄位，安全
 * 計算結構性計數——只讀取`.length`，完全不讀取陣列元素本身。
 *
 * @param {*} data
 * @returns {{insights?:number, recommendations?:number}|undefined}
 */
function extractResultCounts(data) {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const counts = {};
  if (data.analysis && Array.isArray(data.analysis.insights)) {
    counts.insights = data.analysis.insights.length;
  }
  if (data.recommendation && Array.isArray(data.recommendation.recommendations)) {
    counts.recommendations = data.recommendation.recommendations.length;
  }
  return Object.keys(counts).length > 0 ? counts : undefined;
}

/**
 * 安全呼叫observer——拋出例外時完全吞掉，不往外傳播（延續
 * Isolation原則"觀察失敗不得影響執行結果"）。
 *
 * @param {*} observer
 * @param {object} metadata
 */
function safeObserve(observer, metadata) {
  if (typeof observer !== 'function') {
    return;
  }
  try {
    observer(metadata);
  } catch (e) {
    /* 刻意吞掉：observer的失敗不得影響Intelligence Chain本身 */
  }
}

/**
 * 安全讀取clock——沒有提供、拋出例外、或回傳非有限數字時，
 * 一律回傳undefined（`durationMs`因此就不會出現在metadata
 * 裡，延續規格"execution duration if available"的措辭）。
 *
 * @param {*} clock
 * @returns {number|undefined}
 */
function safeReadClock(clock) {
  if (typeof clock !== 'function') {
    return undefined;
  }
  try {
    const value = clock();
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch (e) {
    return undefined;
  }
}

/**
 * @param {object} dependencies
 * @param {{requestIntelligence: Function}} [dependencies.intelligenceFeature] - 選填。沒有提供、或提供的物件沒有requestIntelligence函式時，回傳{ok:false, feature:'intelligence', reason:'intelligence_feature_unavailable'}（沒有底層依賴可以透傳，這是Operational Boundary自己的contract-level guard）。
 * @param {(metadata:object) => void} [dependencies.observer] - 選填的觀察擴充點，不提供時完全不影響行為。
 * @param {() => number} [dependencies.clock] - 選填的時間來源，用來計算durationMs；不提供時durationMs不會出現在metadata裡。刻意透過依賴注入取得，這個檔案本身完全不讀取Date.now()。
 * @param {{buildStartedMetadata: Function, buildCompletedMetadata: Function, buildFailedMetadata: Function}} [dependencies.metadataBuilder]
 * @returns {{requestIntelligence: (request:{context:object, options?:object}) => *}}
 */
export function createProductOperational(dependencies) {
  dependencies = dependencies || {};
  const { intelligenceFeature, observer, clock } = dependencies;
  const metadataBuilder = dependencies.metadataBuilder || createProductOperationalResultBuilder();

  /**
   * Product Execution（TASK1.101）/Product Adapter
   * （TASK1.100）唯一需要呼叫的觀察入口——介面跟底層Feature
   * Intelligence Integration完全相同（透明代理設計）。原樣
   * 回傳/拋出底層呼叫的結果，只在旁路呼叫`observer`記錄安全的
   * 運維中繼資料。這是同步函式，跟底層依賴的同步簽名一致。
   *
   * @param {{context:object, options?:object}} request
   * @returns {*} 原樣等於`intelligenceFeature.requestIntelligence(request)`的回傳值（或該呼叫本身缺失依賴時的contract-level guard結果）
   */
  function requestIntelligence(request) {
    safeObserve(observer, metadataBuilder.buildStartedMetadata());
    const startedAt = safeReadClock(clock);

    if (!intelligenceFeature || typeof intelligenceFeature.requestIntelligence !== 'function') {
      safeObserve(observer, metadataBuilder.buildFailedMetadata({ reason: 'intelligence_feature_unavailable' }));
      return { ok: false, feature: 'intelligence', reason: 'intelligence_feature_unavailable' };
    }

    let outcome;
    try {
      outcome = intelligenceFeature.requestIntelligence(request);
    } catch (e) {
      const durationMs = computeDuration(startedAt, safeReadClock(clock));
      safeObserve(observer, metadataBuilder.buildFailedMetadata({ reason: 'internal_error', durationMs }));
      throw e;
    }

    const durationMs = computeDuration(startedAt, safeReadClock(clock));

    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      safeObserve(observer, metadataBuilder.buildFailedMetadata({ reason: 'intelligence_invalid_result', durationMs }));
      return outcome;
    }

    if (!outcome.ok) {
      safeObserve(observer, metadataBuilder.buildFailedMetadata({ reason: outcome.reason, stage: outcome.stage, durationMs }));
      return outcome;
    }

    safeObserve(observer, metadataBuilder.buildCompletedMetadata({
      version: extractVersion(outcome.data),
      resultCounts: extractResultCounts(outcome.data),
      durationMs,
    }));
    return outcome;
  }

  return { requestIntelligence };
}

/**
 * @param {number|undefined} startedAt
 * @param {number|undefined} endedAt
 * @returns {number|undefined}
 */
function computeDuration(startedAt, endedAt) {
  return typeof startedAt === 'number' && typeof endedAt === 'number' ? endedAt - startedAt : undefined;
}
