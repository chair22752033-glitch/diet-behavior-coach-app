/*
 * Phase 1 TASK 1.20｜User Controller
 *
 * 注意：本次任務規格的「二、Auth Controller」章節只詳細定義了 auth_controller.js
 * 的四個函式，沒有明確列出 user_controller.js 該提供什麼——這裡依照同樣的
 * 架構原則（Request → Service → Response，不碰 DB/SQL/session/OAuth），
 * 用 TASK1.15 Domain Service Layer 的 src/services/user_service.js 補上一個
 * 最基本、最低風險的讀取型 controller：依 userId 查詢使用者資料。
 *
 * 這跟 auth_controller.js 的 currentUserController()（依「目前登入的 cookie」
 * 取得使用者）是不同的關注點：這裡是「已知某個 userId，查詢它的資料」，
 * 用在使用者查詢跟「目前是誰登入」無關的情境（例如未來的管理後台，或者
 * 其他 controller 需要查詢一個已知 userId 的場景）。
 *
 * 同樣完全沒有 SQL/db.prepare()/D1操作/KV操作/OAuth流程/session邏輯，
 * 全部委派給 src/services/user_service.js（TASK1.15）。
 *
 * TASK1.28 起：response shape 改由 src/contracts/response_contract.js
 * 統一管理，這裡不再定義 success()/failure() 的形狀，只是呼叫它們。
 */
import { getUserById } from '../services/user_service.js';
import { success, failure } from '../contracts/response_contract.js';

/**
 * @param {object} db - createDb(env) 回傳的 db 物件
 * @param {{userId:string}} payload
 */
export async function getUserByIdController(db, payload) {
  try {
    if (!payload || !payload.userId || typeof payload.userId !== 'string') {
      return failure('invalid_payload', 400);
    }
    const result = await getUserById(db, payload.userId);
    if (!result.ok) {
      return failure(result.error || 'user_not_found', 404);
    }
    return success({ user: result.user });
  } catch (e) {
    return failure(e && e.message ? e.message : String(e), 500);
  }
}
