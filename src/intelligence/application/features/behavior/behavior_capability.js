/*
 * Phase 3 TASK 1.72｜Behavior Feature Foundation
 * - Behavior Capability + Behavior Use Case
 *
 * 責任：這是Phase 3第二個Intelligence Application Feature domain
 * （"behavior"）在Capability/Use Case這兩層的實作，驗證TASK1.71
 * Extension Pattern Review的結論——Capability Layer（TASK1.62）跟
 * Use Case Layer（TASK1.61）都是body完全通用的「薄模板」，新增
 * Feature domain時複製這個模板、換掉NAME常數跟入口方法名稱即可，
 * 不需要修改任何既有Insight相關檔案。
 *
 * 跟`application/capabilities/insight_capability.js`（TASK1.62）/
 * `application/use_cases/insight_use_case.js`（TASK1.61）不同的
 * 地方：本次任務的Implementation Scope明確只列出
 * `src/intelligence/application/features/behavior/`底下5個檔案
 * （不包含在`application/capabilities/`、`application/
 * use_cases/`底下新增檔案），因此這裡把「Capability」跟「Use
 * Case」兩個角色實作成同一個檔案裡兩個獨立的具名export——
 * `createBehaviorUseCase()`跟`createBehaviorCapability()`——各自
 * 的body形狀完全比照TASK1.61/1.62既有檔案（驗證輸入→呼叫下一層→
 * 包裝結果，三段式），不引入任何新的Layer類型（本次任務明確禁止
 * 「建立新Layer」）。
 *
 * 這裡刻意**不**import`../../capabilities/capability_result_builder.js`
 * 或`../../use_cases/use_case_result_builder.js`（那兩個共用Result
 * Builder雖然完全domain-agnostic、可以被安全共用——見
 * `../../EXTENSION_PATTERN.md`第1節——但兩者從TASK1.60/1.61建立
 * 當下就是設計成給**同目錄底下**的檔案import使用，例如
 * `insight_capability.js`只import同目錄的`./capability_result_
 * builder.js`，`insight_use_case.js`只import同目錄的`./use_case_
 * result_builder.js`，從來沒有任何檔案跨目錄直接import別人的
 * Result Builder）。本次任務的Implementation Scope明確把Behavior
 * 的所有檔案限制在`features/behavior/`這一個目錄底下，若在這裡
 * 跨目錄import`application/capabilities/`、`application/
 * use_cases/`底下的檔案，會產生一種既有程式碼裡從未出現過的新
 * cross-directory依賴型態（不是「上層index.js認識自己nested子
 * 目錄」這種既有允許的邊界，而是「兩個平行的Feature/Layer目錄
 * 互相跨界直接reach進對方內部檔案」）。因此這裡選擇完全比照
 * TASK1.71 Extension Pattern Review第2節的結論——複製Result
 * Builder的「形狀」（`{ok, name, data:{status,result,metadata}}`/
 * `{ok:false, name, reason}`），改成同一個檔案裡的內部私有函式，
 * 不做跨目錄import，維持「每一層/每個Feature目錄完全自成一體」的
 * 既有邊界慣例。
 *
 * 架構位置（規格原文）：
 *
 *   Behavior Feature（behavior_feature.js）
 *     ↓
 *   Workflow（TASK1.64，本次任務為Behavior domain另外建立一個
 *   獨立的Workflow實例，注入這裡的createBehaviorCapability()）
 *     ↓
 *   Capability（這裡，createBehaviorCapability）
 *     ↓
 *   Use Case（這裡，createBehaviorUseCase）
 *     ↓
 *   Application Service（TASK1.60，跟Insight共用同一個既有實例——
 *   Application Service本身完全domain-agnostic，不解讀「behavior」
 *   或「insight」的差異，重複使用它不代表依賴Insight Feature）
 *     ↓
 *   Intelligence Runtime
 *
 * 明確要求（Behavior Capability/Use Case may call / must NOT call）：
 * - ✅ Use Case只能呼叫Application Service
 *   （`applicationService.requestIntelligence()`）
 * - ✅ Capability只能呼叫Use Case（`useCase.requestUserBehavior()`）
 * - ❌ 不直接呼叫Intelligence Facade（不import src/intelligence/
 *   facade/）
 * - ❌ 不直接呼叫Execution Manager（不import
 *   src/intelligence/execution/）
 * - ❌ 不直接存取History Store、Metrics Store、Event Dispatcher
 * - ❌ 不直接存取Database（不import src/db/底下任何檔案——db只是
 *   原樣轉交給下一層的不透明參數）
 * - ❌ 不import src/intelligence/service/、orchestration/、
 *   analysis/、recommendation/、data_preparation/、governance/
 * - ❌ 不呼叫任何AI Provider/AI SDK
 * - ❌ 完全不import`application/capabilities/insight_capability.js`
 *   或`application/use_cases/insight_use_case.js`（不依賴Insight
 *   Feature，兩個domain完全平行、互不認識）
 * - ❌ 完全不跨目錄import`application/capabilities/`、
 *   `application/use_cases/`底下任何檔案（維持「每個Feature目錄
 *   完全自成一體」的既有邊界慣例，見上方說明）
 *
 * `createBehaviorCapability()`回傳的公開方法刻意命名為
 * `requestInsightCapability`（不是`requestBehaviorCapability`）——
 * 這不是筆誤、也不是意外依賴Insight：TASK1.71 Extension Pattern
 * Review（見`../../EXTENSION_PATTERN.md`第3節「已知的命名細節」）
 * 已經記錄，`workflows/application_workflow.js`（TASK1.64）預期
 * 注入的capability依賴**一定要**提供一個叫做`requestInsightCapability`
 * 的方法，這是Workflow既有介面的字面要求，不解讀方法名稱的業務
 * 含義（Workflow只檢查`typeof capability.requestInsightCapability
 * === 'function'`）。本次任務刻意不修改`application_workflow.js`
 * 把這個介面方法名稱改成更通用的名字（那屬於「修改既有、被大量
 * 既有測試覆蓋的Workflow介面」，不在本次任務授權範圍內），而是
 * 遵循TASK1.71已經審查驗證過的路徑：讓Behavior domain自己的
 * Capability物件也提供這個介面方法名稱，藉此重複使用同一個
 * `createApplicationWorkflow()`工廠函式，建立一個完全獨立、只服務
 * Behavior domain的新Workflow實例。
 */

const BEHAVIOR_USE_CASE_NAME = 'behavior';
const BEHAVIOR_CAPABILITY_NAME = 'behavior';

/**
 * 驗證 requestUserBehavior() 的 request 輸入——只檢查這一層自己
 * 需要知道的最小欄位（userId是否為非空字串、options存在時是否為
 * 物件），不解讀options的業務內容。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateBehaviorUseCaseRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (typeof request.userId !== 'string' || request.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id' };
  }
  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options_type' };
  }
  return { ok: true };
}

/**
 * 比照`use_case_result_builder.js`（TASK1.61）的形狀，就地建立
 * Use Case Result——同一個檔案內的私有函式，不跨目錄import共用的
 * Result Builder（見本檔案開頭說明）。
 *
 * @param {object} applicationData - Application Service成功時回傳
 *   的`data`欄位（{status, result, metadata}），這裡只是重新包裝，
 *   不修改任何欄位的值
 * @returns {{ok:true, useCase:'behavior', data:{status:*, result:*, metadata:*}}}
 */
function buildUseCaseSuccessResult(applicationData) {
  applicationData = applicationData && typeof applicationData === 'object' ? applicationData : {};
  const { status, result, metadata } = applicationData;
  return { ok: true, useCase: BEHAVIOR_USE_CASE_NAME, data: { status, result, metadata } };
}

/**
 * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
 *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
 * @returns {{ok:false, useCase:'behavior', reason:string}}
 */
function buildUseCaseFailureResult(reason) {
  return { ok: false, useCase: BEHAVIOR_USE_CASE_NAME, reason: typeof reason === 'string' ? reason : 'unknown_error' };
}

/**
 * @param {object} dependencies
 * @param {{requestIntelligence: (db:object, request:object) => Promise<{ok:boolean, data?:object, reason?:string}>}} dependencies.applicationService
 * @returns {{requestUserBehavior: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, useCase:'behavior', data:{status:*, result:*, metadata:*}}|{ok:false, useCase:'behavior', reason:string}>}}
 */
export function createBehaviorUseCase(dependencies) {
  dependencies = dependencies || {};
  const { applicationService } = dependencies;

  /**
   * User Application唯一需要呼叫的「取得使用者Behavior」場景入口：
   * 驗證輸入 → 呼叫Application Service（唯一允許呼叫的下一層）→
   * 回傳穩定的use case結果格式。任何一步失敗都立刻回傳
   * {ok:false, useCase:'behavior', reason}，不會用不完整的資料
   * 頂替繼續執行。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   applicationService.requestIntelligence()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request
   * @returns {Promise<{ok:true, useCase:'behavior', data:{status:*, result:*, metadata:*}}|{ok:false, useCase:'behavior', reason:string}>}
   */
  async function requestUserBehavior(db, request) {
    const validation = validateBehaviorUseCaseRequest(request);
    if (!validation.ok) {
      return buildUseCaseFailureResult(validation.reason);
    }

    if (!applicationService || typeof applicationService.requestIntelligence !== 'function') {
      return buildUseCaseFailureResult('application_service_unavailable');
    }

    const outcome = await applicationService.requestIntelligence(db, request);
    if (!outcome.ok) {
      return buildUseCaseFailureResult(outcome.reason);
    }

    return buildUseCaseSuccessResult(outcome.data);
  }

  return { requestUserBehavior };
}

/**
 * 驗證 requestInsightCapability() 的 request 輸入——跟
 * validateBehaviorUseCaseRequest()規則相同，但刻意各自獨立實作，
 * 不互相重用，維持「每一層邊界獨立」的既有慣例。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function validateBehaviorCapabilityRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (typeof request.userId !== 'string' || request.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id' };
  }
  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options_type' };
  }
  return { ok: true };
}

/**
 * 比照`capability_result_builder.js`（TASK1.62）的形狀，就地建立
 * Capability Result——同一個檔案內的私有函式，不跨目錄import共用
 * 的Result Builder（見本檔案開頭說明）。
 *
 * @param {object} useCaseData - Use Case成功時回傳的`data`欄位
 *   （{status, result, metadata}），這裡只是重新包裝，不修改任何
 *   欄位的值
 * @returns {{ok:true, capability:'behavior', data:{status:*, result:*, metadata:*}}}
 */
function buildCapabilitySuccessResult(useCaseData) {
  useCaseData = useCaseData && typeof useCaseData === 'object' ? useCaseData : {};
  const { status, result, metadata } = useCaseData;
  return { ok: true, capability: BEHAVIOR_CAPABILITY_NAME, data: { status, result, metadata } };
}

/**
 * @param {string} [reason] - 失敗原因字串，一律由呼叫端明確傳入；
 *   不是字串時安全正規化為 'unknown_error'，不猜測、不拋出例外
 * @returns {{ok:false, capability:'behavior', reason:string}}
 */
function buildCapabilityFailureResult(reason) {
  return { ok: false, capability: BEHAVIOR_CAPABILITY_NAME, reason: typeof reason === 'string' ? reason : 'unknown_error' };
}

/**
 * @param {object} dependencies
 * @param {{requestUserBehavior: (db:object, request:object) => Promise<{ok:boolean, useCase?:string, data?:object, reason?:string}>}} dependencies.useCase
 * @returns {{requestInsightCapability: (db:object, request:{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}) => Promise<{ok:true, capability:'behavior', data:{status:*, result:*, metadata:*}}|{ok:false, capability:'behavior', reason:string}>}}
 */
export function createBehaviorCapability(dependencies) {
  dependencies = dependencies || {};
  const { useCase } = dependencies;

  /**
   * Workflow唯一需要呼叫的「Behavior能力」進入點——方法名稱固定為
   * `requestInsightCapability`，這是`createApplicationWorkflow()`
   * （TASK1.64）既有介面要求的字面方法名稱，不是業務上依賴
   * Insight Feature（見本檔案開頭說明跟`../../EXTENSION_PATTERN.md`
   * 第3節）。驗證capability輸入 → 呼叫Use Case（唯一允許呼叫的
   * 下一層）→ 回傳穩定的capability結果格式。
   *
   * @param {object} db - createDb(env) 回傳的 db 物件，一律由呼叫端
   *   傳入，這裡不持有任何狀態，原樣轉交給
   *   useCase.requestUserBehavior()
   * @param {{userId:string, options?:object, requestId?:string, version?:string, timestamp?:string, metadata?:object}} request
   * @returns {Promise<{ok:true, capability:'behavior', data:{status:*, result:*, metadata:*}}|{ok:false, capability:'behavior', reason:string}>}
   */
  async function requestInsightCapability(db, request) {
    const validation = validateBehaviorCapabilityRequest(request);
    if (!validation.ok) {
      return buildCapabilityFailureResult(validation.reason);
    }

    if (!useCase || typeof useCase.requestUserBehavior !== 'function') {
      return buildCapabilityFailureResult('use_case_unavailable');
    }

    const outcome = await useCase.requestUserBehavior(db, request);
    if (!outcome.ok) {
      return buildCapabilityFailureResult(outcome.reason);
    }

    return buildCapabilitySuccessResult(outcome.data);
  }

  return { requestInsightCapability };
}
