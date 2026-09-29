/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation
 * （Phase 7 TASK1.126後更新：新增`isGuest`/`userType`語意分類
 * 欄位，見下方"TASK1.126更新"區塊）
 * - User Identity Context（穩定的內部身份表示）
 *
 * 責任：定義一個跟"目前是誰登入"這件事完全無關的**穩定形狀**
 * （`{userId, authenticated, provider}`），供未來Health Insight
 * 個人化/歷史紀錄/Premium/Gemini Enhancement Layer掛勾使用。
 *
 * 這個檔案本身**是純函式**：不接受db參數、不解析cookie、不呼叫
 * 任何D1操作——它只負責"把既有Auth Layer已經驗證好的使用者
 * row，轉成Health Insight這條產品線需要的中性身份形狀"，真正
 * 讀取session/cookie/D1的工作交給`resolve_identity.js`（TASK1.118
 * 新增，重用既有`src/identity/session_rules.js`）。
 *
 * ## Identity Ownership（規格原文，這裡是這個原則的具體落地）
 *
 * ```
 * Authentication Layer（既有src/auth/、src/oauth/、src/identity/）
 *   ↓
 * User Identity Object（這裡）
 *   ↓
 * Product Layer（Health Insight Controller/Product Integration）
 * ```
 *
 * `buildUserIdentity()`的輸出**刻意只保留三個欄位**——不含
 * `auth_provider_id`/`email`/`display_name`/`legacy_sync_code`/
 * 任何D1原始欄位，`provider`也只是一個字串標籤（例如`'google'`/
 * `'guest'`），不是完整的OAuth provider物件——這是規格明確要求的
 * "Do not send OAuth details into Capability Layer"在這一層的
 * 具體實作：往下游（Product/Capability Layer）看得到的身份資訊
 * 天生就只有這三個欄位，沒有任何管道可以夾帶更多。
 *
 * ## 明確不做的事
 *
 * - ❌ 不判斷/不影響"這個使用者能不能用某個功能"（那是Membership/
 *   Feature Permission的職責，見`membership_placeholder.js`，本次
 *   任務只建立extension point，不實作真正的權限判斷）
 * - ❌ 不強制要求登入——`ANONYMOUS_IDENTITY`是完全合法、必須繼續
 *   支援的狀態，不是"錯誤"或"降級"狀態
 * - ❌ 不快取/不持久化任何身份資訊（每次呼叫`buildUserIdentity()`
 *   都是全新、獨立的計算，deterministic，不讀取Date.now()/
 *   Math.random()/任何外部狀態）
 *
 * ## TASK1.126更新：新增`isGuest`/`userType`語意分類欄位
 *
 * 規格明確指出TASK1.125發現的產品語意落差：既有Guest帳號
 * （`is_guest:1`）被這個檔案轉成跟Google登入使用者完全相同的
 * `{authenticated:true}`，導致下游（Persistence/History
 * Boundary）沒有辦法區分"這是暫時體驗的訪客"還是"這是真正的
 * 註冊使用者"。這裡**不移除、不修改**既有的
 * `userId`/`authenticated`/`provider`三個欄位（延續"這是規格
 * 明確要求的穩定三欄位形狀"既有結論，OAuth/Session/既有
 * authentication流程完全不受影響）——只**新增**兩個欄位，讓
 * 語意分類成為這個穩定形狀的一部分，而不是額外建立一套新的
 * 身份系統：
 *
 * - `isGuest`：`boolean`，true代表這是訪客帳號（`is_guest:1`），
 *   false代表匿名或Google登入使用者
 * - `userType`：`'anonymous' | 'guest' | 'registered'`，三選一
 *   的語意標籤，方便下游程式碼用一個欄位直接判斷，不用自己重新
 *   推導`authenticated`+`isGuest`的組合邏輯
 *
 * 下游的Persistence Boundary（`src/persistence/health_insight/
 * health_insight_persistence_service.js`）跟History Retrieval
 * Boundary（`src/history/health_insight/history_service.js`）
 * 各自獨立實作了自己的"這是不是guest"判斷（延續整個系列"不共用
 * 內部實作細節，各自對公開行為負責"既有原則），判斷條件同時
 * 接受`identity.isGuest === true`**或**`identity.provider ===
 * 'guest'`兩種寫法——這是刻意的向下相容設計：既有19個測試套件
 * 裡大量存在只手動組出`{userId, authenticated:true,
 * provider:'guest'}`三欄位（沒有`isGuest`/`userType`）的
 * identity fixture，這些fixture在TASK1.126之後依然會被正確
 * 判定為guest，不需要每一個都改寫成新形狀。
 */

/**
 * 匿名使用者的身份物件——Health Insight目前唯一、也是預設的正式
 * 支援狀態。刻意用`Object.freeze()`避免任何呼叫端不小心修改到
 * 共用的常數物件。
 */
export const ANONYMOUS_IDENTITY = Object.freeze({
  userId: null,
  authenticated: false,
  provider: null,
  isGuest: false,
  userType: 'anonymous',
});

/**
 * 判斷傳入的值是否已經是合法的User Identity Context形狀——純
 * 結構檢查（型別是否相符），不判斷`userId`/`provider`的實際內容
 * 有沒有意義（那不是這一層的責任）。`isGuest`/`userType`是
 * TASK1.126新增的選填欄位——省略時視為合法（向下相容既有只有
 * 三欄位的identity物件），出現時才檢查型別是否正確。
 *
 * @param {*} identity
 * @returns {boolean}
 */
export function isValidUserIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
  if (identity.userId !== null && typeof identity.userId !== 'string') return false;
  if (typeof identity.authenticated !== 'boolean') return false;
  if (identity.provider !== null && typeof identity.provider !== 'string') return false;
  if ('isGuest' in identity && typeof identity.isGuest !== 'boolean') return false;
  if ('userType' in identity && typeof identity.userType !== 'string') return false;
  return true;
}

/**
 * 把既有Auth Layer（`src/identity/session_rules.js`的
 * `validateSessionWithIdentity()`）驗證通過後拿到的`user`
 * row（`db.users.getById()`回傳的原始D1 row，欄位包含
 * `id`/`auth_provider`/`auth_provider_id`/`display_name`/
 * `is_guest`/`status`/`legacy_sync_code`/`created_at`/
 * `updated_at`），轉成中性的User Identity
 * Context。任何不符合預期形狀的輸入都安全回傳
 * `ANONYMOUS_IDENTITY`，不拋出例外——延續整個系列"防禦性正規化，
 * 不因為輸入不完整就整個request失敗"的既有慣例。
 *
 * 訪客（`is_guest`）視為`authenticated:true`、
 * `provider:'guest'`——訪客一樣有真實的session/使用者row（延續
 * TASK1.29既有guest登入流程既定的"訪客是完整功能帳號，不是
 * 匿名狀態"既有結論），跟完全沒有session的"匿名"是不同的兩種
 * 狀態。
 *
 * @param {object|null} user
 * @returns {{userId:string|null, authenticated:boolean, provider:string|null, isGuest:boolean, userType:'anonymous'|'guest'|'registered'}}
 */
export function buildUserIdentity(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    return ANONYMOUS_IDENTITY;
  }

  const userId = typeof user.id === 'string' && user.id.length > 0 ? user.id : null;
  if (!userId) {
    return ANONYMOUS_IDENTITY;
  }

  const isGuest = user.is_guest === 1 || user.is_guest === true;
  const provider = isGuest
    ? 'guest'
    : (typeof user.auth_provider === 'string' && user.auth_provider.length > 0 ? user.auth_provider : null);

  return {
    userId,
    authenticated: true,
    provider,
    isGuest,
    userType: isGuest ? 'guest' : 'registered',
  };
}
