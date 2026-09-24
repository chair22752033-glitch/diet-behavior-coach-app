/*
 * Phase 1 TASK 1.49｜Intelligence Runtime Context Layer Foundation
 * - Runtime Context Builder
 *
 * 責任：把呼叫端傳入的（可能不完整的）執行期資訊，套上固定預設值後
 * 組成通過驗證的 Runtime Context（見 runtime_context.js）。這一層是
 * Facade（TASK1.48）跟未來需要讀取執行期資訊的地方之間的邊界，架構
 * 位置：
 *
 *   Intelligence Facade（TASK1.48）
 *     ↓
 *   Runtime Context Builder（這裡）── 建立跟業務輸入分開的執行期上下文
 *     ↓
 *   （跟request一起）Intelligence Service（TASK1.46）
 *
 * 明確要求：
 * - deterministic output：同樣的輸入，任何時候呼叫都得到完全相同的
 *   輸出，不讀取Date.now()/Math.random()/任何外部狀態——`timestamp`
 *   刻意不在這裡內部產生（那會讓輸出不再deterministic），一律由
 *   呼叫端透過`input.timestamp`明確傳入，沒有提供時安全預設為null，
 *   不猜測、不使用目前時間
 * - no database access：完全不 import src/db/ 底下任何檔案，這個
 *   檔案甚至不接受db參數
 * - no HTTP：不知道 Request/Response 是什麼
 * - no authentication parsing：不 import src/auth/ 或 src/identity/，
 *   userId 一律由呼叫端當作獨立欄位傳入，這裡不做任何身份驗證
 * - no AI logic：不做任何推論、分類、摘要、建議
 *
 * 預設值（規格原文）：
 * - requestId: null
 * - version: "1"
 * - timestamp: null
 * - metadata: {}
 */
import { validateRuntimeContext } from './runtime_context.js';

export const DEFAULT_REQUEST_ID = null;
export const DEFAULT_VERSION = '1';
export const DEFAULT_TIMESTAMP = null;

/**
 * @param {object} input
 * @param {string} input.userId - 必填，非空字串
 * @param {string} [input.requestId] - 選填，沒有提供時預設為null
 * @param {string} [input.version] - 選填，沒有提供時預設為"1"
 * @param {string} [input.timestamp] - 選填，沒有提供時預設為null（這裡
 *   不會自己讀取目前時間）
 * @param {object} [input.metadata] - 選填，沒有提供時預設為{}
 * @returns {{ok:true, context:{requestId:string|null, userId:string, version:string, timestamp:string|null, metadata:object}}|{ok:false, reason:string, field?:string}}
 */
export function createRuntimeContext(input) {
  input = input && typeof input === 'object' ? input : {};

  const context = {
    requestId: input.requestId !== undefined ? input.requestId : DEFAULT_REQUEST_ID,
    userId: input.userId,
    version: input.version !== undefined ? input.version : DEFAULT_VERSION,
    timestamp: input.timestamp !== undefined ? input.timestamp : DEFAULT_TIMESTAMP,
    metadata: input.metadata !== undefined ? input.metadata : {},
  };

  return validateRuntimeContext(context);
}
