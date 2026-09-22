/*
 * Phase 1 TASK 1.17｜OAuth 常數
 *
 * 這裡只放「公開資訊」：Google 官方文件公布的固定端點 URL、標準 scope 字串、
 * state 有效期預設值。完全沒有 client_id/client_secret 這類機密資訊——
 * 那些一律由外部注入（見 google.js 的 config 參數），不可以出現在這個檔案。
 */

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const GOOGLE_DEFAULT_SCOPE = 'openid email profile';

// OAuth state（CSRF防護用）預設有效期：10 分鐘
export const OAUTH_STATE_TTL_SECONDS = 600;
