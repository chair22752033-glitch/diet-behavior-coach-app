# 交接給 GPT：記錄分享(Support) + 同意併入登入 + 定價定案 複審包（含原始碼）

**日期：** 2026-10-03
**分支：** `claude/wrangler-deploy-c821f3`
**本輪相關上線版本：**
- 同意併入登入 + 移除「尚未登記」：`85b30f38`
- 記錄分享(Support)功能：`f1bc98b3`（migration 0015 已 apply 到正式 D1）
**回歸：** TASK1.127 `930 passed / 0 failed`（含「只改授權 .js」「migration 數 15」兩道 git 關卡，乾淨樹通過）

本檔含**完整原始碼**供 GPT 逐條複審。重點請看 §D（Support 安全/隱私）與 §E（同意流程）。

---

## A. 本輪三件事

1. **移除「工作室籌備中／尚未登記」字樣**（terms/privacy/legal 三頁），保留提供者姓名、品牌、聯絡；避免不安全感。
2. **同意併入登入**：原本「登入按鈕直接跳轉」與「/legal 獨立同意勾選」脫鉤。現改為登入卡／結果促購卡上**必勾同意**才能登入；所有登入入口統一走這張卡；登入後自動記錄同意（綁定文件版本/hash）。
3. **記錄分享(Support)**：使用者「有問題想問」時，可**一鍵把自選期間的記錄快照＋問題**傳給管理者查看。期間最少 90 天、最近 90 天；不足 90 天則第一筆到最新。管理者在 /admin 看清單與快照。**只有使用者按送出的那份被分享**，後台不能任意翻看一般帳號飲食明細。

另：定價/服務內容已定案（見 §F）。

---

## B. 新增 migration（0015）

`migrations/0015_support_requests.sql`：
```sql
CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT,
  period_days INTEGER,
  range_from TEXT,
  range_to TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_requests_created ON support_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests (user_id);
```

## C. 新增 store：`src/support/support_store.js`（全文）

```js
import { run, all, first } from '../db/query.js';

export const SUPPORT_MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB
export const SUPPORT_MAX_RECORDS = 2000;
export const SUPPORT_MIN_PERIOD_DAYS = 90;

function genId() {
  return 'sr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export async function createSupportRequest(rawDb, userId, input) {
  if (!rawDb || typeof userId !== 'string' || userId.length === 0) return { ok: false, reason: 'invalid_user' };
  const payload = (input && typeof input.payload === 'string') ? input.payload : '';
  if (!payload) return { ok: false, reason: 'empty_payload' };
  const bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(payload).length : payload.length;
  if (bytes > SUPPORT_MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload_too_large' };
  const id = genId();
  const question = (input && typeof input.question === 'string') ? input.question.slice(0, 2000) : '';
  let periodDays = Number(input && input.periodDays);
  if (!Number.isFinite(periodDays) || periodDays <= 0) periodDays = SUPPORT_MIN_PERIOD_DAYS;
  periodDays = Math.max(SUPPORT_MIN_PERIOD_DAYS, Math.min(3650, Math.floor(periodDays)));
  let recordCount = Number(input && input.recordCount);
  if (!Number.isFinite(recordCount) || recordCount < 0) recordCount = 0;
  recordCount = Math.min(SUPPORT_MAX_RECORDS, Math.floor(recordCount));
  const rangeFrom = (input && typeof input.rangeFrom === 'string') ? input.rangeFrom.slice(0, 40) : null;
  const rangeTo = (input && typeof input.rangeTo === 'string') ? input.rangeTo.slice(0, 40) : null;
  const res = await run(rawDb,
    'INSERT INTO support_requests (id, user_id, question, period_days, range_from, range_to, record_count, payload, status, created_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))",
    [id, userId, question, periodDays, rangeFrom, rangeTo, recordCount, payload]);
  if (!res.ok) return { ok: false, reason: res.error || 'write_failed' };
  return { ok: true, id };
}

export async function listSupportRequests(rawDb, options) {
  if (!rawDb) return { ok: false, items: [] };
  const limit = Math.max(1, Math.min(200, Number((options && options.limit) || 50)));
  const res = await all(rawDb,
    'SELECT s.id, s.user_id, s.question, s.period_days, s.range_from, s.range_to, s.record_count, s.status, s.created_at, ' +
    'u.display_name AS display_name, u.email AS email ' +
    'FROM support_requests s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT ?', [limit]);
  if (!res.ok) return { ok: false, items: [] };
  return { ok: true, items: res.results || [] };
}

export async function getSupportRequest(rawDb, id) {
  if (!rawDb || typeof id !== 'string' || !id) return { ok: false, row: null };
  const res = await first(rawDb,
    'SELECT s.id, s.user_id, s.question, s.period_days, s.range_from, s.range_to, s.record_count, s.status, s.created_at, s.payload, ' +
    'u.display_name AS display_name, u.email AS email ' +
    'FROM support_requests s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?', [id]);
  if (!res.ok) return { ok: false, row: null };
  return { ok: true, row: res.row };
}
```

## D. Worker 端點（`src/worker.js`，攔截層；請重點複審隔離/CSRF/驗證）

**使用者分享（POST /api/support/share）** — 攔截在 gateway 之前，getCurrentUser 驗證：
```js
import { createSupportRequest, listSupportRequests, getSupportRequest, SUPPORT_MIN_PERIOD_DAYS } from './support/support_store.js';
// ...
{
  const supportPath = new URL(request.url).pathname;
  if (supportPath === '/api/support/share') {
    const jsonHeaders = { 'Content-Type': 'application/json' };
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const cookieHeader = request.headers.get('Cookie');
    const auth = await getCurrentUser(app.db, cookieHeader, {});
    if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: 'not_authenticated' }), { status: 401, headers: jsonHeaders });
    const origin = request.headers.get('Origin');
    const host = new URL(request.url).host;
    if (origin && host && origin.indexOf('://' + host) === -1)
      return new Response(JSON.stringify({ ok: false, error: 'bad_origin' }), { status: 403, headers: jsonHeaders });
    const body = await parseJsonBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: jsonHeaders });
    const records = Array.isArray(body.records) ? body.records : null;
    if (!records || records.length === 0) return new Response(JSON.stringify({ ok: false, error: 'no_records' }), { status: 400, headers: jsonHeaders });
    let periodDays = Number(body.periodDays);
    if (!Number.isFinite(periodDays) || periodDays < SUPPORT_MIN_PERIOD_DAYS) periodDays = SUPPORT_MIN_PERIOD_DAYS;
    const snapshot = {
      records: records,
      identity: (body.identity && typeof body.identity === 'object') ? body.identity : null,
      quest: Array.isArray(body.quest) ? body.quest : null
    };
    const payload = JSON.stringify(snapshot);
    const r = await createSupportRequest(app.db.raw, auth.userId, {
      question: typeof body.question === 'string' ? body.question : '',
      periodDays: periodDays,
      rangeFrom: typeof body.rangeFrom === 'string' ? body.rangeFrom : null,
      rangeTo: typeof body.rangeTo === 'string' ? body.rangeTo : null,
      recordCount: records.length,
      payload: payload
    });
    if (!r.ok) {
      const code = r.reason === 'payload_too_large' ? 413 : 400;
      return new Response(JSON.stringify({ ok: false, error: r.reason || 'share_failed' }), { status: code, headers: jsonHeaders });
    }
    return new Response(JSON.stringify({ ok: true, id: r.id }), { headers: jsonHeaders });
  }
}
```

**擁有者讀取（在既有 /api/admin/* owner 閘門之內）：**
```js
if (adminPath === '/api/admin/support' && request.method === 'GET') {
  const lst = await listSupportRequests(app.db.raw, { limit: 100 });
  return new Response(JSON.stringify({ ok: !!lst.ok, items: lst.items || [] }), { headers: jsonHeaders });
}
if (adminPath === '/api/admin/support/get' && request.method === 'GET') {
  const sid = new URL(request.url).searchParams.get('id');
  if (!sid) return new Response(JSON.stringify({ ok: false, error: 'missing_id' }), { status: 400, headers: jsonHeaders });
  const one = await getSupportRequest(app.db.raw, sid);
  if (!one.ok || !one.row) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: jsonHeaders });
  return new Response(JSON.stringify({ ok: true, item: one.row }), { headers: jsonHeaders });
}
```
（owner 閘門：whoami 永遠 200；其餘 /api/admin/* 需 `own.authenticated` + `own.owner`；POST 另有 Origin 同源檢查。list/get 為 GET，受 owner 閘門保護。）

## D2. 前端（worker.js getHTML 字串陣列，摘要）

- 首頁新增容器 `<div id="supportcard"></div>`；新增畫面 `<div id="ssupport" class="scr">…<div id="sp-body">`。
- `renderSupportCard()`：**僅登入**（SYNC_ON）顯示「有問題想問？」卡 → `showSupportScreen`。`initHome` 的 render 鏈加入 `renderSupportCard()`。
- `showSupportScreen()`：`needLogin("詢問管理者")` 守門 → `renderSupport()`。
- `renderSupport()`：期間 `<select>`（90/180/365/all）、問題 textarea、警語（勿填敏感資料）、送出鈕、返回。
- `submitSupport(btn)`：`cutoff = all?0:(now - pd*86400000)`；`ins = data.ins.filter(ts>=cutoff)`；空則提示；`quest` 一併（有 ts 才濾）；`rangeFrom/To` 取 ins ts 最早/最晚；POST `/api/support/share`；顯示成功/失敗。

## D3. 後台 UI（`src/admin/admin_page.js`，摘要）

- 新區塊「使用者詢問 / 記錄分享」表格 `#support` + `#supportDetail`。
- `loadSupport()`（load() 成功後呼叫）：GET /api/admin/support → 列時間/使用者/期間/筆數/問題/「查看」。
- `.spv` 點擊 → GET /api/admin/support/get?id= → `renderSupportDetail()` 解析 payload，顯示使用者、期間、問題、飲食身份、記錄表（時間/行為/渴望）。

---

## E. 同意併入登入（`src/worker.js`）

```js
function goLoginWithConsent(src){try{localStorage.setItem("pending_consent",JSON.stringify({ts:Date.now(),src:src||"login"}));}catch(e){}location.href="/auth/google/start";}
function recordPendingConsent(){var pc=null;try{pc=localStorage.getItem("pending_consent");}catch(e){}if(!pc)return;fetch("/api/consent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({purpose:"free_trial",docType:"intent",action:"granted",sourceScreen:"login_gate"})}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.ok){try{localStorage.removeItem("pending_consent");}catch(e){}}}).catch(function(e){});}
function appendConsentLogin(parent,src){ /* 勾選框(必勾) + 「同意並用 Google 登入」鈕(未勾禁用/提示) + 連到 /ui-assets/legal/ */ }
```
- `showLoginGate` 與 `buildLoginPromoCard` 的登入按鈕改由 `appendConsentLogin` 產生。
- 所有登入入口統一：header「Google 登入」→ `showLoginGate("登入")`；`openSyncUI` 未登入 → `showLoginGate("跨裝置同步")`；功能門檻 `needLogin` → `showLoginGate`。
- 登入成功（/auth/me 回來）→ `recordPendingConsent()`（只在使用者**這次**有勾選時才記錄，不替既有使用者自動補記）。
- 同意紀錄沿用既有 `/api/consent`（server 自行 `fetchDocHash` 綁定版本/hash，法務要的可查證性保留）。docType=intent、purpose=free_trial、action=granted、sourceScreen=login_gate。

**請 GPT 看：** (1) 登入前只在前端勾選、同意事件在登入後才寫，期間若使用者中途放棄，pending flag 僅於「已驗證」時才消耗，是否可接受？(2) 是否需要同時記錄 terms/privacy 兩份 docType，而非只記 intent？目前與原 /legal 行為一致（只記 intent，intent 文件涵蓋條款/個資連結）。

---

## F. 定價 / 服務內容定案（已寫入 legal 頁 + App 內登入卡）

- **7 天免費試用**：登入後完整功能。
- **NT$1,200／年**：純 App；高成本新功能（圖片/AI）可能另計、事先標示。
- **3,000**：App 全功能**不限期** + 琮心開始社群討論、直播、分享。
- **35,000**：開通隔天起 **180 天**；App + 一對一個案陪同（不強制推銷）+ 面對面視訊/通話（必要）+ 未來工作坊任選 **2 場**招待。
- **48,000**：含 35,000 + **未來工作坊永久免費**（漲價也免費）。
- **新功能收費政策**：服務包期間內**一般新功能免費**；**高成本功能採公平使用**（含合理用量，超量可能另計、事先標示）。48,000 的「永久免費」**限工作坊**。
- **社群入群**：先加 LINE `chair22752033a` 聊聊，再視情況邀入「琮心開始」LINE 社群。
- 後台：服務包「直接開通、不限期」(valid_until=NULL)；1,200=365 天；批次開通/撤銷（貼多筆帳號）。

---

## G. 請 GPT 複審重點（新）

1. **Support 隱私界線**：payload 存使用者端快照（記錄+身份+隨身卡），擁有者可讀。是否足夠「使用者主動、期間受限」？要不要在送出時也寫一筆 consent 事件（purpose=`support_share`）以留痕？（目前只存 support_requests，未另記 consent。）
2. **Support 保存期限 / 刪除**：目前無自動刪除/撤回機制。使用者是否應能「收回」已分享的快照？保存多久？
3. **E2EE 相容**：未來帳號若進 `e2ee_only`，/api/sync 會 409；Support 目前讀 localStorage 明文由前端整理再上傳，對 e2ee 帳號要改成裝置端解密後再送（目前無 e2ee 帳號，未處理）。
4. **payload 上限 512KB / 2000 筆**是否合理？大量記錄使用者會被擋。
5. 同意流程兩問（見 §E）。

## H. 仍未處理（沿用 07 複審，優先序：E2EE P0 > 其餘）

P0-1 原子 CAS/衝突雙版本；P0-2 cutover/cleanup 四庫覆蓋+manifest；P0-3 解密情境/schema 驗證 fail-closed；P0-4 隔離/CSRF/mode 查詢失敗 fail-closed；P1-1 本機明文；P1-2 hosted jose + crit/header + 恢復碼驗證；P1-3 同意版本綁定；手機版 admin 表格 overflow；health_insight 裝置端運算；qlive 正式密文。

## I. 擁有者驗收（本輪）

1. 未登入點首頁互動 / 做完身份測驗 → 出現登入卡，**必勾同意**才能按登入。
2. 登入後首頁出現「有問題想問？」卡 → 進入可選期間（最低 90 天）+ 填問題 + 送出。
3. /admin →「使用者詢問 / 記錄分享」看得到剛送出那筆，點「查看」顯示記錄快照。
4. legal 三頁已無「尚未登記」字樣。
