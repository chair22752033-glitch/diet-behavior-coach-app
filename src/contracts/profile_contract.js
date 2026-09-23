/*
 * Phase 1 TASK 1.37｜Profile Contract
 *
 * 定義 getProfileController（GET /api/profile）/
 * updateProfileController（PATCH /api/profile）的 request/response 規格。
 *
 * getProfileContract：沒有body，request schema為空物件（跟TASK1.35/1.36
 * 的list/dashboard contract一致）。
 *
 * updateProfileContract：payload只認得displayName一個選填欄位——這裡的
 * type:'string'檢查只負責型別，「空字串拒絕」跟「長度限制」是業務規則，
 * 交給 src/services/profile_service.js 處理（該檔案的
 * DISPLAY_NAME_MAX_LENGTH明確定義為100字）。schema裡完全不包含
 * auth_provider/auth_provider_id/is_guest/status/id/created_at/
 * last_login_at/user_id這些identity/system欄位——即使payload夾帶，
 * contract validation不會因為schema沒列出而報錯（validateBody()只檢查
 * 「有列在schema裡的欄位」），但src/controllers/profile_controller.js
 * 在轉交給service前就已經用白名單方式完全過濾掉這些欄位，兩層防禦。
 */

export const getProfileContract = {
  request: {},
  response: {
    success: {
      id: 'string',
      displayName: 'object', // 可能是null，跟其他contract的nullable欄位同一種寬鬆標記慣例
      isGuest: 'boolean',
      authProvider: 'object', // 可能是null
      status: 'string',
      createdAt: 'string',
      lastLoginAt: 'object', // 可能是null
    },
    failureReasons: ['not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown', 'profile_fetch_failed'],
    failureStatus: [401, 500],
  },
};

export const updateProfileContract = {
  request: {
    displayName: { required: false, type: 'string' },
  },
  response: {
    success: {
      id: 'string',
      displayName: 'object',
      isGuest: 'boolean',
      authProvider: 'object',
      status: 'string',
      createdAt: 'string',
      lastLoginAt: 'object',
    },
    failureReasons: [
      'not_authenticated', 'user_not_found', 'user_suspended', 'user_deleted', 'user_status_unknown',
      'invalid_display_name', 'display_name_too_long', 'no_fields_to_update', 'update_failed',
    ],
    failureStatus: [400, 401, 500],
  },
};
