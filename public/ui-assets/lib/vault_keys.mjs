/*
 * Shipped vault key helpers (native Web Crypto) for the no-bundler browser.
 * Recovery-code encode/decode, HKDF recovery wrap key, VK wrap/unwrap, and trusted-device
 * (non-extractable AES-KW key in IndexedDB). Used by the vault + migration pages.
 */
export const FORMAT = 'dms-e2ee-1';
const INFO = 'diet-main-show|recovery-wrap|v1';
const CB32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const te = new TextEncoder();

export function rand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
export function b64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
export function unb64(s) { const bin = atob(s); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
export function encRecovery(bytes) { let bits = 0, val = 0, out = ''; for (let i = 0; i < bytes.length; i++) { val = (val << 8) | bytes[i]; bits += 8; while (bits >= 5) { out += CB32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += CB32[(val << (5 - bits)) & 31]; return out.replace(/(.{4})/g, '$1-').replace(/-$/, ''); }
export function normRecovery(s) { return String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V'); }
export function decRecovery(s) { const n = normRecovery(s); let bits = 0, val = 0; const out = []; for (const ch of n) { const idx = CB32.indexOf(ch); if (idx < 0) throw new Error('bad char'); val = (val << 5) | idx; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }

async function rkFrom(recBytes, salt) {
  const ikm = await crypto.subtle.importKey('raw', recBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(INFO) }, ikm, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
async function vkKey(vkBytes) { return crypto.subtle.importKey('raw', vkBytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
export async function wrapVK(key, vkBytes) { return crypto.subtle.wrapKey('raw', await vkKey(vkBytes), key, 'AES-KW'); }
export async function unwrapVK(key, wrapped) { const k = await crypto.subtle.unwrapKey('raw', wrapped, key, 'AES-KW', { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); return new Uint8Array(await crypto.subtle.exportKey('raw', k)); }

/** Create a brand-new vault locally. Returns { vaultId, vk(bytes), recoveryCode, serverVaultRecord }. */
export async function createVaultLocal() {
  const vaultId = 'v_' + encRecovery(rand(10)).replace(/-/g, '').toLowerCase();
  const vk = rand(32), recBytes = rand(32), salt = rand(16);
  const recoveryCode = encRecovery(recBytes);
  const rk = await rkFrom(recBytes, salt);
  const wrapped = await wrapVK(rk, vk);
  return { vaultId, vk, recoveryCode, serverVaultRecord: { vaultId, recoverySalt: b64(salt), wrappedVkRecovery: b64(wrapped), format: FORMAT, epoch: 1 } };
}
/** Recover VK bytes from a recovery code + the server vault row {recovery_salt, wrapped_vk_recovery}. */
export async function recoverVK(recoveryCodeInput, vaultRow) {
  const rk = await rkFrom(decRecovery(recoveryCodeInput), unb64(vaultRow.recovery_salt));
  return unwrapVK(rk, unb64(vaultRow.wrapped_vk_recovery));
}

/* trusted device via IndexedDB (non-extractable key) */
const DB = 'dms_vault', STORE = 'dev';
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const g = tx.objectStore(STORE).get(k); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); }); }
export async function idbPut(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
export async function trustDevice(vaultId, vkBytes) {
  const dk = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  const wrapped = await wrapVK(dk, vkBytes);
  await idbPut('vault:' + vaultId, { deviceKey: dk, wrapped, vaultId });
}
export async function unlockWithDevice(vaultId) {
  const dev = await idbGet('vault:' + vaultId);
  if (!dev || !dev.deviceKey || !dev.wrapped) return null;
  return unwrapVK(dev.deviceKey, dev.wrapped);
}
