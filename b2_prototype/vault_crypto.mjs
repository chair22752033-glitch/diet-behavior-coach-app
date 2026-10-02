/*
 * B2 prototype — vault crypto core (ISOLATED; not wired to production).
 *
 * Implements GPT's §5 key design with the chosen stack:
 *   - jose standard JWE (alg=A256KW key-wrap, enc=A256GCM content) for every envelope
 *   - native Web Crypto (crypto.subtle / getRandomValues) for randomness, HKDF, and the
 *     non-extractable per-device key
 *
 * Keys (per GPT §5.1):
 *   VK  Vault Key        256-bit, per account+epoch, wraps content envelopes
 *   CEK Content key      per record-version, generated INSIDE jose for each JWE
 *   R   Recovery code    256-bit random, shown to user as a copyable string
 *   RK  Recovery wrap    HKDF-SHA256(R, salt, info) -> wraps VK
 *   DK  Device wrap       non-extractable AES-KW CryptoKey, device-local, wraps VK
 *
 * Context binding (per GPT §5.2): every JWE protected header carries
 *   ver, vault_id, use, and for records: rid (record_id), rev (revision_id), epoch.
 * Decryption ALWAYS re-checks the header against the expected context — "it decrypted"
 * is never sufficient.
 *
 * Isomorphic: runs in Node 22 (test harness) and in a browser (shipped client).
 */
import { CompactEncrypt, compactDecrypt } from 'jose';

export const FORMAT_VERSION = 'dms-e2ee-1';
const RECOVERY_INFO = 'diet-main-show|recovery-wrap|v1';
const ALG = 'A256KW';
const ENC = 'A256GCM';

const te = new TextEncoder();
const td = new TextDecoder();

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle || !c.getRandomValues) {
    throw new Error('Web Crypto (crypto.subtle / getRandomValues) unavailable in this environment');
  }
  return c;
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  getCrypto().getRandomValues(b);
  return b;
}

/* ---------- recovery code encoding (Crockford base32, groups of 4) ---------- */
const CB32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function encodeRecoveryCode(bytes) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) { out += CB32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += CB32[(value << (5 - bits)) & 31];
  return out.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}
export function normalizeRecoveryCode(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}
export function decodeRecoveryCode(s) {
  const norm = normalizeRecoveryCode(s);
  let bits = 0, value = 0;
  const out = [];
  for (const ch of norm) {
    const idx = CB32.indexOf(ch);
    if (idx < 0) throw new Error('recovery code contains invalid character');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

/* ---------- key derivation ---------- */
async function deriveRecoveryWrapKey(recoveryBytes, salt) {
  const c = getCrypto();
  const ikm = await c.subtle.importKey('raw', recoveryBytes, 'HKDF', false, ['deriveBits']);
  const bits = await c.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(RECOVERY_INFO) },
    ikm, 256
  );
  return new Uint8Array(bits); // RK bytes, used directly as jose A256KW key
}

/* ---------- vault lifecycle ---------- */
/**
 * First-time activation on a device: generate VK + recovery code, produce the
 * recovery-wrapped VK the server will store. Server never sees VK or R in the clear.
 */
export async function createVault({ epoch = 1 } = {}) {
  const vaultId = 'v_' + encodeRecoveryCode(randomBytes(10)).replace(/-/g, '').toLowerCase();
  const vk = randomBytes(32);
  const recoveryBytes = randomBytes(32);
  const recoveryCode = encodeRecoveryCode(recoveryBytes);
  const salt = randomBytes(16);
  const rk = await deriveRecoveryWrapKey(recoveryBytes, salt);
  const wrappedVkByRecovery = await wrapVault(vk, rk, { vaultId, epoch, use: 'recovery-wrap' });
  return {
    vaultId, epoch,
    vk,                                   // stays on device only
    recoveryCode,                         // shown to user once
    serverVaultRecord: {                  // safe to store server-side
      vault_id: vaultId, epoch,
      recovery_salt: bytesToB64(salt),
      wrapped_vk_recovery: wrappedVkByRecovery,
      format: FORMAT_VERSION
    }
  };
}

/** Wrap raw VK bytes under a wrapping key (RK bytes or DK CryptoKey) as a JWE. */
async function wrapVault(vkBytes, wrapKey, { vaultId, epoch, use }) {
  return await new CompactEncrypt(vkBytes)
    .setProtectedHeader({ alg: ALG, enc: ENC, ver: FORMAT_VERSION, vault_id: vaultId, epoch, use })
    .encrypt(wrapKey);
}

/** Unwrap VK from a JWE, verifying the protected header context. */
async function unwrapVault(jwe, wrapKey, { vaultId, epoch, use }) {
  const { plaintext, protectedHeader } = await compactDecrypt(jwe, wrapKey);
  assertHeader(protectedHeader, { ver: FORMAT_VERSION, vault_id: vaultId, use });
  if (epoch != null && protectedHeader.epoch !== epoch) {
    throw new Error('vault epoch mismatch (expected ' + epoch + ', got ' + protectedHeader.epoch + ')');
  }
  if (plaintext.length !== 32) throw new Error('unwrapped VK has wrong length');
  return new Uint8Array(plaintext);
}

/**
 * Rotation — re-wrap the SAME VK under a NEW recovery code (GPT §5.6 "一般更換恢復碼").
 * This is NOT content-key rotation: records stay readable with the same VK. The old
 * recovery code no longer works (new salt + new wrap replace the server record).
 */
export async function rewrapVaultWithNewRecovery(vkBytes, { vaultId, epoch }) {
  const recoveryBytes = randomBytes(32);
  const recoveryCode = encodeRecoveryCode(recoveryBytes);
  const salt = randomBytes(16);
  const rk = await deriveRecoveryWrapKey(recoveryBytes, salt);
  const wrapped = await wrapVault(vkBytes, rk, { vaultId, epoch, use: 'recovery-wrap' });
  return {
    recoveryCode,
    serverVaultRecord: { vault_id: vaultId, epoch, recovery_salt: bytesToB64(salt), wrapped_vk_recovery: wrapped, format: FORMAT_VERSION },
  };
}

/**
 * Rotation — generate a NEW VK at a NEW epoch (GPT §5.6 compromise path). New records are
 * encrypted under the new VK/epoch; existing records must be re-encrypted from old VK to new.
 * A device still holding only the old VK cannot read new-epoch records (epoch binding + new key).
 */
export async function rotateVaultKey({ vaultId, newEpoch }) {
  const vk = randomBytes(32);
  const { recoveryCode, serverVaultRecord } = await rewrapVaultWithNewRecovery(vk, { vaultId, epoch: newEpoch });
  return { vk, epoch: newEpoch, recoveryCode, serverVaultRecord };
}

/** Recover VK on a NEW device/browser using the recovery code + server record. */
export async function recoverVaultWithCode(recoveryCodeInput, serverVaultRecord) {
  const recoveryBytes = decodeRecoveryCode(recoveryCodeInput);
  const salt = b64ToBytes(serverVaultRecord.recovery_salt);
  const rk = await deriveRecoveryWrapKey(recoveryBytes, salt);
  // Wrong code -> HKDF gives a different RK -> AES-KW unwrap fails -> this THROWS.
  // Caller must treat a throw as "unlock failed" and NEVER delete ciphertext.
  const vk = await unwrapVault(serverVaultRecord.wrapped_vk_recovery, rk, {
    vaultId: serverVaultRecord.vault_id, epoch: serverVaultRecord.epoch, use: 'recovery-wrap'
  });
  return { vk, vaultId: serverVaultRecord.vault_id, epoch: serverVaultRecord.epoch };
}

/* ---------- trusted device (non-extractable device key) ---------- */
/**
 * "Trust this device": generate a non-extractable AES-KW key, wrap VK under it.
 * Returns { deviceKey (non-extractable CryptoKey, store in IndexedDB), wrappedVkByDevice }.
 */
export async function trustDevice(vk, { vaultId, epoch }) {
  const c = getCrypto();
  const deviceKey = await c.subtle.generateKey(
    { name: 'AES-KW', length: 256 }, false /* non-extractable */, ['wrapKey', 'unwrapKey']
  );
  const wrappedVkByDevice = await wrapVault(vk, deviceKey, { vaultId, epoch, use: 'device-wrap' });
  return { deviceKey, wrappedVkByDevice };
}
/** Unlock on a trusted device without the recovery code. */
export async function unlockWithDevice(deviceKey, wrappedVkByDevice, { vaultId, epoch }) {
  return await unwrapVault(wrappedVkByDevice, deviceKey, { vaultId, epoch, use: 'device-wrap' });
}

/* ---------- record envelopes (the main private-data path) ---------- */
/**
 * Encrypt one private record. jose generates a fresh CEK per call (new IV, A256GCM),
 * wraps it with VK via A256KW. Header binds the envelope to vault+record+revision+epoch.
 */
export async function encryptRecord(vk, recordObj, { vaultId, recordId, revisionId, epoch, use = 'record' }) {
  const payload = te.encode(JSON.stringify(recordObj));
  return await new CompactEncrypt(payload)
    .setProtectedHeader({ alg: ALG, enc: ENC, ver: FORMAT_VERSION, vault_id: vaultId, rid: recordId, rev: revisionId, epoch, use })
    .encrypt(vk);
}
/**
 * Decrypt one record envelope. Verifies header matches the record the caller asked for —
 * rejects tampering, cross-record substitution, wrong vault, unknown version.
 */
export async function decryptRecordChecked(vk, jwe, { vaultId, recordId, epoch, use = 'record' }) {
  const { plaintext, protectedHeader } = await compactDecrypt(jwe, vk);
  assertHeader(protectedHeader, { ver: FORMAT_VERSION, vault_id: vaultId, use });
  if (recordId != null && protectedHeader.rid !== recordId) {
    throw new Error('record_id mismatch (cross-record substitution?) expected ' + recordId + ' got ' + protectedHeader.rid);
  }
  if (epoch != null && protectedHeader.epoch !== epoch) {
    throw new Error('epoch mismatch');
  }
  return { record: JSON.parse(td.decode(plaintext)), header: protectedHeader };
}

/* ---------- helpers ---------- */
function assertHeader(h, expect) {
  if (!h || typeof h !== 'object') throw new Error('missing protected header');
  if (h.ver !== expect.ver) throw new Error('unknown/unsupported format version: ' + h.ver);
  if (expect.vault_id != null && h.vault_id !== expect.vault_id) throw new Error('vault_id mismatch');
  if (expect.use != null && h.use !== expect.use) throw new Error('purpose (use) mismatch: ' + h.use);
  if (h.alg !== ALG || h.enc !== ENC) throw new Error('unexpected alg/enc: ' + h.alg + '/' + h.enc);
}

export function bytesToB64(b) {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
