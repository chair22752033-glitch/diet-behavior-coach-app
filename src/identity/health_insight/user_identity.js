/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation
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
});

/**
 * 判斷傳入的值是否已經是合法的User Identity Context形狀——純
 * 結構檢查（型別是否相符），不判斷`userId`/`provider`的實際內容
 * 有沒有意義（那不是這一層的責任）。
 *
 * @param {*} identity
 * @returns {boolean}
 */
export function isValidUserIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
  if (identity.userId !== null && typeof identity.userId !== 'string') return false;
  if (typeof identity.authenticated !== 'boolean') return false;
  if (identity.provider !== null && typeof identity.provider !== 'string') return false;
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
 * @returns {{userId:string|null, authenticated:boolean, provider:string|null}}
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

  return { userId, authenticated: true, provider };
}
