/*
 * Phase 1 TASK 1.13B｜User Status 基礎
 * 對應 D1 schema 的 CHECK 約束：migrations/0004_phase1_task1_13b_users_identity.sql
 */

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
});

export const ALL_STATUSES = Object.freeze([USER_STATUS.ACTIVE, USER_STATUS.SUSPENDED, USER_STATUS.DELETED]);

export function isValidStatus(status) {
  return ALL_STATUSES.indexOf(status) >= 0;
}

/** 判斷這個狀態的使用者是否允許正常使用（session驗證、登入等都應該檢查這個） */
export function isActiveStatus(status) {
  return status === USER_STATUS.ACTIVE;
}

/**
 * @param {object} user - users表的一列資料（至少要有 status 欄位）
 * @returns {{allowed:boolean, reason?:string}}
 */
export function canLogIn(user) {
  if (!user) return { allowed: false, reason: 'user_not_found' };
  if (user.status === USER_STATUS.SUSPENDED) return { allowed: false, reason: 'user_suspended' };
  if (user.status === USER_STATUS.DELETED) return { allowed: false, reason: 'user_deleted' };
  if (!isActiveStatus(user.status)) return { allowed: false, reason: 'user_status_unknown' };
  return { allowed: true };
}
