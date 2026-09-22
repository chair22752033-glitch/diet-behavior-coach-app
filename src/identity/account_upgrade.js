/*
 * Phase 1 TASK 1.14｜Guest Upgrade Interface（upgradeIdentity）
 *
 * 這是「將來要開放給使用者用的升級介面」該長的樣子，但本次只建立介面本身，
 * 不執行任何 OAuth、沒有 Google callback、沒有 OAuth route、沒有登入頁面。
 *
 * 內部直接委派給 TASK1.13B 已經寫好並通過測試的 upgradeGuestToProvider()，
 * 不重複實作同一套邏輯——這裡的存在意義是提供 TASK1.14 規格要求的
 * upgradeIdentity() 這個對外可見的名稱與呼叫慣例，方便未來真正接上
 * OAuth callback 時，callback 只需要呼叫這一個函式。
 *
 * upgradeIdentity() 內部已經做到（沿用 upgrade.js 的邏輯，逐條對應）：
 *   1. 驗證目前 user 是 guest（不是 guest 會回傳 reason:'not_guest'）
 *   2. 驗證 provider 合法（不支援或缺 providerId 會回傳 reason:'invalid_provider'）
 *   3. 更新 users（auth_provider/auth_provider_id/is_guest）
 *   4. 保留原 user_id（原地更新同一列，id 從頭到尾不變）
 *   5. 保留所有歷史資料（子表全部用 FK 指向 users.id，id 不變資料自然還在）
 */
export { upgradeGuestToProvider as upgradeIdentity } from './upgrade.js';
