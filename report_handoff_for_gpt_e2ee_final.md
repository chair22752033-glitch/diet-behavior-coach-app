# 飲食主場秀 — E2EE 最終複審包（含程式碼）給 GPT

**日期：** 2026-10-02
**用途：** 給 GPT（或獨立資安審查者）**逐行複審** E2EE（B 階段）與 C 階段的實作與進度。本包**內嵌關鍵原始碼**，不需翻 repo 即可審。
**重要：** E2EE 四塊磚都已上線，但**全部 gated 在 `crypto_mode='e2ee_only'`**，而**目前沒有任何帳號是該狀態**——所以對現有使用者零影響；真正啟用是擁有者本人在自己帳號上手動 pilot。**尚未對外宣稱「營運者無法解密」**（需本包審查＋實跑驗收後才可）。

---

## 1. 整體進度與已部署版本
| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| A | 擁有者後台 + D1 用量 + 成本估算 | ✅ 上線 |
| B1 | 原始碼/資料流盤點（4 處私人儲存） | ✅ |
| B2 | 隔離加密試作（真實 D1 無明文、恢復碼、信任裝置、裝置端回顧） | ✅ 128 檢查全綠 |
| B3 drill | 遷移演練（鎖定→批次→驗證→切換→清理→crypto-aware rollback） | ✅ 25/0 |
| B4(金鑰) | 輪替/撤銷、真實 KV 密文 | ✅ 9/0、10/0 |
| **B 磚 1** | 正式密文儲存 `/api/e2ee/records`（migration 0014） | ✅ 上線 |
| **B 磚 2a** | 記錄 JWE 底層（原生 Web Crypto，與 jose 互通 9/0） | ✅ 上線 |
| **B 磚 2b** | 遷移驅動頁 `/ui-assets/migrate/`（非破壞性複製加密版） | ✅ 上線 7/0 |
| **B 磚 3** | 主 App 加密同步覆蓋 + 裝置端回顧（gated/dormant） | ✅ 上線 12/0 |
| **B 磚 4** | cutover / cleanup / rollback + `/api/sync` 鎖（17/0） | ✅ 上線 |
| C1 | 方案/定價（3000/35000/48000） | ✅ 文件已填；法務待審 |
| C2 | 服務條款/個資告知/意向書 | ✅ 上線（試行草稿）；法務待審 |
| C3 | 同意記錄 `/api/consent`（migration 0012，append-only、綁文件雜湊） | ✅ 上線 14/0 |
| C5 | 免費試用告知 + LINE（連結+QR） | ✅ 上線 |

正式 migration：0001–0014 皆已套用正式 D1。最後部署版本 `55ae5cdb`。

---

## 2. E2EE 架構摘要（給審查者）
- **封裝格式**：標準 JWE compact，`alg=A256KW`（金鑰包裝）＋`enc=A256GCM`（內容）。前端用**原生 Web Crypto** 自製 compact serialization（已證明與 jose 雙向互通，見 §5 的 `test_webcrypto_jwe_interop`）。
- **金鑰階層**：VK（每帳號/epoch，256-bit，裝置產生）→ 包裝每筆記錄的 CEK；VK 本身被 (a) 恢復金鑰 RK = HKDF-SHA256(恢復碼R, salt) 包裝（存 server），(b) 裝置金鑰 DK（非匯出 AES-KW，存裝置 IndexedDB）包裝。
- **上下文綁定**：每個記錄 JWE 的 protected header 帶 `ver/vault_id/rid/rev/epoch/use`；AAD = BASE64URL(header)（RFC7516）。
- **crypto_mode 狀態機**：`vault_created`（建鑰，未遷移）→（遷移複製密文）→ `e2ee_only`（切換：App 讀寫密文、明文同步上鎖）；清理前可 rollback 回 `vault_created`。
- **伺服器無法解密**：server 只存被包裝的 VK（RK-wrapped）、salt、與記錄密文；無任何可解內容的金鑰。
- **4 處私人儲存**：sync_records（ins/quest）→ e2ee_records；review → 裝置計算+密文快取；health_insight →（裝置端運算待移植）；qlive(KV) → 密文（B5 已驗，正式接線待 KV 增補）。

### 端點一覽（都在 worker.js `fetch()` 於 gateway 前攔截、`getCurrentUser` 驗證）
- `GET/POST /api/vault` — 保險庫建立/查詢（單一、含 crypto_mode）。
- `GET/POST /api/e2ee/records` — 密文記錄 list/CAS 寫入（kind: ins/quest/review/health_insight/root）。
- `POST /api/e2ee/cutover|cleanup|rollback` — 切換/清理/還原（需 confirm:true）。
- `POST /api/consent`、`GET /api/consent/status|history` — 同意事件。
- `GET/POST /api/sync` — 舊明文路徑；**e2ee_only 帳號 POST 回 409 e2ee_locked**。

---

## 3. 測試總表（全綠）
| 套件 | 檢查 |
| --- | --- |
| test_b2 / test_review_port / test_b2_real_d1 / test_b3_migration | 57 / 12 / 38 / 25 |
| test_b4_key_rotation / test_b5_kv | 9 / 10 |
| test_webcrypto_jwe_interop（與 jose 互通） | 9 |
| run_browser_check / run_idb_check / run_migrate_check / run_e2ee_sync_check（真 Chromium） | 12 / 9 / 7 / 12 |
| 正式邊界：vault / e2ee-records / cutover / consent | 11 / 12 / 17 / 14 |
| 手機實機自我檢查（iOS WebKit + 桌機 Blink） | 6/6 + 6/6 |
| 回歸 1.127（含全系列） | 930/0 |

---

## 4. 請審查者重點看
1. **原生 JWE compact 實作**（§5 webcrypto_jwe.mjs）：AAD 綁定、tag 切分、header 驗證是否正確、是否真的等同 RFC7516（互通測試已證，但請人工再看）。
2. **金鑰 UX**：恢復碼（256-bit→Crockford base32, 52 字）、HKDF 參數、信任裝置非匯出金鑰、遺失全部金鑰的處理。
3. **cutover/cleanup 守門**：confirm、nothing_migrated、e2ee_locked、rollback 僅清理前、Time Travel 揭露。
4. **gating**：e2ee_only 之外完全不走加密路徑，是否有任何路徑會讓明文使用者誤入。
5. **未竟**：health_insight 裝置端運算未移植；qlive 正式接線未做；「營運者無法解密」文案未上（待本審查）。

---

## 5. 內嵌原始碼（原樣）
以下為實際上線的關鍵檔案內容，供逐行審查。


### 記錄加密底層（原生 JWE compact）
`public/ui-assets/lib/webcrypto_jwe.mjs`

```js
/*
 * Native Web Crypto JWE compact (A256KW + A256GCM) — the shipped record-crypto for the
 * no-bundler browser. Standard algorithms + standard RFC 7516 compact serialization, so it
 * interoperates with jose (verified by test_webcrypto_jwe_interop.mjs), without shipping the
 * ~80-file jose browser build into the page.
 *
 * Envelope: BASE64URL(header) . BASE64URL(wrappedCEK) . BASE64URL(iv) . BASE64URL(ct) . BASE64URL(tag)
 * AAD = ASCII(BASE64URL(header)) per RFC 7516 §5.1.
 *
 * Isomorphic: Node 22 + browsers via globalThis.crypto.subtle.
 */
const ALG = 'A256KW', ENC = 'A256GCM';
const te = new TextEncoder(), td = new TextDecoder();

function b64u(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(s); const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return o;
}
function subtle() { return globalThis.crypto.subtle; }

async function vkKwKey(vkBytes, usage) {
  return subtle().importKey('raw', vkBytes, { name: 'AES-KW' }, false, usage);
}

/** Encrypt an object as a compact JWE under VK. `header` extras are merged into the protected header. */
export async function jweEncrypt(vkBytes, obj, headerExtras) {
  const header = Object.assign({ alg: ALG, enc: ENC }, headerExtras || {});
  const headerB64 = b64u(te.encode(JSON.stringify(header)));
  const cek = new Uint8Array(32); globalThis.crypto.getRandomValues(cek);
  const cekKey = await subtle().importKey('raw', cek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  const wrapped = await subtle().wrapKey('raw', cekKey, await vkKwKey(vkBytes, ['wrapKey']), 'AES-KW');
  const iv = new Uint8Array(12); globalThis.crypto.getRandomValues(iv);
  const aad = te.encode(headerB64);
  const ctAndTag = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, cekKey, te.encode(JSON.stringify(obj))));
  const tag = ctAndTag.slice(ctAndTag.length - 16);
  const ct = ctAndTag.slice(0, ctAndTag.length - 16);
  return [headerB64, b64u(wrapped), b64u(iv), b64u(ct), b64u(tag)].join('.');
}

/** Decrypt a compact JWE under VK; returns { obj, header }. Throws on bad tag / wrong key / tamper. */
export async function jweDecrypt(vkBytes, jwe) {
  const parts = String(jwe).split('.');
  if (parts.length !== 5) throw new Error('not a compact JWE');
  const [h, ek, iv, ct, tag] = parts;
  const header = JSON.parse(td.decode(unb64u(h)));
  if (header.alg !== ALG || header.enc !== ENC) throw new Error('unexpected alg/enc');
  const cekKey = await subtle().unwrapKey('raw', unb64u(ek), await vkKwKey(vkBytes, ['unwrapKey']), 'AES-KW', { name: 'AES-GCM' }, false, ['decrypt']);
  const data = new Uint8Array([...unb64u(ct), ...unb64u(tag)]);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64u(iv), additionalData: te.encode(h) }, cekKey, data);
  return { obj: JSON.parse(td.decode(pt)), header };
}

```


### 保險庫金鑰工具（恢復碼/HKDF/信任裝置）
`public/ui-assets/lib/vault_keys.mjs`

```js
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

```


### 加密同步覆蓋層 + 裝置端回顧
`public/ui-assets/lib/e2ee_sync.mjs`

```js
/*
 * Phase B step 3｜E2EE sync override (shipped, gated).
 *
 * When an account is in crypto_mode='e2ee_only', this REPLACES the app's global cloudPush /
 * cloudPull so sync goes to the ciphertext store (/api/e2ee/records) with client-side
 * encrypt/decrypt, instead of the plaintext /api/sync. It also runs the 7-day review on the
 * device. Non-e2ee accounts never call this (bootstrap only installs it when e2ee_only), so
 * plaintext users are completely unaffected.
 *
 * Record model: ins -> kind 'ins', quest entries -> kind 'quest', everything else (scalars
 * like ft/identity/dims) -> one kind 'root' record. Records are mostly immutable; revisionId
 * is a content hash, so re-sending is idempotent; a changed record retries with the server's
 * current revision (CAS).
 */
import { jweEncrypt, jweDecrypt } from './webcrypto_jwe.mjs';
import { computeFacts, buildReview, reportKey } from './review_portable.mjs';

function djb2(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); }
function revOf(obj) { return 'h' + djb2(JSON.stringify(obj)); }

async function putRecord(ctx, kind, recordId, obj) {
  const rid = String(recordId).slice(0, 128);
  const rev = revOf(obj);
  const env = await jweEncrypt(ctx.vk, obj, { ver: 'dms-e2ee-1', vault_id: ctx.vaultId, rid, rev, epoch: ctx.epoch, use: 'record' });
  async function post(baseRevision) {
    const r = await fetch('/api/e2ee/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId: rid, baseRevision, revisionId: rev, envelope: env }) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  let res = await post(null);
  if (res.j && res.j.error === 'conflict') {
    // record changed since last pull: retry against the server's current revision
    res = await post(res.j.currentRevision || null);
  }
  return !!(res.j && res.j.ok);
}

export function installE2eeSync(ctx) {
  // ctx = { vk (Uint8Array), vaultId, epoch }
  window.__DMS_E2EE = { on: true, ctx };

  window.cloudPush = function (d, cb) {
    d = (d && typeof d === 'object') ? d : { ins: [] };
    (async () => {
      try {
        const ins = Array.isArray(d.ins) ? d.ins : [];
        const quest = (d.quest && Array.isArray(d.quest.entries)) ? d.quest.entries : [];
        const scalars = {}; for (const k in d) { if (k !== 'ins' && k !== 'quest') scalars[k] = d[k]; }
        let okAll = true;
        for (let i = 0; i < ins.length; i++) { const r = ins[i]; const id = (r && r.id) ? r.id : ('ins_' + i); okAll = (await putRecord(ctx, 'ins', id, r)) && okAll; }
        for (let i = 0; i < quest.length; i++) { const r = quest[i]; const id = (r && r.id) ? r.id : ('quest_' + i); okAll = (await putRecord(ctx, 'quest', id, r)) && okAll; }
        okAll = (await putRecord(ctx, 'root', 'scalars', scalars)) && okAll;
        if (cb) cb(okAll);
      } catch (e) { if (cb) cb(false); }
    })();
  };

  window.cloudPull = function (cb) {
    (async () => {
      try {
        const r = await fetch('/api/e2ee/records', { headers: { 'Accept': 'application/json' } });
        const j = await r.json().catch(() => null);
        if (!j || !j.ok) { if (cb) cb(false); return; }
        const doc = { ins: [], quest: { entries: [] } };
        for (const rec of (j.records || [])) {
          let dec; try { dec = await jweDecrypt(ctx.vk, rec.envelope); } catch (e) { continue; }
          const obj = dec.obj;
          if (rec.kind === 'ins') doc.ins.push(obj);
          else if (rec.kind === 'quest') doc.quest.entries.push(obj);
          else if (rec.kind === 'root' && obj && typeof obj === 'object') { for (const k in obj) { if (k !== 'ins' && k !== 'quest') doc[k] = obj[k]; } }
        }
        const merged = (typeof window.mergeData === 'function' && typeof window.ld === 'function') ? window.mergeData(window.ld(), doc) : doc;
        try { localStorage.setItem(window.SK || 'diet_app_v1', JSON.stringify(merged)); } catch (e) { if (cb) cb(false); return; }
        // write back any locally-merged records as ciphertext (keeps both devices converged)
        window.cloudPush(merged, function () { if (cb) cb(true); });
      } catch (e) { if (cb) cb(false); }
    })();
  };

  // device-side 7-day review: decrypt ins, compute locally (server never sees plaintext)
  window.__dmsDeviceReview = async function (nowMs) {
    const r = await fetch('/api/e2ee/records?kind=ins', { headers: { 'Accept': 'application/json' } });
    const j = await r.json().catch(() => null);
    const ins = [];
    for (const rec of ((j && j.records) || [])) { try { const d = await jweDecrypt(ctx.vk, rec.envelope); ins.push(d.obj); } catch (e) {} }
    const facts = computeFacts({ ins }, nowMs);
    return { review: buildReview(facts), key: reportKey(facts), facts };
  };
}

```


### 保險庫 server store（含 setCryptoMode）
`src/crypto/vault_server.js`

```js
/*
 * Phase B（E2EE 第 1 步）｜Vault server store (production).
 *
 * Server-side storage of the encryption vault record. The server holds ONLY the
 * recovery-wrapped VK + salt — it has no key material that can decrypt content.
 * One vault per account (no silent overwrite). Uses RAW D1 via src/db/query.js.
 */
import { run, first } from '../db/query.js';

const B64_RE = /^[A-Za-z0-9+/]+=*$/;

function validVaultInput(v) {
  if (!v || typeof v !== 'object') return 'invalid_body';
  if (typeof v.vaultId !== 'string' || v.vaultId.length < 3 || v.vaultId.length > 80) return 'bad_vault_id';
  if (typeof v.recoverySalt !== 'string' || !B64_RE.test(v.recoverySalt) || v.recoverySalt.length > 128) return 'bad_salt';
  if (typeof v.wrappedVkRecovery !== 'string' || !B64_RE.test(v.wrappedVkRecovery) || v.wrappedVkRecovery.length > 2048) return 'bad_wrapped_vk';
  if (typeof v.format !== 'string' || v.format.length > 64) return 'bad_format';
  const epoch = Number(v.epoch);
  if (!Number.isInteger(epoch) || epoch < 1 || epoch > 1000000) return 'bad_epoch';
  return null;
}

export async function putVault(rawDb, userId, v) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  const bad = validVaultInput(v);
  if (bad) return { ok: false, reason: bad };
  const ex = await first(rawDb, 'SELECT user_id FROM e2ee_vaults WHERE user_id = ?', [userId]);
  if (ex.ok && ex.row) return { ok: false, reason: 'vault_exists' };
  const r = await run(rawDb,
    'INSERT INTO e2ee_vaults (user_id, vault_id, epoch, recovery_salt, wrapped_vk_recovery, format) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, v.vaultId, Number(v.epoch), v.recoverySalt, v.wrappedVkRecovery, v.format]);
  return r.ok ? { ok: true } : { ok: false, reason: r.error || 'insert_failed' };
}

const VALID_MODES = ['vault_created', 'migration_locked', 'ciphertext_verified', 'e2ee_only'];
export async function setCryptoMode(rawDb, userId, mode) {
  if (VALID_MODES.indexOf(mode) < 0) return { ok: false, reason: 'bad_mode' };
  const r = await run(rawDb, "UPDATE e2ee_vaults SET crypto_mode = ?, updated_at = datetime('now') WHERE user_id = ?", [mode, userId]);
  if (!r.ok) return { ok: false, reason: r.error || 'update_failed' };
  if (!r.meta || r.meta.changes === 0) return { ok: false, reason: 'no_vault' };
  return { ok: true, mode };
}

export async function getVault(rawDb, userId) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  const r = await first(rawDb, 'SELECT vault_id, epoch, recovery_salt, wrapped_vk_recovery, format, crypto_mode FROM e2ee_vaults WHERE user_id = ?', [userId]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed' };
  if (!r.row) return { ok: true, exists: false };
  return {
    ok: true, exists: true,
    vault: {
      vault_id: r.row.vault_id, epoch: r.row.epoch, recovery_salt: r.row.recovery_salt,
      wrapped_vk_recovery: r.row.wrapped_vk_recovery, format: r.row.format, crypto_mode: r.row.crypto_mode,
    },
  };
}

```


### 密文記錄 server store（CAS）
`src/crypto/e2ee_records_store.js`

```js
/*
 * Phase B（E2EE 第 3 步）｜Ciphertext record store (production).
 *
 * Stores ONLY opaque JWE ciphertext, separate from the plaintext sync_records table.
 * Validates ownership / kind / JWE shape / size / revision (CAS); server-assigned seq
 * ordering; holds no key, never decrypts. Uses RAW D1 via src/db/query.js + transaction.js.
 *
 * This is additive: the existing plaintext /api/sync path is untouched. These records are
 * only written/read for accounts that have migrated (a later increment wires the app to it).
 */
import { all, first } from '../db/query.js';
import { batch } from '../db/transaction.js';

export const E2EE_KINDS = ['ins', 'quest', 'review', 'health_insight', 'root'];
const MAX_ENVELOPE_BYTES = 12000;

function isCompactJWE(s) {
  return typeof s === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

export async function putE2eeRecord(rawDb, userId, { kind, recordId, baseRevision = null, revisionId, envelope }) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_owner' };
  if (E2EE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad_kind' };
  if (typeof recordId !== 'string' || recordId.length < 1 || recordId.length > 128) return { ok: false, reason: 'bad_record_id' };
  if (!isCompactJWE(envelope)) return { ok: false, reason: 'not_ciphertext' };
  if (envelope.length > MAX_ENVELOPE_BYTES) return { ok: false, reason: 'too_large' };
  if (typeof revisionId !== 'string' || !revisionId || revisionId.length > 128) return { ok: false, reason: 'bad_revision' };

  const curRes = await first(rawDb, 'SELECT revision_id, seq FROM e2ee_records WHERE user_id = ? AND kind = ? AND record_id = ?', [userId, kind, recordId]);
  if (!curRes.ok) return { ok: false, reason: curRes.error || 'read_failed' };
  const cur = curRes.row;
  if (cur) {
    if (cur.revision_id === revisionId) return { ok: true, idempotent: true };
    if (baseRevision !== cur.revision_id) return { ok: false, reason: 'conflict', currentRevision: cur.revision_id };
  } else if (baseRevision !== null) {
    return { ok: false, reason: 'conflict', currentRevision: null };
  }

  let seq = cur ? cur.seq : null;
  if (seq == null) {
    const mx = await first(rawDb, 'SELECT COALESCE(MAX(seq),0) AS m FROM e2ee_records WHERE user_id = ?', [userId]);
    seq = ((mx.ok && mx.row ? mx.row.m : 0) || 0) + 1;
  }
  const res = await batch(rawDb, [{
    sql: "INSERT INTO e2ee_records (user_id, kind, record_id, revision_id, envelope, seq, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id, kind, record_id) DO UPDATE SET revision_id=excluded.revision_id, envelope=excluded.envelope, updated_at=datetime('now')",
    params: [userId, kind, recordId, revisionId, envelope, seq],
  }]);
  return res.ok ? { ok: true, idempotent: false } : { ok: false, reason: res.error || 'write_failed' };
}

export async function listE2eeEnvelopes(rawDb, userId, kind) {
  const sql = kind
    ? 'SELECT kind, record_id, revision_id, envelope, seq FROM e2ee_records WHERE user_id = ? AND kind = ? ORDER BY seq ASC'
    : 'SELECT kind, record_id, revision_id, envelope, seq FROM e2ee_records WHERE user_id = ? ORDER BY seq ASC';
  const r = await all(rawDb, sql, kind ? [userId, kind] : [userId]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed', rows: [] };
  return { ok: true, rows: (r.results || []).map((x) => ({ kind: x.kind, recordId: x.record_id, revisionId: x.revision_id, envelope: x.envelope, seq: x.seq })) };
}

```


### 同意事件 store
`src/legal/consent_store.js`

```js
/*
 * Phase C｜Consent event store (production).
 *
 * Append-only consent log. Each event snapshots the exact document content hash shown
 * (computed from the served legal page), so we can later prove what version a user agreed
 * to. Server is the authority: hasActiveConsent is true only for a persisted `granted` row
 * whose version matches and whose snapshotted hash still equals the currently-served hash.
 *
 * Structurally stores NO recovery code / key / token / food plaintext / full IP (no columns).
 * Uses RAW D1 via src/db/query.js (pass app.db.raw from the worker).
 */
import { run, all, first } from '../db/query.js';

export const CONSENT_ACTIONS = ['granted', 'declined', 'withdrawn'];

const te = new TextEncoder();
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function recordConsent(rawDb, { userId, purpose, docType, docVersion, docContentSha256, action, sourceScreen, orderId = null }) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  if (!purpose || typeof purpose !== 'string') return { ok: false, reason: 'missing_purpose' };
  if (!docType || typeof docType !== 'string') return { ok: false, reason: 'missing_doc_type' };
  if (!/^[0-9a-f]{64}$/.test(docContentSha256 || '')) return { ok: false, reason: 'bad_hash' };
  if (CONSENT_ACTIONS.indexOf(action) < 0) return { ok: false, reason: 'bad_action' };
  if (!sourceScreen || typeof sourceScreen !== 'string') return { ok: false, reason: 'missing_source' };

  const mx = await first(rawDb, 'SELECT COALESCE(MAX(seq),0) AS m FROM consent_events WHERE user_id = ?', [userId]);
  const seq = ((mx.ok && mx.row ? mx.row.m : 0) || 0) + 1;
  const eventId = crypto.randomUUID();
  const r = await run(rawDb,
    'INSERT INTO consent_events (event_id, user_id, purpose, doc_type, doc_version, doc_content_sha256, action, source_screen, order_id, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [eventId, userId, purpose, docType, docVersion, docContentSha256, action, sourceScreen, orderId, seq]);
  return r.ok ? { ok: true, eventId, seq } : { ok: false, reason: r.error || 'insert_failed' };
}

export async function getLatestConsent(rawDb, userId, purpose) {
  const r = await first(rawDb, 'SELECT * FROM consent_events WHERE user_id = ? AND purpose = ? ORDER BY seq DESC LIMIT 1', [userId, purpose]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed' };
  return { ok: true, event: r.row || null };
}

export async function listConsentHistory(rawDb, userId) {
  const r = await all(rawDb, 'SELECT event_id, purpose, doc_type, doc_version, action, source_screen, order_id, server_time, seq FROM consent_events WHERE user_id = ? ORDER BY seq ASC', [userId]);
  return r.ok ? { ok: true, events: r.results || [] } : { ok: false, reason: r.error || 'read_failed', events: [] };
}

/**
 * Authoritative: is this account's latest choice for `purpose` a still-valid `granted`?
 * Requires the latest event be granted, the version match, and the snapshotted hash equal
 * the current served hash (so edited docs force re-consent).
 */
export async function hasActiveConsent(rawDb, userId, purpose, { requiredVersion, currentHash }) {
  const latest = await getLatestConsent(rawDb, userId, purpose);
  if (!latest.ok) return { active: false, reason: latest.reason };
  const ev = latest.event;
  if (!ev) return { active: false, reason: 'no_consent' };
  if (ev.action !== 'granted') return { active: false, reason: ev.action };
  if (requiredVersion && ev.doc_version !== requiredVersion) return { active: false, reason: 'version_outdated' };
  if (currentHash && ev.doc_content_sha256 !== currentHash) return { active: false, reason: 'content_changed' };
  return { active: true, event: ev };
}

```


### migration 0012 consent_events
`migrations/0012_phasec_consent_events.sql`

```sql
-- Phase C (商業試辦)｜同意事件紀錄（append-only）
-- 記錄使用者對服務條款/個資告知/方案/試用等的同意、拒絕、撤回。
-- 每筆綁定「當時呈現文件的內容雜湊」(doc_content_sha256)，日後可證明同意的是哪一版文字。
-- 只追加、不更新不刪除；結構上不存恢復碼/金鑰/token/飲食明文/完整 IP（無對應欄位）。
-- 附加式 migration（僅 CREATE），不動既有資料。

CREATE TABLE IF NOT EXISTS consent_events (
  event_id            TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  purpose             TEXT NOT NULL,
  doc_type            TEXT NOT NULL,
  doc_version         TEXT NOT NULL,
  doc_content_sha256  TEXT NOT NULL,
  action              TEXT NOT NULL,          -- granted | declined | withdrawn
  source_screen       TEXT NOT NULL,
  order_id            TEXT,
  server_time         TEXT NOT NULL DEFAULT (datetime('now')),
  seq                 INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_user_purpose ON consent_events (user_id, purpose, seq);

```


### migration 0013 e2ee_vaults
`migrations/0013_phaseb_e2ee_vaults.sql`

```sql
-- Phase B（E2EE 第 1 步）｜加密保險庫記錄。
-- 每個帳號一個保險庫：server 只存「被恢復碼包裝的 VK」+ salt，自己無法解開。
-- 這一步只建立保險庫，尚未遷移任何現有資料（crypto_mode 預設 vault_created）。
-- 附加式 migration（僅 CREATE），不動既有資料、不影響現有明文同步。

CREATE TABLE IF NOT EXISTS e2ee_vaults (
  user_id             TEXT PRIMARY KEY,
  vault_id            TEXT NOT NULL,
  epoch               INTEGER NOT NULL DEFAULT 1,
  recovery_salt       TEXT NOT NULL,        -- base64
  wrapped_vk_recovery TEXT NOT NULL,        -- base64：VK 被恢復金鑰(AES-KW)包裝，server 無法解開
  format              TEXT NOT NULL,        -- 封裝格式版本標記
  crypto_mode         TEXT NOT NULL DEFAULT 'vault_created',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

```


### migration 0014 e2ee_records
`migrations/0014_phaseb_e2ee_records.sql`

```sql
-- Phase B（E2EE 第 3 步・第一塊）｜密文記錄儲存。
-- 與現有明文 sync_records 完全分開：這張表只存「不透明密文封裝（JWE）」。
-- 現有明文同步 /api/sync 完全不受影響；本表在使用者完成遷移後才會被使用。
-- 附加式 migration（僅 CREATE），不動既有資料。

CREATE TABLE IF NOT EXISTS e2ee_records (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- ins | quest | review | health_insight
  record_id   TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  envelope    TEXT NOT NULL,          -- compact JWE ciphertext ONLY（無明文）
  seq         INTEGER NOT NULL,       -- server 指派排序（非明文時間）
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_e2ee_records_owner_seq ON e2ee_records (user_id, seq);

```


### worker.js — 同意 + E2EE 端點攔截區塊（consent / vault / e2ee records / cutover）
`src/worker.js`（節錄）

```js
// Phase C：同意事件記錄（append-only）。/ui-assets/legal/ 靜態頁同源 POST，帶
    // session cookie；未登入 -> 401。文件雜湊由 server 從「實際服務的頁面內容」計算，
    // 綁定「同意的是哪一版文字」；文件被改過會讓舊同意失效（content_changed）。
    // 不存任何私人內容/金鑰/token（結構上無欄位）。
    {
      const consentPath = new URL(request.url).pathname;
      if (consentPath === '/api/consent' || consentPath === '/api/consent/status' || consentPath === '/api/consent/history') {
        const jsonHeaders = { 'Content-Type': 'application/json' };
        const cookieHeader = request.headers.get('Cookie');
        const auth = await getCurrentUser(app.db, cookieHeader, {});
        if (!auth.ok) {
          return new Response(JSON.stringify({ ok: false, error: 'not_authenticated' }), { status: 401, headers: jsonHeaders });
        }
        const ownerId = auth.userId;
        if (consentPath === '/api/consent/history') {
          if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
          const h = await listConsentHistory(app.db.raw, ownerId);
          return new Response(JSON.stringify({ ok: !!h.ok, events: h.events || [] }), { headers: jsonHeaders });
        }
        if (consentPath === '/api/consent/status') {
          if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
          const u2 = new URL(request.url);
          const docType = u2.searchParams.get('type');
          const purpose = u2.searchParams.get('purpose');
          if (!isKnownDoc(docType) || !purpose) return new Response(JSON.stringify({ ok: false, error: 'bad_params' }), { status: 400, headers: jsonHeaders });
          const dh = await fetchDocHash(env, request.url, docType);
          if (!dh.ok) return new Response(JSON.stringify({ ok: false, error: dh.reason }), { status: 503, headers: jsonHeaders });
          const st = await hasActiveConsent(app.db.raw, ownerId, purpose, { requiredVersion: dh.version, currentHash: dh.hash });
          return new Response(JSON.stringify({ ok: true, active: !!st.active, reason: st.reason || null }), { headers: jsonHeaders });
        }
        // POST /api/consent
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const body = await parseJsonBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: jsonHeaders });
        if (!isKnownDoc(body.docType)) return new Response(JSON.stringify({ ok: false, error: 'unknown_doc' }), { status: 400, headers: jsonHeaders });
        if (CONSENT_ACTIONS.indexOf(body.action) < 0) return new Response(JSON.stringify({ ok: false, error: 'bad_action' }), { status: 400, headers: jsonHeaders });
        if (!body.purpose || typeof body.purpose !== 'string') return new Response(JSON.stringify({ ok: false, error: 'missing_purpose' }), { status: 400, headers: jsonHeaders });
        const dh = await fetchDocHash(env, request.url, body.docType);
        if (!dh.ok) return new Response(JSON.stringify({ ok: false, error: dh.reason }), { status: 503, headers: jsonHeaders });
        const rec = await recordConsent(app.db.raw, {
          userId: ownerId, purpose: String(body.purpose).slice(0, 64), docType: body.docType, docVersion: dh.version,
          docContentSha256: dh.hash, action: body.action,
          sourceScreen: (typeof body.sourceScreen === 'string' && body.sourceScreen) ? body.sourceScreen.slice(0, 64) : 'legal_page',
          orderId: (typeof body.orderId === 'string' && body.orderId) ? body.orderId.slice(0, 64) : null,
        });
        if (!rec.ok) return new Response(JSON.stringify({ ok: false, error: rec.reason }), { status: 400, headers: jsonHeaders });
        return new Response(JSON.stringify({ ok: true, eventId: rec.eventId }), { headers: jsonHeaders });
      }
    }

    // Phase B（E2EE 第 1 步）：加密保險庫。/ui-assets/vault/ 靜態頁同源呼叫，帶 session
    // cookie；未登入 -> 401。server 只存「被恢復碼包裝的 VK」+ salt，無法解密內容。
    // 這一步只建立保險庫，尚未遷移任何現有資料（現有明文同步不受影響）。
    {
      const vaultPath = new URL(request.url).pathname;
      if (vaultPath === '/api/vault') {
        const jsonHeaders = { 'Content-Type': 'application/json' };
        if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const cookieHeader = request.headers.get('Cookie');
        const auth = await getCurrentUser(app.db, cookieHeader, {});
        if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: 'not_authenticated' }), { status: 401, headers: jsonHeaders });
        const ownerId = auth.userId;
        if (request.method === 'GET') {
          const r = await getVault(app.db.raw, ownerId);
          if (!r.ok) return new Response(JSON.stringify({ ok: false, error: r.reason }), { status: 500, headers: jsonHeaders });
          return new Response(JSON.stringify({ ok: true, exists: !!r.exists, vault: r.vault || null }), { headers: jsonHeaders });
        }
        const body = await parseJsonBody(request);
        const r = await putVault(app.db.raw, ownerId, body || {});
        if (!r.ok) {
          const status = r.reason === 'vault_exists' ? 409 : (r.reason && r.reason.indexOf('bad_') === 0 ? 400 : (r.reason === 'invalid_body' ? 400 : 500));
          return new Response(JSON.stringify({ ok: false, error: r.reason }), { status, headers: jsonHeaders });
        }
        return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
      }
    }

    // Phase B（E2EE 第 3 步・第一塊）：密文記錄儲存。與現有明文 /api/sync 完全分開，
    // 只存不透明 JWE 密文；未登入 -> 401。目前尚未有任何正式流程寫入這裡（供遷移後使用）。
    {
      const e2eePath = new URL(request.url).pathname;
      if (e2eePath === '/api/e2ee/records') {
        const jsonHeaders = { 'Content-Type': 'application/json' };
        if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const cookieHeader = request.headers.get('Cookie');
        const auth = await getCurrentUser(app.db, cookieHeader, {});
        if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: 'not_authenticated' }), { status: 401, headers: jsonHeaders });
        const ownerId = auth.userId;
        if (request.method === 'GET') {
          const kind = new URL(request.url).searchParams.get('kind') || null;
          if (kind && E2EE_KINDS.indexOf(kind) < 0) return new Response(JSON.stringify({ ok: false, error: 'bad_kind' }), { status: 400, headers: jsonHeaders });
          const r = await listE2eeEnvelopes(app.db.raw, ownerId, kind);
          if (!r.ok) return new Response(JSON.stringify({ ok: false, error: r.reason }), { status: 500, headers: jsonHeaders });
          return new Response(JSON.stringify({ ok: true, records: r.rows }), { headers: jsonHeaders });
        }
        const body = await parseJsonBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: jsonHeaders });
        const r = await putE2eeRecord(app.db.raw, ownerId, {
          kind: body.kind, recordId: body.recordId, baseRevision: (body.baseRevision === undefined ? null : body.baseRevision),
          revisionId: body.revisionId, envelope: body.envelope,
        });
        if (!r.ok) {
          const clientErr = ['bad_kind', 'bad_record_id', 'not_ciphertext', 'too_large', 'bad_revision', 'conflict'];
          const status = r.reason === 'conflict' ? 409 : (clientErr.indexOf(r.reason) >= 0 ? 400 : 500);
          return new Response(JSON.stringify({ ok: false, error: r.reason, currentRevision: r.currentRevision }), { status, headers: jsonHeaders });
        }
        return new Response(JSON.stringify({ ok: true, idempotent: !!r.idempotent }), { headers: jsonHeaders });
      }
    }

    // Phase B（E2EE 第 4 步）：切換加密模式 + 清理舊明文（不可逆，需 confirm:true）。
    // cutover 需已有遷移密文；cleanup 只在 e2ee_only 才允許；rollback 僅在清理前可用。
    {
      const cp = new URL(request.url).pathname;
      if (cp === '/api/e2ee/cutover' || cp === '/api/e2ee/cleanup' || cp === '/api/e2ee/rollback') {
        const jsonHeaders = { 'Content-Type': 'application/json' };
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const cookieHeader = request.headers.get('Cookie');
        const auth = await getCurrentUser(app.db, cookieHeader, {});
        if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: 'not_authenticated' }), { status: 401, headers: jsonHeaders });
        const ownerId = auth.userId;
        const body = await parseJsonBody(request);
        if (!body || body.confirm !== true) return new Response(JSON.stringify({ ok: false, error: 'confirm_required' }), { status: 400, headers: jsonHeaders });
        const vres = await getVault(app.db.raw, ownerId);
        if (!vres.ok || !vres.exists) return new Response(JSON.stringify({ ok: false, error: 'no_vault' }), { status: 409, headers: jsonHeaders });
        const mode = vres.vault.crypto_mode;
        if (cp === '/api/e2ee/cutover') {
          const cnt = await d1First(app.db.raw, 'SELECT COUNT(*) AS c FROM e2ee_records WHERE user_id = ?', [ownerId]);
          const have = (cnt.ok && cnt.row) ? cnt.row.c : 0;
          if (!have) return new Response(JSON.stringify({ ok: false, error: 'nothing_migrated' }), { status: 409, headers: jsonHeaders });
          const r = await setCryptoMode(app.db.raw, ownerId, 'e2ee_only');
          return new Response(JSON.stringify({ ok: r.ok, crypto_mode: r.ok ? 'e2ee_only' : undefined, error: r.ok ? undefined : r.reason }), { status: r.ok ? 200 : 500, headers: jsonHeaders });
        }
        if (cp === '/api/e2ee/rollback') {
          if (mode !== 'e2ee_only') return new Response(JSON.stringify({ ok: false, error: 'not_e2ee' }), { status: 409, headers: jsonHeaders });
          const pc = await d1First(app.db.raw, 'SELECT COUNT(*) AS c FROM sync_records WHERE user_id = ?', [ownerId]);
          if (!(pc.ok && pc.row && pc.row.c > 0)) return new Response(JSON.stringify({ ok: false, error: 'plaintext_already_cleaned' }), { status: 409, headers: jsonHeaders });
          const r = await setCryptoMode(app.db.raw, ownerId, 'vault_created');
          return new Response(JSON.stringify({ ok: r.ok, crypto_mode: 'vault_created' }), { status: r.ok ? 200 : 500, headers: jsonHeaders });
        }
        // cleanup — delete plaintext (irreversible), only once e2ee_only
        if (mode !== 'e2ee_only') return new Response(JSON.stringify({ ok: false, error: 'not_e2ee' }), { status: 409, headers: jsonHeaders });
        const del = await d1Run(app.db.raw, 'DELETE FROM sync_records WHERE user_id = ?', [ownerId]);
        await d1Run(app.db.raw, 'DELETE FROM sync_meta WHERE user_id = ?', [ownerId]);
        if (!del.ok) return new Response(JSON.stringify({ ok: false, error: del.error || 'delete_failed' }), { status: 500, headers: jsonHeaders });
        return new Response(JSON.stringify({ ok: true, deleted: (del.meta && del.meta.changes) || 0, note: 'D1 Time Travel retains prior versions within the retention window' }), { headers: jsonHeaders });
      }
    }
```


### worker.js — /api/sync 的 e2ee_only 上鎖
```js
// E2EE lock: once an account is cut over to e2ee_only, refuse plaintext writes
          // so no plaintext can be re-created (the app uses the ciphertext path instead).
          const vlk = await getVault(app.db.raw, ownerId);
          if (vlk.ok && vlk.exists && vlk.vault.crypto_mode === 'e2ee_only') {
            return new Response(JSON.stringify({ ok: false, error: 'e2ee_locked' }), { status: 409, headers: js
```


### worker.js — 前端 gated 啟動（dormant；僅 e2ee_only 才裝加密同步）
見 getHTML() 末端 `<script type="module">`：載入時 GET /api/vault，僅當 crypto_mode==="e2ee_only" 才 import 並 installE2eeSync；否則完全不動（現況所有人皆如此）。


---
*本包內嵌程式碼為 2026-10-02 上線版本（部署 55ae5cdb）。審查後再決定是否可對外宣稱使用者持鑰加密。*
