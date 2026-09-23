/*
 * Phase 1 TASK 1.20｜Response Format 統一（TASK1.28 起改為 re-export Contract Layer）
 *
 * success(data)/failure(reason,status) 的權威定義已經搬到 TASK1.28 的
 * src/contracts/response_contract.js——這裡只是向下相容的 re-export，
 * 讓既有 import '../controllers/response.js' 的地方（例如TASK1.20的
 * 測試）不用改，但「這個形狀該長怎樣」的定義權已經統一交給 Contract
 * Layer 管理，不在這裡定義。
 */
export { success, failure } from '../contracts/response_contract.js';
