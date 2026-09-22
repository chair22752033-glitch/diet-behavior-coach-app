/*
 * Phase 1 TASK 1.13A｜Session 基礎架構 - 常數設定
 *
 * 這裡只是集中管理數值，方便未來啟用時統一調整，本身不含任何邏輯。
 */

// Cookie 名稱：用專屬前綴避免與其他工具/擴充功能的cookie衝突
export const SESSION_COOKIE_NAME = 'dbc_sid';

// Session 預設有效期：30 天（單位：秒）
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Opaque session token 的隨機位元數（256-bit，等同業界常見標準，例如 Django/Rails 的session id長度級別）
export const SESSION_TOKEN_BYTES = 32;

// Cookie 預設安全旗標（見 src/auth/README.md「安全考量」章節）
export const COOKIE_DEFAULTS = {
  path: '/',
  httpOnly: true,
  secure: true, // 正式環境（HTTPS）必須為 true；本機 http 開發時由呼叫端明確覆寫為 false
  sameSite: 'Lax',
};
