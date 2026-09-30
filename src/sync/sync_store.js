/*
 * Phase 8｜Sync Store (security remediation follow-up 2026-09-30)
 *
 * 以已驗證 session 的 user_id 為擁有者，把跨裝置同步資料存進 D1（migration 0008）。
 * 呼叫端（sync_routes.js）一律傳入 ctx.user.id 當 userId——這裡從不讀取任何
 * 瀏覽器提供的 user_id / tier / 短碼。
 *
 * 一致性：每次 push 是「一個 db.batch([...])」（D1 保證 all-or-nothing）。
 * 逐筆以 (user_id, kind, record_id) upsert：
 *   - 同 record_id 重送 = idempotent（不重複、不遺失）
 *   - 不同 record_id 但相同 ts = 兩筆各自保留（碰撞安全）
 *   - 兩台裝置各自新增不同 record → 兩筆都在（聯集，非整包覆寫）
 * 純量欄位（ft/identity 等非逐筆內容）存在 sync_meta，version 每次 +1。
 *
 * 刪除語意：本產品只新增紀錄、不刪除；本 store 不做刪除同步（無 tombstone）。
 */
import { all } from '../db/query.js';
import { batch } from '../db/transaction.js';

export const RECORD_KINDS = ['ins', 'quest'];
const ROOT_KIND = 'root';
const MAX_RECORDS_PER_KIND = 1000;
const MAX_RECORD_BYTES = 8000;
const MAX_SCALARS_BYTES = 8000;
const RECORD_ID_RE = /^[A-Za-z0-9_:.\-]{1,128}$/;

function byteLen(s) { return typeof s === 'string' ? s.length : 0; }

// 小而穩定的字串雜湊（僅用來在缺少 id 的舊資料上產生穩定、可去重的 record_id）
function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * 為一筆紀錄取得穩定 record_id：
 * - 有合法 id → 用 id（客戶端新資料一律帶 uuid）
 * - 沒有 id → 以 ts + 內容雜湊組成（時間戳碰撞但內容不同 → 不同 id → 兩筆都保留；
 *   內容與 ts 完全相同 → 同 id → idempotent 去重，符合預期）
 */
export function deriveRecordId(rec) {
  if (rec && typeof rec === 'object' && typeof rec.id === 'string' && RECORD_ID_RE.test(rec.id)) {
    return rec.id;
  }
  const ts = rec && rec.ts != null ? String(rec.ts) : 'nots';
  let body = '';
  try { body = JSON.stringify(rec); } catch (e) { body = String(rec); }
  return ('t' + ts + '_' + shortHash(body)).slice(0, 128);
}

/**
 * 驗證客戶端送來的整份同步文件（doc）。回傳白名單化、可安全寫入的結構。
 * 只接受物件；ins 必為陣列且每筆為物件；quest.entries 必為陣列；容量有上限。
 */
export function validateSyncDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'not_an_object' };
  if ('error' in doc) return { ok: false, reason: 'error_object' };

  const insRaw = doc.ins;
  if (insRaw !== undefined && !Array.isArray(insRaw)) return { ok: false, reason: 'ins_not_array' };
  const questRaw = doc.quest;
  if (questRaw !== undefined) {
    if (!questRaw || typeof questRaw !== 'object' || Array.isArray(questRaw)) return { ok: false, reason: 'quest_not_object' };
    if (questRaw.entries !== undefined && !Array.isArray(questRaw.entries)) return { ok: false, reason: 'quest_entries_not_array' };
  }

  const ins = Array.isArray(insRaw) ? insRaw : [];
  const questEntries = questRaw && Array.isArray(questRaw.entries) ? questRaw.entries : [];
  if (ins.length > MAX_RECORDS_PER_KIND) return { ok: false, reason: 'too_many_ins' };
  if (questEntries.length > MAX_RECORDS_PER_KIND) return { ok: false, reason: 'too_many_quest' };

  for (const r of ins.concat(questEntries)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, reason: 'record_not_object' };
    let s = '';
    try { s = JSON.stringify(r); } catch (e) { return { ok: false, reason: 'record_unserializable' }; }
    if (byteLen(s) > MAX_RECORD_BYTES) return { ok: false, reason: 'record_too_large' };
  }

  // scalars = 除 ins/quest 以外的頂層欄位（ft、identity 等）
  const scalars = {};
  for (const k in doc) { if (k !== 'ins' && k !== 'quest') scalars[k] = doc[k]; }
  let scalarsStr = '';
  try { scalarsStr = JSON.stringify(scalars); } catch (e) { return { ok: false, reason: 'scalars_unserializable' }; }
  if (byteLen(scalarsStr) > MAX_SCALARS_BYTES) return { ok: false, reason: 'scalars_too_large' };

  return { ok: true, ins, questEntries, scalars, scalarsStr };
}

function upsertRecordStmt(userId, kind, rec) {
  const recordId = deriveRecordId(rec);
  const payload = JSON.stringify(rec);
  const ts = rec && Number.isFinite(Number(rec.ts)) ? Number(rec.ts) : null;
  return {
    sql: "INSERT INTO sync_records (user_id, kind, record_id, payload, client_ts, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id, kind, record_id) DO UPDATE SET payload=excluded.payload, client_ts=excluded.client_ts, updated_at=datetime('now')",
    params: [userId, kind, recordId, payload, ts],
  };
}

/**
 * 以 user_id 為擁有者，原子式（單一 batch）寫入整份文件。
 * @param {object} db
 * @param {string} userId - 一律是 ctx.user.id（session 驗證後），不可為客戶端提供
 * @param {object} doc - 客戶端送來的完整資料文件
 * @returns {Promise<{ok:boolean, reason?:string, written?:number}>}
 */
export async function pushSyncDoc(db, userId, doc) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_owner' };
  const v = validateSyncDoc(doc);
  if (!v.ok) return { ok: false, reason: v.reason };

  const statements = [];
  for (const r of v.ins) statements.push(upsertRecordStmt(userId, 'ins', r));
  for (const r of v.questEntries) statements.push(upsertRecordStmt(userId, 'quest', r));
  statements.push({
    sql: "INSERT INTO sync_meta (user_id, kind, scalars, version, updated_at) VALUES (?, ?, ?, 1, datetime('now')) ON CONFLICT(user_id, kind) DO UPDATE SET scalars=excluded.scalars, version=sync_meta.version+1, updated_at=datetime('now')",
    params: [userId, ROOT_KIND, v.scalarsStr],
  });

  const res = await batch(db, statements);
  if (!res.ok) return { ok: false, reason: res.error || 'batch_failed' };
  return { ok: true, written: v.ins.length + v.questEntries.length };
}

/**
 * 讀回某使用者的完整同步文件（owner 一律是 userId）。
 * @returns {Promise<{ok:boolean, doc?:object, reason?:string}>}
 */
export async function getSyncDoc(db, userId) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_owner' };
  const recRes = await all(db, 'SELECT kind, record_id, payload, client_ts FROM sync_records WHERE user_id = ? ORDER BY client_ts DESC', [userId]);
  if (!recRes.ok) return { ok: false, reason: recRes.error || 'read_failed' };
  const metaRes = await all(db, 'SELECT scalars, version FROM sync_meta WHERE user_id = ? AND kind = ?', [userId, ROOT_KIND]);
  if (!metaRes.ok) return { ok: false, reason: metaRes.error || 'read_failed' };

  const doc = { ins: [], quest: { entries: [] } };
  let scalars = {};
  if (metaRes.results && metaRes.results[0] && metaRes.results[0].scalars) {
    try { scalars = JSON.parse(metaRes.results[0].scalars) || {}; } catch (e) { scalars = {}; }
  }
  for (const k in scalars) { if (k !== 'ins' && k !== 'quest') doc[k] = scalars[k]; }

  for (const row of (recRes.results || [])) {
    let rec = null;
    try { rec = JSON.parse(row.payload); } catch (e) { rec = null; }
    if (!rec) continue;
    if (row.kind === 'ins') doc.ins.push(rec);
    else if (row.kind === 'quest') doc.quest.entries.push(rec);
  }
  return { ok: true, doc };
}
