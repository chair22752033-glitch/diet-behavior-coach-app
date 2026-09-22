/*
 * Phase 1 TASK 1.13A｜Token 驗證基礎
 *
 * 兩種 token 都用標準 Web Crypto API（Cloudflare Workers 與 Node 19+ 皆原生支援，
 * 不需要額外套件），本檔案不含任何實際登入流程，純粹是可重複使用的基礎工具：
 *
 * 1. generateOpaqueToken()：產生 session id 用的不透明隨機字串
 *    （目前 session 機制採用這種，配合 D1 的 sessions 表查表驗證）
 * 2. hmacSign() / hmacVerify()：通用的 HMAC 簽章工具，供未來需要「不查資料庫、
 *    純驗簽即可」的無狀態 token 使用（例如電子郵件驗證連結、密碼重設連結），
 *    本次沒有任何地方呼叫它，只是先把工具準備好
 */

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 產生一個不透明的隨機 token（base64url 編碼），用作 session id。
 * @param {number} [byteLength=32] 隨機位元組數，預設 256-bit
 */
export function generateOpaqueToken(byteLength) {
  const bytes = new Uint8Array(byteLength || 32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function importHmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * 對一段字串資料做 HMAC-SHA256 簽章，回傳 base64url 編碼的簽章值。
 * @param {string} data 要簽章的內容（例如 "userId:expiresAt"）
 * @param {string} secret 簽章密鑰（未來若啟用，應存放在 Cloudflare Worker Secret，不可寫死在程式碼或提交進版本控制）
 */
export async function hmacSign(data, secret) {
  const key = await importHmacKey(secret);
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

/**
 * 驗證 HMAC 簽章是否與資料相符。
 * @returns {Promise<boolean>}
 */
export async function hmacVerify(data, signatureBase64Url, secret) {
  try {
    const key = await importHmacKey(secret);
    const enc = new TextEncoder();
    const sigBytes = fromBase64Url(signatureBase64Url);
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
  } catch (e) {
    return false;
  }
}

/**
 * 組成一個「資料.簽章」格式的簽章型 token，並提供對應的驗證函式，
 * 供未來需要無狀態 token（不查資料庫）時使用，例如：
 *   const token = await signToken('reset:' + userId + ':' + expiresAt, secret);
 *   const ok = await verifyToken(token, secret); // ok.valid, ok.payload
 */
export async function signToken(payload, secret) {
  const sig = await hmacSign(payload, secret);
  return payload + '.' + sig;
}

export async function verifyToken(token, secret) {
  const idx = token.lastIndexOf('.');
  if (idx < 0) return { valid: false, payload: null };
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const valid = await hmacVerify(payload, sig, secret);
  return { valid, payload: valid ? payload : null };
}

/**
 * 對一段字串做 SHA-256 雜湊，回傳十六進位字串。
 * 用途：sessions.ip_hash 只存 IP 的雜湊值、不存明文 IP（隱私考量，見 src/auth/README.md）。
 * 建議搭配一個不外流的 salt 一起雜湊（例如 salt+ip），單純雜湊IP本身仍可能被彩虹表反查。
 */
export async function sha256Hex(data) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
