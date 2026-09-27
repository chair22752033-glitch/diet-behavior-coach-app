/*
 * Phase 5 TASK 1.103｜Product Contract Boundary Minimal
 * Implementation
 * - Product Contract Validator
 *
 * 責任：提供純函式的Product Request/Response形狀驗證邏輯，供
 * `product_contract.js`使用——這個檔案本身**不**呼叫Adapter、
 * **不**組裝最終回傳給呼叫端的結果形狀（那是
 * `product_contract_result_builder.js`跟`product_contract.js`
 * 的職責），只負責"這個資料形狀合不合法"這一件事。
 *
 * 本次任務把「驗證邏輯」拆成獨立檔案（跟Entry/Adapter/
 * Execution/Operational把驗證邏輯內嵌在主檔案裡不同），對應
 * 規格明確要求的`product_contract_validator.js`檔案——這是
 * Contract Boundary**專屬**的分工方式：Contract的核心職責就是
 * 驗證，因此驗證邏輯獨立成檔案，比其他邊界"驗證只是眾多職責
 * 之一"更值得拆分。
 *
 * ## 驗證範圍的刻意選擇
 *
 * TASK1.94 PHASE5_PRODUCT_INTELLIGENCE_CONTRACT_PLAN.md規劃的
 * Contract概念，原本設想的是Feature層級的`{context,
 * options?}`/`{ok, data}`Contract（Adapter跟Feature之間）。
 * 但本次任務（TASK1.103）明確要求的Implementation
 * Flow是：
 *
 * ```
 * Product Entry → Product Contract → Product Adapter → ...
 * ```
 *
 * Contract Boundary被放在Entry跟Adapter**之間**，這代表本次
 * 落地的驗證範圍是**Product Request/Response層級**的Contract
 * （Entry產生的`{userId?, rawInput, options?}`跟Adapter回傳的
 * `{ok, result}`/`{ok:false, reason, field?}`），不是
 * TASK1.94原始規劃設想的Feature層級Contract——這是延續
 * TASK1.99已建立的先例（Entry的落地範圍也曾經以本次任務自己
 * 明確的Implementation Scope為準，優先於更早、更泛用的規劃
 * 文件）。
 *
 * ## Allowed / Forbidden（規格明確列出）
 *
 * - ✅ required field validation（`rawInput`必要）
 * - ✅ optional field validation（`userId`/`options`選填）
 * - ✅ response structure validation（`{ok, result}`/`{ok:false,
 *   reason, field?, stage?}`形狀）
 * - ✅ version compatibility check（`result`裡`metadata.
 *   version`格式跟主版本相容性）
 * - ❌ Decision Algorithm/Rule Engine/Scoring Logic——版本
 *   相容性檢查只判斷"格式對不對、主版本號認不認得"，**不**對
 *   內容做任何評分/決策/業務判斷
 */

/**
 * Contract目前認得的Response版本清單——延續TASK1.94"Contract
 * 版本號目前只有v1"的既有結論，這裡對應到Analysis/
 * Recommendation Result既有`metadata.version`欄位目前唯一的
 * 既有值。只比對主版本號（第一段），次版本/修訂版本的演進
 * 規劃上視為向後相容（延續TASK1.94 Version Strategy"只新增
 * 選填欄位"的相容性原則）。
 */
export const SUPPORTED_RESPONSE_VERSIONS = ['1.0.0'];

const SEMVER_LIKE_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * 驗證Product Request最外層形狀——跟Product Entry
 * （TASK1.99）自己的`validateProductEntryRequest()`檢查範圍
 * 相同（`rawInput`必要物件、`userId`選填字串），額外加上
 * `options`選填物件的檢查（Adapter既有會讀取但Entry/Contract
 * 都還沒驗證過的欄位）。這是Contract Boundary自己獨立的驗證，
 * 不import/不重用Entry既有的驗證函式（延續系列"每一層自我
 * 完整"的既有慣例）。
 *
 * @param {*} request
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateProductRequestShape(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reason: 'invalid_request' };
  }
  if (!request.rawInput || typeof request.rawInput !== 'object' || Array.isArray(request.rawInput)) {
    return { ok: false, reason: 'invalid_raw_input', field: 'rawInput' };
  }
  if (request.userId !== undefined && typeof request.userId !== 'string') {
    return { ok: false, reason: 'invalid_user_id', field: 'userId' };
  }
  if (request.options !== undefined && (request.options === null || typeof request.options !== 'object' || Array.isArray(request.options))) {
    return { ok: false, reason: 'invalid_options', field: 'options' };
  }
  return { ok: true };
}

/**
 * 驗證Product Response最外層形狀——恰好對應Product Adapter
 * （TASK1.100）既有的回傳形狀：成功時`{ok:true, result:object}`，
 * 失敗時`{ok:false, reason:string, field?, stage?}`。這是
 * Contract Boundary的"response structure validation"職責，
 * 用來確認下游Adapter沒有回傳格式不合法的東西——不重新判斷
 * `reason`/`field`的實際內容是否合理，只確認形狀本身。
 *
 * @param {*} response
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function validateProductResponseShape(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { ok: false, reason: 'invalid_response' };
  }
  if (typeof response.ok !== 'boolean') {
    return { ok: false, reason: 'invalid_response_ok_field', field: 'ok' };
  }
  if (response.ok) {
    if (!response.result || typeof response.result !== 'object' || Array.isArray(response.result)) {
      return { ok: false, reason: 'invalid_response_result', field: 'result' };
    }
  } else {
    if (typeof response.reason !== 'string' || response.reason.length === 0) {
      return { ok: false, reason: 'invalid_response_reason', field: 'reason' };
    }
  }
  return { ok: true };
}

/**
 * 從成功的Product Response的`result`欄位，安全抽取版本標記——
 * 只讀取`metadata.version`這個純格式欄位，完全不讀取
 * `insights`/`recommendations`陣列裡的實際內容（延續TASK1.102
 * Operational Boundary已建立的"只讀安全的結構性欄位"原則）。
 *
 * @param {*} result
 * @returns {string|undefined}
 */
export function extractResponseVersion(result) {
  if (!result || typeof result !== 'object') {
    return undefined;
  }
  const candidates = [result.analysis, result.recommendation, result.decision];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && candidate.metadata && typeof candidate.metadata.version === 'string') {
      return candidate.metadata.version;
    }
  }
  return undefined;
}

/**
 * 檢查版本相容性——沒有版本資訊時視為相容（結構性缺席不等於
 * 不相容）；格式不符合`X.Y.Z`時回傳`invalid_version_format`；
 * 格式正確但主版本號不在`supportedVersions`清單裡時回傳
 * `unsupported_version`。只比對主版本號字串，不做任何語意
 * 判斷/評分。
 *
 * @param {string|undefined} version
 * @param {string[]} [supportedVersions]
 * @returns {{ok:true}|{ok:false, reason:string, field?:string}}
 */
export function checkVersionCompatibility(version, supportedVersions) {
  if (version === undefined) {
    return { ok: true };
  }
  if (typeof version !== 'string' || !SEMVER_LIKE_PATTERN.test(version)) {
    return { ok: false, reason: 'invalid_version_format', field: 'version' };
  }
  const effectiveSupported = Array.isArray(supportedVersions) && supportedVersions.length > 0 ? supportedVersions : SUPPORTED_RESPONSE_VERSIONS;
  const major = version.split('.')[0];
  const supportedMajors = effectiveSupported.map((v) => String(v).split('.')[0]);
  if (!supportedMajors.includes(major)) {
    return { ok: false, reason: 'unsupported_version', field: 'version' };
  }
  return { ok: true };
}

/**
 * @param {{supportedVersions?:string[]}} [dependencies]
 * @returns {{
 *   validateProductRequestShape: typeof validateProductRequestShape,
 *   validateProductResponseShape: typeof validateProductResponseShape,
 *   extractResponseVersion: typeof extractResponseVersion,
 *   checkVersionCompatibility: (version:string|undefined) => {ok:true}|{ok:false, reason:string, field?:string}
 * }}
 */
export function createProductContractValidator(dependencies) {
  dependencies = dependencies || {};
  const supportedVersions = Array.isArray(dependencies.supportedVersions) && dependencies.supportedVersions.length > 0
    ? dependencies.supportedVersions
    : SUPPORTED_RESPONSE_VERSIONS;

  return {
    validateProductRequestShape,
    validateProductResponseShape,
    extractResponseVersion,
    checkVersionCompatibility: (version) => checkVersionCompatibility(version, supportedVersions),
  };
}
