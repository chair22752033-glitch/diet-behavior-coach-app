/*
 * Phase 1 TASK 1.49｜Intelligence Runtime Context Layer Foundation
 * - Runtime Context Contract
 *
 * 定義 Intelligence Runtime Context 的穩定形狀規格——這是Facade
 * （TASK1.48）建立、跟業務輸入（userId/options）分開的「執行期資訊」
 * 邊界：requestId（追蹤用）、version（context格式版本）、
 * timestamp（執行時間戳，由呼叫端明確提供，這裡不猜測）、
 * metadata（保留給未來擴充的自由欄位），不是HTTP route的
 * {request,response}契約（那是src/contracts/*.js的責任），也跟
 * src/intelligence/contracts/execution/（Service的request/options/
 * response契約）是不同層次的東西——這裡描述的是「單次Intelligence
 * 執行的執行期上下文」，不是業務資料本身。
 *
 * RuntimeContext 結構（規格原文）：
 * {
 *   requestId,
 *   userId,
 *   version,
 *   timestamp,
 *   metadata,
 * }
 *
 * 必填：userId
 * 選填：requestId / version / timestamp / metadata
 *
 * 明確要求：
 * - deterministic validation：同樣的輸入，任何時候呼叫都得到完全相同
 *   的驗證結果，不讀取Date.now()/Math.random()/任何外部狀態
 * - no business logic：只檢查形狀（欄位型別是否相符），不解讀
 *   metadata的業務內容
 * - no AI decision：不做任何推論、分類、摘要
 */

export const RuntimeContextContract = {
  name: 'RuntimeContext',
  required: ['userId'],
  optional: ['requestId', 'version', 'timestamp', 'metadata'],
};

/**
 * 只驗證架構（userId是否為非空字串、其餘選填欄位存在時型別是否相符），
 * 不驗證metadata的內部業務內容——跟
 * src/intelligence/contracts/execution/的三個contract同樣的「只驗證
 * 架構，不驗證細節」哲學。驗證成功時把（已通過驗證的）context原樣
 * 一併回傳，方便呼叫端（runtime_context_builder.js）不用再重新組裝
 * 一次。
 *
 * @param {*} context
 * @returns {{ok:true, context:object}|{ok:false, reason:string, field?:string}}
 */
export function validateRuntimeContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return { ok: false, reason: 'invalid_context' };
  }

  if (typeof context.userId !== 'string' || context.userId.length === 0) {
    return { ok: false, reason: 'invalid_user_id', field: 'userId' };
  }

  if (context.requestId !== undefined && context.requestId !== null && typeof context.requestId !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'requestId' };
  }

  if (context.version !== undefined && typeof context.version !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'version' };
  }

  if (context.timestamp !== undefined && context.timestamp !== null && typeof context.timestamp !== 'string') {
    return { ok: false, reason: 'invalid_field_type', field: 'timestamp' };
  }

  if (context.metadata !== undefined && (context.metadata === null || typeof context.metadata !== 'object' || Array.isArray(context.metadata))) {
    return { ok: false, reason: 'invalid_field_type', field: 'metadata' };
  }

  return { ok: true, context };
}
